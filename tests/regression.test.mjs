import test from 'node:test';
import assert from 'node:assert/strict';

// Helper mock storage
function createMockChromeStorage(initialData = {}) {
  let store = JSON.parse(JSON.stringify(initialData));
  let getCalls = [];
  let setCalls = [];

  return {
    getStore: () => store,
    getCalls: () => getCalls,
    setCalls: () => setCalls,
    storage: {
      local: {
        async get(keys) {
          getCalls.push(keys);
          if (keys === null || keys === undefined) {
            return JSON.parse(JSON.stringify(store));
          }
          const query = Array.isArray(keys) ? keys : [keys];
          const result = {};
          for (const k of query) {
            if (k in store) result[k] = JSON.parse(JSON.stringify(store[k]));
          }
          return result;
        },
        async set(obj) {
          setCalls.push(obj);
          for (const [k, v] of Object.entries(obj)) {
            store[k] = JSON.parse(JSON.stringify(v));
          }
        }
      }
    }
  };
}

test('1. Privacy fix: createFaviconElement uses Chromium _favicon and never calls Google Favicon', async () => {
  globalThis.chrome = {
    runtime: {
      getURL(path) {
        return `chrome-extension://fynntabsid${path}`;
      }
    }
  };

  // Mock DOM
  globalThis.document = {
    createElement(tag) {
      return {
        tagName: tag.toUpperCase(),
        className: '',
        src: '',
        alt: '',
        loading: '',
        innerHTML: '',
        children: [],
        appendChild(child) {
          this.children.push(child);
        }
      };
    }
  };

  const { createFaviconElement } = await import('../src/shared/icons.js');

  const container = createFaviconElement('https://sensitive.internal.corp/dashboard?token=secret123');
  const img = container.children[0];
  assert.ok(img, 'Image element should be appended');
  assert.ok(
    img.src.startsWith('chrome-extension://fynntabsid/_favicon/?pageUrl='),
    `Src should use internal endpoint, got: ${img.src}`
  );
  assert.ok(!img.src.includes('google.com/s2/favicons'), 'Must never request Google Favicon API');

  // Non-http fallback
  const internalContainer = createFaviconElement('chrome://settings');
  assert.ok(internalContainer.innerHTML.includes('<svg'), 'Internal URL should render fallback SVG');
});

test('2. Storage: Routine load fetches only requested keys + schemaVersion', async () => {
  const mock = createMockChromeStorage({ schemaVersion: 1, sessions: [{ id: 's1' }], workspaces: [{ id: 'w1' }] });
  globalThis.chrome = mock;

  const { load } = await import('../src/shared/storage.js');

  await load('sessions');
  const lastGet = mock.getCalls().at(-1);
  assert.deepEqual(new Set(lastGet), new Set(['schemaVersion', 'sessions']), 'Should only fetch schemaVersion and sessions');
  assert.ok(!lastGet.includes('workspaces'), 'Workspaces must not be fetched on routine session load');

  // export load (no params) fetches null (all)
  await load();
  assert.equal(mock.getCalls().at(-1), null, 'load() without params fetches all keys (null)');
});

test('3. Storage: Concurrent updates are serialized and do not overwrite each other', async () => {
  const mock = createMockChromeStorage({ schemaVersion: 1, sessions: [] });
  globalThis.chrome = mock;

  const { update } = await import('../src/shared/storage.js');

  // Trigger two concurrent updates simulating popup and manager saving at the same instant
  const p1 = update('sessions', (list) => [...list, { id: 's1', name: 'Session 1' }]);
  const p2 = update('sessions', (list) => [...list, { id: 's2', name: 'Session 2' }]);

  await Promise.all([p1, p2]);

  const finalSessions = mock.getStore().sessions;
  assert.equal(finalSessions.length, 2, 'Both concurrent sessions must survive');
  assert.deepEqual(finalSessions.map((s) => s.id), ['s1', 's2']);
});

