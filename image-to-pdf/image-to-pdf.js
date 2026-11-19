if (typeof PDFLib === 'undefined') {
    alert('PDF Libraries failed to load. Please check your internet connection.');
    throw new Error('PDFLib not loaded');
}
const { PDFDocument } = PDFLib;

// State
let images = []; // { id, dataUrl, type: 'image/jpeg' | 'image/png' }
let currentEditId = null;
let fabricCanvas = null;

// Elements
const fileInput = document.getElementById('file-input');
const dropZone = document.getElementById('drop-zone');
const imageGrid = document.getElementById('image-grid');
const actionBar = document.getElementById('action-bar');
const convertBtn = document.getElementById('convert-btn');
const downloadAllBtn = document.getElementById('download-all-imgs-btn');

// Camera Elements
const cameraBtn = document.getElementById('camera-btn');
const cameraModal = document.getElementById('camera-modal');
const cameraVideo = document.getElementById('camera-video');
const captureBtn = document.getElementById('capture-btn');
const closeCameraBtn = document.getElementById('close-camera');
let mediaStream = null;

// Editor Elements
const editorModal = document.getElementById('editor-modal');
const closeEditorBtn = document.getElementById('close-editor');
const saveEditBtn = document.getElementById('save-edit-btn');
const toggleCropBtn = document.getElementById('toggle-crop-btn');
const cropInstruction = document.getElementById('crop-instruction');
const loadingOverlay = document.getElementById('loading-overlay');

// Init
initDropZone('drop-zone', 'file-input', (files) => handleFiles(files));

let gridSortable = null;
if (typeof Sortable !== 'undefined' && imageGrid) {
    gridSortable = Sortable.create(imageGrid, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        dragClass: 'sortable-drag',
        filter: '.img-actions, .img-actions button, .img-actions i',
        preventOnFilter: false,
        onEnd: () => {
            const orderedIds = Array.from(imageGrid.children).map((card) => card.dataset.id);
            const mapById = new Map(images.map((item) => [item.id, item]));
            images = orderedIds.map((id) => mapById.get(id)).filter(Boolean);
            syncGridMetadata();
        }
    });
}

function syncGridMetadata() {
    const cards = Array.from(imageGrid.children);
    cards.forEach((card, index) => {
        card.dataset.index = index;
        const badge = card.querySelector('.page-number-badge');
        if (badge) badge.textContent = `Page ${index + 1}`;

        const upBtn = card.querySelector('.move-up-btn');
        const downBtn = card.querySelector('.move-down-btn');
        if (upBtn) {
            upBtn.disabled = index === 0;
            upBtn.style.opacity = index === 0 ? '0.3' : '';
            upBtn.setAttribute('onclick', `moveImage(${index}, -1)`);
        }
        if (downBtn) {
            downBtn.disabled = index === cards.length - 1;
            downBtn.style.opacity = index === cards.length - 1 ? '0.3' : '';
            downBtn.setAttribute('onclick', `moveImage(${index}, 1)`);
        }
    });
}

