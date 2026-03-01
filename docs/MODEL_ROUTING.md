# Model Routing and Alternatives

## Primary strategy

1. Run lightweight OCR first for cheap/simple pages.
2. Escalate to multimodal model only for difficult pages.
3. Validate text with correction pass.
4. Render page-level and merge.

## Route rules (v1)

- `simple_text_score >= 0.8` -> Tesseract/OCRmyPDF route
- `multi_column OR table_detected OR dense_layout` -> Gemini/DeepSeek route
- `handwriting_detected` -> handwriting-specialized route
- `math_detected` -> math extraction route
- `arabic_detected` -> arabic-capable OCR route

## Primary + alternatives

- Primary OCR/VLM: Gemini
- Fallbacks: DeepSeek-OCR-2, Qwen-VL, Mistral OCR, PaddleOCR-VL
- Math specialization: Mathpix (optional paid fallback)
- Local-first option: local_ai_ocr and open-source VLM

## Cost controls

- Process per page
- Cache repeated pages by hash
- Token/page credit budgeting
- Retry with cheaper model before expensive fallback

## Quality controls

- Block confidence thresholds
- Named-entity and number consistency checks
- Visual similarity checks by source-vs-output snapshot diff
