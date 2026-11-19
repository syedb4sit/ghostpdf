/* HTML / Markdown to PDF - 100% Client-Side */
let inputMode = 'markdown';

const updatePreview = () => {
    const raw = document.getElementById('source-input')?.value || '';
    const preview = document.getElementById('render-preview');
    if (!preview) return;
    if (inputMode === 'markdown' && typeof marked !== 'undefined') {
        preview.innerHTML = marked.parse(raw);
    } else {
        // Strip script tags for safe preview
        preview.innerHTML = raw.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
    }
};

window.setEditorMode = (mode) => {
    inputMode = mode;
    document.getElementById('mode-md-btn').className = mode === 'markdown' ? 'btn btn-primary' : 'btn btn-secondary';
    document.getElementById('mode-html-btn').className = mode === 'html' ? 'btn btn-primary' : 'btn btn-secondary';
    updatePreview();
};

document.addEventListener('DOMContentLoaded', () => {
    const inputEl = document.getElementById('source-input');
    if (inputEl) {
        inputEl.value = '# Project Proposal\n\nConvert **Markdown** or **HTML** into a clean, print-ready PDF directly in your browser.\n\n## Key Benefits\n- 100% client-side rendering\n- Zero server uploads\n- Crisp A4 pagination';
        inputEl.addEventListener('input', updatePreview);
    }
    updatePreview();

    document.getElementById('export-pdf-btn')?.addEventListener('click', async () => {
        const preview = document.getElementById('render-preview');
        if (!preview || !preview.innerHTML.trim()) {
            showToast('Enter some Markdown or HTML first.', 'error');
            return;
        }
        const btn = document.getElementById('export-pdf-btn');
        btn.disabled = true;
        btn.textContent = 'Generating PDF...';

        const sandbox = document.createElement('div');
        sandbox.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;background:#ffffff;color:#111827;padding:56px;font-family:Georgia,Arial,sans-serif;line-height:1.6;font-size:14px;';
        sandbox.innerHTML = `<style>h1,h2,h3{color:#111827;margin:0.8em 0 0.4em}table{width:100%;border-collapse:collapse;margin:1em 0}th,td{border:1px solid #d1d5db;padding:6px 8px}pre,code{background:#f3f4f6;padding:2px 5px;border-radius:4px}</style>${preview.innerHTML}`;
        document.body.appendChild(sandbox);

        try {
            const canvas = await html2canvas(sandbox, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
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

            const filename = (document.getElementById('pdf-filename')?.value || 'document').replace(/\.pdf$/i, '') + '.pdf';
            pdf.save(filename);
            showToast('PDF downloaded!', 'success');
        } catch (err) {
            console.error(err);
            showToast('PDF export failed: ' + err.message, 'error');
        } finally {
            document.body.removeChild(sandbox);
            btn.disabled = false;
            btn.textContent = 'Convert to PDF';
        }
    });
});
