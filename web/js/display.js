/**
 * display.js - サイネージ表示画面制御スクリプト
 */
import {
  isConfigured,
  getSession,
  signIn,
  signOut,
  getRole,
  fetchSlides,
  downloadBlob,
  SIGNAGE_DISPLAY_EMAIL,
} from './supa.js';
import { todayInTokyo, pickSlides } from './schedule.js';
import { readLinkKey } from './link-key.js';
import {
  getBlobKey,
  cleanBlobCache,
  getNextSlide,
  msUntilNext4AM,
  msUntilNextMidnight,
  formatClock,
  resolveRotation,
} from './display-logic.js';

// モニターを縦に置いたときの回転（?rotate=90 / 270。OS で画面の向きを変えられるならそちらが先。README §2）
(() => {
  let stored = null;
  try { stored = localStorage.getItem('signage.rotate'); } catch { /* 使えない端末もある */ }
  const { rotate, save } = resolveRotation(location.search, stored);
  document.documentElement.dataset.rotate = rotate;
  if (save !== null) {
    try { localStorage.setItem('signage.rotate', save); } catch { /* 覚えられなくても URL で回る */ }
  }
})();

// DOM 要素
const configWarning = document.getElementById('configWarning');
const loginSection = document.getElementById('loginSection');
const loginForm = document.getElementById('loginForm');
const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const loginButton = document.getElementById('loginButton');
const loginError = document.getElementById('loginError');
const unauthorizedSection = document.getElementById('unauthorizedSection');
const logoutButton = document.getElementById('logoutButton');
const signageContainer = document.getElementById('signageContainer');
const layerA = document.getElementById('layerA');
const layerB = document.getElementById('layerB');
const standbyScreen = document.getElementById('standbyScreen');
const standbyClock = document.getElementById('standbyClock');
const cornerStatus = document.getElementById('cornerStatus');

// 状態管理
let currentSlides = [];
let activePicks = [];
let currentSlideId = null;
let activeLayer = layerA;
let inactiveLayer = layerB;
let slideTimeoutId = null;
let isPlaying = false;
const blobCache = new Map(); // key -> objectUrl

// コーナーステータス（エラー・警告）表示
function setCornerStatus(message) {
  if (!message) {
    cornerStatus.textContent = '';
    cornerStatus.classList.add('hidden');
  } else {
    cornerStatus.textContent = message;
    cornerStatus.classList.remove('hidden');
  }
}

// 画面切り替えヘルパー
function showView(view) {
  configWarning.classList.add('hidden');
  loginSection.classList.add('hidden');
  unauthorizedSection.classList.add('hidden');
  signageContainer.classList.add('hidden');

  if (view === 'config') configWarning.classList.remove('hidden');
  if (view === 'login') loginSection.classList.remove('hidden');
  if (view === 'unauthorized') unauthorizedSection.classList.remove('hidden');
  if (view === 'signage') signageContainer.classList.remove('hidden');
}

// カーソル非表示（3秒無操作）
let cursorTimer = null;
function initCursorHiding() {
  const showCursor = () => {
    document.body.classList.remove('hide-cursor');
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(() => {
      document.body.classList.add('hide-cursor');
    }, 3000);
  };
  window.addEventListener('mousemove', showCursor);
  showCursor();
}

// 最初のタップ/クリックで全画面
function initFullscreenHandler() {
  const enterFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };
  window.addEventListener('click', enterFullscreen, { once: true });
  window.addEventListener('touchstart', enterFullscreen, { once: true });
}

// Wake Lock（スリープ防止）
let wakeLock = null;
async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
    } catch {
      // 端末設定やブラウザによって拒否される場合があるため握りつぶす
    }
  }
}

function initWakeLock() {
  requestWakeLock();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      requestWakeLock();
    }
  });
}

// 待機時計の更新
function initClock() {
  const update = () => {
    standbyClock.textContent = formatClock();
  };
  update();
  setInterval(update, 1000);
}

