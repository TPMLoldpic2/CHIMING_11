/* Pose stabilization for the bundled MindAR 1.2.5 anchor, before child gestures. */
(() => {
  'use strict';
  const THREE = AFRAME.THREE;
  class PoseStabilizer {
    constructor() {
      this.matrix = new THREE.Matrix4();
      this.current = this.pose(); this.target = this.pose();
      this.accepted = this.pose(); this.sample = this.pose(); this.pending = this.pose();
      this.reset();
    }
    pose() { return {p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3()}; }
    copy(to, from) { to.p.copy(from.p); to.q.copy(from.q); to.s.copy(from.s); }
    reset() { this.hasPose = false; this.pendingCount = 0; }
    difference(a, b) {
      const width = Math.max(.000001, b.s.x);
      return {position: a.p.distanceTo(b.p) / width, angle: a.q.angleTo(b.q), scale: Math.abs(a.s.x / width - 1)};
    }
    ingest(matrix) {
      if (!matrix.elements.every(Number.isFinite)) return false;
      matrix.decompose(this.sample.p, this.sample.q, this.sample.s);
      const size = (this.sample.s.x + this.sample.s.y + this.sample.s.z) / 3;
      if (!Number.isFinite(size) || size <= 0 || this.sample.q.lengthSq() < .5) return false;
      this.sample.q.normalize(); this.sample.s.setScalar(size);
      if (!this.hasPose) {
        for (const destination of [this.current, this.target, this.accepted]) this.copy(destination, this.sample);
        this.hasPose = true; this.pendingCount = 0; this.compose(); return true;
      }
      const jump = this.difference(this.sample, this.accepted);
      if (jump.position > .12 || jump.angle > Math.PI / 12 || jump.scale > .12) {
        const next = this.difference(this.sample, this.pending);
        if (this.pendingCount && next.position < .06 && next.angle < Math.PI / 22.5 && next.scale < .06) this.pendingCount++;
        else this.pendingCount = 1;
        this.copy(this.pending, this.sample);
        if (this.pendingCount < 3) return false;
      }
      this.pendingCount = 0;
      this.copy(this.accepted, this.sample);
      const small = this.difference(this.sample, this.current);
      // Hold very small changes independently, without quantizing user gestures.
      this.target.p.copy(small.position < .0025 ? this.current.p : this.sample.p);
      this.target.q.copy(small.angle < .35 * Math.PI / 180 ? this.current.q : this.sample.q);
      this.target.s.copy(small.scale < .0025 ? this.current.s : this.sample.s);
      return true;
    }
    step(deltaMs) {
      if (!this.hasPose || !Number.isFinite(deltaMs) || deltaMs <= 0) return;
      const change = this.difference(this.target, this.current);
      const moving = change.position > .035 || change.angle > 4 * Math.PI / 180 || change.scale > .025;
      const seconds = Math.min(deltaMs / 1000, .05);
      const alpha = 1 - Math.exp(-seconds / (moving ? .07 : .18));
      this.current.p.lerp(this.target.p, alpha);
      this.current.q.slerp(this.target.q, alpha).normalize();
      this.current.s.lerp(this.target.s, alpha);
      this.compose();
    }
    compose() { this.matrix.compose(this.current.p, this.current.q, this.current.s); }
  }
  window.PostcardPoseStabilizer = PoseStabilizer;
  AFRAME.registerComponent('pose-stability', {
    dependencies: ['mindar-image-target'],
    init() {
      this.anchor = this.el.components['mindar-image-target'];
      this.filter = new PoseStabilizer();
      this.raw = new THREE.Matrix4(); this.display = new THREE.Matrix4();
      this.frozen = false; this.detected = false; this.latest = null;
      this.original = this.anchor.updateWorldMatrix;
      this.adapter = matrix => this.receive(matrix);
      this.anchor.updateWorldMatrix = this.adapter;
    },
    receive(elements) {
      const detected = elements !== null;
      const changed = detected !== this.detected;
      this.detected = detected;
      this.latest = detected ? Array.from(elements) : null;
      if (detected && !this.frozen && this.anchor.postMatrix) {
        this.raw.fromArray(elements).multiply(this.anchor.postMatrix);
        this.filter.ingest(this.raw);
      } else if (!detected && !this.frozen) this.filter.reset();
      this.present();
      this.el.emit('targetUpdate');
      if (changed) this.el.emit(detected ? 'targetFound' : 'targetLost');
    },
    present() {
      const object = this.el.object3D;
      object.visible = this.filter.hasPose && (this.detected || this.frozen);
      if (object.visible) {
        this.display.copy(this.filter.matrix);
        object.matrix = this.display;
      } else object.matrix = this.anchor.invisibleMatrix;
      object.matrixWorldNeedsUpdate = true;
    },
    tick(time, delta) {
      if (!this.frozen && this.detected) this.filter.step(delta);
      this.present();
    },
    setFrozen(value) {
      if (value && !this.filter.hasPose) return false;
      this.frozen = Boolean(value);
      if (!this.frozen) {
        this.filter.reset();
        if (this.latest && this.anchor.postMatrix) {
          this.raw.fromArray(this.latest).multiply(this.anchor.postMatrix);
          this.filter.ingest(this.raw);
        }
      }
      this.present();
      return true;
    },
    reset() {
      this.frozen = false; this.detected = false; this.latest = null;
      this.filter.reset(); this.present();
    },
    remove() {
      if (this.anchor.updateWorldMatrix === this.adapter) this.anchor.updateWorldMatrix = this.original;
      this.reset();
    }
  });
})();
