import { listSessions, saveCurrent, restoreSession, deleteSession } from '../shared/sessions.js';
import { listWorkspaces, createFromCurrent, openWorkspace, deleteWorkspace } from '../shared/workspaces.js';
import { ICONS, createFaviconElement, getDomain } from '../shared/icons.js';
import { showToast } from '../shared/toast.js';

const $ = (id) => document.getElementById(id);
let currentTabs = [];

// Khởi tạo các biểu tượng tĩnh
function setupIcons() {
  $('brand-logo').innerHTML = ICONS.logo;
  $('manager-icon').innerHTML = ICONS.externalLink;
  $('tab-icon').innerHTML = ICONS.tabs;
  $('workspace-icon').innerHTML = ICONS.folder;
  $('session-icon').innerHTML = ICONS.history;
  $('search-icon').innerHTML = ICONS.search;
  $('save-session-icon').innerHTML = ICONS.plus;
  $('save-workspace-icon').innerHTML = ICONS.plus;
}

// Bọc hàm bắt lỗi và thông báo Toast
const guard = (fn) => async (...args) => {
  try {
    await fn(...args);
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// Quản lý chuyển tab giao diện
function setupNavTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.tab-view').forEach((v) => v.classList.remove('active'));

      tab.classList.add('active');
      const viewId = tab.dataset.view;
      const targetView = $(viewId);
      if (targetView) targetView.classList.add('active');

      if (viewId === 'view-tabs') $('q').focus();
    });
  });
}

// Chuyển tab lập trình
function switchTab(viewId) {
  const tabBtn = document.querySelector(`.nav-tab[data-view="${viewId}"]`);
  if (tabBtn) tabBtn.click();
}

// Tạo empty state trực quan
function createEmptyState(message, iconSvg) {
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.innerHTML = `${iconSvg}<p>${message}</p>`;
  return div;
}

// Render danh sách tab đang mở
function renderTabs() {
  const query = $('q').value.trim().toLowerCase();
  $('q-clear').classList.toggle('visible', query.length > 0);

  const filtered = currentTabs.filter((t) => {
    const text = ((t.title || '') + ' ' + (t.url || '')).toLowerCase();
    return text.includes(query);
  });

  $('badge-tabs').textContent = currentTabs.length;

  if (!filtered.length) {
    $('tabs').replaceChildren(createEmptyState(query ? 'Không tìm thấy tab phù hợp' : 'Không có tab nào', ICONS.search));
    return;
  }

  const elements = filtered.map((t) => {
    const item = document.createElement('div');
    item.className = `item ${t.active ? 'active' : ''}`;
    item.title = `${t.title || ''}\n${t.url || ''}`;

    // Favicon
    const favicon = createFaviconElement(t.url);

    // Thông tin Tab
    const info = document.createElement('div');
    info.className = 'item-info';

    const titleEl = document.createElement('div');
    titleEl.className = 'item-title';
    if (t.pinned) {
      const pinIcon = document.createElement('span');
      pinIcon.className = 'pinned-tag';
      pinIcon.innerHTML = ICONS.pin;
      titleEl.appendChild(pinIcon);
    }
    titleEl.appendChild(document.createTextNode(t.title || t.url || 'Tab mới'));

    const subtitleEl = document.createElement('div');
    subtitleEl.className = 'item-subtitle';
    subtitleEl.textContent = getDomain(t.url) || t.url;

    info.append(titleEl, subtitleEl);

    // Nút đóng tab
    const actions = document.createElement('div');
    actions.className = 'item-actions';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'icon-btn danger';
    closeBtn.title = 'Đóng tab';
    closeBtn.innerHTML = ICONS.close;
    closeBtn.onclick = async (e) => {
      e.stopPropagation();
      await chrome.tabs.remove(t.id);
      currentTabs = currentTabs.filter((x) => x.id !== t.id);
      renderTabs();
    };

    actions.appendChild(closeBtn);
    item.append(favicon, info, actions);

    // Click vào item để chuyển tab
    item.onclick = async () => {
      await chrome.tabs.update(t.id, { active: true });
      window.close();
    };

    return item;
  });

  $('tabs').replaceChildren(...elements);
}

