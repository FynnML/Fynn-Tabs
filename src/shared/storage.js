// Schema có version + migration ngay từ V1. Dữ liệu nằm trong chrome.storage.local.
export const SCHEMA_VERSION = 1;

const DEFAULTS = () => ({ schemaVersion: SCHEMA_VERSION, sessions: [], workspaces: [] });

const migrations = {
  // 1: (data) => ({ ...data, schemaVersion: 2, ... })  // ví dụ cho các phiên bản sau
};

// Hàng đợi tuần tự hóa các thao tác cập nhật (read-modify-write) để chống xung đột ghi đè
let writeQueue = Promise.resolve();

export async function load(keys = null) {
  const query = keys
    ? Array.from(new Set(['schemaVersion', ...(Array.isArray(keys) ? keys : [keys])]))
    : null;

  const data = await chrome.storage.local.get(query);
  if (!data.schemaVersion) {
    const fresh = DEFAULTS();
    await chrome.storage.local.set(fresh);
    return fresh;
  }
  let current = data;
  while (current.schemaVersion < SCHEMA_VERSION) {
    if (query !== null) {
      current = await chrome.storage.local.get(null);
    }
    const migrate = migrations[current.schemaVersion];
    if (!migrate) throw new Error(`Thiếu migration từ v${current.schemaVersion}`);
    current = migrate(current);
  }
  if (current !== data) await chrome.storage.local.set(current);
  return current;
}

export function update(key, fn) {
  const run = async () => {
    const data = await load(key);
    const next = await fn(data[key] ?? []);
    await chrome.storage.local.set({ [key]: next });
    return next;
  };

  const opPromise = writeQueue.then(run);
  writeQueue = opPromise.catch(() => {});
  return opPromise;
}
