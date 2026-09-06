// ---------- State ----------
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const cursorLayer = document.getElementById('cursorLayer');

let drawing = false;
let lastX = 0, lastY = 0;
let currentTool = 'pen';
let currentColor = '#1e1e1e';
let currentSize = 4;
let strokes = [];        // full history for this session (used to redraw & save)
let dirty = false;

const userName = `Guest-${Math.random().toString(36).slice(2, 6)}`;

// Board id comes from the URL (?board=<id>) so a link can be shared for live collaboration.
// If missing, a new board is created on the backend the first time the user saves.
const params = new URLSearchParams(window.location.search);
let boardId = params.get('board');

// ---------- Canvas sizing (responsive, high-DPI aware) ----------
function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const imageData = canvas.width && canvas.height ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  redrawAll();
}
window.addEventListener('resize', resizeCanvas);

function redrawAll() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  strokes.forEach((s) => drawSegment(s, false));
}

function drawSegment(s, record = true) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = s.size;
  ctx.strokeStyle = s.tool === 'eraser' ? '#ffffff' : s.color;
  ctx.beginPath();
  ctx.moveTo(s.x0, s.y0);
  ctx.lineTo(s.x1, s.y1);
  ctx.stroke();
  ctx.restore();
  if (record) strokes.push(s);
}

// ---------- Pointer handling (mouse + touch/stylus via Pointer Events) ----------
function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

canvas.addEventListener('pointerdown', (e) => {
  drawing = true;
  const p = getPos(e);
  lastX = p.x; lastY = p.y;
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  const p = getPos(e);
  socket.emit('cursor-move', { boardId, user: userName, x: p.x, y: p.y });

  if (!drawing) return;
  const seg = {
    x0: lastX, y0: lastY, x1: p.x, y1: p.y,
    color: currentColor, size: currentSize, tool: currentTool
  };
  drawSegment(seg);
  socket.emit('draw', { boardId, stroke: seg });
  lastX = p.x; lastY = p.y;
  dirty = true;
  setSaveStatus('Unsaved changes');
});

['pointerup', 'pointerleave', 'pointercancel'].forEach((evt) =>
  canvas.addEventListener(evt, () => (drawing = false))
);

// ---------- Toolbar ----------
document.querySelectorAll('.tool-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tool-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentTool = btn.dataset.tool;
  });
});

document.getElementById('colorPicker').addEventListener('input', (e) => {
  currentColor = e.target.value;
});

const sizeSlider = document.getElementById('sizeSlider');
const sizeValue = document.getElementById('sizeValue');
sizeSlider.addEventListener('input', (e) => {
  currentSize = Number(e.target.value);
  sizeValue.textContent = currentSize;
});

document.getElementById('clearBtn').addEventListener('click', () => {
  strokes = [];
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  socket.emit('clear', { boardId });
  dirty = true;
  setSaveStatus('Unsaved changes');
});

