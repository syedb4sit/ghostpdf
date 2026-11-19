/* Edit PDF Metadata - 100% Client-Side */
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

        document.getElementById('meta-title').value = doc.getTitle() || '';
        document.getElementById('meta-author').value = doc.getAuthor() || '';
        document.getElementById('meta-subject').value = doc.getSubject() || '';
        document.getElementById('meta-keywords').value = doc.getKeywords() || '';
        document.getElementById('meta-creator').value = doc.getCreator() || '';
        document.getElementById('meta-producer').value = doc.getProducer() || '';

        document.getElementById('file-name').textContent = file.name;
        document.getElementById('file-meta').textContent = `${formatBytes(file.size)} • ${doc.getPageCount()} page(s)`;
        document.getElementById('drop-zone').style.display = 'none';
        document.getElementById('meta-stage').style.display = 'block';
    } catch (err) {
        console.error(err);
        showToast('Failed to inspect PDF metadata: ' + err.message, 'error');
    }
};

window.resetMetaTool = () => {
    currentPdfFile = null;
    document.getElementById('file-input').value = '';
    document.getElementById('drop-zone').style.display = 'flex';
    document.getElementById('meta-stage').style.display = 'none';
};

document.addEventListener('DOMContentLoaded', () => {
    initDropZone('drop-zone', 'file-input', handlePdfSelected);

    document.getElementById('save-meta-btn')?.addEventListener('click', async () => {
        if (!currentPdfFile) return;
        const btn = document.getElementById('save-meta-btn');
        btn.disabled = true;
        btn.textContent = 'Saving Metadata...';
        try {
            const buf = await readFileAsArrayBuffer(currentPdfFile);
            const doc = await PDFLib.PDFDocument.load(buf);
            doc.setTitle(document.getElementById('meta-title').value);
            doc.setAuthor(document.getElementById('meta-author').value);
            doc.setSubject(document.getElementById('meta-subject').value);
            const kw = document.getElementById('meta-keywords').value.split(',').map((s) => s.trim()).filter(Boolean);
            doc.setKeywords(kw);
            doc.setCreator(document.getElementById('meta-creator').value || 'GhostPDF');
            doc.setProducer(document.getElementById('meta-producer').value || 'GhostPDF');

            const outBytes = await doc.save();
            downloadFile(new Blob([outBytes], { type: 'application/pdf' }), currentPdfFile.name.replace(/\.pdf$/i, '') + '-metadata.pdf');
            showToast('PDF metadata updated and downloaded!', 'success');
        } catch (err) {
            console.error(err);
            showToast('Failed to save metadata: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Save Metadata & Download PDF';
        }
    });
});
