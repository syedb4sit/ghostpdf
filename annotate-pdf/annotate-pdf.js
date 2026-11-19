/* Annotate PDF Online (Highlight, Freehand Pen, Box, Arrow, Text Note) - 100% Client-Side */
let currentPdfFile = null;
let pdfJsDoc = null;
let currentPageNum = 1;
let totalPages = 1;
let currentMode = 'highlight';
let annotationsByPage = {};
let isDrawing = false;
let dragStart = null;
let dragCurrent = null;
let currentPenPoints = [];

const canvas = document.getElementById('annotate-preview-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;

const MODE_HINTS = {
    highlight: 'Click and drag across text on the page below to draw a translucent highlight box.',
    pen: 'Click and drag to draw freehand ink strokes anywhere on the page.',
    rect: 'Click and drag to draw a colored outline box around clauses or figures.',
    arrow: 'Click and drag from start to tip to draw a directional pointer arrow.',
    note: 'Type your note text above, then click anywhere on the page to place a callout badge.',
};

const hexToRgb01 = (hex) => {
    const clean = (hex || '#dc143c').replace('#', '');
    const num = parseInt(clean, 16);
    return PDFLib.rgb(((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255);
};

window.setAnnotMode = (mode) => {
    currentMode = mode;
    document.querySelectorAll('.annot-mode-btn').forEach((btn) => {
        if (btn.dataset.mode === mode) {
            btn.classList.remove('btn-secondary');
            btn.classList.add('btn-primary');
        } else {
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-secondary');
        }
    });
    const colorSel = document.getElementById('annot-color');
    if (colorSel && mode === 'highlight' && colorSel.value === '#111111') {
        colorSel.value = '#facc15';
    } else if (colorSel && mode !== 'highlight' && colorSel.value === '#facc15' && mode === 'note') {
        colorSel.value = '#dc143c';
    }
    const hint = document.getElementById('annot-hint');
    if (hint) hint.textContent = MODE_HINTS[mode] || '';
};

const drawArrowCanvas = (c, x1, y1, x2, y2, color, lineWidth) => {
    const headLen = Math.max(10, lineWidth * 3.5);
    const angle = Math.atan2(y2 - y1, x2 - x1);
    c.save();
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = lineWidth;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();

    c.beginPath();
    c.moveTo(x2, y2);
    c.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
    c.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
    c.closePath();
    c.fill();
    c.restore();
};

const drawSingleAnnotationOnCanvas = (a) => {
    if (!ctx || !canvas) return;
    ctx.save();
    if (a.type === 'highlight') {
        ctx.fillStyle = a.color;
        ctx.globalAlpha = 0.35;
        ctx.fillRect(a.x * canvas.width, a.y * canvas.height, a.w * canvas.width, a.h * canvas.height);
    } else if (a.type === 'rect') {
        ctx.strokeStyle = a.color;
        ctx.lineWidth = a.size * 1.1;
        ctx.strokeRect(a.x * canvas.width, a.y * canvas.height, a.w * canvas.width, a.h * canvas.height);
    } else if (a.type === 'arrow') {
        drawArrowCanvas(
            ctx,
            a.x1 * canvas.width,
            a.y1 * canvas.height,
            a.x2 * canvas.width,
            a.y2 * canvas.height,
            a.color,
            a.size * 1.15
        );
    } else if (a.type === 'pen' && a.points && a.points.length > 1) {
        ctx.strokeStyle = a.color;
        ctx.lineWidth = a.size * 1.1;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(a.points[0].x * canvas.width, a.points[0].y * canvas.height);
        for (let i = 1; i < a.points.length; i++) {
            ctx.lineTo(a.points[i].x * canvas.width, a.points[i].y * canvas.height);
        }
        ctx.stroke();
    } else if (a.type === 'note') {
        const fontPx = Math.round((a.size === 2 ? 11 : a.size === 5 ? 16 : 13) * 1.2);
        ctx.font = `600 ${fontPx}px Outfit, Arial, sans-serif`;
        const padX = 8;
        const padY = 5;
        const textW = ctx.measureText(a.text).width;
        const boxX = a.x * canvas.width;
        const boxY = a.y * canvas.height - fontPx;
        const boxW = textW + padX * 2;
        const boxH = fontPx + padY * 2;
        ctx.fillStyle = '#fffbeb';
        ctx.strokeStyle = a.color;
        ctx.lineWidth = 1.75;
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.strokeRect(boxX, boxY, boxW, boxH);
        ctx.fillStyle = a.color === '#facc15' ? '#111111' : a.color;
        ctx.textBaseline = 'top';
        ctx.fillText(a.text, boxX + padX, boxY + padY);
    }
    ctx.restore();
};

const renderAnnotatePreview = async () => {
    if (!pdfJsDoc || !canvas || !ctx) return;
    const page = await pdfJsDoc.getPage(currentPageNum);
    const viewport = page.getViewport({ scale: 1.2 });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport }).promise;

    const items = annotationsByPage[currentPageNum] || [];
    items.forEach(drawSingleAnnotationOnCanvas);

    // Active drag preview
    const color = document.getElementById('annot-color')?.value || '#facc15';
    const size = parseInt(document.getElementById('annot-size')?.value || '3', 10);
    if (isDrawing && dragStart && dragCurrent) {
        if (currentMode === 'highlight' || currentMode === 'rect') {
            const x = Math.min(dragStart.x, dragCurrent.x) / canvas.width;
            const y = Math.min(dragStart.y, dragCurrent.y) / canvas.height;
            const w = Math.abs(dragCurrent.x - dragStart.x) / canvas.width;
            const h = Math.abs(dragCurrent.y - dragStart.y) / canvas.height;
            drawSingleAnnotationOnCanvas({ type: currentMode, x, y, w, h, color, size });
        } else if (currentMode === 'arrow') {
            drawSingleAnnotationOnCanvas({
                type: 'arrow',
                x1: dragStart.x / canvas.width,
                y1: dragStart.y / canvas.height,
                x2: dragCurrent.x / canvas.width,
                y2: dragCurrent.y / canvas.height,
                color,
                size,
            });
        } else if (currentMode === 'pen' && currentPenPoints.length > 1) {
            drawSingleAnnotationOnCanvas({
                type: 'pen',
                points: currentPenPoints.map((p) => ({ x: p.x / canvas.width, y: p.y / canvas.height })),
                color,
                size,
            });
        }
    }

    const totalCount = Object.values(annotationsByPage).reduce((sum, arr) => sum + arr.length, 0);
    const label = document.getElementById('page-indicator');
    if (label) {
        label.textContent = `Page ${currentPageNum} of ${totalPages} • ${totalCount} annotation(s)`;
    }
};

const handlePdfSelected = async (files) => {
    const file = files[0];
    if (!file || (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf')) {
        showToast('Please select a valid PDF file.', 'error');
        return;
    }
    try {
        currentPdfFile = file;
        annotationsByPage = {};
        const buf = await readFileAsArrayBuffer(file);
        pdfJsDoc = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
        totalPages = pdfJsDoc.numPages;
        currentPageNum = 1;

        document.getElementById('file-name').textContent = file.name;
        document.getElementById('file-meta').textContent = `${formatBytes(file.size)} • ${totalPages} page(s)`;
        document.getElementById('drop-zone').style.display = 'none';
        document.getElementById('annotate-stage').style.display = 'block';
        await renderAnnotatePreview();
    } catch (err) {
        console.error(err);
        showToast('Could not read PDF: ' + err.message, 'error');
    }
};

window.prevPage = async () => {
    if (currentPageNum > 1) {
        currentPageNum--;
        await renderAnnotatePreview();
    }
};

window.nextPage = async () => {
    if (currentPageNum < totalPages) {
        currentPageNum++;
        await renderAnnotatePreview();
    }
};

window.undoAnnotation = async () => {
    const arr = annotationsByPage[currentPageNum];
    if (arr && arr.length > 0) {
        arr.pop();
        await renderAnnotatePreview();
    }
};

window.clearPageAnnotations = async () => {
    annotationsByPage[currentPageNum] = [];
    await renderAnnotatePreview();
    showToast(`Cleared annotations on page ${currentPageNum}.`, 'info');
};

window.resetAnnotateTool = () => {
    currentPdfFile = null;
    pdfJsDoc = null;
    annotationsByPage = {};
    document.getElementById('file-input').value = '';
    document.getElementById('drop-zone').style.display = 'flex';
    document.getElementById('annotate-stage').style.display = 'none';
};

const renderNoteCalloutPng = async (text, fontPt, borderColor) => {
    const scale = 3;
    const c = document.createElement('canvas');
    const cctx = c.getContext('2d');
    const px = Math.ceil(fontPt * scale);
    const padX = 7 * scale;
    const padY = 4 * scale;
    cctx.font = `600 ${px}px Outfit, Arial, sans-serif`;
    const textW = cctx.measureText(text).width;
    c.width = Math.ceil(textW + padX * 2 + 4);
    c.height = Math.ceil(px + padY * 2 + 4);

    cctx.fillStyle = '#fffbeb';
    cctx.strokeStyle = borderColor;
    cctx.lineWidth = 1.6 * scale;
    cctx.fillRect(2, 2, c.width - 4, c.height - 4);
    cctx.strokeRect(2, 2, c.width - 4, c.height - 4);
    cctx.font = `600 ${px}px Outfit, Arial, sans-serif`;
    cctx.fillStyle = borderColor === '#facc15' ? '#111111' : borderColor;
    cctx.textBaseline = 'top';
    cctx.fillText(text, 2 + padX, 2 + padY);
    const bytes = await fetch(c.toDataURL('image/png')).then((r) => r.arrayBuffer());
    return { bytes, widthPt: c.width / scale, heightPt: c.height / scale };
};

document.addEventListener('DOMContentLoaded', () => {
    initDropZone('drop-zone', 'file-input', handlePdfSelected);

    if (canvas) {
        const getCoords = (e) => {
            const rect = canvas.getBoundingClientRect();
            return {
                x: (e.clientX - rect.left) * (canvas.width / rect.width),
                y: (e.clientY - rect.top) * (canvas.height / rect.height),
            };
        };

        canvas.addEventListener('mousedown', async (e) => {
            const pos = getCoords(e);
            const color = document.getElementById('annot-color')?.value || '#facc15';
            const size = parseInt(document.getElementById('annot-size')?.value || '3', 10);

            if (currentMode === 'note') {
                const noteInput = document.getElementById('annot-note-text');
                const text = (noteInput?.value || '').trim();
                if (!text) {
                    showToast('Enter note text in the toolbar first.', 'info');
                    noteInput?.focus();
                    return;
                }
                annotationsByPage[currentPageNum] = annotationsByPage[currentPageNum] || [];
                annotationsByPage[currentPageNum].push({
                    type: 'note',
                    text,
                    x: pos.x / canvas.width,
                    y: pos.y / canvas.height,
                    color,
                    size,
                });
                await renderAnnotatePreview();
                return;
            }

            isDrawing = true;
            dragStart = pos;
            dragCurrent = pos;
            if (currentMode === 'pen') {
                currentPenPoints = [pos];
            }
        });

        canvas.addEventListener('mousemove', (e) => {
            if (!isDrawing) return;
            dragCurrent = getCoords(e);
            if (currentMode === 'pen') {
                currentPenPoints.push(dragCurrent);
            }
            renderAnnotatePreview();
        });

        window.addEventListener('mouseup', () => {
            if (!isDrawing || !dragStart || !dragCurrent) return;
            const color = document.getElementById('annot-color')?.value || '#facc15';
            const size = parseInt(document.getElementById('annot-size')?.value || '3', 10);
            annotationsByPage[currentPageNum] = annotationsByPage[currentPageNum] || [];

            if (currentMode === 'highlight' || currentMode === 'rect') {
                const x = Math.min(dragStart.x, dragCurrent.x) / canvas.width;
                const y = Math.min(dragStart.y, dragCurrent.y) / canvas.height;
                const w = Math.abs(dragCurrent.x - dragStart.x) / canvas.width;
                const h = Math.abs(dragCurrent.y - dragStart.y) / canvas.height;
                if (w > 0.008 && h > 0.008) {
                    annotationsByPage[currentPageNum].push({ type: currentMode, x, y, w, h, color, size });
                }
            } else if (currentMode === 'arrow') {
                const dist = Math.hypot(dragCurrent.x - dragStart.x, dragCurrent.y - dragStart.y);
                if (dist > 8) {
                    annotationsByPage[currentPageNum].push({
                        type: 'arrow',
                        x1: dragStart.x / canvas.width,
                        y1: dragStart.y / canvas.height,
                        x2: dragCurrent.x / canvas.width,
                        y2: dragCurrent.y / canvas.height,
                        color,
                        size,
                    });
                }
            } else if (currentMode === 'pen' && currentPenPoints.length > 1) {
                annotationsByPage[currentPageNum].push({
                    type: 'pen',
                    points: currentPenPoints.map((p) => ({ x: p.x / canvas.width, y: p.y / canvas.height })),
                    color,
                    size,
                });
            }

            isDrawing = false;
            dragStart = null;
            dragCurrent = null;
            currentPenPoints = [];
            renderAnnotatePreview();
        });
    }

    document.getElementById('apply-annotate-btn')?.addEventListener('click', async () => {
        if (!currentPdfFile) return;
        const totalCount = Object.values(annotationsByPage).reduce((sum, arr) => sum + arr.length, 0);
        if (totalCount === 0) {
            showToast('Add at least one highlight, drawing, shape, or note before saving.', 'error');
            return;
        }

        const btn = document.getElementById('apply-annotate-btn');
        btn.disabled = true;
        btn.textContent = 'Saving Annotated PDF...';

        try {
            const buf = await readFileAsArrayBuffer(currentPdfFile);
            const pdfDoc = await PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
            const pages = pdfDoc.getPages();

            for (const [pageStr, list] of Object.entries(annotationsByPage)) {
                const pIdx = parseInt(pageStr, 10) - 1;
                if (pIdx < 0 || pIdx >= pages.length || !list || list.length === 0) continue;
                const page = pages[pIdx];
                const { width, height } = page.getSize();

                for (const a of list) {
                    const rgb = hexToRgb01(a.color);
                    if (a.type === 'highlight') {
                        const rectW = a.w * width;
                        const rectH = a.h * height;
                        const rectX = a.x * width;
                        const rectY = height - (a.y + a.h) * height;
                        page.drawRectangle({
                            x: rectX,
                            y: rectY,
                            width: rectW,
                            height: rectH,
                            color: rgb,
                            opacity: 0.35,
                        });
                    } else if (a.type === 'rect') {
                        const rectW = a.w * width;
                        const rectH = a.h * height;
                        const rectX = a.x * width;
                        const rectY = height - (a.y + a.h) * height;
                        page.drawRectangle({
                            x: rectX,
                            y: rectY,
                            width: rectW,
                            height: rectH,
                            borderColor: rgb,
                            borderWidth: a.size,
                        });
                    } else if (a.type === 'arrow') {
                        const x1 = a.x1 * width;
                        const y1 = height - a.y1 * height;
                        const x2 = a.x2 * width;
                        const y2 = height - a.y2 * height;
                        page.drawLine({
                            start: { x: x1, y: y1 },
                            end: { x: x2, y: y2 },
                            thickness: a.size,
                            color: rgb,
                        });
                        const angle = Math.atan2(y2 - y1, x2 - x1);
                        const headLen = Math.max(8, a.size * 3.2);
                        page.drawLine({
                            start: { x: x2, y: y2 },
                            end: {
                                x: x2 - headLen * Math.cos(angle - Math.PI / 6),
                                y: y2 - headLen * Math.sin(angle - Math.PI / 6),
                            },
                            thickness: a.size,
                            color: rgb,
                        });
                        page.drawLine({
                            start: { x: x2, y: y2 },
                            end: {
                                x: x2 - headLen * Math.cos(angle + Math.PI / 6),
                                y: y2 - headLen * Math.sin(angle + Math.PI / 6),
                            },
                            thickness: a.size,
                            color: rgb,
                        });
                    } else if (a.type === 'pen' && a.points && a.points.length > 1) {
                        for (let i = 1; i < a.points.length; i++) {
                            const p0 = a.points[i - 1];
                            const p1 = a.points[i];
                            page.drawLine({
                                start: { x: p0.x * width, y: height - p0.y * height },
                                end: { x: p1.x * width, y: height - p1.y * height },
                                thickness: a.size,
                                color: rgb,
                            });
                        }
                    } else if (a.type === 'note') {
                        const fontPt = a.size === 2 ? 11 : a.size === 5 ? 16 : 13;
                        const stamp = await renderNoteCalloutPng(a.text, fontPt, a.color);
                        const img = await pdfDoc.embedPng(stamp.bytes);
                        const pdfX = a.x * width;
                        const pdfY = height - a.y * height;
                        page.drawImage(img, {
                            x: pdfX,
                            y: Math.max(4, pdfY - stamp.heightPt * 0.25),
                            width: stamp.widthPt,
                            height: stamp.heightPt,
                        });
                    }
                }
            }

            const outBytes = await pdfDoc.save();
            const outName = currentPdfFile.name.replace(/\.pdf$/i, '') + '-annotated.pdf';
            downloadFile(new Blob([outBytes], { type: 'application/pdf' }), outName);
            showToast('Annotated PDF saved and downloaded!', 'success');
        } catch (err) {
            console.error(err);
            showToast('Failed to save annotated PDF: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Save & Download Annotated PDF';
        }
    });
});
