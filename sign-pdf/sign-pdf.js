/* Sign PDF - 100% Client-Side */
let currentPdfFile = null;
let pdfJsDoc = null;
let currentPageNum = 1;
let totalPages = 1;
let sigMode = 'draw';
let uploadedSigDataUrl = null;
let placementMode = 'bottom-right';
let customPos = { xPct: 0.72, yPct: 0.82 };
let isDrawing = false;
let hasDrawn = false;

const sigPad = document.getElementById('sig-pad');
const sigCtx = sigPad ? sigPad.getContext('2d') : null;
const previewCanvas = document.getElementById('pdf-preview-canvas');
const previewCtx = previewCanvas ? previewCanvas.getContext('2d') : null;

const clearSigPad = () => {
    if (!sigCtx || !sigPad) return;
    sigCtx.clearRect(0, 0, sigPad.width, sigPad.height);
    hasDrawn = false;
};

const initSigPad = () => {
    if (!sigPad || !sigCtx) return;
    const getPos = (e) => {
        const rect = sigPad.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: (clientX - rect.left) * (sigPad.width / rect.width),
            y: (clientY - rect.top) * (sigPad.height / rect.height)
        };
    };

    const start = (e) => {
        e.preventDefault();
        isDrawing = true;
        hasDrawn = true;
        const pos = getPos(e);
        sigCtx.beginPath();
        sigCtx.moveTo(pos.x, pos.y);
    };

    const move = (e) => {
        if (!isDrawing) return;
        e.preventDefault();
        const pos = getPos(e);
        sigCtx.lineWidth = parseFloat(document.getElementById('sig-thickness')?.value || '3');
        sigCtx.lineCap = 'round';
        sigCtx.lineJoin = 'round';
        sigCtx.strokeStyle = document.getElementById('sig-color')?.value || '#111827';
        sigCtx.lineTo(pos.x, pos.y);
        sigCtx.stroke();
    };

    const stop = () => { isDrawing = false; };

    sigPad.addEventListener('mousedown', start);
    sigPad.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
    sigPad.addEventListener('touchstart', start, { passive: false });
    sigPad.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', stop);
};

window.setSigMode = (mode) => {
    sigMode = mode;
    ['draw', 'type', 'upload'].forEach((m) => {
        const tab = document.getElementById(`tab-${m}`);
        const pane = document.getElementById(`pane-${m}`);
        if (tab) tab.className = m === mode ? 'btn btn-primary' : 'btn btn-secondary';
        if (pane) pane.style.display = m === mode ? 'block' : 'none';
    });
};

const getSignaturePngDataUrl = () => {
    if (sigMode === 'draw') {
        if (!hasDrawn) return null;
        return sigPad.toDataURL('image/png');
    }
    if (sigMode === 'type') {
        const text = (document.getElementById('typed-sig')?.value || '').trim();
        if (!text) return null;
        const c = document.createElement('canvas');
        c.width = 520;
        c.height = 160;
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, c.width, c.height);
        const color = document.getElementById('sig-color')?.value || '#111827';
        ctx.fillStyle = color;
        ctx.font = 'italic 60px Georgia, "Brush Script MT", cursive';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, c.width / 2, c.height / 2);
        return c.toDataURL('image/png');
    }
    return uploadedSigDataUrl;
};

const renderPdfPreview = async () => {
    if (!pdfJsDoc || !previewCanvas || !previewCtx) return;
    const page = await pdfJsDoc.getPage(currentPageNum);
    const viewport = page.getViewport({ scale: 1.1 });
    previewCanvas.width = viewport.width;
    previewCanvas.height = viewport.height;
    await page.render({ canvasContext: previewCtx, viewport }).promise;

    const label = document.getElementById('page-indicator');
    if (label) label.textContent = `Page ${currentPageNum} of ${totalPages}`;

    // Draw subtle placement indicator
    const marker = document.getElementById('sig-marker');
    if (marker) {
        let leftPct = 0.72;
        let topPct = 0.82;
        if (placementMode === 'bottom-left') { leftPct = 0.08; topPct = 0.82; }
        else if (placementMode === 'center') { leftPct = 0.38; topPct = 0.45; }
        else if (placementMode === 'custom') { leftPct = customPos.xPct; topPct = customPos.yPct; }
        marker.style.left = `${leftPct * 100}%`;
        marker.style.top = `${topPct * 100}%`;
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
        const buffer = await readFileAsArrayBuffer(file);
        pdfJsDoc = await pdfjsLib.getDocument({ data: buffer.slice(0) }).promise;
        totalPages = pdfJsDoc.numPages;
        currentPageNum = 1;

        document.getElementById('file-name').textContent = file.name;
        document.getElementById('file-meta').textContent = `${formatBytes(file.size)} • ${totalPages} page(s)`;
        document.getElementById('drop-zone').style.display = 'none';
        document.getElementById('sign-stage').style.display = 'block';
        await renderPdfPreview();
    } catch (err) {
        console.error(err);
        showToast('Failed to load PDF: ' + err.message, 'error');
    }
};

