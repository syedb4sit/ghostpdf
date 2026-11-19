if (typeof PDFLib === 'undefined' || typeof pdfjsLib === 'undefined') {
    alert('Libraries failed to load. Please check your internet connection.');
    throw new Error('Libraries not loaded');
}
const { PDFDocument, degrees } = PDFLib;
const isRotateMode = window.location.pathname.includes('rotate-pdf');

// State
let images = []; // { id, dataUrl, originalIndex, rotation, cropped, type: 'image/png' }
let sourcePdfBytes = null;
let sourceFileName = 'edited_organized.pdf';
let currentEditId = null;
let fabricCanvas = null;
let cropRect = null;
let modalRotationDelta = 0;

// Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const editorStage = document.getElementById('editor-stage');
const pagesGrid = document.getElementById('pages-grid');
const saveBtn = document.getElementById('save-pdf-btn');
const loadingOverlay = document.getElementById('loading-overlay');

// Modal Elements
const editModal = document.getElementById('crop-modal');
const editPageNum = document.getElementById('crop-page-num');
const closeEditBtn = document.getElementById('close-editor');
const saveEditBtn = document.getElementById('save-edit-btn');
const toggleCropBtn = document.getElementById('toggle-crop-btn');

// Init
initDropZone('drop-zone', 'file-input', (files) => handleFile(files[0]));

// --- PDF Loading (Keep original PDF bytes for lossless save + render thumbnails) ---
async function handleFile(file) {
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
        showToast('Please upload a valid PDF.', 'error');
        return;
    }

    try {
        loadingOverlay.style.display = 'flex';
        await new Promise(r => setTimeout(r, 50));

        dropZone.style.display = 'none';
        editorStage.style.display = 'block';
        showToast('Loading PDF pages...', 'info');

        const arrayBuffer = await readFileAsArrayBuffer(file);
        sourcePdfBytes = arrayBuffer.slice(0);
        sourceFileName = isRotateMode ? `rotated_${file.name}` : `edited_${file.name}`;

        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) });
        const pdf = await loadingTask.promise;

        images = [];

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 });

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;

            const dataUrl = canvas.toDataURL('image/png');
            const id = Math.random().toString(36).slice(2, 11);

            images.push({
                id,
                dataUrl,
                originalIndex: i - 1,
                rotation: 0,
                cropped: false,
                type: 'image/png'
            });
        }

        updateUI();
        showToast(
            isRotateMode
                ? 'PDF loaded. Rotate individual pages or all pages at once.'
                : 'PDF loaded. Drag to reorder, crop, or delete pages.',
            'success'
        );
    } catch (e) {
        console.error(e);
        showToast('Error loading PDF: ' + e.message, 'error');
        dropZone.style.display = 'block';
        editorStage.style.display = 'none';
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

// --- UI & Grid ---
function updateUI() {
    pagesGrid.innerHTML = '';

    if (images.length > 0) {
        pagesGrid.style.display = 'grid';
    } else {
        pagesGrid.style.display = 'none';
    }

    images.forEach((img, index) => {
        const div = document.createElement('div');
        div.className = 'page-card';
        div.draggable = !isRotateMode;
        div.dataset.index = index;

        const isFirst = index === 0;
        const isLast = index === images.length - 1;

        const actionsHtml = isRotateMode
            ? `
                <button onclick="rotatePage(${index}, -90)" title="Rotate 90° Counter-Clockwise"><i class="fa-solid fa-rotate-left"></i></button>
                <button onclick="rotatePage(${index}, 90)" title="Rotate 90° Clockwise"><i class="fa-solid fa-rotate-right"></i></button>
            `
            : `
                <button onclick="moveImage(${index}, -1)" title="Move Backward" ${isFirst ? 'disabled style="opacity:0.35"' : ''}><i class="fa-solid fa-arrow-up"></i></button>
                <button onclick="moveImage(${index}, 1)" title="Move Forward" ${isLast ? 'disabled style="opacity:0.35"' : ''}><i class="fa-solid fa-arrow-down"></i></button>
                <button onclick="openEditor('${img.id}', ${index})" title="Crop & Edit Page"><i class="fa-solid fa-pen-to-square"></i></button>
                <button class="btn-danger" onclick="deletePage(${index})" title="Delete Page"><i class="fa-solid fa-trash"></i></button>
            `;

        div.innerHTML = `
            <div class="page-number-badge">Page ${index + 1}${img.cropped ? ' (Cropped)' : ''}</div>
            <div class="page-preview" style="background:#000;">
                <img src="${img.dataUrl}" alt="Page ${index + 1}" style="max-width:100%; max-height:100%; object-fit:contain;">
            </div>
            <div class="page-actions" style="flex-wrap:nowrap; gap:0; z-index:20;">
                ${actionsHtml}
            </div>
        `;

        if (!isRotateMode) {
            div.addEventListener('dragstart', handleDragStart);
            div.addEventListener('dragover', handleDragOver);
            div.addEventListener('drop', handleDrop);
            div.addEventListener('dragenter', handleDragEnter);
            div.addEventListener('dragleave', handleDragLeave);
            div.addEventListener('dragend', handleDragEnd);
        }

        pagesGrid.appendChild(div);
    });
}

// Helper to rotate preview thumbnail data URL cleanly
function rotateDataUrl(dataUrl, angleDeg) {
    return new Promise((resolve) => {
        const image = new Image();
        image.onload = () => {
            const norm = ((angleDeg % 360) + 360) % 360;
            const swap = norm === 90 || norm === 270;
            const canvas = document.createElement('canvas');
            canvas.width = swap ? image.height : image.width;
            canvas.height = swap ? image.width : image.height;
            const ctx = canvas.getContext('2d');
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate((norm * Math.PI) / 180);
            ctx.drawImage(image, -image.width / 2, -image.height / 2);
            resolve(canvas.toDataURL('image/png'));
        };
        image.src = dataUrl;
    });
}

// --- Interaction Logic ---
window.moveImage = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= images.length) return;
    const temp = images[index];
    images[index] = images[newIndex];
    images[newIndex] = temp;
    updateUI();
};

