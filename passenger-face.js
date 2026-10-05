/* The portrait is attached in head-local space, so the GLB animation carries it. */
(() => {
  'use strict';
  const THREE = AFRAME.THREE;
  const listeners = new Set();
  const portrait = {
    canvas: null, version: 0,
    set(canvas) {
      this.canvas = canvas; this.version++;
      for (const listener of listeners) listener();
    },
    clear() { this.set(null); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  };
  window.PassengerPortrait = portrait;

  // An ellipsoidal front surface, not a rectangular billboard. UVs correspond
  // exactly to the oval in the photo editor (canvas y is inverted by flipY).
  function faceGeometry() {
    const positions = [0, .085, .122], uv = [.5, .5], indices = [];
    const rings = 24, segments = 64;
    for (let ring = 1; ring <= rings; ring++) {
      const radius = Math.sin(ring / rings * Math.PI / 2);
      for (let segment = 0; segment < segments; segment++) {
        const angle = segment / segments * Math.PI * 2;
        const x = radius * Math.cos(angle), y = radius * Math.sin(angle);
        positions.push(.129 * x, .085 + .169 * y, .119 * Math.sqrt(Math.max(0, 1 - radius * radius)) + .003);
        uv.push(.5 + .44 * x, .5 + .46 * y);
      }
    }
    for (let segment = 0; segment < segments; segment++) indices.push(0, 1 + segment, 1 + (segment + 1) % segments);
    for (let ring = 1; ring < rings; ring++) for (let segment = 0; segment < segments; segment++) {
      const a = 1 + (ring - 1) * segments + segment;
      const b = 1 + (ring - 1) * segments + (segment + 1) % segments;
      const c = 1 + ring * segments + segment;
      const d = 1 + ring * segments + (segment + 1) % segments;
      indices.push(a, c, d, a, d, b);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    return geometry;
  }

  function skinColor(canvas) {
    // Sample the cheeks to give the replacement ears/neck a related skin tone.
    const ctx = canvas.getContext('2d'), sums = [0, 0, 0]; let count = 0;
    for (const fraction of [.32, .68]) {
      const pixels = ctx.getImageData(Math.round(canvas.width * fraction) - 4, Math.round(canvas.height * .58) - 4, 8, 8).data;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 240) {
        for (let j = 0; j < 3; j++) sums[j] += pixels[i + j];
        count++;
      }
    }
    return count ? new THREE.Color().setRGB(...sums.map(n => n / count / 255), THREE.SRGBColorSpace) : new THREE.Color(.69, .47, .3);
  }

  AFRAME.registerComponent('passenger-face', {
    init() {
      this.restore = [];
      this.onLoad = () => { this.detach(); this.apply(); };
      this.el.addEventListener('model-loaded', this.onLoad);
      this.unsubscribe = portrait.subscribe(() => { this.detach(); this.apply(); });
      this.apply();
    },
    apply() {
      const model = this.el.getObject3D('mesh');
      if (!portrait.canvas || !model) return;
      const head = model.getObjectByName('Rickshaw_Passenger_Head');
      if (!head) { this.el.emit('passenger-face-error', {message: '找不到乘客頭部，請確認模型版本。'}); return; }
      // Original skin mesh includes the nose; original dark mesh includes eyes.
      // Replace them together to avoid two noses/eyes sticking through the photo.
      for (const child of head.children) if (['Rickshaw_Passenger_Head__12', 'Rickshaw_Passenger_Head__13', 'Rickshaw_Passenger_Head__2'].includes(child.name)) {
        this.restore.push([child, child.visible]); child.visible = false;
      }
      this.group = new THREE.Group(); this.group.name = 'Visitor_Portrait';
      this.skinMaterial = new THREE.MeshStandardMaterial({color: skinColor(portrait.canvas), roughness: .95});
      const sphere = (name, x, y, z, sx, sy, sz) => {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), this.skinMaterial);
        mesh.name = name; mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); this.group.add(mesh);
      };
      sphere('Visitor_Head', 0, .085, 0, .128, .168, .117);
      for (const side of [-1, 1]) sphere('Visitor_Ear_' + side, side * .126, .085, 0, .024, .046, .027);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(.060, .060, .16, 24), this.skinMaterial);
      neck.position.set(0, -.07, 0); this.group.add(neck);
      this.texture = new THREE.CanvasTexture(portrait.canvas);
      this.texture.colorSpace = THREE.SRGBColorSpace;
      this.texture.anisotropy = Math.min(4, this.el.sceneEl?.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
      this.faceMaterial = new THREE.MeshBasicMaterial({map: this.texture, transparent: true, alphaTest: .02, side: THREE.FrontSide, toneMapped: false});
      const face = new THREE.Mesh(faceGeometry(), this.faceMaterial); face.name = 'Visitor_Photo_Face';
      this.group.add(face); head.add(this.group);
      this.el.emit('passenger-face-ready', {version: portrait.version});
    },
    detach() {
      if (this.group) {
        this.group.removeFromParent();
        this.group.traverse(object => { if (object.isMesh) object.geometry.dispose(); });
      }
      this.texture?.dispose(); this.faceMaterial?.dispose(); this.skinMaterial?.dispose();
      this.group = this.texture = this.faceMaterial = this.skinMaterial = null;
      for (const [object, visible] of this.restore) object.visible = visible;
      this.restore = [];
    },
    remove() { this.unsubscribe(); this.el.removeEventListener('model-loaded', this.onLoad); this.detach(); }
  });
})();
