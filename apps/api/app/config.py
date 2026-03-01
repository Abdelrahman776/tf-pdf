from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")


@dataclass(frozen=True)
class Settings:
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    ocr_provider_order: str = os.getenv("OCR_PROVIDER_ORDER", "gemini,openrouter,mathpix,local_ai_ocr,pypdf")
    openrouter_api_key: str = os.getenv("OPENROUTER_API_KEY", "")
    openrouter_model: str = os.getenv("OPENROUTER_MODEL", "qwen/qwen-2.5-vl-72b-instruct")
    mathpix_app_id: str = os.getenv("MATHPIX_APP_ID", "")
    mathpix_app_key: str = os.getenv("MATHPIX_APP_KEY", "")
    local_ai_ocr_url: str = os.getenv("LOCAL_AI_OCR_URL", "")
    use_sqlite_persistence: bool = os.getenv("USE_SQLITE_PERSISTENCE", "1") == "1"
    supabase_db_url: str = os.getenv("SUPABASE_DB_URL", "")
    celery_broker_url: str = os.getenv("CELERY_BROKER_URL", "")
    celery_result_backend: str = os.getenv("CELERY_RESULT_BACKEND", "")
    admin_token: str = os.getenv("ADMIN_TOKEN", "")
    use_langchain_layout_pipeline: bool = os.getenv("USE_LANGCHAIN_LAYOUT_PIPELINE", "1") == "1"
    langchain_layout_model: str = os.getenv("LANGCHAIN_LAYOUT_MODEL", "gemini-2.5-pro")


settings = Settings()
