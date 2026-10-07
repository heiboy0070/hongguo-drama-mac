const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const store = require('../src/store');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hongguo-store-'));
const file = path.join(dir, 'data.json');
const write = fs.writeFileSync;
const log = console.error;
try {
  store.init(file);
  store.saveSettings({ theme: 'light' });
  const before = fs.readFileSync(file, 'utf8');
  fs.writeFileSync = (target, ...args) => {
    write(target, '{');
    throw new Error('simulated disk full');
  };
  console.error = () => {};
  store.saveTasks([{ id: 'pending' }]);
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'failed write must preserve the last complete state');
  fs.writeFileSync = write;
  store.saveTasks([{ id: 'complete' }]);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).tasks[0].id, 'complete');
  assert.deepEqual(fs.readdirSync(dir), ['data.json']);
  console.log('PASS: interrupted save preserves data; next save recovers; no temporary file remains');
} finally {
  fs.writeFileSync = write;
  console.error = log;
  fs.rmSync(dir, { recursive: true, force: true });
}
