/* ==========================================================================
   guide.js — Guía paso a paso para estudiantes.
   ========================================================================== */
(function (global) {
  'use strict';

  const STEPS = [
    { title: '¡Bienvenido/a! 👋', target: null, html: `
      <p>Esta plataforma une tres cosas:</p>
      <ol><li><b>micro:bit</b> que envía datos por el cable USB (serial).</li><li>Un <b>panel</b> donde armás tu propia interfaz: medidores, luces, gráficos, botones…</li><li><b>Bloques estilo Scratch</b> para programar la lógica: alertas, envíos al micro:bit, cámara con IA.</li></ol>
      <p>Seguí los pasos con <b>Siguiente</b>. Podés cerrar la guía cuando quieras y volver con el botón ❓.</p>
      <p class="muted">Tip: si no tenés un micro:bit a mano, activá el <b>Simulador</b> para practicar.</p>` },
    { title: '1. Programá el micro:bit', target: '#btn-tools', html: `
      <p>El micro:bit tiene que enviar líneas de texto con el formato <code>nombre:valor</code>, por ejemplo <code>temp:23,luz:140</code>.</p>
      <p>Abrí <b>Herramientas → Código para el micro:bit</b>, elegí los sensores, copiá el código en <a href="https://makecode.microbit.org" target="_blank" rel="noopener">MakeCode</a> (pestaña JavaScript) y descargalo al micro:bit.</p>
      <p class="muted">En MakeCode el bloque <b>serial escribir valor</b> ya usa este formato.</p>`, action: { label: 'Abrir generador de código', fn: () => App.openMicrobitCode() } },
    { title: '2. Conectá el micro:bit', target: '#btn-connect', html: `
      <p>Usá <b>Chrome o Edge</b>, conectá el micro:bit por USB y presioná <b>Conectar micro:bit</b>. Elegí el dispositivo "BBC micro:bit CMSIS-DAP" en la ventana.</p>
      <p>¿Sin micro:bit? Activá <b>Herramientas → Simulador de datos</b>: genera datos de prueba con los nombres <code>temp</code>, <code>luz</code> y <code>sonido</code>.</p>`, action: { label: 'Activar simulador', fn: () => Simulator.start() } },
    { title: '3. Mirá los datos que llegan', target: '#add-btn', html: `
      <p>Agregá al panel una <b>Tabla de variables</b> o una <b>Consola serial</b> (botón <b>+ Agregar</b>). Vas a ver cada variable con su valor en tiempo real.</p>
      <p>La barra de estado de abajo también muestra la última línea recibida.</p>`, action: { label: 'Agregar tabla de variables', fn: () => Dashboard.add('tabla') } },
    { title: '4. Armá tu panel', target: '#dash-viewport', html: `
      <p>El panel se arma con <b>elementos</b>: tarjetas que muestran una variable del micro:bit o lo controlan. Con <b>+ Agregar</b> elegís uno: <b>Valor</b>, <b>Medidor</b>, <b>Barra</b>, <b>Gráfico</b>, <b>Luz</b>, <b>Texto</b>, <b>Botón</b>…</p>
      <ul><li><b>Arrastrá</b> para moverlos y usá la esquina inferior derecha para cambiar el tamaño.</li><li><b>Doble clic</b> (o ⚙) abre las <b>propiedades</b>: elegí la variable que muestra, unidad, colores, título.</li><li>El <b>título</b> es el nombre que después usan los bloques.</li></ul>`, action: { label: 'Agregar un medidor', fn: () => Dashboard.add('medidor') } },
    { title: '5. Reglas de alerta', target: '#props', html: `
      <p>Los elementos numéricos y las luces tienen <b>Reglas de alerta</b> en sus propiedades: <i>si el valor &gt; 30 → Peligro → "¡Hace calor!"</i>.</p>
      <p>Cuando se cumple, el elemento cambia de color, suena una alarma y aparece en la <b>Lista de alertas</b>. No hace falta programar nada.</p>`, action: { label: 'Agregar lista de alertas', fn: () => Dashboard.add('alertas') } },
    { title: '6. Programá con bloques', target: '#blocks-pane', html: `
      <p>Para lógica más rica usá los bloques (izquierda). Empezá con un evento amarillo, por ejemplo <b>📡 cuando llegan datos</b>, y colgá debajo un <b>si</b> con <b>valor de temp &gt; 30</b> → <b>luz encendida</b>.</p>
      <p>Presioná <b>▶ Ejecutar</b>. Los bloques corren mientras lleguen datos.</p>
      <p class="muted">Bloques útiles: <b>alerta</b>, <b>enviar al micro:bit</b>, <b>cada N segundos</b>, <b>cuando se presiona el botón</b>, <b>guardar en variable del panel</b> (para calcular promedios o conversiones y mostrarlos).</p>`, action: { label: 'Ejecutar bloques ▶', fn: () => Runtime.start() } },
    { title: '7. Fondo con imagen e indicadores', target: '#btn-bg', html: `
      <p>Con <b>Fondo</b> podés poner una foto o un plano (por ejemplo, de tu aula o de una maqueta) y ubicar encima <b>luces</b>, <b>valores</b> y <b>textos</b>.</p>
      <p>Elegí "Sin fondo" y desactivá "Mostrar título" en las propiedades para que los indicadores floten sobre la imagen. Con <b>➚ Flecha</b> y el elemento <b>Marco</b> podés señalar lugares: arrastrá los extremos de la flecha hasta el punto exacto. Mirá el ejemplo <b>🏠 Casa inteligente</b>.</p>`, action: { label: 'Cargar ejemplo Casa inteligente', fn: () => App.loadExample(2) } },
    { title: '8. Cámara + Teachable Machine', target: null, html: `
      <p>Entrená un modelo de imágenes en <a href="https://teachablemachine.withgoogle.com" target="_blank" rel="noopener">Teachable Machine</a> → <b>Exportar modelo</b> → <b>Subir (compartible)</b> → copiá el enlace.</p>
      <p>Agregá el elemento <b>Cámara</b>, pegá la URL en sus propiedades e iniciá la cámara. Vas a tener las variables <code>camara_clase</code> y <code>camara_confianza</code>, y el evento <b>cuando la cámara detecta…</b> en los bloques.</p>`, action: { label: 'Agregar cámara', fn: () => Dashboard.add('camara') } },
    { title: '8b. IA con ML - micro:bit', target: '#btn-ml', html: `
      <p>La plataforma incluye <b>ML - micro:bit</b> (botón <b>IA · ML micro:bit</b>): entrenás un modelo de imagen, audio o pose y la app le manda al micro:bit por <b>Bluetooth</b> la clase detectada.</p>
      <p>El panel solo lee el <b>cable USB (serial)</b>, así que el micro:bit reenvía lo que recibe: en <b>Herramientas → Cómo conectar ML - micro:bit</b> está el programa listo para copiar y los pasos.</p>
      <p>Del lado del panel vas a recibir <code>clase</code> y <code>certeza</code>: mostralas con un <b>Texto</b>, una <b>Luz</b> por clase (regla <i>= Gato</i>) o el bloque <b>cuando clase cambia</b>.</p>`, action: { label: 'Ver cómo se conecta', fn: () => App.openMlHelp() } },
    { title: '9. Guardá tu proyecto', target: '#btn-project', html: `
      <p>Todo se autoguarda en este navegador, pero para llevarlo a otra computadora usá <b>Proyecto → Descargar archivo</b>. Se genera un <code>.json</code> con el panel, los bloques, el fondo y la configuración de datos.</p>
      <p>Para retomarlo: <b>Proyecto → Abrir archivo</b>. También podés <b>copiar un enlace</b> que lleva el proyecto adentro.</p>`, action: { label: 'Descargar archivo', fn: () => Project.download() } },
    { title: '10. Modo panel, pantalla completa y embeber', target: '#btn-panel-mode', html: `
      <p><b>Ver panel</b> oculta el editor y muestra solo tu interfaz; <b>⛶</b> la pone en pantalla completa (ideal para un monitor en el aula).</p>
      <p>Con <b>Herramientas → Embeber</b> obtenés un código <code>&lt;iframe&gt;</code> para mostrar el panel dentro de otra página (un blog, un aula virtual, o un generador de código de micro:bit como ml-microbit) y la API para mandarle datos desde afuera.</p>
      <p>¡Listo! Ahora explorá los <b>Ejemplos</b> del menú Proyecto. 🚀</p>`, action: { label: 'Ver modo panel', fn: () => App.setMode('panel') } },
  ];

  const Guide = {
    el: null, step: 0,
    init(el) {
      this.el = el; this.step = +localStorage.getItem('mbpanel:guide-step') || 0;
      this.render();
    },
    open() { this.el.classList.add('open'); document.getElementById('props').classList.remove('open'); this.render(); },
    close() { this.el.classList.remove('open'); this.highlight(null); },
    toggle() { this.el.classList.contains('open') ? this.close() : this.open(); },
    go(n) { this.step = Util.clamp(n, 0, STEPS.length - 1); localStorage.setItem('mbpanel:guide-step', this.step); this.render(); },
    highlight(sel) {
      document.querySelectorAll('.guide-highlight').forEach(e => e.classList.remove('guide-highlight'));
      if (sel) { const t = document.querySelector(sel); if (t) t.classList.add('guide-highlight'); }
    },
    render() {
      const s = STEPS[this.step];
      this.el.innerHTML = `<div class="props-head"><span>❓ Guía paso a paso</span><button class="mini" data-close>✕</button></div>
        <div class="guide-progress">${STEPS.map((_, i) => `<i class="${i === this.step ? 'cur' : i < this.step ? 'done' : ''}" data-go="${i}" title="Paso ${i}"></i>`).join('')}</div>
        <h3>${s.title}</h3><div class="guide-body">${s.html}</div>
        ${s.action ? `<button class="btn accent" data-action>✨ ${s.action.label}</button>` : ''}
        <div class="guide-nav"><button class="mini" data-prev ${this.step === 0 ? 'disabled' : ''}>◀ Anterior</button><span>${this.step + 1} / ${STEPS.length}</span><button class="mini primary" data-next ${this.step === STEPS.length - 1 ? 'disabled' : ''}>Siguiente ▶</button></div>`;
      this.el.querySelector('[data-close]').onclick = () => this.close();
      this.el.querySelector('[data-prev]').onclick = () => this.go(this.step - 1);
      this.el.querySelector('[data-next]').onclick = () => this.go(this.step + 1);
      this.el.querySelectorAll('[data-go]').forEach(i => i.onclick = () => this.go(+i.dataset.go));
      const a = this.el.querySelector('[data-action]'); if (a) a.onclick = () => { try { s.action.fn(); } catch (e) { console.error(e); } };
      if (this.el.classList.contains('open')) this.highlight(s.target);
    }
  };

  global.Guide = Guide; global.GUIDE_STEPS = STEPS;
})(window);
