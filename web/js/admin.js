/**
 * admin.js - サイネージ管理画面制御スクリプト
 */
import {
  isConfigured,
  getSession,
  signIn,
  signOut,
  getRole,
  fetchSlides,
  insertSlide,
  updateSlide,
  deleteSlide,
  SIGNAGE_STAFF_EMAIL,
  uploadSlideFile,
  deleteSlideFile,
  createSignedUrl,
} from './supa.js';
import { todayInTokyo, slideStatus, pickSlides } from './schedule.js';
import { readLinkKey } from './link-key.js';
import {
  defaultDates,
  cleanFileNameTitle,
  expiredForPurge,
} from './admin-logic.js';

// DOM 要素
const configWarning = document.getElementById('configWarning');
const loginSection = document.getElementById('loginSection');
const loginForm = document.getElementById('loginForm');
const adminEmail = document.getElementById('adminEmail');
const adminPassword = document.getElementById('adminPassword');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('loginError');

const unauthorizedSection = document.getElementById('unauthorizedSection');
const unauthorizedLogoutBtn = document.getElementById('unauthorizedLogoutBtn');

const adminApp = document.getElementById('adminApp');
const currentUserName = document.getElementById('currentUserName');
const viewDisplayBtn = document.getElementById('viewDisplayBtn');
const logoutBtn = document.getElementById('logoutBtn');
const notificationBanner = document.getElementById('notificationBanner');

const uploadForm = document.getElementById('uploadForm');
const fileInput = document.getElementById('fileInput');
const selectedFilesArea = document.getElementById('selectedFilesArea');
const selectedFilesList = document.getElementById('selectedFilesList');
const uploadSubmitBtn = document.getElementById('uploadSubmitBtn');
const uploadCancelBtn = document.getElementById('uploadCancelBtn');

const refreshListBtn = document.getElementById('refreshListBtn');
const showingCount = document.getElementById('showingCount');
const showingList = document.getElementById('showingList');
const upcomingCount = document.getElementById('upcomingCount');
const upcomingList = document.getElementById('upcomingList');
const endedCount = document.getElementById('endedCount');
const endedList = document.getElementById('endedList');

const editModal = document.getElementById('editModal');
const editForm = document.getElementById('editForm');
const editSlideId = document.getElementById('editSlideId');
const editTitle = document.getElementById('editTitle');
const editStartsOn = document.getElementById('editStartsOn');
const editEndsOn = document.getElementById('editEndsOn');
const editDuration = document.getElementById('editDuration');
const editDurationGroup = document.getElementById('editDurationGroup');
const editCancelBtn = document.getElementById('editCancelBtn');

// 状態
let allSlides = [];
let selectedFilesData = [];

// 通知表示
let bannerTimer = null;
function showNotification(message, isError = false) {
  notificationBanner.textContent = message;
  notificationBanner.style.backgroundColor = isError ? '#fee2e2' : '#e0f2fe';
  notificationBanner.style.color = isError ? '#b91c1c' : '#0369a1';
  notificationBanner.classList.remove('hidden');

  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => {
    notificationBanner.classList.add('hidden');
  }, 4000);
}

// 画面切り替え
function showView(view) {
  configWarning.classList.add('hidden');
  loginSection.classList.add('hidden');
  unauthorizedSection.classList.add('hidden');
  adminApp.classList.add('hidden');

  if (view === 'config') configWarning.classList.remove('hidden');
  if (view === 'login') loginSection.classList.remove('hidden');
  if (view === 'unauthorized') unauthorizedSection.classList.remove('hidden');
  if (view === 'app') adminApp.classList.remove('hidden');
}

// 画像の縮小処理 (長辺 > 1920px の場合 Canvas で縮小、JPEG 0.85)
async function processImageFile(file) {
  if (file.type === 'image/gif') {
    return { blob: file, ext: 'gif', mime: 'image/gif' };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = Math.max(img.width, img.height);
      if (maxDim > 1920) {
        const scale = 1920 / maxDim;
        const targetW = Math.round(img.width * scale);
        const targetH = Math.round(img.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, targetW, targetH);

        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('画像の縮小に失敗しました'));
            return;
          }
          resolve({ blob, ext: 'jpg', mime: 'image/jpeg' });
        }, 'image/jpeg', 0.85);
      } else {
        const ext = file.name.split('.').pop() || 'jpg';
        resolve({ blob: file, ext: ext.toLowerCase(), mime: file.type || 'image/jpeg' });
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像の読み込みに失敗しました'));
    };
    img.src = url;
  });
}

