// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ══ STATE ══
let imageItems = []; // Array of { id, dataURL, mimeType }
let settings = {
  apiKey: '', model: 'gemini-2.0-flash', lang: 'auto',
  fixSpelling: true, fixGrammar: true, keepParagraphs: true, showAnalysis: true, enhance: 'none'
};

// ══ LOAD / SAVE SETTINGS ══
// ... (loadSettings and saveSettings remain similar)
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('script_v2') || '{}');
    settings = { ...settings, ...s };
  } catch (e) { }
  document.getElementById('api-key-input').value = settings.apiKey;
  document.getElementById('model-select').value = settings.model;
  document.getElementById('lang-select').value = settings.lang;
  document.getElementById('fix-spelling').checked = settings.fixSpelling;
  document.getElementById('fix-grammar').checked = settings.fixGrammar;
  document.getElementById('keep-paragraphs').checked = settings.keepParagraphs;
  document.getElementById('show-analysis').checked = settings.showAnalysis;
  document.getElementById('enhance-select').value = settings.enhance;
  document.getElementById('analysis-section').style.display = settings.showAnalysis ? '' : 'none';
}
loadSettings();

document.getElementById('save-settings').addEventListener('click', () => {
  settings.apiKey = document.getElementById('api-key-input').value.trim();
  settings.model = document.getElementById('model-select').value;
  settings.lang = document.getElementById('lang-select').value;
  settings.fixSpelling = document.getElementById('fix-spelling').checked;
  settings.fixGrammar = document.getElementById('fix-grammar').checked;
  settings.keepParagraphs = document.getElementById('keep-paragraphs').checked;
  settings.showAnalysis = document.getElementById('show-analysis').checked;
  settings.enhance = document.getElementById('enhance-select').value;
  localStorage.setItem('script_v2', JSON.stringify(settings));
  document.getElementById('analysis-section').style.display = settings.showAnalysis ? '' : 'none';
  closeSettings();
  showStatus('<i data-lucide="check-circle-2" width="16" height="16"></i> Settings saved successfully.', 'success');
});

// ══ HAMBURGER ══
const menuBtn = document.getElementById('menu-btn');
const panel = document.getElementById('settings-panel');
const overlay = document.getElementById('overlay');
menuBtn.addEventListener('click', () => panel.classList.contains('open') ? closeSettings() : openSettings());
overlay.addEventListener('click', closeSettings);
function openSettings() { panel.classList.add('open'); menuBtn.classList.add('open'); overlay.classList.add('show'); }
function closeSettings() { panel.classList.remove('open'); menuBtn.classList.remove('open'); overlay.classList.remove('show'); }

// ══ THEME TOGGLE ══
const themeBtn = document.getElementById('theme-btn');
const rootElement = document.documentElement;

let isDark = localStorage.getItem('theme') !== 'light';
if (!isDark) {
  rootElement.classList.add('light-theme');
  updateThemeIcon(false);
}

themeBtn.addEventListener('click', () => {
  isDark = !isDark;
  if (!isDark) {
    rootElement.classList.add('light-theme');
    localStorage.setItem('theme', 'light');
  } else {
    rootElement.classList.remove('light-theme');
    localStorage.setItem('theme', 'dark');
  }
  updateThemeIcon(isDark);
});

function updateThemeIcon(dark) {
  themeBtn.innerHTML = dark 
    ? '<i data-lucide="moon" width="20" height="20"></i>' 
    : '<i data-lucide="sun" width="20" height="20"></i>';
  lucide.createIcons();
}

document.getElementById('toggle-key-vis').addEventListener('click', () => {
  const inp = document.getElementById('api-key-input');
  inp.type = inp.type === 'password' ? 'text' : 'password';
});

// ══ IMAGE HANDLING ══
const fileInput = document.getElementById('file-input');
const dropZone = document.getElementById('drop-zone');

fileInput.addEventListener('change', async e => {
  if (e.target.files.length) {
    const files = Array.from(e.target.files);
    for (const file of files) {
      await loadFile(file);
    }
    fileInput.value = ''; // Reset to allow same file again if needed
  }
});

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', async e => {
  e.preventDefault(); dropZone.classList.remove('drag-over');
  if (e.dataTransfer.files.length) {
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      await loadFile(file);
    }
  }
});

