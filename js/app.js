/* ==========================================================================
   app.js — Arranque de la aplicación, barra superior, modos (editor / panel),
   diálogos (fondo, tamaño, datos, código micro:bit, embeber) y estado.
   ========================================================================== */
(function (global) {
  'use strict';

  const $ = s => document.querySelector(s);
  const params = new URLSearchParams(location.search);

  const App = {
    mode: 'editor', autorun: true, locked: params.get('lock') === '1', embedded: window.parent !== window,

    async init() {
      // Módulos
      Dashboard.init($('#dash-viewport'), $('#props'));
      Guide.init($('#guide'));
      Bridge.init();
      try { Blocks.init('blockly'); } catch (e) { console.error(e); Util.toast('No se pudo cargar el editor de bloques (¿sin internet?). El panel funciona igual.', 'error', 8000); }
      this.buildAddMenu(); this.buildExamplesMenu(); this.bindTopbar(); this.bindStatus();

      // Cambios → autoguardado + refresco de bloques
      const onChange = () => { Project.scheduleAutosave(); };
      Bus.on('dash:changed', onChange); Bus.on('blocks:changed', () => { onChange(); if (Runtime.running) this._restart(); });
      this._restart = Util.debounce(() => Runtime.restart(), 600);
      Bus.on('dash:props', () => { if (Runtime.running) this._restart(); });
      Bus.on('dash:openprops', () => this.openProps());
      Bus.on('project:loaded', () => { $('#project-name').value = Project.name; });
      Bus.on('var', () => this.updateVarList());

      // Carga inicial: ?project=URL, #p=..., autoguardado, o ejemplo
      let loaded = false;
      if (params.get('project')) loaded = await Project.loadFromUrl(params.get('project'));
      if (!loaded && location.hash.includes('p=')) loaded = await Project.loadFromHash();
      if (!loaded) { const a = Project.restoreAutosave(); if (a) { Project.load(a); loaded = true; } }
      if (!loaded) { Project.load(Examples[0].project); localStorage.setItem('mbpanel:guide-step', '0'); setTimeout(() => Guide.open(), 400); }

      // Modo
      const mode = params.get('mode');
      this.setMode(mode === 'panel' ? 'panel' : 'editor');
      if (mode === 'ml' || params.get('ml') === '1') this.mlOpen('max');
      if (params.get('sim') === '1') Simulator.start();
      if (params.get('edit') === '0') Dashboard.setEditMode(false);
      window.addEventListener('hashchange', () => { if (location.hash.includes('p=')) Project.loadFromHash(); });
      window.addEventListener('beforeunload', () => Project.autosaveNow());
      this.updateVarList();
    },

    /* ---------- menús ---------- */
    buildAddMenu() {
      const m = $('#add-menu'); m.innerHTML = '<div class="add-help">Los <b>elementos</b> son las piezas del panel: cada uno muestra una variable que llega del micro:bit (medidor, gráfico, luz…) o le manda órdenes (botón, deslizador). Elegí uno y después configuralo en Propiedades.</div>';
      for (const t in WidgetTypes) { const b = document.createElement('button'); b.innerHTML = `<i>${WidgetTypes[t].icon}</i><span>${Util.esc(WidgetTypes[t].name)}</span>`; b.onclick = () => { Dashboard.add(t); this.openProps(); }; m.appendChild(b); }
    },
    buildExamplesMenu() {
      const m = $('#examples-menu'); m.innerHTML = '';
      Examples.forEach((ex, i) => { const b = document.createElement('button'); b.innerHTML = `${Util.esc(ex.name)}`; b.onclick = () => this.loadExample(i); m.appendChild(b); });
    },
    loadExample(i) {
      const ex = Examples[i]; if (!ex) return;
      if (Project.dirty && !confirm('Se reemplazará el proyecto actual (ya está autoguardado en el navegador). ¿Continuar?')) return;
      Vars.clear(); Alerts.clear(); Project.load(JSON.parse(JSON.stringify(ex.project)));
    },

    /* ---------- barra superior ---------- */
    bindTopbar() {
      $('#project-name').addEventListener('change', ev => { Project.name = ev.target.value.trim() || 'Mi panel micro:bit'; Project.scheduleAutosave(); });
      document.querySelectorAll('[data-connect]').forEach(b => b.onclick = () => Serial.connected ? Serial.disconnect() : Serial.connect());
      document.querySelectorAll('[data-sim]').forEach(b => b.onclick = () => Simulator.toggle());
      document.querySelectorAll('[data-run]').forEach(b => b.onclick = () => Runtime.running ? Runtime.stop() : Runtime.start());
      document.querySelectorAll('[data-fullscreen]').forEach(b => b.onclick = () => this.fullscreen());
      document.querySelectorAll('[data-exit-panel]').forEach(b => b.onclick = () => this.setMode('editor'));
      $('#btn-panel-mode').onclick = () => this.setMode('panel');
      $('#btn-ml').onclick = () => { const w = $('#ml-win'); if (w.hidden) this.mlOpen('max'); else this.mlOpen(w.classList.contains('max') ? 'normal' : 'max'); };
      $('#btn-ml-help').onclick = () => this.openMlHelp();
      $('#btn-ml-help2').onclick = () => this.openMlHelp();
      document.querySelectorAll('[data-ml-size]').forEach(b => b.onclick = () => this.mlOpen(b.dataset.mlSize));
      $('[data-ml-close]').onclick = () => this.mlClose();
      this._bindMlDrag();
      $('#btn-guide').onclick = () => Guide.toggle();
      $('#btn-props').onclick = () => this.openProps(true);
      $('#btn-lock').onclick = () => Dashboard.setEditMode(!Dashboard.editMode);
      $('#btn-bg').onclick = () => this.openBackground();
      $('#btn-arrow').onclick = () => { Dashboard.setEditMode(true); Dashboard.add('flecha'); this.openProps(); };
            $('#btn-data').onclick = () => this.openData();
      $('#btn-microbit-code').onclick = () => this.openMicrobitCode();
      $('#btn-embed').onclick = () => this.openEmbed();
      $('#m-new').onclick = () => { if (confirm('¿Crear un proyecto nuevo? El actual queda autoguardado hasta que lo reemplaces.')) { Project.reset(); $('#project-name').value = Project.name; } };
      $('#m-download').onclick = () => Project.download();
      $('#m-upload').onclick = () => Project.upload();
      $('#m-share').onclick = async () => { const url = await Project.shareLink(); if (url) { await navigator.clipboard.writeText(url).catch(() => {}); this.dialog('Enlace del proyecto', `<p>Este enlace contiene el proyecto completo. Se copió al portapapeles.</p><textarea readonly rows="4" style="width:100%">${Util.esc(url)}</textarea>`); } };
      $('#m-clear-vars').onclick = () => { Vars.clear(); Alerts.clear(); Util.toast('Datos borrados', 'info'); };
      // menús desplegables
      document.querySelectorAll('.menu > button').forEach(b => b.addEventListener('click', ev => { ev.stopPropagation(); const m = b.parentElement; const open = m.classList.contains('open'); document.querySelectorAll('.menu.open').forEach(x => x.classList.remove('open')); if (!open) m.classList.add('open'); }));
      document.addEventListener('click', () => document.querySelectorAll('.menu.open').forEach(x => x.classList.remove('open')));
      // pestañas móvil
      document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { document.body.dataset.tab = b.dataset.tab; document.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('active', x === b)); Blocks.resize(); Dashboard.layout(); });
      // divisor
      const sp = $('#splitter'), main = $('#main');
      sp.addEventListener('pointerdown', ev => {
        ev.preventDefault(); const move = e => { const r = main.getBoundingClientRect(); const pct = Util.clamp((e.clientX - r.left) / r.width * 100, 20, 75); main.style.setProperty('--split', pct + '%'); Blocks.resize(); Dashboard.layout(); };
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
      });
    },

    bindStatus() {
      const dot = document.querySelectorAll('[data-status-dot]');
      Bus.on('serial:status', on => { dot.forEach(d => d.classList.toggle('on', on)); document.querySelectorAll('[data-connect]').forEach(b => { b.classList.toggle('connected', on); b.lastChild.textContent = on ? ' micro:bit conectado' : ' Conectar micro:bit'; }); });
      Bus.on('sim:status', on => { document.querySelectorAll('[data-sim]').forEach(b => b.classList.toggle('active', on)); $('#st-sim').hidden = !on; });
      Bus.on('runtime:status', on => document.querySelectorAll('[data-run]').forEach(b => { b.classList.toggle('running', on); b.innerHTML = on ? '■ Detener' : '▶ Ejecutar'; }));
      Bus.on('serial:line', (line, src) => { $('#st-line').textContent = line; $('#st-src').textContent = src === 'sim' ? 'simulador' : src === 'host' ? 'página host' : 'micro:bit'; });
      Bus.on('dash:editmode', on => { $('#btn-lock').textContent = on ? '🔓 Edición' : '🔒 Bloqueado'; $('#btn-lock').classList.toggle('active', !on); });
      Bus.on('dash:select', w => { if (w) this.openProps(); });
      if (!Serial.supported) $('#st-warn').textContent = 'Este navegador no tiene Web Serial: usá Chrome o Edge en computadora.';
      setInterval(() => { $('#st-vars').textContent = Vars.names().length + ' variables'; }, 1000);
    },

    updateVarList: Util.throttle(function () {
      const dl = document.getElementById('var-names'); if (!dl) return;
      const names = new Set([...Vars.names(), ...Simulator.vars.map(v => v.name)]);
      dl.innerHTML = [...names].map(n => `<option value="${Util.esc(n)}">`).join('');
    }, 1500),

    /* ---------- modos ---------- */
    /* ---------- ventana ML - micro:bit ---------- */
    mlOpen(size) {
      const w = $('#ml-win'), f = $('#ml-frame');
      if (!f.getAttribute('src')) f.src = 'ml/index.html';   // se carga una sola vez y queda viva
      w.hidden = false; w.classList.remove('max', 'normal', 'mini'); w.classList.add(size);
      w.querySelectorAll('[data-ml-size]').forEach(b => b.classList.toggle('on', b.dataset.mlSize === size));
      if (size !== 'max') {
        // posición por defecto: abajo a la derecha, sin tapar todo el panel
        if (!w.dataset.placed) { const W = size === 'mini' ? 320 : Math.min(640, window.innerWidth * 0.45), H = size === 'mini' ? 260 : Math.min(520, window.innerHeight * 0.6); w.style.left = (window.innerWidth - W - 16) + 'px'; w.style.top = (window.innerHeight - H - 44) + 'px'; if (size !== 'mini') { w.style.width = W + 'px'; w.style.height = H + 'px'; } }
        else if (size === 'normal' && w.dataset.w) { w.style.width = w.dataset.w; w.style.height = w.dataset.h; }
        this._mlKeepInside();
      }
      $('#btn-ml').classList.add('active');
      if (size === 'max') this.mode !== 'panel' && Guide.close();
    },
    mlClose() {
      if (!confirm('Se cierra ML - micro:bit y se detiene la detección (el micro:bit deja de recibir clases). ¿Cerrar?')) return;
      const w = $('#ml-win'), f = $('#ml-frame'); w.hidden = true; f.removeAttribute('src'); f.src = 'about:blank'; f.removeAttribute('src');
      $('#btn-ml').classList.remove('active');
    },
    _mlKeepInside() {
      const w = $('#ml-win'); if (w.hidden || w.classList.contains('max')) return;
      const r = w.getBoundingClientRect();
      w.style.left = Util.clamp(r.left, 0, Math.max(0, window.innerWidth - r.width)) + 'px';
      w.style.top = Util.clamp(r.top, 0, Math.max(0, window.innerHeight - 40)) + 'px';
    },
    _bindMlDrag() {
      const w = $('#ml-win'), head = w.querySelector('.ml-head');
      head.addEventListener('pointerdown', ev => {
        if (ev.target.closest('button, a') || w.classList.contains('max') || ev.button !== 0) return;
        ev.preventDefault(); w.classList.add('dragging'); w.dataset.placed = '1';
        const r = w.getBoundingClientRect(), sx = ev.clientX - r.left, sy = ev.clientY - r.top;
        const move = e => { w.style.left = (e.clientX - sx) + 'px'; w.style.top = (e.clientY - sy) + 'px'; };
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); w.classList.remove('dragging'); this._mlKeepInside(); };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
      });
      head.addEventListener('dblclick', ev => { if (!ev.target.closest('button, a')) this.mlOpen(w.classList.contains('max') ? 'normal' : 'max'); });
      new ResizeObserver(() => { if (!w.hidden && w.classList.contains('normal')) { w.dataset.w = w.style.width; w.dataset.h = w.style.height; w.dataset.placed = '1'; } }).observe(w);
      window.addEventListener('resize', () => this._mlKeepInside());
    },

    setMode(mode) {
      if (mode === 'ml') { this.mlOpen('max'); mode = this.mode || 'editor'; }
      this.mode = mode; document.body.classList.toggle('panel-mode', mode === 'panel');
      document.body.classList.toggle('embedded', this.embedded); document.body.classList.toggle('locked', this.locked);
      if (mode === 'panel') { Dashboard.setEditMode(false); $('#props').classList.remove('open'); Guide.close(); if (this.autorun && !Runtime.running && !Blocks.isEmpty()) Runtime.start(); }
      else Dashboard.setEditMode(true);
      setTimeout(() => { Dashboard.layout(); Blocks.resize(); }, 30);
      const u = new URL(location.href); if (mode === 'panel') u.searchParams.set('mode', 'panel'); else u.searchParams.delete('mode'); history.replaceState(null, '', u);
    },
    fullscreen() {
      const el = $('#dash-pane');
      if (document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen().catch(e => Util.toast('Pantalla completa no disponible: ' + e.message, 'warn'));
    },
    openProps(force) { const p = $('#props'); if (force) p.classList.toggle('open'); else p.classList.add('open'); $('#guide').classList.remove('open'); Dashboard.renderProps(); setTimeout(() => { Dashboard.layout(); Blocks.resize(); }, 250); },

    /* ---------- diálogos ---------- */
    dialog(title, html, onMount) {
      const d = $('#dlg'); d.innerHTML = `<div class="dlg-head"><h2>${title}</h2><button class="mini" data-close>✕</button></div><div class="dlg-body">${html}</div>`;
      d.querySelector('[data-close]').onclick = () => d.close(); d.showModal(); if (onMount) onMount(d);
      return d;
    },
    openBackground() {
      const b = Dashboard.background;
      this.dialog('🖼️ Fondo del panel', `
        <div class="field"><label>Color de fondo</label><input type="color" data-color value="${b.color || '#eef2f7'}"></div>
        <div class="field"><label>Imagen de fondo (URL o archivo)</label><div class="img-field"><input type="text" data-url placeholder="https://…" value="${b.image && !b.image.startsWith('data:') ? Util.esc(b.image) : (b.image ? '(archivo cargado)' : '')}"><input type="file" accept="image/*" data-file><button class="mini" data-clear>Quitar</button></div>
        <small class="muted">Por ejemplo, un plano de la casa, una foto de la maqueta o un mapa. Los elementos se colocan encima; elegí "Sin fondo" en sus propiedades.</small></div>
        <div class="field"><label>Ajuste de la imagen</label><select data-fit>${[['cover', 'Recortar para llenar'], ['contain', 'Completa'], ['stretch', 'Estirar'], ['tile', 'Mosaico']].map(([v, l]) => `<option value="${v}" ${b.fit === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>Tamaño del panel (píxeles de diseño)</label><div class="row"><input type="number" data-w value="${Dashboard.width}" style="width:90px"> × <input type="number" data-h value="${Dashboard.height}" style="width:90px"><button class="mini" data-preset="1280,720">16:9</button><button class="mini" data-preset="1024,768">4:3</button><button class="mini" data-preset="1920,1080">Full HD</button><button class="mini" data-preset="720,1280">Vertical</button></div><small class="muted">El panel se escala solo para entrar en cualquier pantalla manteniendo la posición de los elementos sobre la imagen.</small></div>`,
        d => {
          d.querySelector('[data-color]').oninput = ev => Dashboard.setBackground({ color: ev.target.value });
          d.querySelector('[data-url]').onchange = ev => Dashboard.setBackground({ image: ev.target.value.trim() });
          d.querySelector('[data-file]').onchange = ev => { const f = ev.target.files[0]; if (f) Project.readImageFile(f, 1600).then(src => { Dashboard.setBackground({ image: src }); d.querySelector('[data-url]').value = '(archivo cargado)'; }); };
          d.querySelector('[data-clear]').onclick = () => { Dashboard.setBackground({ image: '' }); d.querySelector('[data-url]').value = ''; };
          d.querySelector('[data-fit]').onchange = ev => Dashboard.setBackground({ fit: ev.target.value });
          const setSize = () => Dashboard.setSize(+d.querySelector('[data-w]').value, +d.querySelector('[data-h]').value);
          d.querySelector('[data-w]').onchange = setSize; d.querySelector('[data-h]').onchange = setSize;
          d.querySelectorAll('[data-preset]').forEach(p => p.onclick = () => { const [w, h] = p.dataset.preset.split(','); d.querySelector('[data-w]').value = w; d.querySelector('[data-h]').value = h; setSize(); });
        });
    },
    openSize() { this.openBackground(); },
    openData() {
      this.dialog('⚙️ Datos del micro:bit y simulador', `
        <h3>Formato de las líneas</h3>
        <p class="muted">El panel entiende automáticamente: <code>temp:23,luz:140</code> · <code>temp=23;luz=140</code> · <code>{"temp":23}</code> · <code>23,140</code> (CSV, usa los nombres de columna de abajo) · texto suelto → variable <code>mensaje</code>.</p>
        <div class="field"><label>Nombres de columnas para CSV (separados por coma)</label><input data-cols value="${Util.esc(Serial.config.columns.join(','))}" placeholder="temp,luz,sonido"></div>
        <div class="field"><label>Velocidad (baudios)</label><select data-baud>${[115200, 9600, 57600, 38400, 19200].map(b => `<option ${Serial.config.baud === b ? 'selected' : ''}>${b}</option>`).join('')}</select><small class="muted">MakeCode usa 115200 por defecto.</small></div>
        <h3>Simulador</h3>
        <p class="muted">Genera valores que oscilan entre mínimo y máximo, para practicar sin micro:bit.</p>
        <table class="mc-rows"><thead><tr><th>Variable</th><th>Mín</th><th>Máx</th><th>o valores de texto (a,b,c)</th><th></th></tr></thead><tbody data-sim></tbody></table>
        <div class="row"><button class="mini" data-add>+ Agregar</button><label>Intervalo <input type="number" data-int value="${Simulator.interval}" min="100" step="100" style="width:80px"> ms</label><label><input type="checkbox" data-sound ${Alerts.sound ? 'checked' : ''}> sonido en alertas</label><label><input type="checkbox" data-autorun ${this.autorun ? 'checked' : ''}> ejecutar bloques al abrir el proyecto</label></div>`,
        d => {
          d.querySelector('[data-cols]').onchange = ev => { Serial.config.columns = ev.target.value.split(',').map(s => s.trim()).filter(Boolean); Project.scheduleAutosave(); };
          d.querySelector('[data-baud]').onchange = ev => { Serial.config.baud = +ev.target.value; Project.scheduleAutosave(); };
          d.querySelector('[data-int]').onchange = ev => { Simulator.interval = Math.max(100, +ev.target.value); if (Simulator.running) { Simulator.stop(); Simulator.start(); } Project.scheduleAutosave(); };
          d.querySelector('[data-sound]').onchange = ev => { Alerts.sound = ev.target.checked; Project.scheduleAutosave(); };
          d.querySelector('[data-autorun]').onchange = ev => { this.autorun = ev.target.checked; Project.scheduleAutosave(); };
          const tb = d.querySelector('[data-sim]');
          const draw = () => {
            tb.innerHTML = Simulator.vars.map((v, i) => `<tr><td><input data-i="${i}" data-k="name" value="${Util.esc(v.name)}"></td><td><input type="number" data-i="${i}" data-k="min" value="${v.min}" style="width:70px"></td><td><input type="number" data-i="${i}" data-k="max" value="${v.max}" style="width:70px"></td><td><input data-i="${i}" data-k="values" value="${Util.esc((v.values || []).join(','))}" placeholder="Gato,Perro"></td><td><button class="mini danger" data-del="${i}">✕</button></td></tr>`).join('');
            tb.querySelectorAll('[data-k]').forEach(inp => inp.onchange = () => { const v = Simulator.vars[+inp.dataset.i]; const k = inp.dataset.k; if (k === 'values') { v.values = inp.value.split(',').map(x => x.trim()).filter(Boolean); v._cur = null; } else v[k] = k === 'name' ? inp.value.trim() : +inp.value; Project.scheduleAutosave(); this.updateVarList(); });
            tb.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { Simulator.vars.splice(+b.dataset.del, 1); draw(); Project.scheduleAutosave(); });
          };
          draw(); d.querySelector('[data-add]').onclick = () => { Simulator.vars.push({ name: 'sensor' + (Simulator.vars.length + 1), min: 0, max: 100 }); draw(); };
        });
    },
    openMlHelp() {
      const code = MicrobitCode.mlBridgeCode();
      this.dialog('Cómo conectar ML - micro:bit con el panel', `
        <div class="flow"><span>ML - micro:bit</span><i>Bluetooth</i><span>micro:bit</span><i>cable USB (serial)</i><span>Panel Lab</span></div>
        <p>La app <b>ML - micro:bit</b> entrena un modelo en la computadora y le manda al micro:bit, por Bluetooth, la clase detectada y su certeza (<code>Gato#87</code>). El panel <b>solo lee el cable serial</b>: por eso el micro:bit tiene que reenviar lo que recibe. Con este programa, el panel recibe las variables <code>clase</code> y <code>certeza</code> y podés usarlas en elementos, reglas de alerta y bloques.</p>
        <ol class="steps">
          <li><b>Entrená el modelo.</b> Abrí <b>IA · ML micro:bit</b>, creá un proyecto (imagen, audio o pose), agregá 2 o más clases, capturá muestras y presioná <b>Entrenar</b>.</li>
          <li><b>Programá el micro:bit.</b> En la pantalla de predicción de ML - micro:bit está el editor MakeCode con la extensión <b>iaMachine</b> ya cargada. Abrí la pestaña <b>JavaScript</b>, pegá el código de abajo y descargalo al micro:bit por USB (un micro:bit V2 es lo recomendado: Bluetooth y serial a la vez).</li>
          <li><b>Conectá por Bluetooth.</b> En ML - micro:bit presioná <b>Conectar micro:bit</b> y elegí tu placa. Cuando el modelo detecta algo, el micro:bit lo recibe.</li>
          <li><b>Conectá el panel por USB.</b> Presioná <b>Conectar micro:bit</b> en la barra superior (puerto serial). El Bluetooth y el cable son canales distintos, así que las dos conexiones conviven.</li>
          <li><b>Dejá la cámara a la vista.</b> Con los botones ▢ o ▁ de la ventana de ML - micro:bit la convertís en una ventana flotante o una miniatura sobre el panel: podés moverla y cambiarle el tamaño, y la detección sigue activa. No la cierres con ✕ mientras trabajás (eso detiene la IA).</li>
          <li><b>Usá los datos.</b> Agregá un <b>Texto</b> con <code>Veo: {clase} ({certeza} %)</code>, luces con la regla <i>si el valor = Gato → Peligro</i>, o bloques como <b>cuando clase cambia</b>. Mirá el ejemplo <b>Proyecto → Ejemplos → ML - micro:bit por serial</b>.</li>
        </ol>
        <div class="field"><label>Programa para el micro:bit (MakeCode → JavaScript). Si usás MakeCode fuera de la app, agregá la extensión desde <i>Extensiones</i> pegando <code>https://github.com/snan-microbit/pxt-tm-microbit-link-v2</code>.</label><pre class="code">${Util.esc(code)}</pre><button class="mini" data-copy>Copiar código</button></div>
        <p class="muted">Si además el micro:bit lee sensores, sumalos en el mismo programa: <b>Herramientas → Código para el micro:bit</b> arma todo junto (marcá la opción "reenviar clases de ML - micro:bit").</p>`,
        d => { d.querySelector('[data-copy]').onclick = () => navigator.clipboard.writeText(code).then(() => Util.toast('Código copiado', 'ok')); });
    },
    openMicrobitCode() { this.dialog('🧠 Código para el micro:bit', '<div data-mc></div>', d => MicrobitCode.render(d.querySelector('[data-mc]'))); },
    openEmbed() {
      const base = location.origin + location.pathname;
      const iframe = `<iframe src="${base}?mode=panel&lock=1&edit=0" width="100%" height="600" style="border:0;border-radius:12px" allow="serial; camera; fullscreen"></iframe>`;
      const api = `// Desde la página que contiene el iframe (por ejemplo, un generador de código
// de micro:bit como ml-microbit o MakeCode, que ya tiene su propia conexión):
const panel = document.querySelector('iframe').contentWindow;
// 1) enviarle una línea tal como la manda el micro:bit
panel.postMessage({ type: 'mbp:data', line: 'temp:23,luz:140' }, '*');
// 2) o valores sueltos
panel.postMessage({ type: 'mbp:setVar', name: 'clase', value: 'saltando' }, '*');
// 3) cargar un proyecto (el JSON descargado desde el panel)
panel.postMessage({ type: 'mbp:load', project: proyectoJSON }, '*');
// 4) recibir lo que los bloques quieren enviar al micro:bit
window.addEventListener('message', ev => {
  if (ev.data && ev.data.type === 'mbp:send') miMicrobit.enviar(ev.data.text);
  if (ev.data && ev.data.type === 'mbp:alert') console.log('alerta', ev.data.alert);
});`;
      this.dialog('🔗 Embeber el panel en otra página', `
        <p>Guardá el proyecto en un archivo o enlace y cargalo con <code>?project=URL_DEL_JSON</code> o <code>#p=…</code> (enlace compartible). Parámetros útiles: <code>mode=panel</code> (solo panel), <code>lock=1</code> (sin botón de edición), <code>edit=0</code>, <code>sim=1</code> (simulador al abrir).</p>
        <div class="field"><label>Código &lt;iframe&gt;</label><textarea readonly rows="3">${Util.esc(iframe)}</textarea></div>
        <div class="field"><label>API postMessage (para conectar con ml-microbit, MakeCode u otra página con micro:bit)</label><textarea readonly rows="14" class="code">${Util.esc(api)}</textarea></div>
        <p><a href="embed-demo.html" target="_blank" rel="noopener">Ver demo de embebido →</a></p>`);
    },
  };

  global.App = App;
  window.addEventListener('DOMContentLoaded', () => App.init());
})(window);
