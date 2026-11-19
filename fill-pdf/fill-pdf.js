/* Fill PDF Forms (Interactive AcroForm + Click-to-Type Flat PDF Filler) - 100% Client-Side */
let currentPdfFile = null;
let pdfJsDoc = null;
let currentPageNum = 1;
let totalPages = 1;
let fieldDefinitions = [];
let fieldValues = {};
let overlaysByPage = {};

const canvas = document.getElementById('fill-preview-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;

const hexToRgb01 = (hex) => {
    const clean = (hex || '#111111').replace('#', '');
    const num = parseInt(clean, 16);
    return PDFLib.rgb(((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255);
};

const renderFillPreview = async () => {
    if (!pdfJsDoc || !canvas || !ctx) return;
    const page = await pdfJsDoc.getPage(currentPageNum);
    const viewport = page.getViewport({ scale: 1.2 });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport }).promise;

    const items = overlaysByPage[currentPageNum] || [];
    items.forEach((item) => {
        const pxSize = Math.round(item.size * 1.25);
        ctx.font = `600 ${pxSize}px Outfit, Arial, sans-serif`;
        ctx.fillStyle = item.color || '#111111';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(item.text, item.x * canvas.width, item.y * canvas.height);
    });

    const totalPlaced = Object.values(overlaysByPage).reduce((sum, arr) => sum + arr.length, 0);
    const indicator = document.getElementById('page-indicator');
    if (indicator) {
        indicator.textContent = `Page ${currentPageNum} of ${totalPages} • ${totalPlaced} placed item(s)`;
    }
};

const buildAcroFormEditor = (doc) => {
    const listEl = document.getElementById('acroform-fields-list');
    const countBadge = document.getElementById('field-count-badge');
    if (!listEl || !countBadge) return;
    listEl.innerHTML = '';
    fieldDefinitions = [];
    fieldValues = {};

    let fields = [];
    try {
        fields = doc.getForm().getFields();
    } catch (_) {
        fields = [];
    }

    countBadge.textContent = String(fields.length);

    if (fields.length === 0) {
        listEl.innerHTML = `<div style="font-size:0.84rem;color:hsl(var(--text-muted));padding:0.5rem 0;">No interactive AcroForm widgets detected in this PDF. Use <strong>Click-to-Type on Any Page</strong> below to fill any blank line or checkbox directly on the page preview.</div>`;
        return;
    }

    fields.forEach((field, idx) => {
        const name = field.getName() || `Field_${idx + 1}`;
        const ctor = field.constructor?.name || '';
        let type = 'text';
        let options = [];
        let initialVal = '';

        try {
            if (typeof field.isChecked === 'function') {
                type = 'checkbox';
                initialVal = Boolean(field.isChecked());
            } else if (typeof field.getOptions === 'function') {
                type = 'select';
                options = field.getOptions() || [];
                const sel = typeof field.getSelected === 'function' ? field.getSelected() : [];
                initialVal = Array.isArray(sel) ? (sel[0] || '') : (sel || '');
            } else if (typeof field.getText === 'function') {
                type = 'text';
                initialVal = field.getText() || '';
            } else if (ctor.includes('CheckBox')) {
                type = 'checkbox';
                initialVal = false;
            }
        } catch (_) {
            type = 'text';
            initialVal = '';
        }

        fieldDefinitions.push({ name, type, options });
        fieldValues[name] = initialVal;

        const row = document.createElement('div');
        row.style.cssText = 'display:grid;gap:0.25rem;padding:0.5rem 0.65rem;border:1px solid var(--glass-border);border-radius:8px;';

        const label = document.createElement('label');
        label.style.cssText = 'font-size:0.8rem;font-weight:600;color:hsl(var(--text-main));display:flex;justify-content:space-between;align-items:center;gap:0.5rem;';
        label.textContent = name;

        if (type === 'checkbox') {
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = Boolean(initialVal);
            cb.dataset.fieldName = name;
            cb.addEventListener('change', () => {
                fieldValues[name] = cb.checked;
            });
            label.appendChild(cb);
            row.appendChild(label);
        } else if (type === 'select' && options.length > 0) {
            row.appendChild(label);
            const sel = document.createElement('select');
            sel.dataset.fieldName = name;
            sel.style.cssText = 'width:100%;padding:0.42rem 0.55rem;border-radius:6px;border:1px solid var(--glass-border);background:hsl(var(--bg-body));color:hsl(var(--text-main));font-size:0.85rem;';
            const emptyOpt = document.createElement('option');
            emptyOpt.value = '';
            emptyOpt.textContent = '— Select —';
            sel.appendChild(emptyOpt);
            options.forEach((opt) => {
                const o = document.createElement('option');
                o.value = opt;
                o.textContent = opt;
                if (opt === initialVal) o.selected = true;
                sel.appendChild(o);
            });
            sel.addEventListener('change', () => {
                fieldValues[name] = sel.value;
            });
            row.appendChild(sel);
        } else {
            row.appendChild(label);
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.value = initialVal;
            inp.placeholder = `Enter ${name}...`;
            inp.dataset.fieldName = name;
            inp.style.cssText = 'width:100%;padding:0.42rem 0.55rem;border-radius:6px;border:1px solid var(--glass-border);background:hsl(var(--bg-body));color:hsl(var(--text-main));font-size:0.85rem;';
            inp.addEventListener('input', () => {
                fieldValues[name] = inp.value;
            });
            row.appendChild(inp);
        }

        listEl.appendChild(row);
    });
};

const handlePdfSelected = async (files) => {
    const file = files[0];
    if (!file || (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf')) {
        showToast('Please select a valid PDF file.', 'error');
        return;
    }
    try {
        currentPdfFile = file;
        overlaysByPage = {};
        const buf = await readFileAsArrayBuffer(file);
        const doc = await PDFLib.PDFDocument.load(buf.slice(0), { ignoreEncryption: true });
        buildAcroFormEditor(doc);

        pdfJsDoc = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
        totalPages = pdfJsDoc.numPages;
        currentPageNum = 1;

        document.getElementById('file-name').textContent = file.name;
        document.getElementById('file-meta').textContent = `${formatBytes(file.size)} • ${totalPages} page(s) • ${fieldDefinitions.length} form field(s)`;
        document.getElementById('drop-zone').style.display = 'none';
        document.getElementById('fill-stage').style.display = 'block';
        await renderFillPreview();
    } catch (err) {
        console.error(err);
        showToast('Could not load PDF: ' + err.message, 'error');
    }
};

window.setQuickStamp = (val) => {
    const input = document.getElementById('overlay-text-input');
    if (input) {
        input.value = val;
        showToast(`Ready to place "${val}" — click anywhere on the PDF preview.`, 'info');
    }
};

window.prevPage = async () => {
    if (currentPageNum > 1) {
        currentPageNum--;
        await renderFillPreview();
    }
};

window.nextPage = async () => {
    if (currentPageNum < totalPages) {
        currentPageNum++;
        await renderFillPreview();
    }
};

window.undoOverlayEntry = async () => {
    const arr = overlaysByPage[currentPageNum];
    if (arr && arr.length > 0) {
        arr.pop();
        await renderFillPreview();
    }
};

window.resetFillTool = () => {
    currentPdfFile = null;
    pdfJsDoc = null;
    fieldDefinitions = [];
    fieldValues = {};
    overlaysByPage = {};
    document.getElementById('file-input').value = '';
    document.getElementById('drop-zone').style.display = 'flex';
    document.getElementById('fill-stage').style.display = 'none';
};

const renderUnicodeStampPng = async (text, fontSizePt, colorHex) => {
    const scale = 3;
    const c = document.createElement('canvas');
    const cctx = c.getContext('2d');
    const px = Math.ceil(fontSizePt * scale);
    cctx.font = `600 ${px}px Outfit, Arial, sans-serif`;
    const m = cctx.measureText(text);
    c.width = Math.max(12, Math.ceil(m.width + px * 0.4));
    c.height = Math.max(12, Math.ceil(px * 1.4));
    cctx.font = `600 ${px}px Outfit, Arial, sans-serif`;
    cctx.fillStyle = colorHex || '#111111';
    cctx.textBaseline = 'alphabetic';
    cctx.fillText(text, 2, px);
    const bytes = await fetch(c.toDataURL('image/png')).then((r) => r.arrayBuffer());
    return { bytes, widthPt: c.width / scale, heightPt: c.height / scale, baselineOffsetPt: (c.height - px) / scale };
};

document.addEventListener('DOMContentLoaded', () => {
    initDropZone('drop-zone', 'file-input', handlePdfSelected);

    document.getElementById('clear-fields-btn')?.addEventListener('click', () => {
        fieldDefinitions.forEach((f) => {
            fieldValues[f.name] = f.type === 'checkbox' ? false : '';
        });
        document.querySelectorAll('#acroform-fields-list input, #acroform-fields-list select').forEach((el) => {
            if (el.type === 'checkbox') el.checked = false;
            else el.value = '';
        });
        showToast('Cleared all form field inputs.', 'info');
    });

    if (canvas) {
        canvas.addEventListener('click', async (e) => {
            const textInput = document.getElementById('overlay-text-input');
            const text = textInput ? textInput.value.trim() : '';
            if (!text) {
                showToast('Type text or pick a quick stamp on the left before clicking the page.', 'info');
                textInput?.focus();
                return;
            }
            const rect = canvas.getBoundingClientRect();
            const x = ((e.clientX - rect.left) * (canvas.width / rect.width)) / canvas.width;
            const y = ((e.clientY - rect.top) * (canvas.height / rect.height)) / canvas.height;
            const size = parseInt(document.getElementById('overlay-font-size')?.value || '12', 10);
            const color = document.getElementById('overlay-font-color')?.value || '#111111';

            overlaysByPage[currentPageNum] = overlaysByPage[currentPageNum] || [];
            overlaysByPage[currentPageNum].push({ text, x, y, size, color });
            await renderFillPreview();
        });
    }

    document.getElementById('apply-fill-btn')?.addEventListener('click', async () => {
        if (!currentPdfFile) return;
        const btn = document.getElementById('apply-fill-btn');
        btn.disabled = true;
        btn.textContent = 'Saving Filled PDF...';

        try {
            const buf = await readFileAsArrayBuffer(currentPdfFile);
            const pdfDoc = await PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
            const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);

            // 1. Apply AcroForm values
            if (fieldDefinitions.length > 0) {
                const form = pdfDoc.getForm();
                fieldDefinitions.forEach((def) => {
                    const val = fieldValues[def.name];
                    try {
                        const field = form.getField(def.name);
                        if (def.type === 'checkbox') {
                            if (val && typeof field.check === 'function') field.check();
                            else if (!val && typeof field.uncheck === 'function') field.uncheck();
                        } else if (def.type === 'select') {
                            if (val && typeof field.select === 'function') field.select(val);
                        } else if (typeof field.setText === 'function') {
                            field.setText(String(val ?? ''));
                        }
                    } catch (fieldErr) {
                        console.warn('Skipped field', def.name, fieldErr);
                    }
                });
            }

            // 2. Apply Click-to-Type overlay entries across pages
            const pages = pdfDoc.getPages();
            for (const [pageStr, items] of Object.entries(overlaysByPage)) {
                const pIdx = parseInt(pageStr, 10) - 1;
                if (pIdx < 0 || pIdx >= pages.length || !items || items.length === 0) continue;
                const page = pages[pIdx];
                const { width, height } = page.getSize();

                for (const item of items) {
                    const pdfX = item.x * width;
                    const pdfY = height - item.y * height;
                    const isPureAscii = /^[\x20-\x7E]+$/.test(item.text);

                    if (isPureAscii) {
                        page.drawText(item.text, {
                            x: pdfX,
                            y: pdfY,
                            size: item.size,
                            font,
                            color: hexToRgb01(item.color),
                        });
                    } else {
                        const stamp = await renderUnicodeStampPng(item.text, item.size, item.color);
                        const pngImg = await pdfDoc.embedPng(stamp.bytes);
                        page.drawImage(pngImg, {
                            x: pdfX,
                            y: pdfY - stamp.baselineOffsetPt,
                            width: stamp.widthPt,
                            height: stamp.heightPt,
                        });
                    }
                }
            }

            // 3. Optionally flatten form fields
            const shouldFlatten = document.getElementById('flatten-on-save')?.checked;
            if (shouldFlatten) {
                try {
                    pdfDoc.getForm().flatten();
                } catch (_) {
                    // ignore if no form fields
                }
            }

            const outBytes = await pdfDoc.save();
            const outName = currentPdfFile.name.replace(/\.pdf$/i, '') + '-filled.pdf';
            downloadFile(new Blob([outBytes], { type: 'application/pdf' }), outName);
            showToast('Filled PDF saved and downloaded!', 'success');
        } catch (err) {
            console.error(err);
            showToast('Failed to save filled PDF: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Save & Download Filled PDF';
        }
    });
});
