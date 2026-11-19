// State
let currentFile = null;
let totalPages = 0;
let generatedImages = []; // { index, blob, fileName, dataUrl }

// Elements
const dropZone = document.getElementById('drop-zone');
const convertStage = document.getElementById('convert-stage');
const fileNameEl = document.getElementById('file-name');
const pageCountEl = document.getElementById('page-count');
const convertBtn = document.getElementById('convert-btn');
const formatSelect = document.getElementById('format-select');
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const resultsSection = document.getElementById('results-section');
const imageGrid = document.getElementById('image-grid');
const downloadAllBtn = document.getElementById('download-all-btn');

// Init
initDropZone('drop-zone', 'file-input', (files) => handleFile(files[0]));

async function handleFile(file) {
    if (file.type !== 'application/pdf') {
        showToast('Please upload a valid PDF.', 'error');
        return;
    }

    try {
        currentFile = file;
        const arrayBuffer = await readFileAsArrayBuffer(file);
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        totalPages = pdf.numPages;

        fileNameEl.innerText = file.name;
        pageCountEl.innerText = `${totalPages} Pages`;

        // Reset state
        generatedImages = [];
        resultsSection.style.display = 'none';
        imageGrid.innerHTML = '';

        dropZone.style.display = 'none';
        convertStage.style.display = 'block';
    } catch (e) {
        console.error(e);
        showToast('Error loading PDF.', 'error');
    }
}

convertBtn.addEventListener('click', async () => {
    try {
        convertBtn.disabled = true;
        progressContainer.style.display = 'block';
        resultsSection.style.display = 'none';
        imageGrid.innerHTML = '';
        generatedImages = [];

        const format = formatSelect.value; // 'jpeg' or 'png'
        const arrayBuffer = await readFileAsArrayBuffer(currentFile);
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;

        for (let i = 1; i <= totalPages; i++) {
            // Update UI
            const percent = Math.round((i / totalPages) * 100);
            progressBar.style.width = `${percent}%`;
            progressText.innerText = `Converting page ${i} of ${totalPages}...`;

            // Render
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 2.0 }); // High res for quality
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport: viewport }).promise;

            // Blob & DataURL
            const ext = format === 'jpeg' ? 'jpg' : 'png';
            const fileName = `page_${i}.${ext}`;

            // Get DataURL for preview (lower quality/res if needed, but we keep same for simplicity)
            const dataUrl = canvas.toDataURL(`image/${format}`);

            // Get Blob for download
            const blob = await new Promise(resolve => canvas.toBlob(resolve, `image/${format}`));

            generatedImages.push({
                index: i,
                blob: blob,
                fileName: fileName,
                dataUrl: dataUrl
            });
        }

        progressText.innerText = "Done!";
        renderResults();
        showToast('Conversion complete!', 'success');

    } catch (error) {
        console.error(error);
        showToast('Error: ' + error.message, 'error');
    } finally {
        convertBtn.disabled = false;
        progressContainer.style.display = 'none';
        convertBtn.innerText = 'Convert Again';
    }
});

function renderResults() {
    resultsSection.style.display = 'block';
    imageGrid.innerHTML = '';

    generatedImages.forEach(img => {
        const div = document.createElement('div');
        div.className = 'page-card';

        div.innerHTML = `
            <div class="page-number-badge">Page ${img.index}</div>
            <div class="page-preview" onclick="openPreview(${img.index - 1})" title="Click to Preview">
                <img src="${img.dataUrl}" alt="Page ${img.index}">
            </div>
            <div class="page-actions">
                <button onclick="downloadSingleImage(${img.index - 1})" title="Download this image">
                    <i class="fa-solid fa-download"></i> Download
                </button>
            </div>
        `;
        imageGrid.appendChild(div);
    });
}

window.downloadSingleImage = (index) => {
    const img = generatedImages[index];
    if (img) {
        downloadFile(img.blob, img.fileName);
    }
};

downloadAllBtn.addEventListener('click', async () => {
    if (generatedImages.length === 0) return;

    if (typeof JSZip === 'undefined') {
        alert('JSZip library not loaded.');
        return;
    }

    const zip = new JSZip();

    showToast('Zipping files...', 'info');

    generatedImages.forEach(img => {
        zip.file(img.fileName, img.blob);
    });

    const content = await zip.generateAsync({ type: "blob" });
    downloadFile(content, `${currentFile.name.replace('.pdf', '')}_images.zip`);
    showToast('Download started!', 'success');
});

window.resetFile = () => {
    currentFile = null;
    totalPages = 0;
    generatedImages = [];
    imageGrid.innerHTML = '';
    resultsSection.style.display = 'none';
    convertStage.style.display = 'none';
    dropZone.style.display = 'block';
    fileInput.value = ''; // Reset input to allow re-selecting same file
};

// Preview Logic
const previewModal = document.getElementById('image-preview-modal');
const previewImage = document.getElementById('preview-image');

window.openPreview = (index) => {
    const img = generatedImages[index];
    if (img) {
        previewImage.src = img.dataUrl;
        previewModal.style.display = 'flex';
    }
};

window.closePreview = () => {
    previewModal.style.display = 'none';
};
