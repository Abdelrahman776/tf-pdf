from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class InputMode(str, Enum):
    scanned_pdf = "scanned_pdf"
    image = "image"
    handwriting = "handwriting"


class JobStatus(str, Enum):
    queued = "queued"
    preprocessing = "preprocessing"
    ocr = "ocr"
    reconstruction = "reconstruction"
    completed = "completed"
    failed = "failed"


class UploadResponse(BaseModel):
    file_id: str
    filename: str
    content_type: str
    size_bytes: int


class CreateJobRequest(BaseModel):
    file_id: str
    mode: InputMode
    preserve_layout: bool = True
    language: str = "en"
    user_prompt: str | None = None


class PageBlock(BaseModel):
    id: str
    kind: str = "text"
    text: str
    bbox: list[float] = Field(default_factory=lambda: [0.0, 0.0, 1.0, 1.0])
    style: dict[str, Any] = Field(default_factory=dict)


class PageData(BaseModel):
    page_number: int
    width: float = 595.28
    height: float = 841.89
    blocks: list[PageBlock] = Field(default_factory=list)


class JobResponse(BaseModel):
    id: str
    file_id: str
    mode: InputMode
    status: JobStatus
    progress: int
    message: str
    created_at: datetime
    updated_at: datetime
    result_file: str | None = None
    pages: list[PageData] = Field(default_factory=list)


class PatchRequest(BaseModel):
    instruction: str


class EventEntry(BaseModel):
    at: datetime
    status: JobStatus
    message: str
