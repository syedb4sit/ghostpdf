const { PDFDocument, rgb, degrees, StandardFonts } = PDFLib;

let currentFile = null;
let previewPdf = null;
let currentTab = window.location.pathname.includes('page-numbers-pdf')
    ? 'numbers'
    : (document.querySelector('.tab-btn.active')?.dataset.tab || 'text');

// DOM Overlay State
let isDragging = false;
let isResizing = false;
let isRotating = false;
let startX, startY;
let initialLeft, initialTop;
let initialFontSize;
let initialWidth, initialHeight; // For image resizing
let initialRotation = 0; // Current rotation in degrees
let centerX, centerY; // Center of the element for rotation calculation


// Elements
const canvas = document.getElementById('pdf-canvas');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('watermark-overlay');
const overlayContent = document.getElementById('overlay-content');
const resizeHandle = document.getElementById('resize-handle');
const rotateHandle = document.getElementById('rotate-handle');
const previewWrapper = document.getElementById('preview-wrapper');

// Inputs
const inputs = {
    text: document.getElementById('wm-text'),
    size: document.getElementById('wm-size'),
    opacity: document.getElementById('wm-opacity'),
    rotation: document.getElementById('wm-rotation'),
    color: document.getElementById('wm-color'),
    imageInput: document.getElementById('wm-image-input'),
    imageOpacity: document.getElementById('wm-image-opacity'),
    imageRotation: document.getElementById('wm-image-rotation'),
    pnFormat: document.getElementById('pn-format'),
    pnPosition: document.getElementById('pn-position'),
    pnStart: document.getElementById('pn-start')
};

let watermarkImageSrc = null;

initDropZone('drop-zone', 'file-input', (files) => handleFile(files[0]));

// Tabs & Visibility
document.querySelectorAll('.tab-btn').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentTab = tab.dataset.tab;

        ['text', 'image', 'numbers'].forEach(t => {
            const el = document.getElementById(`${t}-controls`);
            if (el) el.style.display = t === currentTab ? 'block' : 'none';
        });

        updateOverlayVisibility();
    });
});

function updateOverlayVisibility() {
    if (currentTab === 'numbers') {
        overlay.style.display = 'none'; // Numbers handled simply by canvas draw for now (simpler)
        renderPreview();
    } else {
        overlay.style.display = 'flex';
        renderPreview(); // Renders base PDF
        updateOverlayContent(); // Updates the DIV on top
    }
}

// Live Updates for Overlay Content
['text', 'size', 'color', 'opacity', 'rotation', 'imageOpacity', 'imageRotation'].forEach(id => {
    // Map internal ID to HTML ID correctly
    let elementId = `wm-${id}`;
    if (id === 'imageRotation') elementId = 'wm-image-rotation';
    if (id === 'imageOpacity') elementId = 'wm-image-opacity';

    const el = document.getElementById(elementId);
    if (el) el.addEventListener('input', () => updateOverlayContent());
});

// Unified Input Handling (Mouse & Touch)
function getEventPos(e) {
    if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
}

function handleStart(e, action) {
    // Prevent default to stop scrolling while dragging/rotating on touch
    if (e.type === 'touchstart') e.preventDefault();

    // Stop propagation for handles
    if (action === 'resize' || action === 'rotate') e.stopPropagation();

    const pos = getEventPos(e);

    if (action === 'drag') {
        if (e.target === resizeHandle || e.target === rotateHandle) return;
        isDragging = true;
        startX = pos.x;
        startY = pos.y;
        initialLeft = overlay.offsetLeft;
        initialTop = overlay.offsetTop;
        overlay.style.cursor = 'grabbing';
    } else if (action === 'resize') {
        isResizing = true;
        startX = pos.x;
        initialWidth = overlay.offsetWidth;
        initialFontSize = parseInt(inputs.size.value);
    } else if (action === 'rotate') {
        isRotating = true;
        const rect = overlay.getBoundingClientRect();
        centerX = rect.left + rect.width / 2;
        centerY = rect.top + rect.height / 2;
        overlay.style.cursor = 'grabbing';
        document.body.style.cursor = 'grabbing';
    }
}

