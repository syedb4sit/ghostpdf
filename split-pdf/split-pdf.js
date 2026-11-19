if (typeof PDFLib === 'undefined') {
    alert('PDF Libraries failed to load. Please check your internet connection.');
    throw new Error('PDFLib not loaded');
}
const { PDFDocument } = PDFLib;

// State
let currentFile = null;
let pdfDoc = null;
let totalPages = 0;

// Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const uploadStage = document.getElementById('upload-stage');
const optionsStage = document.getElementById('options-stage');
const fileNameEl = document.getElementById('file-name');
const pageCountEl = document.getElementById('page-count');
const rangeInput = document.getElementById('page-range');
const splitBtn = document.getElementById('split-btn');

// Init
initDropZone('drop-zone', 'file-input', (files) => handleFile(files[0]));

// Logic
async function handleFile(file) {
    if (file.type !== 'application/pdf') {
        showToast('Please upload a valid PDF file.', 'error');
        return;
    }

    try {
        currentFile = file;
        const arrayBuffer = await readFileAsArrayBuffer(file);
        pdfDoc = await PDFDocument.load(arrayBuffer);
        totalPages = pdfDoc.getPageCount();

        fileNameEl.innerText = file.name;
        pageCountEl.innerText = `${totalPages} Pages`;

        uploadStage.style.display = 'none';
        optionsStage.style.display = 'block';
    } catch (e) {
        console.error(e);
        showToast('Error loading PDF.', 'error');
    }
}

function toggleMode() {
    const mode = document.querySelector('input[name="split-mode"]:checked').value;
    const rangeContainer = document.getElementById('range-input-container');

    if (mode === 'range') {
        rangeContainer.style.display = 'block';
        rangeInput.focus();
    } else {
        rangeContainer.style.display = 'none';
    }
}

window.toggleMode = toggleMode; // Expose to HTML

window.resetApp = () => {
    currentFile = null;
    pdfDoc = null;
    fileInput.value = '';
    uploadStage.style.display = 'block';
    optionsStage.style.display = 'none';
    rangeInput.value = '';
};

splitBtn.addEventListener('click', async () => {
    const mode = document.querySelector('input[name="split-mode"]:checked').value;

    if (mode === 'range' && !rangeInput.value.trim()) {
        showToast('Please enter page ranges.', 'error');
        return;
    }

    try {
        splitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
        splitBtn.disabled = true;

        if (mode === 'all') {
            await splitAllPages();
        } else {
            await splitRange();
        }

        showToast('Done! Download started.', 'success');
    } catch (error) {
        console.error(error);
        showToast('Error: ' + error.message, 'error');
    } finally {
        splitBtn.innerHTML = '<i class="fa-solid fa-scissors"></i> Split PDF';
        splitBtn.disabled = false;
    }
});

async function splitAllPages() {
    const zip = new JSZip();
    const folder = zip.folder("split_pages");
    const originalName = currentFile.name.replace('.pdf', '');

    for (let i = 0; i < totalPages; i++) {
        const newPdf = await PDFDocument.create();
        const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
        newPdf.addPage(copiedPage);
        const pdfBytes = await newPdf.save();
        folder.file(`${originalName}_page_${i + 1}.pdf`, pdfBytes);
    }

    const content = await zip.generateAsync({ type: "blob" });
    downloadFile(content, `${originalName}_split.zip`);
}

async function splitRange() {
    // Parse range logic (e.g. "1-3, 5")
    const indices = parsePageRange(rangeInput.value, totalPages);

    if (indices.length === 0) {
        throw new Error("No valid pages selected.");
    }

    const newPdf = await PDFDocument.create();
    const copiedPages = await newPdf.copyPages(pdfDoc, indices);
    copiedPages.forEach(page => newPdf.addPage(page));

    const pdfBytes = await newPdf.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    downloadFile(blob, `extracted_pages.pdf`);
}

function parsePageRange(input, maxPages) {
    const pages = new Set();
    const parts = input.split(',');

    for (const part of parts) {
        const p = part.trim();
        if (p.includes('-')) {
            const [start, end] = p.split('-').map(Number);
            if (!isNaN(start) && !isNaN(end)) {
                for (let i = start; i <= end; i++) {
                    if (i >= 1 && i <= maxPages) pages.add(i - 1); // 0-indexed
                }
            }
        } else {
            const num = Number(p);
            if (!isNaN(num) && num >= 1 && num <= maxPages) {
                pages.add(num - 1);
            }
        }
    }
    return Array.from(pages).sort((a, b) => a - b);
}
