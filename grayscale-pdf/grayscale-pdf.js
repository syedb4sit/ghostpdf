/* Grayscale & Invert PDF - 100% Client-Side */
let currentPdfFile = null;

const handlePdfSelected = (files) => {
    const file = files[0];
    if (!file || (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf')) {
        showToast('Please select a valid PDF file.', 'error');
        return;
    }
    currentPdfFile = file;
    document.getElementById('file-name').textContent = file.name;
    document.getElementById('file-meta').textContent = formatBytes(file.size);
    document.getElementById('drop-zone').style.display = 'none';
    document.getElementById('gray-stage').style.display = 'block';
};

window.resetGrayTool = () => {
    currentPdfFile = null;
    document.getElementById('file-input').value = '';
    document.getElementById('drop-zone').style.display = 'flex';
    document.getElementById('gray-stage').style.display = 'none';
};

document.addEventListener('DOMContentLoaded', () => {
    initDropZone('drop-zone', 'file-input', handlePdfSelected);

    document.getElementById('apply-gray-btn')?.addEventListener('click', async () => {
        if (!currentPdfFile) return;
        const mode = document.querySelector('input[name="color-mode"]:checked')?.value || 'grayscale';
        const btn = document.getElementById('apply-gray-btn');
        btn.disabled = true;
        btn.textContent = 'Processing pages...';

        try {
            const buf = await readFileAsArrayBuffer(currentPdfFile);
            const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
            const outPdf = await PDFLib.PDFDocument.create();

            for (let i = 1; i <= pdf.numPages; i++) {
                btn.textContent = `Processing page ${i}/${pdf.numPages}...`;
                const page = await pdf.getPage(i);
                const vp = page.getViewport({ scale: 1.8 });
                const canvas = document.createElement('canvas');
                canvas.width = vp.width;
                canvas.height = vp.height;
                const ctx = canvas.getContext('2d');
                await page.render({ canvasContext: ctx, viewport: vp }).promise;

                const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const d = imgData.data;
                for (let p = 0; p < d.length; p += 4) {
                    if (mode === 'invert') {
                        d[p] = 255 - d[p];
                        d[p + 1] = 255 - d[p + 1];
                        d[p + 2] = 255 - d[p + 2];
                    } else {
                        const lum = Math.round(0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]);
                        d[p] = d[p + 1] = d[p + 2] = lum;
                    }
                }
                ctx.putImageData(imgData, 0, 0);

                const jpgUrl = canvas.toDataURL('image/jpeg', 0.9);
                const jpgBytes = await fetch(jpgUrl).then((r) => r.arrayBuffer());
                const embedded = await outPdf.embedJpg(jpgBytes);
                const origVp = page.getViewport({ scale: 1.0 });
                const outPage = outPdf.addPage([origVp.width, origVp.height]);
                outPage.drawImage(embedded, { x: 0, y: 0, width: origVp.width, height: origVp.height });
            }

            const outBytes = await outPdf.save();
            const suffix = mode === 'invert' ? '-inverted.pdf' : '-grayscale.pdf';
            downloadFile(new Blob([outBytes], { type: 'application/pdf' }), currentPdfFile.name.replace(/\.pdf$/i, '') + suffix);
            showToast('PDF processed and downloaded!', 'success');
        } catch (err) {
            console.error(err);
            showToast('Failed: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Convert & Download PDF';
        }
    });
});