// 毎日 4:00 (JST) の自動リロード
function schedule4AMReload() {
  const ms = msUntilNext4AM();
  setTimeout(() => {
    if (document.fullscreenElement) {
      // タップで全画面にしている場合、読み込み直すと全画面が解ける（人のタップが無いと戻せない）。
      // 端末の中の画像・動画を捨てて一覧を読み直すだけにする。キオスクモードなら読み込み直す
      stopPlayback();
      for (const url of blobCache.values()) URL.revokeObjectURL(url);
      blobCache.clear();
      refreshSlides();
      schedule4AMReload();
    } else {
      location.reload();
    }
  }, ms);
}

// 日付変更時のスライド再取得
function scheduleMidnightRefresh() {
  const ms = msUntilNextMidnight();
  setTimeout(async () => {
    await refreshSlides();
    scheduleMidnightRefresh();
  }, ms + 1000);
}

// スライドの取得・反映
async function refreshSlides() {
  try {
    const slides = await fetchSlides();
    currentSlides = slides;
    evaluatePicks();
    // 端末に持つのは今日流すものだけ（期限切れや開始前の動画でメモリを埋めない）
    cleanBlobCache(blobCache, activePicks, (url) => URL.revokeObjectURL(url));
  } catch (err) {
    console.warn('Failed to refresh slides:', err);
    // 取得失敗時は現在の一覧のまま続行（黒画面にしない）
  }
}

// 今日のスライド判定
function evaluatePicks() {
  const today = todayInTokyo();
  const picks = pickSlides(currentSlides, today);

  if (picks === undefined) {
    activePicks = [];
    // pickSlides が未実装の場合
    setCornerStatus('schedule.js の pickSlides が未実装');
    stopPlayback();
    standbyScreen.classList.remove('hidden');
    return;
  }

  activePicks = picks;

  if (activePicks.length === 0) {
    setCornerStatus('');
    stopPlayback();
    standbyScreen.classList.remove('hidden');
    return;
  }

  // 1件以上ある場合
  setCornerStatus('');
  standbyScreen.classList.add('hidden');
  if (!isPlaying) {
    startPlayback();
  }
}

// スライド再生制御
function stopPlayback() {
  isPlaying = false;
  currentSlideId = null;
  if (slideTimeoutId) {
    clearTimeout(slideTimeoutId);
    slideTimeoutId = null;
  }
  layerA.classList.remove('active');
  layerB.classList.remove('active');
  layerA.innerHTML = '';
  layerB.innerHTML = '';
}

function startPlayback() {
  if (activePicks.length === 0) return;
  isPlaying = true;
  advanceSlide();
}

async function getSlideMediaUrl(slide) {
  const key = getBlobKey(slide);
  if (blobCache.has(key)) {
    return blobCache.get(key);
  }

  const blob = await downloadBlob(slide.storage_path);
  const url = URL.createObjectURL(blob);
  blobCache.set(key, url);
  return url;
}

async function advanceSlide() {
  if (!isPlaying || activePicks.length === 0) return;

  if (slideTimeoutId) {
    clearTimeout(slideTimeoutId);
    slideTimeoutId = null;
  }

  const next = getNextSlide(activePicks, currentSlideId);
  if (!next) {
    stopPlayback();
    standbyScreen.classList.remove('hidden');
    return;
  }

  let mediaUrl;
  try {
    mediaUrl = await getSlideMediaUrl(next);
  } catch (err) {
    console.error(`Failed to load media for slide ${next.id}:`, err);
    // 1件失敗したらスキップして次へ
    currentSlideId = next.id;
    slideTimeoutId = setTimeout(advanceSlide, 1000);
    return;
  }

  currentSlideId = next.id;

  // 次の描画対象レイヤー（現在非アクティブなレイヤー）
  const targetLayer = inactiveLayer;
  const oldLayer = activeLayer;

  targetLayer.innerHTML = '';

  if (next.kind === 'video') {
    const video = document.createElement('video');
    video.className = 'slide-media';
    video.src = mediaUrl;
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;

    let hasAdvanced = false;
    const proceed = () => {
      if (hasAdvanced) return;
      hasAdvanced = true;
      advanceSlide();
    };

    video.addEventListener('ended', proceed);
    video.addEventListener('error', () => {
      console.warn('Video playback error for slide:', next.id);
      proceed();
    });

    // 最大 120 秒のセーフティタイマー（動画がループ・停止した場合でも進む）
    slideTimeoutId = setTimeout(proceed, 120 * 1000);

    targetLayer.appendChild(video);

    // 再生開始できたらクロスフェード
    video.play().catch(() => {});
    swapLayers(targetLayer, oldLayer);
  } else {
    // 画像
    const img = document.createElement('img');
    img.className = 'slide-media';
    img.src = mediaUrl;
    img.alt = next.title || '';

    const duration = (next.duration_sec || 10) * 1000;
    slideTimeoutId = setTimeout(() => {
      advanceSlide();
    }, duration);

    targetLayer.appendChild(img);
    swapLayers(targetLayer, oldLayer);
  }
}

