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

    /** Inicia la cámara dentro del widget w (tipo "camara"). */
    async start(w) {
      try {
        if (this.running) this.stop();
        const video = w.el.querySelector('video');
        this.status = 'Pidiendo permiso de cámara…'; Bus.emit('tm:pred');
        this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' }, audio: false });
        video.srcObject = this.stream; await video.play();
        this.video = video; this.owner = w.id; this.running = true;
        this.status = w.props.modelUrl ? 'Cargando modelo…' : 'Cámara activa (sin modelo)';
        Bus.emit('tm:status', true); Bus.emit('tm:pred');
        if (w.props.modelUrl) { await this.loadModel(w.props.modelUrl); this._loop(w); }
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
          const values = { camara_clase: best.className, camara_confianza: Math.round(best.probability * 100) };
          preds.forEach(p => { values['camara_' + p.className.replace(/\W+/g, '_').toLowerCase()] = Math.round(p.probability * 100); });
          Vars.setMany(values, 'camara');
          Bus.emit('tm:pred', preds);
          if (best.className !== this.current) { this.current = best.className; Bus.emit('tm:class', best.className, best.probability); }
        } catch (e) { console.warn(e); }
        this._timer = setTimeout(step, Math.max(100, +w.props.interval || 300));
      };
      step();
    },

    stop() {
      clearTimeout(this._timer); this.running = false; this.owner = null; this.preds = []; this.current = '';
      if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
      if (this.video) { this.video.srcObject = null; this.video = null; }
      this.status = ''; Bus.emit('tm:status', false); Bus.emit('tm:pred');
    },

    toggle(on) {
      if (on === false || (on === undefined && this.running)) return this.stop();
      const w = Dashboard.byType('camara')[0]; if (w) this.start(w); else Util.toast('Agregá un widget de cámara al panel', 'warn');
    },
    confidence(cls) { const p = this.preds.find(x => x.className.toLowerCase() === String(cls).toLowerCase()); return p ? Math.round(p.probability * 100) : 0; }
  };

  global.TM = TM;
})(window);
