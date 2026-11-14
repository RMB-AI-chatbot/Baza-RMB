-- baza-RMB database schema
-- Schemas:
--   kb     knowledge base (owned by the AI service)
--   chat   sessions, messages, unanswered questions (owned by the AI service)
--   cases  case management (owned by the PHP case service)
--   app    runtime settings editable from the admin portal
--
-- NOTE: kb.chunks.embedding is vector(1024) to match intfloat/multilingual-e5-large.
-- Changing EMBEDDING_MODEL to a model with another dimension requires a migration
-- and a full re-ingest (python -m app.cli ingest --all --force).

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS kb;
CREATE SCHEMA IF NOT EXISTS chat;
CREATE SCHEMA IF NOT EXISTS cases;
CREATE SCHEMA IF NOT EXISTS app;

-- ---------------------------------------------------------------------------
-- Knowledge base
-- ---------------------------------------------------------------------------

-- Document register: one row per source document (governance metadata lives here).
CREATE TABLE IF NOT EXISTS kb.documents (
    id                  text PRIMARY KEY,               -- stable slug, e.g. law-072-2024-mining-quarry
    title               text NOT NULL,
    short_title         text NOT NULL,
    doc_type            text NOT NULL DEFAULT 'other'
                        CHECK (doc_type IN ('law','regulation','prospectus','guide','faq','webpage','directory','other')),
    category            text,
    law_reference       text,                           -- e.g. "Law n° 072/2024 of 26/06/2024"
    reference_confirmed boolean NOT NULL DEFAULT false, -- RMB confirmed against the gazetted version
    source_url          text,
    file_path           text,                           -- relative to DATA_DIR
    file_sha256         text,
    layout              text NOT NULL DEFAULT 'auto',   -- auto | gazette_trilingual | simple | ocr | webpage
    languages           text[] NOT NULL DEFAULT '{en}',
    owner               text,
    version             text,
    effective_date      date,
    review_date         date,
    status              text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','active','retired')),
    processing_status   text NOT NULL DEFAULT 'pending'
                        CHECK (processing_status IN ('pending','processing','indexed','failed','needs_review')),
    processing_error    text,
    page_count          int,
    ocr_pages           int NOT NULL DEFAULT 0,
    chunk_count         int NOT NULL DEFAULT 0,
    options             jsonb NOT NULL DEFAULT '{}'::jsonb, -- layout options (page_range, columns, ...)
    uploaded_by         text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    indexed_at          timestamptz
);

