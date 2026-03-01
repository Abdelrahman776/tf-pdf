# TrueForm PDF (tfpdf.com)

TrueForm PDF is a SaaS to convert scanned PDFs, images, and handwritten notes into digital searchable PDFs with preserved layout.

This repository implements the initial end-to-end foundation requested:

- Frontend: React + TypeScript + Vite + TanStack Query
- Backend: FastAPI (Python)
- Workflow: Upload -> Job -> Poll status -> Preview PDF -> Patch/edit instruction -> Regenerate

## Repo structure

- `apps/web`: React app
- `apps/api`: FastAPI app
- `docs`: full implementation guideline and comprehensive resource inventory

## Run locally

### API

```bash
cd apps/api
py -3.13 -m venv .venv
.venv\\Scripts\\python -m pip install -r requirements.txt
.venv\\Scripts\\python -m uvicorn app.main:app --reload --port 8010
```

### Web

```bash
cd apps/web
npm install
copy .env.example .env
# set VITE_API_BASE=http://127.0.0.1:8010
npm run dev
```

Open the Vite URL (usually `http://localhost:5173`).

## Quick local start scripts (PowerShell)

From repository root:

```bash
powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1
```

Or run individually:

```bash
powershell -ExecutionPolicy Bypass -File .\scripts\start-api.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\start-web.ps1
```

## Full dev stack (Docker)

```bash
docker compose -f docker-compose.dev.yml up --build
```

This starts API + Celery worker + Redis + Postgres.

## Current implemented features

- Upload scanned input (`pdf/png/jpg/jpeg/webp`)
- Choose mode (`scanned_pdf`, `image`, `handwriting`)
- Start conversion job via FastAPI
- Poll job status and progress in UI (TanStack Query)
- Show structured page JSON preview
- Render generated PDF in browser iframe
- Apply patch instruction and regenerate output
- Live job timeline events in result page
- Admin persisted job/event endpoints (`/v1/admin/*`)

Set `ADMIN_TOKEN` in API env and `VITE_ADMIN_TOKEN` in web env to protect/use admin routes.

## Next priorities

1. Replace mock extraction with model-routed OCR/VLM pipeline.
2. Add persistent DB + object storage (Supabase).
3. Add auth/credits/billing (Clerk + Stripe/PayPal).
4. Add Arabic + math + handwriting specialization.
5. Add quality testing suite + visual diff validation.

For complete product spec and all your resources, see:

- `docs/MASTER_GUIDE.md`
- `docs/IMPLEMENTATION_CHECKLIST.md`
- `docs/RESOURCES.md`
- `docs/OCR_PROVIDER_SETUP.md`
