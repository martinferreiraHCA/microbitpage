/* ==========================================================================
   runtime.js — Ejecuta el código generado por los bloques con una API segura
   basada en eventos (datos, cambios, temporizadores, botones, cámara).
   ========================================================================== */
(function (global) {
  'use strict';

  const Runtime = {
    running: false, handlers: null, timers: [], unsub: [], errors: 0, lastError: '',

    _fresh() { return { data: [], var: {}, timer: [], button: {}, control: {}, camera: {}, start: [] }; },

    api() {
      const R = this;
      return {
        __budget: 0,
        on(ev, key, fn) {
          const h = R.handlers;
          if (ev === 'data' || ev === 'start') h[ev].push(fn);
          else if (ev === 'timer') h.timer.push({ sec: +key || 1, fn });
          else (h[ev][key] = h[ev][key] || []).push(fn);
        },
        get(name) { return Vars.get(name); },
        set(name, value) { Vars.set(name, value, 'bloques'); },
        has(name) { return Vars.has(name); },
        stat(name, n, kind) { return Vars.stat(name, n, kind); },
        last() { return Vars.lastLine; },
        map(v, a, b, c, d) { v = +v; if (b === a) return c; return c + (v - a) * (d - c) / (b - a); },
        show: Dashboard.api.show, led: Dashboard.api.led, color: Dashboard.api.color, text: Dashboard.api.text,
        visible: Dashboard.api.visible, image: Dashboard.api.image, bg: Dashboard.api.bg,
        alert(level, msg) { Alerts.raise({ level, message: String(msg), source: 'bloques' }); },
        sound(kind) { Util.beep(kind); },
        clearAlerts() { Alerts.clear(); },
        speak(txt) { try { const u = new SpeechSynthesisUtterance(String(txt)); u.lang = 'es-ES'; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) {} },
        notify(txt) {
          if (!('Notification' in window)) return;
          if (Notification.permission === 'granted') new Notification('Panel micro:bit', { body: String(txt) });
          else if (Notification.permission !== 'denied') Notification.requestPermission().then(p => { if (p === 'granted') new Notification('Panel micro:bit', { body: String(txt) }); });
        },
        send(txt) { Serial.send(String(txt)); },
        connected() { return Serial.connected; },
        camClass() { return TM.current || ''; },
        camConf(cls) { return TM.confidence(cls); },
        camToggle(on) { TM.toggle(on); },
      };
    },

    /** Compila y arranca el programa de bloques. */
    start() {
      this.stop();
      const code = Blocks.code();
      this.handlers = this._fresh(); this.errors = 0; this.lastError = '';
      const api = this.api();
      this._api = api;
      try {
        const fn = new Function('api', '"use strict";\n' + code);
        api.__budget = 200000; fn(api);
      } catch (e) {
        this.lastError = e.message; Util.toast('Error en los bloques: ' + e.message, 'error', 6000); console.error(code, e);
        Bus.emit('runtime:status', false); return false;
      }
      this.running = true;
      Dashboard.api.resetStates();
      const run = (fn, ...args) => {
        api.__budget = 200000;
        try { fn(...args); } catch (e) { this.errors++; this.lastError = e.message; if (this.errors <= 3) Util.toast('Error al ejecutar: ' + e.message, 'error', 5000); console.error(e); }
      };
      this.handlers.start.forEach(fn => run(fn));
      this.unsub.push(Bus.on('data', () => this.handlers.data.forEach(fn => run(fn))));
      this.unsub.push(Bus.on('var:changed', name => (this.handlers.var[name] || []).forEach(fn => run(fn))));
      this.unsub.push(Bus.on('widget:button', (id, w) => ((this.handlers.button[w.title] || []).concat(this.handlers.button[id] || [])).forEach(fn => run(fn))));
      this.unsub.push(Bus.on('widget:control', (id, val, w) => ((this.handlers.control[w.title] || []).concat(this.handlers.control[id] || [])).forEach(fn => run(fn, val))));
      this.unsub.push(Bus.on('tm:class', cls => (this.handlers.camera[cls] || []).forEach(fn => run(fn))));
      this.handlers.timer.forEach(t => this.timers.push(setInterval(() => run(t.fn), Math.max(100, t.sec * 1000))));
      Bus.emit('runtime:status', true);
      return true;
    },

    stop() {
      this.timers.forEach(clearInterval); this.timers = [];
      this.unsub.forEach(f => f()); this.unsub = [];
      this.handlers = null;
      if (this.running) { this.running = false; Bus.emit('runtime:status', false); }
    },

    restart() { if (this.running) this.start(); }
  };

  global.Runtime = Runtime;
})(window);
