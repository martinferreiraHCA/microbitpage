/* ==========================================================================
   serial.js — Conexión con micro:bit por Web Serial, parser de líneas,
   simulador de datos y puente postMessage para páginas que nos embeben.
   ========================================================================== */
(function (global) {
  'use strict';

  /** Parser de líneas recibidas.  Formatos aceptados (se detectan solos):
   *   temp:23,luz:400        (serial.writeValue de MakeCode)
   *   temp=23;luz=400
   *   {"temp":23,"luz":400}  (JSON)
   *   23,400                 (CSV -> nombres de columnas configurados o v1, v2...)
   *   hola                   (texto suelto -> variable "mensaje")
   */
  function parseLine(line, columns) {
    const out = {};
    const t = String(line).trim();
    if (!t) return out;
    if (t[0] === '{') {
      try { const o = JSON.parse(t); for (const k in o) out[k] = o[k]; return out; } catch (e) { /* sigue */ }
    }
    const tokens = t.split(/[,;|\t]+|\s{2,}|\s(?=[A-Za-z_]\w*\s*[:=])/).map(s => s.trim()).filter(Boolean);
    let csvIdx = 0, kv = false;
    for (const tok of tokens) {
      const m = tok.match(/^([A-Za-z_][\w.\-]*)\s*[:=]\s*(.*)$/);
      if (m) { out[m[1]] = m[2]; kv = true; continue; }
      if (/^[-+]?\d*\.?\d+([eE][-+]?\d+)?$/.test(tok)) {
        const name = (columns && columns[csvIdx]) || ('v' + (csvIdx + 1));
        out[name] = tok; csvIdx++; continue;
      }
      out.mensaje = tok;
    }
    if (!kv && csvIdx === 0 && tokens.length > 1) out.mensaje = t;
    return out;
  }

  const Serial = {
    config: { baud: 115200, columns: [] },
    port: null, reader: null, writer: null, connected: false, _keep: false,
    supported: !!navigator.serial,

    async connect() {
      if (!navigator.serial) { Util.toast('Este navegador no soporta Web Serial. Usá Chrome o Edge.', 'error', 6000); return false; }
      try {
        this.port = await navigator.serial.requestPort({ filters: [{ usbVendorId: 0x0d28 }] }).catch(async e => {
          if (e.name === 'NotFoundError') return null; throw e;
        });
        if (!this.port) return false;
        await this.port.open({ baudRate: this.config.baud || 115200 });
        this.connected = true; this._keep = true;
        Bus.emit('serial:status', true);
        this._readLoop();
        Util.toast('micro:bit conectado ✔', 'ok');
        return true;
      } catch (e) {
        console.error(e);
        Util.toast('No se pudo abrir el puerto: ' + e.message, 'error', 6000);
        this.connected = false; Bus.emit('serial:status', false);
        return false;
      }
    },

    async _readLoop() {
      const decoder = new TextDecoderStream();
      const closed = this.port.readable.pipeTo(decoder.writable).catch(() => {});
      this.reader = decoder.readable.getReader();
      let buf = '';
      try {
        while (this._keep) {
          const { value, done } = await this.reader.read();
          if (done) break;
          buf += value;
          let i;
          while ((i = buf.search(/\r?\n/)) >= 0) {
            const line = buf.slice(0, i); buf = buf.slice(i + (buf[i] === '\r' ? 2 : 1));
            if (line.trim()) this.onLine(line, 'serial');
          }
        }
      } catch (e) { console.warn('Lectura serial terminada', e); }
      finally {
        try { this.reader.releaseLock(); } catch (e) {}
        await closed;
        if (this.connected) { this.connected = false; Bus.emit('serial:status', false); Util.toast('micro:bit desconectado', 'warn'); }
      }
    },

    async disconnect() {
      this._keep = false;
      try { if (this.reader) await this.reader.cancel(); } catch (e) {}
      try { if (this.port) await this.port.close(); } catch (e) {}
      this.port = null; this.connected = false; Bus.emit('serial:status', false);
    },

    /** Envía texto al micro:bit (se agrega salto de línea). Si no hay puerto, avisa al host (postMessage). */
    async send(text) {
      const line = String(text).replace(/\r?\n$/, '') + '\n';
      Bus.emit('serial:sent', line.trim());
      if (this.connected && this.port && this.port.writable) {
        try {
          const w = this.port.writable.getWriter();
          await w.write(new TextEncoder().encode(line));
          w.releaseLock();
          return true;
        } catch (e) { console.error(e); Util.toast('Error al enviar: ' + e.message, 'error'); }
      }
      Bridge.post({ type: 'mbp:send', text: line.trim() });
      return false;
    },

    /** Procesa una línea (venga del puerto, del simulador o de la página host). */
    onLine(line, source) {
      Vars.lastLine = line;
      Bus.emit('serial:line', line, source);
      const obj = parseLine(line, this.config.columns);
      if (Object.keys(obj).length) Vars.setMany(obj, source);
    }
  };

  /** Simulador: genera datos de prueba para trabajar sin micro:bit. */
  const Simulator = {
    running: false, _t: null, tick: 0,
    vars: [ { name: 'temp', min: 15, max: 35 }, { name: 'luz', min: 0, max: 255 }, { name: 'sonido', min: 0, max: 255 } ],
    interval: 700,
    start() {
      if (this.running) return;
      this.running = true;
      this._t = setInterval(() => this.step(), this.interval);
      Bus.emit('sim:status', true);
    },
    stop() { clearInterval(this._t); this.running = false; Bus.emit('sim:status', false); },
    toggle() { this.running ? this.stop() : this.start(); },
    step() {
      this.tick++;
      const parts = [];
      this.vars.forEach((v, i) => {
        const mid = (v.min + v.max) / 2, amp = (v.max - v.min) / 2;
        const val = mid + amp * 0.8 * Math.sin(this.tick / (6 + i * 3) + i) + (Math.random() - 0.5) * amp * 0.15;
        parts.push(v.name + ':' + (Number.isInteger(v.min) && Number.isInteger(v.max) && v.max - v.min > 50 ? Math.round(val) : val.toFixed(1)));
      });
      Serial.onLine(parts.join(','), 'sim');
    }
  };

  /** Puente postMessage: permite que otra página (ej. un generador de código de micro:bit
   *  como ml-microbit / MakeCode con nuestra página en un <iframe>) nos mande datos y
   *  reciba lo que los bloques quieren enviar al micro:bit. */
  const Bridge = {
    embedded: window.parent !== window,
    post(msg) { if (this.embedded) { try { window.parent.postMessage(msg, '*'); } catch (e) {} } },
    init() {
      window.addEventListener('message', ev => {
        const d = ev.data; if (!d || typeof d !== 'object' || typeof d.type !== 'string' || !d.type.startsWith('mbp:')) return;
        switch (d.type) {
          case 'mbp:data':      // { type:'mbp:data', line:'temp:23,luz:400' }
            if (typeof d.line === 'string') Serial.onLine(d.line, 'host');
            else if (d.values && typeof d.values === 'object') Vars.setMany(d.values, 'host');
            break;
          case 'mbp:setVar': Vars.set(d.name, d.value, 'host'); break;
          case 'mbp:load': if (d.project) Project.load(d.project); break;
          case 'mbp:mode': App.setMode(d.mode === 'panel' ? 'panel' : 'editor'); break;
          case 'mbp:run': d.run === false ? Runtime.stop() : Runtime.start(); break;
          case 'mbp:getProject': this.post({ type: 'mbp:project', project: Project.serialize() }); break;
        }
      });
      Bus.on('var', (name, value) => this.post({ type: 'mbp:var', name, value }));
      Bus.on('alert', a => this.post({ type: 'mbp:alert', alert: a }));
      this.post({ type: 'mbp:ready' });
    }
  };

  Serial.parseLine = parseLine;
  global.Serial = Serial; global.Simulator = Simulator; global.Bridge = Bridge;
})(window);
