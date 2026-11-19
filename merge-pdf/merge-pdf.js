// Check dependencies
if (typeof PDFLib === 'undefined') {
    alert('PDF Libraries failed to load. Please check your internet connection or ad-blocker.');
    throw new Error('PDFLib not loaded');
}
const { PDFDocument } = PDFLib;

// State
let selectedFiles = [];
let sortableInstance = null;

// DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileListContainer = document.getElementById('file-list-container');
const fileList = document.getElementById('file-list');
const mergeBtn = document.getElementById('merge-btn');
const addMoreBtn = document.getElementById('add-more-btn');

// Init DropZone from utils
initDropZone('drop-zone', 'file-input', (files) => handleFiles(files));

// Add More button handler
addMoreBtn.addEventListener('click', () => fileInput.click());


// Merge Handler
mergeBtn.addEventListener('click', async () => {
    if (selectedFiles.length < 2) {
        showToast('Please select at least 2 PDF files to merge.', 'error');
        return;
    }

    try {
        mergeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Merging...';
        mergeBtn.disabled = true;
        showToast('Processing PDFs...', 'info');

        const mergedPdf = await PDFDocument.create();

        for (const fileObj of selectedFiles) {
            const arrayBuffer = await readFileAsArrayBuffer(fileObj.file);
            const pdf = await PDFDocument.load(arrayBuffer);
            const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            copiedPages.forEach((page) => mergedPdf.addPage(page));
        }

        const pdfBytes = await mergedPdf.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });

        downloadFile(blob, 'merged-document.pdf');
        showToast('PDFs merged successfully!', 'success');
    } catch (error) {
        console.error(error);
        showToast('Error merging PDFs: ' + error.message, 'error');
    } finally {
        mergeBtn.innerHTML = '<i class="fa-solid fa-file-export"></i> Merge PDFs';
        mergeBtn.disabled = false;
    }
});

function handleFiles(files) {
    const validFiles = Array.from(files).filter(file => file.type === 'application/pdf');

    if (validFiles.length === 0) {
        showToast('Please upload valid PDF files.', 'error');
        return;
    }

    // Add to state
    const newFiles = validFiles.map(file => ({
        id: Math.random().toString(36).substr(2, 9),
        file: file,
        name: file.name
    }));

    selectedFiles = [...selectedFiles, ...newFiles];
    updateUI();
}

function updateUI(movedIndex = null) {
    if (selectedFiles.length > 0) {
        dropZone.style.display = 'none';
        fileListContainer.style.display = 'block';
        if (!sortableInstance && typeof Sortable !== 'undefined') {
            sortableInstance = Sortable.create(fileList, {
                animation: 180,
                ghostClass: 'sortable-ghost',
                dragClass: 'sortable-drag',
                handle: '.drag-handle',
                scroll: true,
                scrollSensitivity: 60,
                scrollSpeed: 12,
                onEnd: (evt) => {
                    if (evt.oldIndex === evt.newIndex) return;
                    const item = selectedFiles.splice(evt.oldIndex, 1)[0];
                    selectedFiles.splice(evt.newIndex, 0, item);
                    updateUI(evt.newIndex);
                }
            });
        }
    } else {
        dropZone.style.display = 'block';
        fileListContainer.style.display = 'none';
        if (sortableInstance) {
            sortableInstance.destroy();
            sortableInstance = null;
        }
    }

    renderFileList(movedIndex);
}

function renderFileList(movedIndex = null) {
    fileList.innerHTML = '';
    selectedFiles.forEach((fileObj, index) => {
        const li = document.createElement('li');
        li.className = 'file-item';
        li.setAttribute('data-id', fileObj.id);
        if (index === movedIndex) {
            li.classList.add('moved');
        }

        // Add Up/Down buttons and drag handle
        const isFirst = index === 0;
        const isLast = index === selectedFiles.length - 1;

        li.innerHTML = `
            <div class="file-row">
                <button class="drag-handle" title="Drag to reorder" aria-label="Drag to reorder">
                    <i class="fa-solid fa-hand"></i>
                </button>
                <div class="order-controls" style="display: flex; flex-direction: column; gap: 4px; margin-right: 0.5rem;">
                    <button class="arrow-btn" onclick="moveUp(${index})" ${isFirst ? 'disabled' : ''} title="Move Up">
                        <i class="fa-solid fa-chevron-up"></i>
                    </button>
                    <button class="arrow-btn" onclick="moveDown(${index})" ${isLast ? 'disabled' : ''} title="Move Down">
                        <i class="fa-solid fa-chevron-down"></i>
                    </button>
                </div>
                <span class="file-number">${index + 1}.</span>
                <div class="file-meta">
                    <div class="file-title">
                        <i class="fa-solid fa-file-pdf"></i>
                        <span class="file-name" title="${fileObj.name}">${fileObj.name}</span>
                    </div>
                    <span class="file-size">${formatBytes(fileObj.file.size)}</span>
                </div>
            </div>
            <button class="remove-btn" onclick="removeFile('${fileObj.id}')" title="Remove"><i class="fa-solid fa-trash"></i></button>
        `;
        fileList.appendChild(li);
    });
}

// Global scope for onclick handlers
window.removeFile = (fileId) => {
    selectedFiles = selectedFiles.filter(f => f.id !== fileId);
    updateUI();
};

window.moveUp = (index) => {
    if (index > 0) {
        const item = selectedFiles[index];
        selectedFiles[index] = selectedFiles[index - 1];
        selectedFiles[index - 1] = item;
        updateUI(index - 1);
    }
};

window.moveDown = (index) => {
    if (index < selectedFiles.length - 1) {
        const item = selectedFiles[index];
        selectedFiles[index] = selectedFiles[index + 1];
        selectedFiles[index + 1] = item;
        updateUI(index + 1);
    }
};

// Add utility function if not exists
if (typeof formatBytes === 'undefined') {
    window.formatBytes = (bytes, decimals = 2) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    };
}
