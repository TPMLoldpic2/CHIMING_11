/* Load after A-Frame. Add rickshaw-animation to the entity using gltf-model. */
(() => {
  'use strict';
  if (!window.AFRAME) throw new Error('請先載入 A-Frame，再載入 rickshaw-animation.js');
  AFRAME.registerComponent('rickshaw-animation', {
    schema: {speed: {type: 'number', default: 1}, enabled: {default: true}},
    init() {
      this.load = () => {
        const mesh = this.el.getObject3D('mesh');
        if (!mesh) return;
        this.dispose();
        const clip = (mesh.animations || []).find(a => a.name === 'Rickshaw_Life');
        if (!clip) { this.el.emit('rickshaw-animation-error', {message: '模型沒有 Rickshaw_Life 動畫'}); return; }
        this.model = mesh;
        this.mixer = new AFRAME.THREE.AnimationMixer(mesh);
        this.mixer.timeScale = Math.max(0, this.data.speed);
        this.action = this.mixer.clipAction(clip);
        this.action.setLoop(AFRAME.THREE.LoopRepeat, Infinity);
        this.action.play();
        this.el.emit('rickshaw-animation-ready', {clip: clip.name});
      };
      this.el.addEventListener('model-loaded', this.load);
      if (this.el.getObject3D('mesh')) this.load();
    },
    update() { if (this.mixer) this.mixer.timeScale = Math.max(0, this.data.speed); },
    tick(time, delta) {
      if (!this.mixer || !this.data.enabled || !delta) return;
      // Pauses while the AR anchor or app hides the model.
      for (let node = this.el.object3D; node; node = node.parent) if (!node.visible) return;
      this.mixer.update(Math.min(delta / 1000, .1));
    },
    dispose() {
      if (this.mixer) { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.model); }
      this.mixer = null; this.action = null; this.model = null;
    },
    remove() { this.el.removeEventListener('model-loaded', this.load); this.dispose(); }
  });
})();
