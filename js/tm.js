/* ==========================================================================
   tm.js — Cámara web + modelo de Teachable Machine (imagen).
   Publica variables: camara_clase, camara_confianza y camara_<clase> (%)
   ========================================================================== */
(function (global) {
  'use strict';

  const TF_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@1.3.1/dist/tf.min.js';
  const TM_URL = 'https://cdn.jsdelivr.net/npm/@teachablemachine/image@0.8.5/dist/teachablemachine-image.min.js';

  const TM = {
    model: null, modelUrl: '', classes: [], preds: [], running: false, owner: null, stream: null, video: null,
    status: '', current: '', _timer: null, _loading: null,

    async ensureLibs() {
      if (global.tmImage) return;
      this.status = 'Cargando librerías de IA…'; Bus.emit('tm:pred');
      await Util.loadScript(TF_URL); await Util.loadScript(TM_URL);
    },

    async loadModel(url) {
      url = String(url || '').trim(); if (!url) { this.model = null; this.classes = []; this.modelUrl = ''; return; }
      if (!url.endsWith('/')) url += '/';
      if (this.model && this.modelUrl === url) return;
      await this.ensureLibs();
      this.status = 'Cargando modelo…'; Bus.emit('tm:pred');
      this.model = await tmImage.load(url + 'model.json', url + 'metadata.json');
      this.modelUrl = url; this.classes = this.model.getClassLabels();
      this.status = 'Modelo listo: ' + this.classes.join(', ');
      Bus.emit('tm:model', this.classes); Bus.emit('tm:pred');
    },

    /* ---------- Modelos entrenados en ML - micro:bit (motor oculto ml/runner.html) ---------- */
    _runner: null, source: '', projectInfo: null, canvas: null, _mlTimer: null,
    async runner() {
      if (this._runner && this._runner.Runner) return this._runner.Runner;
      let f = document.getElementById('ml-runner');
      if (!f) { f = document.createElement('iframe'); f.id = 'ml-runner'; f.title = 'motor ML'; f.setAttribute('allow', 'microphone; camera'); f.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;border:0;'; f.src = 'ml/runner.html'; document.body.appendChild(f); }
      const t0 = Date.now();
      while (!(f.contentWindow && f.contentWindow.Runner)) { if (Date.now() - t0 > 30000) throw new Error('El motor de ML no cargó (¿sin conexión la primera vez?)'); await new Promise(r => setTimeout(r, 100)); }
      this._runner = f.contentWindow; return this._runner.Runner;
    },
    /** Lista de proyectos entrenados (leída directo del almacenamiento de ML - micro:bit). */
    mlProjects() {
      try { return (JSON.parse(localStorage.getItem('ml-microbit-models') || '[]') || []).filter(p => p && p.localModel && p.localModel.storageKey).map(p => ({ id: String(p.id), name: p.name, type: p.projectType, classNames: p.localModel.classNames || p.classNames || [] })); } catch (e) { return []; }
    },

    async startML(w) {
      const R = await this.runner();
      this.status = 'Cargando el modelo entrenado…'; Bus.emit('tm:pred');
      const info = await R.load(w.props.mlProject || '');
      this.projectInfo = info; this.classes = info.classNames.slice(); this.model = null; this.modelUrl = '';
      Bus.emit('tm:model', this.classes);
      if (info.type === 'audio') {
        this.status = 'Escuchando… (' + info.name + ')'; Bus.emit('tm:pred');
        await R.startAudio(preds => this._publish(preds, w));
        return;
      }
      const video = w.el.querySelector('video');
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, facingMode: 'user' }, audio: false });
      video.srcObject = this.stream; await video.play();
      this.video = video;
      this.canvas = this.canvas || document.createElement('canvas');
      this.status = 'Modelo listo: ' + this.classes.join(', '); Bus.emit('tm:pred');
      const overlay = w.el.querySelector('.cam-skeleton');
      const step = async () => {
        if (!this.running || this.owner !== w.id || !this.video) return;
        try {
          // recorte cuadrado centrado y espejo, igual que al entrenar en ML - micro:bit
          const v = this.video, side = Math.min(v.videoWidth, v.videoHeight) || 320, sx = ((v.videoWidth || side) - side) / 2, sy = ((v.videoHeight || side) - side) / 2;
          const c = this.canvas; if (c.width !== 320) { c.width = 320; c.height = 320; }
          const ctx = c.getContext('2d'); ctx.save();
          if (w.props.mirror !== false) { ctx.translate(320, 0); ctx.scale(-1, 1); }
          ctx.drawImage(v, sx, sy, side, side, 0, 0, 320, 320); ctx.restore();
          const preds = await R.predict(c);
          if (preds && preds.length) this._publish(preds, w);
          if (overlay && info.type === 'pose') { overlay.width = 320; overlay.height = 320; const octx = overlay.getContext('2d'); octx.clearRect(0, 0, 320, 320); R.drawSkeleton(octx, 320, 320, false); }
        } catch (e) { console.warn(e); }
        this._mlTimer = setTimeout(step, Math.max(100, +w.props.interval || 300));
      };
      step();
    },

    /** Publica las predicciones como variables del panel y eventos para los bloques. */
    _publish(preds, w) {
      this.preds = preds;
      let best = preds[0]; for (const p of preds) if (p.probability > best.probability) best = p;
      const conf = Math.round(best.probability * 100);
      const values = { clase: best.className, certeza: conf, camara_clase: best.className, camara_confianza: conf };
      preds.forEach(p => { values['camara_' + p.className.replace(/\W+/g, '_').toLowerCase()] = Math.round(p.probability * 100); });
      Vars.setMany(values, 'camara');
      Bus.emit('tm:pred', preds);
      if (best.className !== this.current) {
        this.current = best.className; Bus.emit('tm:class', best.className, best.probability);
        if (w && w.props.sendSerial && conf >= (+w.props.sendMin || 0)) Serial.send('clase:' + best.className + ',certeza:' + conf);
      }
    },

    /** Inicia la cámara dentro del widget w (tipo "camara"). */
    async start(w) {
      try {
        if (this.running) this.stop();
        if ((w.props.source || 'ml') === 'ml') {
          this.owner = w.id; this.running = true; this.source = 'ml'; Bus.emit('tm:status', true);
          await this.startML(w); return;
        }
        this.source = 'tm';
        const video = w.el.querySelector('video');
        this.status = 'Pidiendo permiso de cámara…'; Bus.emit('tm:pred');
        this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' }, audio: false });
        video.srcObject = this.stream; await video.play();
        this.video = video; this.owner = w.id; this.running = true;
        const useTM = w.props.source === 'tm' && w.props.modelUrl;
        this.status = useTM ? 'Cargando modelo…' : 'Cámara activa (sin modelo)';
        Bus.emit('tm:status', true); Bus.emit('tm:pred');
        if (useTM) { await this.loadModel(w.props.modelUrl); this._loop(w); }
      } catch (e) {
        console.error(e); this.status = 'Error: ' + e.message; Util.toast('Cámara/modelo: ' + e.message, 'error', 6000); Bus.emit('tm:pred');
        this.stop();
      }
    },

    _loop(w) {
      clearTimeout(this._timer);
      const step = async () => {
        if (!this.running || !this.model || !this.video) return;
        try {
          const preds = await this.model.predict(this.video);
          this.preds = preds;
          let best = preds[0];
          for (const p of preds) if (p.probability > best.probability) best = p;
          this._publish(preds, w);
        } catch (e) { console.warn(e); }
        this._timer = setTimeout(step, Math.max(100, +w.props.interval || 300));
      };
      step();
    },

    stop() {
      clearTimeout(this._timer); clearTimeout(this._mlTimer); this.running = false; this.owner = null; this.preds = []; this.current = '';
      if (this._runner && this._runner.Runner) { try { this._runner.Runner.stopAudio(); } catch (e) {} }
      this.projectInfo = null;
      if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
      if (this.video) { this.video.srcObject = null; this.video = null; }
      this.status = ''; Bus.emit('tm:status', false); Bus.emit('tm:pred');
    },

    toggle(on) {
      if (on === false || (on === undefined && this.running)) return this.stop();
      const w = Dashboard.byType('camara')[0]; if (w) this.start(w); else Util.toast('Agregá un elemento Cámara al panel', 'warn');
    },
    confidence(cls) { const p = this.preds.find(x => x.className.toLowerCase() === String(cls).toLowerCase()); return p ? Math.round(p.probability * 100) : 0; }
  };

  global.TM = TM;
})(window);
