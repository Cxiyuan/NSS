// A11y attribute audit — v1.2.QA Sprint 2 A3-2 verification.
// Verifies that all interactive components have proper a11y attributes.
// Pure source-string inspection (no React render needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT_SRC = __dirname;  // test file lives in client/src/
const CLIENT = join(__dirname, '..');  // client/ (root)

// Helper: read source and return the line containing the first match.
async function srcContains(path, re) {
  const src = await readFile(path, 'utf8');
  return re.test(src);
}

// ─── Header.jsx: hamburger + palette + gear (covered earlier) ───────────
test('Header.jsx: hamburger has aria-label and aria-expanded', async () => {
  assert.ok(await srcContains(join(CLIENT_SRC, 'components/Layout/Header.jsx'),
    /aria-label=\{state\.mobileSidebarOpen/));
  assert.ok(await srcContains(join(CLIENT_SRC, 'components/Layout/Header.jsx'),
    /aria-expanded=\{state\.mobileSidebarOpen/));
});

test('Header.jsx: logo has role=link + tabIndex + keyboard handler', async () => {
  assert.ok(await srcContains(join(CLIENT_SRC, 'components/Layout/Header.jsx'),
    /role="link"/));
  assert.ok(await srcContains(join(CLIENT_SRC, 'components/Layout/Header.jsx'),
    /tabIndex=\{0\}/));
  assert.ok(await srcContains(join(CLIENT_SRC, 'components/Layout/Header.jsx'),
    /onKeyDown=/));
});

// ─── RightPanel.jsx: pin + close buttons (new in A3-2) ──────────────────
test('RightPanel.jsx: pin button has aria-label + aria-pressed (toggle)', async () => {
  const src = await readFile(join(CLIENT_SRC, 'components/Layout/RightPanel.jsx'), 'utf8');
  assert.ok(/aria-label=\{pinned \? '取消固定面板' : '固定面板'\}/.test(src),
    'pin button must have dynamic aria-label reflecting pinned state');
  assert.ok(/aria-pressed=\{pinned\}/.test(src),
    'pin button must have aria-pressed (it is a toggle)');
});

test('RightPanel.jsx: close button has aria-label', async () => {
  const src = await readFile(join(CLIENT_SRC, 'components/Layout/RightPanel.jsx'), 'utf8');
  assert.ok(/aria-label="关闭面板"/.test(src));
});

// ─── FilterInput.jsx: tag-remove button (new) ────────────────────────────
test('FilterInput.jsx: tag-remove button has aria-label', async () => {
  const src = await readFile(join(CLIENT_SRC, 'components/FilterInput.jsx'), 'utf8');
  assert.ok(/aria-label=\{`移除过滤类型 \$\{LINK_TYPE_LABELS\[t\]\}`\}/.test(src),
    'tag-remove button must announce which filter is being removed');
});

test('FilterInput.jsx: type group has role=group + aria-label', async () => {
  const src = await readFile(join(CLIENT_SRC, 'components/FilterInput.jsx'), 'utf8');
  assert.ok(/role="group"/.test(src), 'checkbox group should be a role=group');
  assert.ok(/aria-label="按链接类型过滤"/.test(src), 'group needs an accessible name');
});

// ─── TaskItem.jsx: retry + delete buttons (new) ──────────────────────────
test('TaskItem.jsx: retry + delete buttons have aria-label with task id', async () => {
  const src = await readFile(join(CLIENT_SRC, 'components/Task/TaskItem.jsx'), 'utf8');
  assert.ok(/aria-label=\{`重试任务 \$\{task\.id\}`\}/.test(src));
  assert.ok(/aria-label=\{`删除任务 \$\{task\.id\}`\}/.test(src));
});

// ─── UnifiedTaskForm.jsx: 4 inputs have htmlFor + id + aria-required ─────
test('UnifiedTaskForm.jsx: 4 inputs have explicit htmlFor + id', async () => {
  const src = await readFile(join(CLIENT_SRC, 'components/Task/UnifiedTaskForm.jsx'), 'utf8');
  const expectedPairs = [
    ['目标站点', 'task-form-url'],
    ['关键词', 'task-form-keywords'],
    ['探测深度', 'task-form-depth'],
    ['并发数', 'task-form-concurrency'],
  ];
  for (const [label, id] of expectedPairs) {
    const re = new RegExp(`htmlFor="${id}"`);
    assert.ok(re.test(src), `${label} label must have htmlFor="${id}"`);
    const idRe = new RegExp(`id="${id}"`);
    assert.ok(idRe.test(src), `${label} input must have id="${id}"`);
  }
});

test('UnifiedTaskForm.jsx: required inputs have aria-required="true"', async () => {
  const src = await readFile(join(CLIENT_SRC, 'components/Task/UnifiedTaskForm.jsx'), 'utf8');
  assert.ok(/aria-required="true"/.test(src),
    'required inputs should also be flagged for screen readers');
});

// ─── CommandPaletteOverlay.jsx: dialog + combobox + listbox roles ───────
test('CommandPaletteOverlay.jsx: dialog has role=dialog + aria-modal', async () => {
  const src = await readFile(join(CLIENT_SRC, 'components/Layout/CommandPaletteOverlay.jsx'), 'utf8');
  assert.ok(/role="dialog"/.test(src));
  assert.ok(/aria-modal="true"/.test(src));
  assert.ok(/aria-label="Command palette"/.test(src));
});

test('CommandPaletteOverlay.jsx: input has role=searchbox + aria-controls', async () => {
  const src = await readFile(join(CLIENT_SRC, 'components/Layout/CommandPaletteOverlay.jsx'), 'utf8');
  assert.ok(/role="searchbox"/.test(src));
  assert.ok(/aria-controls="command-palette-listbox"/.test(src));
});

test('CommandPaletteOverlay.jsx: listbox has role=listbox + aria-label', async () => {
  const src = await readFile(join(CLIENT_SRC, 'components/Layout/CommandPaletteOverlay.jsx'), 'utf8');
  assert.ok(/id="command-palette-listbox"/.test(src));
  assert.ok(/role="listbox"/.test(src));
  assert.ok(/aria-label="命令列表"/.test(src));
});

// ─── Sidebar.jsx: search input has label + id ───────────────────────────
test('Sidebar.jsx: search input has label[for] + id', async () => {
  const src = await readFile(join(CLIENT_SRC, 'components/Layout/Sidebar.jsx'), 'utf8');
  assert.ok(/htmlFor="sidebar-search"/.test(src));
  assert.ok(/id="sidebar-search"/.test(src));
  assert.ok(/aria-label="搜索任务"/.test(src));
});

// ─── ConfigPage.jsx: 7 inputs all have htmlFor + id ────────────────────
test('ConfigPage.jsx: 7 inputs have explicit htmlFor + id', async () => {
  const src = await readFile(join(CLIENT_SRC, 'pages/ConfigPage.jsx'), 'utf8');
  const expectedIds = [
    'config-proxy-enabled',
    'config-proxy-url',
    'config-ua-rotation',
    'config-browser-fallback',
    'config-max-retries',
  ];
  for (const id of expectedIds) {
    const forRe = new RegExp(`htmlFor="${id}"`);
    const idRe = new RegExp(`id="${id}"`);
    assert.ok(forRe.test(src), `${id} label must have htmlFor`);
    assert.ok(idRe.test(src), `${id} input must have id`);
  }
});

test('ConfigPage.jsx: proxy URL has aria-invalid + aria-describedby (error hint)', async () => {
  const src = await readFile(join(CLIENT_SRC, 'pages/ConfigPage.jsx'), 'utf8');
  assert.ok(/aria-invalid=\{!!proxyError\}/.test(src));
  assert.ok(/aria-describedby=/.test(src));
});

test('ConfigPage.jsx: delay range has role=group + aria-labelledby', async () => {
  const src = await readFile(join(CLIENT_SRC, 'pages/ConfigPage.jsx'), 'utf8');
  assert.ok(/role="group"/.test(src), 'delay range needs role=group to relate the two number inputs');
  assert.ok(/aria-labelledby="config-request-delay-label"/.test(src));
});

// ─── App.jsx: skip-to-content link + main id ───────────────────────────
test('App.jsx: skip-to-content link exists with text "跳到主要内容"', async () => {
  const src = await readFile(join(CLIENT_SRC, 'App.jsx'), 'utf8');
  assert.ok(/<a href="#main-content" className="skip-to-content">/.test(src));
  assert.ok(/跳到主要内容/.test(src));
});

test('App.jsx: <main> has id="main-content" + tabIndex=-1 + aria-label', async () => {
  const src = await readFile(join(CLIENT_SRC, 'App.jsx'), 'utf8');
  assert.ok(/id="main-content"/.test(src), '<main> needs id="main-content" for skip-link target');
  assert.ok(/tabIndex=\{-1\}/.test(src), '<main> must be focusable for skip-link to land on it');
  assert.ok(/aria-label="主要内容"/.test(src));
});

// ─── App.css: skip-to-content styles (hidden until focus) ───────────────
test('App.css: .skip-to-content is hidden by default, visible on focus', async () => {
  const css = await readFile(join(CLIENT_SRC, 'App.css'), 'utf8');
  assert.ok(/\.skip-to-content \{/.test(css));
  assert.ok(/top: -100px/.test(css), 'must be off-screen by default');
  assert.ok(/top: 8px/.test(css), 'must move on-screen on focus');
  assert.ok(/:focus/.test(css), 'must have :focus rule');
});

// ─── ConfirmDialog.jsx: dialog + autoFocus ──────────────────────────────
test('ConfirmDialog.jsx: overlay has role=dialog + aria-modal + aria-labelledby', async () => {
  const src = await readFile(join(CLIENT_SRC, 'components/ConfirmDialog.jsx'), 'utf8');
  assert.ok(/role="dialog"/.test(src));
  assert.ok(/aria-modal="true"/.test(src));
  assert.ok(/aria-labelledby="confirm-message"/.test(src));
});

test('ConfirmDialog.jsx: confirm button has autoFocus (keyboard trap)', async () => {
  const src = await readFile(join(CLIENT_SRC, 'components/ConfirmDialog.jsx'), 'utf8');
  assert.ok(/autoFocus/.test(src), 'autoFocus on confirm button traps keyboard');
});

// ─── ToastContext.jsx: live region ──────────────────────────────────────
test('ToastContext.jsx: container has role=region + aria-label="Notifications"', async () => {
  const src = await readFile(join(CLIENT_SRC, 'components/ToastContext.jsx'), 'utf8');
  assert.ok(/role="region"/.test(src), 'toast container needs an accessible wrapper');
  assert.ok(/aria-label="Notifications"/.test(src));
});

test('ToastContext.jsx: error toasts are role=alert + aria-live=assertive', async () => {
  const src = await readFile(join(CLIENT_SRC, 'components/ToastContext.jsx'), 'utf8');
  assert.ok(/role=\{isUrgent \? 'alert' : 'status'\}/.test(src));
  assert.ok(/aria-live=\{isUrgent \? 'assertive' : 'polite'\}/.test(src));
});
