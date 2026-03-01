from __future__ import annotations

import base64
import json
from pathlib import Path

import requests
from pypdf import PdfReader

from .config import settings
from .schemas import InputMode, PageBlock, PageData


def extract_pages(file_path: Path, mode: InputMode, language: str, user_prompt: str | None) -> list[PageData]:
    provider_order = [name.strip().lower() for name in settings.ocr_provider_order.split(",") if name.strip()]
    routed_default = _provider_name(file_path, mode, language)
    if routed_default not in provider_order:
        provider_order.insert(0, routed_default)

    for provider in provider_order:
        pages: list[PageData] | None = None

        if provider == "gemini" and settings.gemini_api_key:
            pages = _try_gemini(file_path=file_path, language=language, user_prompt=user_prompt)
        elif provider == "openrouter" and settings.openrouter_api_key:
            pages = _try_openrouter(file_path=file_path, user_prompt=user_prompt)
        elif provider == "mathpix" and settings.mathpix_app_id and settings.mathpix_app_key:
            pages = _try_mathpix(file_path=file_path)
        elif provider == "local_ai_ocr" and settings.local_ai_ocr_url:
            pages = _try_local_ai_ocr(file_path=file_path)
        elif provider == "pypdf" and file_path.suffix.lower() == ".pdf":
            pages = _extract_pdf_with_pypdf(file_path)

        if pages:
            cleaned = _clean_pages(pages)
            if cleaned:
                return cleaned

    return _fallback_single_page()


def _provider_name(file_path: Path, mode: InputMode, language: str) -> str:
    from .routing import choose_provider

    fake_content_type = "application/pdf" if file_path.suffix.lower() == ".pdf" else "image/*"
    return choose_provider(file_path, fake_content_type, mode, language)


def _extract_pdf_with_pypdf(file_path: Path) -> list[PageData]:
    reader = PdfReader(str(file_path))
    pages_out: list[PageData] = []

    for index, page in enumerate(reader.pages, start=1):
        text = (page.extract_text() or "").strip()
        lines = [line.strip() for line in text.splitlines() if line.strip()]

        blocks: list[PageBlock] = []
        for i, line in enumerate(lines):
            blocks.append(
                PageBlock(
                    id=f"p{index}-b{i+1}",
                    text=line,
                    bbox=[0.08, 0.14 + i * 0.04, 0.84, 0.03],
                    style={"font_size": 11, "bold": False},
                )
            )

        pages_out.append(PageData(page_number=index, blocks=blocks))

    return pages_out


def _fallback_single_page() -> list[PageData]:
    return [PageData(page_number=1, blocks=[])]


def _try_gemini(file_path: Path, language: str, user_prompt: str | None) -> list[PageData] | None:
    try:
        prompt = (
            "Extract only page text content and structure. Return strict JSON: "
            "{\"pages\":[{\"page_number\":1,\"blocks\":[{\"id\":\"b1\",\"text\":\"...\",\"bbox\":[0.1,0.1,0.8,0.05],\"style\":{\"font_size\":12,\"bold\":false}}]}]} "
            "Do not add metadata or processing notes. "
            f"Language={language}. "
            + (f"User instruction: {user_prompt}" if user_prompt else "")
        )

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_model}:generateContent"
        headers = {"Content-Type": "application/json"}

        mime = "application/pdf" if file_path.suffix.lower() == ".pdf" else "image/png"
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt},
                        {
                            "inline_data": {
                                "mime_type": mime,
                                "data": base64.b64encode(file_path.read_bytes()).decode("utf-8"),
                            }
                        },
                    ]
                }
            ]
        }

        response = requests.post(
            f"{url}?key={settings.gemini_api_key}",
            headers=headers,
            json=payload,
            timeout=60,
        )
        response.raise_for_status()

        data = response.json()
        text = data["candidates"][0]["content"]["parts"][0].get("text", "")
        parsed = _extract_json(text)
        if not parsed:
            return None

        return _pages_from_dict(parsed)
    except Exception:
        return None


def _try_openrouter(file_path: Path, user_prompt: str | None) -> list[PageData] | None:
    try:
        prompt = (
            "Extract only document text content and return strict JSON with pages/blocks/bbox/style. "
            "No commentary."
        )
        if user_prompt:
            prompt += f" User instruction: {user_prompt}"

        headers = {
            "Authorization": f"Bearer {settings.openrouter_api_key}",
            "Content-Type": "application/json",
        }

        content_parts: list[dict] = [{"type": "text", "text": prompt}]
        if file_path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}:
            mime = "image/png" if file_path.suffix.lower() == ".png" else "image/jpeg"
            data_uri = f"data:{mime};base64,{base64.b64encode(file_path.read_bytes()).decode('utf-8')}"
            content_parts.append({"type": "image_url", "image_url": {"url": data_uri}})

        payload = {
            "model": settings.openrouter_model,
            "messages": [{"role": "user", "content": content_parts}],
        }

        response = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=60,
        )
        response.raise_for_status()

        data = response.json()
        raw_text = data["choices"][0]["message"].get("content", "")
        parsed = _extract_json(raw_text)
        if not parsed:
            return None
        return _pages_from_dict(parsed)
    except Exception:
        return None


