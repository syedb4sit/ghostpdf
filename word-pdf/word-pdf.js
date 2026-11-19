let currentFile = null;
let detectedType = null;

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const convertStage = document.getElementById('convert-stage');
const fileNameEl = document.getElementById('file-name');
const fileSizeEl = document.getElementById('file-size');
const detectedFlowEl = document.getElementById('detected-flow');
const convertBtn = document.getElementById('convert-btn');
const progressContainer = document.getElementById('progress-container');
const progressText = document.getElementById('progress-text');
const progressBar = document.getElementById('progress-bar');
const progressPercent = document.getElementById('progress-percent');
const progressIcon = document.getElementById('progress-icon');
const stageUpload = document.getElementById('stage-upload');
const stageProcess = document.getElementById('stage-process');
const stageDownload = document.getElementById('stage-download');

initDropZone('drop-zone', 'file-input', (files) => handleFile(files[0]));

function detectType(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (file.type === 'application/pdf' || ext === 'pdf') return 'pdf';
    if (
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        ext === 'docx'
    ) {
        return 'docx';
    }
    if (file.type === 'application/msword' || ext === 'doc') return 'doc';
    return null;
}

function updateFlowLabel() {
    if (detectedType === 'pdf') {
        detectedFlowEl.innerText = 'Ready: PDF → Word (.docx)';
        convertBtn.innerText = 'Convert to Word';
    } else if (detectedType === 'docx') {
        detectedFlowEl.innerText = 'Ready: Word (.docx) → PDF';
        convertBtn.innerText = 'Convert to PDF';
    } else {
        detectedFlowEl.innerText = 'Ready';
        convertBtn.innerText = 'Convert';
    }
}

function handleFile(file) {
    if (!file) return;
    const type = detectType(file);
    const path = window.location.pathname;

    if (path.includes('pdf-to-word')) {
        if (type !== 'pdf') {
            showToast('Please upload a PDF file (.pdf).', 'error');
            return;
        }
    } else if (path.includes('word-to-pdf')) {
        if (type === 'doc') {
            showToast('Legacy .doc files are not supported in browser mode. Please save as .docx first.', 'warning');
            return;
        }
        if (type !== 'docx') {
            showToast('Please upload a Word document (.docx).', 'error');
            return;
        }
    } else if (type !== 'pdf' && type !== 'docx') {
        showToast('Please upload a DOCX or PDF file.', 'error');
        return;
    }

    currentFile = file;
    detectedType = type;

    fileNameEl.innerText = file.name;
    fileSizeEl.innerText = formatBytes(file.size);
    updateFlowLabel();

    dropZone.style.display = 'none';
    convertStage.style.display = 'block';
}

function setProgressStage(stage, pct, label) {
    if (progressBar) progressBar.style.width = `${pct}%`;
    if (progressPercent) progressPercent.textContent = `${pct}%`;

    [stageUpload, stageProcess, stageDownload].forEach(el => {
        if (!el) return;
        el.style.fontWeight = '400';
        el.style.color = 'hsl(var(--text-muted))';
    });

    if (stage === 'upload') {
        if (stageUpload) {
            stageUpload.style.fontWeight = '600';
            stageUpload.style.color = 'hsl(var(--primary))';
        }
        if (progressIcon) progressIcon.className = 'fa-solid fa-file-import';
        if (progressText) progressText.textContent = label || 'Reading file locally...';
    } else if (stage === 'process') {
        if (stageUpload) {
            stageUpload.style.fontWeight = '600';
            stageUpload.style.color = '#4caf50';
        }
        if (stageProcess) {
            stageProcess.style.fontWeight = '600';
            stageProcess.style.color = 'hsl(var(--primary))';
        }
        if (progressIcon) progressIcon.className = 'fa-solid fa-gear fa-spin';
        if (progressText) progressText.textContent = label || 'Converting in browser...';
    } else if (stage === 'download') {
        if (stageUpload) {
            stageUpload.style.fontWeight = '600';
            stageUpload.style.color = '#4caf50';
        }
        if (stageProcess) {
            stageProcess.style.fontWeight = '600';
            stageProcess.style.color = '#4caf50';
        }
        if (stageDownload) {
            stageDownload.style.fontWeight = '600';
            stageDownload.style.color = 'hsl(var(--primary))';
        }
        if (progressIcon) progressIcon.className = 'fa-solid fa-download';
        if (progressText) progressText.textContent = label || 'Preparing download...';
    }
}

