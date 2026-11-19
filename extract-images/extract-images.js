/* Extract Images from PDF - 100% Client-Side via PDF.js + JSZip */
let currentPdfFile = null;
let extractedBlobs = [];

const handlePdfSelected = async (files) => {
    const file = files[0];
    if (!file || (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf')) {
        showToast('Please select a valid PDF file.', 'error');
        return;
    }
    currentPdfFile = file;
    extractedBlobs = [];
    document.getElementById('file-name').textContent = file.name;
    document.getElementById('file-meta').textContent = formatBytes(file.size);
    document.getElementById('drop-zone').style.display = 'none';
    document.getElementById('extract-stage').style.display = 'block';
    const grid = document.getElementById('image-grid');
    grid.innerHTML = '<p style="color:hsl(var(--text-muted));">Scanning PDF pages for embedded images...</p>';

    try {
        const buf = await readFileAsArrayBuffer(file);
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        grid.innerHTML = '';

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const ops = await page.getOperatorList();
            const seenNames = new Set();

            for (let i = 0; i < ops.fnArray.length; i++) {
                if (ops.fnArray[i] === pdfjsLib.OPS.paintImageXObject || ops.fnArray[i] === pdfjsLib.OPS.paintJpegXObject) {
                    const imgName = ops.argsArray[i][0];
                    if (seenNames.has(imgName)) continue;
                    seenNames.add(imgName);

                    try {
                        const imgObj = await new Promise((res) => page.objs.get(imgName, res));
                        if (!imgObj || !imgObj.width || !imgObj.height) continue;

                        const c = document.createElement('canvas');
                        c.width = imgObj.width;
                        c.height = imgObj.height;
                        const ctx = c.getContext('2d');
                        if (imgObj.bitmap) {
                            ctx.drawImage(imgObj.bitmap, 0, 0);
                        } else if (imgObj.data) {
                            const id = ctx.createImageData(imgObj.width, imgObj.height);
                            if (imgObj.data.length === imgObj.width * imgObj.height * 4) {
                                id.data.set(imgObj.data);
                            } else if (imgObj.data.length === imgObj.width * imgObj.height * 3) {
                                for (let s = 0, d = 0; s < imgObj.data.length; s += 3, d += 4) {
                                    id.data[d] = imgObj.data[s];
                                    id.data[d + 1] = imgObj.data[s + 1];
                                    id.data[d + 2] = imgObj.data[s + 2];
                                    id.data[d + 3] = 255;
                                }
                            } else {
                                continue;
                            }
                            ctx.putImageData(id, 0, 0);
                        } else {
                            continue;
                        }

                        const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
                        if (blob) {
                            const idx = extractedBlobs.length + 1;
                            const filename = `page-${pageNum}-image-${idx}.png`;
                            extractedBlobs.push({ filename, blob });

                            const card = document.createElement('div');
                            card.className = 'glass-card';
                            card.style.padding = '0.75rem';
                            const url = URL.createObjectURL(blob);
                            card.innerHTML = `<img src="${url}" alt="${filename}" style="max-width:100%;max-height:140px;object-fit:contain;border-radius:6px;margin-bottom:0.5rem;"><span style="font-size:0.8rem;color:hsl(var(--text-muted));">${filename} (${imgObj.width}×${imgObj.height})</span>`;
                            grid.appendChild(card);
                        }
                    } catch (_) { /* ignore unrenderable image object */ }
                }
            }
        }

        if (extractedBlobs.length === 0) {
            grid.innerHTML = '<p style="color:hsl(var(--text-muted));">No embedded raster images found in this PDF. Need full page PNGs? Use <a href="../pdf-to-image/" style="color:hsl(var(--primary));text-decoration:underline;">PDF to Image</a>.</p>';
        } else {
            showToast(`Extracted ${extractedBlobs.length} image(s)!`, 'success');
        }
    } catch (err) {
        console.error(err);
        showToast('Extraction failed: ' + err.message, 'error');
    }
};

window.resetExtractTool = () => {
    currentPdfFile = null;
    extractedBlobs = [];
    document.getElementById('file-input').value = '';
    document.getElementById('drop-zone').style.display = 'flex';
    document.getElementById('extract-stage').style.display = 'none';
};

document.addEventListener('DOMContentLoaded', () => {
    initDropZone('drop-zone', 'file-input', handlePdfSelected);

    document.getElementById('download-zip-btn')?.addEventListener('click', async () => {
        if (!extractedBlobs.length) {
            showToast('No images extracted to download.', 'error');
            return;
        }
        const zip = new JSZip();
        extractedBlobs.forEach((item) => zip.file(item.filename, item.blob));
        const blob = await zip.generateAsync({ type: 'blob' });
        const name = (currentPdfFile?.name || 'pdf').replace(/\.pdf$/i, '') + '-images.zip';
        downloadFile(blob, name);
        showToast('ZIP downloaded!', 'success');
    });
});
