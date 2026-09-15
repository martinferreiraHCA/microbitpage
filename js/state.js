/* ==========================================================================
   state.js — Bus de eventos y almacén de variables (datos del micro:bit)
   ========================================================================== */
(function (global) {
  'use strict';

  /** Bus de eventos muy simple (publicar / suscribir). */
  const Bus = {
    _h: {},
    on(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); return () => this.off(ev, fn); },
    off(ev, fn) { const l = this._h[ev]; if (!l) return; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
    emit(ev, ...args) {
      const l = this._h[ev]; if (!l) return;
      for (const fn of l.slice()) { try { fn(...args); } catch (e) { console.error('[Bus]', ev, e); } }
    }
  };

  /** Almacén de variables: nombre -> valor, con historial para gráficos y estadísticas. */
  const Vars = {
    data: Object.create(null),
    history: Object.create(null),
    maxHistory: 600,
    lastLine: '',
    lastUpdate: 0,

    /** Convierte el texto a número si es posible. */
    coerce(v) {
      if (typeof v === 'number') return v;
      if (typeof v !== 'string') return v;
      const t = v.trim();
      if (t === '') return t;
      if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return parseFloat(t);
      if (t === 'true') return 1; if (t === 'false') return 0;
      return t;
    },

    set(name, value, source) {
      name = String(name).trim();
      if (!name) return;
      value = this.coerce(value);
      const prev = this.data[name];
      this.data[name] = value;
      const h = (this.history[name] = this.history[name] || []);
      h.push({ t: Date.now(), v: value });
      if (h.length > this.maxHistory) h.splice(0, h.length - this.maxHistory);
      this.lastUpdate = Date.now();
      Bus.emit('var', name, value, prev, source);
      if (prev !== value) Bus.emit('var:changed', name, value, prev, source);
    },

    setMany(obj, source) {
      for (const k in obj) this.set(k, obj[k], source);
      Bus.emit('data', obj, source);
    },

    get(name) { const v = this.data[name]; return v === undefined ? 0 : v; },
    has(name) { return name in this.data; },
    names() { return Object.keys(this.data); },

    /** Estadística sobre los últimos n valores numéricos. */
    stat(name, n, kind) {
      const h = (this.history[name] || []).slice(-Math.max(1, n | 0)).map(p => +p.v).filter(x => !isNaN(x));
      if (!h.length) return 0;
      switch (kind) {
        case 'max': return Math.max(...h);
        case 'min': return Math.min(...h);
        case 'sum': return h.reduce((a, b) => a + b, 0);
        default: return h.reduce((a, b) => a + b, 0) / h.length;
      }
    },

    clear() {
      this.data = Object.create(null);
      this.history = Object.create(null);
      Bus.emit('vars:cleared');
    }
  };

  /** Utilidades compartidas. */
  const Util = {
    uid(prefix) { return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 8); },
    clamp(v, a, b) { return Math.min(b, Math.max(a, v)); },
    esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
    fmt(v, decimals) {
      if (typeof v === 'number') return isFinite(v) ? v.toFixed(decimals == null ? (Number.isInteger(v) ? 0 : 1) : decimals) : '—';
      return v == null || v === '' ? '—' : String(v);
    },
    debounce(fn, ms) { let t; return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); }; },
    throttle(fn, ms) { let last = 0, t; return function (...a) { const now = Date.now(); clearTimeout(t); if (now - last >= ms) { last = now; fn.apply(this, a); } else t = setTimeout(() => { last = Date.now(); fn.apply(this, a); }, ms - (now - last)); }; },
    loadScript(src) {
      return new Promise((res, rej) => {
        if (document.querySelector(`script[src="${src}"]`)) return res();
        const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar ' + src));
        document.head.appendChild(s);
      });
    },
    toast(msg, level, ms) {
      const box = document.getElementById('toasts'); if (!box) return;
      const el = document.createElement('div'); el.className = 'toast ' + (level || 'info'); el.textContent = msg;
      box.appendChild(el);
      setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, ms || 3500);
    },
    /** Reproduce un sonido corto sin archivos (Web Audio). */
    beep(kind) {
      try {
        const ctx = Util._actx || (Util._actx = new (window.AudioContext || window.webkitAudioContext)());
        const seq = { beep: [[880, .12]], ok: [[660, .1], [990, .15]], alarma: [[440, .18], [330, .18], [440, .18], [330, .18]], peligro: [[220, .3], [180, .3]], click: [[1200, .04]] }[kind] || [[880, .12]];
        let t = ctx.currentTime;
        for (const [f, d] of seq) {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = kind === 'peligro' ? 'sawtooth' : 'sine'; o.frequency.value = f;
          g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
          o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + d + 0.02); t += d + 0.03;
        }
      } catch (e) { /* sin audio */ }
    }
  };

  global.Bus = Bus; global.Vars = Vars; global.Util = Util;
})(window);