window.rotatePage = async (index, angle = 90) => {
    const item = images[index];
    if (!item) return;
    item.rotation = (((item.rotation || 0) + angle) % 360 + 360) % 360;
    item.dataUrl = await rotateDataUrl(item.dataUrl, angle);
    updateUI();
};

window.rotateAllPages = async (angle = 90) => {
    if (!images.length) return;
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) loadingOverlay.style.display = 'flex';
    try {
        for (const item of images) {
            item.rotation = (((item.rotation || 0) + angle) % 360 + 360) % 360;
            item.dataUrl = await rotateDataUrl(item.dataUrl, angle);
        }
        updateUI();
    } finally {
        if (loadingOverlay) loadingOverlay.style.display = 'none';
    }
};

window.deletePage = (index) => {
    if (images.length <= 1) {
        showToast('Cannot delete the last remaining page.', 'error');
        return;
    }
    images.splice(index, 1);
    updateUI();
    showToast('Page removed.', 'info');
};

window.deleteImage = (id) => {
    const idx = images.findIndex(img => img.id === id);
    if (idx !== -1) window.deletePage(idx);
};

// --- Drag & Drop ---
let dragSrcEl = null;

function handleDragStart(e) {
    dragSrcEl = this;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
    this.classList.add('dragging');
}

function handleDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDragEnter() {
    this.classList.add('over');
}

function handleDragLeave() {
    this.classList.remove('over');
}

function handleDrop(e) {
    if (e.stopPropagation) e.stopPropagation();

    if (dragSrcEl !== this) {
        const fromIndex = parseInt(dragSrcEl.dataset.index, 10);
        const toIndex = parseInt(this.dataset.index, 10);

        const item = images.splice(fromIndex, 1)[0];
        images.splice(toIndex, 0, item);

        updateUI();

        setTimeout(() => {
            const newCards = document.querySelectorAll('.page-card');
            if (newCards[toIndex]) newCards[toIndex].classList.add('moved');
        }, 50);
    }
    return false;
}

function handleDragEnd() {
    this.classList.remove('dragging');
    document.querySelectorAll('.page-card').forEach(card => card.classList.remove('over'));
}

