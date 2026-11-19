/* Flatten PDF Forms & Annotations - 100% Client-Side */
let currentPdfFile = null;

const handlePdfSelected = async (files) => {
    const file = files[0];
    if (!file || (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf')) {
        showToast('Please select a valid PDF file.', 'error');
        return;
    }
    try {
        currentPdfFile = file;
        const buf = await readFileAsArrayBuffer(file);
        const doc = await PDFLib.PDFDocument.load(buf);
        const fields = doc.getForm().getFields();

        document.getElementById('file-name').textContent = file.name;
        document.getElementById('file-meta').textContent = `${formatBytes(file.size)} • ${doc.getPageCount()} page(s) • ${fields.length} interactive form field(s)`;
        document.getElementById('drop-zone').style.display = 'none';
        document.getElementById('flatten-stage').style.display = 'block';
    } catch (err) {
        console.error(err);
        showToast('Failed to load PDF: ' + err.message, 'error');
    }
};

window.resetFlattenTool = () => {
    currentPdfFile = null;
    document.getElementById('file-input').value = '';
    document.getElementById('drop-zone').style.display = 'flex';
    document.getElementById('flatten-stage').style.display = 'none';
};

document.addEventListener('DOMContentLoaded', () => {
    initDropZone('drop-zone', 'file-input', handlePdfSelected);

    document.getElementById('apply-flatten-btn')?.addEventListener('click', async () => {
        if (!currentPdfFile) return;
        const mode = document.querySelector('input[name="flatten-mode"]:checked')?.value || 'forms';
        const btn = document.getElementById('apply-flatten-btn');
        btn.disabled = true;
        btn.textContent = 'Flattening PDF...';
        try {
            const buf = await readFileAsArrayBuffer(currentPdfFile);
            let outBytes;
            if (mode === 'raster') {
                const pdf = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
                const outDoc = await PDFLib.PDFDocument.create();
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const vp = page.getViewport({ scale: 2.0 });
                    const canvas = document.createElement('canvas');
                    canvas.width = vp.width;
                    canvas.height = vp.height;
                    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
                    const pngBytes = await fetch(canvas.toDataURL('image/png')).then((r) => r.arrayBuffer());
                    const img = await outDoc.embedPng(pngBytes);
                    const origVp = page.getViewport({ scale: 1.0 });
                    const p = outDoc.addPage([origVp.width, origVp.height]);
                    p.drawImage(img, { x: 0, y: 0, width: origVp.width, height: origVp.height });
                }
                outBytes = await outDoc.save();
            } else {
                const doc = await PDFLib.PDFDocument.load(buf);
                doc.getForm().flatten();
                outBytes = await doc.save();
            }
            downloadFile(new Blob([outBytes], { type: 'application/pdf' }), currentPdfFile.name.replace(/\.pdf$/i, '') + '-flattened.pdf');
            showToast('PDF flattened and downloaded!', 'success');
        } catch (err) {
            console.error(err);
            showToast('Flattening failed: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Flatten & Download PDF';
        }
    });
});
