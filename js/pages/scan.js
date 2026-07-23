import { listSessions, addSession } from '../services/db.js';
import {
  listMembers,
  findMemberByUID,
  addMember,
  findExistingAttendance,
  addAttendance,
  listAttendanceForSession,
} from '../services/db.js';
import { isNfcSupported, isSecureContextOk, startNfcScan } from '../services/nfc.js';
import { openModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import { formatTime, todayDateInputValue, escapeHtml } from '../utils/format.js';

export async function mountPage(context) {
  const sessionBar = document.getElementById('scan-session-bar');
  const sessionSelect = document.getElementById('session-select');
  const supportBanner = document.getElementById('scan-support-banner');
  const noSessionCard = document.getElementById('scan-no-session-card');
  const createTodayBtn = document.getElementById('scan-create-today-btn');
  const activeArea = document.getElementById('scan-active-area');
  const target = document.getElementById('scan-target');
  const statusTitle = document.getElementById('scan-status-title');
  const statusDesc = document.getElementById('scan-status-desc');
  const toggleBtn = document.getElementById('scan-toggle-btn');
  const recentList = document.getElementById('scan-recent-list');
  const demoBadge = document.getElementById('demo-mode-badge');
  const demoPanel = document.getElementById('scan-demo-panel');
  const demoUidInput = document.getElementById('demo-uid-input');
  const demoUidOptions = document.getElementById('demo-uid-options');
  const demoScanBtn = document.getElementById('demo-scan-btn');

  const isDemoMode = context?.params?.get('demo') === '1';

  let sessions = []; // 僅包含「今天」建立的場次
  let supportOk = isDemoMode; // demo 模式一律視為支援
  let stopScan = null;
  let isScanning = false;
  const pendingUIDs = new Set(); // avoids duplicate "register new member" modals for the same tap

  function currentSessionId() {
    return sessionSelect.value || null;
  }

  function currentSessionName() {
    const s = sessions.find((x) => x.id === currentSessionId());
    return s ? s.name : '';
  }

  function renderSupportBanner() {
    if (isDemoMode) {
      supportBanner.innerHTML =
        '<div class="warning-banner">模擬模式（Demo Mode）已啟用：目前略過真實 NFC 讀卡，僅供電腦開發測試使用，正式上線請移除網址中的 ?demo=1。</div>';
      supportOk = true;
      return;
    }
    if (isNfcSupported() && isSecureContextOk()) {
      supportBanner.innerHTML = '';
      supportOk = true;
      return;
    }
    const reason = !isSecureContextOk()
      ? 'Web NFC 需要 HTTPS 環境。'
      : '此瀏覽器不支援 Web NFC。請改用 Android 手機上的 Chrome 瀏覽器開啟本頁面，並確認手機已開啟 NFC 功能。';
    supportBanner.innerHTML = `<div class="error-banner">${reason}</div>`;
    supportOk = false;
  }

  function updateActionAvailability() {
    const disabled = !supportOk || !sessions.length;
    toggleBtn.disabled = disabled;
    demoScanBtn.disabled = disabled;
  }

  async function loadSessions() {
    const all = await listSessions();
    const todayStr = todayDateInputValue();
    sessions = all.filter((s) => s.date === todayStr);
    renderSessionAvailability();
    updateActionAvailability();
  }

  function renderSessionAvailability() {
    if (!sessions.length) {
      sessionBar.style.display = 'none';
      noSessionCard.style.display = 'block';
      activeArea.style.display = 'none';
      return;
    }
    sessionBar.style.display = 'flex';
    noSessionCard.style.display = 'none';
    activeArea.style.display = 'block';
    sessionSelect.innerHTML = sessions
      .map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`)
      .join('');
  }

  function openCreateTodaySessionModal() {
    const todayStr = todayDateInputValue();
    const { close } = openModal({
      title: '新增今日場次',
      bodyHtml: `
        <p style="margin:0 0 14px; font-size:12.5px; color:var(--text-muted);">日期：${escapeHtml(todayStr)}（今天，點名讀卡僅能對今天的場次操作）</p>
        <div class="field">
          <label class="field-label" for="today-session-name">場次名稱</label>
          <input class="input" id="today-session-name" placeholder="例如：今日工作坊" autofocus />
        </div>
        <div class="field">
          <label class="field-label" for="today-session-note">備註（選填）</label>
          <input class="input" id="today-session-note" placeholder="例如：地點、講師" />
        </div>
      `,
      buttons: [
        { label: '取消', className: 'btn-ghost', onClick: (c) => c() },
        {
          label: '建立並開始點名',
          className: 'btn-primary',
          onClick: async (c) => {
            const name = document.getElementById('today-session-name').value.trim();
            const note = document.getElementById('today-session-note').value.trim();
            if (!name) {
              showToast('請輸入場次名稱', 'warning');
              return;
            }
            try {
              await addSession({ name, date: todayStr, note });
              showToast('已建立今日場次', 'success');
              c();
              await loadSessions();
              await refreshRecentList();
              if (isDemoMode) await populateDemoUidOptions();
            } catch (err) {
              showToast(`建立場次失敗：${err.message || ''}`, 'danger');
            }
          },
        },
      ],
    });
    void close;
  }

  async function refreshRecentList() {
    const sessionId = currentSessionId();
    if (!sessionId) return;
    try {
      const records = await listAttendanceForSession(sessionId);
      renderRecentList(records.slice(0, 15));
    } catch (err) {
      console.error(err);
    }
  }

  function renderRecentList(records) {
    if (!records.length) {
      recentList.innerHTML = `
        <div class="list-empty">
          <div class="list-empty-title">尚未有任何簽到紀錄</div>
          <div class="list-empty-desc">感應成功後會顯示在這裡</div>
        </div>`;
      return;
    }
    recentList.innerHTML = records
      .map(
        (r) => `
        <div class="list-row">
          <div class="list-row-main">
            <div class="list-row-name">${escapeHtml(r.memberName)}</div>
            <div class="list-row-meta">簽到時間 ${formatTime(r.checkedInAt)}</div>
          </div>
          <span class="badge badge-success">已簽到</span>
        </div>`
      )
      .join('');
  }

  function flashTarget(state) {
    target.classList.remove('is-active', 'is-success');
    if (state) target.classList.add(state);
  }

  function setScanningUI(active) {
    isScanning = active;
    toggleBtn.textContent = active ? '停止感應' : '開始感應';
    toggleBtn.classList.toggle('btn-primary', !active);
    toggleBtn.classList.toggle('btn-ghost', active);
    sessionSelect.disabled = active;
    if (active) {
      flashTarget('is-active');
      statusTitle.textContent = '感應中…';
      statusDesc.textContent = `請將學生證靠近手機背面（場次：${currentSessionName()}）`;
    } else {
      flashTarget(null);
      statusTitle.textContent = '尚未開始感應';
      statusDesc.textContent = '點下方按鈕開始感應學生證';
    }
  }

  async function handleReading(uid) {
    const sessionId = currentSessionId();
    if (!sessionId) return;

    try {
      const member = await findMemberByUID(uid);

      if (!member) {
        if (pendingUIDs.has(uid)) return;
        pendingUIDs.add(uid);
        promptNewMember(uid, sessionId);
        return;
      }

      await checkInMember(member, sessionId, uid);
    } catch (err) {
      showToast(`處理讀卡資料失敗：${err.message || ''}`, 'danger');
    }
  }

  async function checkInMember(member, sessionId, uid) {
    const existing = await findExistingAttendance(sessionId, member.id);
    if (existing) {
      flashTarget('is-success');
      showToast(`${member.name} 已經簽到過了（${formatTime(existing.checkedInAt)}）`, 'warning');
      setTimeout(() => flashTarget(isScanning ? 'is-active' : null), 900);
      return;
    }

    await addAttendance({
      sessionId,
      memberId: member.id,
      memberName: member.name,
      cardUID: uid,
      sessionName: sessions.find((s) => s.id === sessionId)?.name,
    });
    flashTarget('is-success');
    showToast(`${member.name} 簽到成功`, 'success');
    setTimeout(() => flashTarget(isScanning ? 'is-active' : null), 900);
    refreshRecentList();
  }

  function promptNewMember(uid, sessionId) {
    flashTarget('is-active');
    const { close } = openModal({
      title: '未登記的卡片',
      bodyHtml: `
        <p style="margin:0 0 14px; font-size:13px; color:var(--text-muted);">
          感應到卡號 <strong style="color:var(--text);">${escapeHtml(uid)}</strong>，尚未有成員綁定這張卡。輸入姓名即可建立成員並完成本次簽到。
        </p>
        <div class="field">
          <label class="field-label" for="new-member-name">姓名</label>
          <input class="input" id="new-member-name" placeholder="例如：王小明" autofocus />
        </div>
      `,
      buttons: [
        {
          label: '取消',
          className: 'btn-ghost',
          onClick: (c) => {
            pendingUIDs.delete(uid);
            c();
          },
        },
        {
          label: '建立並簽到',
          className: 'btn-primary',
          onClick: async (c) => {
            const name = document.getElementById('new-member-name').value.trim();
            if (!name) {
              showToast('請輸入姓名', 'warning');
              return;
            }
            try {
              const memberId = await addMember({ name, cardUID: uid });
              await checkInMember({ id: memberId, name }, sessionId, uid);
              pendingUIDs.delete(uid);
              c();
            } catch (err) {
              showToast(`建立成員失敗：${err.message || ''}`, 'danger');
            }
          },
        },
      ],
    });
    void close;
  }

  function handleError(err) {
    showToast(err.message || 'NFC 讀取發生錯誤', 'danger');
  }

  function setupDemoUI() {
    demoBadge.style.display = 'inline-flex';
    demoPanel.style.display = 'flex';
    toggleBtn.style.display = 'none';
    statusTitle.textContent = '模擬模式';
    statusDesc.textContent = '輸入或選擇卡號後按下方按鈕模擬刷卡，僅供開發測試';
  }

  async function populateDemoUidOptions() {
    try {
      const members = await listMembers();
      demoUidOptions.innerHTML = members
        .filter((m) => m.cardUID)
        .map((m) => `<option value="${escapeHtml(m.cardUID)}">${escapeHtml(m.name)}</option>`)
        .join('');
    } catch (err) {
      console.error(err);
    }
  }

  function handleDemoScan() {
    if (!currentSessionId()) {
      showToast('請先選擇場次', 'warning');
      return;
    }
    const uid = demoUidInput.value.trim();
    if (!uid) {
      showToast('請輸入或選擇卡號', 'warning');
      return;
    }
    handleReading(uid);
    demoUidInput.value = '';
    demoUidInput.focus();
  }

  async function toggleScan() {
    if (isScanning) {
      stopScan?.();
      stopScan = null;
      setScanningUI(false);
      return;
    }

    if (!currentSessionId()) {
      showToast('請先選擇場次', 'warning');
      return;
    }

    try {
      stopScan = await startNfcScan(handleReading, handleError);
      setScanningUI(true);
    } catch (err) {
      showToast(err.message || '無法啟動 NFC 感應', 'danger');
    }
  }

  toggleBtn.addEventListener('click', toggleScan);
  demoScanBtn.addEventListener('click', handleDemoScan);
  demoUidInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleDemoScan();
  });
  sessionSelect.addEventListener('change', refreshRecentList);
  createTodayBtn.addEventListener('click', openCreateTodaySessionModal);

  if (isDemoMode) {
    setupDemoUI();
    await populateDemoUidOptions();
  }

  renderSupportBanner();
  await loadSessions();
  await refreshRecentList();

  return () => {
    if (isScanning) {
      stopScan?.();
    }
  };
}
