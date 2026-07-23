import { listMembers, addMember, updateMember, deleteMember } from '../services/db.js';
import { openModal, confirmModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import { icon } from '../utils/icon.js';
import { escapeHtml } from '../utils/format.js';
import { isNfcSupported, isSecureContextOk, startNfcScan } from '../services/nfc.js';

export async function mountPage() {
  const listEl = document.getElementById('member-list');
  const addBtn = document.getElementById('add-member-btn');
  const searchInput = document.getElementById('member-search');

  let allMembers = [];

  async function refresh() {
    listEl.innerHTML = '<div class="state-block"><div class="spinner"></div>載入中…</div>';
    try {
      allMembers = await listMembers();
      renderFiltered();
    } catch (err) {
      listEl.innerHTML = `<div class="error-banner">載入成員失敗：${escapeHtml(err.message || '')}</div>`;
    }
  }

  function renderFiltered() {
    const term = searchInput.value.trim().toLowerCase();
    const filtered = term
      ? allMembers.filter(
          (m) =>
            m.name.toLowerCase().includes(term) ||
            (m.cardUID || '').toLowerCase().includes(term)
        )
      : allMembers;
    renderList(filtered);
  }

  function renderList(members) {
    if (!members.length) {
      listEl.innerHTML = `
        <div class="list-empty">
          <div class="list-empty-title">${allMembers.length ? '沒有符合的成員' : '尚未登記任何成員'}</div>
          <div class="list-empty-desc">${allMembers.length ? '換個關鍵字試試' : '掃描未登記卡片時也會自動建立成員'}</div>
        </div>`;
      return;
    }

    listEl.innerHTML = members
      .map(
        (m) => `
        <div class="list-row" data-id="${m.id}">
          <div class="list-row-main">
            <div class="list-row-name">${escapeHtml(m.name)}</div>
            <div class="list-row-meta">${m.cardUID ? '卡號 ' + escapeHtml(m.cardUID) : '尚未綁定卡片'}</div>
          </div>
          <div class="list-row-actions">
            <button type="button" class="btn btn-icon btn-ghost" data-action="edit" title="編輯">${icon('edit')}</button>
            <button type="button" class="btn btn-icon btn-ghost" data-action="delete" title="刪除">${icon('trash')}</button>
          </div>
        </div>`
      )
      .join('');

    listEl.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.closest('.list-row').dataset.id;
        openMemberForm(allMembers.find((m) => m.id === id));
      });
    });

    listEl.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.closest('.list-row').dataset.id;
        const member = allMembers.find((m) => m.id === id);
        const ok = await confirmModal({
          title: '刪除成員',
          message: `確定要刪除成員「${escapeHtml(member.name)}」嗎？此操作無法復原，已產生的點名紀錄不會被刪除。`,
        });
        if (!ok) return;
        try {
          await deleteMember(id, member.name);
          showToast('已刪除成員', 'success');
          refresh();
        } catch (err) {
          showToast(`刪除失敗：${err.message || ''}`, 'danger');
        }
      });
    });
  }

  function attachUidScanner(bodyEl) {
    const scanBtn = bodyEl.querySelector('#member-uid-scan-btn');
    const uidInput = bodyEl.querySelector('#member-uid');
    let stopFn = null;

    scanBtn.addEventListener('click', async () => {
      if (stopFn) {
        stopFn();
        stopFn = null;
        scanBtn.textContent = '感應卡片';
        return;
      }
      if (!isNfcSupported() || !isSecureContextOk()) {
        showToast('此裝置或瀏覽器不支援 Web NFC，請改用 Android 手機上的 Chrome 開啟本頁面感應', 'warning');
        return;
      }
      scanBtn.textContent = '感應中…（點擊取消）';
      try {
        stopFn = await startNfcScan(
          (uid) => {
            uidInput.value = uid;
            showToast('已讀取卡號', 'success');
            stopFn?.();
            stopFn = null;
            scanBtn.textContent = '感應卡片';
          },
          (err) => showToast(err.message || 'NFC 讀取發生錯誤', 'danger')
        );
      } catch (err) {
        showToast(err.message || '無法啟動 NFC 感應', 'danger');
        scanBtn.textContent = '感應卡片';
      }
    });

    // 回傳清理函式：不管 modal 是被儲存/取消按鈕關閉，還是點 X／背景／Esc 關閉，
    // 都要停止還在進行中的 NFC 感應，避免讀卡機持續佔用。
    return () => {
      stopFn?.();
      stopFn = null;
    };
  }

  function openMemberForm(existing) {
    const isEdit = Boolean(existing);
    let stopUidScan = null;
    const { bodyEl } = openModal({
      title: isEdit ? '編輯成員' : '新增成員',
      onClose: () => stopUidScan?.(),
      bodyHtml: `
        <div class="field">
          <label class="field-label" for="member-name">姓名</label>
          <input class="input" id="member-name" value="${isEdit ? escapeHtml(existing.name) : ''}" placeholder="例如：王小明" />
        </div>
        <div class="field">
          <label class="field-label" for="member-uid">學生證卡號 UID（選填）</label>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <input class="input" id="member-uid" style="flex:1; min-width:160px;" value="${isEdit ? escapeHtml(existing.cardUID || '') : ''}" placeholder="以 NFC 感應學生證後取得的序號" />
            <button type="button" class="btn btn-ghost" id="member-uid-scan-btn" style="flex:none;">感應卡片</button>
          </div>
        </div>
        <div class="field">
          <label class="field-label" for="member-note">備註（選填）</label>
          <input class="input" id="member-note" value="${isEdit ? escapeHtml(existing.note || '') : ''}" />
        </div>
      `,
      buttons: [
        { label: '取消', className: 'btn-ghost', onClick: (c) => c() },
        {
          label: isEdit ? '儲存變更' : '建立成員',
          className: 'btn-primary',
          onClick: async (c) => {
            const name = document.getElementById('member-name').value.trim();
            const cardUID = document.getElementById('member-uid').value.trim();
            const note = document.getElementById('member-note').value.trim();
            if (!name) {
              showToast('請輸入姓名', 'warning');
              return;
            }
            try {
              if (isEdit) {
                await updateMember(existing.id, { name, cardUID: cardUID || null, note });
                showToast('已更新成員', 'success');
              } else {
                await addMember({ name, cardUID, note });
                showToast('已建立成員', 'success');
              }
              c();
              refresh();
            } catch (err) {
              showToast(`儲存失敗：${err.message || ''}`, 'danger');
            }
          },
        },
      ],
    });
    stopUidScan = attachUidScanner(bodyEl);
  }

  addBtn.addEventListener('click', () => openMemberForm(null));
  searchInput.addEventListener('input', renderFiltered);

  await refresh();

  return () => {
    // controls are removed with the fragment; nothing global to unbind
  };
}
