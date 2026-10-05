/* glTF uses metres and Y-up; the parent rotates the ground onto the target image. */
if (window.AFRAME) {
  AFRAME.registerComponent('fit-to-postcard', {
    schema: {width: {type: 'number', default: 1}},
    init() {
      this.fit = () => {
        const mesh = this.el.getObject3D('mesh');
        if (!mesh) return;
        try {
          // Measure an isolated copy so the AR anchor rotation/scale cannot affect
          // the model's local dimensions or its ground height.
          const probe = mesh.clone(true);
          probe.updateMatrixWorld(true);
          const bounds = new AFRAME.THREE.Box3().setFromObject(probe);
          const size = bounds.getSize(new AFRAME.THREE.Vector3());
          const center = bounds.getCenter(new AFRAME.THREE.Vector3());
          if (!Number.isFinite(size.x) || size.x <= 0) throw new Error('模型尺寸無效');
          const k = this.data.width / size.x;
          mesh.scale.setScalar(k);
          mesh.position.set(-center.x * k, -bounds.min.y * k, -center.z * k);
          mesh.updateMatrixWorld(true);
          this.el.emit('postcard-model-ready', {scale: k});
        } catch (error) {
          this.el.emit('model-error', {error});
        }
      };
      this.el.addEventListener('model-loaded', this.fit);
      if (this.el.getObject3D('mesh')) this.fit();
    },
    remove() { this.el.removeEventListener('model-loaded', this.fit); }
  });
}
