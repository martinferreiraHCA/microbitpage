/* ==========================================================================
   IA con cámara → micro:bit
   Entrenador de imágenes nativo (MobileNet + transferencia, los mismos módulos
   que ML - micro:bit, todo alojado en el sitio), editor MakeCode embebido con
   la categoría "Teachable" y envío de cada detección al micro:bit por USB
   como "Clase#certeza".
   ========================================================================== */
import * as trainer from '../ml/js/image-trainer.js';
import { Webcam } from '../ml/js/webcam.js';

const $ = s => document.querySelector(s);
const PROJECT_ID = 'tm2mb';                 // clave de muestras/modelo en IndexedDB
const STORE_KEY = 'tm2mb:native';           // { classNames, modelInfo }
const MAKECODE_URL = 'https://makecode.microbit.org/v9.0.12';
const MAKECODE_ORIGIN = 'https://makecode.microbit.org';
const SEND_EVERY_MS = 250;

const state = {
  classes: [],            // nombres (espejo de trainer.getClassNames())
  trained: false, needsTraining: false, training: false,
  webcam: null, camOn: false, raf: 0, inFlight: false,
  tm: null,               // modelo externo de Teachable Machine { model, labels }
  source: 'native',       // 'native' | 'tm'
  best: null, lastSent: 0,
  port: null, reader: null, keep: false,
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
    loop();
  } catch (e) { console.error(e); toast('Cámara: ' + e.message, 'error', 6000); }
}
function loop() {
  if (!state.camOn) return;
  state.webcam.update();
  const canPredict = (state.source === 'tm' && state.tm) || (state.source === 'native' && state.trained && !state.needsTraining && !state.training);
  if (canPredict && !state.inFlight) {
    state.inFlight = true;
    (state.source === 'tm' ? predictTm(state.webcam.canvas) : trainer.predict(state.webcam.canvas))
      .then(p => { state.inFlight = false; if (p && p.length) onPreds(p); })
      .catch(e => { state.inFlight = false; console.warn(e); });
  }
  state.raf = requestAnimationFrame(loop);
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
    const start = ev => { ev.preventDefault(); if (!state.camOn) { toast('Primero iniciá la cámara', 'warn'); return; } cap.classList.add('recording'); trainer.startCapture(i, state.webcam.canvas); };
    const stop = () => { if (!cap.classList.contains('recording')) return; cap.classList.remove('recording'); trainer.stopCapture(); afterCapture(i, el); };
    cap.addEventListener('pointerdown', start); cap.addEventListener('pointerup', stop); cap.addEventListener('pointerleave', stop); cap.addEventListener('pointercancel', stop);
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
  $('#preds').innerHTML = preds.map(p => `<div class="pred ${p === best ? 'top' : ''}"><span>${esc(p.className)}</span><div class="bar"><i style="width:${(p.probability * 100).toFixed(0)}%"></i></div><b>${(p.probability * 100).toFixed(0)}%</b></div>`).join('');
}
function onPreds(preds) {
  let best = preds[0]; for (const p of preds) if (p.probability > best.probability) best = p;
  state.best = best; renderPreds(preds, best); $('#step-test').classList.add('done');
  const now = Date.now(); if (now - state.lastSent >= SEND_EVERY_MS) { state.lastSent = now; send(best); }
}
async function send(best) {
  const conf = Math.round(best.probability * 100);
  if (conf < (+$('#min-conf').value || 0)) return;
  const line = best.className + '#' + conf;
  $('#sent').textContent = '▶ ' + line + (state.port ? '' : '   (conectá el micro:bit para enviarlo)');
  if (!state.port || !state.port.writable) return;
  try { const w = state.port.writable.getWriter(); await w.write(new TextEncoder().encode(line + '\n')); w.releaseLock(); } catch (e) { console.warn(e); }
}

/* ---------- micro:bit por USB (Web Serial) ---------- */
async function connect() {
  if (state.port) return disconnect();
  if (!navigator.serial) { toast('Este navegador no tiene Web Serial. Usá Chrome o Edge en computadora.', 'error', 6000); return; }
  try {
    const port = await navigator.serial.requestPort({ filters: [{ usbVendorId: 0x0d28 }] });
    await port.open({ baudRate: 115200 });
    state.port = port; state.keep = true;
    $('#dot').classList.add('on'); $('#mb-status').textContent = 'conectado'; $('#btn-connect').textContent = '🔌 Desconectar'; $('#btn-connect').classList.add('connected');
    $('#step-microbit').classList.add('done'); toast('micro:bit conectado ✔', 'ok');
    readLoop(port);
  } catch (e) { if (e.name !== 'NotFoundError') toast('No se pudo conectar: ' + e.message, 'error', 6000); }
}
async function readLoop(port) {
  const decoder = new TextDecoderStream(); const closed = port.readable.pipeTo(decoder.writable).catch(() => {});
  const reader = decoder.readable.getReader(); state.reader = reader; let buf = '';
  try { while (state.keep) { const { value, done } = await reader.read(); if (done) break; buf += value; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) $('#sent').textContent = '◀ ' + line; } } }
  catch (e) {} finally { try { reader.releaseLock(); } catch (e) {} await closed; if (state.port) onDisconnected(); }
}
async function disconnect() { state.keep = false; try { if (state.reader) await state.reader.cancel(); } catch (e) {} try { if (state.port) await state.port.close(); } catch (e) {} onDisconnected(); }
function onDisconnected() { state.port = null; state.reader = null; $('#dot').classList.remove('on'); $('#mb-status').textContent = 'desconectado'; $('#btn-connect').textContent = '🔌 Conectar por USB'; $('#btn-connect').classList.remove('connected'); }