function getOutputName(ext) {
    const baseName = currentFile.name.replace(/\.[^/.]+$/, '') || 'converted';
    return `${baseName}.${ext}`;
}

async function convertDocxToPdf(file) {
    if (typeof mammoth === 'undefined' || typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
        throw new Error('Conversion libraries failed to load. Please refresh and try again.');
    }

    setProgressStage('upload', 15, 'Reading DOCX document...');
    const arrayBuffer = await file.arrayBuffer();

    setProgressStage('process', 35, 'Parsing Word formatting...');
    const result = await mammoth.convertToHtml({ arrayBuffer });

    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.left = '-99999px';
    wrapper.style.top = '0';
    wrapper.style.width = '794px';
    wrapper.style.background = '#ffffff';
    wrapper.style.color = '#111827';
    wrapper.style.padding = '56px';
    wrapper.style.boxSizing = 'border-box';
    wrapper.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";
    wrapper.style.fontSize = '14px';
    wrapper.style.lineHeight = '1.6';

    wrapper.innerHTML = `
        <style>
            .docx-render h1, .docx-render h2, .docx-render h3, .docx-render h4 {
                color: #111827;
                margin: 14px 0 8px;
                line-height: 1.3;
            }
            .docx-render h1 { font-size: 24px; }
            .docx-render h2 { font-size: 20px; }
            .docx-render h3 { font-size: 16px; }
            .docx-render p { margin: 0 0 10px; }
            .docx-render ul, .docx-render ol { margin: 0 0 10px 22px; }
            .docx-render li { margin-bottom: 4px; }
            .docx-render table { border-collapse: collapse; width: 100%; margin: 12px 0; }
            .docx-render td, .docx-render th { border: 1px solid #d1d5db; padding: 6px 10px; text-align: left; vertical-align: top; }
            .docx-render th { background: #f3f4f6; font-weight: 600; }
            .docx-render img { max-width: 100%; height: auto; display: block; margin: 10px 0; }
            .docx-render a { color: #2563eb; text-decoration: underline; }
        </style>
        <div class="docx-render">${result.value || '<p>(Empty document)</p>'}</div>
    `;

    document.body.appendChild(wrapper);

    try {
        const imgs = Array.from(wrapper.querySelectorAll('img'));
        await Promise.all(
            imgs.map(img => (img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; })))
        );

        setProgressStage('process', 65, 'Rendering PDF pages...');
        const fullCanvas = await html2canvas(wrapper, {
            scale: 2,
            backgroundColor: '#ffffff',
            useCORS: true,
            logging: false
        });

        setProgressStage('download', 90, 'Building A4 PDF...');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        const pageW = 210;
        const pageH = 297;
        const pageHeightPx = Math.floor(fullCanvas.width * (pageH / pageW));

        let srcY = 0;
        let pageIndex = 0;
        while (srcY < fullCanvas.height) {
            const sliceH = Math.min(pageHeightPx, fullCanvas.height - srcY);
            const sliceCanvas = document.createElement('canvas');
            sliceCanvas.width = fullCanvas.width;
            sliceCanvas.height = sliceH;
            const ctx = sliceCanvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
            ctx.drawImage(fullCanvas, 0, srcY, fullCanvas.width, sliceH, 0, 0, fullCanvas.width, sliceH);

            const imgData = sliceCanvas.toDataURL('image/jpeg', 0.94);
            const imgHeightMm = (sliceH / fullCanvas.width) * pageW;

            if (pageIndex > 0) pdf.addPage();
            pdf.addImage(imgData, 'JPEG', 0, 0, pageW, imgHeightMm);

            srcY += sliceH;
            pageIndex++;
        }

        setProgressStage('download', 100, 'Download ready!');
        pdf.save(getOutputName('pdf'));
    } finally {
        wrapper.remove();
    }
}

