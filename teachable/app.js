/* ==========================================================================
   IA con cámara → micro:bit
   Entrenador de imágenes nativo (MobileNet + transferencia, los mismos módulos
   que ML - micro:bit, todo alojado en el sitio), editor MakeCode embebido con
   la categoría "Teachable" y envío de cada detección al micro:bit por USB
   como "Clase#certeza".
   ========================================================================== */
import * as trainer from '../ml/js/image-trainer.js';
import { Webcam } from '../ml/js/webcam.js';
import { Designer } from './designer.js';
import { SAMPLES_DB_NAME, SAMPLES_DB_VERSION, SAMPLES_STORE, imageSamplesKey } from '../ml/js/storage-keys.js';

const $ = s => document.querySelector(s);
const PROJECT_ID = 'tm2mb';                 // clave de muestras/modelo en IndexedDB
const STORE_KEY = 'tm2mb:native';           // { classNames, modelInfo }
const MAKECODE_URL = 'https://makecode.microbit.org/v9.0.12';
const MAKECODE_ORIGIN = 'https://makecode.microbit.org';
const SEND_EVERY_MS = 250;
const PREDICT_EVERY_MS = 90;     // ~11 predicciones por segundo: fluido sin saturar la GPU
const SMOOTH = 0.55;             // suavizado de las barras (0 = sin suavizar)

const state = {
  classes: [],            // nombres (espejo de trainer.getClassNames())
  trained: false, needsTraining: false, training: false,
  webcam: null, camOn: false, raf: 0, inFlight: false,
  tm: null,               // modelo externo de Teachable Machine { model, labels }
  source: 'native',       // 'native' | 'tm'
  best: null, lastSent: 0, lastPredict: 0, smooth: null, preds: [], predEls: null, predNames: '',
  counts: {}, lastClass: '',
  port: null, reader: null, keep: false, writer: null, writeChain: Promise.resolve(), lastEcho: 0, pongTimer: null, sentCount: 0,
  project: null, mcReady: false, mcUrl: '',
};

