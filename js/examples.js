/* ==========================================================================
   examples.js — Proyectos de ejemplo listos para explorar.
   ========================================================================== */
(function (global) {
  'use strict';

  const num = n => ({ shadow: { type: 'math_number', fields: { NUM: n } } });
  const txt = t => ({ shadow: { type: 'text', fields: { TEXT: t } } });
  const cmp = (op, a, b) => ({ block: { type: 'logic_compare', fields: { OP: op }, inputs: { A: a, B: b } } });
  const val = name => ({ block: { type: 'sen_valor', fields: { VAR: name } } });

  const planoSVG = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="#f3f4f6"/><g stroke="#374151" stroke-width="8" fill="none"><rect x="120" y="80" width="1040" height="560" fill="#ffffff"/><line x1="560" y1="80" x2="560" y2="640"/><line x1="120" y1="380" x2="560" y2="380"/><line x1="560" y1="360" x2="1160" y2="360"/><line x1="860" y1="360" x2="860" y2="640"/></g><g font-family="system-ui,sans-serif" font-size="30" fill="#9ca3af" text-anchor="middle"><text x="340" y="130">COCINA</text><text x="340" y="430">DORMITORIO</text><text x="860" y="130">LIVING</text><text x="710" y="410">BAÑO</text><text x="1010" y="410">INVERNADERO</text></g><rect x="600" y="400" width="220" height="200" fill="#e0f2fe" opacity=".6"/><rect x="900" y="400" width="220" height="200" fill="#dcfce7" opacity=".6"/><rect x="160" y="120" width="360" height="220" fill="#fef3c7" opacity=".5"/></svg>`);

  const Examples = [
    {
      name: 'Estación meteorológica', desc: 'Temperatura y luz con medidores, gráfico, luz de alerta y reglas.',
      project: {
        app: 'microbit-panel-lab', version: 1, name: 'Estación meteorológica',
        sim: { vars: [{ name: 'temp', min: 15, max: 38 }, { name: 'luz', min: 0, max: 255 }] },
        dashboard: {
          width: 1280, height: 720, background: { color: '#eef2f7', image: '', fit: 'cover' },
          widgets: [
            { id: 'w_titulo', type: 'texto', title: 'Título', x: 40, y: 20, w: 800, h: 60, props: { text: 'Estación meteorológica', size: 30, color: '#1c1f26', align: 'left', bold: true, showTitle: false, transparent: true } },
            { id: 'w_hora', type: 'texto', title: 'Hora', x: 1000, y: 20, w: 240, h: 60, props: { text: '{hora}', size: 22, color: '#7a8090', align: 'right', bold: false, showTitle: false, transparent: true } },
            { id: 'w_temp', type: 'valor', title: 'Temperatura', x: 40, y: 100, w: 220, h: 220, props: { source: 'temp', unit: '°C', decimals: 1, color: '#111827', rules: [{ op: '>', value: 32, level: 'danger', message: '¡Hace mucho calor!' }, { op: '>', value: 28, level: 'warn', message: 'Temperatura alta' }, { op: '<', value: 17, level: 'info', message: 'Hace frío' }] } },
            { id: 'w_luz', type: 'medidor', title: 'Luz', x: 280, y: 100, w: 220, h: 220, props: { source: 'luz', min: 0, max: 255, unit: '', decimals: 0, color: '#f59e0b', rules: [{ op: '<', value: 40, level: 'warn', message: 'Está oscuro' }] } },
            { id: 'w_led', type: 'luz', title: 'Alerta calor', x: 520, y: 100, w: 220, h: 220, props: { mode: 'bloques', source: 'temp', label: 'Calor', colorOn: '#ef4444', colorOff: '#4b5563', rules: [], showTitle: true } },
            { id: 'w_graf', type: 'grafico', title: 'Historial', x: 40, y: 340, w: 700, h: 300, props: { sources: 'temp', maxPoints: 80, minY: 10, maxY: 40, showLegend: true, fill: true } },
            { id: 'w_alertas', type: 'alertas', title: 'Alertas', x: 780, y: 100, w: 460, h: 220, props: { max: 8, showTime: true } },
            { id: 'w_tabla', type: 'tabla', title: 'Variables', x: 780, y: 340, w: 220, h: 300, props: { filter: '' } },
            { id: 'w_consola', type: 'consola', title: 'Serial', x: 1020, y: 340, w: 220, h: 300, props: { max: 30, showSend: false } },
            { id: 'w_pie', type: 'texto', title: 'Pie', x: 40, y: 660, w: 1200, h: 40, props: { text: 'Promedio de temperatura: {temp_prom|1} °C   ·   Máximo: {temp_max|1} °C', size: 16, color: '#7a8090', align: 'left', bold: false, showTitle: false, transparent: true } },
          ]
        },
        blocks: { blocks: { languageVersion: 0, blocks: [
          { type: 'ev_datos', x: 30, y: 30, next: { block: { type: 'controls_if', extraState: { hasElse: true }, inputs: { IF0: cmp('GT', val('temp'), num(30)), DO0: { block: { type: 'pan_luz', fields: { W: 'Alerta calor', ON: '1' } } }, ELSE: { block: { type: 'pan_luz', fields: { W: 'Alerta calor', ON: '0' } } } },
            next: { block: { type: 'sen_guardar', fields: { VAR: 'temp_prom' }, inputs: { VAL: { block: { type: 'sen_stat', fields: { K: 'avg', VAR: 'temp', N: 20 } } } },
              next: { block: { type: 'sen_guardar', fields: { VAR: 'temp_max' }, inputs: { VAL: { block: { type: 'sen_stat', fields: { K: 'max', VAR: 'temp', N: 50 } } } } } } } } } } },
          { type: 'ev_cada', x: 30, y: 420, fields: { SEC: 30 }, next: { block: { type: 'al_alerta', fields: { LVL: 'info' }, inputs: { MSG: { block: { type: 'txt_unir', inputs: { A: txt('Temperatura actual: '), B: val('temp') } } } } } } },
        ] } },
      }
    },
    {
      name: 'Control de luz y botones', desc: 'Botones e interruptor que envían órdenes al micro:bit, barra de luz y alarma por oscuridad.',
      project: {
        app: 'microbit-panel-lab', version: 1, name: 'Control de luz',
        sim: { vars: [{ name: 'luz', min: 0, max: 255 }, { name: 'sonido', min: 0, max: 255 }] },
        dashboard: {
          width: 1280, height: 720, background: { color: '#fdf6e3', image: '', fit: 'cover' },
          widgets: [
            { id: 'w_t', type: 'texto', title: 'Título', x: 40, y: 20, w: 800, h: 60, props: { text: 'Control de luz', size: 30, color: '#1c1f26', bold: true, showTitle: false, transparent: true } },
            { id: 'w_barra', type: 'barra', title: 'Luz ambiente', x: 40, y: 100, w: 220, h: 460, props: { source: 'luz', min: 0, max: 255, orientation: 'v', unit: '', color: '#f59e0b', rules: [{ op: '<', value: 50, level: 'warn', message: 'Está oscuro: encendé la luz' }] } },
            { id: 'w_son', type: 'medidor', title: 'Sonido', x: 280, y: 100, w: 220, h: 220, props: { source: 'sonido', min: 0, max: 255, unit: '', decimals: 0, color: '#8b5cf6', rules: [{ op: '>', value: 200, level: 'danger', message: '¡Mucho ruido!' }] } },
            { id: 'w_on', type: 'boton', title: 'Encender', x: 520, y: 100, w: 220, h: 100, props: { label: 'Encender LED', color: '#16a34a', send: 'led:1', showTitle: false, transparent: true } },
            { id: 'w_off', type: 'boton', title: 'Apagar', x: 520, y: 220, w: 220, h: 100, props: { label: 'Apagar LED', color: '#6b7280', send: 'led:0', showTitle: false, transparent: true } },
            { id: 'w_sw', type: 'interruptor', title: 'Modo automático', x: 280, y: 340, w: 220, h: 100, props: { variable: 'auto', send: false, labelOn: 'Automático', labelOff: 'Manual', color: '#2563eb' } },
            { id: 'w_sl', type: 'deslizador', title: 'Brillo', x: 280, y: 460, w: 220, h: 100, props: { variable: 'brillo', min: 0, max: 255, step: 5, send: true, color: '#f59e0b' } },
            { id: 'w_led', type: 'luz', title: 'Estado LED', x: 520, y: 340, w: 220, h: 220, props: { mode: 'bloques', source: '', label: 'LED', colorOn: '#facc15', colorOff: '#4b5563', rules: [] } },
            { id: 'w_con', type: 'consola', title: 'Serial', x: 780, y: 100, w: 460, h: 220, props: { max: 40, showSend: true } },
            { id: 'w_al', type: 'alertas', title: 'Alertas', x: 780, y: 340, w: 460, h: 220, props: { max: 6, showTime: true } },
          ]
        },
        blocks: { blocks: { languageVersion: 0, blocks: [
          { type: 'ev_boton', x: 30, y: 30, fields: { W: 'Encender' }, next: { block: { type: 'pan_luz', fields: { W: 'Estado LED', ON: '1' }, next: { block: { type: 'al_sonido', fields: { S: 'ok' } } } } } },
          { type: 'ev_boton', x: 30, y: 200, fields: { W: 'Apagar' }, next: { block: { type: 'pan_luz', fields: { W: 'Estado LED', ON: '0' } } } },
          { type: 'ev_cambia', x: 30, y: 350, fields: { VAR: 'luz' }, next: { block: { type: 'controls_if', inputs: { IF0: { block: { type: 'logic_operation', fields: { OP: 'AND' }, inputs: { A: cmp('EQ', val('auto'), num(1)), B: cmp('LT', val('luz'), num(50)) } } }, DO0: { block: { type: 'mb_enviar_kv', fields: { K: 'led' }, inputs: { V: num(1) }, next: { block: { type: 'pan_luz', fields: { W: 'Estado LED', ON: '1' } } } } } } } } },
        ] } },
      }
    },
    {
      name: 'Casa inteligente (imagen de fondo)', desc: 'Plano de una casa como fondo, con luces indicadoras y valores ubicados en cada habitación.',
      project: {
        app: 'microbit-panel-lab', version: 1, name: 'Casa inteligente',
        sim: { vars: [{ name: 'temp', min: 15, max: 36 }, { name: 'luz', min: 0, max: 255 }, { name: 'humedad', min: 20, max: 95 }] },
        dashboard: {
          width: 1280, height: 720, background: { color: '#f3f4f6', image: planoSVG, fit: 'contain' },
          widgets: [
            { id: 'c_t', type: 'texto', title: 'Título', x: 130, y: 10, w: 900, h: 50, props: { text: 'Casa inteligente — monitoreo por habitación', size: 24, color: '#1c1f26', bold: true, showTitle: false, transparent: true } },
            { id: 'c_cocina', type: 'valor', title: 'Temp cocina', x: 240, y: 160, w: 240, h: 160, props: { source: 'temp', unit: '°C', decimals: 1, color: '#111827', rules: [{ op: '>', value: 30, level: 'danger', message: '¡Cocina muy caliente!' }], transparent: true, showTitle: true } },
            { id: 'c_led_cocina', type: 'luz', title: 'Luz cocina', x: 160, y: 200, w: 80, h: 80, props: { mode: 'regla', source: 'temp', label: '', colorOn: '#ef4444', colorOff: '#4b5563', rules: [{ op: '>', value: 30, level: 'danger', message: 'Cocina caliente' }], showTitle: false, transparent: true } },
            { id: 'c_dorm', type: 'texto', title: 'Dormitorio', x: 160, y: 470, w: 380, h: 60, props: { text: 'Humedad: {humedad|0} %', size: 26, color: '#1f2937', bold: false, showTitle: false, transparent: true } },
            { id: 'c_led_dorm', type: 'luz', title: 'Luz dormitorio', x: 160, y: 540, w: 60, h: 60, props: { mode: 'regla', source: 'humedad', label: '', colorOn: '#3b82f6', colorOff: '#4b5563', rules: [{ op: '>', value: 80, level: 'warn', message: 'Mucha humedad en el dormitorio' }], showTitle: false, transparent: true } },
            { id: 'c_living', type: 'medidor', title: 'Luz living', x: 620, y: 160, w: 220, h: 180, props: { source: 'luz', min: 0, max: 255, unit: '', decimals: 0, color: '#f59e0b', rules: [{ op: '<', value: 40, level: 'warn', message: 'Living a oscuras' }], transparent: true } },
            { id: 'c_inv', type: 'barra', title: 'Invernadero', x: 940, y: 440, w: 160, h: 180, props: { source: 'temp', min: 0, max: 50, orientation: 'v', unit: '°', color: '#22c55e', rules: [{ op: '>', value: 32, level: 'danger', message: 'Invernadero: ventilar' }], transparent: true } },
            { id: 'c_flecha', type: 'flecha', title: 'Sensor', x: 480, y: 440, w: 200, h: 140, props: { ax: 0, ay: 0, bx: 1, by: 1, color: '#e5484d', width: 4, head: 'end', dash: false, label: 'sensor de humedad', source: '', rules: [], showTitle: false, transparent: true } },
            { id: 'c_marco', type: 'marco', title: 'Zona invernadero', x: 900, y: 400, w: 240, h: 240, props: { shape: 'round', color: '#22a06b', width: 3, dash: true, fill: 0.06, label: 'zona vigilada', source: 'temp', rules: [{ op: '>', value: 32, level: 'danger', message: 'Invernadero caliente' }], showTitle: false, transparent: true } },
            { id: 'c_alarma', type: 'luz', title: 'Alarma general', x: 1180, y: 20, w: 80, h: 80, props: { mode: 'bloques', source: '', label: '', colorOn: '#ef4444', colorOff: '#4b5563', rules: [], showTitle: false, transparent: true } },
            { id: 'c_alertas', type: 'alertas', title: 'Alertas', x: 880, y: 140, w: 260, h: 200, props: { max: 5, showTime: true } },
          ]
        },
        blocks: { blocks: { languageVersion: 0, blocks: [
          { type: 'ev_datos', x: 30, y: 30, next: { block: { type: 'controls_if', extraState: { hasElse: true }, inputs: { IF0: { block: { type: 'logic_operation', fields: { OP: 'OR' }, inputs: { A: cmp('GT', val('temp'), num(30)), B: cmp('GT', val('humedad'), num(80)) } } }, DO0: { block: { type: 'pan_luz', fields: { W: 'Alarma general', ON: '1' } } }, ELSE: { block: { type: 'pan_luz', fields: { W: 'Alarma general', ON: '0' } } } } } } },
        ] } },
      }
    },
    {
      name: 'Cámara + Teachable Machine', desc: 'Reconoce clases con la cámara y las muestra en el panel. Pegá la URL de tu modelo.',
      project: {
        app: 'microbit-panel-lab', version: 1, name: 'Cámara inteligente',
        sim: { vars: [{ name: 'luz', min: 0, max: 255 }] },
        dashboard: {
          width: 1280, height: 720, background: { color: '#ecfeff', image: '', fit: 'cover' },
          widgets: [
            { id: 'k_t', type: 'texto', title: 'Título', x: 40, y: 20, w: 900, h: 60, props: { text: 'Cámara + Teachable Machine', size: 30, color: '#1c1f26', bold: true, showTitle: false, transparent: true } },
            { id: 'k_cam', type: 'camara', title: 'Cámara', x: 40, y: 100, w: 460, h: 460, props: { modelUrl: '', mirror: true, showPreds: true, interval: 300 } },
            { id: 'k_txt', type: 'texto', title: 'Resultado', x: 520, y: 100, w: 720, h: 100, props: { text: 'Veo: {camara_clase}  ({camara_confianza} %)', size: 34, color: '#1c1f26', bold: true, showTitle: false, transparent: false } },
            { id: 'k_conf', type: 'medidor', title: 'Confianza', x: 520, y: 220, w: 220, h: 220, props: { source: 'camara_confianza', min: 0, max: 100, unit: '%', decimals: 0, color: '#06b6d4', rules: [] } },
            { id: 'k_led', type: 'luz', title: 'Detectado', x: 760, y: 220, w: 220, h: 220, props: { mode: 'bloques', source: '', label: 'Clase 1', colorOn: '#22c55e', colorOff: '#4b5563', rules: [] } },
            { id: 'k_al', type: 'alertas', title: 'Alertas', x: 1000, y: 220, w: 240, h: 340, props: { max: 6, showTime: true } },
            { id: 'k_help', type: 'texto', title: 'Ayuda', x: 520, y: 460, w: 460, h: 100, props: { text: '1) Entrená un modelo en teachablemachine.withgoogle.com\n2) Exportar → Subir modelo → copiar el enlace\n3) Pegalo en las propiedades del widget Cámara e iniciá la cámara', size: 14, color: '#7a8090', showTitle: false, transparent: true } },
          ]
        },
        blocks: { blocks: { languageVersion: 0, blocks: [
          { type: 'ev_camara', x: 30, y: 30, fields: { CLS: 'Clase 1' }, next: { block: { type: 'pan_luz', fields: { W: 'Detectado', ON: '1' }, next: { block: { type: 'mb_enviar', inputs: { TXT: txt('clase:1') }, next: { block: { type: 'al_alerta', fields: { LVL: 'info' }, inputs: { MSG: txt('¡Detecté la Clase 1!') } } } } } } } },
          { type: 'ev_camara', x: 30, y: 260, fields: { CLS: 'Clase 2' }, next: { block: { type: 'pan_luz', fields: { W: 'Detectado', ON: '0' }, next: { block: { type: 'mb_enviar', inputs: { TXT: txt('clase:2') } } } } } },
        ] } },
      }
    },
  ];

  Examples.push({
    name: 'ML - micro:bit por serial', desc: 'Recibe la clase detectada por ML - micro:bit (Bluetooth → micro:bit → serial) y la muestra con luces, medidor y alertas.',
    project: {
      app: 'microbit-panel-lab', version: 1, name: 'ML - micro:bit por serial',
      sim: { vars: [{ name: 'clase', min: 0, max: 0, values: ['Arriba', 'Abajo', 'Nada'] }, { name: 'certeza', min: 60, max: 100 }] },
      dashboard: {
        width: 1280, height: 720, background: { color: '#f3f6f4', image: '', fit: 'cover' },
        widgets: [
          { id: 'm_t', type: 'texto', title: 'Título', x: 40, y: 20, w: 900, h: 60, props: { text: 'ML - micro:bit → panel por serial', size: 30, color: '#1c1f26', bold: true, showTitle: false, transparent: true } },
          { id: 'm_ver', type: 'texto', title: 'Detectado', x: 40, y: 100, w: 700, h: 120, props: { text: 'Veo: {clase}', size: 56, color: '#1c1f26', bold: true, align: 'center', showTitle: false, transparent: false } },
          { id: 'm_cert', type: 'medidor', title: 'Certeza', x: 780, y: 100, w: 220, h: 220, props: { source: 'certeza', min: 0, max: 100, unit: '%', decimals: 0, color: '#009f95', rules: [{ op: '<', value: 70, level: 'warn', message: 'Certeza baja: capturá más muestras' }] } },
          { id: 'm_l1', type: 'luz', title: 'Arriba', x: 40, y: 240, w: 220, h: 220, props: { mode: 'regla', source: 'clase', label: 'Arriba', colorOn: '#22a06b', colorOff: '#4b5563', rules: [{ op: '=', value: 'Arriba', level: 'ok', message: '' }] } },
          { id: 'm_l2', type: 'luz', title: 'Abajo', x: 280, y: 240, w: 220, h: 220, props: { mode: 'regla', source: 'clase', label: 'Abajo', colorOn: '#2f6fed', colorOff: '#4b5563', rules: [{ op: '=', value: 'Abajo', level: 'info', message: 'Detectado: Abajo' }] } },
          { id: 'm_l3', type: 'luz', title: 'Nada', x: 520, y: 240, w: 220, h: 220, props: { mode: 'regla', source: 'clase', label: 'Nada', colorOn: '#9ca3af', colorOff: '#4b5563', rules: [{ op: '=', value: 'Nada', level: 'ok', message: '' }] } },
          { id: 'm_al', type: 'alertas', title: 'Alertas', x: 1020, y: 100, w: 220, h: 360, props: { max: 6, showTime: true } },
          { id: 'm_con', type: 'consola', title: 'Serial', x: 780, y: 340, w: 220, h: 120, props: { max: 20, showSend: false } },
          { id: 'm_help', type: 'texto', title: 'Ayuda', x: 40, y: 480, w: 1200, h: 200, props: { text: 'Cómo funciona: 1) En IA · ML micro:bit entrená un modelo y conectá el micro:bit por Bluetooth.  2) Cargá en el micro:bit el programa de Herramientas → Cómo conectar ML - micro:bit (reenvía "clase:NOMBRE,certeza:NN" por el cable).  3) Acá, Conectar micro:bit (USB).\nCambiá los nombres de las luces y sus reglas (= nombre de la clase) por las clases de tu modelo.', size: 15, color: '#7a8090', showTitle: false, transparent: true } },
        ]
      },
      blocks: { blocks: { languageVersion: 0, blocks: [
        { type: 'ev_cambia', x: 30, y: 30, fields: { VAR: 'clase' }, next: { block: { type: 'al_sonido', fields: { S: 'beep' }, next: { block: { type: 'al_hablar', inputs: { TXT: { block: { type: 'sen_valor', fields: { VAR: 'clase' } } } } } } } } },
        { type: 'ev_cambia', x: 30, y: 260, fields: { VAR: 'clase' }, next: { block: { type: 'controls_if', inputs: { IF0: cmp('EQ', val('clase'), txt('Arriba')), DO0: { block: { type: 'mb_enviar', inputs: { TXT: txt('led:1') } } } } } } },
      ] } },
    }
  });

  global.Examples = Examples;
})(window);
