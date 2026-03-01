from __future__ import annotations

import json
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .config import settings
from .persistence import (
    get_job_snapshot,
    get_page_snapshot,
    init_db,
    list_page_snapshots,
    list_job_events,
    list_jobs,
    save_event,
    save_file,
    save_job_snapshot,
    save_pages,
)
from .queue import enqueue_conversion_job
from .renderer import render_pages_and_merge
from .routing import choose_provider
from .schemas import (
    CreateJobRequest,
    EventEntry,
    InputMode,
    JobResponse,
    JobStatus,
    PageBlock,
    PageData,
    PatchRequest,
    UploadResponse,
)
from .store import DATA_DIR, FILES, JOBS, RESULT_DIR, UPLOAD_DIR, JobInternal, UploadedFile, add_event, utcnow


app = FastAPI(title="TrueForm API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/v1/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/v1/providers/status")
def providers_status():
    order = [name.strip().lower() for name in settings.ocr_provider_order.split(",") if name.strip()]
    configured = {
        "gemini": bool(settings.gemini_api_key),
        "openrouter": bool(settings.openrouter_api_key),
        "mathpix": bool(settings.mathpix_app_id and settings.mathpix_app_key),
        "local_ai_ocr": bool(settings.local_ai_ocr_url),
        "pypdf": True,
    }
    return {
        "order": order,
        "configured": configured,
        "active_admin_guard": bool(settings.admin_token),
    }


@app.post("/v1/files/upload", response_model=UploadResponse)
async def upload_file(file: UploadFile = File(...)) -> UploadResponse:
    file_id = str(uuid.uuid4())
    filename = file.filename or "upload.bin"
    target = UPLOAD_DIR / f"{file_id}_{filename}"

    content = await file.read()
    target.write_bytes(content)

    uploaded = UploadedFile(
        file_id=file_id,
        filename=filename,
        content_type=file.content_type or "application/octet-stream",
        size_bytes=len(content),
        path=target,
    )
    FILES[file_id] = uploaded
    save_file(file_id, uploaded.filename, uploaded.content_type, uploaded.size_bytes, str(uploaded.path))

    return UploadResponse(
        file_id=file_id,
        filename=uploaded.filename,
        content_type=uploaded.content_type,
        size_bytes=uploaded.size_bytes,
    )


@app.post("/v1/jobs", response_model=JobResponse)
def create_job(request: CreateJobRequest, background_tasks: BackgroundTasks) -> JobResponse:
    if request.file_id not in FILES:
        raise HTTPException(status_code=404, detail="file_id not found")

    now = utcnow()
    job_id = str(uuid.uuid4())
    job = JobInternal(
        id=job_id,
        file_id=request.file_id,
        mode=request.mode,
        status=JobStatus.queued,
        progress=0,
        message="Queued",
        created_at=now,
        updated_at=now,
    )
    add_event(job, JobStatus.queued, "Queued")
    JOBS[job_id] = job
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
    save_event(job.id, job.events[-1])

    uploaded = FILES[job.file_id]
    provider = choose_provider(uploaded.path, uploaded.content_type, request.mode, request.language)
    add_event(job, JobStatus.queued, f"Provider route selected: {provider}")
    save_event(job.id, job.events[-1])

    execution_mode = enqueue_conversion_job(
        background_tasks,
        job_id,
        request.preserve_layout,
        request.language,
        request.user_prompt,
    )
    add_event(job, JobStatus.queued, f"Execution mode: {execution_mode}")
    save_event(job.id, job.events[-1])

    return job.to_response()


@app.get("/v1/jobs/{job_id}", response_model=JobResponse)
def get_job(job_id: str) -> JobResponse:
    job = JOBS.get(job_id)
    if job:
        return job.to_response()

    snap = get_job_snapshot(job_id)
    if not snap:
        raise HTTPException(status_code=404, detail="job not found")

    pages = [PageData.model_validate(page) for page in list_page_snapshots(job_id)]

    return JobResponse(
        id=snap["id"],
        file_id=snap["file_id"],
        mode=snap["mode"],
        status=snap["status"],
        progress=snap["progress"],
        message=snap["message"],
        created_at=snap["created_at"],
        updated_at=snap["updated_at"],
        result_file=snap.get("result_file"),
        pages=pages,
    )


@app.get("/v1/jobs/{job_id}/events")
def get_job_events(job_id: str):
    job = JOBS.get(job_id)
    if job:
        return job.events

    persisted = list_job_events(job_id)
    if not persisted:
        raise HTTPException(status_code=404, detail="job not found")
    return persisted


@app.get("/v1/jobs/{job_id}/pages/{page_number}")
def get_job_page(job_id: str, page_number: int):
    job = JOBS.get(job_id)
    if job:
        for page in job.pages:
            if page.page_number == page_number:
                return page

    persisted = get_page_snapshot(job_id, page_number)
    if persisted:
        return persisted

    raise HTTPException(status_code=404, detail="page not found")


