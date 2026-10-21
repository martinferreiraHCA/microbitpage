/* ==========================================================================
   Teachable Machine → micro:bit
   Carga un modelo de Teachable Machine (imagen, pose o audio), lo ejecuta en el
   navegador y manda cada detección al micro:bit por USB como "Clase#certeza".
   El editor MakeCode embebido trae la categoría "Teachable" con las clases.
   ========================================================================== */
(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const LIBS = {
    tf: 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@1.3.1/dist/tf.min.js',
    image: 'https://cdn.jsdelivr.net/npm/@teachablemachine/image@0.8.5/dist/teachablemachine-image.min.js',
    pose: 'https://cdn.jsdelivr.net/npm/@teachablemachine/pose@0.8.6/dist/teachablemachine-pose.min.js',
    audio: 'https://cdn.jsdelivr.net/npm/@tensorflow-models/speech-commands@0.4.4/dist/speech-commands.min.js',
  };
  const MAKECODE_URL = 'https://makecode.microbit.org/v9.0.12';
  const MAKECODE_ORIGIN = 'https://makecode.microbit.org';
  const SEND_EVERY_MS = 250;

  const state = { url: '', type: '', classes: [], model: null, recognizer: null, running: false, stream: null, timer: null, best: null, lastSent: 0, port: null, reader: null, keep: false, project: null, mcReady: false };

  /* ---------- utilidades ---------- */
  function toast(msg, level, ms) { const el = document.createElement('div'); el.className = 'toast ' + (level || ''); el.textContent = msg; $('#toasts').appendChild(el); setTimeout(() => el.remove(), ms || 4000); }
  function loadScript(src) { return new Promise((res, rej) => { if (document.querySelector(`script[src="${src}"]`)) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar ' + src)); document.head.appendChild(s); }); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function safeName(n) { return String(n).replace(/[#\r\n\u2028\u2029"\\]/g, ' ').trim().slice(0, 40) || 'Clase'; }
  function normalizeUrl(u) {
    u = String(u || '').trim(); if (!u) return '';
    const m = /teachablemachine\.withgoogle\.com\/models\/([A-Za-z0-9_-]+)/.exec(u);
    if (m) return 'https://teachablemachine.withgoogle.com/models/' + m[1] + '/';
    if (!u.endsWith('/')) u += '/';
    return u;
  }
  /** Identificadores válidos y únicos para el enum de MakeCode. */
  function identifiers(names) {
    const used = new Set();
    return names.map((n, i) => {
      let id = n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
      if (!id || !/^[A-Za-z_]/.test(id)) id = 'Clase_' + (id || (i + 1));
      let base = id, k = 2; while (used.has(id)) id = base + '_' + (k++);
      used.add(id); return id;
    });
  }

  /* ---------- paso 1: modelo ---------- */
  async function loadModel(url) {
    url = normalizeUrl(url); if (!url) return;
    const wasRunning = state.running;
    stopCamera();
    setStatus('Cargando modelo…');
    $('#btn-load').disabled = true;
    try {
      // Google sirve metadata.json y model.json con caché de 1 hora: si volvés a subir el
      // modelo con otras clases, sin esto el navegador seguiría mostrando las viejas.
      const bust = '?v=' + Date.now();
      const meta = await (await fetch(url + 'metadata.json' + bust, { cache: 'no-store' })).json();
      const type = meta.wordLabels ? 'audio' : (/pose/i.test(meta.packageName || '') ? 'pose' : 'image');
      await loadScript(LIBS.tf);
      await loadScript(LIBS[type]);
      let classes;
      if (state.model && state.model.dispose) { try { state.model.dispose(); } catch (e) {} }
      if (type === 'audio') {
        const rec = speechCommands.create('BROWSER_FFT', undefined, url + 'model.json' + bust, url + 'metadata.json' + bust);
        await rec.ensureModelLoaded();
        state.recognizer = rec; state.model = null; classes = rec.wordLabels();
      } else {
        const lib = type === 'pose' ? tmPose : tmImage;
        state.model = await lib.load(url + 'model.json' + bust, meta);
        state.recognizer = null; classes = state.model.getClassLabels();
      }
      state.url = url; state.type = type; state.classes = classes.map(safeName);
      localStorage.setItem('tm2mb:url', url);
      setStatus(`Modelo de ${type === 'image' ? 'imagen' : type === 'pose' ? 'pose' : 'audio'} listo ✔`, 'ok');
      $('#classes').innerHTML = state.classes.map(c => `<span>${esc(c)}</span>`).join('');
      renderPreds(state.classes.map(c => ({ className: c, probability: 0 })), null);   // clases a la vista desde el inicio
      $('#step-model').classList.add('done');
      $('#btn-cam').disabled = false; $('#btn-cam').textContent = type === 'audio' ? '▶ Iniciar micrófono' : '▶ Iniciar cámara';
      $('#cam-hint').textContent = type === 'audio' ? 'Usa el micrófono de la computadora' : 'Usa la cámara de la computadora';
      $('#editor-hint').innerHTML = `Categoría <b>Teachable</b>: ${state.classes.map(esc).join(', ')}. Cuando termines, <b>Descargar</b> al micro:bit.`;
      openMakeCode();
      const u = new URL(location.href); u.searchParams.set('model', url); history.replaceState(null, '', u);
      if (wasRunning) startCamera();   // la cámara sigue andando con el modelo nuevo
    } catch (e) {
      console.error(e); setStatus('No se pudo cargar el modelo: ' + e.message + '. Revisá el enlace (debe ser el de "Subir modelo").', 'error');
    }
    $('#btn-load').disabled = false;
  }
  function setStatus(msg, cls) { const el = $('#model-status'); el.textContent = msg; el.className = 'status ' + (cls || ''); }

  /* ---------- paso 2: cámara / micrófono ---------- */
  async function startCamera() {
    if (!state.type) return;
    stopCamera();
    try {
      state.running = true;
      $('#cam-off').hidden = true; $('#btn-cam-stop').hidden = false;
      if (state.type === 'audio') {
        $('#cam-audio').hidden = false;
        await state.recognizer.listen(result => {
          const labels = state.recognizer.wordLabels();
          const preds = Array.from(result.scores).map((p, i) => ({ className: safeName(labels[i]), probability: p }));
          onPreds(preds);
        }, { probabilityThreshold: 0, invokeCallbackOnNoiseAndUnknown: true, overlapFactor: 0.5 });
        return;
      }
      const video = $('#video');
      state.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, facingMode: 'user' }, audio: false });
      video.srcObject = state.stream; video.hidden = false; await video.play();
      const canvas = $('#pose-canvas'); canvas.hidden = state.type !== 'pose';
      const loop = async () => {
        if (!state.running) return;
        try {
          let preds;
          // Teachable Machine entrena con la cámara espejada: hay que predecir igual,
          // si no las clases que dependen de izquierda/derecha se confunden.
          const flip = $('#chk-mirror').checked;
          if (state.type === 'pose') {
            const { pose, posenetOutput } = await state.model.estimatePose(video, flip);
            preds = await state.model.predict(posenetOutput);
            if (canvas.width !== video.videoWidth) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
            const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (pose) { tmPose.drawKeypoints(pose.keypoints, 0.5, ctx); tmPose.drawSkeleton(pose.keypoints, 0.5, ctx); }
          } else preds = await state.model.predict(video, flip);
          onPreds(preds.map(p => ({ className: safeName(p.className), probability: p.probability })));
        } catch (e) { console.warn(e); }
        state.timer = setTimeout(loop, 60);
      };
      loop();
    } catch (e) { console.error(e); toast('Cámara: ' + e.message, 'error'); stopCamera(); }
  }
  function stopCamera() {
    state.running = false; clearTimeout(state.timer);
    if (state.recognizer) { try { if (state.recognizer.isListening()) state.recognizer.stopListening(); } catch (e) {} }
    if (state.stream) { state.stream.getTracks().forEach(t => t.stop()); state.stream = null; }
    const v = $('#video'); v.srcObject = null; v.hidden = true; $('#pose-canvas').hidden = true; $('#cam-audio').hidden = true;
    $('#cam-off').hidden = false; $('#btn-cam-stop').hidden = true; state.best = null;
    if (state.classes.length) renderPreds(state.classes.map(c => ({ className: c, probability: 0 })), null);
  }
  function renderPreds(preds, best) {
    $('#preds').innerHTML = preds.map(p => `<div class="pred ${p === best ? 'top' : ''}"><span>${esc(p.className)}</span><div class="bar"><i style="width:${(p.probability * 100).toFixed(0)}%"></i></div><b>${(p.probability * 100).toFixed(0)}%</b></div>`).join('');
  }
  function onPreds(preds) {
    if (!preds || !preds.length) return;
    let best = preds[0]; for (const p of preds) if (p.probability > best.probability) best = p;
    state.best = best;
    renderPreds(preds, best);
    $('#step-camera').classList.add('done');
    const now = Date.now();
    if (now - state.lastSent >= SEND_EVERY_MS) { state.lastSent = now; send(best); }
  }

  /* ---------- paso 3: micro:bit por USB (Web Serial) ---------- */
  async function connect() {
    if (state.port) return disconnect();
    if (!navigator.serial) { toast('Este navegador no tiene Web Serial. Usá Chrome o Edge en computadora.', 'error', 6000); return; }
    try {
      const port = await navigator.serial.requestPort({ filters: [{ usbVendorId: 0x0d28 }] });
      await port.open({ baudRate: 115200 });
      state.port = port; state.keep = true;
      $('#dot').classList.add('on'); $('#mb-status').textContent = 'conectado'; $('#btn-connect').textContent = '🔌 Desconectar'; $('#btn-connect').classList.add('connected');
      $('#step-microbit').classList.add('done');
      toast('micro:bit conectado ✔', 'ok');
      readLoop(port);
    } catch (e) { if (e.name !== 'NotFoundError') toast('No se pudo conectar: ' + e.message, 'error', 6000); }
  }
  async function readLoop(port) {
    const decoder = new TextDecoderStream(); const closed = port.readable.pipeTo(decoder.writable).catch(() => {});
    const reader = decoder.readable.getReader(); state.reader = reader; let buf = '';
    try { while (state.keep) { const { value, done } = await reader.read(); if (done) break; buf += value; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) $('#sent').textContent = '◀ ' + line; } } }
    catch (e) {} finally { try { reader.releaseLock(); } catch (e) {} await closed; if (state.port) onDisconnected(); }
  }
  async function disconnect() {
    state.keep = false; try { if (state.reader) await state.reader.cancel(); } catch (e) {} try { if (state.port) await state.port.close(); } catch (e) {}
    onDisconnected();
  }
  function onDisconnected() {
    state.port = null; state.reader = null;
    $('#dot').classList.remove('on'); $('#mb-status').textContent = 'desconectado'; $('#btn-connect').textContent = '🔌 Conectar por USB'; $('#btn-connect').classList.remove('connected');
  }
  async function send(best) {
    const conf = Math.round(best.probability * 100);
    if (conf < (+$('#min-conf').value || 0)) return;
    const line = best.className + '#' + conf;
    $('#sent').textContent = '▶ ' + line + (state.port ? '' : '   (conectá el micro:bit para enviarlo)');
    if (!state.port || !state.port.writable) return;
    try { const w = state.port.writable.getWriter(); await w.write(new TextEncoder().encode(line + '\n')); w.releaseLock(); }
    catch (e) { console.warn(e); }
  }

  /* ---------- editor MakeCode embebido con la categoría "Teachable" ---------- */
  function classesTs() {
    const ids = identifiers(state.classes);
    const members = state.classes.map((n, i) => `    //% block=${JSON.stringify(n)}\n    ${ids[i]} = ${i}`).join(',\n');
    return `// Generado automáticamente a partir del modelo de Teachable Machine. No editar.\nenum TMClase {\n${members}\n}\nnamespace teachable {\n    export const _nombres = [${state.classes.map(n => JSON.stringify(n)).join(', ')}]\n}\n`;
  }
  function teachableTs() {
    return `// Bloques "Teachable": reciben por el cable USB las detecciones que manda la página
// Teachable Machine → micro:bit con el formato "Clase#certeza" (una por línea).
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
  function exampleMainTs() {
    const ids = identifiers(state.classes);
    const icons = ['IconNames.Happy', 'IconNames.Sad', 'IconNames.Heart', 'IconNames.Yes', 'IconNames.No', 'IconNames.Square', 'IconNames.Triangle', 'IconNames.Diamond'];
    return state.classes.map((n, i) => `teachable.alDetectar(TMClase.${ids[i]}, 70, function () {\n    basic.showIcon(${icons[i % icons.length]})\n})`).join('\n') + '\n';
  }
  /** XML de Blockly del programa de ejemplo (un "al detectar" por clase). */
  function exampleBlocks() {
    const ids = identifiers(state.classes);
    const icons = ['IconNames.Happy', 'IconNames.Sad', 'IconNames.Heart', 'IconNames.Yes', 'IconNames.No', 'IconNames.Square', 'IconNames.Triangle', 'IconNames.Diamond'];
    const blocks = state.classes.map((n, i) => `<block type="teachable_alDetectar" x="20" y="${20 + i * 150}"><field name="clase">TMClase.${ids[i]}</field><value name="umbral"><shadow type="math_number_minmax"><mutation min="0" max="100" label="Umbral" precision="0"></mutation><field name="SLIDER">70</field></shadow></value><statement name="HANDLER"><block type="basic_show_icon"><field name="i">${icons[i % icons.length]}</field></block></statement></block>`).join('');
    return `<xml xmlns="https://developers.google.com/blockly/xml">${blocks}</xml>`;
  }
  function freshProject() {
    return { text: {
      'pxt.json': JSON.stringify({ name: 'teachable-microbit', description: 'Teachable Machine → micro:bit', dependencies: { core: '*' }, files: ['main.blocks', 'main.ts', 'teachable.ts', 'tm-classes.ts', 'README.md'], preferredEditor: 'blocksprj' }, null, 4),
      'main.blocks': exampleBlocks(),
      'main.ts': exampleMainTs(),
      'teachable.ts': teachableTs(),
      'tm-classes.ts': classesTs(),
      'README.md': ' ',
    } };
  }
  function projectKey() { return 'tm2mb:project:' + state.url; }
  function openMakeCode(reset) {
    const iframe = $('#makecode');
    $('#editor-placeholder').hidden = true;
    let saved = null;
    if (!reset) { try { saved = JSON.parse(localStorage.getItem(projectKey()) || 'null'); } catch (e) {} }
    // Si el modelo se volvió a subir con otras clases, el programa guardado apunta a clases que
    // ya no existen: se genera uno nuevo con las clases actuales.
    const savedClasses = localStorage.getItem(projectKey() + ':classes') || '';
    const classesNow = JSON.stringify(state.classes);
    if (saved && savedClasses && savedClasses !== classesNow) { saved = null; toast('Las clases del modelo cambiaron: se generó un programa nuevo con las clases actuales.', 'warn', 7000); }
    localStorage.setItem(projectKey() + ':classes', classesNow);
    if (saved && saved.text && typeof saved.text === 'object' && Object.keys(saved.text).length) {
      state.project = { ...saved, text: { ...saved.text, 'teachable.ts': teachableTs(), 'tm-classes.ts': classesTs() } };
    } else state.project = freshProject();
    state.mcReady = false;
    if (iframe.getAttribute('src')) { iframe.src = 'about:blank'; }
    setTimeout(() => { iframe.src = MAKECODE_URL + '?controller=1&lang=es'; }, 50);
  }
  window.addEventListener('message', ev => {
    const iframe = $('#makecode');
    if (ev.source !== iframe.contentWindow || ev.origin !== MAKECODE_ORIGIN) return;
    const d = ev.data; if (!d || !d.type) return;
    if (d.action === 'workspacesync') {
      state.mcReady = true;
      iframe.contentWindow.postMessage({ ...d, type: 'pxthost', success: true, projects: [state.project], controllerId: 'teachable-microbit', editor: {} }, MAKECODE_ORIGIN);
    } else if (d.action === 'workspacesave' && d.project && d.project.text) {
      try { localStorage.setItem(projectKey(), JSON.stringify(d.project)); } catch (e) {}
    }
  });

  /* ---------- arranque ---------- */
  $('#model-form').addEventListener('submit', ev => { ev.preventDefault(); loadModel($('#model-url').value); });
  $('#btn-cam').addEventListener('click', startCamera);
  $('#btn-cam-stop').addEventListener('click', stopCamera);
  $('#btn-connect').addEventListener('click', connect);
  $('#chk-mirror').addEventListener('change', ev => $('.cam').classList.toggle('mirror', ev.target.checked));
  $('.cam').classList.add('mirror');
  $('#btn-help').addEventListener('click', () => $('#help').scrollIntoView({ behavior: 'smooth' }));
  $('#btn-reset-code').addEventListener('click', () => { if (!state.url) return; if (confirm('Se reemplaza el programa actual por el de ejemplo. ¿Continuar?')) { localStorage.removeItem(projectKey()); openMakeCode(true); } });
  $('#btn-reload').addEventListener('click', () => { if (state.url) loadModel(state.url); });
  if (!navigator.serial) $('#mb-status').textContent = 'este navegador no tiene Web Serial (usá Chrome o Edge)';
  const params = new URLSearchParams(location.search);
  const initial = params.get('model') || localStorage.getItem('tm2mb:url') || '';
  if (initial) { $('#model-url').value = initial; loadModel(initial); }

  window.TM2MB = { state, loadModel, startCamera, stopCamera, send, freshProject, identifiers, normalizeUrl };
})();
