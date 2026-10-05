(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const scene = $('arScene'), anchor = $('photoAnchor'), root = $('cityRoot'), model = $('cityModel');
  const defaults = {size: .95, yaw: 0, pitch: 0, height: .006, animationSpeed: 1};
  const settings = {...defaults};
  const state = {session: 'idle', tracked: false, locked: false, ready: Boolean(model.getObject3D?.('mesh')), modelError: false, animationReady: Boolean(model.components?.['rickshaw-animation']?.mixer), animationError: false, animationEnabled: true};
  let generation = 0;
  let portraitViewVersion = 0;
  const system = () => scene.systems?.['mindar-image-system'];
  const pose = () => anchor.components?.['pose-stability'];
  let settingsFrame = null;
  function flushSettings() {
    if (settingsFrame !== null) { cancelAnimationFrame(settingsFrame); settingsFrame = null; }
    applySettings();
  }
  const gestures = new window.PostcardGestures($('gestureSurface'), {
    isEnabled: () => ['starting', 'scanning'].includes(state.session) && (state.tracked || state.locked) && state.ready && !state.modelError,
    readSettings: () => settings,
    onChange: change => {
      Object.assign(settings, change);
      if (settingsFrame === null) settingsFrame = requestAnimationFrame(() => { settingsFrame = null; applySettings(); });
    },
    onEnd: flushSettings
  });

  function renderState() {
    const active = state.session === 'starting' || state.session === 'scanning';
    const showCity = active && (state.tracked || state.locked) && state.ready && !state.modelError;
    root.setAttribute('visible', showCity);
    model.setAttribute('rickshaw-animation', 'enabled', showCity && state.animationReady && state.animationEnabled);
    document.body.dataset.view = active ? 'ar' : 'home';
    $('arRoot').setAttribute('aria-hidden', String(!active));
    $('scanUI').hidden = !active;
    $('scanGuide').hidden = state.tracked || state.locked;
    $('gestureHint').hidden = !showCity || !$('modelControls').hidden;
    $('lockHint').hidden = !active || !state.locked || !$('modelControls').hidden;
    $('lockPose').disabled = !showCity;
    $('lockPose').textContent = state.locked ? '恢復追蹤' : '固定觀看';
    $('lockPose').setAttribute('aria-pressed', String(state.locked));
    if (!showCity) gestures.cancel();
    $('start').disabled = state.session !== 'idle';
    $('takePortrait').disabled = state.session !== 'idle';
    $('clearPortrait').disabled = state.session !== 'idle';
    $('retryModel').hidden = !state.modelError && !state.animationError;
    $('loadNote').textContent = state.modelError ? '3D 模型載入失敗，請重新整理網頁。' :
      state.animationError ? '動畫載入失敗，請在調整模型中重新載入。' :
      !state.ready ? '準備人力車中…' :
      !state.animationReady ? '準備人力車與人物動畫中…' : '人力車與動畫已就緒';
    $('trackingStatus').classList.toggle('found', showCity);
    $('trackingStatus').textContent = state.session === 'starting' ? '正在開啟相機…' :
      state.locked ? '固定觀看 · 可自由縮放與調整角度' :
      !state.tracked ? '請對準人力車照片' :
      state.modelError ? '已辨識照片，3D 模型載入失敗' :
      !state.ready ? '已辨識照片，人力車載入中…' :
      state.animationError ? '已辨識照片，動畫載入失敗，請重新載入模型' :
      !state.animationReady ? '已辨識照片，動畫準備中…' : window.PassengerPortrait?.canvas ? '辨識成功 · 人力車正載著你' : '辨識成功 · 人力車就在眼前';
  }

  function applySettings() {
    root.setAttribute('scale', `${settings.size} ${settings.size} ${settings.size}`);
    root.setAttribute('position', `0 0 ${settings.height}`);
    $('cityYaw').setAttribute('rotation', `0 ${settings.yaw} 0`);
    $('viewTilt').setAttribute('rotation', `${settings.pitch} 0 0`);
    $('sizeValue').value = settings.size.toFixed(2);
    $('yawValue').value = `${Math.round(settings.yaw)}°`;
    $('pitchValue').value = `${Math.round(settings.pitch)}°`;
    $('heightValue').value = settings.height.toFixed(3);
    $('animationSpeedValue').value = `${settings.animationSpeed.toFixed(2)}×`;
    model.setAttribute('rickshaw-animation', 'speed', settings.animationSpeed);
  }

  async function stopCamera() {
    try { await system()?.stop(); } catch (error) { console.warn('AR stop', error); }
    // Ensure camera streams are released even if the AR system stopped incompletely.
    for (const video of document.querySelectorAll('video')) {
      if (video.srcObject?.getTracks) video.srcObject.getTracks().forEach(track => track.stop());
    }
  }

  async function stop() {
    generation++;
    state.session = 'stopping'; state.tracked = false;
    state.locked = false; pose()?.reset();
    $('modelControls').hidden = true;
    $('adjust').setAttribute('aria-expanded', 'false');
    renderState();
    await stopCamera();
    state.session = 'idle'; renderState();
  }

  function waitForScene(timeout = 20000) {
    if (scene.hasLoaded && system()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const poll = setInterval(() => {
        if (scene.hasLoaded && system()) { clearInterval(poll); clearTimeout(expire); resolve(); }
      }, 100);
      const expire = setTimeout(() => { clearInterval(poll); reject(new Error('AR 程式尚未載入，請確認 vendor 資料夾已上傳。')); }, timeout);
    });
  }

  async function start() {
    if (state.session !== 'idle') return;
    window.RickshawPhotoBooth?.close(false);
    if (window.PassengerPortrait?.canvas && portraitViewVersion !== window.PassengerPortrait.version) {
      // Start a new portrait from a low, front-facing view rather than the hat's
      // top. Subsequent sessions keep the visitor's own gesture adjustments.
      settings.pitch = -65; settings.yaw = 90; applySettings();
      portraitViewVersion = window.PassengerPortrait.version;
    }
    const token = ++generation;
    state.session = 'starting'; state.tracked = false;
    state.locked = false; pose()?.reset();
    $('homeError').hidden = true;
    renderState();
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('請使用 HTTPS 網址開啟網頁，才能使用相機。');
      }
      await waitForScene();
      if (token !== generation) return;
      const timeout = new AbortController();
      const expire = setTimeout(() => timeout.abort(), 15000);
      try {
        const result = await fetch('./assets/targets.mind', {signal: timeout.signal});
        if (!result.ok) throw new Error('找不到照片辨識檔，請一併上傳 assets/targets.mind。');
        const bytes = await result.arrayBuffer();
        if (bytes.byteLength < 32) throw new Error('照片辨識檔內容不完整。');
      } finally { clearTimeout(expire); }
      if (token !== generation) return;
      await system().start();
      if (token !== generation) { await stopCamera(); return; }
      state.session = 'scanning'; renderState();
    } catch (error) {
      if (token !== generation) return;
      await stop();
      $('homeError').hidden = false;
      $('homeError').textContent = error.name === 'NotAllowedError' ? '相機權限未開啟，請允許瀏覽器使用相機後再試。' :
        error.name === 'AbortError' ? '辨識檔載入逾時，請檢查網路後再試。' :
        error.message || '相機啟動失敗，請確認相機權限後再試。';
    }
  }

  anchor.addEventListener('targetFound', () => {
    if (state.session !== 'starting' && state.session !== 'scanning') return;
    state.tracked = true; renderState();
  });
  anchor.addEventListener('targetLost', () => { state.tracked = false; renderState(); });
  model.addEventListener('postcard-model-ready', () => { state.ready = true; state.modelError = false; renderState(); });
  model.addEventListener('model-error', () => { state.ready = false; state.modelError = true; state.animationReady = false; renderState(); });
  model.addEventListener('rickshaw-animation-ready', () => { state.animationReady = true; state.animationError = false; renderState(); });
  model.addEventListener('rickshaw-animation-error', () => { state.animationReady = false; state.animationError = true; renderState(); });
  scene.addEventListener('arError', async () => {
    if (state.session === 'idle') return;
    await stop();
    $('homeError').hidden = false;
    $('homeError').textContent = 'AR 啟動失敗，請確認瀏覽器相機權限，並重新整理後再試。';
  });
  $('start').addEventListener('click', start);
  $('stop').addEventListener('click', stop);
  $('adjust').addEventListener('click', () => {
    gestures.cancel();
    $('modelControls').hidden = !$('modelControls').hidden;
    $('adjust').setAttribute('aria-expanded', String(!$('modelControls').hidden));
    renderState();
  });
  function stepButton(id, key, change, min, max) {
    $(id).addEventListener('click', () => {
      gestures.cancel();
      const value = settings[key] + change;
      settings[key] = key === 'yaw' ? ((value + 180) % 360 + 360) % 360 - 180 : Math.max(min, Math.min(max, value));
      applySettings();
    });
  }
  stepButton('sizeDown', 'size', -.1, .25, 2.5);
  stepButton('sizeUp', 'size', .1, .25, 2.5);
  stepButton('yawLeft', 'yaw', -15);
  stepButton('yawRight', 'yaw', 15);
  stepButton('pitchDown', 'pitch', -10, -85, 35);
  stepButton('pitchUp', 'pitch', 10, -85, 35);
  stepButton('heightDown', 'height', -.01, 0, .3);
  stepButton('heightUp', 'height', .01, 0, .3);
  for (const [id, pitch, yaw] of [['viewSide', -70, 20], ['viewTop', 0, 0]]) {
    $(id).addEventListener('click', () => {
      gestures.cancel(); settings.pitch = pitch; settings.yaw = yaw; applySettings();
    });
  }
  $('lockPose').addEventListener('click', () => {
    if (!['starting', 'scanning'].includes(state.session) || !state.ready || state.modelError) return;
    gestures.cancel();
    if (pose()?.setFrozen(!state.locked)) { state.locked = !state.locked; renderState(); }
  });
  $('animationEnabled').addEventListener('change', event => {
    state.animationEnabled = event.target.checked;
    renderState();
  });
  for (const [id, speed] of [['speedSlow', .5], ['speedNormal', 1], ['speedFast', 1.5]])
    $(id).addEventListener('click', () => { settings.animationSpeed = speed; applySettings(); });
  $('reset').addEventListener('click', () => {
    gestures.cancel();
    if (state.locked) { pose()?.setFrozen(false); state.locked = false; }
    Object.assign(settings, defaults);
    state.animationEnabled = true; $('animationEnabled').checked = true;
    applySettings(); renderState();
  });
  $('retryModel').addEventListener('click', () => {
    state.ready = false; state.modelError = false; state.animationReady = false; state.animationError = false;
    model.removeAttribute('gltf-model');
    model.setAttribute('gltf-model', `url(./assets/Rickshaw_Animated.glb?v=${Date.now()})`);
    renderState();
  });
  window.addEventListener('pagehide', stop);
  window.addEventListener('blur', () => gestures.cancel());
  if (window.RickshawPhotoBooth) {
    window.RickshawPhotoBooth.canOpen = () => state.session === 'idle';
    window.RickshawPhotoBooth.onStart = start;
  }
  applySettings(); renderState();
})();