// Render danh sách Workspaces
async function renderWorkspaces() {
  const list = await listWorkspaces();
  $('badge-workspaces').textContent = list.length;

  if (!list.length) {
    $('workspaces').replaceChildren(createEmptyState('Chưa có workspace nào được lưu', ICONS.folder));
    return;
  }

  const elements = list.map((w) => {
    const item = document.createElement('div');
    item.className = 'item';

    const icon = document.createElement('span');
    icon.className = 'favicon-box';
    icon.innerHTML = ICONS.folder;

    const info = document.createElement('div');
    info.className = 'item-info';

    const title = document.createElement('div');
    title.className = 'item-title';
    title.textContent = w.name;

    const subtitle = document.createElement('div');
    subtitle.className = 'item-subtitle';
    subtitle.textContent = `${w.urls.length} URL`;

    info.append(title, subtitle);

    const actions = document.createElement('div');
    actions.className = 'item-actions';

    const openBtn = document.createElement('button');
    openBtn.className = 'icon-btn';
    openBtn.title = 'Mở workspace trong cửa sổ mới';
    openBtn.innerHTML = ICONS.externalLink;
    openBtn.onclick = guard(async (e) => {
      e.stopPropagation();
      await openWorkspace(w.id);
      showToast(`Đã mở "${w.name}"`, 'success');
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn danger';
    delBtn.title = 'Xoá workspace';
    delBtn.innerHTML = ICONS.trash;
    delBtn.onclick = guard(async (e) => {
      e.stopPropagation();
      await deleteWorkspace(w.id);
      showToast('Đã xóa workspace', 'success');
      renderWorkspaces();
    });

    actions.append(openBtn, delBtn);
    item.append(icon, info, actions);

    item.onclick = guard(async () => {
      await openWorkspace(w.id);
    });

    return item;
  });

  $('workspaces').replaceChildren(...elements);
}

// Render danh sách Sessions
async function renderSessions() {
  const list = await listSessions();
  $('badge-sessions').textContent = list.length;

  if (!list.length) {
    $('sessions').replaceChildren(createEmptyState('Chưa có session nào được lưu', ICONS.history));
    return;
  }

  const elements = list.map((s) => {
    const item = document.createElement('div');
    item.className = 'item';

    const icon = document.createElement('span');
    icon.className = 'favicon-box';
    icon.innerHTML = ICONS.history;

    const info = document.createElement('div');
    info.className = 'item-info';

    const title = document.createElement('div');
    title.className = 'item-title';
    title.textContent = s.name;

    const subtitle = document.createElement('div');
    subtitle.className = 'item-subtitle';
    const dateStr = new Date(s.createdAt).toLocaleDateString('vi-VN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    subtitle.textContent = `${s.tabs.length} tab · ${dateStr}`;

    info.append(title, subtitle);

    const actions = document.createElement('div');
    actions.className = 'item-actions';

    const openBtn = document.createElement('button');
    openBtn.className = 'icon-btn';
    openBtn.title = 'Khôi phục session trong cửa sổ mới';
    openBtn.innerHTML = ICONS.externalLink;
    openBtn.onclick = guard(async (e) => {
      e.stopPropagation();
      await restoreSession(s.id);
      showToast(`Đã khôi phục "${s.name}"`, 'success');
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn danger';
    delBtn.title = 'Xoá session';
    delBtn.innerHTML = ICONS.trash;
    delBtn.onclick = guard(async (e) => {
      e.stopPropagation();
      await deleteSession(s.id);
      showToast('Đã xóa session', 'success');
      renderSessions();
    });

    actions.append(openBtn, delBtn);
    item.append(icon, info, actions);

    item.onclick = guard(async () => {
      await restoreSession(s.id);
    });

    return item;
  });

  $('sessions').replaceChildren(...elements);
}

// Thiết lập các sự kiện
function setupEvents() {
  // Tìm kiếm
  $('q').oninput = renderTabs;
  $('q-clear').onclick = () => {
    $('q').value = '';
    $('q').focus();
    renderTabs();
  };

  // Nút mở Manager
  $('open-manager').onclick = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/manager/manager.html') });
  };

  // Nút chuyển nhanh sang lưu Session / Workspace
  $('btn-quick-session').onclick = () => {
    switchTab('view-sessions');
    $('name').focus();
  };
  $('btn-quick-workspace').onclick = () => {
    switchTab('view-workspaces');
    $('wname').focus();
  };

  // Lưu Session
  $('save').onclick = guard(async () => {
    const s = await saveCurrent($('name').value);
    $('name').value = '';
    showToast(`Đã lưu session "${s.name}"`, 'success');
    renderSessions();
  });
  $('name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('save').click();
  });

  // Lưu Workspace
  $('wsave').onclick = guard(async () => {
    const w = await createFromCurrent($('wname').value);
    $('wname').value = '';
    showToast(`Đã lưu workspace "${w.name}"`, 'success');
    renderWorkspaces();
  });
  $('wname').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('wsave').click();
  });
}

// Khởi chạy ứng dụng Popup
async function init() {
  setupIcons();
  setupNavTabs();
  setupEvents();

  currentTabs = await chrome.tabs.query({ currentWindow: true });
  renderTabs();
  renderWorkspaces();
  renderSessions();
}

init();
