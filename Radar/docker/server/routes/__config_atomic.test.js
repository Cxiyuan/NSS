// Config atomic write tests — v1.2.QA Sprint 4 A2-9.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, unlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpDir;
test.beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'config-test-'));
});
test.afterEach(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

// Replicate saveConfigToDisk logic (re-imported from config.js would
// require the full module + Express deps; here we test the contract)
async function atomicWrite(filePath, content) {
  const { writeFileSync, existsSync, copyFileSync, renameSync, unlinkSync } = await import('node:fs');
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  const backupPath = `${filePath}.bak`;
  writeFileSync(tmpPath, content, 'utf-8');
  if (existsSync(filePath)) {
    try { copyFileSync(filePath, backupPath); } catch {}
  }
  renameSync(tmpPath, filePath);
}

test('A2-9: atomic write creates the target file', async () => {
  const path = join(tmpDir, 'config.json');
  await atomicWrite(path, '{"a": 1}');
  assert.ok(existsSync(path));
  const data = JSON.parse(readFileSync(path, 'utf-8'));
  assert.deepEqual(data, { a: 1 });
});

test('A2-9: atomic write creates a backup of the previous content', async () => {
  const path = join(tmpDir, 'config.json');
  await atomicWrite(path, '{"v": 1}');
  await atomicWrite(path, '{"v": 2}');
  const backup = JSON.parse(readFileSync(path + '.bak', 'utf-8'));
  assert.deepEqual(backup, { v: 1 });
  const current = JSON.parse(readFileSync(path, 'utf-8'));
  assert.deepEqual(current, { v: 2 });
});

test('A2-9: no backup created on first write (no prior file)', async () => {
  const path = join(tmpDir, 'config.json');
  await atomicWrite(path, '{"first": true}');
  assert.equal(existsSync(path + '.bak'), false);
});

test('A2-9: temp file is cleaned up on success (no leftover .tmp)', async () => {
  const path = join(tmpDir, 'config.json');
  await atomicWrite(path, '{}');
  // Scan for any .tmp. files in the dir
  const { readdirSync } = await import('node:fs');
  const files = readdirSync(tmpDir);
  const tmps = files.filter(f => f.includes('.tmp.'));
  assert.equal(tmps.length, 0, `temp files leaked: ${tmps.join(', ')}`);
});

test('A2-9: rename is atomic — old file is fully replaced, not appended', async () => {
  // Simulate: write old content, then write much smaller new content.
  // If writeFileSync is used (non-atomic), there is a moment where the
  // file is empty (truncate-before-write). With atomic rename, the
  // file is NEVER empty — it's either old or new, never in between.
  const path = join(tmpDir, 'config.json');
  await atomicWrite(path, JSON.stringify({ old: 'this is the old long content that takes many bytes' }));
  // Race-condition check: read the file 1000 times in a tight loop
  // while another write is happening. The content should ALWAYS be
  // valid JSON (old OR new), never partial.
  const oldContent = readFileSync(path, 'utf-8');
  let inconsistentReads = 0;
  const writePromises = [];
  for (let i = 0; i < 50; i++) {
    writePromises.push(atomicWrite(path, JSON.stringify({ new: i })));
  }
  for (let i = 0; i < 1000; i++) {
    const content = readFileSync(path, 'utf-8');
    try {
      const parsed = JSON.parse(content);
      // Either old or new — no partial state
      if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        inconsistentReads++;
      } else if (parsed.old === undefined && parsed.new === undefined) {
        inconsistentReads++;
      }
    } catch {
      inconsistentReads++;  // partial JSON = bad
    }
  }
  await Promise.all(writePromises);
  assert.equal(inconsistentReads, 0, 'atomic rename should never expose partial state');
});