// --- Editor Modal Logic ---
window.openEditor = (id, index) => {
    currentEditId = id;
    modalRotationDelta = 0;
    const imgObj = images.find(i => i.id === id);
    if (!imgObj) return;

    editModal.style.display = 'flex';
    editModal.style.zIndex = '10000';
    if (editPageNum) editPageNum.innerText = index + 1;

    const container = document.querySelector('#crop-modal .editor-container');
    container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;color:white;"><i class="fa-solid fa-circle-notch fa-spin fa-3x"></i></div>';

    if (fabricCanvas) {
        fabricCanvas.dispose();
        fabricCanvas = null;
    }

    setTimeout(() => {
        container.innerHTML = '<canvas id="crop-canvas"></canvas>';
        fabricCanvas = new fabric.Canvas('crop-canvas', { selection: false });
        setupFabricControls();

        cropRect = null;
        resetCropButton();

        fabric.Image.fromURL(imgObj.dataUrl, (img) => {
            const cWidth = container.clientWidth || 800;
            const cHeight = container.clientHeight || 600;
            fabricCanvas.setWidth(cWidth);
            fabricCanvas.setHeight(cHeight);

            const scale = Math.min(cWidth / img.width, cHeight / img.height) * 0.9;
            img.scale(scale);
            img.set({
                selectable: false,
                evented: false,
                hasControls: false,
                hasBorders: false,
                lockMovementX: true,
                lockMovementY: true,
                lockRotation: true,
                lockScalingX: true,
                lockScalingY: true
            });

            fabricCanvas.centerObject(img);
            fabricCanvas.add(img);
        });
    }, 50);
};

function setupFabricControls() {
    fabricCanvas.on('object:moving', function (e) {
        const obj = e.target;
        if (obj !== cropRect) return;

        const img = fabricCanvas.getObjects().find(o => o.type === 'image');
        if (!img) return;
        const imgBound = img.getBoundingRect();

        if (obj.left < imgBound.left) obj.left = imgBound.left;
        if (obj.top < imgBound.top) obj.top = imgBound.top;
        if ((obj.left + obj.getScaledWidth()) > (imgBound.left + imgBound.width)) {
            obj.left = (imgBound.left + imgBound.width) - obj.getScaledWidth();
        }
        if ((obj.top + obj.getScaledHeight()) > (imgBound.top + imgBound.height)) {
            obj.top = (imgBound.top + imgBound.height) - obj.getScaledHeight();
        }
    });

    fabricCanvas.on('object:scaling', function (e) {
        const obj = e.target;
        if (obj !== cropRect) return;

        const img = fabricCanvas.getObjects().find(o => o.type === 'image');
        if (!img) return;
        const imgBound = img.getBoundingRect();

        let actW = obj.getScaledWidth();
        let actH = obj.getScaledHeight();

        if (obj.left < imgBound.left) {
            obj.left = imgBound.left;
            obj.scaleX = (actW - (imgBound.left - obj.left)) / obj.width;
        }
        if (obj.top < imgBound.top) {
            obj.top = imgBound.top;
            obj.scaleY = (actH - (imgBound.top - obj.top)) / obj.height;
        }

        actW = obj.getScaledWidth();
        actH = obj.getScaledHeight();

        if (obj.left + actW > imgBound.left + imgBound.width) {
            obj.scaleX = (imgBound.left + imgBound.width - obj.left) / obj.width;
        }
        if (obj.top + actH > imgBound.top + imgBound.height) {
            obj.scaleY = (imgBound.top + imgBound.height - obj.top) / obj.height;
        }
    });
}

window.editorRotate = (angle) => {
    const activeObj = fabricCanvas.getObjects().find(o => o.type === 'image');
    if (activeObj) {
        const wasCropping = !!cropRect;
        if (cropRect) {
            fabricCanvas.remove(cropRect);
            cropRect = null;
        }

        modalRotationDelta = ((modalRotationDelta + angle) % 360 + 360) % 360;
        const currentAngle = (activeObj.angle || 0) + angle;
        activeObj.rotate(currentAngle);

        const normAngle = Math.abs(currentAngle % 180);
        const effW = normAngle === 90 ? activeObj.height : activeObj.width;
        const effH = normAngle === 90 ? activeObj.width : activeObj.height;

        const cW = fabricCanvas.width;
        const cH = fabricCanvas.height;
        const scale = Math.min(cW / effW, cH / effH) * 0.9;

        activeObj.scale(scale);
        fabricCanvas.centerObject(activeObj);
        activeObj.setCoords();
        fabricCanvas.requestRenderAll();

        if (wasCropping) resetCropButton();
    }
};

