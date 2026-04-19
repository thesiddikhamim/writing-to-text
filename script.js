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
  showStatus('✓ Settings saved successfully.', 'success');
});

// ══ HAMBURGER ══
const menuBtn = document.getElementById('menu-btn');
const panel = document.getElementById('settings-panel');
const overlay = document.getElementById('overlay');
menuBtn.addEventListener('click', () => panel.classList.contains('open') ? closeSettings() : openSettings());
overlay.addEventListener('click', closeSettings);
function openSettings() { panel.classList.add('open'); menuBtn.classList.add('open'); overlay.classList.add('show'); }
function closeSettings() { panel.classList.remove('open'); menuBtn.classList.remove('open'); overlay.classList.remove('show'); }

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
      <button class="crop-btn-overlay" onclick="openCrop('${item.id}')" title="Crop">✂</button>
      <button class="remove-img-btn" onclick="removeImage('${item.id}')" title="Remove">&times;</button>
    `;
    gallery.appendChild(div);
  });
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

  const batchSize = 3;
  const totalImages = imageItems.length;
  const batches = [];
  for (let i = 0; i < totalImages; i += batchSize) {
    batches.push(imageItems.slice(i, i + batchSize));
  }

  const finalResult = {
    original: '',
    corrected: '',
    spelling_errors: [],
    grammar_issues: []
  };

  try {
    for (let i = 0; i < batches.length; i++) {
      const currentBatchIndices = Array.from({ length: batches[i].length }, (_, k) => i * batchSize + k + 1);
      showStatus(`Transcribing batch ${i + 1} of ${batches.length} (Pages ${currentBatchIndices.join(', ')})...`, 'loading');

      const imageParts = batches[i].map(item => ({
        inline_data: {
          mime_type: item.mimeType,
          data: item.dataURL.split(',')[1]
        }
      }));

      const langNote = settings.lang === 'auto' ? 'Detect the language automatically.' : `The text is written in ${settings.lang}.`;
      const paraNote = settings.keepParagraphs
        ? 'Preserve the exact paragraph structure — each new paragraph in the handwriting must become a new paragraph in output, separated by \\n\\n.'
        : 'Transcribe as a single continuous block of text.';
      const spellNote = settings.fixSpelling
        ? 'In the "corrected" field, fix every spelling mistake. In "spelling_errors" list each error.'
        : 'Do not alter the original spelling — leave "corrected" the same as "original" and set "spelling_errors" to [].';
      const grammarNote = settings.fixGrammar
        ? 'Identify every grammatical error in the transcription and provide suggestions in "grammar_issues". Also apply these grammar fixes to the "corrected" field.'
        : 'Do not identify or fix grammatical errors. Set "grammar_issues" to [].';

      const prompt = `You are an expert handwriting OCR and proofreading assistant.

I have provided ${batches[i].length} image(s) containing handwritten text. They are provided in sequential order. 
These are pages ${currentBatchIndices.join(', ')} of a larger document.

Carefully read the handwritten text in ALL ${batches[i].length} provided images and do the following:

1. TRANSCRIPTION: Transcribe every word exactly as written. IMPORTANT: Transcribe all images in the order they are provided. Do not skip any image. Combine the transcription for this batch into a single unified text. ${langNote}
2. PARAGRAPHS: ${paraNote}
3. SPELLING: ${spellNote}
4. GRAMMAR: ${grammarNote}

