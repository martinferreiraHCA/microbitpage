/* ==========================================================================
   widgets.js — Panel de monitoreo: widgets arrastrables/redimensionables,
   editor de propiedades, reglas de alerta, fondo con imagen y escalado.
   ========================================================================== */
(function (global) {
  'use strict';

  const LEVEL_COLOR = { ok: '#22c55e', info: '#3b82f6', warn: '#f59e0b', danger: '#ef4444' };
  const LEVEL_NAME = { ok: 'Normal', info: 'Info', warn: 'Aviso', danger: 'Peligro' };
  const SERIES_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#84cc16'];

  /* ---------- Alertas ---------- */
  const Alerts = {
    list: [], max: 60, sound: true,
    raise(a) {
      a = Object.assign({ level: 'info', message: '', source: '', time: Date.now() }, a);
      this.list.push(a); if (this.list.length > this.max) this.list.shift();
      Bus.emit('alert', a);
      if (!Dashboard.byType('alertas').length) Util.toast(a.message, a.level === 'danger' ? 'error' : a.level === 'warn' ? 'warn' : a.level === 'ok' ? 'ok' : 'info');
      if (this.sound && a.level === 'danger') Util.beep('peligro');
      else if (this.sound && a.level === 'warn') Util.beep('alarma');
      return a;
    },
    clear() { this.list = []; Bus.emit('alerts:cleared'); }
  };

  /** Evalúa reglas [{op, value, level, message}] contra un valor. Devuelve la primera regla que cumple. */
  function matchRule(rules, v) {
    if (!rules || !rules.length) return null;
    const n = +v; const s = String(v);
    for (const r of rules) {
      const rv = r.value; const rn = +rv;
      let ok = false;
      switch (r.op) {
        case '>': ok = n > rn; break; case '>=': ok = n >= rn; break;
        case '<': ok = n < rn; break; case '<=': ok = n <= rn; break;
        case '=': ok = (!isNaN(n) && !isNaN(rn) && n === rn) || s === String(rv); break;
        case '!=': ok = !((!isNaN(n) && !isNaN(rn) && n === rn) || s === String(rv)); break;
        case 'contiene': ok = s.indexOf(String(rv)) >= 0; break;
        case 'entre': { const [a, b] = String(rv).split(/[,\-;]/).map(Number); ok = n >= Math.min(a, b) && n <= Math.max(a, b); break; }
      }
      if (ok) return r;
    }
    return null;
  }

  /** Reemplaza {var} y {var|decimales} dentro de un texto. */
  function template(text) {
    return String(text == null ? '' : text).replace(/\{([A-Za-z_][\w.\-]*)(?:\|(\d))?\}/g, (m, name, dec) => {
      if (name === 'hora') return new Date().toLocaleTimeString();
      if (!Vars.has(name)) return '—';
      return Util.fmt(Vars.get(name), dec != null ? +dec : undefined);
    });
  }

  function fitText(el, text, w, h, max) {
    const len = Math.max(1, String(text).length);
    const size = Math.max(10, Math.min(max || h * 0.7, h * 0.7, (w * 1.7) / len));
    el.style.fontSize = size + 'px';
  }

  /* ---------- Esquema común de propiedades ---------- */
  const RULE_FIELD = { key: 'rules', label: 'Reglas de alerta', type: 'rules', help: 'Se evalúa la primera regla que se cumpla. Cambia el color y genera una alerta.' };
  const COMMON_TAIL = [
    { key: 'showTitle', label: 'Mostrar título', type: 'checkbox' },
  ];

  /* ---------- Tipos de widgets ---------- */
  const Types = {
    valor: {
      name: 'Valor numérico', icon: '🔢', w: 220, h: 220,
      props: { source: 'temp', unit: '', decimals: 1, color: '#111827', rules: [] },
      schema: [
        { key: 'source', label: 'Variable (sensor)', type: 'var' },
        { key: 'unit', label: 'Unidad', type: 'text' },
        { key: 'decimals', label: 'Decimales', type: 'number', min: 0, max: 4 },
        { key: 'color', label: 'Color del texto', type: 'color' },
        RULE_FIELD,
      ],
      render(body) { body.innerHTML = '<div class="v-big"><span class="v-num">—</span><span class="v-unit"></span></div><div class="v-msg" hidden></div>'; },
      update(body, w, r) {
        const v = Vars.has(w.props.source) ? Vars.get(w.props.source) : null;
        const txt = v == null ? '—' : Util.fmt(v, w.props.decimals);
        body.querySelector('.v-num').textContent = txt;
        body.querySelector('.v-unit').textContent = w.props.unit || '';
        const num = body.querySelector('.v-num');
        num.style.color = r.rule ? LEVEL_COLOR[r.rule.level] : (w.props.color || '#111827');
        const msg = body.querySelector('.v-msg'); msg.textContent = r.rule ? r.rule.message : ''; msg.hidden = !r.rule;
        fitText(body.querySelector('.v-big'), txt + (w.props.unit ? ' ' + w.props.unit : ''), r.w, r.h - (r.rule ? 18 : 0), 96);
      }
    },
    medidor: {
      name: 'Medidor', icon: '🎚️', w: 220, h: 220,
      props: { source: 'temp', min: 0, max: 100, unit: '', decimals: 0, color: '#3b82f6', rules: [] },
      schema: [
        { key: 'source', label: 'Variable (sensor)', type: 'var' },
        { key: 'min', label: 'Mínimo', type: 'number' }, { key: 'max', label: 'Máximo', type: 'number' },
        { key: 'unit', label: 'Unidad', type: 'text' }, { key: 'decimals', label: 'Decimales', type: 'number', min: 0, max: 4 },
        { key: 'color', label: 'Color', type: 'color' }, RULE_FIELD,
      ],
      render(body) {
        body.innerHTML = `<svg class="gauge" viewBox="0 0 200 120"><path class="g-bg" d="M20 110 A80 80 0 0 1 180 110" /><path class="g-fg" d="M20 110 A80 80 0 0 1 180 110" /><text class="g-val" x="100" y="100" text-anchor="middle">—</text><text class="g-min" x="20" y="118" text-anchor="middle"></text><text class="g-max" x="180" y="118" text-anchor="middle"></text></svg><div class="v-msg"></div>`;
      },
      update(body, w, r) {
        const p = w.props, v = Vars.has(p.source) ? +Vars.get(p.source) : NaN;
        const min = +p.min || 0, max = +p.max || 100;
        const frac = isNaN(v) ? 0 : Util.clamp((v - min) / (max - min || 1), 0, 1);
        const L = Math.PI * 80;
        const fg = body.querySelector('.g-fg');
        fg.style.strokeDasharray = L; fg.style.strokeDashoffset = L * (1 - frac);
        fg.style.stroke = r.rule ? LEVEL_COLOR[r.rule.level] : (p.color || '#3b82f6');
        body.querySelector('.g-val').textContent = (isNaN(v) ? '—' : Util.fmt(v, p.decimals)) + (p.unit || '');
        body.querySelector('.g-min').textContent = min; body.querySelector('.g-max').textContent = max;
        body.querySelector('.v-msg').textContent = r.rule ? r.rule.message : '';
      }
    },
    barra: {
      name: 'Barra de nivel', icon: '📊', w: 220, h: 220,
      props: { source: 'luz', min: 0, max: 255, orientation: 'v', unit: '', color: '#22c55e', rules: [] },
      schema: [
        { key: 'source', label: 'Variable (sensor)', type: 'var' },
        { key: 'min', label: 'Mínimo', type: 'number' }, { key: 'max', label: 'Máximo', type: 'number' },
        { key: 'orientation', label: 'Orientación', type: 'select', options: [['v', 'Vertical'], ['h', 'Horizontal']] },
        { key: 'unit', label: 'Unidad', type: 'text' }, { key: 'color', label: 'Color', type: 'color' }, RULE_FIELD,
      ],
      render(body) { body.innerHTML = '<div class="bar-wrap"><div class="bar-fill"></div><div class="bar-label">—</div></div>'; },
      update(body, w, r) {
        const p = w.props, v = Vars.has(p.source) ? +Vars.get(p.source) : NaN;
        const frac = isNaN(v) ? 0 : Util.clamp((v - +p.min) / ((+p.max - +p.min) || 1), 0, 1);
        const wrap = body.querySelector('.bar-wrap'); wrap.classList.toggle('horizontal', p.orientation === 'h');
        const fill = body.querySelector('.bar-fill');
        if (p.orientation === 'h') { fill.style.width = (frac * 100) + '%'; fill.style.height = '100%'; }
        else { fill.style.height = (frac * 100) + '%'; fill.style.width = '100%'; }
        fill.style.background = r.rule ? LEVEL_COLOR[r.rule.level] : (p.color || '#22c55e');
        body.querySelector('.bar-label').textContent = (isNaN(v) ? '—' : Util.fmt(v, 0)) + (p.unit || '');
      }
    },
    grafico: {
      name: 'Gráfico', icon: '📈', w: 460, h: 220,
      props: { sources: 'temp,luz', maxPoints: 60, minY: '', maxY: '', showLegend: true, fill: true },
      schema: [
        { key: 'sources', label: 'Variables (separadas por coma)', type: 'text', help: 'Ej: temp,luz' },
        { key: 'maxPoints', label: 'Cantidad de puntos', type: 'number', min: 5, max: 600 },
        { key: 'minY', label: 'Eje Y mínimo (vacío = auto)', type: 'text' }, { key: 'maxY', label: 'Eje Y máximo (vacío = auto)', type: 'text' },
        { key: 'showLegend', label: 'Mostrar leyenda', type: 'checkbox' }, { key: 'fill', label: 'Rellenar área', type: 'checkbox' },
      ],
      render(body) { body.innerHTML = '<canvas class="chart"></canvas><div class="chart-legend"></div>'; },
      update(body, w, r) {
        const p = w.props, cv = body.querySelector('canvas');
        const W = Math.max(50, r.w - 8), H = Math.max(40, r.h - 8 - (p.showLegend ? 22 : 0));
        if (cv.width !== W * 2 || cv.height !== H * 2) { cv.width = W * 2; cv.height = H * 2; cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
        const ctx = cv.getContext('2d'); ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.clearRect(0, 0, W, H);
        const names = String(p.sources || '').split(',').map(s => s.trim()).filter(Boolean);
        const n = Math.max(5, +p.maxPoints || 60);
        const series = names.map(name => (Vars.history[name] || []).slice(-n).map(pt => +pt.v).filter(x => !isNaN(x)));
        let all = series.flat();
        let lo = p.minY !== '' && p.minY != null && !isNaN(+p.minY) ? +p.minY : (all.length ? Math.min(...all) : 0);
        let hi = p.maxY !== '' && p.maxY != null && !isNaN(+p.maxY) ? +p.maxY : (all.length ? Math.max(...all) : 100);
        if (hi === lo) { hi = lo + 1; lo = lo - 1; }
        const pad = { l: 38, r: 8, t: 8, b: 18 }; const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
        ctx.strokeStyle = 'rgba(120,130,150,.25)'; ctx.lineWidth = 1; ctx.fillStyle = '#6b7280'; ctx.font = '10px system-ui';
        for (let i = 0; i <= 4; i++) {
          const y = pad.t + ph * i / 4; ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
          ctx.textAlign = 'right'; ctx.fillText(Util.fmt(hi - (hi - lo) * i / 4, 1), pad.l - 4, y + 3);
        }
        ctx.textAlign = 'center'; ctx.fillText('últimos ' + n + ' valores', pad.l + pw / 2, H - 4);
        series.forEach((s, si) => {
          if (!s.length) return;
          const col = SERIES_COLORS[si % SERIES_COLORS.length];
          ctx.beginPath();
          s.forEach((v, i) => { const x = pad.l + pw * (i / Math.max(1, n - 1)); const y = pad.t + ph * (1 - (v - lo) / (hi - lo)); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
          ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
          if (p.fill) { const lastX = pad.l + pw * ((s.length - 1) / Math.max(1, n - 1)); ctx.lineTo(lastX, pad.t + ph); ctx.lineTo(pad.l, pad.t + ph); ctx.closePath(); ctx.fillStyle = col + '22'; ctx.fill(); }
        });
        const lg = body.querySelector('.chart-legend'); lg.hidden = !p.showLegend;
        if (p.showLegend) lg.innerHTML = names.map((nm, i) => `<span><i style="background:${SERIES_COLORS[i % SERIES_COLORS.length]}"></i>${Util.esc(nm)} ${Vars.has(nm) ? Util.esc(Util.fmt(Vars.get(nm), 1)) : ''}</span>`).join('');
      }
    },
    luz: {
      name: 'Luz indicadora', icon: '💡', w: 160, h: 160,
      props: { source: 'temp', mode: 'regla', colorOn: '#22c55e', colorOff: '#4b5563', label: '', rules: [{ op: '>', value: 30, level: 'danger', message: '¡Valor alto!' }], showTitle: false },
      schema: [
        { key: 'mode', label: 'Se controla por', type: 'select', options: [['regla', 'Reglas sobre una variable'], ['bloques', 'Bloques (programa)']] },
        { key: 'source', label: 'Variable (sensor)', type: 'var' },
        { key: 'label', label: 'Etiqueta debajo', type: 'text' },
        { key: 'colorOn', label: 'Color encendida (bloques)', type: 'color' }, { key: 'colorOff', label: 'Color apagada', type: 'color' },
        RULE_FIELD,
      ],
      render(body) { body.innerHTML = '<div class="led"><div class="led-dot"></div><div class="led-label"></div></div>'; },
      update(body, w, r) {
        const p = w.props, st = w.state;
        let on, color;
        if (p.mode === 'bloques') { on = !!st.on; color = st.color || p.colorOn; }
        else { on = !!r.rule; color = r.rule ? LEVEL_COLOR[r.rule.level] : p.colorOn; }
        const dot = body.querySelector('.led-dot');
        const label = p.label || (p.mode === 'regla' && r.rule ? r.rule.message : '');
        const showLabel = !!label && r.h >= 60;
        const size = Math.max(14, Math.min(r.w, r.h - (showLabel ? 20 : 0)) * 0.62);
        dot.style.width = dot.style.height = size + 'px';
        dot.style.background = on ? color : p.colorOff; dot.style.boxShadow = on ? `0 0 ${size / 3}px ${color}66` : 'inset 0 2px 6px rgba(0,0,0,.25)';
        const lab = body.querySelector('.led-label'); lab.textContent = showLabel ? label : ''; lab.hidden = !showLabel;
      }
    },
    texto: {
      name: 'Texto', icon: '🔤', w: 460, h: 60,
      props: { text: 'Temperatura: {temp} °C', size: 24, color: '#111827', align: 'left', bold: false, bg: '', showTitle: false, transparent: true },
      schema: [
        { key: 'text', label: 'Texto (usá {variable} para insertar valores, {variable|1} con decimales, {hora})', type: 'textarea' },
        { key: 'size', label: 'Tamaño de letra', type: 'number', min: 8, max: 160 },
        { key: 'color', label: 'Color', type: 'color' }, { key: 'bg', label: 'Color de fondo (vacío = ninguno)', type: 'text' },
        { key: 'align', label: 'Alineación', type: 'select', options: [['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha']] },
        { key: 'bold', label: 'Negrita', type: 'checkbox' },
      ],
      render(body) { body.innerHTML = '<div class="txt"></div>'; },
      update(body, w) {
        const p = w.props, el = body.querySelector('.txt');
        const txt = w.state.text != null ? template(w.state.text) : template(p.text);
        if (el.textContent !== txt) el.textContent = txt;
        el.style.fontSize = (p.size || 24) + 'px'; el.style.color = w.state.color || p.color; el.style.textAlign = p.align; el.style.fontWeight = p.bold ? '700' : '400';
        el.style.background = p.bg || 'transparent';
      }
    },
    boton: {
      name: 'Botón', icon: '🔘', w: 220, h: 120,
      props: { label: 'Encender', color: '#3b82f6', send: 'led:1', showTitle: false, transparent: true },
      schema: [
        { key: 'label', label: 'Texto del botón', type: 'text' }, { key: 'color', label: 'Color', type: 'color' },
        { key: 'send', label: 'Enviar al micro:bit al presionar (vacío = nada)', type: 'text', help: 'Ej: led:1  — además dispara el evento "cuando se presiona el botón" en los bloques.' },
      ],
      render(body, w) {
        body.innerHTML = '<button class="btn-widget"></button>';
        body.querySelector('button').addEventListener('click', () => {
          if (Dashboard.editMode) return;
          Util.beep('click');
          if (w.props.send) Serial.send(w.props.send);
          Vars.set('boton_' + (w.title || w.id).replace(/\W+/g, '_').toLowerCase(), 1, 'panel');
          Bus.emit('widget:button', w.id, w);
        });
      },
      update(body, w, r) { const b = body.querySelector('button'); b.textContent = w.state.text != null ? w.state.text : w.props.label; b.style.background = w.state.color || w.props.color; b.style.fontSize = Math.max(12, Math.min(r.h * 0.38, (r.w * 1.6) / Math.max(4, b.textContent.length), 28)) + 'px'; }
    },
    deslizador: {
      name: 'Deslizador', icon: '🎛️', w: 220, h: 120,
      props: { variable: 'brillo', min: 0, max: 255, step: 1, send: true, color: '#3b82f6' },
      schema: [
        { key: 'variable', label: 'Nombre de la variable', type: 'text' },
        { key: 'min', label: 'Mínimo', type: 'number' }, { key: 'max', label: 'Máximo', type: 'number' }, { key: 'step', label: 'Paso', type: 'number' },
        { key: 'send', label: 'Enviar "variable:valor" al micro:bit', type: 'checkbox' }, { key: 'color', label: 'Color', type: 'color' },
      ],
      render(body, w) {
        body.innerHTML = '<div class="slider-wrap"><input type="range"><span class="slider-val">0</span></div>';
        const inp = body.querySelector('input');
        inp.addEventListener('input', () => { body.querySelector('.slider-val').textContent = inp.value; });
        inp.addEventListener('change', () => {
          if (Dashboard.editMode) return;
          const v = +inp.value; Vars.set(w.props.variable, v, 'panel');
          if (w.props.send) Serial.send(w.props.variable + ':' + v);
          Bus.emit('widget:control', w.id, v, w);
        });
      },
      update(body, w) { const p = w.props, inp = body.querySelector('input'); inp.min = p.min; inp.max = p.max; inp.step = p.step || 1; inp.style.accentColor = p.color; if (document.activeElement !== inp && Vars.has(p.variable)) { inp.value = Vars.get(p.variable); body.querySelector('.slider-val').textContent = inp.value; } }
    },
    interruptor: {
      name: 'Interruptor', icon: '🔛', w: 220, h: 120,
      props: { variable: 'led', send: true, labelOn: 'Encendido', labelOff: 'Apagado', color: '#22c55e' },
      schema: [
        { key: 'variable', label: 'Nombre de la variable', type: 'text' },
        { key: 'send', label: 'Enviar "variable:1/0" al micro:bit', type: 'checkbox' },
        { key: 'labelOn', label: 'Texto encendido', type: 'text' }, { key: 'labelOff', label: 'Texto apagado', type: 'text' }, { key: 'color', label: 'Color', type: 'color' },
      ],
      render(body, w) {
        body.innerHTML = '<label class="switch"><input type="checkbox"><span class="sw-track"><span class="sw-knob"></span></span><span class="sw-label"></span></label>';
        body.querySelector('input').addEventListener('change', ev => {
          if (Dashboard.editMode) { ev.target.checked = !ev.target.checked; return; }
          const v = ev.target.checked ? 1 : 0; Vars.set(w.props.variable, v, 'panel');
          if (w.props.send) Serial.send(w.props.variable + ':' + v);
          Bus.emit('widget:control', w.id, v, w);
        });
      },
      update(body, w) {
        const p = w.props, inp = body.querySelector('input');
        if (Vars.has(p.variable)) inp.checked = !!+Vars.get(p.variable);
        body.querySelector('.sw-label').textContent = inp.checked ? p.labelOn : p.labelOff;
        body.querySelector('.sw-track').style.background = inp.checked ? p.color : '#9ca3af';
      }
    },
    alertas: {
      name: 'Lista de alertas', icon: '🚨', w: 300, h: 300,
      props: { max: 8, showTime: true },
      schema: [{ key: 'max', label: 'Cantidad a mostrar', type: 'number', min: 1, max: 60 }, { key: 'showTime', label: 'Mostrar hora', type: 'checkbox' }],
      render(body) { body.innerHTML = '<div class="alert-list"></div><button class="mini clear-alerts">Limpiar</button>'; body.querySelector('.clear-alerts').addEventListener('click', () => Alerts.clear()); },
      update(body, w) {
        const list = Alerts.list.slice(-(+w.props.max || 8)).reverse();
        const html = list.map(a => `<div class="al al-${a.level}"><b>${LEVEL_NAME[a.level] || a.level}</b> ${Util.esc(a.message)}${w.props.showTime ? `<small>${new Date(a.time).toLocaleTimeString()}</small>` : ''}</div>`).join('') || '<div class="muted">Sin alertas 🙂</div>';
        const el = body.querySelector('.alert-list'); if (el.dataset.h !== String(list.length) + (list[0] && list[0].time)) { el.innerHTML = html; el.dataset.h = String(list.length) + (list[0] && list[0].time); }
      }
    },
    imagen: {
      name: 'Imagen', icon: '🖼️', w: 220, h: 220,
      props: { src: '', fit: 'contain', opacity: 1, showTitle: false, transparent: true },
      schema: [
        { key: 'src', label: 'Imagen (URL o archivo)', type: 'image' },
        { key: 'fit', label: 'Ajuste', type: 'select', options: [['contain', 'Completa'], ['cover', 'Recortar'], ['fill', 'Estirar']] },
        { key: 'opacity', label: 'Opacidad (0-1)', type: 'number', min: 0, max: 1, step: 0.1 },
      ],
      render(body) { body.innerHTML = '<img class="img-widget" alt=""><div class="muted img-empty">Elegí una imagen en propiedades</div>'; },
      update(body, w) { const img = body.querySelector('img'), p = w.props, src = w.state.src || p.src; if (img.getAttribute('src') !== (src || '')) img.src = src || ''; img.style.objectFit = p.fit; img.style.opacity = p.opacity; img.hidden = !src; body.querySelector('.img-empty').hidden = !!src; }
    },
    camara: {
      name: 'Cámara (IA)', icon: '📷', w: 320, h: 320,
      props: { modelUrl: '', mirror: true, showPreds: true, interval: 300 },
      schema: [
        { key: 'modelUrl', label: 'URL del modelo de Teachable Machine', type: 'text', help: 'Ej: https://teachablemachine.withgoogle.com/models/xxxxx/  (Exportar → Subir modelo → copiar enlace). Vacío = solo cámara.' },
        { key: 'mirror', label: 'Espejar', type: 'checkbox' }, { key: 'showPreds', label: 'Mostrar clases detectadas', type: 'checkbox' },
        { key: 'interval', label: 'Intervalo de predicción (ms)', type: 'number', min: 100, max: 5000 },
      ],
      render(body, w) {
        body.innerHTML = '<div class="cam-wrap"><video autoplay playsinline muted></video><div class="cam-overlay"><button class="mini cam-start">▶ Iniciar cámara</button></div></div><div class="cam-preds"></div>';
        body.querySelector('.cam-start').addEventListener('click', () => TM.start(w));
      },
      update(body, w) {
        const p = w.props; body.querySelector('video').style.transform = p.mirror ? 'scaleX(-1)' : 'none';
        body.querySelector('.cam-overlay').hidden = TM.running && TM.owner === w.id;
        const pr = body.querySelector('.cam-preds'); pr.hidden = !p.showPreds;
        if (p.showPreds) {
          const html = TM.preds.map(x => `<div class="pred"><span>${Util.esc(x.className)}</span><div class="pred-bar"><i style="width:${(x.probability * 100).toFixed(0)}%"></i></div><b>${(x.probability * 100).toFixed(0)}%</b></div>`).join('') || (TM.status ? `<div class="muted">${Util.esc(TM.status)}</div>` : '');
          if (pr.innerHTML !== html) pr.innerHTML = html;
        }
      }
    },
    consola: {
      name: 'Consola serial', icon: '🖥️', w: 300, h: 300,
      props: { max: 40, showSend: true },
      schema: [{ key: 'max', label: 'Líneas a mostrar', type: 'number', min: 5, max: 500 }, { key: 'showSend', label: 'Mostrar caja para enviar', type: 'checkbox' }],
      render(body, w) {
        body.innerHTML = '<pre class="console-log"></pre><form class="console-send"><input placeholder="texto para el micro:bit"><button class="mini">Enviar</button></form>';
        w.state.lines = [];
        const pre = body.querySelector('pre');
        w.state.unsub = [
          Bus.on('serial:line', (line, src) => { w.state.lines.push('◀ ' + line); w.state.lines = w.state.lines.slice(-(+w.props.max || 40)); pre.textContent = w.state.lines.join('\n'); pre.scrollTop = pre.scrollHeight; }),
          Bus.on('serial:sent', line => { w.state.lines.push('▶ ' + line); w.state.lines = w.state.lines.slice(-(+w.props.max || 40)); pre.textContent = w.state.lines.join('\n'); pre.scrollTop = pre.scrollHeight; }),
        ];
        body.querySelector('form').addEventListener('submit', ev => { ev.preventDefault(); const i = ev.target.querySelector('input'); if (i.value) Serial.send(i.value); i.value = ''; });
      },
      update(body, w) { body.querySelector('form').hidden = !w.props.showSend; },
      destroy(w) { (w.state.unsub || []).forEach(f => f()); }
    },
    flecha: {
      name: 'Flecha / línea', icon: '➚', w: 240, h: 120, annot: true, endpoints: true,
      props: { ax: 0, ay: 1, bx: 1, by: 0, color: '#e5484d', width: 4, head: 'end', dash: false, label: '', source: '', rules: [], showTitle: false, transparent: true },
      schema: [
        { key: 'head', label: 'Punta de flecha', type: 'select', options: [['end', 'Al final'], ['start', 'Al inicio'], ['both', 'En ambos extremos'], ['none', 'Sin punta (línea)']] },
        { key: 'color', label: 'Color', type: 'color' }, { key: 'width', label: 'Grosor', type: 'number', min: 1, max: 30 },
        { key: 'dash', label: 'Línea punteada', type: 'checkbox' },
        { key: 'label', label: 'Etiqueta (opcional, usa {variables})', type: 'text' },
        { key: 'source', label: 'Variable para reglas (opcional)', type: 'var' }, RULE_FIELD,
      ],
      render(body) { body.innerHTML = '<svg class="annot-svg"><line class="an-line"/><polygon class="an-head an-head-a"/><polygon class="an-head an-head-b"/><text class="an-label" text-anchor="middle"></text></svg>'; },
      update(body, w, r) {
        const p = w.props, W = w.w, H = w.h, color = r.rule ? LEVEL_COLOR[r.rule.level] : (w.state.color || p.color);
        const sw = Math.max(1, +p.width || 4), hl = sw * 3.2;
        let x1 = p.ax * W, y1 = p.ay * H, x2 = p.bx * W, y2 = p.by * H;
        const ang = Math.atan2(y2 - y1, x2 - x1), len = Math.hypot(x2 - x1, y2 - y1);
        const svg = body.querySelector('svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        const head = (x, y, a) => `${x},${y} ${x - hl * Math.cos(a - 0.45)},${y - hl * Math.sin(a - 0.45)} ${x - hl * Math.cos(a + 0.45)},${y - hl * Math.sin(a + 0.45)}`;
        const hb = p.head === 'end' || p.head === 'both', ha = p.head === 'start' || p.head === 'both';
        // acortar la línea para que no asome por delante de la punta
        const cut = hl * 0.6;
        const lx1 = ha && len > cut ? x1 + cut * Math.cos(ang) : x1, ly1 = ha && len > cut ? y1 + cut * Math.sin(ang) : y1;
        const lx2 = hb && len > cut ? x2 - cut * Math.cos(ang) : x2, ly2 = hb && len > cut ? y2 - cut * Math.sin(ang) : y2;
        const line = body.querySelector('.an-line');
        line.setAttribute('x1', lx1); line.setAttribute('y1', ly1); line.setAttribute('x2', lx2); line.setAttribute('y2', ly2);
        line.setAttribute('stroke', color); line.setAttribute('stroke-width', sw); line.setAttribute('stroke-dasharray', p.dash ? `${sw * 2.5} ${sw * 2}` : '');
        const pa = body.querySelector('.an-head-a'), pb = body.querySelector('.an-head-b');
        pa.setAttribute('points', head(x1, y1, ang + Math.PI)); pa.setAttribute('fill', color); pa.style.display = ha ? '' : 'none';
        pb.setAttribute('points', head(x2, y2, ang)); pb.setAttribute('fill', color); pb.style.display = hb ? '' : 'none';
        const t = body.querySelector('.an-label'); t.textContent = template(p.label); t.setAttribute('fill', color);
        t.setAttribute('x', (x1 + x2) / 2 + 14 * Math.sin(ang)); t.setAttribute('y', (y1 + y2) / 2 - 14 * Math.cos(ang) + 5); t.setAttribute('font-size', Math.max(12, sw * 3.5));
      }
    },
    marco: {
      name: 'Marco / zona', icon: '▢', w: 220, h: 220, annot: true,
      props: { shape: 'rect', color: '#2f6fed', width: 3, dash: true, fill: 0.08, label: '', source: '', rules: [], showTitle: false, transparent: true },
      schema: [
        { key: 'shape', label: 'Forma', type: 'select', options: [['rect', 'Rectángulo'], ['round', 'Rectángulo redondeado'], ['circle', 'Círculo / elipse']] },
        { key: 'color', label: 'Color', type: 'color' }, { key: 'width', label: 'Grosor del borde', type: 'number', min: 0, max: 30 },
        { key: 'dash', label: 'Borde punteado', type: 'checkbox' }, { key: 'fill', label: 'Relleno (0 = transparente, 1 = sólido)', type: 'number', min: 0, max: 1, step: 0.05 },
        { key: 'label', label: 'Etiqueta (opcional, usa {variables})', type: 'text' },
        { key: 'source', label: 'Variable para reglas (opcional)', type: 'var' }, RULE_FIELD,
      ],
      render(body) { body.innerHTML = '<svg class="annot-svg"><rect class="an-shape"/><ellipse class="an-ellipse"/><text class="an-label" text-anchor="middle"></text></svg>'; },
      update(body, w, r) {
        const p = w.props, W = w.w, H = w.h, color = r.rule ? LEVEL_COLOR[r.rule.level] : (w.state.color || p.color);
        const sw = Math.max(0, +p.width || 0), i = sw / 2 + 1;
        const svg = body.querySelector('svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        const rect = body.querySelector('.an-shape'), ell = body.querySelector('.an-ellipse');
        const common = el => { el.setAttribute('stroke', color); el.setAttribute('stroke-width', sw); el.setAttribute('fill', color); el.setAttribute('fill-opacity', +p.fill || 0); el.setAttribute('stroke-dasharray', p.dash ? `${sw * 3} ${sw * 2}` : ''); };
        if (p.shape === 'circle') { rect.style.display = 'none'; ell.style.display = ''; ell.setAttribute('cx', W / 2); ell.setAttribute('cy', H / 2); ell.setAttribute('rx', W / 2 - i); ell.setAttribute('ry', H / 2 - i); common(ell); }
        else { ell.style.display = 'none'; rect.style.display = ''; rect.setAttribute('x', i); rect.setAttribute('y', i); rect.setAttribute('width', W - 2 * i); rect.setAttribute('height', H - 2 * i); rect.setAttribute('rx', p.shape === 'round' ? 16 : 0); common(rect); }
        const t = body.querySelector('.an-label'); t.textContent = template(p.label); t.setAttribute('fill', color); t.setAttribute('x', W / 2); t.setAttribute('y', Math.max(18, sw + 18)); t.setAttribute('font-size', 15);
      }
    },
    tabla: {
      name: 'Tabla de variables', icon: '📋', w: 220, h: 220,
      props: { filter: '' },
      schema: [{ key: 'filter', label: 'Mostrar solo (nombres separados por coma, vacío = todas)', type: 'text' }],
      render(body) { body.innerHTML = '<table class="vars-table"><tbody></tbody></table>'; },
      update(body, w) {
        const f = String(w.props.filter || '').split(',').map(s => s.trim()).filter(Boolean);
        const names = (f.length ? f : Vars.names()).slice(0, 60);
        const html = names.map(n => `<tr><td>${Util.esc(n)}</td><td>${Util.esc(Util.fmt(Vars.has(n) ? Vars.get(n) : null, 2))}</td></tr>`).join('') || '<tr><td class="muted">Esperando datos…</td></tr>';
        const tb = body.querySelector('tbody'); if (tb.innerHTML !== html) tb.innerHTML = html;
      }
    },
  };

  /* ---------- Dashboard ---------- */
  const Dashboard = {
    viewport: null, canvas: null, propsPanel: null,
    width: 1280, height: 720,
    background: { color: '#eef2f7', image: '', fit: 'cover' },
    widgets: [], editMode: true, selected: null, scale: 1, grid: 20, _dirty: true, _zTop: 10,

    init(viewportEl, propsEl) {
      this.viewport = viewportEl; this.propsPanel = propsEl;
      this.canvas = viewportEl.querySelector('.dash-canvas');
      this.layout();
      window.addEventListener('resize', () => this.layout());
      document.addEventListener('fullscreenchange', () => setTimeout(() => this.layout(), 50));
      new ResizeObserver(() => this.layout()).observe(viewportEl);
      this.canvas.addEventListener('pointerdown', ev => { if (ev.target === this.canvas) this.select(null); });
      document.addEventListener('keydown', ev => {
        if (!this.editMode || !this.selected || /input|textarea|select/i.test(document.activeElement.tagName)) return;
        const w = this.get(this.selected); if (!w) return;
        const step = ev.shiftKey ? 10 : 1; let moved = true;
        if (ev.key === 'Delete' || ev.key === 'Backspace') { this.remove(w.id); return; }
        else if (ev.key === 'ArrowLeft') w.x -= step; else if (ev.key === 'ArrowRight') w.x += step;
        else if (ev.key === 'ArrowUp') w.y -= step; else if (ev.key === 'ArrowDown') w.y += step; else moved = false;
        if (moved) { ev.preventDefault(); this.place(w); this.changed(); }
      });
      Bus.on('var', () => { this._dirty = true; });
      Bus.on('alert', () => { this._dirty = true; });
      Bus.on('alerts:cleared', () => { this._dirty = true; });
      Bus.on('tm:pred', () => { this._dirty = true; });
      const tick = () => { if (this._dirty) { this._dirty = false; this.updateAll(); } requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      setInterval(() => { this._dirty = true; }, 1000); // {hora} y demás
    },

    layout() {
      const vw = this.viewport.clientWidth, vh = this.viewport.clientHeight;
      if (!vw || !vh) return;
      const s = Math.min(vw / this.width, vh / this.height);
      this.scale = s;
      this.canvas.style.width = this.width + 'px'; this.canvas.style.height = this.height + 'px';
      this.canvas.style.transform = `scale(${s})`;
      this.canvas.style.left = Math.max(0, (vw - this.width * s) / 2) + 'px';
      this.canvas.style.top = Math.max(0, (vh - this.height * s) / 2) + 'px';
      this.applyBackground();
    },

    applyBackground() {
      const b = this.background, c = this.canvas;
      c.style.backgroundColor = b.color || '#eef2f7';
      if (b.image) {
        c.style.backgroundImage = `url("${b.image}")`;
        c.style.backgroundSize = b.fit === 'tile' ? 'auto' : b.fit === 'stretch' ? '100% 100%' : b.fit;
        c.style.backgroundRepeat = b.fit === 'tile' ? 'repeat' : 'no-repeat';
        c.style.backgroundPosition = 'center';
      } else c.style.backgroundImage = '';
      this.viewport.style.background = b.color ? this._darken(b.color) : '#1f2937';
    },
    _darken(hex) { const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return hex; const n = parseInt(m[1], 16); const f = c => Math.round(c * 0.55); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; },

    setEditMode(on) {
      this.editMode = !!on; this.viewport.classList.toggle('edit', this.editMode);
      if (!on) this.select(null);
      Bus.emit('dash:editmode', this.editMode);
    },

    get(id) { return this.widgets.find(w => w.id === id); },
    byType(type) { return this.widgets.filter(w => w.type === type); },
    /** Busca por id o por título (para los bloques). */
    find(ref) { return this.get(ref) || this.widgets.find(w => w.title === ref) || this.widgets.find(w => (w.title || '').toLowerCase() === String(ref).toLowerCase()); },

    add(type, opts) {
      const T = Types[type]; if (!T) return null;
      opts = opts || {};
      const count = this.byType(type).length + 1;
      const w = {
        id: opts.id || Util.uid(type), type, title: opts.title || (T.name.split(' +')[0] + (count > 1 ? ' ' + count : '')),
        x: opts.x != null ? opts.x : 40 + (this.widgets.length % 6) * 30, y: opts.y != null ? opts.y : 40 + (this.widgets.length % 6) * 30,
        w: opts.w || T.w, h: opts.h || T.h, z: opts.z || ++this._zTop, visible: opts.visible !== false,
        props: Object.assign({ showTitle: true, transparent: false }, JSON.parse(JSON.stringify(T.props)), opts.props || {}),
        state: {},
      };
      this.widgets.push(w); this.mount(w); this.select(w.id); this.changed();
      return w;
    },

    mount(w) {
      const T = Types[w.type];
      const el = document.createElement('div'); el.className = 'widget type-' + w.type; el.dataset.id = w.id;
      el.innerHTML = `<div class="w-head"><span class="w-title"></span><span class="w-actions"><button data-act="settings" title="Propiedades">⚙</button><button data-act="dup" title="Duplicar">⧉</button><button data-act="del" title="Eliminar">✕</button></span></div><div class="w-body"></div><div class="w-cover"></div><div class="w-resize"></div>`;
      this.canvas.appendChild(el); w.el = el;
      T.render(el.querySelector('.w-body'), w);
      this.place(w);
      // selección / arrastre
      const cover = el.querySelector('.w-cover'), head = el.querySelector('.w-head');
      const startDrag = ev => {
        if (!this.editMode || ev.button !== 0 || ev.target.closest('button')) return;
        ev.preventDefault(); this.select(w.id);
        const sx = ev.clientX, sy = ev.clientY, ox = w.x, oy = w.y;
        const move = e => { w.x = Math.round((ox + (e.clientX - sx) / this.scale) / this.grid) * this.grid; w.y = Math.round((oy + (e.clientY - sy) / this.scale) / this.grid) * this.grid; w.x = Util.clamp(w.x, 0, this.width - 20); w.y = Util.clamp(w.y, 0, this.height - 20); this.place(w); };
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); this.changed(); };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
      };
      cover.addEventListener('pointerdown', startDrag); head.addEventListener('pointerdown', startDrag);
      el.querySelector('.w-resize').addEventListener('pointerdown', ev => {
        if (!this.editMode) return; ev.preventDefault(); ev.stopPropagation(); this.select(w.id);
        const sx = ev.clientX, sy = ev.clientY, ow = w.w, oh = w.h;
        const move = e => { w.w = Math.max(40, Math.round((ow + (e.clientX - sx) / this.scale) / this.grid) * this.grid); w.h = Math.max(30, Math.round((oh + (e.clientY - sy) / this.scale) / this.grid) * this.grid); this.place(w); this._dirty = true; };
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); this.changed(); };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
      });
      el.querySelector('.w-actions').addEventListener('click', ev => {
        const act = ev.target.dataset.act; if (!act) return; ev.stopPropagation();
        if (act === 'del') this.remove(w.id); else if (act === 'dup') this.duplicate(w.id); else if (act === 'settings') { this.select(w.id); Bus.emit('dash:openprops'); }
      });
      cover.addEventListener('dblclick', () => { this.select(w.id); Bus.emit('dash:openprops'); });
      if (T.annot) el.classList.add('annot');
      if (T.endpoints) this._mountEndpoints(w);
      this._dirty = true;
    },

    /** Manijas para mover cada extremo de una flecha/línea. */
    _mountEndpoints(w) {
      const PAD = 12;
      ['a', 'b'].forEach(k => {
        const h = document.createElement('div'); h.className = 'w-pt w-pt-' + k; w.el.appendChild(h);
        h.addEventListener('pointerdown', ev => {
          if (!this.editMode || ev.button !== 0) return;
          ev.preventDefault(); ev.stopPropagation(); this.select(w.id);
          const p = w.props;
          // puntos absolutos en el lienzo
          const fixed = k === 'a' ? { x: w.x + p.bx * w.w, y: w.y + p.by * w.h } : { x: w.x + p.ax * w.w, y: w.y + p.ay * w.h };
          const start = k === 'a' ? { x: w.x + p.ax * w.w, y: w.y + p.ay * w.h } : { x: w.x + p.bx * w.w, y: w.y + p.by * w.h };
          const sx = ev.clientX, sy = ev.clientY;
          const move = e => {
            const mv = { x: Util.clamp(Math.round((start.x + (e.clientX - sx) / this.scale) / 5) * 5, 0, this.width), y: Util.clamp(Math.round((start.y + (e.clientY - sy) / this.scale) / 5) * 5, 0, this.height) };
            const A = k === 'a' ? mv : fixed, B = k === 'a' ? fixed : mv;
            const minx = Math.min(A.x, B.x) - PAD, miny = Math.min(A.y, B.y) - PAD;
            w.x = minx; w.y = miny; w.w = Math.max(2 * PAD + 4, Math.abs(A.x - B.x) + 2 * PAD); w.h = Math.max(2 * PAD + 4, Math.abs(A.y - B.y) + 2 * PAD);
            p.ax = (A.x - minx) / w.w; p.ay = (A.y - miny) / w.h; p.bx = (B.x - minx) / w.w; p.by = (B.y - miny) / w.h;
            this.place(w); this._placeEndpoints(w);
          };
          const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); this.changed(); };
          window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
        });
      });
      this._placeEndpoints(w);
    },
    _placeEndpoints(w) {
      const p = w.props, a = w.el.querySelector('.w-pt-a'), b = w.el.querySelector('.w-pt-b'); if (!a) return;
      a.style.left = (p.ax * w.w) + 'px'; a.style.top = (p.ay * w.h) + 'px'; b.style.left = (p.bx * w.w) + 'px'; b.style.top = (p.by * w.h) + 'px';
    },

    place(w) {
      const el = w.el; if (!el) return;
      el.style.left = w.x + 'px'; el.style.top = w.y + 'px'; el.style.width = w.w + 'px'; el.style.height = w.h + 'px'; el.style.zIndex = w.z;
      el.querySelector('.w-title').textContent = w.title;
      el.classList.toggle('no-title', !w.props.showTitle); el.classList.toggle('transparent', !!w.props.transparent);
      el.classList.toggle('hidden-widget', w.visible === false);
      if (Types[w.type].endpoints) this._placeEndpoints(w);
      this._dirty = true;
    },

    remove(id) {
      const i = this.widgets.findIndex(w => w.id === id); if (i < 0) return;
      const w = this.widgets[i]; if (Types[w.type].destroy) Types[w.type].destroy(w);
      if (w.type === 'camara' && TM.owner === w.id) TM.stop();
      w.el.remove(); this.widgets.splice(i, 1);
      if (this.selected === id) this.select(null);
      this.changed();
    },
    duplicate(id) { const w = this.get(id); if (!w) return; this.add(w.type, { title: w.title + ' copia', x: w.x + 20, y: w.y + 20, w: w.w, h: w.h, props: JSON.parse(JSON.stringify(w.props)) }); },
    clear() { this.widgets.slice().forEach(w => this.remove(w.id)); },

    select(id) {
      this.selected = id;
      this.widgets.forEach(w => { w.el.classList.toggle('selected', w.id === id); if (w.id === id) { w.z = ++this._zTop; w.el.style.zIndex = w.z; } });
      Bus.emit('dash:select', id ? this.get(id) : null);
      this.renderProps();
    },

    updateAll() {
      for (const w of this.widgets) this.update(w);
    },
    update(w) {
      const T = Types[w.type]; if (!w.el) return;
      const body = w.el.querySelector('.w-body');
      const r = { w: w.w - 24, h: w.h - 24 - (w.props.showTitle ? 22 : 0), rule: null };
      if (w.props.rules && w.props.rules.length && (w.type !== 'luz' || w.props.mode !== 'bloques')) {
        const src = w.props.source;
        if (src && Vars.has(src)) {
          r.rule = matchRule(w.props.rules, Vars.get(src));
          const lvl = r.rule ? r.rule.level : 'ok';
          if (w.state.level !== undefined && w.state.level !== lvl) {
            if (r.rule && (lvl === 'warn' || lvl === 'danger' || lvl === 'info')) Alerts.raise({ level: lvl, message: (r.rule.message || (w.title + ': ' + Util.fmt(Vars.get(src), 1))), source: w.title, value: Vars.get(src) });
            else if (!r.rule && (w.state.level === 'warn' || w.state.level === 'danger')) Alerts.raise({ level: 'ok', message: w.title + ' volvió a la normalidad', source: w.title });
          }
          w.state.level = lvl;
        }
      }
      w.el.dataset.level = r.rule ? r.rule.level : '';
      try { T.update(body, w, r); } catch (e) { console.error('widget', w.type, e); }
    },

    changed() { this._dirty = true; Bus.emit('dash:changed'); },

    /* ----- propiedades ----- */
    renderProps() {
      const panel = this.propsPanel; if (!panel) return;
      const w = this.selected && this.get(this.selected);
      if (!w) { panel.innerHTML = '<div class="props-empty"><p>Seleccioná un widget del panel para editar sus propiedades.</p><p class="muted">Tip: arrastrá para mover, usá la esquina para cambiar el tamaño, doble clic para abrir propiedades.</p></div>'; return; }
      const T = Types[w.type];
      const fields = [{ key: '__title', label: 'Título (nombre que usan los bloques)', type: 'text' }, ...T.schema, ...COMMON_TAIL.filter(f => !T.schema.some(s => s.key === f.key))];
      panel.innerHTML = `<div class="props-head"><span>${T.icon} ${Util.esc(T.name)}</span><button class="mini" data-close>✕</button></div>
        <div class="seg" data-style><button data-v="0" class="${w.props.transparent ? '' : 'on'}">Con fondo</button><button data-v="1" class="${w.props.transparent ? 'on' : ''}">Sin fondo</button></div><div class="props-form"></div>
        <div class="props-geom"><label>X <input type="number" data-g="x"></label><label>Y <input type="number" data-g="y"></label><label>Ancho <input type="number" data-g="w"></label><label>Alto <input type="number" data-g="h"></label></div>
        <div class="props-actions"><button class="mini" data-dup>⧉ Duplicar</button><button class="mini danger" data-del>✕ Eliminar</button></div>`;
      const form = panel.querySelector('.props-form');
      fields.forEach(f => form.appendChild(this._field(w, f)));
      panel.querySelectorAll('[data-g]').forEach(inp => { inp.value = w[inp.dataset.g]; inp.addEventListener('change', () => { w[inp.dataset.g] = Math.max(0, +inp.value || 0); this.place(w); this.changed(); }); });
      panel.querySelector('[data-close]').addEventListener('click', () => this.select(null));
      panel.querySelectorAll('[data-style] button').forEach(b => b.addEventListener('click', () => { w.props.transparent = b.dataset.v === '1'; panel.querySelectorAll('[data-style] button').forEach(x => x.classList.toggle('on', x === b)); this.place(w); this.changed(); }));
      panel.querySelector('[data-dup]').addEventListener('click', () => this.duplicate(w.id));
      panel.querySelector('[data-del]').addEventListener('click', () => this.remove(w.id));
    },

    _field(w, f) {
      const wrap = document.createElement('div'); wrap.className = 'field';
      const val = f.key === '__title' ? w.title : w.props[f.key];
      const set = v => { if (f.key === '__title') w.title = v; else w.props[f.key] = v; this.place(w); this.changed(); Bus.emit('dash:props', w); };
      let input;
      if (f.type === 'select') {
        input = document.createElement('select'); f.options.forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; o.selected = v === val; input.appendChild(o); });
        input.addEventListener('change', () => set(input.value));
      } else if (f.type === 'checkbox') {
        wrap.className = 'field field-check';
        input = document.createElement('input'); input.type = 'checkbox'; input.checked = !!val; input.addEventListener('change', () => set(input.checked));
        const lab = document.createElement('label'); lab.appendChild(input); lab.appendChild(document.createTextNode(' ' + f.label)); wrap.appendChild(lab); return wrap;
      } else if (f.type === 'textarea') {
        input = document.createElement('textarea'); input.value = val == null ? '' : val; input.rows = 3; input.addEventListener('input', () => set(input.value));
      } else if (f.type === 'rules') {
        wrap.appendChild(this._rulesEditor(w, f)); return wrap;
      } else if (f.type === 'var') {
        input = document.createElement('input'); input.type = 'text'; input.value = val == null ? '' : val; input.setAttribute('list', 'var-names');
        input.addEventListener('input', () => set(input.value.trim()));
      } else if (f.type === 'image') {
        input = document.createElement('div'); input.className = 'img-field';
        input.innerHTML = '<input type="text" placeholder="https://… o elegí un archivo"><input type="file" accept="image/*"><button class="mini" data-clear>Quitar</button>';
        const t = input.querySelector('input[type=text]'); t.value = (val && val.startsWith('data:')) ? '(archivo cargado)' : (val || '');
        t.addEventListener('change', () => set(t.value.trim()));
        input.querySelector('input[type=file]').addEventListener('change', ev => { const file = ev.target.files[0]; if (!file) return; Project.readImageFile(file, 900).then(d => { set(d); t.value = '(archivo cargado)'; }); });
        input.querySelector('[data-clear]').addEventListener('click', () => { set(''); t.value = ''; });
      } else {
        input = document.createElement('input'); input.type = f.type === 'number' ? 'number' : f.type === 'color' ? 'color' : 'text';
        if (f.min != null) input.min = f.min; if (f.max != null) input.max = f.max; if (f.step != null) input.step = f.step; else if (f.type === 'number') input.step = 'any';
        input.value = val == null ? '' : val;
        input.addEventListener('input', () => set(f.type === 'number' ? (input.value === '' ? '' : +input.value) : input.value));
      }
      const lab = document.createElement('label'); lab.textContent = f.label; wrap.appendChild(lab); wrap.appendChild(input);
      if (f.help) { const h = document.createElement('small'); h.className = 'muted'; h.textContent = f.help; wrap.appendChild(h); }
      return wrap;
    },

    _rulesEditor(w, f) {
      const box = document.createElement('div'); box.className = 'rules';
      const rules = w.props.rules = w.props.rules || [];
      const draw = () => {
        box.innerHTML = `<label>${f.label}</label><small class="muted">${f.help}</small>`;
        rules.forEach((r, i) => {
          const row = document.createElement('div'); row.className = 'rule-row';
          row.innerHTML = `<span>si el valor</span><select data-k="op">${['>', '>=', '<', '<=', '=', '!=', 'entre', 'contiene'].map(o => `<option ${r.op === o ? 'selected' : ''}>${o}</option>`).join('')}</select>
            <input data-k="value" placeholder="valor" value="${Util.esc(r.value)}"><select data-k="level">${Object.keys(LEVEL_COLOR).map(l => `<option value="${l}" ${r.level === l ? 'selected' : ''}>${LEVEL_NAME[l]}</option>`).join('')}</select>
            <input data-k="message" placeholder="mensaje de alerta" value="${Util.esc(r.message || '')}"><button class="mini danger" data-x>✕</button>`;
          row.querySelectorAll('[data-k]').forEach(inp => inp.addEventListener('change', () => { r[inp.dataset.k] = inp.dataset.k === 'value' ? Vars.coerce(inp.value) : inp.value; w.state.level = undefined; this.changed(); }));
          row.querySelector('[data-x]').addEventListener('click', () => { rules.splice(i, 1); draw(); this.changed(); });
          box.appendChild(row);
        });
        const add = document.createElement('button'); add.className = 'mini'; add.textContent = '+ Agregar regla';
        add.addEventListener('click', () => { rules.push({ op: '>', value: 30, level: 'warn', message: w.title + ' alto' }); draw(); this.changed(); });
        box.appendChild(add);
      };
      draw(); return box;
    },

    /* ----- serialización ----- */
    serialize() {
      return {
        width: this.width, height: this.height, background: Object.assign({}, this.background),
        widgets: this.widgets.map(w => ({ id: w.id, type: w.type, title: w.title, x: w.x, y: w.y, w: w.w, h: w.h, z: w.z, visible: w.visible, props: w.props })),
      };
    },
    load(d) {
      this.clear();
      d = d || {};
      this.width = d.width || 1280; this.height = d.height || 720;
      this.background = Object.assign({ color: '#eef2f7', image: '', fit: 'cover' }, d.background || {});
      (d.widgets || []).forEach(sw => { if (!Types[sw.type]) return; this.widgets.push(Object.assign({ state: {}, visible: true }, sw, { props: Object.assign({ showTitle: true, transparent: false }, JSON.parse(JSON.stringify(Types[sw.type].props)), sw.props || {}) })); });
      this._zTop = Math.max(10, ...this.widgets.map(w => w.z || 0));
      this.widgets.forEach(w => this.mount(w));
      this.layout(); this.select(null); this._dirty = true;
      Bus.emit('dash:loaded');
    },
    setSize(w, h) { this.width = Math.max(320, w | 0); this.height = Math.max(240, h | 0); this.layout(); this.changed(); },
    setBackground(b) { Object.assign(this.background, b); this.applyBackground(); this.changed(); },

    /** Utilidades para el runtime de bloques. */
    api: {
      show(ref, value) { const w = Dashboard.find(ref); if (!w) return; if (w.type === 'texto' || w.type === 'boton') w.state.text = String(value); else if (w.props.source !== undefined) { Vars.set(w.props.source || ('_' + w.id), value, 'bloques'); } Dashboard._dirty = true; },
      led(ref, on) { const w = Dashboard.find(ref); if (!w) return; if (w.type === 'luz') { w.props.mode = 'bloques'; w.state.on = !!on; } Dashboard._dirty = true; },
      color(ref, c) { const w = Dashboard.find(ref); if (!w) return; w.state.color = c; if (w.type === 'luz') { w.props.mode = 'bloques'; if (w.state.on === undefined) w.state.on = true; } Dashboard._dirty = true; },
      text(ref, t) { const w = Dashboard.find(ref); if (!w) return; w.state.text = String(t); Dashboard._dirty = true; },
      visible(ref, v) { const w = Dashboard.find(ref); if (!w) return; w.visible = !!v; Dashboard.place(w); },
      image(ref, src) { const w = Dashboard.find(ref); if (!w) return; w.state.src = src; Dashboard._dirty = true; },
      bg(c) { Dashboard.setBackground({ color: c }); },
      resetStates() { Dashboard.widgets.forEach(w => { w.state.text = undefined; w.state.color = undefined; w.state.on = undefined; w.state.src = undefined; }); Dashboard._dirty = true; },
    }
  };

  global.Dashboard = Dashboard; global.WidgetTypes = Types; global.Alerts = Alerts;
  global.LEVEL_COLOR = LEVEL_COLOR; global.matchRule = matchRule; global.templateText = template;
})(window);