if (toggleCropBtn) {
    toggleCropBtn.onclick = () => {
        if (cropRect) stopCropMode();
        else startCropMode();
    };
}

function startCropMode() {
    if (cropRect) return;
    const activeObj = fabricCanvas.getObjects().find(o => o.type === 'image');
    if (!activeObj) return;

    const width = activeObj.getScaledWidth() * 0.8;
    const height = activeObj.getScaledHeight() * 0.8;

    cropRect = new fabric.Rect({
        left: fabricCanvas.width / 2 - width / 2,
        top: fabricCanvas.height / 2 - height / 2,
        width: width,
        height: height,
        fill: 'rgba(0,0,0,0)',
        stroke: '#fff',
        strokeWidth: 2,
        strokeDashArray: [5, 5],
        selectable: true,
        hasControls: true,
        cornerColor: 'white',
        cornerSize: 10,
        transparentCorners: false
    });
    fabricCanvas.add(cropRect);
    fabricCanvas.setActiveObject(cropRect);

    toggleCropBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> Cancel Crop';
    toggleCropBtn.classList.add('active');
}

function stopCropMode() {
    if (cropRect) {
        fabricCanvas.remove(cropRect);
        cropRect = null;
    }
    resetCropButton();
}

function resetCropButton() {
    toggleCropBtn.innerHTML = '<i class="fa-solid fa-crop-simple"></i> Crop';
    toggleCropBtn.classList.remove('active');
}

closeEditBtn.onclick = () => {
    editModal.style.display = 'none';
};

saveEditBtn.onclick = async () => {
    if (currentEditId) {
        const imgIndex = images.findIndex(i => i.id === currentEditId);
        if (imgIndex > -1) {
            const targetItem = images[imgIndex];

            if (cropRect) {
                cropRect.visible = false;

                const scaledWidth = cropRect.width * cropRect.scaleX;
                const scaledHeight = cropRect.height * cropRect.scaleY;
                let left = cropRect.left;
                let top = cropRect.top;
                let width = scaledWidth;
                let height = scaledHeight;

                if (width < 0) { width = Math.abs(width); left -= width; }
                if (height < 0) { height = Math.abs(height); top -= height; }

                targetItem.dataUrl = fabricCanvas.toDataURL({
                    left: left,
                    top: top,
                    width: width,
                    height: height,
                    format: 'png',
                    quality: 1,
                    multiplier: 2
                });
                targetItem.cropped = true;
                targetItem.rotation = 0;
                cropRect.visible = true;
            } else {
                // Keep vector lossless path when user only rotated inside modal
                if (modalRotationDelta !== 0) {
                    targetItem.rotation = (((targetItem.rotation || 0) + modalRotationDelta) % 360 + 360) % 360;
                    targetItem.dataUrl = await rotateDataUrl(targetItem.dataUrl, modalRotationDelta);
                }
            }
            updateUI();
            showToast('Changes applied', 'success');
        }
    }
    editModal.style.display = 'none';
};

function getTargetPageDimensions(contentWidth, contentHeight, pageSizeSetting, pageLayoutSetting) {
    if (pageSizeSetting === 'fit') {
        return { width: contentWidth, height: contentHeight };
    }

    let pageWidth = pageSizeSetting === 'letter' ? 612.0 : 595.28;
    let pageHeight = pageSizeSetting === 'letter' ? 792.0 : 841.89;

    const wantLandscape =
        pageLayoutSetting === 'landscape' ||
        (pageLayoutSetting === 'auto' && contentWidth > contentHeight);

    if (wantLandscape && pageHeight > pageWidth) {
        [pageWidth, pageHeight] = [pageHeight, pageWidth];
    } else if (!wantLandscape && pageWidth > pageHeight) {
        [pageWidth, pageHeight] = [pageHeight, pageWidth];
    }

    return { width: pageWidth, height: pageHeight };
}

