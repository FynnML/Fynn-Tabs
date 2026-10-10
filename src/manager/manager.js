import { listSessions, restoreSession, deleteSession, renameSession, removeSessionTab } from '../shared/sessions.js';
import * as ws from '../shared/workspaces.js';
import { exportData, importData } from '../shared/backup.js';
import { ICONS, createFaviconElement, getDomain } from '../shared/icons.js';
import { showToast } from '../shared/toast.js';

const $ = (id) => document.getElementById(id);

let query = '';
let activeFilter = 'all'; // 'all' | 'workspaces' | 'sessions'
const openIds = new Set();
const match = (text) => (text || '').toLowerCase().includes(query);

const guard = (fn) => async (...args) => {
  try {
    await fn(...args);
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// Cài đặt icon tĩnh
function setupIcons() {
  $('brand-logo').innerHTML = ICONS.logo;
  $('export-icon').innerHTML = ICONS.download;
  $('import-icon').innerHTML = ICONS.upload;
  $('stat-icon-ws').innerHTML = ICONS.folder;
  $('stat-icon-sess').innerHTML = ICONS.history;
  $('stat-icon-urls').innerHTML = ICONS.tabs;
  $('search-icon').innerHTML = ICONS.search;
  $('ws-sec-icon').innerHTML = ICONS.folder;
  $('sess-sec-icon').innerHTML = ICONS.history;
}

// Cập nhật số liệu thống kê ở bảng Dashboard
function updateStats(workspaces, sessions) {
  $('stat-ws-count').textContent = workspaces.length;
  $('stat-sess-count').textContent = sessions.length;

  const totalUrls = workspaces.reduce((sum, w) => sum + w.urls.length, 0)
    + sessions.reduce((sum, s) => sum + s.tabs.length, 0);
  $('stat-url-count').textContent = totalUrls;

  $('ws-badge').textContent = workspaces.length;
  $('sess-badge').textContent = sessions.length;
}

// Tạo empty state
function createEmptyState(message, iconSvg) {
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.innerHTML = `${iconSvg}<p>${message}</p>`;
  return div;
}

// Tạo nút xác nhận xóa mượt mà (inline confirm, không dùng dialog confirm chặn màn hình)
function createConfirmDeleteButton(onConfirm) {
  const btn = document.createElement('button');
  btn.className = 'icon-btn danger';
  btn.title = 'Xoá';
  btn.innerHTML = ICONS.trash;

  let confirming = false;
  let timer = null;

  btn.onclick = (e) => {
    e.stopPropagation();
    if (!confirming) {
      confirming = true;
      btn.innerHTML = ICONS.check;
      btn.style.color = 'var(--danger)';
      btn.title = 'Bấm lần nữa để xác nhận xoá';
      showToast('Bấm lần nữa để xác nhận xoá', 'info', 1800);

      timer = setTimeout(() => {
        confirming = false;
        btn.innerHTML = ICONS.trash;
        btn.title = 'Xoá';
      }, 3000);
    } else {
      clearTimeout(timer);
      guard(onConfirm)();
    }
  };

  return btn;
}

// Tạo Accordion Card với Inline Edit Title
function createCard({ id, iconSvg, title, subtitle, countBadge, actions, bodyElements, onRename }) {
  const isOpen = openIds.has(id) || !!query;
  const cardEl = document.createElement('div');
  cardEl.className = `card ${isOpen ? 'open' : ''}`;

  // Header
  const header = document.createElement('div');
  header.className = 'card-header';

  const chevron = document.createElement('span');
  chevron.className = 'card-chevron';
  chevron.innerHTML = ICONS.chevronDown;

  const typeIcon = document.createElement('span');
  typeIcon.className = 'favicon-box';
  typeIcon.innerHTML = iconSvg;

  const titleArea = document.createElement('div');
  titleArea.className = 'card-title-area';

  const titleText = document.createElement('span');
  titleText.className = 'card-title';
  titleText.textContent = title;

  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = countBadge;

  const sub = document.createElement('span');
  sub.className = 'muted';
  sub.textContent = subtitle;

  titleArea.append(titleText, badge, sub);

  // Nhóm nút hành động
  const actionsContainer = document.createElement('div');
  actionsContainer.className = 'card-actions';

  // Nút Đổi tên inline
  const editBtn = document.createElement('button');
  editBtn.className = 'icon-btn';
  editBtn.title = 'Đổi tên';
  editBtn.innerHTML = ICONS.edit;

  editBtn.onclick = (e) => {
    e.stopPropagation();
    // Bật input đổi tên
    const input = document.createElement('input');
    input.className = 'card-title-input';
    input.value = title;

    const saveRename = async () => {
      const nextName = input.value.trim();
      if (nextName && nextName !== title && onRename) {
        await onRename(nextName);
        showToast('Đã đổi tên thành công', 'success');
      } else {
        titleArea.replaceChildren(titleText, badge, sub);
      }
    };

    input.onblur = guard(saveRename);
    input.onkeydown = (ev) => {
      if (ev.key === 'Enter') input.blur();
      if (ev.key === 'Escape') titleArea.replaceChildren(titleText, badge, sub);
    };

    titleArea.replaceChildren(input);
    input.focus();
    input.select();
  };

  actionsContainer.append(editBtn, ...actions);

  header.append(chevron, typeIcon, titleArea, actionsContainer);

  // Toggle card
  header.onclick = (e) => {
    // Không toggle nếu đang click vào nút bấm hoặc input đổi tên
    if (e.target.closest('button') || e.target.closest('input')) return;
    const isNowOpen = !cardEl.classList.contains('open');
    cardEl.classList.toggle('open', isNowOpen);
    if (!query) {
      if (isNowOpen) openIds.add(id);
      else openIds.delete(id);
    }
  };

  // Body
  const body = document.createElement('div');
  body.className = 'card-body';
  body.append(...bodyElements);

  cardEl.append(header, body);
  return cardEl;
}

// Render Workspaces
async function renderWorkspaces() {
  const all = await ws.listWorkspaces();
  const list = query
    ? all.filter((w) => match(w.name) || w.urls.some((u) => match(`${u.title} ${u.url}`)))
    : all;

  if (!list.length) {
    $('workspaces').replaceChildren(
      createEmptyState(query ? 'Không có workspace khớp tìm kiếm.' : 'Chưa có workspace nào. Hãy tạo mới bên trên.', ICONS.folder)
    );
    return all;
  }

  const elements = list.map((w) => {
    // URL Items
    const urlElements = w.urls.map((u, i) => {
      const row = document.createElement('div');
      row.className = 'url-row';

      const fav = createFaviconElement(u.url);

      const link = document.createElement('div');
      link.className = 'url-link';
      link.title = `Mở: ${u.url}`;

      const t = document.createElement('div');
      t.className = 'url-title';
      t.textContent = u.title || u.url;

      const s = document.createElement('div');
      s.className = 'url-sub';
      s.textContent = getDomain(u.url) || u.url;

      link.append(t, s);
      link.onclick = () => chrome.tabs.create({ url: u.url });

      // Nút điều khiển URL
      const acts = document.createElement('div');
      acts.className = 'url-actions';

      const upBtn = document.createElement('button');
      upBtn.className = 'icon-btn';
      upBtn.title = 'Di chuyển lên';
      upBtn.innerHTML = ICONS.arrowUp;
      upBtn.onclick = guard(async () => {
        await ws.moveUrl(w.id, i, -1);
        renderWorkspaces();
      });

      const downBtn = document.createElement('button');
      downBtn.className = 'icon-btn';
      downBtn.title = 'Di chuyển xuống';
      downBtn.innerHTML = ICONS.arrowDown;
      downBtn.onclick = guard(async () => {
        await ws.moveUrl(w.id, i, 1);
        renderWorkspaces();
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'icon-btn danger';
      delBtn.title = 'Xoá URL';
      delBtn.innerHTML = ICONS.close;
      delBtn.onclick = guard(async () => {
        await ws.removeUrl(w.id, u.url);
        renderWorkspaces();
      });

      acts.append(upBtn, downBtn, delBtn);
      row.append(fav, link, acts);
      return row;
    });

    // Hàng thêm URL mới vào Workspace
    const addRow = document.createElement('div');
    addRow.className = 'add-url-row';

    const input = document.createElement('input');
    input.placeholder = 'Thêm URL vào workspace này (vd: github.com)…';

    const addBtn = document.createElement('button');
    addBtn.className = 'primary';
    addBtn.innerHTML = `${ICONS.plus} Thêm URL`;

    const handleAdd = async () => {
      await ws.addUrl(w.id, input.value);
      input.value = '';
      openIds.add(w.id);
      showToast('Đã thêm URL vào workspace', 'success');
      renderWorkspaces();
    };

    addBtn.onclick = guard(handleAdd);
    input.onkeydown = (e) => {
      if (e.key === 'Enter') guard(handleAdd)();
    };

    addRow.append(input, addBtn);

    // Nút mở tất cả tab
    const openAllBtn = document.createElement('button');
    openAllBtn.className = 'primary';
    openAllBtn.innerHTML = `${ICONS.externalLink} Mở tất cả`;
    openAllBtn.onclick = guard(async (e) => {
      e.stopPropagation();
      await ws.openWorkspace(w.id);
      showToast(`Đã mở workspace "${w.name}"`, 'success');
    });

    // Nút xóa workspace
    const deleteBtn = createConfirmDeleteButton(async () => {
      await ws.deleteWorkspace(w.id);
      openIds.delete(w.id);
      showToast(`Đã xoá workspace "${w.name}"`, 'success');
      renderAll();
    });

    return createCard({
      id: w.id,
      iconSvg: ICONS.folder,
      title: w.name,
      subtitle: '',
      countBadge: `${w.urls.length} URL`,
      actions: [openAllBtn, deleteBtn],
      bodyElements: urlElements.length ? [...urlElements, addRow] : [addRow],
      onRename: async (newName) => {
        await ws.renameWorkspace(w.id, newName);
        renderWorkspaces();
      }
    });
  });

  $('workspaces').replaceChildren(...elements);
  return all;
}

// Render Sessions
async function renderSessions() {
  const all = await listSessions();
  const list = query
    ? all.filter((s) => match(s.name) || s.tabs.some((t) => match(`${t.title} ${t.url}`)))
    : all;

  if (!list.length) {
    $('sessions').replaceChildren(
      createEmptyState(query ? 'Không có session khớp tìm kiếm.' : 'Chưa có session nào được lưu.', ICONS.history)
    );
    return all;
  }

  const elements = list.map((s) => {
    // Tab Items
    const tabElements = s.tabs.map((t, i) => {
      const row = document.createElement('div');
      row.className = 'url-row';

      const fav = createFaviconElement(t.url);

      const link = document.createElement('div');
      link.className = 'url-link';
      link.title = `Mở tab: ${t.url}`;

      const titleEl = document.createElement('div');
      titleEl.className = 'url-title';
      titleEl.textContent = t.title || t.url;

      const sub = document.createElement('div');
      sub.className = 'url-sub';
      sub.textContent = getDomain(t.url) || t.url;

      link.append(titleEl, sub);
      link.onclick = () => chrome.tabs.create({ url: t.url });

      const delBtn = document.createElement('button');
      delBtn.className = 'icon-btn danger';
      delBtn.title = 'Xoá tab khỏi session';
      delBtn.innerHTML = ICONS.close;
      delBtn.onclick = guard(async () => {
        await removeSessionTab(s.id, i);
        openIds.add(s.id);
        renderSessions();
      });

      row.append(fav, link, delBtn);
      return row;
    });

    const when = new Date(s.createdAt).toLocaleString('vi-VN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Nút khôi phục
    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'primary';
    restoreBtn.innerHTML = `${ICONS.externalLink} Khôi phục`;
    restoreBtn.onclick = guard(async (e) => {
      e.stopPropagation();
      await restoreSession(s.id);
      showToast(`Đã khôi phục "${s.name}"`, 'success');
    });

    // Nút chuyển thành Workspace
    const toWsBtn = document.createElement('button');
    toWsBtn.title = 'Chuyển thành Workspace dùng lâu dài';
    toWsBtn.innerHTML = `${ICONS.folder} → Workspace`;
    toWsBtn.onclick = guard(async (e) => {
      e.stopPropagation();
      const w = await ws.createWorkspace(s.name, s.tabs);
      openIds.add(w.id);
      showToast(`Đã tạo workspace "${w.name}" từ session`, 'success');
      renderAll();
    });

    // Nút xóa session
    const deleteBtn = createConfirmDeleteButton(async () => {
      await deleteSession(s.id);
      openIds.delete(s.id);
      showToast(`Đã xoá session "${s.name}"`, 'success');
      renderAll();
    });

    return createCard({
      id: s.id,
      iconSvg: ICONS.history,
      title: s.name,
      subtitle: `Lưu lúc ${when}`,
      countBadge: `${s.tabs.length} tab`,
      actions: [restoreBtn, toWsBtn, deleteBtn],
      bodyElements: tabElements.length ? tabElements : [createEmptyState('Session này không còn tab nào.', ICONS.history)],
      onRename: async (newName) => {
        await renameSession(s.id, newName);
        renderSessions();
      }
    });
  });

  $('sessions').replaceChildren(...elements);
  return all;
}

// Cập nhật toàn bộ giao diện
async function renderAll() {
  const [workspaces, sessions] = await Promise.all([renderWorkspaces(), renderSessions()]);
  updateStats(workspaces, sessions);
}

// Cài đặt bộ lọc Filter Pills
function setupFilters() {
  const pills = document.querySelectorAll('.filter-pill');
  pills.forEach((pill) => {
    pill.addEventListener('click', () => {
      pills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      activeFilter = pill.dataset.filter;

      const wsSec = $('section-workspaces');
      const sessSec = $('section-sessions');

      if (activeFilter === 'workspaces') {
        wsSec.style.display = 'block';
        sessSec.style.display = 'none';
      } else if (activeFilter === 'sessions') {
        wsSec.style.display = 'none';
        sessSec.style.display = 'block';
      } else {
        wsSec.style.display = 'block';
        sessSec.style.display = 'block';
      }
    });
  });
}

// Cài đặt các sự kiện chính
function setupEvents() {
  // Tìm kiếm
  $('search').oninput = () => {
    query = $('search').value.trim().toLowerCase();
    $('search-clear').classList.toggle('visible', query.length > 0);
    renderAll();
  };
  $('search-clear').onclick = () => {
    $('search').value = '';
    query = '';
    $('search-clear').classList.remove('visible');
    renderAll();
  };

  // Tạo workspace mới rỗng
  $('wnew').onclick = guard(async () => {
    const val = $('wname').value.trim();
    const w = await ws.createWorkspace(val);
    $('wname').value = '';
    openIds.add(w.id);
    showToast(`Đã tạo workspace "${w.name}"`, 'success');
    renderAll();
  });
  $('wname').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('wnew').click();
  });

  // Tạo workspace từ tab hiện tại
  $('wcur').onclick = guard(async () => {
    const val = $('wname').value.trim();
    const w = await ws.createFromCurrent(val);
    $('wname').value = '';
    openIds.add(w.id);
    showToast(`Đã lưu "${w.name}" từ ${w.urls.length} tab`, 'success');
    renderAll();
  });

  // Xuất file JSON
  $('export').onclick = guard(async () => {
    const blob = new Blob([await exportData()], { type: 'application/json' });
    const filename = `fynn-tabs-${new Date().toISOString().slice(0, 10)}.json`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    showToast('Đã xuất file sao lưu JSON thành công', 'success');
  });

  // Nhập file JSON
  $('import').onclick = () => $('file').click();
  $('file').onchange = guard(async () => {
    const file = $('file').files[0];
    if (!file) return;
    try {
      const r = await importData(await file.text());
      showToast(`Đã nạp ${r.workspaces} workspace & ${r.sessions} session mới!`, 'success');
      await renderAll();
    } finally {
      $('file').value = '';
    }
  });
}

// Khởi chạy
function init() {
  setupIcons();
  setupFilters();
  setupEvents();
  renderAll();
}

init();