function loadFile(file) {
  return new Promise((resolve) => {
    if (file.type === 'application/pdf') {
      showStatus(`Processing PDF "${file.name}"...`, 'loading');
      const reader = new FileReader();
      reader.onload = async e => {
        await extractPdfPages(e.target.result);
        resolve();
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    if (!file.type.startsWith('image/')) {
      showStatus(`Skipped "${file.name}" — not an image or PDF.`, 'error');
      resolve();
      return;
    }
    const reader = new FileReader();
    reader.onload = async e => {
      await processAndAdd(e.target.result, file.type);
      resolve();
    };
    reader.readAsDataURL(file);
  });
}

async function extractPdfPages(arrayBuffer) {
  try {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    for (let i = 1; i <= pdf.numPages; i++) {
      showStatus(`Extracting PDF page ${i} of ${pdf.numPages}...`, 'loading');
      const page = await pdf.getPage(i);
      const scale = 2.0; // High resolution for pure OCR text
      const viewport = page.getViewport({ scale });
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      // PDF.js defaults to transparent background; override to white
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      const renderContext = {
        canvasContext: ctx,
        viewport: viewport
      };
      
      await page.render(renderContext).promise;
      const dataURL = canvas.toDataURL('image/jpeg', 0.95);
      await processAndAdd(dataURL, 'image/jpeg');
    }
    clearStatus();
  } catch (err) {
    console.error('Error processing PDF:', err);
    showStatus('Error processing PDF file.', 'error');
  }
}

async function processAndAdd(dataURL, mimeType) {
  if (settings.enhance !== 'none') {
    const enhanced = await applyEnhancement(dataURL, settings.enhance);
    addImage(enhanced, mimeType);
  } else {
    addImage(dataURL, mimeType);
  }
}

function addImage(dataURL, mimeType) {
  const id = Date.now() + Math.random().toString(36).substr(2, 9);
  imageItems.push({ id, dataURL, mimeType });
  renderGallery();
  clearStatus();
}

function renderGallery() {
  const gallery = document.getElementById('preview-gallery');
  const actions = document.getElementById('preview-actions-wrap');
  const btn = document.getElementById('transcribe-btn');

  gallery.innerHTML = '';

  if (imageItems.length === 0) {
    gallery.classList.remove('show');
    actions.style.display = 'none';
    btn.disabled = true;
    return;
  }

  gallery.classList.add('show');
  actions.style.display = 'block';
  btn.disabled = false;

  imageItems.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'preview-item';
    div.innerHTML = `
      <img src="${item.dataURL}" alt="Preview">
      <div style="position: absolute; bottom: 4px; left: 4px; background: rgba(0,0,0,0.6); color: white; padding: 2px 6px; border-radius: 2px; font-size: 0.7rem; font-family: 'JetBrains Mono', monospace;">Page ${index + 1}</div>
      <button class="crop-btn-overlay" onclick="openCrop('${item.id}')" title="Crop"><i data-lucide="crop" width="14" height="14"></i></button>
      <button class="remove-img-btn" onclick="removeImage('${item.id}')" title="Remove"><i data-lucide="trash" width="14" height="14"></i></button>
    `;
    gallery.appendChild(div);
  });
  lucide.createIcons();
}

window.removeImage = function (id) {
  imageItems = imageItems.filter(item => item.id !== id);
  renderGallery();
};

document.getElementById('clear-all-btn').addEventListener('click', () => {
  imageItems = [];
  renderGallery();
  clearStatus();
});

// ══ CROP STATE ══
let cropper = null;
let currentCropId = null;

// ══ CROP IMAGE ══
const cropModal = document.getElementById('crop-modal');
const cropImage = document.getElementById('crop-image');

window.openCrop = function(id) {
  const item = imageItems.find(img => img.id === id);
  if (!item) return;
  currentCropId = id;
  cropImage.src = item.dataURL;
  cropModal.classList.add('show');
  
  if (cropper) {
    cropper.destroy();
  }
  cropper = new Cropper(cropImage, {
    viewMode: 1,
    autoCropArea: 1,
    background: false,
  });
};

