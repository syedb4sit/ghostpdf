/* Compare PDF - Side-by-Side & Visual Pixel Diff (100% Client-Side) */
let docA = null;
let docB = null;
let currentPage = 1;
let maxPages = 1;

const renderComparison = async () => {
    if (!docA || !docB) return;
    maxPages = Math.max(docA.numPages, docB.numPages);
    document.getElementById('compare-stage').style.display = 'block';
    document.getElementById('page-indicator').textContent = `Page ${currentPage} of ${maxPages}`;

    const cA = document.getElementById('canvas-a');
    const cB = document.getElementById('canvas-b');
    const cDiff = document.getElementById('canvas-diff');

    const renderOrBlank = async (doc, canvas) => {
        const ctx = canvas.getContext('2d');
        if (currentPage <= doc.numPages) {
            const page = await doc.getPage(currentPage);
            const vp = page.getViewport({ scale: 1.0 });
            canvas.width = vp.width;
            canvas.height = vp.height;
            await page.render({ canvasContext: ctx, viewport: vp }).promise;
            const tc = await page.getTextContent();
            return tc.items.map((i) => i.str).join(' ').trim();
        }
        canvas.width = 595;
        canvas.height = 842;
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#64748b';
        ctx.font = '18px sans-serif';
        ctx.fillText('No matching page in this PDF', 140, 420);
        return '';
    };

    const [textA, textB] = await Promise.all([renderOrBlank(docA, cA), renderOrBlank(docB, cB)]);

    const w = Math.max(cA.width, cB.width);
    const h = Math.max(cA.height, cB.height);
    cDiff.width = w;
    cDiff.height = h;
    const ctxDiff = cDiff.getContext('2d');
    ctxDiff.fillStyle = '#ffffff';
    ctxDiff.fillRect(0, 0, w, h);

    const imgA = cA.getContext('2d').getImageData(0, 0, Math.min(w, cA.width), Math.min(h, cA.height));
    const imgB = cB.getContext('2d').getImageData(0, 0, Math.min(w, cB.width), Math.min(h, cB.height));
    const out = ctxDiff.createImageData(w, h);
    let changedPixels = 0;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            const inA = x < imgA.width && y < imgA.height;
            const inB = x < imgB.width && y < imgB.height;
            const idxA = (y * imgA.width + x) * 4;
            const idxB = (y * imgB.width + x) * 4;
            const rA = inA ? imgA.data[idxA] : 255, gA = inA ? imgA.data[idxA + 1] : 255, bA = inA ? imgA.data[idxA + 2] : 255;
            const rB = inB ? imgB.data[idxB] : 255, gB = inB ? imgB.data[idxB + 1] : 255, bB = inB ? imgB.data[idxB + 2] : 255;

            if (Math.abs(rA - rB) + Math.abs(gA - gB) + Math.abs(bA - bB) > 40) {
                changedPixels++;
                out.data[idx] = 239;
                out.data[idx + 1] = 35;
                out.data[idx + 2] = 60;
                out.data[idx + 3] = 255;
            } else {
                const gray = Math.round((rB + gB + bB) / 3);
                out.data[idx] = gray;
                out.data[idx + 1] = gray;
                out.data[idx + 2] = gray;
                out.data[idx + 3] = 90;
            }
        }
    }
    ctxDiff.putImageData(out, 0, 0);

    const pct = ((changedPixels / (w * h)) * 100).toFixed(2);
    const sameText = textA === textB;
    document.getElementById('diff-summary').textContent =
        `Visual difference: ${pct}% pixels changed • Text layer: ${sameText ? 'Identical' : 'Differences detected'}`;
};

const loadDoc = async (files, slot) => {
    const file = files[0];
    if (!file) return;
    try {
        const buf = await readFileAsArrayBuffer(file);
        const doc = await pdfjsLib.getDocument({ data: buf }).promise;
        if (slot === 'A') {
            docA = doc;
            document.getElementById('label-a').textContent = `${file.name} (${doc.numPages}p)`;
        } else {
            docB = doc;
            document.getElementById('label-b').textContent = `${file.name} (${doc.numPages}p)`;
        }
        if (docA && docB) {
            currentPage = 1;
            await renderComparison();
        }
    } catch (err) {
        console.error(err);
        showToast('Failed to load PDF: ' + err.message, 'error');
    }
};

window.prevComparePage = async () => { if (currentPage > 1) { currentPage--; await renderComparison(); } };
window.nextComparePage = async () => { if (currentPage < maxPages) { currentPage++; await renderComparison(); } };

document.addEventListener('DOMContentLoaded', () => {
    initDropZone('drop-a', 'input-a', (f) => loadDoc(f, 'A'));
    initDropZone('drop-b', 'input-b', (f) => loadDoc(f, 'B'));
});