// 動画の検証
function validateVideoFile(file) {
  const isMp4OrWebm = file.type === 'video/mp4' || file.type === 'video/webm' ||
    file.name.endsWith('.mp4') || file.name.endsWith('.webm');
  if (!isMp4OrWebm) {
    return '動画は mp4 または webm 形式のみ対応しています';
  }
  const maxBytes = 50 * 1024 * 1024;
  if (file.size > maxBytes) {
    return `動画サイズが50MBを超えています（${(file.size / (1024 * 1024)).toFixed(1)}MB）`;
  }
  return null;
}

// 画像・動画の縦横を測る（モニターは縦置き。横長のものは小さく出るので知らせる）
function measureMedia(file, isVideo) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const done = (w, h) => { URL.revokeObjectURL(url); resolve(w && h ? { w, h } : null); };
    if (isVideo) {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => done(v.videoWidth, v.videoHeight);
      v.onerror = () => done();
      v.src = url;
    } else {
      const img = new Image();
      img.onload = () => done(img.naturalWidth, img.naturalHeight);
      img.onerror = () => done();
      img.src = url;
    }
  });
}

// ファイル選択時の処理
function handleFilesSelected(files) {
  if (!files || files.length === 0) {
    selectedFilesArea.classList.add('hidden');
    selectedFilesData = [];
    return;
  }

  const today = todayInTokyo();
  const def = defaultDates(today);

  selectedFilesData = Array.from(files).map((file, idx) => {
    const isVideo = file.type.startsWith('video/') || file.name.endsWith('.mp4') || file.name.endsWith('.webm');
    let videoError = null;
    if (isVideo) {
      videoError = validateVideoFile(file);
    }

    return {
      file,
      kind: isVideo ? 'video' : 'image',
      title: cleanFileNameTitle(file.name),
      starts_on: def.starts_on,
      ends_on: def.ends_on,
      duration_sec: 10,
      videoError,
    };
  });

  renderSelectedFiles();
  selectedFilesArea.classList.remove('hidden');

  // 縦横は測り終わったものから知らせる（載せるのは止めない）
  const batch = selectedFilesData;
  batch.forEach(async (item) => {
    const size = await measureMedia(item.file, item.kind === 'video');
    if (selectedFilesData !== batch || !size || size.w <= size.h) return;
    item.orientationNote = `横長（${size.w}×${size.h}）。縦のモニターでは上下が空いて小さく出ます`;
    renderSelectedFiles();
  });
}

// 属性や本文に差し込む文字を HTML として解釈させない
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function renderSelectedFiles() {
  selectedFilesList.innerHTML = '';

  selectedFilesData.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'file-item-card';

    const header = document.createElement('div');
    header.className = 'file-item-header';
    header.innerHTML = `
      <span>ファイル ${index + 1}: ${esc(item.file.name)} (${item.kind === 'image' ? '画像' : '動画'})</span>
      ${item.videoError ? `<span class="error-text">${esc(item.videoError)}</span>` : ''}
      ${item.orientationNote ? `<span class="warn-text">${esc(item.orientationNote)}</span>` : ''}
    `;
    card.appendChild(header);

    const body = document.createElement('div');
    body.className = 'file-item-body';
    body.innerHTML = `
      <div class="form-group">
        <label>タイトル</label>
        <input type="text" class="input-title" data-index="${index}" value="${esc(item.title)}" required>
      </div>
      <div class="form-row">
        <div class="form-group col">
          <label>開始日</label>
          <input type="date" class="input-starts" data-index="${index}" value="${esc(item.starts_on)}" required>
        </div>
        <div class="form-group col">
          <label>終了日</label>
          <input type="date" class="input-ends" data-index="${index}" value="${esc(item.ends_on)}" required>
        </div>
        ${item.kind === 'image' ? `
        <div class="form-group col">
          <label>秒数 (3〜60)</label>
          <input type="number" class="input-duration" data-index="${index}" value="${esc(item.duration_sec)}" min="3" max="60" required>
        </div>
        ` : ''}
      </div>
    `;
    card.appendChild(body);
    selectedFilesList.appendChild(card);
  });

  // 入力イベントリスナー
  selectedFilesList.querySelectorAll('.input-title').forEach(input => {
    input.addEventListener('input', (e) => {
      const idx = Number(e.target.dataset.index);
      selectedFilesData[idx].title = e.target.value;
    });
  });
  selectedFilesList.querySelectorAll('.input-starts').forEach(input => {
    input.addEventListener('change', (e) => {
      const idx = Number(e.target.dataset.index);
      selectedFilesData[idx].starts_on = e.target.value;
    });
  });
  selectedFilesList.querySelectorAll('.input-ends').forEach(input => {
    input.addEventListener('change', (e) => {
      const idx = Number(e.target.dataset.index);
      selectedFilesData[idx].ends_on = e.target.value;
    });
  });
  selectedFilesList.querySelectorAll('.input-duration').forEach(input => {
    input.addEventListener('change', (e) => {
      const idx = Number(e.target.dataset.index);
      selectedFilesData[idx].duration_sec = Number(e.target.value);
    });
  });
}

