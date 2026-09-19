# TrueForm PDF - MVP Production Plan

## 1. Product Overview
**Goal:** A SaaS web application that converts scanned PDFs and images into digitized, searchable, and editable hybrid documents (HTML/CSS) while preserving the original layout and allowing in-browser WYSIWYG editing.

## 2. Tech Stack & Architecture
- **Frontend:** React + Vite + TanStack Router
- **UI Framework:** Tailwind CSS + shadcn/ui (Mobile-first design)
- **Backend:** FastAPI (Python)
- **AI / LLM Engine:** Pure Google Gemini API (Multimodal for text & layout extraction)
- **Data & Auth:** Stateless MVP (No DB/Auth initially). Future: BetterAuth + Supabase/Convex.

## 3. Core Processing Pipeline (Backend)
1. **Upload & Split:** User uploads a PDF (hard limit: **max 5 pages** for MVP to control API costs). FastAPI splits the PDF using `PyPDF2`.
2. **Parallel LLM Extraction & Async Handling:** 
   - FastAPI handles the long-running Gemini requests using **Simple Polling or Server-Sent Events (SSE)** with an in-memory task dictionary to avoid HTTP timeouts.
   - FastAPI sends each page independently and in parallel to the Gemini Vision API.
   - **Prompt Instructions:** Extract text, identify fonts, colors, and text-alignment. Output **Semantic HTML with inline styles** (h1, p, table, etc.) to ensure full compatibility with the WYSIWYG editor. (Absolute positioning is reserved as a future alternative or for the Typst transition).
3. **Image Handling:** 
   - Gemini returns bounding boxes (`[y1, x1, y2, x2]`) for square/rectangular illustrations and photos.
   - FastAPI uses Python (Pillow/OpenCV) to crop these regions from the original page and embeds them into the HTML as base64 images.
   - *(Future iteration: Add traditional OpenCV contour detection for complex non-rectangular graphics).*
4. **Response:** FastAPI returns the assembled HTML strings back to the React frontend.

## 4. User Experience & Editing (Frontend)
1. **Landing Page & Upload:** Simple hero section, **Native HTML5 Drag & Drop** upload zone (accepts PDF/JPG/PNG), features, "how it works", and a PayPal donation link.
   - **Progress UI:** During processing, display descriptive steps ("Scanning...", "Identifying Layout...", "Reconstructing Typography...") based on the backend polling status, avoiding plain spinners.
2. **Preview & Edit (WYSIWYG Split-Screen):** 
   - **Split-Screen "Diff" View:** The UI will display the original scanned image on the left side, and the generated HTML output on the right side.
   - The returned HTML is rendered inside a rich-text editor like **TipTap** or **Quill** on the right side.
   - Users can visually compare the original vs. result, click into the editor, and manually fix OCR typos or adjust layout directly in the browser.
3. **Chat Assistant:** 
   - A chat box below the preview allows the user to command Gemini to make bulk edits (e.g., "translate the second paragraph to Arabic", "make all headings bold").
4. **Export (Stateless):** 
   - Users click "Download PDF" to convert the edited HTML back to PDF.
   - **MVP Approach:** Frontend-only export using `html2pdf.js` or browser `window.print()` styles (Zero server cost).
   - *(Future Alternative: Send HTML back to FastAPI to render via Playwright/Puppeteer for 100% perfect fidelity).*

## 6. Development Workflow & Security
- **Project Management:** GitHub Issues (keeps code and task tracking unified, replacing Notion).
- **API Testing & Documentation:** Rely on **FastAPI's built-in Swagger UI** (`/docs`) for testing endpoints during development. No need for external tools like Bruno for the MVP.
- **Security / Privacy (Future):** Implement **OptiLLM Proxy** locally to anonymize PII (Personal Identifiable Information) before sending sensitive user documents to cloud LLMs.
- **Documentation:** Use AsciiDoc (`README.adoc`) for the repository with Mermaid diagrams to visualize the architecture.

## 5. Roadmap & Future Features
- **Phase 1 (MVP):** English text, 5-page limit, stateless, parallel processing, basic rectangular image bounding boxes.
- **Phase 2 (Accounts, DB & Branding):** 
  - Add BetterAuth + Supabase/Convex for user accounts, history, and paid subscriptions.

- **Phase 3 (Advanced Processing & AI Routing):** 
  - Sequential page context for multi-page consistency, traditional OpenCV contour detection for complex graphics, Arabic text support, and mathematical formulas support.
  - **Hybrid Document Routing Architecture:** Classify files before processing to optimize costs and speed. Route simple text files to lightweight models and complex scanned tables to heavy Vision models.
  - **Specialized Processing Modes:** Add UI toggles for specialized prompts, such as a **"Handwriting Decipher" (Medical Use Case)** mode to transcribe and format doctor prescriptions.
  - **Typst Integration:** Transition the core rendering engine from HTML/CSS to **Typst** for high-fidelity, vector-perfect PDF generation and smaller file sizes, shifting the UI to a split-screen diff/code editor.
  - **Async Infrastructure:** Integrate **Redis + Celery** for robust background task processing and queue management as traffic scales.
  - **Alternative VLMs & OCR Engines to Evaluate:**
    - *DeepSeek-OCR / DeepSeek-OCR-2* (For complex layouts and structuring HTML tables)
    - *Qwen-VL / Qwen-2.5-32B* (Top-tier open-source vision)
    - *Mistral OCR*
    - *MinerU* (1.2B params, excellent for simple text and cross-page tables)
    - *Dolphin* (0.3B params, fast analyze-then-parse parallel processing)
    - *SmolDocling* (256M params, blazing fast, low VRAM footprint)
    - *olmOCR* (7B params, great fallback for poor quality scanned docs)
    - *Docling & LLMWhisperer* (For standard parsing and complex data extraction)
    - *PaddleOCR-VL-1.5* & *dots.ocr*
    - *Tesseract OCR + LLM correction* (`llm_aided_ocr` repo)
- **Phase 4 (Scale):** Add Cloud APIs, custom bounding box UI adjustments, API access for other developers.
