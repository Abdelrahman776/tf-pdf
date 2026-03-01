from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

from .config import settings
from .schemas import PageBlock, PageData
from .store import DATA_DIR

try:
    from langchain_core.messages import HumanMessage
    from langchain_core.output_parsers import StrOutputParser
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_google_genai import ChatGoogleGenerativeAI

    LANGCHAIN_AVAILABLE = True
except Exception:
    LANGCHAIN_AVAILABLE = False

try:
    import cv2

    CV2_AVAILABLE = True
except Exception:
    CV2_AVAILABLE = False

try:
    import pypdfium2 as pdfium

    PDFIUM_AVAILABLE = True
except Exception:
    PDFIUM_AVAILABLE = False


@dataclass
class LayoutPipelineResult:
    pages: list[PageData]
    artifacts_file: Path | None


def run_layout_pipeline(
    *,
    source_file: Path,
    pages: list[PageData],
    language: str,
    user_prompt: str | None,
    job_id: str,
) -> LayoutPipelineResult:
    page_images = _render_source_pages_to_images(source_file, job_id)
    llm = _build_llm()

    enriched_pages: list[PageData] = []
    artifacts: dict = {
        "job_id": job_id,
        "source_file": str(source_file),
        "language": language,
        "prompt_file_spec": GENERATION_PROMPT_TEMPLATE,
        "pages": [],
    }

    for page in pages:
        image_path = page_images.get(page.page_number)
        corrected_blocks = _verify_text_with_llm(llm, page, image_path=image_path, language=language, user_prompt=user_prompt)
        layout_props = _describe_layout_with_llm(
            llm,
            page_number=page.page_number,
            image_path=image_path,
            language=language,
            user_prompt=user_prompt,
        )
        image_blocks = _detect_and_crop_image_regions(
            page_number=page.page_number,
            image_path=image_path,
            job_id=job_id,
        )

        merged_blocks = list(corrected_blocks)
        merged_blocks.extend(image_blocks)

        styled_page = PageData(
            page_number=page.page_number,
            width=page.width,
            height=page.height,
            blocks=merged_blocks,
        )
        enriched_pages.append(styled_page)

        artifacts["pages"].append(
            {
                "page_number": page.page_number,
                "layout": layout_props,
                "text_blocks": [block.model_dump() for block in corrected_blocks],
                "image_blocks": [block.model_dump() for block in image_blocks],
                "composed_page": styled_page.model_dump(),
            }
        )

    artifacts_path = DATA_DIR / "layout_artifacts" / f"{job_id}.layout.json"
    artifacts_path.parent.mkdir(parents=True, exist_ok=True)
    artifacts_path.write_text(json.dumps(artifacts, ensure_ascii=False, indent=2), encoding="utf-8")

    return LayoutPipelineResult(pages=enriched_pages, artifacts_file=artifacts_path)


def _build_llm() -> ChatGoogleGenerativeAI | None:
    if not settings.gemini_api_key:
        return None
    if not settings.use_langchain_layout_pipeline:
        return None
    if not LANGCHAIN_AVAILABLE:
        return None

    return ChatGoogleGenerativeAI(
        model=settings.langchain_layout_model,
        google_api_key=settings.gemini_api_key,
        temperature=0.1,
    )


def _verify_text_with_llm(
    llm: ChatGoogleGenerativeAI | None,
    page: PageData,
    *,
    image_path: Path | None,
    language: str,
    user_prompt: str | None,
) -> list[PageBlock]:
    if llm is None:
        return page.blocks

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You are an OCR verification assistant. Correct OCR errors, fill clearly missing words when confidently inferable, and keep the same reading order. Return strict JSON array of blocks.",
            ),
            (
                "human",
                "Language={language}. User instruction={user_prompt}. Existing OCR blocks JSON:\n{blocks_json}",
            ),
        ]
    )
    chain = prompt | llm | StrOutputParser()

    response_text = None
    try:
        response_text = chain.invoke(
            {
                "language": language,
                "user_prompt": user_prompt or "",
                "blocks_json": json.dumps([block.model_dump() for block in page.blocks], ensure_ascii=False),
            }
        )
    except Exception:
        return page.blocks

    parsed = _extract_json(response_text)
    if not isinstance(parsed, list):
        return page.blocks

    corrected: list[PageBlock] = []
    for idx, item in enumerate(parsed, start=1):
        if not isinstance(item, dict):
            continue
        text = str(item.get("text", "")).strip()
        if not text:
            continue
        bbox = item.get("bbox", [0.08, 0.12 + idx * 0.03, 0.84, 0.025])
        if not isinstance(bbox, list) or len(bbox) != 4:
            bbox = [0.08, 0.12 + idx * 0.03, 0.84, 0.025]
        corrected.append(
            PageBlock(
                id=str(item.get("id", f"b{idx}")),
                kind="text",
                text=text,
                bbox=[float(v) for v in bbox],
                style=item.get("style", {"font_size": 11}),
            )
        )

    return corrected or page.blocks