// アップロード実行
async function handleUploadSubmit(e) {
  e.preventDefault();

  // バリデーション
  for (const item of selectedFilesData) {
    if (item.videoError) {
      alert(`動画エラー: ${esc(item.file.name)}\n${item.videoError}`);
      return;
    }
    if (item.starts_on > item.ends_on) {
      alert(`「${item.title}」の開始日が終了日より後になっています。`);
      return;
    }
  }

  uploadSubmitBtn.disabled = true;
  uploadSubmitBtn.textContent = 'アップロード中...';

  let doneCount = 0;
  try {
    // 1件ずつ載せ、載せ終わったものは選択から外す（途中で失敗してやり直しても二重に載せない）
    while (selectedFilesData.length > 0) {
      const item = selectedFilesData[0];
      let uploadBlob;
      let ext;
      let mime;

      if (item.kind === 'video') {
        uploadBlob = item.file;
        ext = item.file.name.split('.').pop() || 'mp4';
        mime = item.file.type || 'video/mp4';
      } else {
        const processed = await processImageFile(item.file);
        uploadBlob = processed.blob;
        ext = processed.ext;
        mime = processed.mime;
      }

      const storagePath = `slides/${crypto.randomUUID()}.${ext}`;

      // 1. ストレージにアップロード
      await uploadSlideFile(storagePath, uploadBlob, mime);

      // 2. テーブルに insert（失敗時はアップロードしたファイルを消す）
      try {
        await insertSlide({
          title: item.title,
          kind: item.kind,
          storage_path: storagePath,
          starts_on: item.starts_on,
          ends_on: item.ends_on,
          duration_sec: item.kind === 'image' ? (item.duration_sec || 10) : 10,
        });
      } catch (insertErr) {
        console.error('Insert slide failed, rolling back uploaded file:', insertErr);
        await deleteSlideFile(storagePath).catch(() => {});
        throw insertErr;
      }
      selectedFilesData.shift();
      doneCount++;
    }

    showNotification(`${doneCount}件のスライドを登録しました`);
    uploadForm.reset();
    selectedFilesArea.classList.add('hidden');
    selectedFilesData = [];
    await loadAndRenderSlides();
  } catch (err) {
    console.error('Upload failed:', err);
    const done = doneCount > 0 ? `${doneCount}件は登録済み。` : '';
    showNotification(`${done}残り${selectedFilesData.length}件の登録に失敗しました: ${err.message}`, true);
    renderSelectedFiles();
    if (doneCount > 0) await loadAndRenderSlides();
  } finally {
    uploadSubmitBtn.disabled = false;
    uploadSubmitBtn.textContent = 'アップロードして登録';
  }
}

// 期限切れスライドの自動削除 (終了日から30日超過)
async function autoPurgeExpired(slides) {
  const today = todayInTokyo();
  const toPurge = expiredForPurge(slides, today, 30);
  if (toPurge.length === 0) return;

  for (const slide of toPurge) {
    try {
      // 記録を先に消す。ファイルだけ先に消えると、表示端末に中身の無いスライドが残る
      await deleteSlide(slide.id);
      if (slide.storage_path) {
        await deleteSlideFile(slide.storage_path).catch(() => {});
      }
    } catch (err) {
      console.warn('Auto purge error for slide:', slide.id, err);
    }
  }

  showNotification(`期限から30日経過した ${toPurge.length}件のスライドを自動削除しました`);
}