Return the result as a JSON object matching the requested schema.`;

      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:streamGenerateContent?alt=sse&key=${settings.apiKey}`,
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
              maxOutputTokens: 8192,
              response_mime_type: "application/json",
              response_schema: {
                type: "OBJECT",
                properties: {
                  original: { type: "STRING" },
                  corrected: { type: "STRING" },
                  spelling_errors: {
                    type: "ARRAY",
                    items: {
                      type: "OBJECT",
                      properties: {
                        wrong: { type: "STRING" },
                        correct: { type: "STRING" },
                        note: { type: "STRING" }
                      },
                      required: ["wrong", "correct", "note"]
                    }
                  },
                  grammar_issues: {
                    type: "ARRAY",
                    items: {
                      type: "OBJECT",
                      properties: {
                        original: { type: "STRING" },
                        corrected: { type: "STRING" },
                        explanation: { type: "STRING" }
                      },
                      required: ["original", "corrected", "explanation"]
                    }
                  }
                },
                required: ["original", "corrected", "spelling_errors", "grammar_issues"]
              }
            }
          })
        }
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        const msg = err.error?.message || `HTTP ${resp.status}`;
        throw new Error(`Batch ${i + 1} failed: ${msg}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let rawJson = "";
      let buffer = "";
      
      while (true) {
        const { done, value } = await reader.read();
        if (value) {
          buffer += decoder.decode(value, { stream: true });
        }
        if (done) {
          buffer += decoder.decode(); // Flush stream entirely
        }
        
        let lines = buffer.split('\n');
        if (!done) {
          buffer = lines.pop(); // Keep incomplete line
        } else {
          buffer = ""; // End of stream, process all lines
        }
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('data: ')) {
            const dataStr = trimmedLine.substring(6);
            if (dataStr === '[DONE]') continue;
            try {
              const dataObj = JSON.parse(dataStr);
              const chunkText = dataObj.candidates?.[0]?.content?.parts?.[0]?.text || "";
              rawJson += chunkText;
              
              // Livestream Extraction
              const extractKey = (settings.fixSpelling || settings.fixGrammar) ? '"corrected": "' : '"original": "';
              const startIndex = rawJson.indexOf(extractKey);
              if (startIndex !== -1) {
                const stringStart = startIndex + extractKey.length;
                let currentString = rawJson.substring(stringStart);
                
                for(let j = 0; j < currentString.length; j++) {
                  if (currentString[j] === '"' && (j === 0 || currentString[j-1] !== '\\')) {
                    currentString = currentString.substring(0, j);
                    break;
                  }
                }
                
                currentString = currentString.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                
                const baseText = (settings.fixSpelling || settings.fixGrammar) ? finalResult.corrected : finalResult.original;
                const combinedText = baseText ? (baseText + '\n\n' + currentString) : currentString;
                
                const out = document.getElementById('transcription-out');
                out.innerHTML = '';
                const paragraphs = combinedText.split(/\n\n+/);
                paragraphs.forEach(para => {
                  if (!para.trim()) return;
                  const p = document.createElement('p');
                  p.textContent = para.trim();
                  out.appendChild(p);
                });
              }
            } catch(e) { }
          }
        }
        if (done) break;
      }

      if (!rawJson) throw new Error(`Gemini returned an empty response for batch ${i + 1}.`);

      let result;
      try {
        result = JSON.parse(rawJson);
      } catch (e) {
        console.error("Parse error on raw text:", rawJson);
        throw new Error(`Could not parse AI response for batch ${i + 1}. JSON mode was active but parsing failed.`);
      }

      // Merge results
      finalResult.original += (finalResult.original ? '\n\n' : '') + result.original;
      finalResult.corrected += (finalResult.corrected ? '\n\n' : '') + result.corrected;
      if (result.spelling_errors) finalResult.spelling_errors.push(...result.spelling_errors);
      if (result.grammar_issues) finalResult.grammar_issues.push(...result.grammar_issues);
    }

    // ── Render analysis ──
    if (settings.showAnalysis) {
      renderSpelling(finalResult.spelling_errors || []);
      renderGrammar(finalResult.grammar_issues || []);
    }

    const se = finalResult.spelling_errors.length;
    const gi = finalResult.grammar_issues.length;
    showStatus(`✓ Transcription complete — Total ${totalImages} images processed in ${batches.length} batches. ${se} spelling issues, ${gi} grammar issues found.`, 'success');

  } catch (e) {
    console.error(e);
    showStatus('Error: ' + e.message, 'error');
  } finally {
    btn.disabled = imageItems.length === 0;
    label.innerHTML = '✦ Transcribe Handwriting';
  }
}

// ══ ANALYSIS RENDERERS ══
function renderSpelling(errors) {
  const body = document.getElementById('spell-body');
  const count = document.getElementById('spell-count');
  count.textContent = errors.length;
  if (!errors.length) {
    body.innerHTML = '<div class="analysis-empty">✓ No spelling errors found!</div>'; return;
  }
  body.innerHTML = '';
  errors.forEach((e, i) => {
    const d = document.createElement('div');
    d.className = 'issue-item spelling';
    d.style.animationDelay = (i * 0.055) + 's';
    d.innerHTML = `
  <div class="issue-word">
    <span class="wrong">${esc(e.wrong)}</span>
    <span class="arrow">→</span>
    <span class="right">${esc(e.correct)}</span>
  </div>
  <div class="issue-explain">${esc(e.note || '')}</div>`;
    body.appendChild(d);
  });
}

function renderGrammar(issues) {
  const body = document.getElementById('grammar-body');
  const count = document.getElementById('grammar-count');
  count.textContent = issues.length;
  if (!issues.length) {
    body.innerHTML = '<div class="analysis-empty">✓ No grammar issues found!</div>'; return;
  }
  body.innerHTML = '';
  issues.forEach((g, i) => {
    const d = document.createElement('div');
    d.className = 'issue-item grammar';
    d.style.animationDelay = (i * 0.055) + 's';
    d.innerHTML = `
  <div class="issue-word">
    <span class="wrong">${esc(g.original)}</span>
    <span class="arrow">→</span>
    <span class="right">${esc(g.corrected)}</span>
  </div>
  <div class="issue-explain">${esc(g.explanation || '')}</div>`;
    body.appendChild(d);
  });
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ══ STATUS ══
function showStatus(msg, type) {
  const bar = document.getElementById('status-bar');
  bar.className = 'show ' + type;
  bar.innerHTML = msg;
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
    .then(() => showStatus('✓ Copied to clipboard!', 'success'))
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
