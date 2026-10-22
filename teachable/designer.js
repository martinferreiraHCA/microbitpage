/* ==========================================================================
   designer.js — Lienzo de diseño drag & drop para visualizar lo que detecta
   el modelo: cámara, clase, certeza, barras, luces, contadores, texto,
   historial, estado del micro:bit e imagen. Se guarda en el navegador.
   ========================================================================== */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => 'e' + Math.random().toString(36).slice(2, 8);
const COLORS = ['#2f6fed', '#e5484d', '#22a06b', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#84cc16'];
const STORE = 'tm2mb:design';
const W = 1280, H = 720, GRID = 20;

let api = null, els = [], selected = null, editMode = true, scale = 1, hist = [], last = { preds: [], best: null };

const TYPES = {
  camara:   { name: 'Cámara', icon: '📷', w: 240, h: 240, props: { title: 'Cámara' },
    render: b => { b.innerHTML = '<canvas class="dz-cam" width="320" height="320"></canvas>'; },
    update: (b, e) => { const src = api.getCamera(); const c = b.firstChild; if (!src || !src.width) return; if (c.width !== src.width) { c.width = src.width; c.height = src.height; } c.getContext('2d').drawImage(src, 0, 0); } },
  clase:    { name: 'Clase detectada', icon: '🏷️', w: 320, h: 140, props: { title: 'Veo', color: '#1c1f26' },
    render: b => { b.innerHTML = '<div class="dz-big">—</div>'; },
    update: (b, e) => { const d = b.firstChild; const t = last.best ? last.best.className : '—'; if (d.textContent !== t) d.textContent = t; d.style.color = e.props.color; d.style.fontSize = Math.max(14, Math.min(e.h * 0.5, (e.w * 1.6) / Math.max(3, t.length))) + 'px'; } },
  certeza:  { name: 'Certeza', icon: '📶', w: 240, h: 140, props: { title: 'Certeza', color: '#22a06b' },
    render: b => { b.innerHTML = '<div class="dz-cert"><b>0 %</b><div class="bar"><i></i></div></div>'; },
    update: (b, e) => { const p = last.best ? Math.round(last.best.probability * 100) : 0; b.querySelector('b').textContent = p + ' %'; const i = b.querySelector('i'); i.style.width = p + '%'; i.style.background = e.props.color; } },
  barras:   { name: 'Barras por clase', icon: '📊', w: 320, h: 200, props: { title: 'Clases' },
    render: b => { b.innerHTML = '<div class="dz-bars"></div>'; },
    update: (b, e) => { const box = b.firstChild; const preds = last.preds.length ? last.preds : api.getClasses().map(c => ({ className: c, probability: 0 }));
      if (box.children.length !== preds.length) box.innerHTML = preds.map((p, i) => `<div class="pred"><span>${esc(p.className)}</span><div class="bar"><i style="background:${COLORS[i % COLORS.length]}"></i></div><b>0%</b></div>`).join('');
      preds.forEach((p, i) => { const r = box.children[i]; const pct = Math.round(p.probability * 100) + '%'; r.querySelector('i').style.width = pct; r.querySelector('b').textContent = pct; r.classList.toggle('top', last.best === p); }); } },
  luz:      { name: 'Luz por clase', icon: '💡', w: 160, h: 160, props: { title: '', clase: '', umbral: 70, color: '#22a06b', showTitle: false },
    render: b => { b.innerHTML = '<div class="dz-led"><div class="dot"></div><small></small></div>'; },
    update: (b, e) => { const on = last.best && last.best.className === e.props.clase && last.best.probability * 100 >= +e.props.umbral; const dot = b.querySelector('.dot'); dot.style.background = on ? e.props.color : '#4b5563'; dot.style.boxShadow = on ? `0 0 30px ${e.props.color}88` : 'none'; b.querySelector('small').textContent = e.props.clase || 'elegí una clase'; } },
  contador: { name: 'Contador', icon: '🔢', w: 180, h: 160, props: { title: 'Veces', clase: '' },
    render: b => { b.innerHTML = '<div class="dz-count"><b>0</b><small></small></div>'; },
    update: (b, e) => { const n = api.getCounts()[e.props.clase] || 0; b.querySelector('b').textContent = n; b.querySelector('small').textContent = e.props.clase || 'elegí una clase'; } },
  texto:    { name: 'Texto', icon: '🔤', w: 360, h: 70, props: { title: '', text: 'Veo: {clase} ({certeza} %)', size: 26, color: '#1c1f26', showTitle: false, transparent: true },
    render: b => { b.innerHTML = '<div class="dz-text"></div>'; },
    update: (b, e) => { const d = b.firstChild; const t = String(e.props.text || '').replace(/\{clase\}/g, last.best ? last.best.className : '—').replace(/\{certeza\}/g, last.best ? Math.round(last.best.probability * 100) : '—').replace(/\{hora\}/g, new Date().toLocaleTimeString()); if (d.textContent !== t) d.textContent = t; d.style.fontSize = (e.props.size || 26) + 'px'; d.style.color = e.props.color; } },
  historial:{ name: 'Historial', icon: '📈', w: 420, h: 200, props: { title: 'Últimos 60 segundos' },
    render: b => { b.innerHTML = '<div class="dz-hist"><canvas></canvas></div>'; },
    update: (b, e) => { const c = b.querySelector('canvas'); const w = Math.max(50, e.w - 24), h = Math.max(30, e.h - 44); if (c.width !== w * 2) { c.width = w * 2; c.height = h * 2; }
      const ctx = c.getContext('2d'); ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.clearRect(0, 0, w, h); const classes = api.getClasses(); const rowH = Math.min(26, (h - 14) / Math.max(1, classes.length)); ctx.font = '10px system-ui'; ctx.fillStyle = '#6b7280';
      classes.forEach((cls, i) => { const y = i * rowH; ctx.fillStyle = '#6b7280'; ctx.fillText(cls.slice(0, 12), 0, y + rowH * 0.65); const x0 = 70, span = w - x0; hist.forEach((hp, k) => { if (hp.cls !== cls) return; const x = x0 + span * (k / 60); ctx.fillStyle = COLORS[i % COLORS.length]; ctx.globalAlpha = 0.35 + 0.65 * hp.p; ctx.fillRect(x, y + 3, Math.max(2, span / 60 - 1), rowH - 6); ctx.globalAlpha = 1; }); }); } },
  microbit: { name: 'micro:bit', icon: '🔌', w: 240, h: 110, props: { title: 'micro:bit' },
    render: b => { b.innerHTML = '<div class="dz-mb"><div><span class="dot"></span> <span class="st"></span></div><div class="sent"></div></div>'; },
    update: (b, e) => { const s = api.getSerial(); b.querySelector('.dot').classList.toggle('on', s.connected); b.querySelector('.st').textContent = s.connected ? 'conectado por USB' : 'sin conectar'; b.querySelector('.sent').textContent = s.last; } },
  imagen:   { name: 'Imagen', icon: '🖼️', w: 220, h: 220, props: { title: '', src: '', showTitle: false, transparent: true },
    render: b => { b.innerHTML = '<img class="dz-img" alt=""><div class="dz-empty">Elegí una imagen en las opciones</div>'; },
    update: (b, e) => { const img = b.firstChild; if (img.getAttribute('src') !== (e.props.src || '')) img.src = e.props.src || ''; img.hidden = !e.props.src; b.lastChild.hidden = !!e.props.src; } },
};

export const Designer = {
  init(a) {
    api = a;
    const items = $('#dz-items');
    for (const t in TYPES) { const d = document.createElement('div'); d.className = 'dz-item'; d.draggable = true; d.dataset.type = t; d.innerHTML = `<i>${TYPES[t].icon}</i>${esc(TYPES[t].name)}`; d.addEventListener('dragstart', ev => ev.dataTransfer.setData('text/plain', t)); d.addEventListener('click', () => this.add(t)); items.appendChild(d); }
    const vp = $('#dz-viewport'), cv = $('#dz-canvas');
    vp.addEventListener('dragover', ev => { ev.preventDefault(); });
    vp.addEventListener('drop', ev => { ev.preventDefault(); const t = ev.dataTransfer.getData('text/plain'); if (!TYPES[t]) return; const r = cv.getBoundingClientRect(); this.add(t, (ev.clientX - r.left) / scale - TYPES[t].w / 2, (ev.clientY - r.top) / scale - TYPES[t].h / 2); });
    cv.addEventListener('pointerdown', ev => { if (ev.target === cv) this.select(null); });
    $('#dz-edit').addEventListener('click', () => this.setEdit(!editMode));
    $('#dz-full').addEventListener('click', () => { document.fullscreenElement ? document.exitFullscreen() : vp.requestFullscreen().catch(() => {}); });
    $('#dz-bg').addEventListener('input', ev => { this.bg.color = ev.target.value; this.applyBg(); this.save(); });
    $('#dz-bg-img').addEventListener('change', ev => { const f = ev.target.files[0]; if (!f) return; this.readImage(f, 1600).then(src => { this.bg.image = src; this.applyBg(); this.save(); }); });
    $('#dz-bg-clear').addEventListener('click', () => { this.bg.image = ''; this.applyBg(); this.save(); });
    $('#dz-save').addEventListener('click', () => this.download());
    $('#dz-load').addEventListener('click', () => this.upload());
    $('#dz-clear').addEventListener('click', () => { if (confirm('¿Vaciar el lienzo?')) { els.slice().forEach(e => this.remove(e.id)); } });
    window.addEventListener('resize', () => this.layout());
    document.addEventListener('fullscreenchange', () => setTimeout(() => this.layout(), 50));
    document.addEventListener('keydown', ev => { if (!editMode || !selected || /input|textarea|select/i.test(document.activeElement.tagName) || $('#view-design').hidden) return; if (ev.key === 'Delete' || ev.key === 'Backspace') this.remove(selected); });
    window.addEventListener('tm2mb:preds', ev => { last = ev.detail; });
    setInterval(() => { if (last.best) { hist.push({ cls: last.best.className, p: last.best.probability }); if (hist.length > 60) hist.shift(); } }, 1000);
    this.bg = { color: '#f5f6f8', image: '' };
    this.restore();
    const tick = () => { if (!$('#view-design').hidden) this.updateAll(); requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  },
  show() { this.layout(); $('#dz-status').textContent = api.isReady() ? 'modelo activo: los elementos muestran lo que detecta la cámara' : 'sin modelo: entrená primero en la pestaña 1'; this.renderProps(); },
  layout() { const vp = $('#dz-viewport'), cv = $('#dz-canvas'); const vw = vp.clientWidth, vh = vp.clientHeight; if (!vw || !vh) return; scale = Math.min(vw / W, vh / H); cv.style.transform = `scale(${scale})`; cv.style.left = Math.max(0, (vw - W * scale) / 2) + 'px'; cv.style.top = Math.max(0, (vh - H * scale) / 2) + 'px'; vp.classList.toggle('edit', editMode); },
  applyBg() { const cv = $('#dz-canvas'); cv.style.backgroundColor = this.bg.color; cv.style.backgroundImage = this.bg.image ? `url("${this.bg.image}")` : ''; $('#dz-bg').value = this.bg.color; },
  setEdit(on) { editMode = on; $('#dz-viewport').classList.toggle('edit', on); $('#dz-edit').textContent = on ? '🔒 Bloquear' : '✏️ Editar'; $('#dz-palette').classList.toggle('collapsed', !on); if (!on) this.select(null); },

  add(type, x, y) {
    const T = TYPES[type]; if (!T) return;
    const n = els.filter(e => e.type === type).length;
    if (x == null) { const spot = this.freeSpot(T.w, T.h); x = spot.x; y = spot.y; }
    const e = { id: uid(), type, x: Math.round(Math.max(0, x) / GRID) * GRID, y: Math.round(Math.max(0, y) / GRID) * GRID, w: T.w, h: T.h, props: { showTitle: true, transparent: false, ...JSON.parse(JSON.stringify(T.props)) } };
    if (e.props.title === '') e.props.showTitle = false;
    if (!e.props.clase && (type === 'luz' || type === 'contador')) e.props.clase = (api.getClasses()[n] || api.getClasses()[0] || '');
    els.push(e); this.mount(e); this.select(e.id); this.save();
  },
  /** Primer lugar del lienzo donde entra un elemento de w×h sin pisar otros. */
  freeSpot(w, h) {
    const hits = (x, y) => els.some(o => x < o.x + o.w + GRID && x + w + GRID > o.x && y < o.y + o.h + GRID && y + h + GRID > o.y);
    for (let y = 40; y + h <= H; y += GRID) for (let x = 40; x + w <= W; x += GRID) if (!hits(x, y)) return { x, y };
    return { x: Math.min(W - w, 60 + els.length * GRID), y: Math.min(H - h, 60 + els.length * GRID) };
  },
  mount(e) {
    const T = TYPES[e.type]; const el = document.createElement('div'); el.className = 'dz-el'; el.dataset.id = e.id;
    el.innerHTML = `<div class="dz-title"></div><div class="dz-body"></div><button class="dz-del" title="Quitar">✕</button><div class="dz-resize"></div>`;
    $('#dz-canvas').appendChild(el); e.el = el; T.render(el.querySelector('.dz-body'), e); this.place(e);
    el.addEventListener('pointerdown', ev => {
      if (!editMode || ev.button !== 0 || ev.target.classList.contains('dz-resize') || ev.target.classList.contains('dz-del')) return;
      ev.preventDefault(); this.select(e.id);
      const sx = ev.clientX, sy = ev.clientY, ox = e.x, oy = e.y;
      const move = m => { e.x = Math.max(0, Math.round((ox + (m.clientX - sx) / scale) / GRID) * GRID); e.y = Math.max(0, Math.round((oy + (m.clientY - sy) / scale) / GRID) * GRID); this.place(e); };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); this.save(); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    });
    el.querySelector('.dz-resize').addEventListener('pointerdown', ev => {
      if (!editMode) return; ev.preventDefault(); ev.stopPropagation(); this.select(e.id);
      const sx = ev.clientX, sy = ev.clientY, ow = e.w, oh = e.h;
      const move = m => { e.w = Math.max(60, Math.round((ow + (m.clientX - sx) / scale) / GRID) * GRID); e.h = Math.max(40, Math.round((oh + (m.clientY - sy) / scale) / GRID) * GRID); this.place(e); };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); this.save(); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    });
    el.querySelector('.dz-del').addEventListener('click', ev => { ev.stopPropagation(); this.remove(e.id); });
  },
  place(e) { const el = e.el; el.style.left = e.x + 'px'; el.style.top = e.y + 'px'; el.style.width = e.w + 'px'; el.style.height = e.h + 'px'; el.querySelector('.dz-title').textContent = e.props.title || ''; el.classList.toggle('no-title', !e.props.showTitle || !e.props.title); el.classList.toggle('transparent', !!e.props.transparent); },
  remove(id) { const i = els.findIndex(e => e.id === id); if (i < 0) return; els[i].el.remove(); els.splice(i, 1); if (selected === id) this.select(null); this.save(); },
  select(id) { selected = id; els.forEach(e => e.el.classList.toggle('selected', e.id === id)); this.renderProps(); },
  updateAll() { for (const e of els) { try { TYPES[e.type].update(e.el.querySelector('.dz-body'), e); } catch (err) { /* ignorar */ } } },

  renderProps() {
    const box = $('#dz-props'); const e = els.find(x => x.id === selected);
    if (!e) { box.innerHTML = '<p class="muted">Tocá un elemento del lienzo para editar sus opciones.</p>'; return; }
    const T = TYPES[e.type], classes = api.getClasses();
    let html = `<div class="row"><b>${T.icon} ${esc(T.name)}</b></div><label>Título <input data-k="title" value="${esc(e.props.title || '')}"></label>`;
    if ('clase' in e.props) html += `<label>Clase <select data-k="clase">${classes.map(c => `<option ${c === e.props.clase ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>`;
    if ('umbral' in e.props) html += `<label>Se enciende con certeza ≥ (%) <input type="number" data-k="umbral" min="0" max="100" value="${e.props.umbral}"></label>`;
    if ('text' in e.props) html += `<label>Texto (podés usar {clase}, {certeza} y {hora}) <textarea data-k="text" rows="2">${esc(e.props.text)}</textarea></label><label>Tamaño <input type="number" data-k="size" min="10" max="120" value="${e.props.size}"></label>`;
    if ('color' in e.props) html += `<label>Color <input type="color" data-k="color" value="${e.props.color}"></label>`;
    if ('src' in e.props) html += `<label>Imagen <input type="file" data-file accept="image/*"></label>`;
    html += `<label><input type="checkbox" data-k="showTitle" ${e.props.showTitle ? 'checked' : ''}> mostrar título</label><label><input type="checkbox" data-k="transparent" ${e.props.transparent ? 'checked' : ''}> sin fondo</label>`;
    html += `<div class="row"><button class="mini danger" data-del>✕ Quitar</button></div>`;
    box.innerHTML = html;
    box.querySelectorAll('[data-k]').forEach(inp => inp.addEventListener(inp.tagName === 'TEXTAREA' || inp.type === 'text' ? 'input' : 'change', () => { const k = inp.dataset.k; e.props[k] = inp.type === 'checkbox' ? inp.checked : inp.type === 'number' ? +inp.value : inp.value; this.place(e); this.save(); }));
    const f = box.querySelector('[data-file]'); if (f) f.addEventListener('change', ev => { const file = ev.target.files[0]; if (file) this.readImage(file, 800).then(src => { e.props.src = src; this.save(); }); });
    box.querySelector('[data-del]').addEventListener('click', () => this.remove(e.id));
  },

  serialize() { return { v: 1, bg: this.bg, els: els.map(e => ({ id: e.id, type: e.type, x: e.x, y: e.y, w: e.w, h: e.h, props: e.props })) }; },
  load(d) { els.slice().forEach(e => { e.el.remove(); }); els = []; this.bg = Object.assign({ color: '#f5f6f8', image: '' }, (d && d.bg) || {}); this.applyBg(); ((d && d.els) || []).forEach(s => { if (!TYPES[s.type]) return; const e = { ...s, props: { showTitle: true, transparent: false, ...JSON.parse(JSON.stringify(TYPES[s.type].props)), ...(s.props || {}) } }; els.push(e); this.mount(e); }); this.select(null); this.save(); },
  save() { try { localStorage.setItem(STORE, JSON.stringify(this.serialize())); } catch (e) {} },
  restore() { try { const d = JSON.parse(localStorage.getItem(STORE) || 'null'); if (d) this.load(d); else { this.applyBg(); this.starter(); } } catch (e) { this.applyBg(); } },
  starter() { this.add('camara', 40, 40); this.add('clase', 320, 40); this.add('certeza', 320, 200); this.add('barras', 680, 40); this.add('historial', 320, 380); this.add('microbit', 680, 260); this.select(null); },
  download() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(this.serialize(), null, 2)], { type: 'application/json' })); a.download = 'mi-interfaz.json'; document.body.appendChild(a); a.click(); a.remove(); },
  upload() { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json'; i.onchange = () => { const f = i.files[0]; if (!f) return; f.text().then(t => { try { this.load(JSON.parse(t)); api.toast('Diseño cargado', 'ok'); } catch (e) { api.toast('Archivo inválido', 'error'); } }); }; i.click(); },
  readImage(file, max) { return new Promise((res, rej) => { const img = new Image(); const url = URL.createObjectURL(file); img.onload = () => { const s = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.85)); }; img.onerror = () => rej(new Error('Imagen inválida')); img.src = url; }); },
};