// スライド一覧の読み込みと描画
async function loadAndRenderSlides() {
  try {
    allSlides = await fetchSlides();

    // 期限切れ自動パージ
    await autoPurgeExpired(allSlides);

    // パージ後の再取得
    allSlides = await fetchSlides();

    renderLists();
  } catch (err) {
    console.error('Failed to load slides:', err);
    showNotification(`一覧の取得に失敗しました: ${err.message}`, true);
  }
}

function renderLists() {
  const today = todayInTokyo();

  const showing = [];
  const upcoming = [];
  const ended = [];

  for (const s of allSlides) {
    const status = slideStatus(s, today);
    if (status === 'showing') showing.push(s);
    else if (status === 'upcoming') upcoming.push(s);
    else if (status === 'ended') ended.push(s);
  }

  showingCount.textContent = showing.length;
  upcomingCount.textContent = upcoming.length;
  endedCount.textContent = ended.length;

  // 「いま流れている」は表示ページと同じ順（pickSlides）で並べる
  renderGroup(showingList, pickSlides(showing, today), '現在表示中のスライドはありません');
  renderGroup(upcomingList, upcoming, '開始待ちのスライドはありません');
  renderGroup(endedList, ended, '終了したスライドはありません');
}

function renderGroup(container, list, emptyMessage) {
  container.innerHTML = '';
  if (list.length === 0) {
    container.innerHTML = `<p class="empty-text">${emptyMessage}</p>`;
    return;
  }

  list.forEach((slide) => {
    const card = document.createElement('div');
    card.className = 'slide-card';

    // サムネイル部分
    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'slide-thumb-wrap';

    if (slide.kind === 'video') {
      thumbWrap.innerHTML = '<span class="slide-thumb-video">🎬</span>';
    } else {
      const img = document.createElement('img');
      img.className = 'slide-thumb';
      img.alt = slide.title;
      // 署名付き URL でサムネイル表示
      createSignedUrl(slide.storage_path, 3600)
        .then(url => { if (url) img.src = url; })
        .catch(() => {});
      thumbWrap.appendChild(img);
    }
    card.appendChild(thumbWrap);

    // 情報部分
    const info = document.createElement('div');
    info.className = 'slide-info';
    // タイトルや名前は HTML として解釈させない（ファイル名がそのままタイトルになるため）
    const el = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text !== undefined) e.textContent = text;
      return e;
    };
    const titleRow = el('div', 'slide-title-row');
    const titleEl = el('span', 'slide-title', slide.title);
    titleEl.title = slide.title;
    titleRow.append(titleEl, el('span', 'slide-kind-badge', slide.kind === 'image' ? '画像' : '動画'));
    const meta = el('div', 'slide-meta');
    meta.append(el('span', '', `📅 ${slide.starts_on} 〜 ${slide.ends_on}`));
    if (slide.kind === 'image') meta.append(el('span', '', `⏱ ${slide.duration_sec}秒`));
    info.append(titleRow, meta);
    card.appendChild(info);

    // 操作ボタン部分
    const actions = document.createElement('div');
    actions.className = 'slide-actions';

    // 編集ボタン
    const editBtn = document.createElement('button');
    editBtn.className = 'btn-icon';
    editBtn.textContent = '編集';
    editBtn.title = '内容を編集';
    editBtn.addEventListener('click', () => openEditModal(slide));
    actions.appendChild(editBtn);

    // 削除ボタン
    const delBtn = document.createElement('button');
    delBtn.className = 'btn-icon btn-delete';
    delBtn.textContent = '削除';
    delBtn.title = 'スライドを削除';
    delBtn.addEventListener('click', () => handleDeleteSlide(slide));
    actions.appendChild(delBtn);

    card.appendChild(actions);
    container.appendChild(card);
  });
}

// 編集モーダル
let currentEditingSlide = null;
function openEditModal(slide) {
  currentEditingSlide = slide;
  editSlideId.value = slide.id;
  editTitle.value = slide.title;
  editStartsOn.value = slide.starts_on;
  editEndsOn.value = slide.ends_on;

  if (slide.kind === 'image') {
    editDuration.value = slide.duration_sec;
    editDurationGroup.classList.remove('hidden');
  } else {
    editDurationGroup.classList.add('hidden');
  }

  editModal.showModal();
}