-- Citable chunks. Every chunk keeps document, section and page so citations can be checked.
CREATE TABLE IF NOT EXISTS kb.chunks (
    id           bigserial PRIMARY KEY,
    document_id  text NOT NULL REFERENCES kb.documents(id) ON DELETE CASCADE,
    language     text NOT NULL,                 -- en | fr | rw
    chunk_index  int  NOT NULL,
    section_key  text,                          -- language-neutral key, e.g. art-16 (links EN/FR/RW versions)
    section_ref  text,                          -- human label, e.g. "Article 16"
    heading      text,                          -- e.g. "Article 16: Transfer of a mining licence"
    chapter      text,                          -- e.g. "CHAPTER II: MINERAL LICENCES"
    page_start   int,
    page_end     int,
    text         text NOT NULL,
    token_estimate int,
    embedding    vector(1024),
    tsv          tsvector GENERATED ALWAYS AS (
                    to_tsvector(
                        CASE language WHEN 'en' THEN 'english'::regconfig
                                      WHEN 'fr' THEN 'french'::regconfig
                                      ELSE 'simple'::regconfig END,
                        coalesce(heading, '') || ' ' || text)
                 ) STORED,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chunks_doc_lang_idx   ON kb.chunks (document_id, language);
CREATE INDEX IF NOT EXISTS chunks_section_idx    ON kb.chunks (section_key);
CREATE INDEX IF NOT EXISTS chunks_tsv_idx        ON kb.chunks USING gin (tsv);
CREATE INDEX IF NOT EXISTS chunks_embedding_idx  ON kb.chunks USING hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- Chat
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chat.sessions (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    channel       text NOT NULL DEFAULT 'web',
    language      text,
    client_hash   text,                         -- salted hash of IP, never the raw IP
    created_at    timestamptz NOT NULL DEFAULT now(),
    last_seen_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat.messages (
    id             bigserial PRIMARY KEY,
    session_id     uuid NOT NULL REFERENCES chat.sessions(id) ON DELETE CASCADE,
    role           text NOT NULL CHECK (role IN ('user','assistant')),
    content        text NOT NULL,
    language       text,
    intent         text,
    category       text,
    action         text,                        -- none | form | emergency | handover | not_covered
    standalone_query text,
    sources        jsonb,
    top_score      real,
    answered       boolean,
    model          text,
    input_tokens   int,
    output_tokens  int,
    latency_ms     int,
    feedback       smallint CHECK (feedback IN (-1, 1)),
    feedback_comment text,
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_session_idx  ON chat.messages (session_id, id);
CREATE INDEX IF NOT EXISTS messages_created_idx  ON chat.messages (created_at);
CREATE INDEX IF NOT EXISTS messages_category_idx ON chat.messages (category);

-- Questions the bot could not answer: the content-gap report for RMB.
CREATE TABLE IF NOT EXISTS chat.unanswered (
    id           bigserial PRIMARY KEY,
    message_id   bigint REFERENCES chat.messages(id) ON DELETE SET NULL,
    question     text NOT NULL,
    language     text,
    category     text,
    reason       text NOT NULL,                 -- low_confidence | not_covered | error
    top_score    real,
    status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','ignored')),
    note         text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    resolved_at  timestamptz
);

CREATE INDEX IF NOT EXISTS unanswered_status_idx ON chat.unanswered (status, created_at DESC);

-- ---------------------------------------------------------------------------
-- Cases (written by the PHP case service)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cases.routing (
    case_type              text PRIMARY KEY,
    routed_to              text NOT NULL,
    expected_response_time text NOT NULL,
    is_placeholder         boolean NOT NULL DEFAULT true,
    active                 boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS cases.cases (
    id                     bigserial PRIMARY KEY,
    reference              text NOT NULL UNIQUE,
    case_type              text NOT NULL REFERENCES cases.routing(case_type),
    status                 text NOT NULL DEFAULT 'new'
                           CHECK (status IN ('new','assigned','in_progress','waiting_for_user','resolved','closed')),
    summary                text NOT NULL,
    details                jsonb NOT NULL DEFAULT '{}'::jsonb,
    contact                jsonb,               -- NULL when anonymous
    anonymous              boolean NOT NULL DEFAULT false,
    confidential           boolean NOT NULL DEFAULT false,
    routed_to              text NOT NULL,
    expected_response_time text NOT NULL,
    language               text,
    session_id             uuid,                -- NULL when anonymous
    conversation_excerpt   jsonb,
    assigned_to            text,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cases_status_idx ON cases.cases (status, created_at DESC);

-- Audit trail: every case creation and status change is timestamped.
CREATE TABLE IF NOT EXISTS cases.case_events (
    id         bigserial PRIMARY KEY,
    case_id    bigint NOT NULL REFERENCES cases.cases(id) ON DELETE CASCADE,
    event      text NOT NULL,
    actor      text NOT NULL,
    note       text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Placeholder routing: RMB must confirm units and response times.
INSERT INTO cases.routing (case_type, routed_to, expected_response_time) VALUES
    ('grievance',              'Complaints / community relations officer (example)', '5 working days (example)'),
    ('illegal_mining_report',  'Inspection and enforcement unit (example)',          '3 working days (example)'),
    ('meeting_request',        'Investment promotion team (example)',                '5 working days (example)'),
    ('geodata_request',        'Geology and laboratory services (example)',          '10 working days (example)'),
    ('licence_status',         'Licensing department (example)',                     '5 working days (example)'),
    ('legal_question',         'Legal unit (example)',                               '10 working days (example)'),
    ('general_enquiry',        'Customer care (example)',                            '5 working days (example)')
ON CONFLICT (case_type) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Runtime settings (admin portal)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.settings (
    key        text PRIMARY KEY,
    value      jsonb NOT NULL,
    updated_by text,
    updated_at timestamptz NOT NULL DEFAULT now()
);