// --- File Handling ---
async function handleFiles(files) {
    if (!files.length) return;

    try {
        loadingOverlay.style.display = 'flex';
        // Small delay to ensure overlay renders
        await new Promise(resolve => setTimeout(resolve, 50));

        for (const file of files) {
            if (!file.type.startsWith('image/')) continue;

            try {
                const dataUrl = await readFileAsDataURL(file);
                addImage(dataUrl);
            } catch (e) {
                console.error(e);
            }
        }
        updateUI();
    } catch (error) {
        console.error("Error processing files:", error);
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

function addImage(dataUrl) {
    const id = Math.random().toString(36).substr(2, 9);
    images.push({
        id,
        dataUrl,
        type: dataUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg'
    });
}

function updateUI() {
    imageGrid.innerHTML = '';

    if (images.length > 0) {
        imageGrid.style.display = 'grid';
        actionBar.style.display = 'flex';
        dropZone.style.display = 'none';
        if (downloadAllBtn) downloadAllBtn.style.display = 'block';
    } else {
        imageGrid.style.display = 'none';
        actionBar.style.display = 'none';
        dropZone.style.display = 'block';
        if (downloadAllBtn) downloadAllBtn.style.display = 'none';
    }

    images.forEach((img, index) => {
        const div = document.createElement('div');
        div.className = 'img-card';
        div.dataset.index = index;
        div.dataset.id = img.id;
        div.style.cursor = 'grab';

        const isFirst = index === 0;
        const isLast = index === images.length - 1;

        div.innerHTML = `
            <div class="page-number-badge">Page ${index + 1}</div>
            <img src="${img.dataUrl}" alt="Uploaded image ${index + 1}">
            <div class="img-actions" style="flex-wrap: wrap; gap: 2px;">
                <button class="move-up-btn" onclick="moveImage(${index}, -1)" title="Move Backward" ${isFirst ? 'disabled style="opacity:0.3"' : ''}><i class="fa-solid fa-arrow-up"></i></button>
                <button class="move-down-btn" onclick="moveImage(${index}, 1)" title="Move Forward" ${isLast ? 'disabled style="opacity:0.3"' : ''}><i class="fa-solid fa-arrow-down"></i></button>
                <button onclick="openEditor('${img.id}')" title="Crop & Rotate"><i class="fa-solid fa-pen-to-square"></i></button>
                <button class="delete" onclick="deleteImage('${img.id}')" title="Delete Image"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
        imageGrid.appendChild(div);
    });
}

window.moveImage = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= images.length) return;

    const temp = images[index];
    images[index] = images[newIndex];
    images[newIndex] = temp;

    updateUI();
};

window.deleteImage = (id) => {
    images = images.filter(img => img.id !== id);
    updateUI();
};


// --- Camera Logic ---
let currentFacingMode = 'user'; // 'user' or 'environment'

const startCamera = async () => {
    try {
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
        }
        mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: currentFacingMode }
        });
        cameraVideo.srcObject = mediaStream;
        cameraModal.style.display = 'flex';
    } catch (e) {
        showToast('Camera error: ' + e.message, 'error');
    }
};

cameraBtn.addEventListener('click', () => {
    currentFacingMode = 'user';
    startCamera();
});

document.getElementById('switch-camera-btn').addEventListener('click', () => {
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    startCamera();
});

const stopCamera = () => {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    cameraModal.style.display = 'none';
};

closeCameraBtn.addEventListener('click', stopCamera);

captureBtn.addEventListener('click', () => {
    const canvas = document.createElement('canvas');
    canvas.width = cameraVideo.videoWidth;
    canvas.height = cameraVideo.videoHeight;
    canvas.getContext('2d').drawImage(cameraVideo, 0, 0);

    // Convert to JPEG
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    addImage(dataUrl);
    updateUI();
    stopCamera();
    showToast('Photo captured!', 'success');
});


// --- Editor Logic ---
let isCropping = false;
let cropRect = null;

window.openEditor = (id) => {
    currentEditId = id;
    const imgObj = images.find(i => i.id === id);
    if (!imgObj) return;

    editorModal.style.display = 'flex';

    // Show Loader
    const container = document.querySelector('.editor-container');
    container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;color:white;"><i class="fa-solid fa-circle-notch fa-spin fa-3x"></i></div>';

    // Force re-init of canvas since we are replacing the DOM element
    if (fabricCanvas) {
        fabricCanvas.dispose(); // Cleanup old instance
        fabricCanvas = null;
    }

    setTimeout(() => {
        container.innerHTML = '<canvas id="fabric-canvas"></canvas>';

        // Init Canvas
        fabricCanvas = new fabric.Canvas('fabric-canvas', {
            // width/height will be set dynamically
            selection: false
        });

        // Add constraints
        fabricCanvas.on('object:moving', function (e) {
            const obj = e.target;
            if (obj !== cropRect) return;

            const img = fabricCanvas.getObjects().find(o => o.type === 'image');
            if (!img) return;

            const imgBound = img.getBoundingRect();

            // Constrain Top/Left
            if (obj.left < imgBound.left) obj.left = imgBound.left;
            if (obj.top < imgBound.top) obj.top = imgBound.top;

            // Constrain Right/Bottom
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

            // Prevent scaling out of bounds
            let actW = obj.getScaledWidth();
            let actH = obj.getScaledHeight();

            // Left
            if (obj.left < imgBound.left) {
                obj.left = imgBound.left;
                obj.scaleX = (actW - (imgBound.left - obj.left)) / obj.width;
            }
            // Top
            if (obj.top < imgBound.top) {
                obj.top = imgBound.top;
                obj.scaleY = (actH - (imgBound.top - obj.top)) / obj.height;
            }

            // Re-calc after move
            actW = obj.getScaledWidth();
            actH = obj.getScaledHeight();

            // Right
            if (obj.left + actW > imgBound.left + imgBound.width) {
                obj.scaleX = (imgBound.left + imgBound.width - obj.left) / obj.width;
            }
            // Bottom
            if (obj.top + actH > imgBound.top + imgBound.height) {
                obj.scaleY = (imgBound.top + imgBound.height - obj.top) / obj.height;
            }
        });

        // Load Image
        cropRect = null;
        resetCropButton();

        fabric.Image.fromURL(imgObj.dataUrl, (img) => {
            // Reset canvas dims
            fabricCanvas.setWidth(container.clientWidth || 800);
            fabricCanvas.setHeight(container.clientHeight || 400);

            const scale = Math.min(
                fabricCanvas.width / img.width,
                fabricCanvas.height / img.height
            ) * 0.8;

            img.scale(scale);

            // Disable user interaction with the image itself (no resizing/moving)
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

function startCropMode() {
    if (cropRect) return; // Already cropping

    // Add default crop rect
    const activeObj = fabricCanvas.getObjects().find(o => o.type === 'image'); // The image
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

    // Update Button
    toggleCropBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> Cancel Crop';
    toggleCropBtn.classList.add('btn-primary');
    toggleCropBtn.classList.remove('btn-secondary');
    cropInstruction.style.display = 'inline';
}

function stopCropMode() {
    if (cropRect) {
        fabricCanvas.remove(cropRect);
        cropRect = null;
    }
    resetCropButton();
}

function resetCropButton() {
    if (toggleCropBtn) {
        toggleCropBtn.innerHTML = '<i class="fa-solid fa-crop-simple"></i> Crop';
        toggleCropBtn.classList.remove('btn-primary');
        toggleCropBtn.classList.add('btn-secondary');
    }
    if (cropInstruction) cropInstruction.style.display = 'none';
}

if (toggleCropBtn) {
    toggleCropBtn.addEventListener('click', () => {
        if (cropRect) {
            stopCropMode();
        } else {
            startCropMode();
        }
    });
}


window.editorRotate = (angle) => {
    const activeObj = fabricCanvas.getObjects().find(o => o.type === 'image');
    if (activeObj) {
        const wasCropping = !!cropRect;
        // Remove crop rect temporarily (cancels crop)
        if (cropRect) {
            fabricCanvas.remove(cropRect);
            cropRect = null;
        }

        // Rotate
        const currentAngle = (activeObj.angle || 0) + angle;
        activeObj.rotate(currentAngle);

        // Re-fit to canvas
        // Determine effective dimensions based on new angle
        const normAngle = Math.abs(currentAngle % 180);
        let effW, effH;
        if (normAngle === 90) {
            effW = activeObj.height;
            effH = activeObj.width;
        } else {
            effW = activeObj.width;
            effH = activeObj.height;
        }

        const container = document.querySelector('.editor-container');
        const cW = container.clientWidth || fabricCanvas.width;
        const cH = container.clientHeight || fabricCanvas.height;

        const scale = Math.min(cW / effW, cH / effH) * 0.8;

        activeObj.scale(scale);
        fabricCanvas.centerObject(activeObj);
        activeObj.setCoords();

        fabricCanvas.requestRenderAll();

        // Check if we need to reset the UI since we cancelled the crop
        if (wasCropping) {
            resetCropButton();
        }
    }
};

saveEditBtn.addEventListener('click', () => {
    if (currentEditId) {
        let dataUrl;

        if (cropRect) {
            // 1. Hide the crop rect so it doesn't appear in the image
            cropRect.visible = false;

            // 2. Normalize Coordinates (Handle negative scales from flipping)
            const scaledWidth = cropRect.width * cropRect.scaleX;
            const scaledHeight = cropRect.height * cropRect.scaleY;

            let left = cropRect.left;
            let top = cropRect.top;
            let width = scaledWidth;
            let height = scaledHeight;

            if (width < 0) {
                width = Math.abs(width);
                left -= width;
            }
            if (height < 0) {
                height = Math.abs(height);
                top -= height;
            }

            // 3. Export cropped region
            dataUrl = fabricCanvas.toDataURL({
                left: left,
                top: top,
                width: width,
                height: height,
                format: 'png',
                quality: 1,
                multiplier: 2
            });

            // Restore visibility (though we close modal anyway)
            cropRect.visible = true;
        } else {
            // Save Edited Image (Rotation only) - Fit to Image, NO Padding
            const imgInstance = fabricCanvas.getObjects().find(o => o.type === 'image');
            if (imgInstance) {
                const bound = imgInstance.getBoundingRect();
                dataUrl = fabricCanvas.toDataURL({
                    left: bound.left,
                    top: bound.top,
                    width: bound.width,
                    height: bound.height,
                    format: 'png',
                    quality: 1,
                    multiplier: 2
                });
            } else {
                // Fallback
                dataUrl = fabricCanvas.toDataURL({
                    format: 'png',
                    quality: 1,
                    multiplier: 2
                });
            }
        }

        const imgIndex = images.findIndex(i => i.id === currentEditId);
        if (imgIndex > -1) {
            images[imgIndex].dataUrl = dataUrl;
            images[imgIndex].type = 'image/png';
        }
        updateUI();
    }
    closeEditor();
});

const closeEditor = () => {
    editorModal.style.display = 'none';
    currentEditId = null;
};

closeEditorBtn.addEventListener('click', closeEditor);


// --- PDF Generation ---
convertBtn.addEventListener('click', async () => {
    if (images.length === 0) return;

    const pageSizeSetting = document.getElementById('page-size').value;
    const pageLayoutSetting = document.getElementById('page-layout').value;
    // Margins option removed

    try {
        convertBtn.disabled = true;
        convertBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...';

        const pdfDoc = await PDFDocument.create();

        for (const img of images) {
            let embeddedImage;
            const imageBytes = await fetch(img.dataUrl).then(res => res.arrayBuffer());

            if (img.type === 'image/jpeg' || img.dataUrl.startsWith('data:image/jpeg')) {
                embeddedImage = await pdfDoc.embedJpg(imageBytes);
            } else {
                embeddedImage = await pdfDoc.embedPng(imageBytes);
            }

            const imgDims = embeddedImage.scale(1);
            let pageWidth, pageHeight;

            // Determine Page Size
            if (pageSizeSetting === 'a4') {
                pageWidth = 595.28;
                pageHeight = 841.89;
            } else if (pageSizeSetting === 'letter') {
                pageWidth = 612.00;
                pageHeight = 792.00;
            } else {
                // Fit to Image (Original)
                pageWidth = imgDims.width;
                pageHeight = imgDims.height;
            }

            // Orientation
            if (pageSizeSetting !== 'fit') {
                if (pageLayoutSetting === 'landscape' || (pageLayoutSetting === 'auto' && imgDims.width > imgDims.height)) {
                    // Swap to landscape
                    if (pageHeight > pageWidth) {
                        const temp = pageWidth;
                        pageWidth = pageHeight;
                        pageHeight = temp;
                    }
                } else {
                    // Portrait
                    if (pageWidth > pageHeight) {
                        const temp = pageWidth;
                        pageWidth = pageHeight;
                        pageHeight = temp;
                    }
                }
            }

            const page = pdfDoc.addPage([pageWidth, pageHeight]);

            // Fit to Page (Contain) Logic
            // Scale so the entire image fits within the page.
            // There will be whitespace if aspect ratios differ.

            const scaleX = pageWidth / imgDims.width;
            const scaleY = pageHeight / imgDims.height;

            // Use Math.min for 'contain' (fit within). 
            const scale = Math.min(scaleX, scaleY);

            const finalWidth = imgDims.width * scale;
            const finalHeight = imgDims.height * scale;

            // Center the image
            const x = (pageWidth - finalWidth) / 2;
            const y = (pageHeight - finalHeight) / 2;

            page.drawImage(embeddedImage, {
                x: x,
                y: y,
                width: finalWidth,
                height: finalHeight,
            });
        }

        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        downloadFile(blob, 'images_converted.pdf');
        showToast('PDF Created Successfully!', 'success');

    } catch (error) {
        console.error(error);
        showToast('Error: ' + error.message, 'error');
    } finally {
        convertBtn.disabled = false;
        convertBtn.innerHTML = 'Create PDF';
    }
});