window.prevPage = async () => {
    if (currentPageNum > 1) {
        currentPageNum--;
        await renderPdfPreview();
    }
};

window.nextPage = async () => {
    if (currentPageNum < totalPages) {
        currentPageNum++;
        await renderPdfPreview();
    }
};

window.resetSignTool = () => {
    currentPdfFile = null;
    pdfJsDoc = null;
    document.getElementById('file-input').value = '';
    document.getElementById('drop-zone').style.display = 'flex';
    document.getElementById('sign-stage').style.display = 'none';
};

document.addEventListener('DOMContentLoaded', () => {
    initDropZone('drop-zone', 'file-input', handlePdfSelected);
    initSigPad();

    const sigImgInput = document.getElementById('sig-image-input');
    if (sigImgInput) {
        sigImgInput.addEventListener('change', async (e) => {
            const f = e.target.files[0];
            if (!f) return;
            uploadedSigDataUrl = await readFileAsDataURL(f);
            const prev = document.getElementById('uploaded-sig-preview');
            if (prev) {
                prev.src = uploadedSigDataUrl;
                prev.style.display = 'block';
            }
        });
    }

    const posSelect = document.getElementById('sig-placement');
    if (posSelect) {
        posSelect.addEventListener('change', () => {
            placementMode = posSelect.value;
            renderPdfPreview();
        });
    }

    if (previewCanvas) {
        previewCanvas.addEventListener('click', (e) => {
            const rect = previewCanvas.getBoundingClientRect();
            customPos.xPct = Math.max(0.02, Math.min(0.8, (e.clientX - rect.left) / rect.width));
            customPos.yPct = Math.max(0.02, Math.min(0.88, (e.clientY - rect.top) / rect.height));
            placementMode = 'custom';
            if (posSelect) posSelect.value = 'custom';
            renderPdfPreview();
            showToast('Signature position updated on page preview.', 'info');
        });
    }

    document.getElementById('clear-sig-btn')?.addEventListener('click', clearSigPad);

    document.getElementById('apply-sign-btn')?.addEventListener('click', async () => {
        if (!currentPdfFile) return;
        const sigDataUrl = getSignaturePngDataUrl();
        if (!sigDataUrl) {
            showToast('Please draw, type, or upload your signature first.', 'error');
            return;
        }

        const btn = document.getElementById('apply-sign-btn');
        btn.disabled = true;
        btn.textContent = 'Signing PDF...';
        try {
            const pdfBytes = await readFileAsArrayBuffer(currentPdfFile);
            const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
            const pngBytes = await fetch(sigDataUrl).then((r) => r.arrayBuffer());
            const sigImg = await pdfDoc.embedPng(pngBytes);

            const scalePct = parseInt(document.getElementById('sig-size')?.value || '22', 10) / 100;
            const applyAll = document.getElementById('sign-all-pages')?.checked;
            const pages = pdfDoc.getPages();
            const targetIndices = applyAll ? pages.map((_, i) => i) : [currentPageNum - 1];

            targetIndices.forEach((idx) => {
                const page = pages[idx];
                const { width, height } = page.getSize();
                const drawW = width * scalePct;
                const drawH = (sigImg.height / sigImg.width) * drawW;

                let x = width - drawW - 36;
                let y = 36;
                if (placementMode === 'bottom-left') {
                    x = 36;
                    y = 36;
                } else if (placementMode === 'center') {
                    x = (width - drawW) / 2;
                    y = (height - drawH) / 2;
                } else if (placementMode === 'custom') {
                    x = Math.min(width - drawW - 10, Math.max(10, customPos.xPct * width));
                    y = Math.max(10, height - customPos.yPct * height - drawH);
                }

                page.drawImage(sigImg, { x, y, width: drawW, height: drawH });
            });

            const outBytes = await pdfDoc.save();
            const outName = currentPdfFile.name.replace(/\.pdf$/i, '') + '-signed.pdf';
            downloadFile(new Blob([outBytes], { type: 'application/pdf' }), outName);
            showToast('PDF signed and downloaded!', 'success');
        } catch (err) {
            console.error(err);
            showToast('Signing failed: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Sign & Download PDF';
        }
    });
});