function closeCrop() {
  cropModal.classList.remove('show');
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
  currentCropId = null;
}

document.getElementById('close-crop-btn').addEventListener('click', closeCrop);

document.getElementById('save-crop-btn').addEventListener('click', () => {
  if (!cropper || !currentCropId) return;
  const croppedCanvas = cropper.getCroppedCanvas();
  const croppedDataUrl = croppedCanvas.toDataURL('image/jpeg', 0.92);
  
  const idx = imageItems.findIndex(img => img.id === currentCropId);
  if (idx !== -1) {
    imageItems[idx].dataURL = croppedDataUrl;
    imageItems[idx].mimeType = 'image/jpeg';
    renderGallery();
  }
  closeCrop();
});

// ══ ENHANCE ══
function applyEnhancement(dataURL, mode) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const id = ctx.getImageData(0, 0, c.width, c.height);
      const d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        if (mode === 'grayscale' || mode === 'sharpen') {
          const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          d[i] = d[i + 1] = d[i + 2] = g;
        }
        if (mode === 'contrast') {
          const f = 1.45;
          d[i] = clamp(f * (d[i] - 128) + 128);
          d[i + 1] = clamp(f * (d[i + 1] - 128) + 128);
          d[i + 2] = clamp(f * (d[i + 2] - 128) + 128);
        }
      }
      ctx.putImageData(id, 0, 0);
      resolve(c.toDataURL('image/jpeg', 0.92));
    };
    img.src = dataURL;
  });
}
const clamp = v => Math.min(255, Math.max(0, v));

// ══ TRANSCRIBE ══
document.getElementById('transcribe-btn').addEventListener('click', transcribe);

