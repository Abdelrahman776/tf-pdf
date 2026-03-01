# TrueForm API (FastAPI)

## Run

```bash
py -3.13 -m venv .venv
.venv\\Scripts\\python -m pip install -r requirements.txt
.venv\\Scripts\\python -m uvicorn app.main:app --reload --port 8010
```

## Environment variables

- `GEMINI_API_KEY` (optional): enables Gemini-based multimodal extraction.
- `GEMINI_MODEL` (optional, default `gemini-2.5-flash`)
- `OCR_PROVIDER_ORDER` (optional): comma-separated order, e.g. `gemini,openrouter,mathpix,local_ai_ocr,pypdf`.
- `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` (optional): Qwen-VL and other models via OpenRouter.
- `MATHPIX_APP_ID` / `MATHPIX_APP_KEY` (optional): Mathpix OCR fallback.
- `LOCAL_AI_OCR_URL` (optional): local offline OCR service endpoint.
- `USE_SQLITE_PERSISTENCE` (default `1`)
- `SUPABASE_DB_URL` (optional): if set, metadata is persisted to Postgres/Supabase.
- `CELERY_BROKER_URL` (optional): if set, jobs are queued to Celery workers.
- `CELERY_RESULT_BACKEND` (optional)
- `ADMIN_TOKEN` (optional): protects `/v1/admin/*` endpoints via `x-admin-token` header.
- `USE_LANGCHAIN_LAYOUT_PIPELINE` (default `1`): enables LangChain + Gemini multi-step layout pipeline.
- `LANGCHAIN_LAYOUT_MODEL` (default `gemini-2.5-pro`): Gemini model used for layout analysis and OCR correction.

### LangChain + Gemini multistep layout pipeline

When enabled, processing now runs additional steps after OCR:

1. OCR text verification chain (Gemini) to correct low-confidence words and preserve reading order.
2. Page screenshot layout analysis chain (Gemini multimodal) for colors, spacing, fonts, structure, and block positions.
3. Image-region detection and cropping (OpenCV contour fallback) so image areas remain embedded images in output PDFs.
4. Structured artifact output (`data/layout_artifacts/<job_id>.layout.json`) containing text blocks, image blocks, layout properties, and render-ready prompt template.

This produces hybrid PDFs where text is digital/selectable and detected non-text regions remain image assets.

Without `GEMINI_API_KEY`, extraction falls back to `pypdf`/local fallback mode.

## Optional worker mode (Celery)

```bash
set CELERY_BROKER_URL=redis://localhost:6379/0
.venv\\Scripts\\python -m celery -A app.worker.celery_app worker --loglevel=info
```

## Docker dev stack (API + worker + Redis + Postgres)

From repository root:

```bash
docker compose -f docker-compose.dev.yml up --build
```

API will be available at `http://127.0.0.1:8010`.

## Endpoints

- `POST /v1/files/upload`
- `POST /v1/jobs`
- `GET /v1/jobs/{job_id}`
- `GET /v1/jobs/{job_id}/result`
- `GET /v1/jobs/{job_id}/pages/{page_number}`
- `POST /v1/jobs/{job_id}/pages/{page_number}/patch`
- `GET /v1/jobs/{job_id}/events`
- `GET /v1/admin/jobs` (persisted DB view)
- `GET /v1/admin/jobs/{job_id}` (persisted DB view)
- `GET /v1/admin/jobs/{job_id}/events` (persisted DB view)
