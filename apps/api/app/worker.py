from __future__ import annotations

import asyncio

from celery import Celery

from .config import settings
from .pipeline import process_job


broker = settings.celery_broker_url or "redis://localhost:6379/0"
backend = settings.celery_result_backend or broker

celery_app = Celery("trueform", broker=broker, backend=backend)


@celery_app.task(name="trueform.process_job")
def process_job_task(job_id: str, preserve_layout: bool, language: str, user_prompt: str | None = None) -> None:
    asyncio.run(process_job(job_id, preserve_layout, language, user_prompt))
