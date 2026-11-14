-- Official FAQ answers written by RMB staff, and triage of submitted forms.
-- Safe to re-run on an existing database (everything is IF NOT EXISTS):
--   docker compose exec -T db psql -U baza -d baza < db/init/002_faq_triage.sql

-- ---------------------------------------------------------------------------
-- FAQ: staff answer a question (from a knowledge gap or a case). An entry is used by
-- the bot only after a SECOND staff member publishes it (created_by <> approved_by).
-- Published entries are indexed as chunks of the document "rmb-official-faq".
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kb.faq_entries (
    id           bigserial PRIMARY KEY,
    question     text NOT NULL,
    answer       text NOT NULL,
    category     text,
    owner        text NOT NULL,                 -- responsible department
    status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
    created_by   text NOT NULL,
    approved_by  text,
    approved_at  timestamptz,
    review_date  date,
    source_type  text CHECK (source_type IN ('gap','case','manual')),
    source_ref   text,                          -- unanswered id or case reference
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CHECK (approved_by IS NULL OR approved_by <> created_by)
);

CREATE INDEX IF NOT EXISTS faq_status_idx ON kb.faq_entries (status, updated_at DESC);

INSERT INTO kb.documents (id, title, short_title, doc_type, category, layout, languages, owner, version, status,
                          processing_status, review_date)
VALUES ('rmb-official-faq', 'RMB Official FAQ (answers approved by RMB staff)', 'RMB Official FAQ', 'faq', 'general',
        'faq', '{en}', 'RMB Communications (to be confirmed)', 'live', 'active', 'indexed', NULL)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Triage of submitted forms (set by the AI service when the form is submitted)
-- ---------------------------------------------------------------------------
ALTER TABLE cases.cases ADD COLUMN IF NOT EXISTS triage_relevance text NOT NULL DEFAULT 'unclear';
ALTER TABLE cases.cases ADD COLUMN IF NOT EXISTS triage_priority  text NOT NULL DEFAULT 'normal';
ALTER TABLE cases.cases ADD COLUMN IF NOT EXISTS triage_reason    text;
ALTER TABLE cases.cases ADD COLUMN IF NOT EXISTS triage_by        text NOT NULL DEFAULT 'ai';  -- ai | staff name

DO $$ BEGIN
    ALTER TABLE cases.cases ADD CONSTRAINT cases_triage_relevance_chk
        CHECK (triage_relevance IN ('relevant','unclear','spam'));
    ALTER TABLE cases.cases ADD CONSTRAINT cases_triage_priority_chk
        CHECK (triage_priority IN ('urgent','high','normal','low'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS cases_triage_idx ON cases.cases (triage_relevance, triage_priority, created_at DESC);
