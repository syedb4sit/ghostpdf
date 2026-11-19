// Elements
const dropZone = document.getElementById('drop-zone');
const corruptStage = document.getElementById('corrupt-stage');
const fileNameEl = document.getElementById('file-name');
const corruptBtn = document.getElementById('corrupt-btn');

let currentFile = null;

// Init
initDropZone('drop-zone', 'file-input', (files) => handleFile(files[0]));

function handleFile(file) {
    if (file.type !== 'application/pdf') {
        showToast('Please upload a valid PDF.', 'error');
        return;
    }
    currentFile = file;
    fileNameEl.innerText = file.name;
    dropZone.style.display = 'none';
    corruptStage.style.display = 'block';
}

corruptBtn.addEventListener('click', async () => {
    try {
        const reader = new FileReader();
        reader.onload = function (e) {
            const arrayBuffer = e.target.result;
            const uint8Array = new Uint8Array(arrayBuffer);

            // Corrupt the header (magic bytes) to make it unrecognizable
            // PDF usually starts with %PDF-1.x
            for (let i = 0; i < 50; i++) {
                uint8Array[i] = Math.floor(Math.random() * 255);
            }

            // Corrupt random chunks through the file
            for (let i = 0; i < uint8Array.length; i += 100) {
                if (Math.random() > 0.5) {
                    uint8Array[i] = Math.floor(Math.random() * 255);
                }
            }

            const blob = new Blob([uint8Array], { type: 'application/pdf' });
            downloadFile(blob, `damaged_${currentFile.name}`);
            showToast('File corrupted and downloaded!', 'success');
        };
        reader.readAsArrayBuffer(currentFile);

    } catch (error) {
        showToast('Error: ' + error.message, 'error');
    }
});

window.resetFile = () => {
    currentFile = null;
    dropZone.style.display = 'block';
    corruptStage.style.display = 'none';
};
