# GhostPDF

**Free, 100% client-side PDF toolkit — 28 browser-based tools with zero file uploads, no watermarks, and no registration.**

Live site: [ghostpdf.tech](https://ghostpdf.tech/) · Guides: [ghostpdf.tech/blog/](https://ghostpdf.tech/blog/)

---

## Why GhostPDF?

- **100% Local Processing:** Every tool runs directly in your browser's memory using JavaScript and WebAssembly. Your PDFs, Word documents, spreadsheets, and images never leave your device.
- **No Accounts or Limits:** No sign-ups, no daily file caps, and no forced watermarks.
- **Static & Lightweight:** Pure HTML, CSS, and modular vanilla JavaScript with zero backend servers or databases required.

---

## 28 Included Tools

### Organize, Edit & Sign
- **Merge PDF** (`/merge-pdf/`) — Combine multiple PDFs in custom drag-and-drop order.
- **Split PDF** (`/split-pdf/`) — Extract specific pages or split documents into individual files.
- **Rotate PDF** (`/rotate-pdf/`) — Permanently rotate individual or all pages.
- **Organize & Edit PDF** (`/edit-pdf/`) — Reorder, crop, resize (A4 / US Letter), or delete pages.
- **Fill PDF Forms** (`/fill-pdf/`) — Fill out interactive AcroForm fields or type text and checkmarks onto flat PDFs.
- **Annotate PDF** (`/annotate-pdf/`) — Highlight passages, draw freehand ink, place sticky notes, boxes, and arrows.
- **Crop PDF** (`/crop-pdf/`) — Trim white margins and adjust crop boxes visually.
- **Pages per Sheet (N-up)** (`/nup-pdf/`) — Impose 2, 4, or 6 pages onto one sheet.
- **Watermark PDF** (`/watermark-pdf/`) — Add custom text or transparent logo stamps.
- **Add Page Numbers** (`/page-numbers-pdf/`) — Insert page numbering and Bates-style stamps.
- **Sign PDF** (`/sign-pdf/`) — Draw, type, or upload PNG electronic signatures.

### Convert & Extract
- **Image to PDF** (`/image-to-pdf/`) — Convert JPG and PNG images into a single PDF.
- **PDF to Image** (`/pdf-to-image/`) — Export PDF pages as high-resolution PNG or JPG images.
- **Extract Images** (`/extract-images/`) — Extract original embedded images from PDFs into a ZIP.
- **Word to PDF** (`/word-to-pdf/`) — Convert `.docx` documents to PDF locally in the browser.
- **PDF to Word** (`/pdf-to-word/`) — Convert text-based PDFs into editable `.docx` files.
- **Excel / CSV to PDF** (`/excel-to-pdf/`) — Render `.xlsx` spreadsheets and `.csv` tables to PDF.
- **HTML / MD to PDF** (`/html-to-pdf/`) — Turn HTML snippets or Markdown notes into A4 PDFs.
- **PDF to Markdown** (`/pdf-to-markdown/`) — Extract clean Markdown for LLMs, Obsidian, and Notion.
- **PDF OCR** (`/pdf-ocr/`) — Run local WebAssembly OCR on scanned PDFs and images.

### Security, Comparison & Optimization
- **Redact PDF** (`/redact-pdf/`) — Permanently burn out confidential text layers at the pixel level.
- **Lock PDF** (`/lock-pdf/`) — Password-protect and encrypt PDF documents.
- **Unlock PDF** (`/unlock-pdf/`) — Remove password protection from PDFs you own.
- **Flatten PDF** (`/flatten-pdf/`) — Lock form fields, annotations, and layers against edits.
- **PDF Metadata** (`/pdf-metadata/`) — Inspect, edit, or strip hidden PDF metadata tags.
- **Compare PDF** (`/compare-pdf/`) — Visually diff and compare text changes between two PDFs.
- **Compress PDF** (`/compress-pdf/`) — Reduce PDF file size locally for email and web portals.
- **Grayscale / Invert PDF** (`/grayscale-pdf/`) — Convert PDFs to grayscale or high-contrast dark mode.

---

## Core Client-Side Libraries

- [pdf-lib](https://pdf-lib.js.org/) — PDF creation, merging, splitting, metadata, and page manipulation
- [PDF.js](https://mozilla.github.io/pdf.js/) — Client-side PDF rendering and text extraction
- [jsPDF](https://parall.ax/products/jspdf) — Canvas-to-PDF and layout generation
- [Tesseract.js](https://tesseract.projectnaptha.com/) — WebAssembly OCR in the browser
- [Mammoth](https://github.com/mwilliamson/mammoth.js) & [SheetJS](https://sheetjs.com/) — Local `.docx`, `.xlsx`, and `.csv` parsing
- [marked](https://marked.js.org/) — Markdown-to-HTML rendering

---

## Running Locally

Because GhostPDF is 100% static, serve the repository root with any HTTP server:

```bash
npx serve .
# or
python -m http.server 8080
```

Then open `http://localhost:8080`.

---

## License

Released under the [MIT License](LICENSE).