document.getElementById('menuToggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

// ---------- Socket.io real-time collaboration ----------
const socket = io(API_BASE, { transports: ['websocket', 'polling'] });

socket.on('connect', () => {
  if (!boardId) boardId = 'lobby'; // default shared room until the user saves/creates a board
  socket.emit('join-board', { boardId, user: userName });
});

socket.on('draw', (seg) => drawSegment(seg));
socket.on('clear', () => {
  strokes = [];
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

socket.on('presence-update', (users) => {
  const list = document.getElementById('presenceList');
  list.innerHTML = '';
  users.forEach((u) => {
    const li = document.createElement('li');
    li.textContent = u;
    list.appendChild(li);
  });
});

const cursorEls = {};
socket.on('cursor-move', ({ user, x, y }) => {
  let el = cursorEls[user];
  if (!el) {
    el = document.createElement('div');
    el.className = 'remote-cursor';
    el.textContent = user;
    cursorLayer.appendChild(el);
    cursorEls[user] = el;
  }
  el.style.left = x + 'px';
  el.style.top = y + 'px';
});
socket.on('user-left', (user) => {
  if (cursorEls[user]) {
    cursorEls[user].remove();
    delete cursorEls[user];
  }
});

// ---------- Save / Load boards (REST API) ----------
function setSaveStatus(text) {
  document.getElementById('saveStatus').textContent = text;
}

async function saveBoard() {
  const name = document.getElementById('boardName').value || 'Untitled Board';
  const thumbnail = canvas.toDataURL('image/png');
  const recognizedText = document.getElementById('recognizedText').value;

  try {
    if (!boardId || boardId === 'lobby') {
      const res = await fetch(`${API_BASE}/api/boards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, owner: userName })
      });
      const board = await res.json();
      boardId = board._id;
      const url = new URL(window.location.href);
      url.searchParams.set('board', boardId);
      window.history.replaceState({}, '', url);
    }

    await fetch(`${API_BASE}/api/boards/${boardId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, strokes, thumbnail, recognizedText })
    });

    dirty = false;
    setSaveStatus('Saved just now');
    loadBoardList();
  } catch (err) {
    setSaveStatus('Save failed (backend unreachable)');
    console.error(err);
  }
}

async function loadBoardList() {
  try {
    const res = await fetch(`${API_BASE}/api/boards`);
    const boards = await res.json();
    const select = document.getElementById('boardList');
    select.innerHTML = '';
    boards.forEach((b) => {
      const opt = document.createElement('option');
      opt.value = b._id;
      opt.textContent = b.name;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error('Could not load board list:', err);
  }
}

async function loadSelectedBoard() {
  const select = document.getElementById('boardList');
  const id = select.value;
  if (!id) return;

  try {
    const res = await fetch(`${API_BASE}/api/boards/${id}`);
    const board = await res.json();

    boardId = board._id;
    document.getElementById('boardName').value = board.name;
    document.getElementById('recognizedText').value = board.recognizedText || '';
    strokes = board.strokes || [];
    redrawAll();

    const url = new URL(window.location.href);
    url.searchParams.set('board', boardId);
    window.history.replaceState({}, '', url);

    socket.emit('join-board', { boardId, user: userName });
    setSaveStatus('Loaded');
  } catch (err) {
    console.error(err);
  }
}

document.getElementById('saveBtn').addEventListener('click', saveBoard);
document.getElementById('loadBtn').addEventListener('click', loadSelectedBoard);
document.getElementById('newBoardBtn').addEventListener('click', () => {
  boardId = null;
  strokes = [];
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  document.getElementById('boardName').value = 'Untitled Board';
  document.getElementById('recognizedText').value = '';
  const url = new URL(window.location.href);
  url.searchParams.delete('board');
  window.history.replaceState({}, '', url);
  socket.emit('join-board', { boardId: 'lobby', user: userName });
  boardId = 'lobby';
  setSaveStatus('Not saved');
});
document.getElementById('shareBtn').addEventListener('click', async () => {
  if (!boardId || boardId === 'lobby') {
    await saveBoard();
  }
  const url = new URL(window.location.href);
  url.searchParams.set('board', boardId);
  await navigator.clipboard.writeText(url.toString());
  setSaveStatus('Share link copied');
});

// Warn before leaving with unsaved changes
window.addEventListener('beforeunload', (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ---------- AI handwriting recognition (Tesseract.js, runs client-side) ----------
// Crops to the drawn content, upscales, and binarizes (pure black/white) before
// handing the image to Tesseract — this alone fixes most misreads, since OCR
// engines are tuned for large, high-contrast, tightly-cropped text rather than
// a small mark on a big blank canvas.
function preprocessForOCR(sourceCanvas) {
  const srcCtx = sourceCanvas.getContext('2d');
  const { width, height } = sourceCanvas;
  const imgData = srcCtx.getImageData(0, 0, width, height);
  const px = imgData.data;

  // Find the bounding box of all non-white (i.e. drawn) pixels.
  let minX = width, minY = height, maxX = 0, maxY = 0;
  let found = false;
  for (let y = 0; y < height; y += 2) {       // step by 2 for speed
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      const isWhite = px[i] > 245 && px[i + 1] > 245 && px[i + 2] > 245;
      if (!isWhite && px[i + 3] > 0) {
        found = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!found) return null; // nothing drawn

  const pad = 20;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width, maxX + pad);
  maxY = Math.min(height, maxY + pad);
  const cropW = maxX - minX;
  const cropH = maxY - minY;

  // Upscale so the text is comfortably large for the OCR engine (target ~600px tall).
  const scale = Math.max(1, Math.min(4, 600 / cropH));
  const outCanvas = document.createElement('canvas');
  outCanvas.width = cropW * scale;
  outCanvas.height = cropH * scale;
  const outCtx = outCanvas.getContext('2d');
  outCtx.imageSmoothingEnabled = true;
  outCtx.fillStyle = '#ffffff';
  outCtx.fillRect(0, 0, outCanvas.width, outCanvas.height);
  outCtx.drawImage(sourceCanvas, minX, minY, cropW, cropH, 0, 0, outCanvas.width, outCanvas.height);

  // Binarize: push every pixel to pure black or pure white so faint/anti-aliased
  // strokes read as solid text instead of grey noise.
  const outData = outCtx.getImageData(0, 0, outCanvas.width, outCanvas.height);
  const outPx = outData.data;
  const threshold = 200;
  for (let i = 0; i < outPx.length; i += 4) {
    const gray = (outPx[i] + outPx[i + 1] + outPx[i + 2]) / 3;
    const v = gray < threshold ? 0 : 255;
    outPx[i] = outPx[i + 1] = outPx[i + 2] = v;
  }
  outCtx.putImageData(outData, 0, 0);

  return outCanvas;
}

document.getElementById('recognizeBtn').addEventListener('click', async () => {
  const loading = document.getElementById('ocrLoading');
  loading.classList.remove('hidden');
  try {
    const processed = preprocessForOCR(canvas);
    if (!processed) {
      document.getElementById('recognizedText').value = '(Nothing drawn yet)';
      return;
    }

    const { data } = await Tesseract.recognize(processed.toDataURL('image/png'), 'eng', {
      // PSM 6 = "assume a single uniform block of text" — much better fit for
      // handwritten notes than the default "sparse text" mode.
      tessedit_pageseg_mode: '6'
    });

    document.getElementById('recognizedText').value = data.text.trim() || '(No text detected — try writing bigger, in clear block letters)';
  } catch (err) {
    document.getElementById('recognizedText').value = 'Recognition failed: ' + err.message;
  } finally {
    loading.classList.add('hidden');
  }
});

// ---------- Init ----------
resizeCanvas();
loadBoardList();
