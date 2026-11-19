/* PDF OCR - 100% Client-Side via Tesseract.js + PDF.js */
let selectedFile = null;

const handleOcrFile = (files) => {
    const file = files[0];
    if (!file) return;
    selectedFile = file;
    document.getElementById('file-name').textContent = file.name;
    document.getElementById('file-meta').textContent = formatBytes(file.size);
    document.getElementById('drop-zone').style.display = 'none';
    document.getElementById('ocr-stage').style.display = 'block';
    document.getElementById('ocr-result-wrap').style.display = 'none';
};

window.resetOcrTool = () => {
    selectedFile = null;
    document.getElementById('file-input').value = '';
    document.getElementById('drop-zone').style.display = 'flex';
    document.getElementById('ocr-stage').style.display = 'none';
    document.getElementById('ocr-result').value = '';
};

document.addEventListener('DOMContentLoaded', () => {
    initDropZone('drop-zone', 'file-input', handleOcrFile);

    document.getElementById('run-ocr-btn')?.addEventListener('click', async () => {
        if (!selectedFile) return;
        const lang = document.getElementById('ocr-lang')?.value || 'eng';
        const btn = document.getElementById('run-ocr-btn');
        const statusEl = document.getElementById('ocr-status');
        const barEl = document.getElementById('ocr-progress-bar');
        const wrapEl = document.getElementById('ocr-progress-wrap');

        btn.disabled = true;
        wrapEl.style.display = 'block';
        statusEl.textContent = 'Initializing OCR engine...';
        barEl.style.width = '5%';

        let worker = null;
        try {
            worker = await Tesseract.createWorker(lang, 1, {
                logger: (m) => {
                    if (m.status === 'recognizing text' && typeof m.progress === 'number') {
                        barEl.style.width = `${Math.round(m.progress * 100)}%`;
                    }
                }
            });

            let fullText = '';
            const isPdf = selectedFile.name.toLowerCase().endsWith('.pdf') || selectedFile.type === 'application/pdf';

            if (isPdf) {
                const buf = await readFileAsArrayBuffer(selectedFile);
                const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
                for (let i = 1; i <= pdf.numPages; i++) {
                    statusEl.textContent = `Running OCR on page ${i} of ${pdf.numPages}...`;
                    const page = await pdf.getPage(i);
                    const vp = page.getViewport({ scale: 2.0 });
                    const canvas = document.createElement('canvas');
                    canvas.width = vp.width;
                    canvas.height = vp.height;
                    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
                    const { data: { text } } = await worker.recognize(canvas);
                    fullText += `--- Page ${i} ---\n${text.trim()}\n\n`;
                }
            } else {
                statusEl.textContent = 'Recognizing text from image...';
                const { data: { text } } = await worker.recognize(selectedFile);
                fullText = text.trim();
            }

            document.getElementById('ocr-result').value = fullText.trim();
            document.getElementById('ocr-result-wrap').style.display = 'block';
            statusEl.textContent = 'OCR Complete!';
            barEl.style.width = '100%';
            showToast('Text extracted successfully!', 'success');
        } catch (err) {
            console.error(err);
            showToast('OCR failed: ' + err.message, 'error');
            statusEl.textContent = 'OCR failed.';
        } finally {
            if (worker) await worker.terminate();
            btn.disabled = false;
        }
    });

    document.getElementById('copy-ocr-btn')?.addEventListener('click', async () => {
        const text = document.getElementById('ocr-result')?.value || '';
        await navigator.clipboard.writeText(text);
        showToast('Copied extracted text!', 'success');
    });

    document.getElementById('download-ocr-btn')?.addEventListener('click', () => {
        const text = document.getElementById('ocr-result')?.value || '';
        const name = (selectedFile?.name || 'document').replace(/\.[^.]+$/, '') + '-ocr.txt';
        downloadFile(new Blob([text], { type: 'text/plain;charset=utf-8' }), name);
    });
});