@app.post("/v1/jobs/{job_id}/pages/{page_number}/patch", response_model=JobResponse)
def patch_page(job_id: str, page_number: int, request: PatchRequest) -> JobResponse:
    job = JOBS.get(job_id)
    if not job:
        snap = get_job_snapshot(job_id)
        if not snap:
            raise HTTPException(status_code=404, detail="job not found")

        pages = [PageData.model_validate(page) for page in list_page_snapshots(job_id)]
        events = [
            EventEntry(
                at=datetime.fromisoformat(event["at"]),
                status=JobStatus(event["status"]),
                message=event["message"],
            )
            for event in list_job_events(job_id)
            if event.get("at") and event.get("status")
        ]

        job = JobInternal(
            id=snap["id"],
            file_id=snap["file_id"],
            mode=InputMode(snap["mode"]),
            status=JobStatus(snap["status"]),
            progress=snap["progress"],
            message=snap["message"],
            created_at=datetime.fromisoformat(snap["created_at"]),
            updated_at=datetime.fromisoformat(snap["updated_at"]),
            result_file=snap.get("result_file"),
            pages=pages,
            events=events,
        )
        JOBS[job_id] = job

    target_page = None
    for page in job.pages:
        if page.page_number == page_number:
            target_page = page
            break

    if target_page is None:
        raise HTTPException(status_code=404, detail="page not found")

    target_page.blocks.append(
        PageBlock(
            id=f"patch-{len(target_page.blocks) + 1}",
            kind="text",
            text=f"User patch: {request.instruction}",
            bbox=[0.08, 0.78, 0.85, 0.05],
            style={"font_size": 11, "bold": False},
        )
    )

    output_path = Path(RESULT_DIR) / f"{job_id}.pdf"
    render_pages_and_merge(output_path, job.pages, preserve_layout=True, user_prompt=request.instruction)
    job.result_file = str(output_path)
    add_event(job, JobStatus.reconstruction, "Patched and regenerated output")
    job.progress = 100
    add_event(job, JobStatus.completed, "Done")
    save_pages(job.id, job.pages)
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
    save_event(job.id, job.events[-2])
    save_event(job.id, job.events[-1])

    return job.to_response()


@app.get("/v1/jobs/{job_id}/result")
def get_result(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")

    if not job.result_file:
        snap = get_job_snapshot(job_id)
        if not snap or not snap.get("result_file"):
            raise HTTPException(status_code=404, detail="result not ready")
        job.result_file = snap["result_file"]

    result_path = Path(job.result_file)
    if not result_path.exists():
        raise HTTPException(status_code=404, detail="result file missing")

    return FileResponse(result_path, media_type="application/pdf")


@app.get("/v1/jobs/{job_id}/layout-artifact")
def get_layout_artifact(job_id: str, request: Request):
    artifact_path = DATA_DIR / "layout_artifacts" / f"{job_id}.layout.json"
    if not artifact_path.exists():
        raise HTTPException(status_code=404, detail="layout artifact not found")

    try:
        payload = json.loads(artifact_path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"invalid layout artifact: {exc}")

    pages = payload.get("pages", [])
    base_url = str(request.base_url).rstrip("/")
    for page in pages:
        page_number = page.get("page_number")
        if not isinstance(page_number, int):
            continue

        image_blocks = page.get("image_blocks", [])
        if isinstance(image_blocks, list):
            for block in image_blocks:
                if not isinstance(block, dict):
                    continue
                style = block.get("style", {})
                if not isinstance(style, dict):
                    continue
                image_path = style.get("image_path")
                if not image_path:
                    continue
                filename = Path(str(image_path)).name
                style["image_url"] = (
                    f"{base_url}/v1/jobs/{job_id}/layout-artifact/images/page/{page_number}/file/{filename}"
                )

        composed = page.get("composed_page")
        if isinstance(composed, dict) and isinstance(composed.get("blocks"), list):
            for block in composed["blocks"]:
                if not isinstance(block, dict):
                    continue
                style = block.get("style", {})
                if not isinstance(style, dict):
                    continue
                image_path = style.get("image_path")
                if not image_path:
                    continue
                filename = Path(str(image_path)).name
                style["image_url"] = (
                    f"{base_url}/v1/jobs/{job_id}/layout-artifact/images/page/{page_number}/file/{filename}"
                )

    return payload


@app.get("/v1/jobs/{job_id}/layout-artifact/images/page/{page_number}/file/{filename}")
def get_layout_artifact_image(job_id: str, page_number: int, filename: str):
    safe_name = Path(filename).name
    if safe_name != filename:
        raise HTTPException(status_code=400, detail="invalid filename")
    if Path(safe_name).suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
        raise HTTPException(status_code=400, detail="unsupported image type")

    image_path = DATA_DIR / "layout_artifacts" / "image_crops" / job_id / f"page_{page_number}" / safe_name
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="image crop not found")

    media_type = "image/png"
    suffix = image_path.suffix.lower()
    if suffix in {".jpg", ".jpeg"}:
        media_type = "image/jpeg"
    elif suffix == ".webp":
        media_type = "image/webp"

    return FileResponse(image_path, media_type=media_type)


def _require_admin(x_admin_token: str | None) -> None:
    if not settings.admin_token:
        return
    if x_admin_token != settings.admin_token:
        raise HTTPException(status_code=401, detail="unauthorized")


@app.get("/v1/admin/jobs")
def admin_list_jobs(limit: int = 50, x_admin_token: str | None = Header(default=None)):
    _require_admin(x_admin_token)
    safe_limit = max(1, min(limit, 500))
    return list_jobs(limit=safe_limit)


@app.get("/v1/admin/jobs/{job_id}")
def admin_get_job(job_id: str, x_admin_token: str | None = Header(default=None)):
    _require_admin(x_admin_token)
    snap = get_job_snapshot(job_id)
    if not snap:
        raise HTTPException(status_code=404, detail="job not found")
    return snap


@app.get("/v1/admin/jobs/{job_id}/events")
def admin_job_events(job_id: str, limit: int = 200, x_admin_token: str | None = Header(default=None)):
    _require_admin(x_admin_token)
    safe_limit = max(1, min(limit, 2000))
    return list_job_events(job_id=job_id, limit=safe_limit)