function handleMove(e) {
    const pos = getEventPos(e);

    if (isDragging) {
        if (e.type === 'touchmove') e.preventDefault();

        const dx = pos.x - startX;
        const dy = pos.y - startY;

        let newLeft = initialLeft + dx;
        let newTop = initialTop + dy;

        // CENTER SNAPPING LOGIC
        // Since transform is translate(-50%, -50%), the element is centered when left = 50% of container
        const containerWidth = previewWrapper.offsetWidth;
        const containerHeight = previewWrapper.offsetHeight;
        const centerX = containerWidth / 2;
        const centerY = containerHeight / 2;

        const snapDist = 25; // Distance in pixels to snap

        // Check horizontal snap
        if (Math.abs(newLeft - centerX) < snapDist) {
            newLeft = centerX;
        }

        // Check vertical snap
        if (Math.abs(newTop - centerY) < snapDist) {
            newTop = centerY;
        }

        overlay.style.left = `${newLeft}px`;
        overlay.style.top = `${newTop}px`;

    } else if (isResizing) {
        if (e.type === 'touchmove') e.preventDefault();

        const dx = pos.x - startX;
        if (currentTab === 'text') {
            const newSize = Math.max(10, initialFontSize + dx * 0.5);
            inputs.size.value = Math.round(newSize);
            updateOverlayContent();
        } else if (currentTab === 'image') {
            const newWidth = Math.max(20, initialWidth + dx);
            const img = overlayContent.querySelector('img');
            if (img) {
                img.style.width = `${newWidth}px`;
                img.style.height = 'auto';
            }
        }
    } else if (isRotating) {
        if (e.type === 'touchmove') e.preventDefault();

        const dx = pos.x - centerX;
        const dy = pos.y - centerY;
        let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;

        while (angle > 180) angle -= 360;
        while (angle < -180) angle += 360;

        // Increased snap threshold for easier "sticking" to 0, 45, 90 etc.
        const snapThreshold = 15;
        const snapAngles = [0, 45, 90, 135, 180, -45, -90, -135, -180];

        for (const snap of snapAngles) {
            if (Math.abs(angle - snap) < snapThreshold) {
                angle = snap;
                break;
            }
        }

        if (currentTab === 'text') {
            inputs.rotation.value = Math.round(angle);
        } else if (currentTab === 'image') {
            inputs.imageRotation.value = Math.round(angle);
        }
        updateOverlayContent();
    }
}

function handleEnd() {
    isDragging = false;
    isResizing = false;
    isRotating = false;
    overlay.style.cursor = 'move';
    document.body.style.cursor = 'default';
}

// Mouse Listeners
overlay.addEventListener('mousedown', (e) => handleStart(e, 'drag'));
resizeHandle.addEventListener('mousedown', (e) => handleStart(e, 'resize'));
rotateHandle.addEventListener('mousedown', (e) => handleStart(e, 'rotate'));
window.addEventListener('mousemove', handleMove);
window.addEventListener('mouseup', handleEnd);

// Touch Listeners
overlay.addEventListener('touchstart', (e) => handleStart(e, 'drag'), { passive: false });
resizeHandle.addEventListener('touchstart', (e) => handleStart(e, 'resize'), { passive: false });
rotateHandle.addEventListener('touchstart', (e) => handleStart(e, 'rotate'), { passive: false });
window.addEventListener('touchmove', handleMove, { passive: false });
window.addEventListener('touchend', handleEnd);


async function handleFile(file) {
    if (file.type !== 'application/pdf') return;
    currentFile = file;
    document.getElementById('file-name-display').textContent = file.name;
    const arrayBuffer = await file.arrayBuffer();
    previewPdf = await pdfjsLib.getDocument(arrayBuffer).promise;

    document.getElementById('upload-stage').style.display = 'none';
    document.getElementById('edit-stage').style.display = 'block';

    // Initial render
    await renderPreviewsBase();

    // Set initial position/preview based on active tab
    setTimeout(() => {
        if (currentTab === 'numbers') {
            overlay.style.display = 'none';
            drawPageNumbersPreview();
        } else {
            overlay.style.display = 'flex';
            overlay.style.left = '50%';
            overlay.style.top = '50%';
            updateOverlayContent();
        }
    }, 100);
}

