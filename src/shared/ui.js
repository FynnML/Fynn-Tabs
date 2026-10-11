import { showToast } from './toast.js';

export const $ = (id) => document.getElementById(id);

export const guard = (fn) => async (...args) => {
  try {
    await fn(...args);
  } catch (err) {
    showToast(err.message, 'error');
  }
};

export function createEmptyState(message, iconSvg) {
  const div = document.createElement('div');
  div.className = 'empty-state';
  if (iconSvg) {
    div.innerHTML = iconSvg;
  }
  const p = document.createElement('p');
  p.textContent = message;
  div.appendChild(p);
  return div;
}

export function confirmTabOpen(count) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';

    const box = document.createElement('div');
    box.className = 'confirm-box';

    const title = document.createElement('h3');
    title.className = 'confirm-title';
    title.textContent = 'Xác nhận mở nhiều tab';

    const msg = document.createElement('p');
    msg.className = 'confirm-message';
    msg.textContent = `Thao tác này sẽ mở ${count} tab cùng lúc và có thể làm chậm trình duyệt. Bạn có muốn tiếp tục?`;

    const actions = document.createElement('div');
    actions.className = 'confirm-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'confirm-btn-cancel';
    cancelBtn.textContent = 'Hủy';
    cancelBtn.type = 'button';

    const continueBtn = document.createElement('button');
    continueBtn.className = 'primary confirm-btn-continue';
    continueBtn.textContent = 'Tiếp tục';
    continueBtn.type = 'button';

    let done = false;
    const cleanup = (result) => {
      if (done) return;
      done = true;
      window.removeEventListener('keydown', handleKey);
      overlay.remove();
      resolve(result);
    };

    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanup(false);
      }
    };

    cancelBtn.onclick = (e) => {
      e.stopPropagation();
      cleanup(false);
    };

    continueBtn.onclick = (e) => {
      e.stopPropagation();
      cleanup(true);
    };

    overlay.onclick = (e) => {
      if (e.target === overlay) cleanup(false);
    };

    window.addEventListener('keydown', handleKey);

    actions.append(cancelBtn, continueBtn);
    box.append(title, msg, actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    cancelBtn.focus();
  });
}