def _try_mathpix(file_path: Path) -> list[PageData] | None:
    try:
        headers = {
            "app_id": settings.mathpix_app_id,
            "app_key": settings.mathpix_app_key,
        }
        options = {
            "formats": ["text"],
            "data_options": {"include_asciimath": False},
        }

        with file_path.open("rb") as fp:
            files = {
                "file": (file_path.name, fp, "application/pdf" if file_path.suffix.lower() == ".pdf" else "image/png"),
                "options_json": (None, json.dumps(options), "application/json"),
            }
            response = requests.post("https://api.mathpix.com/v3/text", headers=headers, files=files, timeout=90)

        response.raise_for_status()
        data = response.json()
        text = (data.get("text") or "").strip()
        if not text:
            return None

        lines = [line.strip() for line in text.splitlines() if line.strip()]
        blocks = [
            PageBlock(
                id=f"b{i+1}",
                text=line,
                bbox=[0.08, 0.12 + i * 0.03, 0.84, 0.025],
                style={"font_size": 11, "bold": False},
            )
            for i, line in enumerate(lines)
        ]
        return [PageData(page_number=1, blocks=blocks)]
    except Exception:
        return None


def _try_local_ai_ocr(file_path: Path) -> list[PageData] | None:
    try:
        with file_path.open("rb") as fp:
            files = {
                "file": (file_path.name, fp, "application/pdf" if file_path.suffix.lower() == ".pdf" else "image/png")
            }
            response = requests.post(settings.local_ai_ocr_url, files=files, timeout=90)

        response.raise_for_status()
        data = response.json()

        if isinstance(data, dict) and "pages" in data:
            return _pages_from_dict(data)

        text = ""
        if isinstance(data, dict):
            text = str(data.get("text", "")).strip()
        if not text:
            return None

        lines = [line.strip() for line in text.splitlines() if line.strip()]
        blocks = [
            PageBlock(
                id=f"b{i+1}",
                text=line,
                bbox=[0.08, 0.12 + i * 0.03, 0.84, 0.025],
                style={"font_size": 11, "bold": False},
            )
            for i, line in enumerate(lines)
        ]
        return [PageData(page_number=1, blocks=blocks)]
    except Exception:
        return None


def _pages_from_dict(parsed: dict) -> list[PageData] | None:
    pages_out: list[PageData] = []

    if "pages" in parsed and isinstance(parsed["pages"], list):
        pages = parsed["pages"]
    elif "blocks" in parsed and isinstance(parsed["blocks"], list):
        pages = [{"page_number": 1, "blocks": parsed["blocks"]}]
    elif "text" in parsed and isinstance(parsed["text"], str):
        lines = [line.strip() for line in parsed["text"].splitlines() if line.strip()]
        pages = [
            {
                "page_number": 1,
                "blocks": [
                    {
                        "id": f"b{i+1}",
                        "text": line,
                        "bbox": [0.08, 0.12 + i * 0.03, 0.84, 0.025],
                        "style": {"font_size": 11},
                    }
                    for i, line in enumerate(lines)
                ],
            }
        ]
    else:
        return None

    for page in pages:
        blocks: list[PageBlock] = []
        for block in page.get("blocks", []):
            text = str(block.get("text", "")).strip()
            if not text:
                continue
            blocks.append(
                PageBlock(
                    id=str(block.get("id", f"b{len(blocks)+1}")),
                    text=text,
                    bbox=[float(x) for x in block.get("bbox", [0.1, 0.1, 0.8, 0.05])],
                    style=block.get("style", {"font_size": 12}),
                )
            )

        pages_out.append(PageData(page_number=int(page.get("page_number", len(pages_out) + 1)), blocks=blocks))

    return pages_out


def _clean_pages(pages: list[PageData]) -> list[PageData]:
    cleaned: list[PageData] = []
    for page in pages:
        filtered_blocks = [b for b in page.blocks if b.text and b.text.strip()]
        cleaned.append(
            PageData(page_number=page.page_number, width=page.width, height=page.height, blocks=filtered_blocks)
        )

    if all(len(page.blocks) == 0 for page in cleaned):
        return []
    return cleaned


def _extract_json(raw: str) -> dict | None:
    raw = raw.strip()
    if not raw:
        return None

    if raw.startswith("```"):
        raw = raw.strip("`")
        raw = raw.replace("json", "", 1).strip()

    try:
        return json.loads(raw)
    except Exception:
        start = raw.find("{")
        end = raw.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(raw[start : end + 1])
            except Exception:
                return None
        return None
