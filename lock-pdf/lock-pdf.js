const { PDFDocument } = PDFLib;
const isUnlockMode = window.location.pathname.includes('unlock-pdf');

let currentFile = null;
let pdfDoc = null;
let arrayBuffer = null;
let isEncrypted = false;

// Initialize Dropzone
initDropZone('drop-zone', 'file-input', (files) => handleFile(files[0]));

// ---------------------------------------------------------
// PROGRESS UI
// ---------------------------------------------------------
function showProgress(title, text) {
    document.getElementById('upload-stage').style.display = 'none';
    document.getElementById('security-stage').style.display = 'none';
    document.getElementById('progress-overlay').style.display = 'block';
    document.getElementById('progress-title').textContent = title;
    document.getElementById('progress-text').textContent = text;
    document.getElementById('progress-bar').style.width = '0%';
    document.getElementById('progress-percent').textContent = '0%';
}

function updateProgress(current, total) {
    const pct = Math.round((current / total) * 100);
    document.getElementById('progress-bar').style.width = pct + '%';
    document.getElementById('progress-percent').textContent = pct + '%';
    document.getElementById('progress-text').textContent = `Processing page ${current} of ${total}`;
}

function hideProgress() {
    document.getElementById('progress-overlay').style.display = 'none';
}

// ---------------------------------------------------------
// Handle File Select
// ---------------------------------------------------------
async function handleFile(file) {
    if (file.type !== 'application/pdf') {
        showToast('Please upload a PDF file', 'error');
        return;
    }

    currentFile = file;
    document.getElementById('file-name').textContent = file.name;
    document.getElementById('upload-stage').style.display = 'none';
    document.getElementById('security-stage').style.display = 'block';

    hideAllStates();
    document.getElementById('file-status-text').textContent = 'Analyzing security...';

    arrayBuffer = await file.arrayBuffer();

    // Use pdf.js to detect encryption (it handles all encryption formats)
    try {
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer.slice(0) });
        const pdf = await loadingTask.promise;
        // If successful without password, it's NOT encrypted
        pdf.destroy();

        if (isUnlockMode) {
            showToast('This PDF is not password-protected (already unlocked).', 'info');
            resetFile();
            return;
        }

        isEncrypted = false;
        showState('unlocked');
        document.getElementById('file-status-text').textContent = 'Unsecured PDF';
        document.getElementById('file-status-icon').className = 'fa-solid fa-lock-open';
        document.getElementById('file-status-icon').style.color = '#4caf50';

        // Also load with pdf-lib for copy/manipulation
        try {
            pdfDoc = await PDFDocument.load(arrayBuffer);
        } catch (e) {
            // pdf-lib can't load it but pdf.js can — that's fine, pdfDoc stays null
            pdfDoc = null;
        }
    } catch (e) {
        if (e && e.name === 'PasswordException') {
            if (!isUnlockMode) {
                showToast('This PDF is already password-protected. Use Unlock PDF to remove its password.', 'warning');
                resetFile();
                return;
            }
            isEncrypted = true;
            showState('locked');
            document.getElementById('file-status-text').textContent = 'Encrypted PDF';
            document.getElementById('file-status-icon').className = 'fa-solid fa-lock';
            document.getElementById('file-status-icon').style.color = '#ff6b6b';
        } else {
            console.error(e);
            showToast('Error loading PDF', 'error');
            resetFile();
        }
    }
}

// UI State Management
function hideAllStates() {
    document.querySelectorAll('.security-state').forEach(el => el.style.display = 'none');
}

function showState(state) {
    hideAllStates();
    document.getElementById(`state-${state}`).style.display = 'block';
}

// ---------------------------------------------------------
// HELPER: Render PDF pages via pdf.js → encrypted PDF via jsPDF
// ---------------------------------------------------------
async function renderAndEncrypt(sourceBuffer, password, progressTitle) {
    showProgress(progressTitle || 'Encrypting...', 'Loading document...');

    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(sourceBuffer) });
    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;

    let doc = null;

    for (let i = 1; i <= totalPages; i++) {
        updateProgress(i, totalPages);

        const page = await pdf.getPage(i);
        const scale = 2.0;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');

        await page.render({ canvasContext: ctx, viewport }).promise;

        const imgData = canvas.toDataURL('image/jpeg', 0.92);

        // Convert to points (72 DPI)
        const wPt = (viewport.width / scale) * (72 / 96);
        const hPt = (viewport.height / scale) * (72 / 96);

        if (i === 1) {
            doc = new jsPDF({
                orientation: wPt > hPt ? 'l' : 'p',
                unit: 'pt',
                format: [wPt, hPt],
                encryption: {
                    userPassword: password,
                    ownerPassword: password,
                    userPermissions: ['print', 'modify', 'copy', 'annot-forms']
                }
            });
        } else {
            doc.addPage([wPt, hPt], wPt > hPt ? 'l' : 'p');
        }

        doc.addImage(imgData, 'JPEG', 0, 0, wPt, hPt);
    }

    pdf.destroy();
    hideProgress();
    return doc;
}

