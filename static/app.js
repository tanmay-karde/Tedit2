(function () {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const workspace = document.getElementById('workspace');
  const origImg = document.getElementById('origImg');
  const outImg = document.getElementById('outImg');
  const origMeta = document.getElementById('origMeta');
  const outMeta = document.getElementById('outMeta');
  const presets = document.querySelectorAll('.preset');
  const customKb = document.getElementById('customKb');
  const formatSelect = document.getElementById('formatSelect');
  const compressBtn = document.getElementById('compressBtn');
  const statusEl = document.getElementById('status');
  const resultRow = document.getElementById('resultRow');
  const ratioText = document.getElementById('ratioText');
  const downloadBtn = document.getElementById('downloadBtn');
  const resetLink = document.getElementById('resetLink');

  let currentFile = null;
  let targetKb = 500;

  function humanSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }

  function selectPreset(kb, el) {
    presets.forEach((p) => p.classList.remove('active'));
    if (el) el.classList.add('active');
    targetKb = kb;
    customKb.value = '';
  }

  presets.forEach((p) => {
    p.addEventListener('click', () => selectPreset(parseInt(p.dataset.kb, 10), p));
  });

  customKb.addEventListener('input', () => {
    presets.forEach((p) => p.classList.remove('active'));
    const v = parseInt(customKb.value, 10);
    if (v > 0) targetKb = v;
  });

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
  });

  function handleFile(file) {
    if (!file.type.startsWith('image/')) return;
    currentFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      origImg.src = e.target.result;
      const img = new Image();
      img.onload = () => {
        origMeta.textContent = img.naturalWidth + '×' + img.naturalHeight + ' — ' + humanSize(file.size);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);

    outImg.src = '';
    outMeta.textContent = 'not yet';
    resultRow.classList.remove('show');
    statusEl.textContent = '';
    dropzone.style.display = 'none';
    workspace.classList.add('show');
  }

  resetLink.addEventListener('click', () => {
    currentFile = null;
    fileInput.value = '';
    dropzone.style.display = 'block';
    workspace.classList.remove('show');
  });

  compressBtn.addEventListener('click', async () => {
    if (!currentFile) return;
    compressBtn.disabled = true;
    resultRow.classList.remove('show');
    statusEl.textContent = 'sending to server…';

    const formData = new FormData();
    formData.append('photo', currentFile);
    formData.append('target_kb', targetKb);
    formData.append('format', formatSelect.value);

    try {
      const res = await fetch('/compress', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        statusEl.textContent = 'error: ' + (err.error || res.statusText);
        compressBtn.disabled = false;
        return;
      }

      const originalSize = parseInt(res.headers.get('X-Original-Size'), 10);
      const compressedSize = parseInt(res.headers.get('X-Compressed-Size'), 10);
      const w = res.headers.get('X-Width');
      const h = res.headers.get('X-Height');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      outImg.src = url;
      outMeta.textContent = w + '×' + h + ' — ' + humanSize(compressedSize);

      const savedPct = Math.round((1 - compressedSize / originalSize) * 100);
      ratioText.textContent =
        savedPct > 0
          ? `${humanSize(originalSize)} → ${humanSize(compressedSize)}  (${savedPct}% smaller)`
          : `${humanSize(originalSize)} → ${humanSize(compressedSize)}`;

      const cd = res.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename="?([^"]+)"?/);
      downloadBtn.href = url;
      downloadBtn.download = match ? match[1] : 'tedit-compressed.jpg';

      resultRow.classList.add('show');
      statusEl.textContent = 'done.';
    } catch (err) {
      statusEl.textContent = 'network error — is the Flask server running?';
    }
    compressBtn.disabled = false;
  });
})();
