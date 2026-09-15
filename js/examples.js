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
      name: '🌡️ Estación meteorológica', desc: 'Temperatura y luz con medidores, gráfico, luz de alerta y reglas.',
      project: {
        app: 'microbit-panel-lab', version: 1, name: 'Estación meteorológica',
        sim: { vars: [{ name: 'temp', min: 15, max: 38 }, { name: 'luz', min: 0, max: 255 }] },
        dashboard: {
          width: 1280, height: 720, background: { color: '#eef2f7', image: '', fit: 'cover' },
          widgets: [
            { id: 'w_titulo', type: 'texto', title: 'Título', x: 40, y: 20, w: 700, h: 60, props: { text: 'Estación meteorológica 🌤️  —  {hora}', size: 34, color: '#1e3a8a', align: 'left', bold: true, showTitle: false, transparent: true } },
            { id: 'w_temp', type: 'valor', title: 'Temperatura', x: 40, y: 100, w: 260, h: 160, props: { source: 'temp', unit: '°C', decimals: 1, color: '#111827', rules: [{ op: '>', value: 32, level: 'danger', message: '¡Hace mucho calor!' }, { op: '>', value: 28, level: 'warn', message: 'Temperatura alta' }, { op: '<', value: 17, level: 'info', message: 'Hace frío' }] } },
            { id: 'w_luz', type: 'medidor', title: 'Luz', x: 320, y: 100, w: 260, h: 160, props: { source: 'luz', min: 0, max: 255, unit: '', decimals: 0, color: '#f59e0b', rules: [{ op: '<', value: 40, level: 'warn', message: 'Está oscuro' }] } },
            { id: 'w_led', type: 'luz', title: 'Alerta calor', x: 600, y: 100, w: 140, h: 160, props: { mode: 'bloques', source: 'temp', label: 'Calor', colorOn: '#ef4444', colorOff: '#4b5563', rules: [], showTitle: true } },
            { id: 'w_graf', type: 'grafico', title: 'Historial', x: 40, y: 280, w: 700, h: 300, props: { sources: 'temp,luz', maxPoints: 80, minY: '', maxY: '', showLegend: true, fill: true } },
            { id: 'w_alertas', type: 'alertas', title: 'Alertas', x: 780, y: 100, w: 460, h: 300, props: { max: 8, showTime: true } },
            { id: 'w_tabla', type: 'tabla', title: 'Variables recibidas', x: 780, y: 420, w: 220, h: 160, props: { filter: '' } },
            { id: 'w_consola', type: 'consola', title: 'Consola', x: 1020, y: 420, w: 220, h: 160, props: { max: 30, showSend: false } },
            { id: 'w_pie', type: 'texto', title: 'Pie', x: 40, y: 600, w: 1200, h: 60, props: { text: 'Promedio de temperatura: {temp_prom|1} °C   •   Máximo: {temp_max|1} °C', size: 22, color: '#374151', align: 'center', bold: false, showTitle: false, transparent: true } },
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
      name: '💡 Control de luz y botones', desc: 'Botones e interruptor que envían órdenes al micro:bit, barra de luz y alarma por oscuridad.',
      project: {
        app: 'microbit-panel-lab', version: 1, name: 'Control de luz',
        sim: { vars: [{ name: 'luz', min: 0, max: 255 }, { name: 'sonido', min: 0, max: 255 }] },
        dashboard: {
          width: 1280, height: 720, background: { color: '#fdf6e3', image: '', fit: 'cover' },
          widgets: [
            { id: 'w_t', type: 'texto', title: 'Título', x: 40, y: 20, w: 800, h: 60, props: { text: 'Control de luz 💡', size: 34, color: '#7c2d12', bold: true, showTitle: false, transparent: true } },
            { id: 'w_barra', type: 'barra', title: 'Luz ambiente', x: 40, y: 100, w: 140, h: 320, props: { source: 'luz', min: 0, max: 255, orientation: 'v', unit: '', color: '#f59e0b', rules: [{ op: '<', value: 50, level: 'warn', message: 'Está oscuro: encendé la luz' }] } },
            { id: 'w_son', type: 'medidor', title: 'Sonido', x: 200, y: 100, w: 260, h: 180, props: { source: 'sonido', min: 0, max: 255, unit: '', decimals: 0, color: '#8b5cf6', rules: [{ op: '>', value: 200, level: 'danger', message: '¡Mucho ruido!' }] } },
            { id: 'w_on', type: 'boton', title: 'Encender', x: 500, y: 100, w: 200, h: 80, props: { label: '💡 Encender LED', color: '#16a34a', send: 'led:1', showTitle: false, transparent: true } },
            { id: 'w_off', type: 'boton', title: 'Apagar', x: 500, y: 200, w: 200, h: 80, props: { label: '🌑 Apagar LED', color: '#6b7280', send: 'led:0', showTitle: false, transparent: true } },
            { id: 'w_sw', type: 'interruptor', title: 'Modo automático', x: 500, y: 300, w: 260, h: 90, props: { variable: 'auto', send: false, labelOn: 'Automático', labelOff: 'Manual', color: '#2563eb' } },
            { id: 'w_sl', type: 'deslizador', title: 'Brillo', x: 500, y: 410, w: 260, h: 90, props: { variable: 'brillo', min: 0, max: 255, step: 5, send: true, color: '#f59e0b' } },
            { id: 'w_led', type: 'luz', title: 'Estado LED', x: 740, y: 100, w: 140, h: 160, props: { mode: 'bloques', source: '', label: 'LED', colorOn: '#facc15', colorOff: '#4b5563', rules: [] } },
            { id: 'w_con', type: 'consola', title: 'Consola serial', x: 900, y: 100, w: 340, h: 300, props: { max: 40, showSend: true } },
            { id: 'w_al', type: 'alertas', title: 'Alertas', x: 900, y: 420, w: 340, h: 260, props: { max: 6, showTime: true } },
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
      name: '🏠 Casa inteligente (imagen de fondo)', desc: 'Plano de una casa como fondo, con luces indicadoras y valores ubicados en cada habitación.',
      project: {
        app: 'microbit-panel-lab', version: 1, name: 'Casa inteligente',
        sim: { vars: [{ name: 'temp', min: 15, max: 36 }, { name: 'luz', min: 0, max: 255 }, { name: 'humedad', min: 20, max: 95 }] },
        dashboard: {
          width: 1280, height: 720, background: { color: '#f3f4f6', image: planoSVG, fit: 'contain' },
          widgets: [
            { id: 'c_t', type: 'texto', title: 'Título', x: 130, y: 10, w: 900, h: 50, props: { text: '🏠 Casa inteligente  —  monitoreo por habitación', size: 26, color: '#111827', bold: true, showTitle: false, transparent: true } },
            { id: 'c_cocina', type: 'valor', title: 'Temp cocina', x: 220, y: 170, w: 240, h: 110, props: { source: 'temp', unit: '°C', decimals: 1, color: '#111827', rules: [{ op: '>', value: 30, level: 'danger', message: '¡Cocina muy caliente!' }], transparent: true, showTitle: true } },
            { id: 'c_led_cocina', type: 'luz', title: 'Luz cocina', x: 160, y: 130, w: 60, h: 60, props: { mode: 'regla', source: 'temp', label: '', colorOn: '#ef4444', colorOff: '#4b5563', rules: [{ op: '>', value: 30, level: 'danger', message: 'Cocina caliente' }], showTitle: false, transparent: true } },
            { id: 'c_dorm', type: 'texto', title: 'Dormitorio', x: 160, y: 470, w: 380, h: 60, props: { text: 'Humedad: {humedad|0} %', size: 26, color: '#1f2937', bold: false, showTitle: false, transparent: true } },
            { id: 'c_led_dorm', type: 'luz', title: 'Luz dormitorio', x: 160, y: 540, w: 60, h: 60, props: { mode: 'regla', source: 'humedad', label: '', colorOn: '#3b82f6', colorOff: '#4b5563', rules: [{ op: '>', value: 80, level: 'warn', message: 'Mucha humedad en el dormitorio' }], showTitle: false, transparent: true } },
            { id: 'c_living', type: 'medidor', title: 'Luz living', x: 640, y: 150, w: 220, h: 170, props: { source: 'luz', min: 0, max: 255, unit: '', decimals: 0, color: '#f59e0b', rules: [{ op: '<', value: 40, level: 'warn', message: 'Living a oscuras' }], transparent: true } },
            { id: 'c_inv', type: 'barra', title: 'Invernadero', x: 940, y: 440, w: 140, h: 180, props: { source: 'temp', min: 0, max: 50, orientation: 'v', unit: '°', color: '#22c55e', rules: [{ op: '>', value: 32, level: 'danger', message: 'Invernadero: ventilar' }], transparent: true } },
            { id: 'c_alarma', type: 'luz', title: 'Alarma general', x: 1180, y: 20, w: 80, h: 80, props: { mode: 'bloques', source: '', label: '', colorOn: '#ef4444', colorOff: '#4b5563', rules: [], showTitle: false, transparent: true } },
            { id: 'c_alertas', type: 'alertas', title: 'Alertas', x: 880, y: 90, w: 280, h: 240, props: { max: 5, showTime: true } },
          ]
        },
        blocks: { blocks: { languageVersion: 0, blocks: [
          { type: 'ev_datos', x: 30, y: 30, next: { block: { type: 'controls_if', extraState: { hasElse: true }, inputs: { IF0: { block: { type: 'logic_operation', fields: { OP: 'OR' }, inputs: { A: cmp('GT', val('temp'), num(30)), B: cmp('GT', val('humedad'), num(80)) } } }, DO0: { block: { type: 'pan_luz', fields: { W: 'Alarma general', ON: '1' } } }, ELSE: { block: { type: 'pan_luz', fields: { W: 'Alarma general', ON: '0' } } } } } } },
        ] } },
      }
    },
    {
      name: '📷 Cámara + Teachable Machine', desc: 'Reconoce clases con la cámara y las muestra en el panel. Pegá la URL de tu modelo.',
      project: {
        app: 'microbit-panel-lab', version: 1, name: 'Cámara inteligente',
        sim: { vars: [{ name: 'luz', min: 0, max: 255 }] },
        dashboard: {
          width: 1280, height: 720, background: { color: '#ecfeff', image: '', fit: 'cover' },
          widgets: [
            { id: 'k_t', type: 'texto', title: 'Título', x: 40, y: 20, w: 900, h: 60, props: { text: '📷 Cámara + Teachable Machine', size: 34, color: '#0e7490', bold: true, showTitle: false, transparent: true } },
            { id: 'k_cam', type: 'camara', title: 'Cámara', x: 40, y: 100, w: 400, h: 420, props: { modelUrl: '', mirror: true, showPreds: true, interval: 300 } },
            { id: 'k_txt', type: 'texto', title: 'Resultado', x: 480, y: 100, w: 760, h: 90, props: { text: 'Veo: {camara_clase}  ({camara_confianza} %)', size: 40, color: '#111827', bold: true, showTitle: false, transparent: false } },
            { id: 'k_conf', type: 'medidor', title: 'Confianza', x: 480, y: 210, w: 260, h: 180, props: { source: 'camara_confianza', min: 0, max: 100, unit: '%', decimals: 0, color: '#06b6d4', rules: [] } },
            { id: 'k_led', type: 'luz', title: 'Detectado', x: 760, y: 210, w: 160, h: 180, props: { mode: 'bloques', source: '', label: 'Clase 1', colorOn: '#22c55e', colorOff: '#4b5563', rules: [] } },
            { id: 'k_al', type: 'alertas', title: 'Alertas', x: 940, y: 210, w: 300, h: 310, props: { max: 6, showTime: true } },
            { id: 'k_help', type: 'texto', title: 'Ayuda', x: 480, y: 410, w: 440, h: 110, props: { text: '1) Entrená un modelo en teachablemachine.withgoogle.com (Proyecto de imagen)\n2) Exportar → Subir modelo → copiar el enlace\n3) Pegalo en las propiedades del widget Cámara y presioná ▶ Iniciar cámara', size: 15, color: '#374151', showTitle: false, transparent: true } },
          ]
        },
        blocks: { blocks: { languageVersion: 0, blocks: [
          { type: 'ev_camara', x: 30, y: 30, fields: { CLS: 'Clase 1' }, next: { block: { type: 'pan_luz', fields: { W: 'Detectado', ON: '1' }, next: { block: { type: 'mb_enviar', inputs: { TXT: txt('clase:1') }, next: { block: { type: 'al_alerta', fields: { LVL: 'info' }, inputs: { MSG: txt('¡Detecté la Clase 1!') } } } } } } } },
          { type: 'ev_camara', x: 30, y: 260, fields: { CLS: 'Clase 2' }, next: { block: { type: 'pan_luz', fields: { W: 'Detectado', ON: '0' }, next: { block: { type: 'mb_enviar', inputs: { TXT: txt('clase:2') } } } } } },
        ] } },
      }
    },
  ];

  global.Examples = Examples;
})(window);
