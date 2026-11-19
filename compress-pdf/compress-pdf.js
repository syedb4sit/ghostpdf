if (typeof PDFLib === 'undefined' || typeof pdfjsLib === 'undefined') {
    alert('PDF Libraries failed to load. Please check your internet connection.');
    throw new Error('PDFLib or pdf.js not loaded');
}
const { PDFDocument } = PDFLib;

// State
let currentFile = null;
let selectedQuality = 0.5;

const PRESET_SCALES = {
    0.75: 1.5,
    0.5: 1.2,
    0.25: 0.9
};

// Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const processingStage = document.getElementById('processing-stage');
const fileNameEl = document.getElementById('file-name');
const originalSizeEl = document.getElementById('original-size');
const compressBtn = document.getElementById('compress-btn');
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const levelGrid = document.querySelector('.level-grid');
const qualityButtons = document.querySelectorAll('.quality-btn');
const resultBox = document.getElementById('compress-result');

// Init drop zone & quality buttons
initDropZone('drop-zone', 'file-input', (files) => handleFile(files[0]));

qualityButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
        qualityButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const q = parseFloat(btn.dataset.quality);
        if (!Number.isNaN(q)) {
            selectedQuality = q;
        }
    });
});

function handleFile(file) {
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
        showToast('Please upload a valid PDF.', 'error');
        return;
    }

    currentFile = file;
    fileNameEl.innerText = file.name;
    originalSizeEl.innerText = `Original: ${formatBytes(file.size)}`;

    dropZone.style.display = 'none';
    processingStage.style.display = 'block';
    progressContainer.style.display = 'none';
    progressBar.style.width = '0%';
    progressText.innerText = 'Preparing...';
    if (resultBox) {
        resultBox.style.display = 'none';
        resultBox.innerHTML = '';
    }
    compressBtn.style.display = 'block';
    compressBtn.disabled = false;
    compressBtn.innerHTML = '<i class="fa-solid fa-minimize"></i> Compress PDF';
}

async function renderCompressedPdf(pdf, quality, scale, labelPrefix) {
    const totalPages = pdf.numPages;
    const newPdf = await PDFDocument.create();

    for (let i = 1; i <= totalPages; i++) {
        const percent = Math.round((i / (totalPages + 1)) * 100);
        progressBar.style.width = `${percent}%`;
        progressText.innerText = `${labelPrefix} page ${i} of ${totalPages}...`;

        const page = await pdf.getPage(i);
        const baseViewport = page.getViewport({ scale: 1 });
        const renderViewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { alpha: false });
        canvas.width = Math.max(1, Math.floor(renderViewport.width));
        canvas.height = Math.max(1, Math.floor(renderViewport.height));

        // White background prevents transparent PDFs turning black in JPEG
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: context, viewport: renderViewport }).promise;

        const jpegBlob = await new Promise((resolve, reject) => {
            canvas.toBlob(
                (blob) => (blob ? resolve(blob) : reject(new Error('Canvas encoding failed'))),
                'image/jpeg',
                quality
            );
        });
        const imgBytes = await jpegBlob.arrayBuffer();
        const embeddedImg = await newPdf.embedJpg(imgBytes);

        const outPage = newPdf.addPage([baseViewport.width, baseViewport.height]);
        outPage.drawImage(embeddedImg, {
            x: 0,
            y: 0,
            width: baseViewport.width,
            height: baseViewport.height
        });

        canvas.width = 0;
        canvas.height = 0;
        canvas.remove();
    }

    progressText.innerText = 'Finalizing compressed PDF...';
    return await newPdf.save({ useObjectStreams: true });
}

compressBtn.addEventListener('click', async () => {
    if (!currentFile) return;

    try {
        compressBtn.disabled = true;
        compressBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Compressing...';
        if (levelGrid) levelGrid.classList.add('disabled');
        progressContainer.style.display = 'block';
        progressBar.style.width = '5%';
        progressText.innerText = 'Loading PDF...';

        const originalBuffer = await readFileAsArrayBuffer(currentFile);
        const originalSize = currentFile.size;
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(originalBuffer.slice(0)) }).promise;

        const scale = PRESET_SCALES[selectedQuality] || 1.2;
        let bestBytes = await renderCompressedPdf(pdf, selectedQuality, scale, 'Compressing');

        // Retry with stronger compression if the first pass enlarged a text-heavy PDF
        if (bestBytes.byteLength >= originalSize) {
            const retryQuality = Math.min(0.35, Math.max(0.2, selectedQuality * 0.7));
            const retryScale = Math.min(0.85, Math.max(0.7, scale * 0.7));
            const retryBytes = await renderCompressedPdf(pdf, retryQuality, retryScale, 'Optimizing');
            if (retryBytes.byteLength < bestBytes.byteLength) {
                bestBytes = retryBytes;
            }
        }

        let usedOriginal = false;
        if (bestBytes.byteLength >= originalSize) {
            bestBytes = new Uint8Array(originalBuffer);
            usedOriginal = true;
        }

        progressBar.style.width = '100%';
        const finalSize = bestBytes.byteLength;
        const savedPercent = Math.max(0, Math.round(((originalSize - finalSize) / originalSize) * 100));

        const blob = new Blob([bestBytes], { type: 'application/pdf' });
        downloadFile(blob, `compressed_${currentFile.name}`);

        if (resultBox) {
            resultBox.style.display = 'block';
            resultBox.innerHTML = usedOriginal
                ? `<strong>${formatBytes(originalSize)} → ${formatBytes(finalSize)}</strong>
                   <span class="saving bad">Already well-optimized — kept original file to prevent size increase.</span>`
                : `<strong>${formatBytes(originalSize)} → ${formatBytes(finalSize)}</strong>
                   <span class="saving good">${savedPercent}% smaller — download started!</span>`;
        }

        const toastMsg = usedOriginal
            ? `Already optimal (${formatBytes(originalSize)}, 0% saved). Original downloaded.`
            : `Compressed: ${formatBytes(originalSize)} → ${formatBytes(finalSize)} (${savedPercent}% saved)`;
        showToast(toastMsg, usedOriginal ? 'info' : 'success');
    } catch (error) {
        console.error(error);
        showToast('Error compressing PDF: ' + error.message, 'error');
    } finally {
        compressBtn.disabled = false;
        compressBtn.innerHTML = '<i class="fa-solid fa-minimize"></i> Compress PDF';
        if (levelGrid) levelGrid.classList.remove('disabled');
        progressContainer.style.display = 'none';
    }
});

window.resetFile = () => {
    currentFile = null;
    processingStage.style.display = 'none';
    dropZone.style.display = 'block';
    fileInput.value = '';
    progressContainer.style.display = 'none';
    progressBar.style.width = '0%';
    if (resultBox) {
        resultBox.style.display = 'none';
        resultBox.innerHTML = '';
    }
};