async function transcribe() {
  if (imageItems.length === 0) { showStatus('Please select or capture at least one image first.', 'error'); return; }
  if (!settings.apiKey) {
    showStatus('API key missing — open Settings (☰) and paste your Gemini API key.', 'error');
    openSettings(); return;
  }

  const btn = document.getElementById('transcribe-btn');
  const label = document.getElementById('transcribe-label');
  btn.disabled = true;
  label.innerHTML = '<span class="spinner"></span>Transcribing…';

  // Show "turned off" state in analysis panels upfront
  if (settings.showAnalysis) {
    if (!settings.fixSpelling) renderSpelling([], true);
    if (!settings.fixGrammar)  renderGrammar([], true);
  }

  const batchSize = 3;
  const totalImages = imageItems.length;
  const batches = [];
  for (let i = 0; i < totalImages; i += batchSize) {
    batches.push(imageItems.slice(i, i + batchSize));
  }

  const finalResult = { original: '', corrected: '', spelling_errors: [], grammar_issues: [] };

  const langNote   = settings.lang === 'auto' ? 'Detect the language automatically.' : `The text is written in ${settings.lang}.`;
  const paraNote   = settings.keepParagraphs
    ? 'Preserve paragraph breaks exactly — separate each paragraph with \\n\\n.'
    : 'Transcribe as one continuous block of text.';
  const spellNote  = settings.fixSpelling
    ? 'Fix every spelling mistake in "corrected". List each error in "spelling_errors".'
    : 'Do not fix spelling. Set "corrected" = "original" and "spelling_errors" = [].';
  const grammarNote = settings.fixGrammar
    ? 'Fix grammar in "corrected". List each issue in "grammar_issues".'
    : 'Do not fix grammar. Set "grammar_issues" = [].';

  try {
    for (let i = 0; i < batches.length; i++) {
      const currentBatch = batches[i];
      const startIdx = i * batchSize;
      const endIdx = startIdx + currentBatch.length;
      showStatus(`Transcribing pages ${startIdx + 1}–${endIdx} of ${totalImages}…`, 'loading');

      const imageParts = currentBatch.map(item => ({
        inline_data: { mime_type: item.mimeType, data: item.dataURL.split(',')[1] }
      }));

      const prompt = `You are an expert handwriting OCR and proofreading assistant.

I have provided ${currentBatch.length} image(s) containing handwritten text. They are sequential pages.

1. TRANSCRIPTION: Transcribe every word exactly as written from ALL provided images in order. Combine them into one unified response for this batch. ${langNote}
2. PARAGRAPHS: ${paraNote}
3. SPELLING: ${spellNote}
4. GRAMMAR: ${grammarNote}

Return ONLY the JSON object — no markdown, no commentary.`;

      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${settings.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                ...imageParts,
                { text: prompt }
              ]
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 1000000,
              response_mime_type: 'application/json',
              response_schema: {
                type: 'OBJECT',
                properties: {
                  original:       { type: 'STRING' },
                  corrected:      { type: 'STRING' },
                  spelling_errors: {
                    type: 'ARRAY',
                    items: {
                      type: 'OBJECT',
                      properties: {
                        wrong:   { type: 'STRING' },
                        correct: { type: 'STRING' },
                        note:    { type: 'STRING' }
                      },
                      required: ['wrong', 'correct', 'note']
                    }
                  },
                  grammar_issues: {
                    type: 'ARRAY',
                    items: {
                      type: 'OBJECT',
                      properties: {
                        original:    { type: 'STRING' },
                        corrected:   { type: 'STRING' },
                        explanation: { type: 'STRING' }
                      },
                      required: ['original', 'corrected', 'explanation']
                    }
                  }
                },
                required: ['original', 'corrected', 'spelling_errors', 'grammar_issues']
              }
            }
          })
        }
      );

      let data;
      try {
        data = await resp.json();
      } catch (e) {
        throw new Error(`Batch ${i + 1}: could not parse API response. The server returned an invalid format.`);
      }

      if (data.error) {
        throw new Error(`Batch ${i + 1}: ${data.error.message || 'API Error'}`);
      }

      const candidate = data.candidates?.[0];
      if (!candidate) {
        throw new Error(`Batch ${i + 1}: No response candidates returned. This might be due to safety filters.`);
      }

      if (candidate.finishReason === 'SAFETY') {
        throw new Error(`Batch ${i + 1}: Response was blocked by safety filters.`);
      }

      const text = candidate.content?.parts?.[0]?.text;
      if (!text) throw new Error(`Batch ${i + 1}: empty response from API.`);

      let result;
      try {
        // Robust cleaning: remove potential markdown fences and extra whitespace
        let cleanText = text.trim();
        if (cleanText.startsWith('```')) {
          cleanText = cleanText.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '').trim();
        }
        result = JSON.parse(cleanText);
      } catch (e) {
        console.error('OCR Parse error on text:', text);
        throw new Error(`Batch ${i + 1}: could not parse AI response. The text was not in the expected JSON format. Try processing fewer images.`);
      }

      // Append to running transcription output immediately
      finalResult.original  += (finalResult.original  ? '\n\n' : '') + (result.original  || '');
      finalResult.corrected += (finalResult.corrected ? '\n\n' : '') + (result.corrected || '');
      if (result.spelling_errors?.length) finalResult.spelling_errors.push(...result.spelling_errors);
      if (result.grammar_issues?.length)  finalResult.grammar_issues.push(...result.grammar_issues);

      // Update transcription panel live after each batch
      const displayText = (settings.fixSpelling || settings.fixGrammar) ? finalResult.corrected : finalResult.original;
      const out = document.getElementById('transcription-out');
      out.innerHTML = '';
      displayText.split(/\n\n+/).forEach(para => {
        if (!para.trim()) return;
        const p = document.createElement('p');
        p.textContent = para.trim();
        out.appendChild(p);
      });
    }

    // Render analysis panels once all batches are done
    if (settings.showAnalysis) {
      renderSpelling(finalResult.spelling_errors, !settings.fixSpelling);
      renderGrammar(finalResult.grammar_issues,   !settings.fixGrammar);
    }

    const se = finalResult.spelling_errors.length;
    const gi = finalResult.grammar_issues.length;
    showStatus(
      `<i data-lucide="check-circle-2" width="16" height="16"></i> Done — ${totalImages} image${totalImages !== 1 ? 's' : ''} processed. ${se} spelling issue${se !== 1 ? 's' : ''}, ${gi} grammar issue${gi !== 1 ? 's' : ''}.`,
      'success'
    );

  } catch (e) {
    console.error(e);
    showStatus('Error: ' + e.message, 'error');
  } finally {
    btn.disabled = imageItems.length === 0;
    label.innerHTML = '<i data-lucide="wand-2" width="18" height="18"></i> Transcribe Handwriting';
    lucide.createIcons();
  }
}