async function renderPreviewsBase() {
    const page = await previewPdf.getPage(1);
    // const scale = 1.0; 
    const containerWidth = document.querySelector('.preview-container').offsetWidth - 40;
    const unscaledViewport = page.getViewport({ scale: 1 });
    const fitScale = containerWidth / unscaledViewport.width;
    const viewport = page.getViewport({ scale: Math.min(1.5, fitScale) });

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: ctx, viewport }).promise;
}


// Just renders the background PDF (if page numbers) OR clears for Overlay mode
async function renderPreview() {
    if (currentTab === 'numbers') {
        await renderPreviewsBase();
        drawPageNumbersPreview();
    }
    // If Text/Image, Base is already rendered, Overlay handles the rest
}

function updateOverlayContent() {
    // Rotation handled per type below

    if (currentTab === 'text') {
        const text = inputs.text.value || '';
        const size = inputs.size.value;
        const opacity = inputs.opacity.value;
        const color = inputs.color.value;
        const rotation = inputs.rotation.value;

        overlay.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;

        overlayContent.innerHTML = `<span style="
            font-size: ${size}px; 
            color: ${color}; 
            opacity: ${opacity}; 
            display: block;
            font-family: Arial, sans-serif;
            font-weight: bold;
        ">${text}</span>`;

        resizeHandle.style.display = 'block';
        rotateHandle.style.display = 'block';
        overlay.style.border = '2px dashed hsl(var(--primary))';

    } else if (currentTab === 'image') {
        const opacity = inputs.imageOpacity.value;
        const rotation = inputs.imageRotation.value;

        if (!watermarkImageSrc) {
            overlayContent.innerHTML = `<div style="
                text-align: center; 
                padding: 1rem; 
                color: hsl(var(--text-muted)); 
                border: 2px dashed var(--glass-border); 
                border-radius: 4px;
                font-size: 0.9rem;
                pointer-events: none;
                white-space: normal;
                min-width: 150px;
            ">Select Image<br>from Settings</div>`;

            resizeHandle.style.display = 'none';
            rotateHandle.style.display = 'none';
            // Hide border for placeholder
            overlay.style.border = 'none';

            overlay.style.transform = `translate(-50%, -50%) rotate(0deg)`;
            return;
        }

        // Apply Image Rotation
        overlay.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
        overlay.style.border = '2px dashed hsl(var(--primary))';

        // Check if image already exists
        let img = overlayContent.querySelector('img');
        if (!img) {
            const baseWidth = 200;
            overlayContent.innerHTML = `<img src="${watermarkImageSrc}" style="
                width: ${baseWidth}px;
                height: auto;
                opacity: ${opacity};
                display: block;
                pointer-events: none;
            ">`;
        } else {
            img.style.opacity = opacity;
        }

        resizeHandle.style.display = 'block';
        rotateHandle.style.display = 'block';
    }
}

// Image upload
inputs.imageInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            watermarkImageSrc = ev.target.result;
            // Clear content to force re-render
            overlayContent.innerHTML = '';
            // Reset state defaults
            inputs.imageRotation.value = 0;
            inputs.imageOpacity.value = 0.5;

            updateOverlayContent();
        };
        reader.readAsDataURL(file);
    }
});