async function handleEditSubmit(e) {
  e.preventDefault();
  if (!currentEditingSlide) return;

  const title = editTitle.value.trim();
  const starts_on = editStartsOn.value;
  const ends_on = editEndsOn.value;

  if (starts_on > ends_on) {
    alert('開始日は終了日以前の日付を指定してください。');
    return;
  }

  const patch = { title, starts_on, ends_on };
  if (currentEditingSlide.kind === 'image') {
    const dur = Number(editDuration.value);
    if (dur < 3 || dur > 60) {
      alert('表示秒数は3〜60秒の間で指定してください。');
      return;
    }
    patch.duration_sec = dur;
  }

  try {
    await updateSlide(currentEditingSlide.id, patch);
    editModal.close();
    showNotification('スライドを更新しました');
    await loadAndRenderSlides();
  } catch (err) {
    console.error('Failed to update slide:', err);
    alert(`更新に失敗しました: ${err.message}`);
  }
}

// スライド削除
async function handleDeleteSlide(slide) {
  const confirmed = confirm(`スライド「${slide.title}」を削除しますか？\n（ファイルも完全に削除されます）`);
  if (!confirmed) return;

  try {
    await deleteSlide(slide.id);
    if (slide.storage_path) {
      await deleteSlideFile(slide.storage_path).catch(() => {});
    }
    showNotification(`「${slide.title}」を削除しました`);
    await loadAndRenderSlides();
  } catch (err) {
    console.error('Failed to delete slide:', err);
    showNotification(`削除に失敗しました: ${err.message}`, true);
  }
}

// 初期化
async function init() {
  if (!isConfigured()) {
    showView('config');
    return;
  }

  adminEmail.value = SIGNAGE_STAFF_EMAIL;

  // ログインフォーム
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginBtn.disabled = true;
    loginError.classList.add('hidden');
    try {
      await signIn(SIGNAGE_STAFF_EMAIL, adminPassword.value);
      await checkAuthAndStart();
    } catch (err) {
      loginError.textContent = err.message || 'ログインに失敗しました';
      loginError.classList.remove('hidden');
    } finally {
      loginBtn.disabled = false;
    }
  });

  // ログアウトボタン
  const doLogout = async () => {
    await signOut();
    showView('login');
  };
  logoutBtn.addEventListener('click', doLogout);
  unauthorizedLogoutBtn.addEventListener('click', doLogout);

  // 表示ページを見るボタン
  viewDisplayBtn.addEventListener('click', () => {
    window.open('index.html', '_blank');
  });

  // ファイル選択
  fileInput.addEventListener('change', (e) => {
    handleFilesSelected(e.target.files);
  });

  uploadCancelBtn.addEventListener('click', () => {
    uploadForm.reset();
    selectedFilesArea.classList.add('hidden');
    selectedFilesData = [];
  });

  uploadForm.addEventListener('submit', handleUploadSubmit);

  // 一覧更新
  refreshListBtn.addEventListener('click', loadAndRenderSlides);

  // 編集モーダル
  editForm.addEventListener('submit', handleEditSubmit);
  editCancelBtn.addEventListener('click', () => editModal.close());

  // 鍵つき URL（admin.html#k=…）で開いたら、合言葉を入れずにそのまま入る
  const linkKey = readLinkKey(location.hash);
  if (linkKey && !(await getSession())) {
    try {
      await signIn(SIGNAGE_STAFF_EMAIL, linkKey);
    } catch (err) {
      showView('login');
      loginError.textContent = err.message === '合言葉が違います'
        ? 'この URL の鍵は使えなくなっています。新しい URL をもらってください'
        : `つながりません。通信を確かめて読み込み直してください（${err.message}）`;
      loginError.classList.remove('hidden');
      return;
    }
  }

  await checkAuthAndStart();
}

async function checkAuthAndStart() {
  const session = await getSession();
  if (!session) {
    showView('login');
    return;
  }

  let role;
  try {
    role = await getRole();
  } catch (err) {
    showView('login');
    showNotification(`つながりません。通信を確かめて読み込み直してください（${err.message}）`, true);
    return;
  }
  if (role !== 'editor') {
    showView('unauthorized');
    return;
  }

  currentUserName.textContent = 'スタッフ';
  showView('app');
  await loadAndRenderSlides();
}

window.addEventListener('DOMContentLoaded', init);
