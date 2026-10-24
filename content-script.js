(() => {
  if (window.__douyinVideoPopoutInjected) {
    return;
  }
  window.__douyinVideoPopoutInjected = true;

  const STORAGE_KEY = 'douyin-video-popout-settings';
  const DEFAULT_SETTINGS = {
    opacity: 0.45,
    width: 360,
    height: 640,
    buttonX: 24,
    buttonY: 120,
    open: false
  };

  let settings = { ...DEFAULT_SETTINGS };
  let root = null;
  let floatingButton = null;
  let miniWindow = null;
  let videoStage = null;
  let slider = null;
  let dragState = null;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function saveSettings() {
    if (chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [STORAGE_KEY]: settings });
    }
  }

  function loadSettings() {
    if (!(chrome && chrome.storage && chrome.storage.local)) {
      return;
    }

    chrome.storage.local.get(STORAGE_KEY, (result) => {
      const saved = result[STORAGE_KEY] || {};
      settings = { ...DEFAULT_SETTINGS, ...saved };
      applySettings();
    });
  }

  function applySettings() {
    if (!floatingButton || !miniWindow) return;

    floatingButton.style.left = `${settings.buttonX}px`;
    floatingButton.style.top = `${settings.buttonY}px`;

    miniWindow.style.width = `${settings.width}px`;
    miniWindow.style.height = `${settings.height}px`;

    if (slider) {
      slider.value = String(settings.opacity);
    }

    if (settings.open) {
      miniWindow.classList.add('active');
    } else {
      miniWindow.classList.remove('active');
    }

    updateWindowOpacity();
  }

  function updateWindowOpacity() {
    if (!miniWindow) return;
    const isHover = miniWindow.matches(':hover');
    miniWindow.style.opacity = isHover ? '1' : String(settings.opacity);
  }

  function findVideoElement() {
    const candidates = [...document.querySelectorAll('video')];
    if (!candidates.length) return null;

    return candidates.find((video) => {
      if (!video || !video.isConnected) return false;
      const hasSource = !!(video.currentSrc || video.src);
      return hasSource || video.videoWidth > 0 || video.duration >= 0;
    }) || candidates[0];
  }

  function attachVideo() {
    if (!videoStage) return;

    const sourceVideo = findVideoElement();
    if (!sourceVideo) {
      videoStage.innerHTML = '<div class="dvpo-empty-state">未找到可弹出的视频源</div>';
      return;
    }

    videoStage.innerHTML = '';
    const clone = sourceVideo.cloneNode(true);
    clone.controls = true;
    clone.muted = false;
    clone.playsInline = true;
    clone.autoplay = true;
    clone.loop = true;
    clone.style.width = '100%';
    clone.style.height = '100%';
    clone.style.objectFit = 'cover';
    clone.classList.add('dvpo-video');
    clone.setAttribute('playsinline', 'true');
    videoStage.appendChild(clone);

    clone.play().catch(() => {
      // Some browsers block autoplay without user gesture; the user-triggered open action meets this requirement.
    });
  }

  function openMiniWindow() {
    settings.open = true;
    miniWindow.classList.add('active');
    attachVideo();
    updateWindowOpacity();
    saveSettings();
  }

  function closeMiniWindow() {
    settings.open = false;
    miniWindow.classList.remove('active');
    if (videoStage) {
      videoStage.innerHTML = '';
    }
    updateWindowOpacity();
    saveSettings();
  }

  function toggleMiniWindow() {
    if (settings.open) {
      closeMiniWindow();
    } else {
      openMiniWindow();
    }
  }

  function createRoot() {
    root = document.createElement('div');
    root.id = 'douyin-video-popout-root';
    root.setAttribute('aria-hidden', 'true');
    document.body.appendChild(root);

    floatingButton = document.createElement('button');
    floatingButton.type = 'button';
    floatingButton.className = 'dvpo-floating-button';
    floatingButton.innerHTML = '视频';
    floatingButton.title = '视频弹出';
    floatingButton.addEventListener('click', toggleMiniWindow);

    floatingButton.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      const rect = floatingButton.getBoundingClientRect();
      dragState = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top
      };
      floatingButton.setPointerCapture(event.pointerId);
    });

    floatingButton.addEventListener('pointermove', (event) => {
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      const nextX = clamp(event.clientX - dragState.offsetX, 8, window.innerWidth - floatingButton.offsetWidth - 8);
      const nextY = clamp(event.clientY - dragState.offsetY, 8, window.innerHeight - floatingButton.offsetHeight - 8);
      settings.buttonX = nextX;
      settings.buttonY = nextY;
      floatingButton.style.left = `${nextX}px`;
      floatingButton.style.top = `${nextY}px`;
      saveSettings();
    });

    floatingButton.addEventListener('pointerup', () => {
      dragState = null;
    });

    floatingButton.addEventListener('pointerleave', () => {
      dragState = null;
    });

    miniWindow = document.createElement('div');
    miniWindow.className = 'dvpo-mini-window';
    miniWindow.innerHTML = `
      <div class="dvpo-header">
        <span>视频弹出</span>
        <button type="button" class="dvpo-close-btn" aria-label="关闭小窗">×</button>
      </div>
      <div class="dvpo-video-stage"></div>
      <div class="dvpo-footer">
        <label for="dvpo-opacity-range">透明度</label>
        <input id="dvpo-opacity-range" type="range" min="0.2" max="1" step="0.05" value="${settings.opacity}">
      </div>
    `;

    videoStage = miniWindow.querySelector('.dvpo-video-stage');
    slider = miniWindow.querySelector('#dvpo-opacity-range');

    miniWindow.querySelector('.dvpo-close-btn').addEventListener('click', closeMiniWindow);

    slider.addEventListener('input', (event) => {
      settings.opacity = Number(event.target.value);
      updateWindowOpacity();
      saveSettings();
    });

    miniWindow.addEventListener('pointerover', () => {
      miniWindow.style.opacity = '1';
    });

    miniWindow.addEventListener('pointerleave', () => {
      updateWindowOpacity();
    });

    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'dvpo-resize-handle';
    resizeHandle.title = '拖动调节窗口大小';

    resizeHandle.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      const startX = event.clientX;
      const startY = event.clientY;
      const startWidth = settings.width;
      const startHeight = settings.height;

      const move = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        settings.width = clamp(startWidth + dx, 260, Math.max(window.innerWidth * 0.8, 260));
        settings.height = clamp(startHeight + dy, 320, Math.max(window.innerHeight * 0.8, 320));
        applySettings();
        saveSettings();
      };

      const stop = () => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', stop);
      };

      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', stop);
    });

    miniWindow.appendChild(resizeHandle);
    root.appendChild(floatingButton);
    root.appendChild(miniWindow);
  }

  function init() {
    createRoot();
    loadSettings();
    applySettings();
    if (settings.open) {
      openMiniWindow();
    }
  }

  init();
})();
