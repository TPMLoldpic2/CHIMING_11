(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const W = 512, H = 640;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  class PortraitCrop {
    constructor(canvas, onChange = () => {}) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.onChange = onChange;
      this.pointers = new Map(); this.source = null; this.zoom = 1; this.x = this.y = 0; this.flipped = false;
      canvas.addEventListener('pointerdown', event => {
        if (!this.source || (event.pointerType === 'mouse' && event.button !== 0)) return;
        event.preventDefault(); canvas.setPointerCapture(event.pointerId);
        this.pointers.set(event.pointerId, this.point(event)); this.rebase();
      });
      canvas.addEventListener('pointermove', event => {
        if (!this.pointers.has(event.pointerId)) return;
        event.preventDefault(); this.pointers.set(event.pointerId, this.point(event));
        const points = [...this.pointers.values()];
        if (points.length > 2) return;
        const center = this.center(points);
        if (points.length === 2) this.zoom = clamp(this.base.zoom * this.distance(points) / this.base.distance, 1, 4.5);
        const ratio = this.zoom / this.base.zoom;
        this.x = center.x - (this.base.center.x - this.base.x) * ratio;
        this.y = center.y - (this.base.center.y - this.base.y) * ratio;
        this.draw();
      });
      for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(name, event => {
        if (!this.pointers.has(event.pointerId)) return;
        this.pointers.delete(event.pointerId);
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        this.rebase();
      });
    }
    point(event) {
      const rect = this.canvas.getBoundingClientRect();
      return {x: (event.clientX - rect.left) * W / rect.width - W / 2, y: (event.clientY - rect.top) * H / rect.height - H / 2};
    }
    center(points) { return points.length === 1 ? points[0] : {x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2}; }
    distance(points) { return Math.max(1, Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)); }
    rebase() {
      const points = [...this.pointers.values()];
      this.base = points.length && points.length <= 2 ? {center: this.center(points), distance: points.length === 2 ? this.distance(points) : 1, zoom: this.zoom, x: this.x, y: this.y} : null;
    }
    cancel() {
      for (const id of this.pointers.keys()) if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
      this.pointers.clear(); this.base = null;
    }
    setSource(source) { this.cancel(); this.source = source; this.reset(); }
    reset() { this.cancel(); this.zoom = 1; this.x = this.y = 0; this.flipped = false; this.draw(); }
    stepZoom(change) { this.cancel(); const old = this.zoom; this.zoom = clamp(old + change, 1, 4.5); this.x *= this.zoom / old; this.y *= this.zoom / old; this.draw(); }
    flip() { this.cancel(); this.flipped = !this.flipped; this.draw(); }
    draw() {
      if (!this.source) return;
      const scale = Math.max(W / this.source.width, H / this.source.height) * this.zoom;
      const width = this.source.width * scale, height = this.source.height * scale;
      this.x = clamp(this.x, -(width - W) / 2, (width - W) / 2);
      this.y = clamp(this.y, -(height - H) / 2, (height - H) / 2);
      const ctx = this.ctx; ctx.clearRect(0, 0, W, H); ctx.save();
      ctx.translate(W / 2 + this.x, H / 2 + this.y);
      if (this.flipped) ctx.scale(-1, 1);
      ctx.drawImage(this.source, -width / 2, -height / 2, width, height); ctx.restore();
      this.onChange(this.zoom);
    }
    bake() {
      this.cancel(); this.draw();
      const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d'); ctx.drawImage(this.canvas, 0, 0);
      const pixels = ctx.getImageData(0, 0, W, H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const radius = Math.hypot((x + .5 - W / 2) / (W * .44), (y + .5 - H / 2) / (H * .46));
        pixels.data[(y * W + x) * 4 + 3] = Math.round(255 * clamp((1 - radius) / .035, 0, 1));
      }
      ctx.putImageData(pixels, 0, 0); return canvas;
    }
    clear() { this.cancel(); this.source = null; this.ctx.clearRect(0, 0, W, H); }
  }

  class PassengerPreview {
    constructor(container, model) { this.container = container; this.model = model; this.renderer = null; this.frame = null; this.active = false; }
    show() {
      this.hide(); this.active = true;
      const THREE = AFRAME.THREE, source = this.model.getObject3D('mesh')?.getObjectByName('Rickshaw');
      if (!source) { $('portraitPreviewNote').textContent = '正在準備人力車，載入後會自動顯示預覽。'; return; }
      try {
        if (!this.renderer) {
          this.renderer = new THREE.WebGLRenderer({alpha: true, antialias: true});
          this.renderer.outputColorSpace = THREE.SRGBColorSpace;
          this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
          this.container.appendChild(this.renderer.domElement);
        }
        this.scene = new THREE.Scene();
        const carriage = source.clone(true); carriage.position.set(0, 0, 0); carriage.quaternion.identity(); carriage.scale.setScalar(1);
        this.scene.add(carriage);
        this.scene.add(new THREE.HemisphereLight(0xfffaf0, 0x594634, 2));
        const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(2, 4, 5); this.scene.add(light);
        this.camera = new THREE.PerspectiveCamera(35, 1, .02, 100);
        this.camera.position.set(.65, 2.65, 5.15); this.camera.lookAt(0, 1.45, .65);
        $('portraitPreviewNote').textContent = '你的臉已貼到乘客上！掃描後，人力車會載著你前進。';
        const render = () => {
          if (!this.active || !this.scene) return;
          const width = Math.max(1, this.container.clientWidth), height = Math.max(1, this.container.clientHeight);
          this.renderer.setSize(width, height, false); this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
          this.renderer.render(this.scene, this.camera); this.frame = requestAnimationFrame(render);
        };
        render();
      } catch (error) {
        console.warn('Portrait preview', error);
        this.hide();
        $('portraitPreviewNote').textContent = '這台裝置暫時無法開啟 3D 預覽；照片已套用，可繼續掃描明信片。';
      }
    }
    hide() { this.active = false; if (this.frame !== null) cancelAnimationFrame(this.frame); this.frame = null; this.scene = this.camera = null; this.renderer?.renderLists?.dispose(); }
    dispose() { this.hide(); this.renderer?.dispose(); this.renderer?.domElement.remove(); this.renderer = null; }
  }

  class PhotoBooth {
    constructor() {
      this.model = $('cityModel'); this.modal = $('photoBooth'); this.video = $('faceVideo');
      this.token = 0; this.stream = null; this.facing = 'user'; this.mirrored = true; this.opened = false;
      this.crop = new PortraitCrop($('faceCrop'), zoom => { $('faceZoomValue').value = zoom.toFixed(2) + '×'; });
      this.preview = new PassengerPreview($('passengerPreview'), this.model);
      this.canOpen = () => document.body.dataset.view === 'home'; this.onStart = () => $('start').click();
      $('takePortrait').addEventListener('click', () => this.open());
      $('closePhotoBooth').addEventListener('click', () => this.close());
      $('flipCamera').addEventListener('click', () => { if (this.opened) { this.facing = this.facing === 'user' ? 'environment' : 'user'; this.beginCamera(); } });
      $('captureFace').addEventListener('click', () => this.capture());
      $('retakeFace').addEventListener('click', () => this.retake());
      $('retakePreview').addEventListener('click', () => this.retake());
      $('editFaceAgain').addEventListener('click', () => { this.preview.hide(); this.stage('crop'); });
      $('faceZoomIn').addEventListener('click', () => this.crop.stepZoom(.15));
      $('faceZoomOut').addEventListener('click', () => this.crop.stepZoom(-.15));
      $('faceCropReset').addEventListener('click', () => this.crop.reset());
      $('faceCropFlip').addEventListener('click', () => this.crop.flip());
      $('useFace').addEventListener('click', () => this.apply());
      $('portraitStartAR').addEventListener('click', () => { this.close(); this.onStart(); });
      $('chooseFacePhoto').addEventListener('click', () => this.chooseFile());
      $('chooseFacePhotoCrop').addEventListener('click', () => this.chooseFile());
      $('faceFile').addEventListener('change', event => this.readFile(event.target.files?.[0]));
      $('faceFile').addEventListener('cancel', () => { this.pickingFile = false; });
      $('clearPortrait').addEventListener('click', () => { if (this.canOpen()) { this.preview.hide(); window.PassengerPortrait.clear(); this.refreshHome(); } });
      this.model.addEventListener('passenger-face-ready', () => { if (this.opened && this.modal.dataset.stage === 'preview') this.preview.show(); });
      this.model.addEventListener('model-loaded', () => { if (this.opened && this.modal.dataset.stage === 'preview') this.preview.show(); });
      this.model.addEventListener('passenger-face-error', event => { this.error(event.detail?.message || '臉部套用失敗，請重新載入網頁。'); $('portraitStartAR').disabled = true; });
      this.model.addEventListener('model-error', () => { if (this.opened && this.modal.dataset.stage === 'preview') { this.preview.hide(); $('portraitPreviewNote').textContent = '模型載入失敗，請關閉視窗後重新整理，再重新拍照。'; } });
      this.modal.addEventListener('keydown', event => {
        if (event.key === 'Escape') this.close();
        if (event.key !== 'Tab') return;
        const focusable = [...this.modal.querySelectorAll('button:not(:disabled),input:not([type="hidden"])')].filter(element => element.getClientRects().length > 0);
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      });
      window.addEventListener('pagehide', () => { this.close(false); this.preview.dispose(); });
      document.addEventListener('visibilitychange', () => { if (document.hidden && this.opened && !this.pickingFile) this.close(false); });
      this.refreshHome();
    }
    stage(stage) {
      this.modal.dataset.stage = stage;
      for (const [id, name] of [['faceLiveStage', 'live'], ['faceCropStage', 'crop'], ['facePreviewStage', 'preview']]) $(id).hidden = stage !== name;
    }
    error(message = '') { $('faceError').textContent = message; $('faceError').hidden = !message; }
    open() {
      if (!this.canOpen() || this.opened) return;
      this.returnFocus = document.activeElement;
      this.opened = true; this.modal.hidden = false; document.body.classList.add('portrait-open');
      $('home').setAttribute('inert', ''); this.facing = 'user'; this.crop.clear();
      this.stage('live'); $('closePhotoBooth').focus(); this.beginCamera();
    }
    stopStream() {
      if (this.stream) this.stream.getTracks().forEach(track => track.stop());
      this.stream = null; this.video.pause(); this.video.srcObject = null;
    }
    close(restoreFocus = true) {
      this.token++; this.stopStream(); this.crop.cancel(); this.preview.hide();
      this.opened = false; this.pickingFile = false; this.modal.hidden = true; document.body.classList.remove('portrait-open'); $('home').removeAttribute('inert');
      this.crop.clear(); $('faceFile').value = '';
      if (restoreFocus) this.returnFocus?.focus();
    }
    async beginCamera() {
      const token = ++this.token; this.pickingFile = false; this.stopStream(); this.preview.hide(); this.crop.cancel(); this.stage('live'); this.error();
      $('captureFace').disabled = true; $('flipCamera').disabled = true; $('faceCameraStatus').textContent = '正在開啟相機…';
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('請用 HTTPS 開啟網頁；也可以按「用手機相機／選照片」。');
        const stream = await navigator.mediaDevices.getUserMedia({audio: false, video: {facingMode: {ideal: this.facing}, width: {ideal: 1280}, height: {ideal: 1280}}});
        if (token !== this.token || !this.opened) { stream.getTracks().forEach(track => track.stop()); return; }
        this.stream = stream;
        const track = stream.getVideoTracks()[0], actualFacing = track?.getSettings?.().facingMode;
        this.mirrored = (actualFacing || this.facing) === 'user'; this.video.classList.toggle('mirrored', this.mirrored);
        this.video.srcObject = stream; await this.video.play();
        if (token !== this.token || !this.opened) return;
        if (!this.video.videoWidth || !this.video.videoHeight) await new Promise((resolve, reject) => {
          const done = () => { clearTimeout(timer); this.video.removeEventListener('loadedmetadata', done); resolve(); };
          const timer = setTimeout(() => { this.video.removeEventListener('loadedmetadata', done); reject(new Error('相機沒有傳回畫面，請重試或改用手機相機。')); }, 8000);
          this.video.addEventListener('loadedmetadata', done, {once: true});
        });
        if (token !== this.token || !this.opened) return;
        if (!this.video.videoWidth || !this.video.videoHeight) throw new Error('相機畫面尚未就緒，請重試。');
        $('captureFace').disabled = false; $('flipCamera').disabled = false;
        $('faceCameraStatus').textContent = this.mirrored ? '自拍相機 · 將臉放入橢圓框，眼睛對齊虛線' : '後鏡頭 · 將臉放入橢圓框，眼睛對齊虛線';
        track?.addEventListener?.('ended', () => { if (token === this.token && this.opened) { this.stopStream(); $('captureFace').disabled = true; this.error('相機已中斷，請按「切換相機」重試，或改用手機相機。'); } });
      } catch (error) {
        if (token !== this.token || !this.opened) return;
        this.stopStream(); $('flipCamera').disabled = false; $('faceCameraStatus').textContent = '相機未開啟';
        this.error(error.name === 'NotAllowedError' ? '請允許瀏覽器使用相機；也可以按下方「用手機相機／選照片」。' : error.name === 'NotFoundError' ? '找不到相機，請改用下方「用手機相機／選照片」。' : error.message || '相機開啟失敗，請重試或改用手機相機。');
      }
    }
    capture() {
      if (!this.opened || !this.stream || !this.video.videoWidth || $('captureFace').disabled) return;
      const source = document.createElement('canvas'); source.width = 1024; source.height = 1280;
      const scale = Math.max(source.width / this.video.videoWidth, source.height / this.video.videoHeight);
      const width = this.video.videoWidth * scale, height = this.video.videoHeight * scale, ctx = source.getContext('2d');
      ctx.translate(source.width / 2, source.height / 2); if (this.mirrored) ctx.scale(-1, 1);
      ctx.drawImage(this.video, -width / 2, -height / 2, width, height);
      this.token++; this.stopStream(); this.crop.setSource(source); this.stage('crop'); this.error(); $('useFace').focus();
    }
    retake() { this.crop.clear(); this.beginCamera(); }
    chooseFile() {
      // Native camera pickers can background the page. Do not dismiss this dialog
      // during that handoff, and release the web camera before opening the picker.
      if (!this.opened) return;
      this.token++; this.stopStream(); this.crop.cancel(); this.pickingFile = true;
      $('captureFace').disabled = true; $('flipCamera').disabled = false;
      $('faceCameraStatus').textContent = '選好照片後可直接調整；取消時可按「切換相機」重開相機。';
      $('faceFile').click();
    }
    async readFile(file) {
      this.pickingFile = false;
      $('faceFile').value = '';
      if (!file || !this.opened) return;
      if (file.size > 25 * 1024 * 1024) { this.error('照片過大，請選 25 MB 以下的照片。'); return; }
      const token = ++this.token; this.stopStream(); this.preview.hide(); this.crop.cancel(); this.error();
      const url = URL.createObjectURL(file), image = new Image();
      try {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('照片讀取逾時，請再試一次。')), 15000);
          image.onload = () => { clearTimeout(timer); resolve(); };
          image.onerror = () => { clearTimeout(timer); reject(new Error('讀不到這張照片，請改用 JPG 或 PNG。')); };
          image.src = url;
        });
        if (token !== this.token || !this.opened) return;
        const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
        const source = document.createElement('canvas'); source.width = Math.max(1, Math.round(image.naturalWidth * scale)); source.height = Math.max(1, Math.round(image.naturalHeight * scale));
        source.getContext('2d').drawImage(image, 0, 0, source.width, source.height);
        this.crop.setSource(source); this.stage('crop'); $('useFace').focus();
      } catch (error) { if (token === this.token && this.opened) { $('captureFace').disabled = true; $('flipCamera').disabled = false; this.error(error.message); } }
      finally { URL.revokeObjectURL(url); }
    }
    apply() {
      if (!this.opened || !this.crop.source) return;
      this.stopStream(); this.error(); $('portraitStartAR').disabled = false;
      window.PassengerPortrait.set(this.crop.bake());
      this.refreshHome(); this.stage('preview'); this.preview.show(); $('portraitStartAR').focus();
    }
    refreshHome() {
      const canvas = window.PassengerPortrait.canvas;
      $('portraitSummary').hidden = !canvas;
      $('takePortrait').textContent = canvas ? '重新拍照／換一位乘客' : '拍照成為乘客';
      $('start').textContent = canvas ? '開始掃描 · 看自己被載' : '直接掃描明信片';
      if (canvas) {
        const thumbnail = $('portraitThumb'); thumbnail.getContext('2d').clearRect(0, 0, thumbnail.width, thumbnail.height);
        thumbnail.getContext('2d').drawImage(canvas, 0, 0, thumbnail.width, thumbnail.height);
      } else $('portraitThumb').getContext('2d').clearRect(0, 0, $('portraitThumb').width, $('portraitThumb').height);
    }
  }
  window.PortraitCrop = PortraitCrop;
  window.RickshawPhotoBooth = new PhotoBooth();
})();
