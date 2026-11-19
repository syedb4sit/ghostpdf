/* Pages per Sheet (N-up) PDF - 100% Client-Side */
let currentPdfFile = null;

const handlePdfSelected = (files) => {
    const file = files[0];
    if (!file || (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf')) {
        showToast('Please select a valid PDF file.', 'error');
        return;
    }
    currentPdfFile = file;
    document.getElementById('file-name').textContent = file.name;
    document.getElementById('file-meta').textContent = formatBytes(file.size);
    document.getElementById('drop-zone').style.display = 'none';
    document.getElementById('nup-stage').style.display = 'block';
};

window.resetNupTool = () => {
    currentPdfFile = null;
    document.getElementById('file-input').value = '';
    document.getElementById('drop-zone').style.display = 'flex';
    document.getElementById('nup-stage').style.display = 'none';
};

document.addEventListener('DOMContentLoaded', () => {
    initDropZone('drop-zone', 'file-input', handlePdfSelected);

    document.getElementById('apply-nup-btn')?.addEventListener('click', async () => {
        if (!currentPdfFile) return;
        const perSheet = parseInt(document.getElementById('nup-layout')?.value || '2', 10);
        const sheetSize = document.getElementById('nup-paper')?.value || 'A4';
        const btn = document.getElementById('apply-nup-btn');
        btn.disabled = true;
        btn.textContent = 'Building N-up PDF...';

        try {
            const buf = await readFileAsArrayBuffer(currentPdfFile);
            const srcDoc = await PDFLib.PDFDocument.load(buf);
            const outDoc = await PDFLib.PDFDocument.create();
            const embeddedPages = await outDoc.embedPages(srcDoc.getPages());

            const baseDims = sheetSize === 'Letter' ? [612, 792] : [595.28, 841.89];
            const isLandscape = perSheet === 2 || perSheet === 6;
            const sheetW = isLandscape ? baseDims[1] : baseDims[0];
            const sheetH = isLandscape ? baseDims[0] : baseDims[1];
            const cols = perSheet === 2 ? 2 : perSheet === 4 ? 2 : 3;
            const rows = perSheet === 2 ? 1 : 2;
            const margin = 20;
            const cellW = (sheetW - margin * (cols + 1)) / cols;
            const cellH = (sheetH - margin * (rows + 1)) / rows;

            for (let i = 0; i < embeddedPages.length; i += perSheet) {
                const page = outDoc.addPage([sheetW, sheetH]);
                for (let j = 0; j < perSheet && i + j < embeddedPages.length; j++) {
                    const ep = embeddedPages[i + j];
                    const col = j % cols;
                    const row = Math.floor(j / cols);
                    const scale = Math.min(cellW / ep.width, cellH / ep.height);
                    const drawW = ep.width * scale;
                    const drawH = ep.height * scale;
                    const cellX = margin + col * (cellW + margin);
                    const cellY = sheetH - margin - (row + 1) * cellH - row * margin;
                    page.drawPage(ep, {
                        x: cellX + (cellW - drawW) / 2,
                        y: cellY + (cellH - drawH) / 2,
                        width: drawW,
                        height: drawH
                    });
                }
            }

            const outBytes = await outDoc.save();
            downloadFile(new Blob([outBytes], { type: 'application/pdf' }), currentPdfFile.name.replace(/\.pdf$/i, '') + `-${perSheet}up.pdf`);
            showToast(`Created ${perSheet}-up PDF!`, 'success');
        } catch (err) {
            console.error(err);
            showToast('N-up failed: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Generate N-up PDF';
        }
    });
});
