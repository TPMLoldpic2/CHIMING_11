/* Directly manipulate the model; the camera image and AR anchor are untouched. */
(() => {
  'use strict';
  class PostcardGestures {
    constructor(surface, {isEnabled, readSettings, onChange, onEnd = () => {}}) {
      Object.assign(this, {surface, isEnabled, readSettings, onChange, onEnd});
      this.points = new Map();
      this.origin = null;
      this.handlers = {
        pointerdown: event => this.down(event),
        pointermove: event => this.move(event),
        pointerup: event => this.up(event),
        pointercancel: event => this.up(event),
        lostpointercapture: event => this.up(event)
      };
      for (const [name, handler] of Object.entries(this.handlers)) surface.addEventListener(name, handler);
    }
    pair() {
      const [a, b] = this.points.values();
      return {distance: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x)};
    }
    rebase() {
      const settings = this.readSettings();
      if (this.points.size === 1) this.origin = {...settings, ...this.points.values().next().value};
      else if (this.points.size === 2) {
        const pair = this.pair();
        this.origin = pair.distance >= 12 ? {...settings, ...pair, lastAngle: pair.angle, turn: 0} : null;
      } else this.origin = null;
    }
    down(event) {
      if (!this.isEnabled() || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault();
      this.points.set(event.pointerId, {x: event.clientX, y: event.clientY});
      try { this.surface.setPointerCapture(event.pointerId); } catch (_) {}
      this.rebase();
    }
    move(event) {
      if (!this.points.has(event.pointerId)) return;
      if (!this.isEnabled()) { this.cancel(); return; }
      event.preventDefault();
      this.points.set(event.pointerId, {x: event.clientX, y: event.clientY});
      if (!this.origin) { this.rebase(); return; }
      const wrap = degrees => ((degrees + 180) % 360 + 360) % 360 - 180;
      if (this.points.size === 1) {
        this.onChange({size: this.origin.size, yaw: wrap(this.origin.yaw + (event.clientX - this.origin.x) * .35),
          pitch: Math.max(-85, Math.min(35, this.origin.pitch + (event.clientY - this.origin.y) * .35))});
      } else if (this.points.size === 2) {
        const pair = this.pair();
        const delta = Math.atan2(Math.sin(pair.angle - this.origin.lastAngle), Math.cos(pair.angle - this.origin.lastAngle));
        this.origin.turn += delta;
        this.origin.lastAngle = pair.angle;
        this.onChange({size: Math.max(.25, Math.min(2.5, this.origin.size * pair.distance / this.origin.distance)),
          yaw: wrap(this.origin.yaw - this.origin.turn * 180 / Math.PI), pitch: this.origin.pitch});
      }
    }
    up(event) {
      if (!this.points.delete(event.pointerId)) return;
      try { this.surface.releasePointerCapture(event.pointerId); } catch (_) {}
      this.rebase();
      this.onEnd();
    }
    cancel() {
      const ids = [...this.points.keys()];
      this.points.clear(); this.origin = null;
      for (const id of ids) { try { this.surface.releasePointerCapture(id); } catch (_) {} }
      this.onEnd();
    }
  }
  window.PostcardGestures = PostcardGestures;
})();
