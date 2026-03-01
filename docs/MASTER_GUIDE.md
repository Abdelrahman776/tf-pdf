# TrueForm PDF - Step-by-Step Master Guide

## 1) Vision

Build a SaaS that reconstructs scanned documents into real digital PDFs (searchable/editable + preserved structure), not just image PDFs with hidden OCR text.

## 2) Primary stack

- Frontend: React + TypeScript + Vite + TanStack Query
- Backend: FastAPI + Pydantic + async workers
- Queue: Redis + Celery/Hatchet
- Storage/DB: Supabase (Postgres + Storage)
- OCR/VLM: Gemini (primary), DeepSeek OCR/Qwen/PaddleOCR/Mistral as alternates
- Rendering: HTML/CSS-to-PDF first, Typst second-stage for high fidelity
- PDF utilities: pypdf, pdf2image, OCRmyPDF

## 3) End-to-end architecture

1. Upload source file
2. Classify source type (scanned_pdf, image, handwriting)
3. Split PDF by pages (context limit safe)
4. Per-page extraction route:
   - simple page -> OCR
   - complex page -> multimodal VLM
5. Build structured page JSON (blocks, bbox, style hints, images)
6. Text correction pass (context-aware typo fixing)
7. Render digital page (HTML/CSS or Typst)
8. Merge pages and export final PDF
9. Side-by-side preview + chat patch loop

## 4) Product phases

### Phase 1 - MVP without AI (validate market)

- Upload + convert + preview
- Basic OCR pipeline
- Progress UI
- Error handling (no text found, unsupported)

### Phase 2 - Reconstruction quality

- VLM layout extraction
- Structured JSON
- Better typography, blocks, and spacing

### Phase 3 - Interactive editor

- Chat/patch commands
- Single-page re-render
- Diff-like side-by-side review

### Phase 4 - Arabic/math/handwriting

- RTL + Arabic searchable output
- Math extraction and rendering
- Handwriting specialization

### Phase 5 - SaaS hardening

- Auth, credits, billing
- API docs
- analytics, observability, CI/CD, security

## 5) Data contracts

### `CreateJobRequest`

- `file_id: string`
- `mode: scanned_pdf | image | handwriting`
- `preserve_layout: boolean`
- `language: string`
- `user_prompt?: string`

### `PageData`

- `page_number`
- `width`, `height`
- `blocks[]`:
  - `id`
  - `kind` (`text`, `image`, `table`, ...)
  - `text`
  - `bbox` normalized `[x, y, w, h]`
  - `style` object

## 6) Frontend UX spec

- Home upload section
- File mode selector
- Layout mode toggle
- Optional user instruction
- Job result page:
  - status + progress
  - structured JSON preview
  - PDF preview iframe
  - chat patch input

## 7) Backend API spec (implemented baseline)

- `POST /v1/files/upload`
- `POST /v1/jobs`
- `GET /v1/jobs/{job_id}`
- `GET /v1/jobs/{job_id}/events`
- `GET /v1/jobs/{job_id}/pages/{page_number}`
- `POST /v1/jobs/{job_id}/pages/{page_number}/patch`
- `GET /v1/jobs/{job_id}/result`

## 8) Model-routing policy

- Route A: OCRmyPDF/Tesseract for clean scans
- Route B: Gemini/DeepSeek for complex layouts
- Route C: handwriting mode with specialized prompts/fallback models
- Route D: math-heavy pages with Mathpix-like processing

Provider setup details are documented in `docs/OCR_PROVIDER_SETUP.md`.

## 9) Security and reliability

- Signed URLs and short file retention windows
- PII minimization before model calls
- Idempotent jobs and retries
- Queue workers with dead-letter handling
- Audit logs for enterprise paths

## 10) Business roadmap

- Free tier + credits
- Pay-as-you-go and subscription plans
- API access for integrators
- Vertical GTM: prescriptions, Arabic archives, student notes

## 11) What is implemented right now in repo

- Full web+api scaffold
- Upload -> convert -> poll -> preview
- Page JSON + patch/regenerate flow
- Detailed roadmap/checklists/resources docs

## 12) What to implement next in code

1. Replace mock extraction with real OCR+VLM providers.
2. Add persistent storage and background queue.
3. Add auth/billing/credits.
4. Add Arabic/math/handwriting quality modules.
5. Add tests and deployment pipelines.
