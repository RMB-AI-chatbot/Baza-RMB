"""Service configuration, read from environment variables (and an optional .env file)."""

from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

CsvList = Annotated[list[str], NoDecode]  # env value "a,b,c"

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(REPO_ROOT / ".env"), ".env"), extra="ignore"
    )

    # --- infrastructure ---
    database_url: str = "postgresql://baza:baza@127.0.0.1:5434/baza"
    data_dir: Path = REPO_ROOT / "data"
    model_cache_dir: Path = REPO_ROOT / ".cache" / "models"
    case_service_url: str = "http://localhost:8081"
    case_service_token: str = "change-me"
    admin_api_key: str = "change-me"
    client_hash_salt: str = "change-me"
    cors_origins: CsvList = ["http://localhost:8080"]
    trust_proxy: bool = False  # true when running behind nginx (reads X-Forwarded-For)
    serve_test_page: bool = False  # dev only: serve web/index.html at "/" (dev.ps1 sets it)

    # --- LLM ---
    llm_provider: str = "anthropic"   # anthropic | gemini | groq
    anthropic_api_key: str | None = None
    gemini_api_key: str | None = None
    groq_api_key: str | None = None
    answer_model: str = "claude-sonnet-5-5"
    answer_fallback_model: str | None = None  # used when the answer model is rate-limited (Groq)
    router_model: str = "claude-haiku-5-5"
    ocr_model: str = "claude-sonnet-5-5"
    answer_effort: str = "low"
    answer_max_tokens: int = 2000
    use_server_fallbacks: bool = True  # retry refused answers on a fallback model server-side

    # --- embeddings ---
    embedding_model: str = "intfloat/multilingual-e5-large"
    embedding_dim: int = 1024

    # --- retrieval ---
    retrieval_candidates: int = 30   # per search arm (vector / keyword) before fusion
    retrieval_top_k: int = 6         # chunks passed to the answer model
    # Below this cosine similarity (and with no keyword/article match) we answer
    # "not covered" without calling the LLM. Tuned with scripts/eval.py.
    min_vector_score: float = 0.80

    # --- chat ---
    supported_languages: CsvList = ["en", "fr", "rw"]
    answer_languages: CsvList = ["en", "fr", "rw"]   # languages the bot answers in
    # Languages stored at ingestion (gazette laws have official EN/FR/RW columns).
    index_languages: CsvList = ["en", "fr", "rw"]
    # Languages that get embeddings. Search runs in English (questions are translated by the router);
    # FR/RW law text is then looked up by article (section_key) to answer with the official wording.
    embed_languages: CsvList = ["en"]
    max_message_chars: int = 2000
    max_history_turns: int = 6
    session_ttl_minutes: int = 120
    rate_limit_per_minute: int = 20
    rate_limit_per_day: int = 300

    log_level: str = "INFO"
    # production: secrets are checked at start-up and the API docs (/docs, /openapi.json) are off
    environment: str = "development"
    # Conversations older than this are deleted by `python -m app.cli purge` (run daily by the scheduler). 0 = keep.
    chat_retention_days: int = 365

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in ("production", "prod")

    def production_problems(self) -> list[str]:
        """Settings that must not reach production (placeholders, short secrets, missing keys)."""
        out = []
        for name in ("case_service_token", "admin_api_key", "client_hash_salt"):
            v = getattr(self, name) or ""
            if "change-me" in v or len(v) < 32:
                out.append(f"{name.upper()} must be a random value of at least 32 characters (scripts/generate-secrets.sh)")
        if "change-me" in self.database_url:
            out.append("DATABASE_URL / POSTGRES_PASSWORD still uses the example password")
        key = {"anthropic": self.anthropic_api_key, "gemini": self.gemini_api_key, "groq": self.groq_api_key}.get(self.llm_provider)
        if not key:
            out.append(f"no API key set for LLM_PROVIDER={self.llm_provider}")
        if self.serve_test_page:
            out.append("SERVE_TEST_PAGE must be false in production")
        if any(o.startswith("http://") and "localhost" not in o for o in self.cors_origins):
            out.append("CORS_ORIGINS should list https:// origins only")
        return out

    @field_validator("cors_origins", "supported_languages", "answer_languages", "index_languages", "embed_languages", mode="before")
    @classmethod
    def _split_csv(cls, v):
        if isinstance(v, str) and not v.strip().startswith("["):
            return [x.strip() for x in v.split(",") if x.strip()]
        return v

    @field_validator("data_dir", "model_cache_dir", mode="after")
    @classmethod
    def _resolve(cls, v: Path) -> Path:
        return v if v.is_absolute() else (REPO_ROOT / "ai-service" / v).resolve()


@lru_cache
def get_settings() -> Settings:
    return Settings()