/* ---------- utilidades ---------- */
function toast(msg, level, ms) { const el = document.createElement('div'); el.className = 'toast ' + (level || ''); el.textContent = msg; $('#toasts').appendChild(el); setTimeout(() => el.remove(), ms || 4000); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function safeName(n) { return String(n).replace(/[#\r\n\u2028\u2029"\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40); }
function identifiers(names) {
  const used = new Set();
  return names.map((n, i) => {
    let id = n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    if (!id || !/^[A-Za-z_]/.test(id)) id = 'Clase_' + (id || (i + 1));
    let base = id, k = 2; while (used.has(id)) id = base + '_' + (k++);
    used.add(id); return id;
  });
}
function currentClasses() { return state.source === 'tm' ? state.tm.labels : state.classes; }

/* ---------- persistencia ---------- */
function saveState(modelInfo) {
  const prev = loadState() || {};
  localStorage.setItem(STORE_KEY, JSON.stringify({ classNames: state.classes.slice(), modelInfo: modelInfo === undefined ? prev.modelInfo || null : modelInfo }));
}
function loadState() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { return null; } }

async function restore() {
  const st = loadState();
  setTrainStatus('Preparando el entrenador…');
  try {
    if (st && st.modelInfo && st.modelInfo.storageKey) {
      await trainer.loadSavedModel(st.modelInfo);   // deja las clases del modelo
      state.classes = trainer.getClassNames();
      state.trained = true;
      // nombres editados después del último entrenamiento
      if (st.classNames && st.classNames.length === state.classes.length) st.classNames.forEach((n, i) => { if (n !== state.classes[i]) { trainer.renameClass(i, n); state.classes[i] = n; } });
    } else {
      await trainer.initTrainer();
      (st && st.classNames && st.classNames.length ? st.classNames : ['Clase 1', 'Clase 2']).forEach(n => { trainer.addClass(n); });
      state.classes = trainer.getClassNames();
    }
    const n = await trainer.loadSamples(PROJECT_ID).catch(() => 0);
    setTrainStatus(state.trained ? 'Modelo listo (entrenado antes). Podés agregar muestras y volver a entrenar.' : (n ? `${n} muestras guardadas. Entrená cuando quieras.` : ''), state.trained ? 'ok' : '');
  } catch (e) { console.error(e); setTrainStatus('No se pudo preparar el entrenador: ' + e.message, 'error'); }
  renderClasses();
  if (state.trained) { renderPreds(state.classes.map(c => ({ className: c, probability: 0 })), null); openMakeCode(); }
}

/* ---------- cámara ---------- */
async function startCamera() {
  if (state.camOn) return;
  try {
    state.webcam = state.webcam || new Webcam($('#chk-mirror').checked);
    state.webcam.flip = $('#chk-mirror').checked;
    await state.webcam.setup('user'); await state.webcam.play();
    const cam = $('#cam'); cam.querySelectorAll('canvas.webcam').forEach(c => c.remove());
    state.webcam.canvas.className = 'webcam'; cam.insertBefore(state.webcam.canvas, cam.firstChild);
    $('#cam-off').hidden = true; state.camOn = true;
    $('#cam-status').textContent = 'cámara activa';
    if (!state.trained) setTrainStatus(state.classes.length >= 2 ? 'Mantené apretado Capturar en cada clase (mínimo 8 muestras) y después Entrenar.' : 'Agregá al menos 2 clases.');
    loop();
  } catch (e) { console.error(e); toast('Cámara: ' + e.message, 'error', 6000); }
}
function loop() {
  if (!state.camOn) return;
  state.webcam.update();
  drawTestView();
  const canPredict = (state.source === 'tm' && state.tm) || (state.source === 'native' && state.trained && !state.needsTraining && !state.training);
  const now = performance.now();
  if (canPredict && !state.inFlight && now - state.lastPredict >= PREDICT_EVERY_MS) {
    state.inFlight = true; state.lastPredict = now;
    (state.source === 'tm' ? predictTm(state.webcam.canvas) : trainer.predict(state.webcam.canvas))
      .then(p => { state.inFlight = false; if (p && p.length) onPreds(p); })
      .catch(e => { state.inFlight = false; console.warn(e); });
  }
  state.raf = requestAnimationFrame(loop);
}
/** Copia de la cámara en "Probá el modelo", con la clase detectada encima. */
function drawTestView() {
  const c = $('#test-canvas'); if (!c || !state.webcam) return;
  const src = state.webcam.canvas; if (!src.width) return;
  if (c.width !== src.width) { c.width = src.width; c.height = src.height; }
  c.getContext('2d').drawImage(src, 0, 0);
  $('#test-empty').hidden = true;
}

/* ---------- clases y muestras ---------- */
function renderClasses() {
  const list = $('#classes-list'); list.innerHTML = '';
  state.classes.forEach((name, i) => {
    const samples = trainer.getSamples(i);
    const el = document.createElement('div'); el.className = 'cls';
    el.innerHTML = `<div class="cls-head"><input class="cls-name" value="${esc(name)}" maxlength="40" title="Nombre de la clase"><button class="btn btn-capture" data-i="${i}" title="Mantené apretado para grabar">📷 Capturar</button><span class="cls-count">${samples.length} muestra${samples.length === 1 ? '' : 's'}</span><button class="mini danger" data-del="${i}" title="Quitar clase">✕</button></div>
      <div class="thumbs ${samples.length ? 'has' : ''}">${samples.slice(-7).map(s => `<img src="${s.thumb}" alt="">`).join('')}${samples.length > 7 ? `<span>+${samples.length - 7}</span>` : ''}</div>`;
    const inp = el.querySelector('.cls-name');
    inp.addEventListener('change', () => { const v = safeName(inp.value) || ('Clase ' + (i + 1)); inp.value = v; trainer.renameClass(i, v); state.classes[i] = v; saveState(); markNeedsTraining(); refreshMakeCodeIfTrained(); });
    const cap = el.querySelector('.btn-capture');
    let captured = false;
    const start = async ev => {
      ev.preventDefault();
      if (state.training) return;
      if (!state.camOn) { setCaptureNote('Iniciando la cámara…'); await startCamera(); if (!state.camOn) return; setCaptureNote('Cámara lista: mantené apretado Capturar.'); return; }
      try { captured = true; cap.classList.add('recording'); try { cap.setPointerCapture(ev.pointerId); } catch (e) {} trainer.startCapture(i, state.webcam.canvas); setCaptureNote(''); }
      catch (e) { console.error(e); cap.classList.remove('recording'); setCaptureNote('No se pudo capturar: ' + e.message, 'error'); }
    };
    const stop = () => { if (!cap.classList.contains('recording')) return; cap.classList.remove('recording'); trainer.stopCapture(); afterCapture(i, el); };
    cap.addEventListener('pointerdown', start); cap.addEventListener('pointerup', stop); cap.addEventListener('pointercancel', stop); cap.addEventListener('lostpointercapture', stop);
    cap.addEventListener('contextmenu', ev => ev.preventDefault());
    // navegadores sin eventos de puntero o gestos cancelados: un clic = una muestra
    cap.addEventListener('click', ev => { ev.preventDefault(); if (captured) { captured = false; return; } if (!state.camOn || state.training) return; try { trainer.captureOne(i, state.webcam.canvas); afterCapture(i, el); } catch (e) { setCaptureNote('No se pudo capturar: ' + e.message, 'error'); } });
    el.querySelector('[data-del]').addEventListener('click', () => { if (state.classes.length <= 1) return; if (trainer.getSamples(i).length && !confirm(`¿Quitar la clase "${name}" y sus muestras?`)) return; trainer.removeClass(i); state.classes.splice(i, 1); saveState(); trainer.saveSamples(PROJECT_ID).catch(() => {}); markNeedsTraining(); renderClasses(); });
    list.appendChild(el);
  });
  updateTrainButton();
}
function afterCapture(i, el) {
  const samples = trainer.getSamples(i);
  el.querySelector('.cls-count').textContent = `${samples.length} muestra${samples.length === 1 ? '' : 's'}`;
  const th = el.querySelector('.thumbs'); th.classList.toggle('has', samples.length > 0);
  th.innerHTML = samples.slice(-7).map(s => `<img src="${s.thumb}" alt="">`).join('') + (samples.length > 7 ? `<span>+${samples.length - 7}</span>` : '');
  markNeedsTraining(); updateTrainButton();
  trainer.saveSamples(PROJECT_ID).catch(e => console.warn('No se pudieron guardar las muestras', e));
}
function setCaptureNote(msg, cls) { const el = $('#capture-note'); if (!el) return; el.textContent = msg || ''; el.className = 'status ' + (cls || ''); }
function markNeedsTraining() { if (state.trained) { state.needsTraining = true; setTrainStatus('Cambiaste clases o muestras: volvé a entrenar para usarlas.', 'warn'); } }
function updateTrainButton() {
  const ok = state.classes.length >= 2 && state.classes.every((_, i) => trainer.getSamples(i).length >= 8);
  $('#btn-train').disabled = !ok || state.training;
  if (!ok && !state.training && !state.trained) setTrainStatus(state.classes.length < 2 ? 'Agregá al menos 2 clases.' : 'Cada clase necesita al menos 8 muestras.');
}
function setTrainStatus(msg, cls) { const el = $('#train-status'); el.textContent = msg || ''; el.className = 'status ' + (cls || ''); }

async function train() {
  if (state.training) return;
  state.training = true; $('#btn-train').disabled = true; $('#progress').hidden = false; $('#progress i').style.width = '0%';
  setTrainStatus('Entrenando…');
  try {
    await trainer.saveSamples(PROJECT_ID);                      // train() descarta las muestras en memoria
    const res = await trainer.train((epoch, total) => { $('#progress i').style.width = Math.round((epoch + 1) / total * 100) + '%'; });
    await trainer.loadSamples(PROJECT_ID);                      // las recuperamos para seguir capturando
    const info = await trainer.saveModel(PROJECT_ID);
    state.classes = trainer.getClassNames(); saveState(info);
    state.trained = true; state.needsTraining = false; state.source = 'native';
    setTrainStatus(`Modelo entrenado ✔ (precisión ${(res.accuracy * 100).toFixed(0)} %)`, 'ok');
    $('#step-train').classList.add('done');
    renderPreds(state.classes.map(c => ({ className: c, probability: 0 })), null);
    $('#editor-hint').innerHTML = `Categoría <b>Teachable</b>: ${state.classes.map(esc).join(', ')}. Cuando termines, <b>Download</b> al micro:bit.`;
    openMakeCode();
    if (!state.camOn) toast('Iniciá la cámara para probar el modelo', 'ok');
  } catch (e) { console.error(e); setTrainStatus('Error al entrenar: ' + e.message, 'error'); }
  state.training = false; $('#progress').hidden = true; renderClasses();
}

/* ---------- modelo externo de Teachable Machine (solo imagen) ---------- */
async function loadTmUrl(url) {
  url = String(url || '').trim(); const m = /teachablemachine\.withgoogle\.com\/models\/([A-Za-z0-9_-]+)/.exec(url);
  if (m) url = 'https://teachablemachine.withgoogle.com/models/' + m[1] + '/'; else if (url && !url.endsWith('/')) url += '/';
  if (!url) return;
  const st = $('#model-status'); st.textContent = 'Cargando modelo…'; st.className = 'status';
  try {
    const bust = '?v=' + Date.now();
    const meta = await (await fetch(url + 'metadata.json' + bust, { cache: 'no-store' })).json();
    if (!meta.labels) throw new Error('Este enlace no es de un modelo de imágenes');
    const model = await tf.loadLayersModel(url + 'model.json' + bust);
    if (state.tm && state.tm.model) state.tm.model.dispose();
    state.tm = { model, labels: meta.labels.map(safeName), size: meta.imageSize || 224, canvas: document.createElement('canvas') };
    state.tm.canvas.width = state.tm.canvas.height = state.tm.size;
    state.source = 'tm';
    st.textContent = 'Modelo de Teachable Machine listo ✔: ' + state.tm.labels.join(', '); st.className = 'status ok';
    renderPreds(state.tm.labels.map(c => ({ className: c, probability: 0 })), null);
    $('#editor-hint').innerHTML = `Categoría <b>Teachable</b>: ${state.tm.labels.map(esc).join(', ')} (modelo de Teachable Machine).`;
    openMakeCode();
  } catch (e) { console.error(e); st.textContent = 'No se pudo cargar: ' + e.message; st.className = 'status error'; }
}
async function predictTm(sourceCanvas) {
  const { model, labels, size, canvas } = state.tm;
  canvas.getContext('2d').drawImage(sourceCanvas, 0, 0, size, size);
  const logits = tf.tidy(() => model.predict(tf.browser.fromPixels(canvas).toFloat().div(127).sub(1).expandDims(0)));
  const values = await logits.data(); logits.dispose();
  return labels.map((l, i) => ({ className: l, probability: values[i] }));
}

/* ---------- predicciones y envío ---------- */
function renderPreds(preds, best) {
  const names = preds.map(p => p.className).join('\u0001');
  const box = $('#preds');
  if (state.predNames !== names || !state.predEls) {   // la lista de clases cambió: se reconstruye una vez
    box.innerHTML = preds.map(p => `<div class="pred"><span>${esc(p.className)}</span><div class="bar"><i style="width:0%"></i></div><b>0%</b></div>`).join('');
    state.predEls = [...box.children].map(el => ({ el, bar: el.querySelector('i'), pct: el.querySelector('b') }));
    state.predNames = names;
  }
  preds.forEach((p, i) => { const r = state.predEls[i]; if (!r) return; const pct = Math.round(p.probability * 100) + '%'; r.bar.style.width = pct; if (r.pct.textContent !== pct) r.pct.textContent = pct; r.el.classList.toggle('top', p === best); });
}
function onPreds(raw) {
  // suavizado exponencial: menos parpadeo en barras, luces y envío
  if (!state.smooth || state.smooth.length !== raw.length || state.smooth.some((s, i) => s.className !== raw[i].className)) state.smooth = raw.map(p => ({ className: p.className, probability: p.probability }));
  else state.smooth.forEach((s, i) => { s.probability = s.probability * SMOOTH + raw[i].probability * (1 - SMOOTH); });
  const preds = state.smooth;
  let best = preds[0]; for (const p of preds) if (p.probability > best.probability) best = p;
  state.best = best; state.preds = preds; renderPreds(preds, best); $('#step-test').classList.add('done');
  const lbl = $('#test-label'); const txt = `${best.className} · ${Math.round(best.probability * 100)} %`; if (lbl.textContent !== txt) lbl.textContent = txt;
  $('#live-pill').hidden = false;
  if (best.className !== state.lastClass) { state.lastClass = best.className; state.counts[best.className] = (state.counts[best.className] || 0) + 1; window.dispatchEvent(new CustomEvent('tm2mb:class', { detail: { className: best.className, probability: best.probability } })); }
  window.dispatchEvent(new CustomEvent('tm2mb:preds', { detail: { preds, best } }));
  const now = Date.now(); if (now - state.lastSent >= SEND_EVERY_MS) { state.lastSent = now; send(best); }
}
async function send(best) {
  const conf = Math.round(best.probability * 100);
  if (conf < (+$('#min-conf').value || 0)) return;
  const line = best.className + '#' + conf;
  $('#sent').textContent = '▶ ' + line + (state.port ? '' : '   (conectá el micro:bit para enviarlo)');
  if (!state.port) return;
  await writeLine(line);
  if (state.lastEcho && Date.now() - state.lastEcho > 4000) setEcho('⚠ Hace unos segundos que el micro:bit no responde. ¿Sigue el programa cargado y el cable conectado?', 'warn');
}

/* ---------- micro:bit por USB (Web Serial) ---------- */
async function connect() {
  if (state.port) return disconnect();
  if (!navigator.serial) { toast('Este navegador no tiene Web Serial. Usá Chrome o Edge en computadora.', 'error', 6000); return; }
  try {
    const port = await navigator.serial.requestPort({ filters: [{ usbVendorId: 0x0d28 }] });
    await port.open({ baudRate: 115200 });
    state.port = port; state.keep = true; state.writer = port.writable.getWriter(); state.sentCount = 0; state.lastEcho = 0;
    $('#dot').classList.add('on'); $('#mb-status').textContent = 'conectado'; $('#btn-connect').textContent = '🔌 Desconectar'; $('#btn-connect').classList.add('connected');
    $('#btn-ping').disabled = false;
    $('#step-microbit').classList.add('done'); toast('micro:bit conectado ✔', 'ok');
    readLoop(port);
    ping();
  } catch (e) { if (e.name !== 'NotFoundError') toast('No se pudo conectar: ' + e.message, 'error', 6000); }
}
async function readLoop(port) {
  const decoder = new TextDecoderStream(); const closed = port.readable.pipeTo(decoder.writable).catch(() => {});
  const reader = decoder.readable.getReader(); state.reader = reader; let buf = '';
  try { while (state.keep) { const { value, done } = await reader.read(); if (done) break; buf += value; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) onLineFromMicrobit(line); } } }
  catch (e) {} finally { try { reader.releaseLock(); } catch (e) {} await closed; if (state.port) onDisconnected(); }
}
async function disconnect() { state.keep = false; try { if (state.reader) await state.reader.cancel(); } catch (e) {} try { if (state.writer) { state.writer.releaseLock(); } } catch (e) {} try { if (state.port) await state.port.close(); } catch (e) {} onDisconnected(); }
function onDisconnected() { state.port = null; state.reader = null; state.writer = null; clearTimeout(state.pongTimer); $('#dot').classList.remove('on'); $('#mb-status').textContent = 'desconectado'; $('#btn-connect').textContent = '🔌 Conectar por USB'; $('#btn-connect').classList.remove('connected'); $('#btn-ping').disabled = true; setEcho('', ''); }
function setEcho(msg, cls) { const el = $('#echo'); el.textContent = msg; el.className = 'echo ' + (cls || ''); }
/** Lo que contesta el micro:bit: "ok:Clase#NN" por cada línea recibida y "pong" a un "ping". */
function onLineFromMicrobit(line) {
  state.lastEcho = Date.now();
  if (line === 'pong') { clearTimeout(state.pongTimer); setEcho('✔ El micro:bit responde: tiene cargado el programa con los bloques Teachable.', 'ok'); $('#ping-status').textContent = 'respuesta recibida'; return; }
  if (line.startsWith('ok:')) { setEcho('✔ micro:bit recibió: ' + line.slice(3), 'ok'); return; }
  setEcho('◀ micro:bit dice: ' + line, '');
}
/** Escritura en cola: una línea a la vez, sin perder las siguientes. */
function writeLine(text) {
  if (!state.writer) return Promise.resolve(false);
  const data = new TextEncoder().encode(text + '\n');
  state.writeChain = state.writeChain.then(() => state.writer ? state.writer.write(data) : null).then(() => { state.sentCount++; return true; }).catch(e => { console.warn('serial write', e); return false; });
  return state.writeChain;
}
function ping() {
  if (!state.port) return;
  $('#ping-status').textContent = 'esperando respuesta…'; setEcho('Probando la conexión…', '');
  writeLine('ping');
  clearTimeout(state.pongTimer);
  state.pongTimer = setTimeout(() => { if (state.port && Date.now() - state.lastEcho > 2500) { setEcho('⚠ Conectado, pero el micro:bit no responde. Cargá en el micro:bit el programa del editor (Download) con los bloques Teachable, esperá que reinicie y conectá de nuevo.', 'warn'); $('#ping-status').textContent = 'sin respuesta'; } }, 3000);
}

/* ---------- MakeCode embebido con la categoría "Teachable" ---------- */
function classesTs(names) {
  const ids = identifiers(names);
  const members = names.map((n, i) => `    //% block=${JSON.stringify(n)}\n    ${ids[i]} = ${i}`).join(',\n');
  return `// Generado automáticamente con las clases de tu modelo. No editar.\nenum TMClase {\n${members}\n}\nnamespace teachable {\n    export const _nombres = [${names.map(n => JSON.stringify(n)).join(', ')}]\n}\n`;
}
function teachableTs() {
  return `// Bloques "Teachable": reciben por el cable USB las detecciones que manda la página
// IA con cámara → micro:bit con el formato "Clase#certeza" (una por línea).
//
// Cada clase usa su propio valor de evento (índice + 1) y los manejadores se guardan en
// listas: en MakeCode control.onEvent conserva UN solo manejador por (evento, valor), así
// que registrar dos bloques sobre el mismo valor dejaría activo solo el último.
//% color="#8e44ad" weight=100 icon="\\uf030" block="Teachable"
namespace teachable {
    const EVT = 0x7e1
    const DESCONOCIDA = 250
    let _clase = ""
    let _certeza = 0
    let _listo = false
    let _ocupados: boolean[] = []        // índice 0: "cualquier clase"; i + 1: clase i
    let _porClase: (() => void)[][] = []  // manejadores por clase
    let _cualquiera: (() => void)[] = []
    let _cualquieraListo = false

    function iniciar() {
        if (_listo) return
        _listo = true
        for (let i = 0; i <= _nombres.length; i++) {
            _porClase.push([])
            _ocupados.push(false)
        }
        serial.setBaudRate(BaudRate.BaudRate115200)
        serial.setRxBufferSize(128)
        serial.onDataReceived(serial.delimiters(Delimiters.NewLine), function () {
            const linea = serial.readUntil(serial.delimiters(Delimiters.NewLine)).trim()
            if (linea == "ping") {
                serial.writeLine("pong")
                return
            }
            const i = linea.indexOf("#")
            if (i < 0) return
            _clase = linea.substr(0, i)
            _certeza = parseInt(linea.substr(i + 1))
            serial.writeLine("ok:" + _clase + "#" + _certeza)
            const idx = _nombres.indexOf(_clase)
            control.raiseEvent(EVT, idx >= 0 ? idx + 1 : DESCONOCIDA)
        })
    }

    function correr(lista: (() => void)[], clave: number) {
        if (_ocupados[clave]) return   // si un bloque de esta lista todavía está corriendo, se descarta esta detección
        _ocupados[clave] = true
        for (let i = 0; i < lista.length; i++) lista[i]()
        _ocupados[clave] = false
    }

    /**
     * Se ejecuta cada vez que la página detecta esta clase con certeza mayor al umbral.
     */
    //% blockId=teachable_alDetectar
    //% block="al detectar %clase con certeza > %umbral \\\\%"
    //% umbral.defl=70 umbral.min=0 umbral.max=100
    //% weight=100
    export function alDetectar(clase: TMClase, umbral: number, handler: () => void) {
        iniciar()
        const idx = clase as number
        if (idx < 0 || idx >= _nombres.length) return
        if (_porClase[idx].length == 0) {
            control.onEvent(EVT, idx + 1, function () {
                correr(_porClase[idx], idx + 1)
            })
        }
        _porClase[idx].push(function () {
            if (_certeza > umbral) handler()
        })
    }

    /**
     * Se ejecuta con cualquier clase detectada con certeza mayor al umbral.
     */
    //% blockId=teachable_alDetectarCualquiera
    //% block="al detectar cualquier clase con certeza > %umbral \\\\%"
    //% umbral.defl=70 umbral.min=0 umbral.max=100
    //% weight=90
    export function alDetectarCualquiera(umbral: number, handler: () => void) {
        iniciar()
        if (!_cualquieraListo) {
            _cualquieraListo = true
            // valor 0 = cualquier valor del evento
            control.onEvent(EVT, 0, function () {
                correr(_cualquiera, 0)
            })
        }
        _cualquiera.push(function () {
            if (_certeza > umbral) handler()
        })
    }

    /**
     * ¿La última detección es esta clase con certeza mayor al umbral?
     */
    //% blockId=teachable_seDetecta
    //% block="¿se detecta %clase con certeza > %umbral \\\\%?"
    //% umbral.defl=70 umbral.min=0 umbral.max=100
    //% weight=110
    export function seDetecta(clase: TMClase, umbral: number): boolean {
        iniciar()
        return _clase == _nombres[clase] && _certeza > umbral
    }

    /**
     * Nombre de la última clase detectada.
     */
    //% blockId=teachable_claseDetectada
    //% block="clase detectada"
    //% weight=105
    export function claseDetectada(): string {
        iniciar()
        return _clase
    }

    /**
     * Certeza (0-100) de la última detección.
     */
    //% blockId=teachable_certezaDetectada
    //% block="certeza detectada"
    //% weight=60
    export function certezaDetectada(): number {
        iniciar()
        return _certeza
    }

    /**
     * Nombre de una clase del modelo.
     */
    //% blockId=teachable_nombreDe
    //% block="nombre de %clase"
    //% weight=50
    export function nombreDe(clase: TMClase): string {
        return _nombres[clase]
    }
}
`;
}
const ICONS = ['IconNames.Happy', 'IconNames.Sad', 'IconNames.Heart', 'IconNames.Yes', 'IconNames.No', 'IconNames.Square', 'IconNames.Triangle', 'IconNames.Diamond'];
/** Programa de ejemplo: un "por siempre" con un "si … sino si …" por clase (bloque booleano "¿se detecta…?"). */
function exampleMainTs(names) {
  const ids = identifiers(names);
  const chain = names.map((n, i) => `${i ? ' else ' : '    '}if (teachable.seDetecta(TMClase.${ids[i]}, 70)) {\n        basic.showIcon(${ICONS[i % ICONS.length]})\n    }`).join('');
  return `basic.forever(function () {\n${chain}\n})\n`;
}
function exampleBlocks(names) {
  const ids = identifiers(names);
  const cond = i => `<value name="IF${i}"><block type="teachable_seDetecta"><field name="clase">TMClase.${ids[i]}</field><value name="umbral"><shadow type="math_number_minmax"><mutation min="0" max="100" label="Umbral" precision="0"></mutation><field name="SLIDER">70</field></shadow></value></block></value><statement name="DO${i}"><block type="basic_show_icon"><field name="i">${ICONS[i % ICONS.length]}</field></block></statement>`;
  const ifBlock = `<block type="controls_if"><mutation elseif="${Math.max(0, names.length - 1)}"></mutation>${names.map((n, i) => cond(i)).join('')}</block>`;
  return `<xml xmlns="https://developers.google.com/blockly/xml"><block type="device_forever" x="20" y="20"><statement name="HANDLER">${ifBlock}</statement></block></xml>`;
}
function freshProject(names) {
  return { text: {
    'pxt.json': JSON.stringify({ name: 'ia-camara-microbit', description: 'IA con cámara → micro:bit', dependencies: { core: '*' }, files: ['main.blocks', 'main.ts', 'teachable.ts', 'tm-classes.ts', 'README.md'], preferredEditor: 'blocksprj' }, null, 4),
    'main.blocks': exampleBlocks(names), 'main.ts': exampleMainTs(names), 'teachable.ts': teachableTs(), 'tm-classes.ts': classesTs(names), 'README.md': ' ',
  } };
}
function projectKey() { return 'tm2mb:project:' + (state.source === 'tm' ? 'tm' : 'native'); }
function openMakeCode(reset) {
  const names = currentClasses(); if (!names.length) return;
  const iframe = $('#makecode'); $('#editor-placeholder').hidden = true;
  let saved = null;
  if (!reset) { try { saved = JSON.parse(localStorage.getItem(projectKey()) || 'null'); } catch (e) {} }
  const savedClasses = localStorage.getItem(projectKey() + ':classes') || '', classesNow = JSON.stringify(names);
  if (saved && savedClasses && savedClasses !== classesNow) {
    // mismas clases renombradas → se conserva el programa con los nombres nuevos; distinta cantidad → programa nuevo
    let prev = []; try { prev = JSON.parse(savedClasses); } catch (e) {}
    if (prev.length !== names.length) { saved = null; toast('Cambió la cantidad de clases: se generó un programa nuevo.', 'warn', 6000); }
  }
  localStorage.setItem(projectKey() + ':classes', classesNow);
  if (saved && saved.text && typeof saved.text === 'object' && Object.keys(saved.text).length) state.project = { ...saved, text: { ...saved.text, 'teachable.ts': teachableTs(), 'tm-classes.ts': classesTs(names) } };
  else state.project = freshProject(names);
  state.mcReady = false;
  if (iframe.getAttribute('src')) iframe.src = 'about:blank';
  setTimeout(() => { iframe.src = MAKECODE_URL + '?controller=1'; }, 50);
}
function refreshMakeCodeIfTrained() { if (state.trained && state.source === 'native') openMakeCode(); }
window.addEventListener('message', ev => {
  const iframe = $('#makecode');
  if (ev.source !== iframe.contentWindow || ev.origin !== MAKECODE_ORIGIN) return;
  const d = ev.data; if (!d || !d.type) return;
  if (d.action === 'workspacesync') { state.mcReady = true; iframe.contentWindow.postMessage({ ...d, type: 'pxthost', success: true, projects: [state.project], controllerId: 'ia-camara-microbit', editor: {} }, MAKECODE_ORIGIN); }
  else if (d.action === 'workspacesave' && d.project && d.project.text) { try { localStorage.setItem(projectKey(), JSON.stringify(d.project)); } catch (e) {} }
});

/* ---------- guardar / abrir el proyecto completo (sin conexión) ---------- */
function idb() { return new Promise((res, rej) => { const r = indexedDB.open(SAMPLES_DB_NAME, SAMPLES_DB_VERSION); r.onupgradeneeded = e => { const db = e.target.result; if (!db.objectStoreNames.contains(SAMPLES_STORE)) db.createObjectStore(SAMPLES_STORE); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function idbGet(key) { const db = await idb(); return new Promise((res, rej) => { const q = db.transaction(SAMPLES_STORE).objectStore(SAMPLES_STORE).get(key); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
async function idbPut(key, value) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction(SAMPLES_STORE, 'readwrite'); tx.objectStore(SAMPLES_STORE).put(value, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
function bufToB64(buf) { const bytes = new Uint8Array(buf); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
function b64ToBuf(b64) { const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return bytes.buffer; }

async function exportProject() {
  const btn = $('#btn-export'); btn.disabled = true; btn.textContent = 'Preparando…';
  try {
    await trainer.saveSamples(PROJECT_ID).catch(() => {});
    const st = loadState() || {};
    const data = { app: 'ia-camara-microbit', v: 1, saved: new Date().toISOString(), classNames: state.classes.slice(), model: null, samples: (await idbGet(imageSamplesKey(PROJECT_ID))) || [], makecode: null, makecodeClasses: localStorage.getItem('tm2mb:project:native:classes') || '', design: Designer.serialize() };
    try { data.makecode = JSON.parse(localStorage.getItem('tm2mb:project:native') || 'null'); } catch (e) {}
    if (st.modelInfo && st.modelInfo.storageKey) {
      const m = await tf.loadLayersModel('indexeddb://' + st.modelInfo.storageKey);
      const art = await new Promise(res => m.save(tf.io.withSaveHandler(async a => { res(a); return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } }; })));
      m.dispose();
      let wd = art.weightData; if (Array.isArray(wd)) { const total = wd.reduce((n, b) => n + b.byteLength, 0); const out = new Uint8Array(total); let o = 0; wd.forEach(b => { out.set(new Uint8Array(b), o); o += b.byteLength; }); wd = out.buffer; }
      data.model = { info: st.modelInfo, modelTopology: art.modelTopology, weightSpecs: art.weightSpecs, format: art.format, generatedBy: art.generatedBy, convertedBy: art.convertedBy, weightsB64: bufToB64(wd) };
    }
    const name = 'proyecto-ia-microbit-' + new Date().toISOString().slice(0, 10) + '.json';
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast(`Proyecto guardado: ${data.classNames.length} clases, ${data.samples.length} muestras${data.model ? ', modelo entrenado' : ''}, programa e interfaz.`, 'ok', 6000);
  } catch (e) { console.error(e); toast('No se pudo guardar: ' + e.message, 'error', 6000); }
  btn.disabled = false; btn.textContent = '⬇ Guardar todo';
}
function importProject() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!d || d.app !== 'ia-camara-microbit' || !Array.isArray(d.classNames)) throw new Error('no es un proyecto de esta página');
      if (!confirm(`Se reemplaza lo que hay en este navegador por el proyecto "${f.name}" (${d.classNames.length} clases, ${(d.samples || []).length} muestras${d.model ? ', modelo entrenado' : ''}). ¿Continuar?`)) return;
      toast('Recuperando el proyecto…', '', 4000);
      // muestras
      await idbPut(imageSamplesKey(PROJECT_ID), Array.isArray(d.samples) ? d.samples : []);
      // modelo entrenado
      let modelInfo = null;
      if (d.model && d.model.weightsB64 && d.model.modelTopology) {
        const art = { modelTopology: d.model.modelTopology, weightSpecs: d.model.weightSpecs, weightData: b64ToBuf(d.model.weightsB64), format: d.model.format, generatedBy: d.model.generatedBy, convertedBy: d.model.convertedBy };
        const m = await tf.loadLayersModel(tf.io.fromMemory(art));
        modelInfo = { ...(d.model.info || {}), source: 'local', storageKey: 'ml-image-local-' + PROJECT_ID, classNames: d.classNames.slice(), featureExtractor: 'mobilenet_v1_0.25_224', trainedAt: (d.model.info && d.model.info.trainedAt) || d.saved };
        await m.save('indexeddb://' + modelInfo.storageKey); m.dispose();
      }
      localStorage.setItem(STORE_KEY, JSON.stringify({ classNames: d.classNames.slice(), modelInfo }));
      // programa del micro:bit e interfaz
      if (d.makecode && d.makecode.text) localStorage.setItem('tm2mb:project:native', JSON.stringify(d.makecode)); else localStorage.removeItem('tm2mb:project:native');
      localStorage.setItem('tm2mb:project:native:classes', d.makecodeClasses || JSON.stringify(d.classNames));
      if (d.design) localStorage.setItem('tm2mb:design', JSON.stringify(d.design));
      location.reload();
    } catch (e) { console.error(e); toast('No se pudo abrir el proyecto: ' + e.message, 'error', 7000); }
  };
  inp.click();
}

/* ---------- arranque ---------- */
$('#btn-cam').addEventListener('click', startCamera);
$('#chk-mirror').addEventListener('change', ev => { if (state.webcam) state.webcam.flip = ev.target.checked; });
$('#btn-add-class').addEventListener('click', () => { if (state.classes.length >= 10) return toast('Máximo 10 clases', 'warn'); const n = safeName(prompt('Nombre de la nueva clase:', 'Clase ' + (state.classes.length + 1)) || ''); if (!n) return; trainer.addClass(n); state.classes.push(n); saveState(); markNeedsTraining(); renderClasses(); });
$('#btn-train').addEventListener('click', train);
$('#model-form').addEventListener('submit', ev => { ev.preventDefault(); loadTmUrl($('#model-url').value); });
$('#btn-connect').addEventListener('click', connect);
$('#btn-ping').addEventListener('click', ping);
$('#btn-export').addEventListener('click', exportProject);
$('#btn-import').addEventListener('click', importProject);
$('#btn-help').addEventListener('click', () => $('#help').scrollIntoView({ behavior: 'smooth' }));
$('#btn-reset-code').addEventListener('click', () => { if (!currentClasses().length) return; if (confirm('Se reemplaza el programa actual por el de ejemplo. ¿Continuar?')) { localStorage.removeItem(projectKey()); openMakeCode(true); } });
$('#btn-reset-all').addEventListener('click', async () => {
  if (!confirm('Se borran el modelo, las muestras y el programa guardados en este navegador. ¿Continuar?')) return;
  const st = loadState(); if (st && st.modelInfo) await trainer.deleteModel(st.modelInfo.storageKey).catch(() => {});
  await trainer.deleteSamplesDB(PROJECT_ID).catch(() => {});
  ['tm2mb:native', 'tm2mb:project:native', 'tm2mb:project:native:classes'].forEach(k => localStorage.removeItem(k));
  location.reload();
});
if (!navigator.serial) $('#mb-status').textContent = 'este navegador no tiene Web Serial (usá Chrome o Edge)';
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => showView(t.dataset.view)));
function showView(v) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === v));
  $('#view-train').hidden = v !== 'train'; $('#view-design').hidden = v !== 'design';
  if (v === 'design') { Designer.show(); if (!state.camOn && (state.trained || state.tm)) toast('La cámara está apagada: iniciála en la pestaña 1 para ver datos en vivo', 'warn', 5000); }
}
Designer.init({
  getClasses: () => currentClasses(),
  getCamera: () => (state.camOn && state.webcam ? state.webcam.canvas : null),
  getCounts: () => state.counts,
  getSerial: () => ({ connected: !!state.port, last: $('#sent').textContent }),
  isReady: () => !!(state.trained || state.tm),
  toast,
});
tf.enableProdMode && tf.enableProdMode();
restore();

window.TM2MB = { state, trainer, startCamera, train, loadTmUrl, identifiers, freshProject, renderClasses, showView, Designer, exportProject, importProject, send, ping, openMakeCode, teachableTs };
