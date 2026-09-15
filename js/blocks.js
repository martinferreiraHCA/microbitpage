/* ==========================================================================
   blocks.js — Bloques estilo Scratch (Blockly) para programar la lógica:
   eventos, sensores, panel, alertas, micro:bit y cámara/IA.
   ========================================================================== */
(function (global) {
  'use strict';

  const C = { eventos: '#FFAB19', sensores: '#4C97FF', panel: '#9966FF', alertas: '#FF6680', microbit: '#59C059', camara: '#CF63CF', control: '#FFBF00', logica: '#5CB1D6', mates: '#5B67A5', texto: '#BC77A9' };

  function varOptions() {
    const names = new Set(Vars.names());
    (Simulator.vars || []).forEach(v => names.add(v.name));
    (Serial.config.columns || []).forEach(n => n && names.add(n));
    Dashboard.widgets.forEach(w => { if (w.props.source) names.add(w.props.source); if (w.props.variable) names.add(w.props.variable); String(w.props.sources || '').split(',').forEach(s => s.trim() && names.add(s.trim())); });
    const arr = [...names].filter(Boolean).sort().map(n => [n, n]);
    return arr.length ? arr : [['temp', 'temp']];
  }
  function widgetOptions(types) {
    const ws = Dashboard.widgets.filter(w => !types || types.includes(w.type)).map(w => [w.title, w.title]);
    return ws.length ? ws : [['(sin widgets)', '']];
  }
  /** Dropdown que conserva el valor guardado aunque ya no exista en las opciones. */
  function dyn(fn) {
    return function () {
      const opts = fn();
      const cur = this && this.getValue ? this.getValue() : null;
      if (cur && !opts.some(o => o[1] === cur)) opts.unshift([cur, cur]);
      return opts;
    };
  }
  function classOptions() { const c = (TM.classes || []).map(x => [x, x]); return c.length ? c : [['Clase 1', 'Clase 1'], ['Clase 2', 'Clase 2']]; }

  const defs = [
    // ---- Eventos ----
    { type: 'ev_datos', message0: '📡 cuando llegan datos del micro:bit', nextStatement: null, colour: C.eventos, tooltip: 'Se ejecuta cada vez que el micro:bit envía una línea.', extensions: ['hat_cap'] },
    { type: 'ev_cambia', message0: '🔁 cuando %1 cambia', args0: [{ type: 'field_dropdown', name: 'VAR', options: dyn(varOptions) }], nextStatement: null, colour: C.eventos, extensions: ['hat_cap'] },
    { type: 'ev_cada', message0: '⏱️ cada %1 segundos', args0: [{ type: 'field_number', name: 'SEC', value: 1, min: 0.1 }], nextStatement: null, colour: C.eventos, extensions: ['hat_cap'] },
    { type: 'ev_boton', message0: '🔘 cuando se presiona el botón %1', args0: [{ type: 'field_dropdown', name: 'W', options: dyn(() => widgetOptions(['boton'])) }], nextStatement: null, colour: C.eventos, extensions: ['hat_cap'] },
    { type: 'ev_control', message0: '🎛️ cuando el control %1 cambia a %2', args0: [{ type: 'field_dropdown', name: 'W', options: dyn(() => widgetOptions(['deslizador', 'interruptor'])) }, { type: 'field_variable', name: 'V', variable: 'valor' }], nextStatement: null, colour: C.eventos, extensions: ['hat_cap'] },
    { type: 'ev_camara', message0: '📷 cuando la cámara detecta %1', args0: [{ type: 'field_dropdown', name: 'CLS', options: dyn(classOptions) }], nextStatement: null, colour: C.eventos, extensions: ['hat_cap'] },
    { type: 'ev_inicio', message0: '🚩 al iniciar el programa', nextStatement: null, colour: C.eventos, extensions: ['hat_cap'] },
    // ---- Sensores ----
    { type: 'sen_valor', message0: 'valor de %1', args0: [{ type: 'field_dropdown', name: 'VAR', options: dyn(varOptions) }], output: null, colour: C.sensores },
    { type: 'sen_nombre', message0: 'valor del sensor llamado %1', args0: [{ type: 'input_value', name: 'NAME', check: 'String' }], output: null, colour: C.sensores, inputsInline: true },
    { type: 'sen_hay', message0: '¿llegó %1?', args0: [{ type: 'field_dropdown', name: 'VAR', options: dyn(varOptions) }], output: 'Boolean', colour: C.sensores },
    { type: 'sen_stat', message0: '%1 de %2 en los últimos %3 valores', args0: [{ type: 'field_dropdown', name: 'K', options: [['promedio', 'avg'], ['máximo', 'max'], ['mínimo', 'min'], ['suma', 'sum']] }, { type: 'field_dropdown', name: 'VAR', options: dyn(varOptions) }, { type: 'field_number', name: 'N', value: 10, min: 1 }], output: 'Number', colour: C.sensores },
    { type: 'sen_linea', message0: 'última línea recibida', output: 'String', colour: C.sensores },
    { type: 'sen_guardar', message0: 'guardar %1 en la variable del panel %2', args0: [{ type: 'input_value', name: 'VAL' }, { type: 'field_input', name: 'VAR', text: 'temp_f' }], previousStatement: null, nextStatement: null, colour: C.sensores, inputsInline: true, tooltip: 'Crea o actualiza una variable que pueden mostrar los widgets.' },
    { type: 'sen_mapear', message0: 'mapear %1 de %2 – %3 a %4 – %5', args0: [{ type: 'input_value', name: 'V', check: 'Number' }, { type: 'field_number', name: 'A', value: 0 }, { type: 'field_number', name: 'B', value: 1023 }, { type: 'field_number', name: 'C', value: 0 }, { type: 'field_number', name: 'D', value: 100 }], output: 'Number', colour: C.sensores, inputsInline: true },
    // ---- Panel ----
    { type: 'pan_mostrar', message0: 'mostrar %1 en %2', args0: [{ type: 'input_value', name: 'VAL' }, { type: 'field_dropdown', name: 'W', options: dyn(() => widgetOptions()) }], previousStatement: null, nextStatement: null, colour: C.panel, inputsInline: true, tooltip: 'Envía un valor a un widget (número, medidor, texto, botón…).' },
    { type: 'pan_luz', message0: 'luz %1 %2', args0: [{ type: 'field_dropdown', name: 'W', options: dyn(() => widgetOptions(['luz'])) }, { type: 'field_dropdown', name: 'ON', options: [['encendida', '1'], ['apagada', '0']] }], previousStatement: null, nextStatement: null, colour: C.panel },
    { type: 'pan_color', message0: 'poner color de %1 a %2', args0: [{ type: 'field_dropdown', name: 'W', options: dyn(() => widgetOptions()) }, { type: 'input_value', name: 'COL', check: 'Colour' }], previousStatement: null, nextStatement: null, colour: C.panel, inputsInline: true },
    { type: 'pan_texto', message0: 'poner texto de %1 a %2', args0: [{ type: 'field_dropdown', name: 'W', options: dyn(() => widgetOptions(['texto', 'boton'])) }, { type: 'input_value', name: 'TXT' }], previousStatement: null, nextStatement: null, colour: C.panel, inputsInline: true },
    { type: 'pan_visible', message0: '%1 %2', args0: [{ type: 'field_dropdown', name: 'V', options: [['mostrar widget', '1'], ['ocultar widget', '0']] }, { type: 'field_dropdown', name: 'W', options: dyn(() => widgetOptions()) }], previousStatement: null, nextStatement: null, colour: C.panel },
    { type: 'pan_imagen', message0: 'poner imagen de %1 desde URL %2', args0: [{ type: 'field_dropdown', name: 'W', options: dyn(() => widgetOptions(['imagen'])) }, { type: 'input_value', name: 'URL', check: 'String' }], previousStatement: null, nextStatement: null, colour: C.panel, inputsInline: true },
    { type: 'pan_fondo', message0: 'poner fondo del panel a %1', args0: [{ type: 'input_value', name: 'COL', check: 'Colour' }], previousStatement: null, nextStatement: null, colour: C.panel },
    // ---- Alertas ----
    { type: 'al_alerta', message0: '🚨 alerta de %1 : %2', args0: [{ type: 'field_dropdown', name: 'LVL', options: [['peligro', 'danger'], ['aviso', 'warn'], ['información', 'info'], ['normal', 'ok']] }, { type: 'input_value', name: 'MSG' }], previousStatement: null, nextStatement: null, colour: C.alertas, inputsInline: true },
    { type: 'al_sonido', message0: '🔊 reproducir sonido %1', args0: [{ type: 'field_dropdown', name: 'S', options: [['bip', 'beep'], ['ok', 'ok'], ['alarma', 'alarma'], ['peligro', 'peligro']] }], previousStatement: null, nextStatement: null, colour: C.alertas },
    { type: 'al_hablar', message0: '🗣️ decir en voz alta %1', args0: [{ type: 'input_value', name: 'TXT' }], previousStatement: null, nextStatement: null, colour: C.alertas },
    { type: 'al_limpiar', message0: 'borrar todas las alertas', previousStatement: null, nextStatement: null, colour: C.alertas },
    { type: 'al_notif', message0: '🔔 notificación del navegador %1', args0: [{ type: 'input_value', name: 'TXT' }], previousStatement: null, nextStatement: null, colour: C.alertas },
    // ---- micro:bit ----
    { type: 'mb_enviar', message0: '📤 enviar %1 al micro:bit', args0: [{ type: 'input_value', name: 'TXT' }], previousStatement: null, nextStatement: null, colour: C.microbit, tooltip: 'Envía una línea por serial. En el micro:bit usá "serial.readLine()".' },
    { type: 'mb_enviar_kv', message0: '📤 enviar %1 : %2 al micro:bit', args0: [{ type: 'field_input', name: 'K', text: 'led' }, { type: 'input_value', name: 'V' }], previousStatement: null, nextStatement: null, colour: C.microbit, inputsInline: true },
    { type: 'mb_conectado', message0: '¿micro:bit conectado?', output: 'Boolean', colour: C.microbit },
    // ---- Cámara / IA ----
    { type: 'cam_clase', message0: 'clase detectada por la cámara', output: 'String', colour: C.camara },
    { type: 'cam_conf', message0: 'confianza (%) de %1', args0: [{ type: 'field_dropdown', name: 'CLS', options: dyn(classOptions) }], output: 'Number', colour: C.camara },
    { type: 'cam_es', message0: '¿la cámara ve %1 con más de %2 %?', args0: [{ type: 'field_dropdown', name: 'CLS', options: dyn(classOptions) }, { type: 'field_number', name: 'P', value: 70, min: 0, max: 100 }], output: 'Boolean', colour: C.camara },
    { type: 'cam_toggle', message0: '📷 %1 cámara', args0: [{ type: 'field_dropdown', name: 'ON', options: [['encender', '1'], ['apagar', '0']] }], previousStatement: null, nextStatement: null, colour: C.camara },
    // ---- extras ----
    { type: 'txt_hora', message0: 'hora actual', output: 'String', colour: C.texto },
    { type: 'txt_unir', message0: 'unir %1 %2', args0: [{ type: 'input_value', name: 'A' }, { type: 'input_value', name: 'B' }], output: 'String', colour: C.texto, inputsInline: true },
  ];

  const Blocks = {
    ws: null, JS: null,

    init(containerId) {
      if (!global.Blockly) throw new Error('Blockly no cargó');
      const JS = (global.javascript && javascript.javascriptGenerator) || Blockly.JavaScript;
      this.JS = JS;
      const Order = (global.javascript && javascript.Order) || JS.ORDER || {};
      const ATOMIC = Order.ATOMIC != null ? Order.ATOMIC : 0, NONE = Order.NONE != null ? Order.NONE : 99;

      if (!Blockly.Extensions.isRegistered('hat_cap')) Blockly.Extensions.register('hat_cap', function () { this.hat = 'cap'; });
      Blockly.defineBlocksWithJsonArray(defs);

      const v = (b, name, o) => JS.valueToCode(b, name, o == null ? NONE : o) || 'null';
      const hat = (ev, key) => function (b) { return `api.on(${JSON.stringify(ev)}, ${JSON.stringify(key)}, function(){\n${JS.statementToCode(b, 'DO') || ''}});\n`; };
      const fb = JS.forBlock;
      fb.ev_datos = b => `api.on('data', '', function(){\n${bodyOf(b)}});\n`;
      fb.ev_cambia = b => `api.on('var', ${JSON.stringify(b.getFieldValue('VAR'))}, function(){\n${bodyOf(b)}});\n`;
      fb.ev_cada = b => `api.on('timer', ${+b.getFieldValue('SEC') || 1}, function(){\n${bodyOf(b)}});\n`;
      fb.ev_boton = b => `api.on('button', ${JSON.stringify(b.getFieldValue('W'))}, function(){\n${bodyOf(b)}});\n`;
      fb.ev_control = b => { const vn = JS.getVariableName(b.getFieldValue('V')); return `api.on('control', ${JSON.stringify(b.getFieldValue('W'))}, function(__v){ ${vn} = __v;\n${bodyOf(b)}});\n`; };
      fb.ev_camara = b => `api.on('camera', ${JSON.stringify(b.getFieldValue('CLS'))}, function(){\n${bodyOf(b)}});\n`;
      fb.ev_inicio = b => `api.on('start', '', function(){\n${bodyOf(b)}});\n`;
      /** Los "hat" no tienen input DO: el cuerpo es lo que cuelga debajo (nextStatement). */
      function bodyOf(b) { const next = b.getNextBlock(); return next ? JS.blockToCode(next) : ''; }
      // Evitamos que Blockly encadene el "next" de los hats como código suelto: se maneja en bodyOf.
      const origScrub = JS.scrub_.bind(JS);
      JS.scrub_ = function (block, code, opt) { if (block.type.startsWith('ev_')) return code; return origScrub(block, code, opt); };

      fb.sen_valor = b => [`api.get(${JSON.stringify(b.getFieldValue('VAR'))})`, ATOMIC];
      fb.sen_nombre = b => [`api.get(${v(b, 'NAME')})`, ATOMIC];
      fb.sen_hay = b => [`api.has(${JSON.stringify(b.getFieldValue('VAR'))})`, ATOMIC];
      fb.sen_stat = b => [`api.stat(${JSON.stringify(b.getFieldValue('VAR'))}, ${+b.getFieldValue('N') || 10}, ${JSON.stringify(b.getFieldValue('K'))})`, ATOMIC];
      fb.sen_linea = () => ['api.last()', ATOMIC];
      fb.sen_guardar = b => `api.set(${JSON.stringify(b.getFieldValue('VAR'))}, ${v(b, 'VAL')});\n`;
      fb.sen_mapear = b => [`api.map(${v(b, 'V')}, ${+b.getFieldValue('A')}, ${+b.getFieldValue('B')}, ${+b.getFieldValue('C')}, ${+b.getFieldValue('D')})`, ATOMIC];
      fb.pan_mostrar = b => `api.show(${JSON.stringify(b.getFieldValue('W'))}, ${v(b, 'VAL')});\n`;
      fb.pan_luz = b => `api.led(${JSON.stringify(b.getFieldValue('W'))}, ${b.getFieldValue('ON') === '1'});\n`;
      fb.pan_color = b => `api.color(${JSON.stringify(b.getFieldValue('W'))}, ${v(b, 'COL')});\n`;
      fb.pan_texto = b => `api.text(${JSON.stringify(b.getFieldValue('W'))}, ${v(b, 'TXT')});\n`;
      fb.pan_visible = b => `api.visible(${JSON.stringify(b.getFieldValue('W'))}, ${b.getFieldValue('V') === '1'});\n`;
      fb.pan_imagen = b => `api.image(${JSON.stringify(b.getFieldValue('W'))}, ${v(b, 'URL')});\n`;
      fb.pan_fondo = b => `api.bg(${v(b, 'COL')});\n`;
      fb.al_alerta = b => `api.alert(${JSON.stringify(b.getFieldValue('LVL'))}, ${v(b, 'MSG')});\n`;
      fb.al_sonido = b => `api.sound(${JSON.stringify(b.getFieldValue('S'))});\n`;
      fb.al_hablar = b => `api.speak(${v(b, 'TXT')});\n`;
      fb.al_limpiar = () => `api.clearAlerts();\n`;
      fb.al_notif = b => `api.notify(${v(b, 'TXT')});\n`;
      fb.mb_enviar = b => `api.send(${v(b, 'TXT')});\n`;
      fb.mb_enviar_kv = b => `api.send(${JSON.stringify(b.getFieldValue('K'))} + ':' + ${v(b, 'V')});\n`;
      fb.mb_conectado = () => ['api.connected()', ATOMIC];
      fb.cam_clase = () => ['api.camClass()', ATOMIC];
      fb.cam_conf = b => [`api.camConf(${JSON.stringify(b.getFieldValue('CLS'))})`, ATOMIC];
      fb.cam_es = b => [`(api.camClass() === ${JSON.stringify(b.getFieldValue('CLS'))} && api.camConf(${JSON.stringify(b.getFieldValue('CLS'))}) >= ${+b.getFieldValue('P')})`, ATOMIC];
      fb.cam_toggle = b => `api.camToggle(${b.getFieldValue('ON') === '1'});\n`;
      fb.txt_hora = () => ['new Date().toLocaleTimeString()', ATOMIC];
      fb.txt_unir = b => [`(String(${v(b, 'A')}) + String(${v(b, 'B')}))`, ATOMIC];

      JS.INFINITE_LOOP_TRAP = 'if (--api.__budget < 0) throw new Error("Bucle infinito: revisá tus repeticiones");\n';

      const toolbox = {
        kind: 'categoryToolbox', contents: [
          { kind: 'category', name: 'Eventos', colour: C.eventos, contents: ['ev_datos', 'ev_cambia', 'ev_cada', 'ev_boton', 'ev_control', 'ev_camara', 'ev_inicio'].map(t => ({ kind: 'block', type: t })) },
          { kind: 'category', name: 'Sensores', colour: C.sensores, contents: [
            { kind: 'block', type: 'sen_valor' }, { kind: 'block', type: 'sen_nombre', inputs: { NAME: { shadow: { type: 'text', fields: { TEXT: 'temp' } } } } }, { kind: 'block', type: 'sen_hay' }, { kind: 'block', type: 'sen_stat' }, { kind: 'block', type: 'sen_linea' },
            { kind: 'block', type: 'sen_guardar', inputs: { VAL: { shadow: { type: 'math_number', fields: { NUM: 0 } } } } },
            { kind: 'block', type: 'sen_mapear', inputs: { V: { shadow: { type: 'math_number', fields: { NUM: 512 } } } } } ] },
          { kind: 'category', name: 'Panel', colour: C.panel, contents: [
            { kind: 'block', type: 'pan_mostrar', inputs: { VAL: { shadow: { type: 'math_number', fields: { NUM: 0 } } } } }, { kind: 'block', type: 'pan_luz' },
            { kind: 'block', type: 'pan_color', inputs: { COL: { shadow: { type: 'colour_picker', fields: { COLOUR: '#ff0000' } } } } },
            { kind: 'block', type: 'pan_texto', inputs: { TXT: { shadow: { type: 'text', fields: { TEXT: 'hola' } } } } }, { kind: 'block', type: 'pan_visible' },
            { kind: 'block', type: 'pan_imagen', inputs: { URL: { shadow: { type: 'text', fields: { TEXT: 'https://' } } } } },
            { kind: 'block', type: 'pan_fondo', inputs: { COL: { shadow: { type: 'colour_picker', fields: { COLOUR: '#eef2f7' } } } } } ] },
          { kind: 'category', name: 'Alertas', colour: C.alertas, contents: [
            { kind: 'block', type: 'al_alerta', inputs: { MSG: { shadow: { type: 'text', fields: { TEXT: '¡Temperatura alta!' } } } } }, { kind: 'block', type: 'al_sonido' },
            { kind: 'block', type: 'al_hablar', inputs: { TXT: { shadow: { type: 'text', fields: { TEXT: 'Atención' } } } } }, { kind: 'block', type: 'al_limpiar' },
            { kind: 'block', type: 'al_notif', inputs: { TXT: { shadow: { type: 'text', fields: { TEXT: 'Alerta del panel' } } } } } ] },
          { kind: 'category', name: 'micro:bit', colour: C.microbit, contents: [
            { kind: 'block', type: 'mb_enviar', inputs: { TXT: { shadow: { type: 'text', fields: { TEXT: 'hola' } } } } },
            { kind: 'block', type: 'mb_enviar_kv', inputs: { V: { shadow: { type: 'math_number', fields: { NUM: 1 } } } } }, { kind: 'block', type: 'mb_conectado' } ] },
          { kind: 'category', name: 'Cámara / IA', colour: C.camara, contents: ['cam_clase', 'cam_conf', 'cam_es', 'cam_toggle'].map(t => ({ kind: 'block', type: t })) },
          { kind: 'sep' },
          { kind: 'category', name: 'Control', colour: C.control, contents: [
            { kind: 'block', type: 'controls_if' }, { kind: 'block', type: 'controls_if', extraState: { hasElse: true } },
            { kind: 'block', type: 'controls_repeat_ext', inputs: { TIMES: { shadow: { type: 'math_number', fields: { NUM: 5 } } } } }, { kind: 'block', type: 'controls_whileUntil' },
            { kind: 'block', type: 'controls_for', inputs: { FROM: { shadow: { type: 'math_number', fields: { NUM: 1 } } }, TO: { shadow: { type: 'math_number', fields: { NUM: 10 } } }, BY: { shadow: { type: 'math_number', fields: { NUM: 1 } } } } } ] },
          { kind: 'category', name: 'Lógica', colour: C.logica, contents: ['logic_compare', 'logic_operation', 'logic_negate', 'logic_boolean', 'logic_ternary'].map(t => ({ kind: 'block', type: t })) },
          { kind: 'category', name: 'Matemáticas', colour: C.mates, contents: [
            { kind: 'block', type: 'math_number' },
            { kind: 'block', type: 'math_arithmetic', inputs: { A: { shadow: { type: 'math_number', fields: { NUM: 1 } } }, B: { shadow: { type: 'math_number', fields: { NUM: 1 } } } } },
            { kind: 'block', type: 'math_single', inputs: { NUM: { shadow: { type: 'math_number', fields: { NUM: 9 } } } } },
            { kind: 'block', type: 'math_round', inputs: { NUM: { shadow: { type: 'math_number', fields: { NUM: 3.1 } } } } },
            { kind: 'block', type: 'math_random_int', inputs: { FROM: { shadow: { type: 'math_number', fields: { NUM: 1 } } }, TO: { shadow: { type: 'math_number', fields: { NUM: 100 } } } } },
            { kind: 'block', type: 'math_constrain', inputs: { VALUE: { shadow: { type: 'math_number', fields: { NUM: 50 } } }, LOW: { shadow: { type: 'math_number', fields: { NUM: 1 } } }, HIGH: { shadow: { type: 'math_number', fields: { NUM: 100 } } } } } ] },
          { kind: 'category', name: 'Texto', colour: C.texto, contents: [
            { kind: 'block', type: 'text' }, { kind: 'block', type: 'txt_unir', inputs: { A: { shadow: { type: 'text', fields: { TEXT: 'Temp: ' } } }, B: { shadow: { type: 'math_number', fields: { NUM: 0 } } } } },
            { kind: 'block', type: 'text_join' }, { kind: 'block', type: 'text_length', inputs: { VALUE: { shadow: { type: 'text', fields: { TEXT: 'abc' } } } } }, { kind: 'block', type: 'txt_hora' },
            { kind: 'block', type: 'text_indexOf', inputs: { VALUE: { shadow: { type: 'text', fields: { TEXT: 'hola mundo' } } }, FIND: { shadow: { type: 'text', fields: { TEXT: 'mundo' } } } } } ] },
          { kind: 'category', name: 'Variables', colour: '#FF8C1A', custom: 'VARIABLE' },
          { kind: 'category', name: 'Funciones', colour: '#FF6680', custom: 'PROCEDURE' },
        ]
      };

      this.ws = Blockly.inject(containerId, {
        toolbox, renderer: 'zelos', theme: Blockly.Themes.Zelos || undefined,
        grid: { spacing: 24, length: 3, colour: '#e5e7eb', snap: true }, zoom: { controls: true, wheel: true, startScale: 0.8, maxScale: 2, minScale: 0.4 },
        media: 'vendor/blockly/media/', trashcan: true, move: { scrollbars: true, drag: true, wheel: false }, sounds: false,
      });
      this.ws.addChangeListener(ev => { if (ev.isUiEvent) return; Bus.emit('blocks:changed', ev); });
      Bus.on('dash:changed', () => this.refreshDropdowns());
      Bus.on('tm:model', () => this.refreshDropdowns());
      return this.ws;
    },

    refreshDropdowns() { /* Los dropdowns son dinámicos: se recalculan al abrirlos. Nada que hacer. */ },

    /** Código JS del programa. */
    code() {
      try { return this.JS.workspaceToCode(this.ws); } catch (e) { console.error(e); Util.toast('Error al generar código: ' + e.message, 'error'); return ''; }
    },
    serialize() { return Blockly.serialization.workspaces.save(this.ws); },
    load(state) {
      this.ws.clear();
      if (state && Object.keys(state).length) { try { Blockly.serialization.workspaces.load(state, this.ws); } catch (e) { console.error(e); Util.toast('No se pudieron cargar los bloques: ' + e.message, 'error'); } }
      Blockly.svgResize(this.ws);
    },
    resize() { if (this.ws) Blockly.svgResize(this.ws); },
    isEmpty() { return !this.ws || this.ws.getTopBlocks(false).length === 0; }
  };

  global.Blocks = Blocks;
})(window);