/* ---------- MakeCode embebido con la categoría "Teachable" ---------- */
function classesTs(names) {
  const ids = identifiers(names);
  const members = names.map((n, i) => `    //% block=${JSON.stringify(n)}\n    ${ids[i]} = ${i}`).join(',\n');
  return `// Generado automáticamente con las clases de tu modelo. No editar.\nenum TMClase {\n${members}\n}\nnamespace teachable {\n    export const _nombres = [${names.map(n => JSON.stringify(n)).join(', ')}]\n}\n`;
}
function teachableTs() {
  return `// Bloques "Teachable": reciben por el cable USB las detecciones que manda la página
// IA con cámara → micro:bit con el formato "Clase#certeza" (una por línea).
//% color="#8e44ad" weight=100 icon="\\uf030" block="Teachable"
namespace teachable {
    const EVT = 0x7e1
    let _clase = ""
    let _certeza = 0
    let _listo = false

    function iniciar() {
        if (_listo) return
        _listo = true
        serial.setBaudRate(BaudRate.BaudRate115200)
        serial.onDataReceived(serial.delimiters(Delimiters.NewLine), function () {
            const linea = serial.readUntil(serial.delimiters(Delimiters.NewLine)).trim()
            const i = linea.indexOf("#")
            if (i < 0) return
            _clase = linea.substr(0, i)
            _certeza = parseInt(linea.substr(i + 1))
            control.raiseEvent(EVT, 1)
        })
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
        control.onEvent(EVT, 1, function () {
            if (_clase == _nombres[clase] && _certeza > umbral) handler()
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
        control.onEvent(EVT, 1, function () {
            if (_certeza > umbral) handler()
        })
    }

    /**
     * ¿La última detección es esta clase con certeza mayor al umbral?
     */
    //% blockId=teachable_seDetecta
    //% block="¿se detecta %clase con certeza > %umbral \\\\%?"
    //% umbral.defl=70 umbral.min=0 umbral.max=100
    //% weight=80
    export function seDetecta(clase: TMClase, umbral: number): boolean {
        iniciar()
        return _clase == _nombres[clase] && _certeza > umbral
    }

    /**
     * Nombre de la última clase detectada.
     */
    //% blockId=teachable_claseDetectada
    //% block="clase detectada"
    //% weight=70
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
function exampleMainTs(names) {
  const ids = identifiers(names), icons = ['IconNames.Happy', 'IconNames.Sad', 'IconNames.Heart', 'IconNames.Yes', 'IconNames.No', 'IconNames.Square', 'IconNames.Triangle', 'IconNames.Diamond'];
  return names.map((n, i) => `teachable.alDetectar(TMClase.${ids[i]}, 70, function () {\n    basic.showIcon(${icons[i % icons.length]})\n})`).join('\n') + '\n';
}
function exampleBlocks(names) {
  const ids = identifiers(names), icons = ['IconNames.Happy', 'IconNames.Sad', 'IconNames.Heart', 'IconNames.Yes', 'IconNames.No', 'IconNames.Square', 'IconNames.Triangle', 'IconNames.Diamond'];
  const blocks = names.map((n, i) => `<block type="teachable_alDetectar" x="20" y="${20 + i * 150}"><field name="clase">TMClase.${ids[i]}</field><value name="umbral"><shadow type="math_number_minmax"><mutation min="0" max="100" label="Umbral" precision="0"></mutation><field name="SLIDER">70</field></shadow></value><statement name="HANDLER"><block type="basic_show_icon"><field name="i">${icons[i % icons.length]}</field></block></statement></block>`).join('');
  return `<xml xmlns="https://developers.google.com/blockly/xml">${blocks}</xml>`;
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

/* ---------- arranque ---------- */
$('#btn-cam').addEventListener('click', startCamera);
$('#chk-mirror').addEventListener('change', ev => { if (state.webcam) state.webcam.flip = ev.target.checked; });
$('#btn-add-class').addEventListener('click', () => { if (state.classes.length >= 10) return toast('Máximo 10 clases', 'warn'); const n = safeName(prompt('Nombre de la nueva clase:', 'Clase ' + (state.classes.length + 1)) || ''); if (!n) return; trainer.addClass(n); state.classes.push(n); saveState(); markNeedsTraining(); renderClasses(); });
$('#btn-train').addEventListener('click', train);
$('#model-form').addEventListener('submit', ev => { ev.preventDefault(); loadTmUrl($('#model-url').value); });
$('#btn-connect').addEventListener('click', connect);
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
restore();

window.TM2MB = { state, trainer, startCamera, train, loadTmUrl, identifiers, freshProject, renderClasses };
