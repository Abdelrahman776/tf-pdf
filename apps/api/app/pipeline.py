from __future__ import annotations

import asyncio

from .extractors import extract_pages
from .layout_chain import run_layout_pipeline
from .persistence import save_event, save_job_snapshot, save_pages
from .renderer import render_pages_and_merge
from .schemas import JobStatus
from .store import FILES, JOBS, RESULT_DIR, add_event


async def process_job(job_id: str, preserve_layout: bool, language: str, user_prompt: str | None) -> None:
    job = JOBS[job_id]
    uploaded = FILES[job.file_id]

    try:
        add_event(job, JobStatus.preprocessing, "Classifying file and splitting pages")
        save_event(job.id, job.events[-1])
        job.progress = 15
        _persist_job(job)
        await asyncio.sleep(0.3)

        pages = extract_pages(uploaded.path, job.mode, language, user_prompt)
        add_event(job, JobStatus.ocr, "Running OCR + layout extraction")
        save_event(job.id, job.events[-1])
        job.progress = 45
        _persist_job(job)
        await asyncio.sleep(0.3)

        layout_result = run_layout_pipeline(
            source_file=uploaded.path,
            pages=pages,
            language=language,
            user_prompt=user_prompt,
            job_id=job.id,
        )
        pages = layout_result.pages
        if layout_result.artifacts_file:
            add_event(job, JobStatus.ocr, f"Layout artifacts: {layout_result.artifacts_file}")
            save_event(job.id, job.events[-1])

        job.pages = pages
        save_pages(job.id, pages)

        add_event(job, JobStatus.reconstruction, "Reconstructing digital PDF")
        save_event(job.id, job.events[-1])
        job.progress = 80
        _persist_job(job)
        await asyncio.sleep(0.3)

        output_path = RESULT_DIR / f"{job_id}.pdf"
        render_pages_and_merge(output_path, pages, preserve_layout=preserve_layout, user_prompt=user_prompt)

        job.result_file = str(output_path)
        job.progress = 100
        add_event(job, JobStatus.completed, "Done")
        save_event(job.id, job.events[-1])
        _persist_job(job)

    except Exception as exc:
        add_event(job, JobStatus.failed, f"Failed: {exc}")
        save_event(job.id, job.events[-1])


def _persist_job(job) -> None:
    save_job_snapshot(
        job_id=job.id,
        file_id=job.file_id,
        mode=job.mode.value,
        status=job.status.value,
        progress=job.progress,
        message=job.message,
        result_file=job.result_file,
        created_at=job.created_at.isoformat(),
        updated_at=job.updated_at.isoformat(),
    )
