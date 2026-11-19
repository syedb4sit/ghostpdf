/* Excel / CSV to PDF - 100% Client-Side via SheetJS + html2canvas + jsPDF */
let workbook = null;
let currentFile = null;

const renderSheetPreview = () => {
    if (!workbook) return;
    const sheetName = document.getElementById('sheet-select')?.value || workbook.SheetNames[0];
    const ws = workbook.Sheets[sheetName];
    const html = XLSX.utils.sheet_to_html(ws, { editable: false });
    const wrap = document.getElementById('sheet-preview');
    if (wrap) wrap.innerHTML = html;
};

const handleExcelFile = async (files) => {
    const file = files[0];
    if (!file) return;
    try {
        currentFile = file;
        const buf = await readFileAsArrayBuffer(file);
        workbook = XLSX.read(buf, { type: 'array' });

        const select = document.getElementById('sheet-select');
        select.innerHTML = '';
        workbook.SheetNames.forEach((name) => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        });

        document.getElementById('file-name').textContent = file.name;
        document.getElementById('file-meta').textContent = `${formatBytes(file.size)} • ${workbook.SheetNames.length} sheet(s)`;
        document.getElementById('drop-zone').style.display = 'none';
        document.getElementById('excel-stage').style.display = 'block';
        renderSheetPreview();
    } catch (err) {
        console.error(err);
        showToast('Could not parse spreadsheet: ' + err.message, 'error');
    }
};

window.resetExcelTool = () => {
    workbook = null;
    currentFile = null;
    document.getElementById('file-input').value = '';
    document.getElementById('drop-zone').style.display = 'flex';
    document.getElementById('excel-stage').style.display = 'none';
};

document.addEventListener('DOMContentLoaded', () => {
    initDropZone('drop-zone', 'file-input', handleExcelFile);
    document.getElementById('sheet-select')?.addEventListener('change', renderSheetPreview);

    document.getElementById('export-excel-pdf-btn')?.addEventListener('click', async () => {
        if (!workbook || !currentFile) return;
        const btn = document.getElementById('export-excel-pdf-btn');
        btn.disabled = true;
        btn.textContent = 'Converting to PDF...';

        const orientation = document.getElementById('pdf-orientation')?.value || 'landscape';
        const widthPx = orientation === 'landscape' ? 1122 : 794;
        const sandbox = document.createElement('div');
        sandbox.style.cssText = `position:fixed;left:-10000px;top:0;width:${widthPx}px;background:#ffffff;color:#111827;padding:36px;font-family:Arial,sans-serif;font-size:12px;`;
        const tableHtml = document.getElementById('sheet-preview')?.innerHTML || '';
        sandbox.innerHTML = `<style>table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}tr:nth-child(even){background:#f8fafc}</style>${tableHtml}`;
        document.body.appendChild(sandbox);

        try {
            const canvas = await html2canvas(sandbox, { scale: 2, backgroundColor: '#ffffff' });
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation });
            const pageW = pdf.internal.pageSize.getWidth();
            const pageH = pdf.internal.pageSize.getHeight();
            const sliceHeightPx = Math.floor(canvas.width * (pageH / pageW));

            let offsetY = 0;
            let pageIndex = 0;
            while (offsetY < canvas.height) {
                const h = Math.min(sliceHeightPx, canvas.height - offsetY);
                const slice = document.createElement('canvas');
                slice.width = canvas.width;
                slice.height = h;
                slice.getContext('2d').drawImage(canvas, 0, offsetY, canvas.width, h, 0, 0, canvas.width, h);
                if (pageIndex > 0) pdf.addPage();
                pdf.addImage(slice.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, pageW, (h / canvas.width) * pageW);
                offsetY += h;
                pageIndex++;
            }

            const outName = currentFile.name.replace(/\.[^.]+$/, '') + '.pdf';
            pdf.save(outName);
            showToast('Spreadsheet converted to PDF!', 'success');
        } catch (err) {
            console.error(err);
            showToast('Conversion failed: ' + err.message, 'error');
        } finally {
            document.body.removeChild(sandbox);
            btn.disabled = false;
            btn.textContent = 'Convert Spreadsheet to PDF';
        }
    });
});
