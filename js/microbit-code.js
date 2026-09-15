/* ==========================================================================
   microbit-code.js — Genera el programa del micro:bit (MakeCode JavaScript y
   MicroPython) que envía los sensores elegidos por serial en formato nombre:valor.
   ========================================================================== */
(function (global) {
  'use strict';

  const SENSORS = {
    temperatura: { label: 'Temperatura (°C)', js: 'input.temperature()', py: 'temperature()' },
    luz: { label: 'Nivel de luz', js: 'input.lightLevel()', py: 'display.read_light_level()' },
    sonido: { label: 'Sonido (micro:bit V2)', js: 'input.soundLevel()', py: 'microphone.sound_level()' },
    acel_x: { label: 'Aceleración X', js: 'input.acceleration(Dimension.X)', py: 'accelerometer.get_x()' },
    acel_y: { label: 'Aceleración Y', js: 'input.acceleration(Dimension.Y)', py: 'accelerometer.get_y()' },
    acel_z: { label: 'Aceleración Z', js: 'input.acceleration(Dimension.Z)', py: 'accelerometer.get_z()' },
    brujula: { label: 'Brújula (grados)', js: 'input.compassHeading()', py: 'compass.heading()' },
    boton_a: { label: 'Botón A (1/0)', js: '(input.buttonIsPressed(Button.A) ? 1 : 0)', py: '(1 if button_a.is_pressed() else 0)' },
    boton_b: { label: 'Botón B (1/0)', js: '(input.buttonIsPressed(Button.B) ? 1 : 0)', py: '(1 if button_b.is_pressed() else 0)' },
    p0: { label: 'Pin P0 analógico', js: 'pins.analogReadPin(AnalogPin.P0)', py: 'pin0.read_analog()' },
    p1: { label: 'Pin P1 analógico', js: 'pins.analogReadPin(AnalogPin.P1)', py: 'pin1.read_analog()' },
    p2: { label: 'Pin P2 analógico', js: 'pins.analogReadPin(AnalogPin.P2)', py: 'pin2.read_analog()' },
    p0_digital: { label: 'Pin P0 digital', js: 'pins.digitalReadPin(DigitalPin.P0)', py: 'pin0.read_digital()' },
    logo: { label: 'Logo tocado (V2)', js: '(input.logoIsPressed() ? 1 : 0)', py: '(1 if pin_logo.is_touched() else 0)' },
  };

  const MicrobitCode = {
    SENSORS,
    rows: [{ name: 'temp', sensor: 'temperatura' }, { name: 'luz', sensor: 'luz' }],
    interval: 500, receive: true, mlEvent: false,

    makecode() {
      const L = [];
      L.push('// Programa generado por micro:bit Panel Lab', '// Envía los sensores por serial en formato nombre:valor', 'serial.setBaudRate(BaudRate.BaudRate115200)', '');
      if (this.receive) {
        L.push('// Recibe órdenes del panel (ej: "led:1")', 'serial.onDataReceived(serial.delimiters(Delimiters.NewLine), function () {',
          '    let linea = serial.readUntil(serial.delimiters(Delimiters.NewLine)).trim()',
          '    let partes = linea.split(":")',
          '    if (partes[0] == "led") {',
          '        if (parseInt(partes[1]) == 1) basic.showIcon(IconNames.Heart)',
          '        else basic.clearScreen()',
          '    } else {',
          '        basic.showString(linea)',
          '    }', '})', '');
      }
      if (this.mlEvent) {
        L.push('// Con ml-microbit (CreateAI): dentro de cada evento de la extensión ML', '// agregá un bloque "serial write line" con el nombre de la clase:', '// ml.onStart(ml.event.Saltando, function () { serial.writeLine("clase:saltando") })', '');
      }
      L.push('basic.forever(function () {');
      this.rows.forEach(r => { const s = SENSORS[r.sensor]; if (s && r.name) L.push(`    serial.writeValue("${r.name}", ${s.js})`); });
      L.push(`    basic.pause(${Math.max(50, +this.interval || 500)})`, '})');
      return L.join('\n');
    },

    python() {
      const L = ['# Programa generado por micro:bit Panel Lab', '# Envía los sensores por serial en formato nombre:valor', 'from microbit import *', 'import music', '', 'uart.init(baudrate=115200)', ''];
      L.push('while True:');
      const parts = this.rows.filter(r => SENSORS[r.sensor] && r.name).map(r => `"${r.name}:" + str(${SENSORS[r.sensor].py})`);
      L.push('    linea = ' + (parts.length ? parts.join(' + "," + ') : '""'));
      L.push('    print(linea)');
      if (this.receive) {
        L.push('    if uart.any():', '        orden = str(uart.readline(), "utf-8").strip()', '        if orden == "led:1":', '            display.show(Image.HEART)', '        elif orden == "led:0":', '            display.clear()', '        elif orden:', '            display.scroll(orden)');
      }
      L.push(`    sleep(${Math.max(50, +this.interval || 500)})`);
      return L.join('\n');
    },

    /** Interfaz dentro de un contenedor. */
    render(el) {
      const draw = () => {
        el.innerHTML = `
          <p class="muted">Elegí qué sensores va a enviar el micro:bit. El panel los recibe con esos nombres. Copiá el código en <a href="https://makecode.microbit.org" target="_blank" rel="noopener">MakeCode</a> (JavaScript) o en <a href="https://python.microbit.org" target="_blank" rel="noopener">Python Editor</a> y descargalo al micro:bit.</p>
          <table class="mc-rows"><thead><tr><th>Nombre en el panel</th><th>Sensor</th><th></th></tr></thead><tbody>
          ${this.rows.map((r, i) => `<tr><td><input data-i="${i}" data-k="name" value="${Util.esc(r.name)}"></td><td><select data-i="${i}" data-k="sensor">${Object.keys(SENSORS).map(k => `<option value="${k}" ${r.sensor === k ? 'selected' : ''}>${SENSORS[k].label}</option>`).join('')}</select></td><td><button class="mini danger" data-del="${i}">✕</button></td></tr>`).join('')}
          </tbody></table>
          <div class="row"><button class="mini" data-add>+ Agregar sensor</button>
            <label>Cada <input type="number" data-interval value="${this.interval}" min="50" step="50" style="width:70px"> ms</label>
            <label><input type="checkbox" data-receive ${this.receive ? 'checked' : ''}> recibir órdenes del panel</label>
            <label><input type="checkbox" data-ml ${this.mlEvent ? 'checked' : ''}> nota para ml-microbit (CreateAI)</label></div>
          <div class="mc-tabs"><button class="mini active" data-tab="js">MakeCode (JavaScript)</button><button class="mini" data-tab="py">MicroPython</button><button class="mini" data-copy>📋 Copiar</button></div>
          <pre class="code" data-code></pre>`;
        const pre = el.querySelector('[data-code]'); let tab = 'js';
        const show = () => { pre.textContent = tab === 'js' ? this.makecode() : this.python(); };
        show();
        el.querySelectorAll('[data-k]').forEach(inp => inp.addEventListener('change', () => { this.rows[+inp.dataset.i][inp.dataset.k] = inp.value.trim(); if (inp.dataset.k === 'name') this.syncSim(); show(); }));
        el.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => { this.rows.splice(+b.dataset.del, 1); this.syncSim(); draw(); }));
        el.querySelector('[data-add]').addEventListener('click', () => { this.rows.push({ name: 'sensor' + (this.rows.length + 1), sensor: 'p0' }); this.syncSim(); draw(); });
        el.querySelector('[data-interval]').addEventListener('change', ev => { this.interval = +ev.target.value; show(); });
        el.querySelector('[data-receive]').addEventListener('change', ev => { this.receive = ev.target.checked; show(); });
        el.querySelector('[data-ml]').addEventListener('change', ev => { this.mlEvent = ev.target.checked; show(); });
        el.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; el.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('active', x === b)); show(); }));
        el.querySelector('[data-copy]').addEventListener('click', () => { navigator.clipboard.writeText(pre.textContent).then(() => Util.toast('Código copiado ✔', 'ok')); });
      };
      draw();
    },

    /** Mantiene el simulador con los mismos nombres de variables. */
    syncSim() {
      const ranges = { temperatura: [15, 35], luz: [0, 255], sonido: [0, 255], acel_x: [-1024, 1024], acel_y: [-1024, 1024], acel_z: [-1024, 1024], brujula: [0, 359], boton_a: [0, 1], boton_b: [0, 1], p0: [0, 1023], p1: [0, 1023], p2: [0, 1023], p0_digital: [0, 1], logo: [0, 1] };
      Simulator.vars = this.rows.filter(r => r.name).map(r => ({ name: r.name, min: (ranges[r.sensor] || [0, 100])[0], max: (ranges[r.sensor] || [0, 100])[1] }));
      Bus.emit('dash:changed');
    }
  };

  global.MicrobitCode = MicrobitCode;
})(window);
