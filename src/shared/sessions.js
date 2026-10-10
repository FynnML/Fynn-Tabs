// Session = ảnh chụp (snapshot) các tab tại thời điểm lưu.
import { load, update } from './storage.js';

const isSavable = (url) => /^https?:/i.test(url || '');

export async function listSessions() {
  return (await load()).sessions;
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

export async function restoreSession(id) {
  const session = (await listSessions()).find((s) => s.id === id);
  if (!session) throw new Error('Không tìm thấy session.');
  if (!session.tabs.length) throw new Error('Session này không còn tab nào.');
  await chrome.windows.create({ url: session.tabs.map((t) => t.url) });
}

export const renameSession = (id, name) =>
  update('sessions', (list) => list.map((s) => (s.id === id ? { ...s, name: name?.trim() || s.name } : s)));

// Xoá theo vị trí (index) để không xoá nhầm các tab trùng URL.
export const removeSessionTab = (id, index) =>
  update('sessions', (list) => list.map((s) => (s.id === id ? { ...s, tabs: s.tabs.filter((_, i) => i !== index) } : s)));

export function deleteSession(id) {
  return update('sessions', (list) => list.filter((s) => s.id !== id));
}
