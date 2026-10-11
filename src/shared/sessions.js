// Session = ảnh chụp (snapshot) các tab tại thời điểm lưu.
import { load, update } from './storage.js';

const isSavable = (url) => /^https?:/i.test(url || '');

export const TAB_WARNING_THRESHOLD = 20;

export async function listSessions() {
  return (await load('sessions')).sessions ?? [];
}

export async function saveCurrent(name) {
  const tabs = (await chrome.tabs.query({ currentWindow: true }))
    .filter((t) => isSavable(t.url))
    .map((t) => ({ url: t.url, title: t.title || t.url, pinned: t.pinned }));
  if (!tabs.length) throw new Error('Không có tab hợp lệ để lưu.');
  const session = {
    id: crypto.randomUUID(),
    name: name?.trim() || `Session ${new Date().toLocaleString('vi-VN')}`,
    createdAt: Date.now(),
    tabs,
  };
  await update('sessions', (list) => [session, ...list]);
  return session;
}

export async function restoreSession(id, options = {}) {
  const session = (await listSessions()).find((s) => s.id === id);
  if (!session) throw new Error('Không tìm thấy session.');
  if (!session.tabs.length) throw new Error('Session này không còn tab nào.');

  if (session.tabs.length > TAB_WARNING_THRESHOLD && typeof options.confirm === 'function') {
    const ok = await options.confirm(session.tabs.length, session.name);
    if (!ok) return false;
  }

  const win = await chrome.windows.create({ url: session.tabs.map((t) => t.url) });

  if (win?.id) {
    try {
      const createdTabs = (win.tabs && win.tabs.length === session.tabs.length)
        ? win.tabs
        : await chrome.tabs.query({ windowId: win.id });

      createdTabs.sort((a, b) => a.index - b.index);

      for (let i = 0; i < session.tabs.length; i++) {
        if (session.tabs[i]?.pinned && createdTabs[i]?.id) {
          try {
            await chrome.tabs.update(createdTabs[i].id, { pinned: true });
          } catch {
            // Không làm gián đoạn việc phục hồi nếu ghim một tab cụ thể gặp lỗi
          }
        }
      }
    } catch {
      // Bỏ qua lỗi query, cửa sổ và các tab đã được mở
    }
  }

  return true;
}

export const renameSession = (id, name) =>
  update('sessions', (list) => list.map((s) => (s.id === id ? { ...s, name: name?.trim() || s.name } : s)));

// Xoá theo vị trí (index) để không xoá nhầm các tab trùng URL.
export const removeSessionTab = (id, index) =>
  update('sessions', (list) => list.map((s) => (s.id === id ? { ...s, tabs: s.tabs.filter((_, i) => i !== index) } : s)));

export function deleteSession(id) {
  return update('sessions', (list) => list.filter((s) => s.id !== id));
}