// ══ ANALYSIS RENDERERS ══




function renderSpelling(errors, disabled = false) {
  const body  = document.getElementById('spell-body');
  const count = document.getElementById('spell-count');

  if (disabled) {
    count.textContent = '—';
    body.innerHTML = '<div class="analysis-empty muted"><i data-lucide="slash" width="24" height="24"></i><div>Spelling check turned off</div></div>';
    lucide.createIcons();
    return;
  }

  count.textContent = errors.length;
  if (!errors.length) {
    body.innerHTML = '<div class="analysis-empty"><i data-lucide="check-circle-2" width="24" height="24"></i><div>No spelling errors found!</div></div>';
    lucide.createIcons();
    return;
  }
  body.innerHTML = '';
  errors.forEach((e, i) => {
    const d = document.createElement('div');
    d.className = 'issue-item spelling';
    d.style.animationDelay = (i * 0.055) + 's';
    d.innerHTML = `
  <div class="issue-word">
    <span class="wrong">${esc(e.wrong)}</span>
    <span class="arrow"><i data-lucide="arrow-right" width="14" height="14"></i></span>
    <span class="right">${esc(e.correct)}</span>
  </div>
  <div class="issue-explain">${esc(e.note || '')}</div>`;
    body.appendChild(d);
  });
  lucide.createIcons();
}

function renderGrammar(issues, disabled = false) {
  const body  = document.getElementById('grammar-body');
  const count = document.getElementById('grammar-count');

  if (disabled) {
    count.textContent = '—';
    body.innerHTML = '<div class="analysis-empty muted"><i data-lucide="slash" width="24" height="24"></i><div>Grammar check turned off</div></div>';
    lucide.createIcons();
    return;
  }

  count.textContent = issues.length;
  if (!issues.length) {
    body.innerHTML = '<div class="analysis-empty"><i data-lucide="check-circle-2" width="24" height="24"></i><div>No grammar issues found!</div></div>';
    lucide.createIcons();
    return;
  }
  body.innerHTML = '';
  issues.forEach((g, i) => {
    const d = document.createElement('div');
    d.className = 'issue-item grammar';
    d.style.animationDelay = (i * 0.055) + 's';
    d.innerHTML = `
  <div class="issue-word">
    <span class="wrong">${esc(g.original)}</span>
    <span class="arrow"><i data-lucide="arrow-right" width="14" height="14"></i></span>
    <span class="right">${esc(g.corrected)}</span>
  </div>
  <div class="issue-explain">${esc(g.explanation || '')}</div>`;
    body.appendChild(d);
  });
  lucide.createIcons();
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


// ══ STATUS ══
function showStatus(msg, type) {
  const bar = document.getElementById('status-bar');
  bar.className = 'show ' + type;
  bar.innerHTML = msg;
  lucide.createIcons();
}
function clearStatus() {
  const bar = document.getElementById('status-bar');
  bar.className = '';
  bar.innerHTML = '';
}

// ══ OUTPUT TOOLBAR ══
document.getElementById('copy-btn').addEventListener('click', () => {
  const txt = document.getElementById('transcription-out').innerText;
  if (!txt.trim()) { showStatus('Nothing to copy.', 'error'); return; }
  navigator.clipboard.writeText(txt)
    .then(() => showStatus('<i data-lucide="clipboard-check" width="16" height="16"></i> Copied to clipboard!', 'success'))
    .catch(() => showStatus('Copy failed — try manually selecting the text.', 'error'));
});

document.getElementById('download-btn').addEventListener('click', () => {
  const txt = document.getElementById('transcription-out').innerText;
  if (!txt.trim()) { showStatus('Nothing to save.', 'error'); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' }));
  a.download = 'transcription_' + new Date().toISOString().slice(0, 10) + '.txt';
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById('clear-out-btn').addEventListener('click', () => {
  document.getElementById('transcription-out').innerHTML = '';
  renderSpelling([]); renderGrammar([]);
  clearStatus();
});

// ══ KEYBOARD SHORTCUT ══
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); transcribe(); }
  if (e.key === 'Escape') closeSettings();
});
