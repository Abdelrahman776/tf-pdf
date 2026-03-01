from __future__ import annotations

from fastapi import BackgroundTasks

from .config import settings
from .pipeline import process_job


def enqueue_conversion_job(
    background_tasks: BackgroundTasks,
    job_id: str,
    preserve_layout: bool,
    language: str,
    user_prompt: str | None,
) -> str:
    if settings.celery_broker_url:
        from .worker import process_job_task

        process_job_task.delay(job_id, preserve_layout, language, user_prompt)
        return "celery"

    background_tasks.add_task(process_job, job_id, preserve_layout, language, user_prompt)
    return "background_tasks"