async function convertPdfToDocx(file) {
    if (typeof pdfjsLib === 'undefined' || typeof window.docx === 'undefined') {
        throw new Error('Conversion libraries failed to load. Please refresh and try again.');
    }

    setProgressStage('upload', 15, 'Reading PDF document...');
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

    const extractedPages = [];
    const fontSizes = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const pct = 20 + Math.round((pageNum / pdf.numPages) * 55);
        setProgressStage('process', pct, `Extracting text from page ${pageNum} of ${pdf.numPages}...`);

        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();

        const lineMap = new Map();
        for (const item of textContent.items) {
            if (!item.str || !item.str.trim()) continue;
            const x = item.transform ? item.transform[4] : 0;
            const y = item.transform ? item.transform[5] : 0;
            const fontSize = item.transform ? Math.abs(item.transform[0]) || item.height || 11 : 11;
            fontSizes.push(fontSize);

            const yBucket = Math.round(y / 4) * 4;
            if (!lineMap.has(yBucket)) lineMap.set(yBucket, []);
            lineMap.get(yBucket).push({ x, str: item.str, fontSize });
        }

        const lines = Array.from(lineMap.entries())
            .sort((a, b) => b[0] - a[0])
            .map(([, items]) => {
                items.sort((a, b) => a.x - b.x);
                const text = items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
                const avgFont = items.reduce((s, i) => s + i.fontSize, 0) / items.length;
                return { text, fontSize: avgFont };
            })
            .filter(l => l.text.length > 0);

        extractedPages.push(lines);
    }

    const totalLines = extractedPages.reduce((sum, p) => sum + p.length, 0);
    if (totalLines === 0) {
        throw new Error('No selectable text found (this looks like a scanned or image-only PDF).');
    }

    fontSizes.sort((a, b) => a - b);
    const medianFont = fontSizes.length ? fontSizes[Math.floor(fontSizes.length / 2)] : 11;

    setProgressStage('download', 85, 'Generating Word (.docx)...');
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, PageBreak } = window.docx;
    const children = [];

    extractedPages.forEach((lines, pageIdx) => {
        lines.forEach(line => {
            if (line.fontSize >= medianFont * 1.45) {
                children.push(
                    new Paragraph({
                        heading: HeadingLevel.HEADING_1,
                        spacing: { before: 200, after: 100 },
                        children: [new TextRun({ text: line.text })]
                    })
                );
            } else if (line.fontSize >= medianFont * 1.2) {
                children.push(
                    new Paragraph({
                        heading: HeadingLevel.HEADING_2,
                        spacing: { before: 160, after: 80 },
                        children: [new TextRun({ text: line.text })]
                    })
                );
            } else {
                children.push(
                    new Paragraph({
                        spacing: { after: 120 },
                        children: [new TextRun({ text: line.text, size: 22 })]
                    })
                );
            }
        });

        if (pageIdx < extractedPages.length - 1) {
            children.push(new Paragraph({ children: [new PageBreak()] }));
        }
    });

    const doc = new Document({
        sections: [{ children }]
    });

    const blob = await Packer.toBlob(doc);
    setProgressStage('download', 100, 'Download ready!');
    downloadFile(blob, getOutputName('docx'));
}

convertBtn.addEventListener('click', async () => {
    if (!currentFile) return;

    convertBtn.disabled = true;
    progressContainer.style.display = 'block';

    try {
        if (detectedType === 'docx') {
            await convertDocxToPdf(currentFile);
        } else if (detectedType === 'pdf') {
            await convertPdfToDocx(currentFile);
        } else {
            throw new Error('Unsupported file type.');
        }
        showToast('Conversion complete!', 'success');
    } catch (e) {
        console.error(e);
        showToast(e.message || 'Conversion failed. Please try again.', 'error');
    } finally {
        convertBtn.disabled = false;
        setTimeout(() => {
            progressContainer.style.display = 'none';
        }, 700);
    }
});

window.resetFile = () => {
    currentFile = null;
    detectedType = null;
    convertStage.style.display = 'none';
    dropZone.style.display = 'block';
    if (fileInput) fileInput.value = '';
};
