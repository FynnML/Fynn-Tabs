// Schema có version + migration ngay từ V1. Dữ liệu nằm trong chrome.storage.local.
export const SCHEMA_VERSION = 1;

const DEFAULTS = () => ({ schemaVersion: SCHEMA_VERSION, sessions: [], workspaces: [] });

const migrations = {
  // 1: (data) => ({ ...data, schemaVersion: 2, ... })  // ví dụ cho các phiên bản sau
};

export async function load() {
  const data = await chrome.storage.local.get(null);
  if (!data.schemaVersion) {
    const fresh = DEFAULTS();
    await chrome.storage.local.set(fresh);
    return fresh;
  }
  let current = data;
  while (current.schemaVersion < SCHEMA_VERSION) {
    const migrate = migrations[current.schemaVersion];
    if (!migrate) throw new Error(`Thiếu migration từ v${current.schemaVersion}`);
    current = migrate(current);
  }
  if (current !== data) await chrome.storage.local.set(current);
  return current;
}

export async function update(key, fn) {
  const data = await load();
  const next = fn(data[key] ?? []);
  await chrome.storage.local.set({ [key]: next });
  return next;
}