function drawPageNumbersPreview() {
    // Basic canvas draw for page numbers (non-interactive)
    const format = inputs.pnFormat.value;
    const position = inputs.pnPosition.value;
    const start = inputs.pnStart.value;

    let text = format === 'simple' ? `Page ${start}` :
        format === 'of' ? `Page ${start} of ${previewPdf.numPages}` : `- ${start} -`;

    ctx.save();
    ctx.font = '16px Arial';
    ctx.fillStyle = 'black';
    let x = 0, y = 0;
    const pad = 20;
    const w = canvas.width;
    const h = canvas.height;

    if (position.includes('bottom')) y = h - pad; else y = pad + 10;
    if (position.includes('left')) { x = pad; ctx.textAlign = 'left'; }
    else if (position.includes('right')) { x = w - pad; ctx.textAlign = 'right'; }
    else { x = w / 2; ctx.textAlign = 'center'; }

    ctx.fillText(text, x, y);
    ctx.restore();
}

inputs.pnFormat?.addEventListener('change', () => { if (currentTab === 'numbers') renderPreview(); });
inputs.pnPosition?.addEventListener('change', () => { if (currentTab === 'numbers') renderPreview(); });
inputs.pnStart?.addEventListener('input', () => { if (currentTab === 'numbers') renderPreview(); });


// GENERATE PDF logic
async function generatePDF() {
    if (!currentFile) throw new Error("No file loaded");
    const arrayBuffer = await currentFile.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const pages = pdfDoc.getPages();

    if (currentTab === 'text' || currentTab === 'image') {
        const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

        // Calculate overlay position relative to rendered PDF canvas only when overlay is visible
        const canvasRect = canvas.getBoundingClientRect();
        const overlayRect = overlay.getBoundingClientRect();

        if (canvasRect.width > 0 && canvasRect.height > 0) {
            const visualX = (overlayRect.left + overlayRect.width / 2) - canvasRect.left;
            const visualY = (overlayRect.top + overlayRect.height / 2) - canvasRect.top;

            let embeddedImage = null;
            let visualWidth = 200;
            let visualHeight = 200;

            if (currentTab === 'image' && watermarkImageSrc) {
                const imgBytes = await fetch(watermarkImageSrc).then(res => res.arrayBuffer());
                const isPng = watermarkImageSrc.startsWith('data:image/png');
                embeddedImage = isPng ? await pdfDoc.embedPng(imgBytes) : await pdfDoc.embedJpg(imgBytes);
                const imgDom = overlayContent.querySelector('img');
                visualWidth = imgDom ? (parseFloat(imgDom.style.width) || 200) : 200;
                visualHeight = (imgDom && imgDom.naturalWidth)
                    ? (imgDom.naturalHeight * (visualWidth / imgDom.naturalWidth))
                    : visualWidth;
            }

            for (const page of pages) {
                const pw = page.getWidth();
                const ph = page.getHeight();
                const scaleX = pw / canvasRect.width;
                const scaleY = ph / canvasRect.height;

                if (currentTab === 'text') {
                    const text = inputs.text.value || '';
                    if (!text) continue;
                    const textSize = parseInt(inputs.size.value, 10) * scaleX;
                    const opacity = parseFloat(inputs.opacity.value);
                    const rotation = parseInt(inputs.rotation.value, 10);
                    const colorHex = inputs.color.value;
                    const r = parseInt(colorHex.slice(1, 3), 16) / 255;
                    const g = parseInt(colorHex.slice(3, 5), 16) / 255;
                    const b = parseInt(colorHex.slice(5, 7), 16) / 255;

                    const pdfCx = visualX * scaleX;
                    const pdfCy = ph - (visualY * scaleY);
                    const textWidth = font.widthOfTextAtSize(text, textSize);
                    const textHeight = font.heightAtSize(textSize);

                    const dx = textWidth / 2;
                    const dy = textHeight / 2 - (textHeight * 0.1);
                    const pdfRotation = -rotation;
                    const rad = pdfRotation * (Math.PI / 180);
                    const cos = Math.cos(rad);
                    const sin = Math.sin(rad);

                    const rotDx = dx * cos - dy * sin;
                    const rotDy = dx * sin + dy * cos;

                    page.drawText(text, {
                        x: pdfCx - rotDx,
                        y: pdfCy - rotDy,
                        size: textSize,
                        font: font,
                        opacity: opacity,
                        color: rgb(r, g, b),
                        rotate: degrees(pdfRotation),
                    });
                } else if (currentTab === 'image' && embeddedImage) {
                    const pdfImgW = visualWidth * scaleX;
                    const pdfImgH = visualHeight * scaleY;
                    const pdfCx = visualX * scaleX;
                    const pdfCy = ph - (visualY * scaleY);

                    const dx = pdfImgW / 2;
                    const dy = pdfImgH / 2;
                    const pdfRotation = -parseInt(inputs.imageRotation.value, 10);
                    const rad = pdfRotation * (Math.PI / 180);
                    const cos = Math.cos(rad);
                    const sin = Math.sin(rad);

                    const rotDx = dx * cos - dy * sin;
                    const rotDy = dx * sin + dy * cos;

                    page.drawImage(embeddedImage, {
                        x: pdfCx - rotDx,
                        y: pdfCy - rotDy,
                        width: pdfImgW,
                        height: pdfImgH,
                        opacity: parseFloat(inputs.imageOpacity.value),
                        rotate: degrees(pdfRotation)
                    });
                }
            }
        }
    } else if (currentTab === 'numbers') {
        const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const format = inputs.pnFormat.value;
        const position = inputs.pnPosition.value;
        const parsedStart = parseInt(inputs.pnStart.value, 10);
        const start = Number.isNaN(parsedStart) ? 1 : parsedStart;

        pages.forEach((page, idx) => {
            const num = start + idx;
            const text = format === 'simple' ? `Page ${num}` :
                format === 'of' ? `Page ${num} of ${pages.length}` : `- ${num} -`;

            const { width, height } = page.getSize();
            const fontSize = 12;
            const textWidth = helveticaFont.widthOfTextAtSize(text, fontSize);
            const y = position.includes('bottom') ? 20 : height - 20 - fontSize;

            let x;
            if (position.includes('left')) x = 20;
            else if (position.includes('right')) x = Math.max(20, width - 20 - textWidth);
            else x = (width - textWidth) / 2;

            page.drawText(text, {
                x,
                y,
                size: fontSize,
                font: helveticaFont,
                color: rgb(0, 0, 0)
            });
        });
    }

    return await pdfDoc.save();
}

