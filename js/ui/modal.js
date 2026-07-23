/**
 * Opens a modal.
 * @param {{title:string, bodyHtml:string, buttons?: Array<{label:string, className?:string, onClick:(close:Function)=>void}>, onClose?: Function}} opts
 * @returns {{close: Function, bodyEl: HTMLElement}}
 */
export function openModal({ title, bodyHtml, buttons = [], onClose }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const footerHtml = buttons.length
    ? `<div class="modal-footer">${buttons
        .map((b, i) => `<button type="button" class="btn ${b.className || 'btn-ghost'}" data-btn-index="${i}">${b.label}</button>`)
        .join('')}</div>`
    : '';

  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="modal-header">
        <h2 class="modal-title">${title}</h2>
        <button type="button" class="btn btn-icon btn-ghost" data-close-modal aria-label="關閉">
          <span class="ico-svg" style="--icon-url:url('images/icons/close.svg'); mask-image: var(--icon-url); -webkit-mask-image: var(--icon-url);"></span>
        </button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
      ${footerHtml}
    </div>
  `;

  document.body.appendChild(overlay);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
    if (typeof onClose === 'function') onClose();
  };

  overlay.querySelector('[data-close-modal]').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  const onKeydown = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKeydown, { once: true });

  buttons.forEach((b, i) => {
    overlay
      .querySelector(`[data-btn-index="${i}"]`)
      .addEventListener('click', () => b.onClick(close));
  });

  return { close, bodyEl: overlay.querySelector('.modal-body') };
}

/**
 * Shows a confirmation modal (e.g. before an irreversible delete), per spec section 11.
 * @param {{title:string, message:string, confirmLabel?:string}} opts
 * @returns {Promise<boolean>}
 */
export function confirmModal({ title, message, confirmLabel = '確認刪除' }) {
  return new Promise((resolve) => {
    openModal({
      title,
      bodyHtml: `<p style="margin:0; font-size:13.5px; color:var(--text-muted);">${message}</p>`,
      buttons: [
        {
          label: '取消',
          className: 'btn-ghost',
          onClick: (close) => {
            close();
            resolve(false);
          },
        },
        {
          label: confirmLabel,
          className: 'btn-danger',
          onClick: (close) => {
            close();
            resolve(true);
          },
        },
      ],
    });
  });
}
