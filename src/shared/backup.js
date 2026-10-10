// Xuất / nhập dữ liệu ra file JSON. Nhập = gộp (merge), không ghi đè dữ liệu hiện có.
import { load, update, SCHEMA_VERSION } from './storage.js';

const isHttp = (u) => typeof u === 'string' && /^https?:\/\//i.test(u);
const asName = (v, fallback) => (typeof v === 'string' && v.trim() ? v.trim() : fallback);
const asTime = (v, fallback) => (Number.isFinite(v) ? v : fallback);

const cleanTabs = (arr) =>
  (Array.isArray(arr) ? arr : [])
    .filter((t) => t && isHttp(t.url))
    .map((t) => ({ url: t.url, title: asName(t.title, t.url), pinned: !!t.pinned }));

const cleanUrls = (arr) => cleanTabs(arr).map(({ url, title }) => ({ url, title }));

export async function exportData() {
  const { sessions, workspaces } = await load();
  return JSON.stringify(
    { app: 'fynn-tabs', schemaVersion: SCHEMA_VERSION, exportedAt: Date.now(), sessions, workspaces },
    null, 2,
  );
}

export async function importData(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('File không phải JSON hợp lệ.'); }
  if (!data || data.app !== 'fynn-tabs') throw new Error('Đây không phải file sao lưu của Fynn Tabs.');
  if (typeof data.schemaVersion !== 'number' || data.schemaVersion > SCHEMA_VERSION) {
    throw new Error('File được tạo bởi phiên bản mới hơn của Fynn Tabs. Hãy cập nhật extension trước.');
  }
  // Khi có schema v2+: chạy migration cho data.schemaVersion < SCHEMA_VERSION ở đây.

  const current = await load();
  const have = {
    sessions: new Set(current.sessions.map((s) => s.id)),
    workspaces: new Set(current.workspaces.map((w) => w.id)),
  };
  const now = Date.now();
  const pick = (arr, kind, build) => (Array.isArray(arr) ? arr : [])
    .filter((x) => x && typeof x.id === 'string' && !have[kind].has(x.id) && have[kind].add(x.id))
    .map(build);

  const sessions = pick(data.sessions, 'sessions', (s) => ({
    id: s.id, name: asName(s.name, 'Session đã nhập'), createdAt: asTime(s.createdAt, now), tabs: cleanTabs(s.tabs),
  }));
  const workspaces = pick(data.workspaces, 'workspaces', (w) => ({
    id: w.id, name: asName(w.name, 'Workspace đã nhập'), urls: cleanUrls(w.urls),
    createdAt: asTime(w.createdAt, now), updatedAt: asTime(w.updatedAt, now),
  }));

  if (sessions.length) await update('sessions', (list) => [...list, ...sessions]);
  if (workspaces.length) await update('workspaces', (list) => [...list, ...workspaces]);
  return { sessions: sessions.length, workspaces: workspaces.length };
}
