// Workspace = bộ URL có tên, dùng lại nhiều lần (khác Session là snapshot một lần).
import { load, update } from './storage.js';

export function normalizeUrl(input) {
  const raw = (input || '').trim();
  if (!raw) throw new Error('URL đang trống.');
  let url;
  try { url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); }
  catch { throw new Error('URL không hợp lệ.'); }
  if (!/^https?:$/.test(url.protocol)) throw new Error('Chỉ hỗ trợ http/https.');
  return url.href;
}

const touch = (w) => ({ ...w, updatedAt: Date.now() });
const patch = (id, fn) => update('workspaces', (list) => list.map((w) => (w.id === id ? touch(fn(w)) : w)));

export async function listWorkspaces() {
  return (await load()).workspaces;
}

export async function createWorkspace(name, urls = []) {
  const now = Date.now();
  const seen = new Set();
  const workspace = {
    id: crypto.randomUUID(),
    name: name?.trim() || `Workspace ${new Date(now).toLocaleDateString('vi-VN')}`,
    urls: urls
      .filter((u) => (seen.has(u.url) ? false : seen.add(u.url)))
      .map((u) => ({ url: u.url, title: u.title || u.url })),
    createdAt: now,
    updatedAt: now,
  };
  await update('workspaces', (list) => [workspace, ...list]);
  return workspace;
}

export async function createFromCurrent(name) {
  const tabs = (await chrome.tabs.query({ currentWindow: true }))
    .filter((t) => /^https?:/i.test(t.url || ''))
    .map((t) => ({ url: t.url, title: t.title }));
  if (!tabs.length) throw new Error('Không có tab hợp lệ để lưu.');
  return createWorkspace(name, tabs);
}

export const renameWorkspace = (id, name) =>
  patch(id, (w) => ({ ...w, name: name?.trim() || w.name }));

export function addUrl(id, input) {
  const url = normalizeUrl(input);
  return patch(id, (w) => (w.urls.some((x) => x.url === url) ? w : { ...w, urls: [...w.urls, { url, title: url }] }));
}

export const removeUrl = (id, url) =>
  patch(id, (w) => ({ ...w, urls: w.urls.filter((x) => x.url !== url) }));

// Đổi chỗ URL tại vị trí index với vị trí index + delta (delta = -1 lên, +1 xuống).
export const moveUrl = (id, index, delta) =>
  patch(id, (w) => {
    const j = index + delta;
    if (j < 0 || j >= w.urls.length) return w;
    const urls = [...w.urls];
    [urls[index], urls[j]] = [urls[j], urls[index]];
    return { ...w, urls };
  });

export const deleteWorkspace = (id) =>
  update('workspaces', (list) => list.filter((w) => w.id !== id));

export async function openWorkspace(id) {
  const w = (await listWorkspaces()).find((x) => x.id === id);
  if (!w) throw new Error('Không tìm thấy workspace.');
  if (!w.urls.length) throw new Error('Workspace này chưa có URL nào.');
  await chrome.windows.create({ url: w.urls.map((x) => x.url) });
}