test('4. Storage: Failed update rejects caller but does not poison write queue', async () => {
  const mock = createMockChromeStorage({ schemaVersion: 1, sessions: [{ id: 'initial' }] });
  globalThis.chrome = mock;

  const { update } = await import('../src/shared/storage.js');

  const pFailing = update('sessions', () => {
    throw new Error('Simulation failed write');
  });

  const pSuccess = update('sessions', (list) => [...list, { id: 'recovered' }]);

  await assert.rejects(pFailing, { message: 'Simulation failed write' });
  const result = await pSuccess;

  assert.equal(result.length, 2);
  assert.equal(result[1].id, 'recovered');
});

test('5. Backup: 5 MiB import size limit is enforced', async () => {
  const { importData, MAX_IMPORT_SIZE } = await import('../src/shared/backup.js');

  assert.equal(MAX_IMPORT_SIZE, 5 * 1024 * 1024);

  // Create an oversized text (> 5 MiB)
  const oversizedText = ' '.repeat(5 * 1024 * 1024 + 10);
  await assert.rejects(
    () => importData(oversizedText),
    /5 MiB/
  );
});

test('6. Backup: Imported records are placed at the beginning while preserving order and merge semantics', async () => {
  const mock = createMockChromeStorage({
    schemaVersion: 1,
    sessions: [
      { id: 's_old1', name: 'Old Session 1', createdAt: 100, tabs: [] },
      { id: 's_old2', name: 'Old Session 2', createdAt: 200, tabs: [] }
    ],
    workspaces: [
      { id: 'w_old1', name: 'Old WS 1', createdAt: 100, updatedAt: 100, urls: [] }
    ]
  });
  globalThis.chrome = mock;

  const { importData } = await import('../src/shared/backup.js');

  const backupPayload = JSON.stringify({
    app: 'fynn-tabs',
    schemaVersion: 1,
    sessions: [
      { id: 's_imp1', name: 'Imported 1', tabs: [{ url: 'https://site1.com' }] },
      { id: 's_imp2', name: 'Imported 2', tabs: [{ url: 'https://site2.com' }] },
      { id: 's_old1', name: 'Duplicate Should Be Ignored', tabs: [] }
    ],
    workspaces: [
      { id: 'w_imp1', name: 'Imported WS 1', urls: [{ url: 'https://ws1.com' }] }
    ]
  });

  const summary = await importData(backupPayload);
  assert.equal(summary.sessions, 2, 'Should only import 2 non-duplicate sessions');
  assert.equal(summary.workspaces, 1, 'Should only import 1 non-duplicate workspace');

  const sessions = mock.getStore().sessions;
  // Order must be: [s_imp1, s_imp2, s_old1, s_old2]
  assert.deepEqual(
    sessions.map((s) => s.id),
    ['s_imp1', 's_imp2', 's_old1', 's_old2'],
    'Imported sessions must appear at the beginning and retain order relative to each other'
  );

  const workspaces = mock.getStore().workspaces;
  assert.deepEqual(
    workspaces.map((w) => w.id),
    ['w_imp1', 'w_old1'],
    'Imported workspaces must appear at the beginning'
  );
});

test('7. Sessions: Tab count safeguard (> 20 tabs) and Cancel guarantee', async () => {
  const tabs25 = Array.from({ length: 25 }, (_, i) => ({ url: `https://test${i}.com`, pinned: false }));
  const mock = createMockChromeStorage({
    schemaVersion: 1,
    sessions: [{ id: 'sess25', name: 'Large Session', tabs: tabs25 }]
  });

  let windowsCreated = 0;
  globalThis.chrome = {
    ...mock,
    windows: {
      async create() {
        windowsCreated++;
        return { id: 123 };
      }
    },
    tabs: {
      async query() {
        return [];
      }
    }
  };

  const { restoreSession } = await import('../src/shared/sessions.js');

  // Case A: User cancels confirmation
  let confirmPrompted = false;
  const resultCancelled = await restoreSession('sess25', {
    confirm: (count) => {
      confirmPrompted = true;
      assert.equal(count, 25);
      return false; // User cancels
    }
  });

  assert.equal(confirmPrompted, true);
  assert.equal(resultCancelled, false);
  assert.equal(windowsCreated, 0, 'No window or tabs must be opened when user cancels');

  // Case B: User confirms
  const resultConfirmed = await restoreSession('sess25', {
    confirm: () => true
  });
  assert.equal(resultConfirmed, true);
  assert.equal(windowsCreated, 1, 'Window must be opened when confirmed');
});