// ---------------------------------------------------------
// ACTION: ENCRYPT (Lock an open PDF)
// ---------------------------------------------------------
document.getElementById('btn-encrypt').addEventListener('click', async () => {
    const password = document.getElementById('new-password').value;
    if (!password) {
        showToast('Please enter a password', 'warning');
        return;
    }

    try {
        const doc = await renderAndEncrypt(arrayBuffer, password, 'Encrypting PDF...');
        doc.save(`locked_${currentFile.name}`);
        showToast('PDF Encrypted Successfully!', 'success');
        resetFile();
    } catch (e) {
        hideProgress();
        console.error('Encryption Error:', e);
        showToast(`Encryption failed: ${e.message}`, 'error');
        // Show security stage again
        document.getElementById('security-stage').style.display = 'block';
    }
});

// ---------------------------------------------------------
// ACTION: UNLOCK (Decrypt a locked PDF) — uses pdf.js
// ---------------------------------------------------------
document.getElementById('btn-unlock').addEventListener('click', async () => {
    const password = document.getElementById('unlock-password').value;
    const errorMsg = document.getElementById('auth-error');

    errorMsg.style.display = 'none';

    if (!password) {
        errorMsg.textContent = 'Please enter password';
        errorMsg.style.display = 'block';
        return;
    }

    try {
        // Use pdf.js to verify password (handles all encryption formats)
        const loadingTask = pdfjsLib.getDocument({
            data: arrayBuffer.slice(0),
            password: password
        });
        const pdf = await loadingTask.promise;
        pdf.destroy();

        // Password is correct! Now try to load with pdf-lib for manipulation
        try {
            pdfDoc = await PDFDocument.load(arrayBuffer, { password: password });
        } catch (e) {
            // pdf-lib can't handle this encryption format, but that's OK
            // We'll use pdf.js for operations that need the decrypted data
            pdfDoc = null;
        }

        // Store the password for later use (remove/change operations)
        window._currentPassword = password;

        if (isUnlockMode) {
            showToast('Password verified! Removing encryption...', 'success');
            document.getElementById('btn-remove-pass').click();
            return;
        }

        showState('managed');
        document.getElementById('file-status-text').textContent = 'Unlocked (Temporary)';
        document.getElementById('file-status-icon').className = 'fa-solid fa-unlock';
        document.getElementById('file-status-icon').style.color = '#2196f3';
        showToast('Password verified!', 'success');
    } catch (e) {
        console.error(e);
        errorMsg.style.display = 'block';
        errorMsg.textContent = 'Incorrect password. Please try again.';
    }
});

// ---------------------------------------------------------
// ACTION: MANAGE -> REMOVE PASSWORD
// ---------------------------------------------------------
document.getElementById('btn-remove-pass').addEventListener('click', async () => {
    try {
        showProgress('Removing Password...', 'Saving unlocked PDF...');

        // Method 1: If pdf-lib loaded the doc, just copy pages (preserves quality!)
        if (pdfDoc) {
            const newPdfDoc = await PDFDocument.create();
            const copiedPages = await newPdfDoc.copyPages(pdfDoc, pdfDoc.getPageIndices());
            copiedPages.forEach((page) => newPdfDoc.addPage(page));

            const pdfBytes = await newPdfDoc.save();
            hideProgress();
            downloadFile(new Blob([pdfBytes]), `unlocked_${currentFile.name}`);
            showToast('PDF Password Removed!', 'success');
            resetFile();
            return;
        }

        // Method 2: Fallback — render via pdf.js and recreate with jsPDF (no encryption)
        const loadingTask = pdfjsLib.getDocument({
            data: arrayBuffer.slice(0),
            password: window._currentPassword
        });
        const pdf = await loadingTask.promise;
        const totalPages = pdf.numPages;
        let doc = null;

        for (let i = 1; i <= totalPages; i++) {
            updateProgress(i, totalPages);
            const page = await pdf.getPage(i);
            const scale = 2.0;
            const viewport = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport }).promise;

            const imgData = canvas.toDataURL('image/jpeg', 0.92);
            const wPt = (viewport.width / scale) * (72 / 96);
            const hPt = (viewport.height / scale) * (72 / 96);

            if (i === 1) {
                doc = new jsPDF({
                    orientation: wPt > hPt ? 'l' : 'p',
                    unit: 'pt',
                    format: [wPt, hPt]
                });
            } else {
                doc.addPage([wPt, hPt], wPt > hPt ? 'l' : 'p');
            }
            doc.addImage(imgData, 'JPEG', 0, 0, wPt, hPt);
        }

        pdf.destroy();
        hideProgress();
        doc.save(`unlocked_${currentFile.name}`);
        showToast('PDF Password Removed!', 'success');
        resetFile();
    } catch (e) {
        hideProgress();
        console.error('Remove Pass Error:', e);
        showToast(`Failed: ${e.message}`, 'error');
        document.getElementById('security-stage').style.display = 'block';
    }
});

