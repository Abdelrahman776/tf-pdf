from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict

from .schemas import EventEntry, InputMode, JobResponse, JobStatus, PageData


ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
RESULT_DIR = DATA_DIR / "results"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
RESULT_DIR.mkdir(parents=True, exist_ok=True)


@dataclass
class UploadedFile:
    file_id: str
    filename: str
    content_type: str
    size_bytes: int
    path: Path


@dataclass
class JobInternal:
    id: str
    file_id: str
    mode: InputMode
    status: JobStatus
    progress: int
    message: str
    created_at: datetime
    updated_at: datetime
    result_file: str | None = None
    pages: list[PageData] = field(default_factory=list)
    events: list[EventEntry] = field(default_factory=list)

    def to_response(self) -> JobResponse:
        return JobResponse(
            id=self.id,
            file_id=self.file_id,
            mode=self.mode,
            status=self.status,
            progress=self.progress,
            message=self.message,
            created_at=self.created_at,
            updated_at=self.updated_at,
            result_file=self.result_file,
            pages=self.pages,
        )


FILES: Dict[str, UploadedFile] = {}
JOBS: Dict[str, JobInternal] = {}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def add_event(job: JobInternal, status: JobStatus, message: str) -> None:
    now = utcnow()
    job.status = status
    job.message = message
    job.updated_at = now
    job.events.append(EventEntry(at=now, status=status, message=message))
