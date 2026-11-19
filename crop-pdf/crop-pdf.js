/* Crop PDF - 100% Client-Side */
let currentPdfFile = null;
let pdfJsDoc = null;
let currentPageNum = 1;
let totalPages = 1;

const canvas = document.getElementById('crop-preview-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;

const getMargins = () => ({
    top: Math.max(0, Math.min(45, parseFloat(document.getElementById('crop-top')?.value || 0))),
    right: Math.max(0, Math.min(45, parseFloat(document.getElementById('crop-right')?.value || 0))),
    bottom: Math.max(0, Math.min(45, parseFloat(document.getElementById('crop-bottom')?.value || 0))),
    left: Math.max(0, Math.min(45, parseFloat(document.getElementById('crop-left')?.value || 0)))
});

const renderCropPreview = async () => {
    if (!pdfJsDoc || !canvas || !ctx) return;
    const page = await pdfJsDoc.getPage(currentPageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport }).promise;

    const m = getMargins();
    const x1 = (m.left / 100) * canvas.width;
    const y1 = (m.top / 100) * canvas.height;
    const w = canvas.width * (1 - (m.left + m.right) / 100);
    const h = canvas.height * (1 - (m.top + m.bottom) / 100);

    // Shade cropped-out area
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, 0, canvas.width, y1);
    ctx.fillRect(0, y1 + h, canvas.width, canvas.height - (y1 + h));
    ctx.fillRect(0, y1, x1, h);
    ctx.fillRect(x1 + w, y1, canvas.width - (x1 + w), h);
    ctx.strokeStyle = '#ef233c';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x1, y1, w, h);
    ctx.restore();

    const label = document.getElementById('page-indicator');
    if (label) label.textContent = `Page ${currentPageNum} of ${totalPages}`;
};

const handlePdfSelected = async (files) => {
    const file = files[0];
    if (!file || (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf')) {
        showToast('Please select a valid PDF file.', 'error');
        return;
    }
    try {
        currentPdfFile = file;
        const buf = await readFileAsArrayBuffer(file);
        pdfJsDoc = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
        totalPages = pdfJsDoc.numPages;
        currentPageNum = 1;

        document.getElementById('file-name').textContent = file.name;
        document.getElementById('file-meta').textContent = `${formatBytes(file.size)} • ${totalPages} page(s)`;
        document.getElementById('drop-zone').style.display = 'none';
        document.getElementById('crop-stage').style.display = 'block';
        await renderCropPreview();
    } catch (err) {
        console.error(err);
        showToast('Could not read PDF: ' + err.message, 'error');
    }
};

window.prevPage = async () => {
    if (currentPageNum > 1) { currentPageNum--; await renderCropPreview(); }
};
window.nextPage = async () => {
    if (currentPageNum < totalPages) { currentPageNum++; await renderCropPreview(); }
};
window.resetCropTool = () => {
    currentPdfFile = null;
    pdfJsDoc = null;
    document.getElementById('file-input').value = '';
    document.getElementById('drop-zone').style.display = 'flex';
    document.getElementById('crop-stage').style.display = 'none';
};

document.addEventListener('DOMContentLoaded', () => {
    initDropZone('drop-zone', 'file-input', handlePdfSelected);
    ['crop-top', 'crop-right', 'crop-bottom', 'crop-left'].forEach((id) => {
        document.getElementById(id)?.addEventListener('input', renderCropPreview);
    });

    document.getElementById('apply-crop-btn')?.addEventListener('click', async () => {
        if (!currentPdfFile) return;
        const m = getMargins();
        if (m.left + m.right >= 95 || m.top + m.bottom >= 95) {
            showToast('Crop margins are too large.', 'error');
            return;
        }
        const btn = document.getElementById('apply-crop-btn');
        btn.disabled = true;
        btn.textContent = 'Cropping PDF...';
        try {
            const buf = await readFileAsArrayBuffer(currentPdfFile);
            const pdfDoc = await PDFLib.PDFDocument.load(buf);
            const pages = pdfDoc.getPages();
            const applyAll = document.getElementById('crop-all-pages')?.checked;
            const indices = applyAll ? pages.map((_, i) => i) : [currentPageNum - 1];

            indices.forEach((idx) => {
                const page = pages[idx];
                const { width, height } = page.getSize();
                const cropX = (m.left / 100) * width;
                const cropY = (m.bottom / 100) * height;
                const cropW = width * (1 - (m.left + m.right) / 100);
                const cropH = height * (1 - (m.top + m.bottom) / 100);
                page.setCropBox(cropX, cropY, cropW, cropH);
                page.setMediaBox(cropX, cropY, cropW, cropH);
            });

            const out = await pdfDoc.save();
            const name = currentPdfFile.name.replace(/\.pdf$/i, '') + '-cropped.pdf';
            downloadFile(new Blob([out], { type: 'application/pdf' }), name);
            showToast('PDF cropped successfully!', 'success');
        } catch (err) {
            console.error(err);
            showToast('Crop failed: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Crop & Download PDF';
        }
    });
});