// --- Save PDF (Lossless vector copy/embed for uncropped pages + PNG for cropped pages) ---
async function savePdf() {
    if (images.length === 0) return;

    const pageSizeSetting = document.getElementById('page-size')?.value || 'fit';
    const pageLayoutSetting = document.getElementById('page-layout')?.value || 'auto';
    const origSaveHtml = saveBtn.innerHTML;

    try {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

        const sourcePdfDoc = sourcePdfBytes ? await PDFDocument.load(sourcePdfBytes) : null;
        const pdfDoc = await PDFDocument.create();

        for (const p of images) {
            if (!p.cropped && sourcePdfDoc && typeof p.originalIndex === 'number') {
                const sourcePage = sourcePdfDoc.getPage(p.originalIndex);
                const origAngle = sourcePage.getRotation().angle || 0;
                const totalAngle = (((origAngle + (p.rotation || 0)) % 360) + 360) % 360;
                const rawSize = sourcePage.getSize();
                const isSwapped = totalAngle === 90 || totalAngle === 270;
                const visWidth = isSwapped ? rawSize.height : rawSize.width;
                const visHeight = isSwapped ? rawSize.width : rawSize.height;

                if (pageSizeSetting === 'fit') {
                    const [copiedPage] = await pdfDoc.copyPages(sourcePdfDoc, [p.originalIndex]);
                    if (p.rotation) {
                        copiedPage.setRotation(degrees(totalAngle));
                    }
                    pdfDoc.addPage(copiedPage);
                    continue;
                }

                // Target A4 or Letter while keeping vector content lossless via embedPage
                const { width: targetW, height: targetH } = getTargetPageDimensions(
                    visWidth,
                    visHeight,
                    pageSizeSetting,
                    pageLayoutSetting
                );

                try {
                    const embeddedPage = await pdfDoc.embedPage(sourcePage);
                    const page = pdfDoc.addPage([targetW, targetH]);
                    const scale = Math.min(targetW / visWidth, targetH / visHeight);
                    const drawW = rawSize.width * scale;
                    const drawH = rawSize.height * scale;

                    const pdfRotation = -totalAngle;
                    const rad = (pdfRotation * Math.PI) / 180;
                    const cos = Math.cos(rad);
                    const sin = Math.sin(rad);
                    const dx = drawW / 2;
                    const dy = drawH / 2;
                    const rotDx = dx * cos - dy * sin;
                    const rotDy = dx * sin + dy * cos;

                    page.drawPage(embeddedPage, {
                        x: targetW / 2 - rotDx,
                        y: targetH / 2 - rotDy,
                        xScale: scale,
                        yScale: scale,
                        rotate: degrees(pdfRotation)
                    });
                    continue;
                } catch (embedErr) {
                    // Fallback for blank source pages with empty content streams
                    const [copiedPage] = await pdfDoc.copyPages(sourcePdfDoc, [p.originalIndex]);
                    if (p.rotation) copiedPage.setRotation(degrees(totalAngle));
                    pdfDoc.addPage(copiedPage);
                    continue;
                }
            }

            // Raster path for user-cropped pages
            const imageBytes = await fetch(p.dataUrl).then(res => res.arrayBuffer());
            const embeddedImage = await pdfDoc.embedPng(imageBytes);
            const imgDims = embeddedImage.scale(1);
            const { width: pageWidth, height: pageHeight } = getTargetPageDimensions(
                imgDims.width,
                imgDims.height,
                pageSizeSetting,
                pageLayoutSetting
            );

            const page = pdfDoc.addPage([pageWidth, pageHeight]);
            const scale = Math.min(pageWidth / imgDims.width, pageHeight / imgDims.height);
            const finalW = imgDims.width * scale;
            const finalH = imgDims.height * scale;

            page.drawImage(embeddedImage, {
                x: (pageWidth - finalW) / 2,
                y: (pageHeight - finalH) / 2,
                width: finalW,
                height: finalH
            });
        }

        const savedBytes = await pdfDoc.save();
        const blob = new Blob([savedBytes], { type: 'application/pdf' });
        downloadFile(blob, sourceFileName);
        showToast('PDF Saved Successfully!', 'success');
    } catch (e) {
        console.error(e);
        showToast('Error saving: ' + e.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = origSaveHtml;
    }
}

saveBtn.addEventListener('click', savePdf);
