/* PDF to Markdown / TXT - 100% Client-Side */
let currentPdfFile = null;

const extractMarkdownFromPdf = async (file) => {
    const buf = await readFileAsArrayBuffer(file);
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const pageMarkdowns = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const tc = await page.getTextContent();
        const items = tc.items.filter((it) => it.str && it.str.trim().length > 0);
        if (!items.length) continue;

        const heights = items.map((it) => Math.abs(it.transform[3]) || it.height || 12).sort((a, b) => a - b);
        const medianSize = heights[Math.floor(heights.length / 2)] || 12;

        // Group by Y coordinate
        const lines = [];
        let cur = null;
        items.forEach((it) => {
            const y = Math.round(it.transform[5]);
            const x = it.transform[4];
            const h = Math.abs(it.transform[3]) || it.height || 12;
            if (!cur || Math.abs(cur.y - y) > 4) {
                cur = { y, maxH: h, parts: [{ x, str: it.str }] };
                lines.push(cur);
            } else {
                cur.maxH = Math.max(cur.maxH, h);
                cur.parts.push({ x, str: it.str });
            }
        });

        const mdLines = lines.map((line) => {
            const text = line.parts.sort((a, b) => a.x - b.x).map((p) => p.str).join(' ').replace(/\s+/g, ' ').trim();
            if (!text) return '';
            if (line.maxH >= medianSize * 1.45) return `# ${text}`;
            if (line.maxH >= medianSize * 1.2) return `## ${text}`;
            if (/^[•●▪-]\s+/.test(text)) return `- ${text.replace(/^[•●▪-]\s+/, '')}`;
            return text;
        }).filter(Boolean);

        pageMarkdowns.push(mdLines.join('\n\n'));
    }

    return pageMarkdowns.join('\n\n---\n\n');
};

const handlePdfSelected = async (files) => {
    const file = files[0];
    if (!file || (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf')) {
        showToast('Please select a valid PDF file.', 'error');
        return;
    }
    currentPdfFile = file;
    document.getElementById('file-name').textContent = file.name;
    document.getElementById('file-meta').textContent = formatBytes(file.size);
    document.getElementById('drop-zone').style.display = 'none';
    document.getElementById('md-stage').style.display = 'block';
    document.getElementById('md-output').value = 'Extracting text & structure...';

    try {
        const md = await extractMarkdownFromPdf(file);
        if (!md) {
            document.getElementById('md-output').value = '';
            showToast('No selectable text found. Try our PDF OCR tool for scanned PDFs.', 'error');
            return;
        }
        document.getElementById('md-output').value = md;
        showToast('Extracted Markdown successfully!', 'success');
    } catch (err) {
        console.error(err);
        showToast('Extraction failed: ' + err.message, 'error');
    }
};

window.resetMdTool = () => {
    currentPdfFile = null;
    document.getElementById('file-input').value = '';
    document.getElementById('md-output').value = '';
    document.getElementById('drop-zone').style.display = 'flex';
    document.getElementById('md-stage').style.display = 'none';
};

document.addEventListener('DOMContentLoaded', () => {
    initDropZone('drop-zone', 'file-input', handlePdfSelected);

    document.getElementById('copy-md-btn')?.addEventListener('click', async () => {
        const val = document.getElementById('md-output')?.value || '';
        await navigator.clipboard.writeText(val);
        showToast('Markdown copied to clipboard!', 'success');
    });

    document.getElementById('download-md-btn')?.addEventListener('click', () => {
        const val = document.getElementById('md-output')?.value || '';
        const name = (currentPdfFile?.name || 'document').replace(/\.pdf$/i, '') + '.md';
        downloadFile(new Blob([val], { type: 'text/markdown;charset=utf-8' }), name);
    });
});