// ---------------------------------------------------------
// ACTION: MANAGE -> CHANGE PASSWORD
// ---------------------------------------------------------
const changePassForm = document.getElementById('change-pass-form');
document.getElementById('btn-change-pass-toggle').addEventListener('click', () => {
    const isHidden = changePassForm.style.display === 'none';
    changePassForm.style.display = isHidden ? 'block' : 'none';
});

document.getElementById('btn-save-new-pass').addEventListener('click', async () => {
    const newPass = document.getElementById('change-password-input').value;
    if (!newPass) {
        showToast('Please enter a new password', 'warning');
        return;
    }

    try {
        // Load with old password via pdf.js, then re-encrypt with new password
        const loadingTask = pdfjsLib.getDocument({
            data: arrayBuffer.slice(0),
            password: window._currentPassword
        });
        const pdf = await loadingTask.promise;

        // Render all pages then create new encrypted PDF
        showProgress('Changing Password...', 'Loading document...');
        const totalPages = pdf.numPages;
        let doc = null;

        for (let i = 1; i <= totalPages; i++) {
            updateProgress(i, totalPages);

            const page = await pdf.getPage(i);
            const scale = 2.0;
            const viewport = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');

            await page.render({ canvasContext: ctx, viewport }).promise;

            const imgData = canvas.toDataURL('image/jpeg', 0.92);
            const wPt = (viewport.width / scale) * (72 / 96);
            const hPt = (viewport.height / scale) * (72 / 96);

            if (i === 1) {
                doc = new jsPDF({
                    orientation: wPt > hPt ? 'l' : 'p',
                    unit: 'pt',
                    format: [wPt, hPt],
                    encryption: {
                        userPassword: newPass,
                        ownerPassword: newPass,
                        userPermissions: ['print', 'modify', 'copy', 'annot-forms']
                    }
                });
            } else {
                doc.addPage([wPt, hPt], wPt > hPt ? 'l' : 'p');
            }

            doc.addImage(imgData, 'JPEG', 0, 0, wPt, hPt);
        }

        pdf.destroy();
        hideProgress();

        doc.save(`resecured_${currentFile.name}`);
        showToast('Password Changed Successfully!', 'success');
        resetFile();
    } catch (e) {
        hideProgress();
        console.error('Change Pass Error:', e);
        showToast(`Failed: ${e.message}`, 'error');
        document.getElementById('security-stage').style.display = 'block';
    }
});


// ---------------------------------------------------------
// UTILS
// ---------------------------------------------------------
window.resetFile = () => {
    currentFile = null;
    pdfDoc = null;
    arrayBuffer = null;
    isEncrypted = false;
    window._currentPassword = null;

    hideProgress();
    document.getElementById('upload-stage').style.display = 'block';
    document.getElementById('security-stage').style.display = 'none';

    document.querySelectorAll('input').forEach(i => i.value = '');
    document.getElementById('auth-error').style.display = 'none';
    document.getElementById('change-pass-form').style.display = 'none';
    document.getElementById('file-input').value = '';
};

// Password Toggle Logic
document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const button = e.currentTarget;
        const inputId = button.getAttribute('data-target');
        const input = document.getElementById(inputId);
        const icon = button.querySelector('i');

        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        } else {
            input.type = 'password';
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    });
});