function swapLayers(newActive, oldActive) {
  newActive.classList.add('active');
  oldActive.classList.remove('active');

  activeLayer = newActive;
  inactiveLayer = oldActive;

  // アニメーション完了後に古いレイヤーのメディアを停止
  setTimeout(() => {
    const oldVideo = oldActive.querySelector('video');
    if (oldVideo) {
      oldVideo.pause();
      oldActive.innerHTML = '';
    }
  }, 700);
}

// 認証・初期化
async function init() {
  if (!isConfigured()) {
    showView('config');
    return;
  }

  initClock();
  initCursorHiding();
  initFullscreenHandler();
  initWakeLock();
  schedule4AMReload();
  scheduleMidnightRefresh();

  loginEmail.value = SIGNAGE_DISPLAY_EMAIL;

  // ログインフォーム送信
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginButton.disabled = true;
    loginError.classList.add('hidden');
    try {
      await signIn(SIGNAGE_DISPLAY_EMAIL, loginPassword.value);
      await checkAuthAndStart();
    } catch (err) {
      loginError.textContent = err.message || 'ログインに失敗しました';
      loginError.classList.remove('hidden');
    } finally {
      loginButton.disabled = false;
    }
  });

  logoutButton.addEventListener('click', async () => {
    await signOut();
    stopPlayback();
    showView('login');
  });

  // 鍵つき URL（index.html#k=…）で開いたら、合言葉を入れずに流し始める（キオスクの起動 URL に書いておく）
  const linkKey = readLinkKey(location.hash);
  if (linkKey) {
    let session = null;
    try { session = await getSession(); } catch { /* 下で入り直す */ }
    if (!session) {
      try {
        await signIn(SIGNAGE_DISPLAY_EMAIL, linkKey);
      } catch (err) {
        if (err.message === '合言葉が違います') {
          showView('login');
          loginError.textContent = 'この URL の鍵は使えなくなっています。新しい URL で開き直してください';
          loginError.classList.remove('hidden');
          return;
        }
        // ネットが切れている（電源を入れた直後など）。30秒後に読み込み直して入り直す
        showView('signage');
        standbyScreen.classList.remove('hidden');
        setCornerStatus('つながりません。30秒後にもう一度つなぎます');
        setTimeout(() => location.reload(), 30 * 1000);
        return;
      }
    }
  }

  await checkAuthAndStart();
}

let refreshTimerId = null;
let retryTimerId = null;

async function checkAuthAndStart() {
  clearTimeout(retryTimerId);
  let session, role;
  try {
    session = await getSession();
    if (!session) {
      showView('login');
      return;
    }
    role = await getRole();
  } catch (err) {
    // ネットが切れている。30秒後にもう一度（翌朝まで止まらないように）
    console.warn('Auth check failed, retrying:', err);
    showView('signage');
    standbyScreen.classList.remove('hidden');
    setCornerStatus('つながりません。30秒後にもう一度つなぎます');
    retryTimerId = setTimeout(checkAuthAndStart, 30 * 1000);
    return;
  }

  if (role !== 'display' && role !== 'editor') {
    showView('unauthorized');
    return;
  }

  showView('signage');
  setCornerStatus('');

  // 初回データ読み込み
  await refreshSlides();

  // 5分ごとの定期再取得（ログインし直しても重ねない）
  if (!refreshTimerId) refreshTimerId = setInterval(refreshSlides, 5 * 60 * 1000);
}

window.addEventListener('DOMContentLoaded', init);
