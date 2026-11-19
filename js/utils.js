/* Global Utilities */

// Configure deferred third-party globals cleanly before tool scripts execute
if (typeof pdfjsLib !== 'undefined' && pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}
if (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF && !window.jsPDF) {
    window.jsPDF = window.jspdf.jsPDF;
}

// Initialize Toastify if not present (handled via CDN in HTML usually, but good to check)
const showToast = (text, type = 'info') => {
    let backgroundColor = 'linear-gradient(to right, #00b09b, #96c93d)';
    if (type === 'error') backgroundColor = 'linear-gradient(to right, #ff5f6d, #ffc371)';
    if (type === 'info') backgroundColor = 'linear-gradient(to right, #2193b0, #6dd5ed)';

    // We override styles in CSS, so minimal config here
    Toastify({
        text: text,
        duration: 3000,
        gravity: "top", // `top` or `bottom`
        position: "right", // `left`, `center` or `right`
        className: type,
        stopOnFocus: true, // Prevents dismissing of toast on hover
    }).showToast();
};

const readFileAsArrayBuffer = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
};

const readFileAsDataURL = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

const initDropZone = (dropZoneId, fileInputId, onFilesSelected) => {
    const dropZone = document.getElementById(dropZoneId);
    const fileInput = document.getElementById(fileInputId);

    if (!dropZone || !fileInput) return;

    dropZone.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            onFilesSelected(e.target.files);
        }
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
            onFilesSelected(e.dataTransfer.files);
        }
    });
};

const formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

// Common download helper
const downloadFile = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};
// Theme Toggling Logic
const updateThemeIcon = (theme) => {
    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) {
        themeBtn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
        const icon = themeBtn.querySelector('i');
        if (icon) {
            icon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
        }
    }
};

const initTheme = () => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
};

// Apply saved theme immediately after helper definitions so initial paint matches
initTheme();

let themeSwitchRafA = null;
let themeSwitchRafB = null;

const toggleTheme = () => {
    const root = document.documentElement;
    const currentTheme = root.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    cancelAnimationFrame(themeSwitchRafA);
    cancelAnimationFrame(themeSwitchRafB);

    root.classList.add('theme-switching');
    root.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);

    // Flush styles in this frame so the page snaps cleanly at 0ms while
    // .theme-ribbon-toggle keeps its spring physics animation intact.
    void root.offsetHeight;

    themeSwitchRafA = requestAnimationFrame(() => {
        themeSwitchRafB = requestAnimationFrame(() => {
            root.classList.remove('theme-switching');
        });
    });
};

// Smooth FAQ Accordion Logic
const initFaqAccordions = () => {
    document.querySelectorAll('.faq-toggle').forEach((button) => {
        if (button.dataset.faqBound === 'true') return;
        button.dataset.faqBound = 'true';

        button.addEventListener('click', function () {
            const isExpanded = this.getAttribute('aria-expanded') === 'true';
            const contentId = this.getAttribute('aria-controls');
            const content = contentId ? document.getElementById(contentId) : null;
            if (!content) return;

            content.getAnimations().forEach((a) => a.cancel());
            this.setAttribute('aria-expanded', isExpanded ? 'false' : 'true');

            if (!isExpanded) {
                content.style.display = 'block';
                content.style.overflow = 'hidden';
                const targetHeight = content.scrollHeight;
                const anim = content.animate(
                    [
                        { height: '0px', opacity: 0, paddingTop: '0px', paddingBottom: '0px' },
                        { height: `${targetHeight}px`, opacity: 1 }
                    ],
                    { duration: 220, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }
                );
                anim.onfinish = () => {
                    content.style.overflow = '';
                };
            } else {
                const startHeight = content.scrollHeight;
                content.style.overflow = 'hidden';
                const anim = content.animate(
                    [
                        { height: `${startHeight}px`, opacity: 1 },
                        { height: '0px', opacity: 0, paddingTop: '0px', paddingBottom: '0px' }
                    ],
                    { duration: 200, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }
                );
                anim.onfinish = () => {
                    content.style.display = 'none';
                    content.style.overflow = '';
                };
            }
        });
    });
};

// Initialize theme and shared UI widgets on load
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initFaqAccordions();

    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) {
        themeBtn.addEventListener('click', toggleTheme);
    }
});
