/* ==========================================================================
   project.js — Guardar / cargar proyectos (archivo .json descargable,
   autoguardado en el navegador, carga desde URL y enlace compartible).
   ========================================================================== */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'mbpanel:autosave';
  const VERSION = 1;

  const Project = {
    name: 'Mi panel micro:bit', notes: '', _autosave: null, dirty: false,

    serialize() {
      return {
        app: 'microbit-panel-lab', version: VERSION, name: this.name, notes: this.notes, saved: new Date().toISOString(),
        serial: { baud: Serial.config.baud, columns: Serial.config.columns.slice() },
        sim: { vars: JSON.parse(JSON.stringify(Simulator.vars)), interval: Simulator.interval },
        dashboard: Dashboard.serialize(),
        blocks: Blocks.ws ? Blocks.serialize() : {},
        alerts: { sound: Alerts.sound },
        autorun: App.autorun,
      };
    },

    load(p) {
      if (!p || typeof p !== 'object') return false;
      if (p.app && p.app !== 'microbit-panel-lab') Util.toast('Este archivo no parece un proyecto del panel', 'warn');
      Runtime.stop();
      this.name = p.name || 'Mi panel micro:bit'; this.notes = p.notes || '';
      if (p.serial) { Serial.config.baud = +p.serial.baud || 115200; Serial.config.columns = (p.serial.columns || []).slice(); }
      if (p.sim) { if (Array.isArray(p.sim.vars) && p.sim.vars.length) Simulator.vars = p.sim.vars; if (p.sim.interval) Simulator.interval = p.sim.interval; }
      if (p.alerts) Alerts.sound = p.alerts.sound !== false;
      Dashboard.load(p.dashboard || {});
      if (Blocks.ws) Blocks.load(p.blocks || {});
      App.autorun = p.autorun !== false;
      Bus.emit('project:loaded', p);
      this.dirty = false; this.autosaveNow();
      if (App.autorun) setTimeout(() => Runtime.start(), 50);
      return true;
    },

    reset() {
      Runtime.stop(); Vars.clear(); Alerts.clear();
      this.load({ name: 'Mi panel micro:bit', dashboard: { widgets: [] }, blocks: {} });
    },

    /* ---- archivo ---- */
    download() {
      const data = JSON.stringify(this.serialize(), null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = (this.name || 'panel').replace(/[^\w\-áéíóúñ ]+/gi, '').trim().replace(/\s+/g, '_') + '.microbit-panel.json';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      this.dirty = false; Util.toast('Proyecto descargado ✔', 'ok');
    },
    upload() {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
      inp.onchange = () => { const f = inp.files[0]; if (!f) return; f.text().then(t => { try { this.load(JSON.parse(t)); Util.toast('Proyecto cargado: ' + this.name, 'ok'); } catch (e) { Util.toast('Archivo inválido: ' + e.message, 'error'); } }); };
      inp.click();
    },
    async loadFromUrl(url) {
      try { const r = await fetch(url); if (!r.ok) throw new Error(r.status + ' ' + r.statusText); this.load(await r.json()); Util.toast('Proyecto cargado desde URL', 'ok'); return true; }
      catch (e) { Util.toast('No se pudo cargar el proyecto: ' + e.message, 'error', 6000); return false; }
    },

    /* ---- autoguardado ---- */
    autosaveNow() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.serialize())); } catch (e) { /* cuota llena */ } },
    scheduleAutosave() { this.dirty = true; clearTimeout(this._autosave); this._autosave = setTimeout(() => this.autosaveNow(), 800); },
    restoreAutosave() { try { const s = localStorage.getItem(STORAGE_KEY); if (s) { const p = JSON.parse(s); if (p && p.dashboard) return p; } } catch (e) {} return null; },

    /* ---- enlace compartible (comprimido en el hash) ---- */
    async shareLink() {
      const json = JSON.stringify(this.serialize());
      let b64;
      if (global.CompressionStream) {
        const cs = new CompressionStream('gzip'); const w = cs.writable.getWriter(); w.write(new TextEncoder().encode(json)); w.close();
        const buf = await new Response(cs.readable).arrayBuffer();
        b64 = 'gz.' + btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      } else b64 = 'raw.' + btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const url = location.origin + location.pathname + '#p=' + b64;
      if (url.length > 60000) { Util.toast('El proyecto es muy grande para un enlace (¿imagen de fondo?). Descargalo como archivo.', 'warn', 6000); return null; }
      return url;
    },
    async loadFromHash(hash) {
      const m = /[#&]p=([^&]+)/.exec(hash || location.hash); if (!m) return false;
      try {
        let s = m[1]; const raw = s.startsWith('raw.'); s = s.replace(/^(gz|raw)\./, '').replace(/-/g, '+').replace(/_/g, '/');
        const bin = Uint8Array.from(atob(s), c => c.charCodeAt(0));
        let json;
        if (raw) json = new TextDecoder().decode(bin);
        else { const ds = new DecompressionStream('gzip'); const w = ds.writable.getWriter(); w.write(bin); w.close(); json = await new Response(ds.readable).text(); }
        this.load(JSON.parse(json)); Util.toast('Proyecto cargado desde el enlace', 'ok'); return true;
      } catch (e) { Util.toast('Enlace inválido: ' + e.message, 'error'); return false; }
    },

    /** Lee una imagen y la reduce a maxSize px para que quepa en el archivo del proyecto. */
    readImageFile(file, maxSize) {
      return new Promise((res, rej) => {
        const img = new Image(); const url = URL.createObjectURL(file);
        img.onload = () => {
          const s = Math.min(1, (maxSize || 1280) / Math.max(img.width, img.height));
          const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
          res(c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85));
        };
        img.onerror = () => rej(new Error('Imagen inválida')); img.src = url;
      });
    }
  };

  global.Project = Project;
})(window);