def _describe_layout_with_llm(
    llm: ChatGoogleGenerativeAI | None,
    *,
    page_number: int,
    image_path: Path | None,
    language: str,
    user_prompt: str | None,
) -> dict:
    fallback = {
        "page_number": page_number,
        "background_color": "unknown",
        "text_color": "unknown",
        "font_families": [],
        "font_sizes": [],
        "line_spacing": "unknown",
        "letter_spacing": "unknown",
        "layout_blocks": [],
        "images": [],
    }

    if llm is None or image_path is None or not image_path.exists():
        return fallback

    image_bytes = image_path.read_bytes()
    message = HumanMessage(
        content=[
            {
                "type": "text",
                "text": (
                    "Analyze this scanned page and return strict JSON with keys: "
                    "page_number, background_color, text_color, font_families, font_sizes, line_spacing, letter_spacing, "
                    "layout_blocks (with role and bbox), images (with bbox). "
                    "Use normalized bbox [x,y,w,h] in [0,1]. "
                    f"Language={language}. User instruction={user_prompt or ''}."
                ),
            },
            {
                "type": "image",
                "base64": base64.b64encode(image_bytes).decode("utf-8"),
                "mime_type": "image/png",
            },
        ]
    )

    try:
        raw = llm.invoke([message]).content
    except Exception:
        return fallback

    parsed = _extract_json(raw)
    if isinstance(parsed, dict):
        parsed.setdefault("page_number", page_number)
        return parsed
    return fallback


def _detect_and_crop_image_regions(page_number: int, image_path: Path | None, job_id: str) -> list[PageBlock]:
    if image_path is None or not image_path.exists():
        return []

    regions = _detect_regions_cv2(image_path)
    if not regions:
        return []

    crops_root = DATA_DIR / "layout_artifacts" / "image_crops" / job_id / f"page_{page_number}"
    crops_root.mkdir(parents=True, exist_ok=True)
    image = Image.open(image_path).convert("RGB")
    width, height = image.size

    blocks: list[PageBlock] = []
    for index, (x, y, w, h) in enumerate(regions, start=1):
        left = max(0, int(x * width))
        top = max(0, int(y * height))
        right = min(width, int((x + w) * width))
        bottom = min(height, int((y + h) * height))
        if right <= left or bottom <= top:
            continue

        crop_path = crops_root / f"img_{index}.png"
        image.crop((left, top, right, bottom)).save(crop_path)

        blocks.append(
            PageBlock(
                id=f"img-{page_number}-{index}",
                kind="image",
                text="",
                bbox=[x, y, w, h],
                style={"image_path": str(crop_path)},
            )
        )

    return blocks


def _detect_regions_cv2(image_path: Path) -> list[tuple[float, float, float, float]]:
    if not CV2_AVAILABLE:
        return []

    image = cv2.imread(str(image_path))
    if image is None:
        return []

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blur, 40, 120)

    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    h, w = gray.shape

    regions: list[tuple[float, float, float, float]] = []
    for contour in contours:
        x, y, bw, bh = cv2.boundingRect(contour)
        area = bw * bh
        if area < 10000:
            continue
        if bw / max(1, bh) > 10 or bh / max(1, bw) > 10:
            continue
        regions.append((x / w, y / h, bw / w, bh / h))

    regions.sort(key=lambda box: box[2] * box[3], reverse=True)
    return regions[:8]


def _render_source_pages_to_images(source_file: Path, job_id: str) -> dict[int, Path]:
    out: dict[int, Path] = {}
    pages_dir = DATA_DIR / "layout_artifacts" / "page_renders" / job_id
    pages_dir.mkdir(parents=True, exist_ok=True)

    suffix = source_file.suffix.lower()
    if suffix in {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}:
        target = pages_dir / "page_1.png"
        Image.open(source_file).convert("RGB").save(target)
        out[1] = target
        return out

    if suffix == ".pdf" and PDFIUM_AVAILABLE:
        try:
            pdf = pdfium.PdfDocument(str(source_file))
            for index in range(len(pdf)):
                page = pdf[index]
                bitmap = page.render(scale=2)
                pil_image = bitmap.to_pil()
                target = pages_dir / f"page_{index + 1}.png"
                pil_image.save(target)
                out[index + 1] = target
            return out
        except Exception:
            return out

    return out


def _extract_json(raw: str | list | dict | None) -> dict | list | None:
    if isinstance(raw, dict) or isinstance(raw, list):
        return raw
    if not isinstance(raw, str):
        return None

    text = raw.strip()
    if not text:
        return None

    if text.startswith("```"):
        text = text.strip("`")
        text = text.replace("json", "", 1).strip()

    try:
        return json.loads(text)
    except Exception:
        pass

    start_obj = text.find("{")
    end_obj = text.rfind("}")
    if start_obj >= 0 and end_obj > start_obj:
        try:
            return json.loads(text[start_obj : end_obj + 1])
        except Exception:
            pass

    start_arr = text.find("[")
    end_arr = text.rfind("]")
    if start_arr >= 0 and end_arr > start_arr:
        try:
            return json.loads(text[start_arr : end_arr + 1])
        except Exception:
            return None
    return None


GENERATION_PROMPT_TEMPLATE = """
You are generating a hybrid digital PDF page from structured extraction.

Input JSON fields:
- text_blocks: OCR-corrected text blocks with bbox/style
- image_blocks: cropped image blocks with bbox and image_path
- layout: background/text colors, fonts, spacing, and page block roles

Output JSON contract:
{
  "pages": [
    {
      "page_number": int,
      "render_plan": {
        "background": {"color": "..."},
        "text": [{"text": "...", "bbox": [x,y,w,h], "style": {...}}],
        "images": [{"image_path": "...", "bbox": [x,y,w,h]}]
      }
    }
  ]
}

Rules:
1) Keep text as digital text in text layer.
2) Keep image regions as embedded image assets.
3) Preserve reading order and approximate visual layout fidelity.
4) Never flatten whole page into a single image.
""".strip()