test('8. Sessions: Pinned tabs restoration with index-based mapping and duplicate URLs', async () => {
  const sessionTabs = [
    { url: 'https://example.com/same', pinned: true, title: 'Pin 1' },
    { url: 'https://example.com/different', pinned: false, title: 'Unpinned 1' },
    { url: 'https://example.com/same', pinned: true, title: 'Pin 2 duplicate URL' },
    { url: 'https://example.com/other', title: 'Missing pinned field' }
  ];

  const mock = createMockChromeStorage({
    schemaVersion: 1,
    sessions: [{ id: 'sess_pins', name: 'Pinned Session', tabs: sessionTabs }]
  });

  const createdTabsInWindow = [
    { id: 101, index: 0, url: 'https://example.com/same' },
    { id: 102, index: 1, url: 'https://example.com/different' },
    { id: 103, index: 2, url: 'https://example.com/same' },
    { id: 104, index: 3, url: 'https://example.com/other' }
  ];

  const pinnedTabIds = [];
  globalThis.chrome = {
    ...mock,
    windows: {
      async create() {
        return { id: 999, tabs: createdTabsInWindow };
      }
    },
    tabs: {
      async query() {
        return createdTabsInWindow;
      },
      async update(tabId, updateProps) {
        if (updateProps.pinned) {
          pinnedTabIds.push(tabId);
        }
      }
    }
  };

  const { restoreSession } = await import('../src/shared/sessions.js');
  await restoreSession('sess_pins');

  assert.deepEqual(pinnedTabIds, [101, 103], 'Only indices 0 and 2 should be pinned, mapping by index not URL');
});

test('9. Workspaces: Tab count safeguard (> 20 tabs) on openWorkspace', async () => {
  const urls22 = Array.from({ length: 22 }, (_, i) => ({ url: `https://ws-tab${i}.com` }));
  const mock = createMockChromeStorage({
    schemaVersion: 1,
    workspaces: [{ id: 'ws22', name: 'Large Workspace', urls: urls22 }]
  });

  let windowsCreated = 0;
  globalThis.chrome = {
    ...mock,
    windows: {
      async create() {
        windowsCreated++;
        return { id: 456 };
      }
    }
  };

  const { openWorkspace } = await import('../src/shared/workspaces.js');

  // Cancelled
  const resCancel = await openWorkspace('ws22', { confirm: () => false });
  assert.equal(resCancel, false);
  assert.equal(windowsCreated, 0);

  // Confirmed
  const resConfirm = await openWorkspace('ws22', { confirm: () => true });
  assert.equal(resConfirm, true);
  assert.equal(windowsCreated, 1);
});

test('10. Empty state helper: Uses textContent and does not interpolate message into HTML', async () => {
  const createdElements = [];
  globalThis.document = {
    createElement(tag) {
      const el = {
        tagName: tag.toUpperCase(),
        className: '',
        innerHTML: '',
        textContent: '',
        children: [],
        appendChild(child) {
          this.children.push(child);
        }
      };
      createdElements.push(el);
      return el;
    }
  };

  const { createEmptyState } = await import('../src/shared/ui.js');
  const untrustedMsg = '<img src=x onerror=alert(1)> & test';
  const emptyState = createEmptyState(untrustedMsg, '<svg>icon</svg>');

  assert.equal(emptyState.innerHTML, '<svg>icon</svg>');
  const p = emptyState.children[0];
  assert.ok(p, 'p element should be appended');
  assert.equal(p.textContent, untrustedMsg, 'Message must be set as plain textContent');
  assert.equal(p.innerHTML, '', 'InnerHTML of p must not be set');
});

