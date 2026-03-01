from __future__ import annotations

from pathlib import Path

from pypdf import PdfWriter
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

from .schemas import PageData


def render_pages_and_merge(output_path: Path, pages: list[PageData], preserve_layout: bool, user_prompt: str | None) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temp_files: list[Path] = []

    for page in pages:
        temp_page = output_path.with_suffix(f".page{page.page_number}.pdf")
        _render_single_page(temp_page, page, preserve_layout=preserve_layout, user_prompt=user_prompt)
        temp_files.append(temp_page)

    writer = PdfWriter()
    for temp_file in temp_files:
        writer.append(str(temp_file))

    with output_path.open("wb") as fp:
        writer.write(fp)

    for temp_file in temp_files:
        if temp_file.exists():
            temp_file.unlink()


def _render_single_page(output_path: Path, page: PageData, preserve_layout: bool, user_prompt: str | None) -> None:
    c = canvas.Canvas(str(output_path), pagesize=A4)
    page_w, page_h = A4

    for block in page.blocks:
        bbox = block.bbox if hasattr(block, "bbox") else block.get("bbox", [0.0, 0.0, 1.0, 1.0])
        style = block.style if hasattr(block, "style") else block.get("style", {})
        text = block.text if hasattr(block, "text") else block.get("text", "")
        kind = block.kind if hasattr(block, "kind") else block.get("kind", "text")

        x = bbox[0] * page_w
        y = page_h - ((bbox[1] + bbox[3]) * page_h)
        draw_w = bbox[2] * page_w
        draw_h = bbox[3] * page_h

        if kind == "image":
            image_path = style.get("image_path")
            if image_path and Path(str(image_path)).exists():
                c.drawImage(ImageReader(str(image_path)), x, y, width=draw_w, height=draw_h, preserveAspectRatio=True)
            continue

        font_size = int(style.get("font_size", 12))
        c.setFont("Helvetica-Bold" if style.get("bold") else "Helvetica", font_size)
        c.drawString(x, y, text)

    c.showPage()
    c.save()