// Modal Logic
const previewModal = document.getElementById('preview-modal');
const previewFrame = document.getElementById('preview-frame');

window.closePreviewModal = () => {
    previewModal.style.display = 'none';
    previewFrame.src = '';
};

document.getElementById('preview-full-btn').addEventListener('click', async () => {
    const btn = document.getElementById('preview-full-btn');
    const originalText = btn.innerHTML;

    try {
        // Loading State
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Generating Preview...`;

        // Small timeout to allow UI to update before heavy processing
        await new Promise(resolve => setTimeout(resolve, 50));

        const bytes = await generatePDF();
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);

        previewFrame.src = url;
        previewModal.style.display = 'flex';

    } catch (e) {
        console.error(e);
        showToast('Preview generation failed', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
});

// Close modal on outside click
previewModal.addEventListener('click', (e) => {
    if (e.target === previewModal) closePreviewModal();
});

document.getElementById('process-btn').addEventListener('click', async () => {
    const btn = document.getElementById('process-btn');
    const originalText = btn.innerHTML;
    try {
        btn.disabled = true;
        btn.innerHTML = 'Processing...';

        const bytes = await generatePDF();
        const prefix = currentTab === 'numbers' ? 'numbered_' : 'watermarked_';
        downloadFile(new Blob([bytes], { type: 'application/pdf' }), `${prefix}${currentFile.name}`);
        showToast('Success!', 'success');
    } catch (e) {
        console.error(e);
        showToast('Error saving PDF', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
});

window.resetFile = () => {
    currentFile = null;
    document.getElementById('upload-stage').style.display = 'block';
    document.getElementById('edit-stage').style.display = 'none';
    const fi = document.getElementById('file-input');
    if (fi) fi.value = '';
};
