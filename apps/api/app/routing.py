from __future__ import annotations

from pathlib import Path

from .schemas import InputMode


def choose_provider(file_path: Path, content_type: str, mode: InputMode, language: str) -> str:
    suffix = file_path.suffix.lower()

    if mode == InputMode.handwriting:
        return "gemini"

    if language.lower().startswith("ar"):
        return "gemini"

    if suffix in {".png", ".jpg", ".jpeg", ".webp"}:
        return "gemini"

    if suffix == ".pdf":
        if "image" in content_type or mode == InputMode.scanned_pdf:
            return "gemini"
        return "pypdf"

    return "fallback"
