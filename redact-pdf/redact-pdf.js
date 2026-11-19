/* Redact PDF - 100% Permanent Client-Side Pixel Redaction */
let currentPdfFile = null;
let pdfJsDoc = null;
let currentPageNum = 1;
let totalPages = 1;
let redactionsByPage = {};
let dragStart = null;
let dragCurrent = null;

const canvas = document.getElementById('redact-preview-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;

const renderRedactPreview = async () => {
    if (!pdfJsDoc || !canvas || !ctx) return;
    const page = await pdfJsDoc.getPage(currentPageNum);
    const viewport = page.getViewport({ scale: 1.15 });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport }).promise;

    const boxes = redactionsByPage[currentPageNum] || [];
    ctx.fillStyle = '#000000';
    boxes.forEach((b) => {
        ctx.fillRect(b.x * canvas.width, b.y * canvas.height, b.w * canvas.width, b.h * canvas.height);
    });

    if (dragStart && dragCurrent) {
        const x = Math.min(dragStart.x, dragCurrent.x);
        const y = Math.min(dragStart.y, dragCurrent.y);
        const w = Math.abs(dragCurrent.x - dragStart.x);
        const h = Math.abs(dragCurrent.y - dragStart.y);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#ef233c';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
    }

    const totalBoxes = Object.values(redactionsByPage).reduce((sum, arr) => sum + arr.length, 0);
    const label = document.getElementById('page-indicator');
    if (label) label.textContent = `Page ${currentPageNum} of ${totalPages} • ${totalBoxes} redaction(s)`;
};

const handlePdfSelected = async (files) => {
    const file = files[0];
    if (!file || (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf')) {
        showToast('Please select a valid PDF file.', 'error');
        return;
    }
    try {
        currentPdfFile = file;
        redactionsByPage = {};
        const buf = await readFileAsArrayBuffer(file);
        pdfJsDoc = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
        totalPages = pdfJsDoc.numPages;
        currentPageNum = 1;

        document.getElementById('file-name').textContent = file.name;
        document.getElementById('file-meta').textContent = `${formatBytes(file.size)} • ${totalPages} page(s)`;
        document.getElementById('drop-zone').style.display = 'none';
        document.getElementById('redact-stage').style.display = 'block';
        await renderRedactPreview();
    } catch (err) {
        console.error(err);
        showToast('Could not read PDF: ' + err.message, 'error');
    }
};

window.prevPage = async () => { if (currentPageNum > 1) { currentPageNum--; await renderRedactPreview(); } };
window.nextPage = async () => { if (currentPageNum < totalPages) { currentPageNum++; await renderRedactPreview(); } };
window.undoRedaction = async () => {
    const arr = redactionsByPage[currentPageNum];
    if (arr && arr.length > 0) { arr.pop(); await renderRedactPreview(); }
};
window.resetRedactTool = () => {
    currentPdfFile = null;
    pdfJsDoc = null;
    redactionsByPage = {};
    document.getElementById('file-input').value = '';
    document.getElementById('drop-zone').style.display = 'flex';
    document.getElementById('redact-stage').style.display = 'none';
};

document.addEventListener('DOMContentLoaded', () => {
    initDropZone('drop-zone', 'file-input', handlePdfSelected);

    if (canvas) {
        const getCoords = (e) => {
            const rect = canvas.getBoundingClientRect();
            return {
                x: (e.clientX - rect.left) * (canvas.width / rect.width),
                y: (e.clientY - rect.top) * (canvas.height / rect.height)
            };
        };

        canvas.addEventListener('mousedown', (e) => {
            dragStart = getCoords(e);
            dragCurrent = dragStart;
        });
        canvas.addEventListener('mousemove', (e) => {
            if (!dragStart) return;
            dragCurrent = getCoords(e);
            renderRedactPreview();
        });
        window.addEventListener('mouseup', () => {
            if (!dragStart || !dragCurrent) return;
            const x = Math.min(dragStart.x, dragCurrent.x) / canvas.width;
            const y = Math.min(dragStart.y, dragCurrent.y) / canvas.height;
            const w = Math.abs(dragCurrent.x - dragStart.x) / canvas.width;
            const h = Math.abs(dragCurrent.y - dragStart.y) / canvas.height;
            dragStart = null;
            dragCurrent = null;
            if (w > 0.01 && h > 0.01) {
                redactionsByPage[currentPageNum] = redactionsByPage[currentPageNum] || [];
                redactionsByPage[currentPageNum].push({ x, y, w, h });
            }
            renderRedactPreview();
        });
    }

    document.getElementById('apply-redact-btn')?.addEventListener('click', async () => {
        if (!pdfJsDoc || !currentPdfFile) return;
        const totalBoxes = Object.values(redactionsByPage).reduce((sum, arr) => sum + arr.length, 0);
        if (totalBoxes === 0) {
            showToast('Drag over sensitive areas on the page to add redaction boxes first.', 'error');
            return;
        }
        const btn = document.getElementById('apply-redact-btn');
        btn.disabled = true;
        btn.textContent = 'Permanently Redacting...';
        try {
            const outPdf = await PDFLib.PDFDocument.create();
            for (let i = 1; i <= totalPages; i++) {
                const page = await pdfJsDoc.getPage(i);
                const viewport = page.getViewport({ scale: 2.0 });
                const off = document.createElement('canvas');
                off.width = viewport.width;
                off.height = viewport.height;
                const offCtx = off.getContext('2d');
                await page.render({ canvasContext: offCtx, viewport }).promise;

                const boxes = redactionsByPage[i] || [];
                offCtx.fillStyle = '#000000';
                boxes.forEach((b) => {
                    offCtx.fillRect(b.x * off.width, b.y * off.height, b.w * off.width, b.h * off.height);
                });

                const pngUrl = off.toDataURL('image/png');
                const pngBytes = await fetch(pngUrl).then((r) => r.arrayBuffer());
                const img = await outPdf.embedPng(pngBytes);
                const origVp = page.getViewport({ scale: 1.0 });
                const outPage = outPdf.addPage([origVp.width, origVp.height]);
                outPage.drawImage(img, { x: 0, y: 0, width: origVp.width, height: origVp.height });
            }

            const outBytes = await outPdf.save();
            const outName = currentPdfFile.name.replace(/\.pdf$/i, '') + '-redacted.pdf';
            downloadFile(new Blob([outBytes], { type: 'application/pdf' }), outName);
            showToast('PDF permanently redacted and downloaded!', 'success');
        } catch (err) {
            console.error(err);
            showToast('Redaction failed: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Apply Permanent Redaction & Download';
        }
    });
});
