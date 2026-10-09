const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { STORAGE_KEY, createStore, localDate } = require('../store.js');

function memoryStorage(initial) {
  const items = new Map(initial === undefined ? [] : [[STORAGE_KEY, initial]]);
  return {
    getItem(key) { return items.has(key) ? items.get(key) : null; },
    setItem(key, value) { items.set(key, String(value)); }
  };
}

function fixture() {
  const storage = memoryStorage();
  const store = createStore({ storage, now: () => new Date(2026, 9, 9, 12) });
  return { storage, store };
}

test('first visit is empty and adds each game with exactly two independent default tasks', () => {
  const { store, storage } = fixture();
  assert.deepEqual(store.read(), { version: 1, games: [] });
  assert.equal(storage.getItem(STORAGE_KEY), null);
  const first = store.addGame('  原神  ');
  const second = store.addGame('Star Rail', 'starrail');
  assert.equal(first.name, '原神');
  assert.equal(first.theme, 'genshin');
  assert.equal(second.theme, 'starrail');
  assert.deepEqual(first.tasks.map(({ title, kind, completedOn }) => ({ title, kind, completedOn })), [
    { title: 'デイリーミッション', kind: 'daily', completedOn: null },
    { title: 'ログイン', kind: 'login', completedOn: null }
  ]);
  const ids = [first, ...first.tasks, second, ...second.tasks].map(item => item.id);
  assert.equal(new Set(ids).size, ids.length);
  ids.forEach(id => assert.match(id, /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/));
});

test('custom tasks can be added and removed; defaults cannot be removed', () => {
  const { store } = fixture();
  const game = store.addGame('原神');
  const custom = store.addTask(game.id, '  樹脂を消費する  ');
  assert.equal(custom.kind, 'custom');
  assert.equal(custom.title, '樹脂を消費する');
  assert.equal(store.read().games[0].tasks.length, 3);
  assert.throws(() => store.removeTask(game.id, game.tasks[0].id), /基本タスク/);
  assert.throws(() => store.removeTask(game.id, game.tasks[1].id), /基本タスク/);
  store.removeTask(game.id, custom.id);
  assert.equal(store.read().games[0].tasks.length, 2);
  store.removeGame(game.id);
  assert.deepEqual(store.read().games, []);
});

test('input validation rejects empty, excessive and normalized duplicate names without writing', () => {
  const { store, storage } = fixture();
  const game = store.addGame('Game');
  const custom = store.addTask(game.id, 'My Task');
  const raw = storage.getItem(STORAGE_KEY);
  for (const invalid of ['', '  \t\n', null, 42, 'a'.repeat(81)]) {
    assert.throws(() => store.addGame(invalid));
  }
  for (const invalid of [' game ', 'ＧＡＭＥ']) assert.throws(() => store.addGame(invalid), /登録済み/);
  for (const invalid of ['', '  ', undefined, 'a'.repeat(101)]) assert.throws(() => store.addTask(game.id, invalid));
  for (const duplicate of ['my task', ' Ｍｙ Ｔａｓｋ ', 'ログイン', 'ﾃﾞｲﾘｰﾐｯｼｮﾝ']) {
    assert.throws(() => store.addTask(game.id, duplicate), /登録済み/);
  }
  assert.throws(() => store.addGame('Other', 'unknown'), /カラー/);
  assert.throws(() => store.setTaskCompleted(game.id, custom.id, 'true'), /完了状態/);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
});

test('saved games, custom tasks and checkmarks survive store recreation; callers cannot mutate saved state', () => {
  const { store, storage } = fixture();
  const game = store.addGame('原神');
  const task = store.addTask(game.id, '探索する');
  store.setTaskCompleted(game.id, task.id, true);
  const reopened = createStore({ storage, now: () => new Date(2026, 9, 9, 23) });
  assert.deepEqual(reopened.read(), store.read());
  assert.equal(reopened.read().games[0].tasks[2].completedOn, reopened.getToday());
  const detached = reopened.read();
  detached.games[0].name = '変更';
  game.name = '別の変更';
  task.title = '破損';
  assert.equal(reopened.read().games[0].name, '原神');
  assert.equal(reopened.read().games[0].tasks[2].title, '探索する');
  reopened.setTaskCompleted(game.id, task.id, false);
  assert.equal(store.read().games[0].tasks[2].completedOn, null);
});

test('local midnight resets effective completion while retaining games and all task definitions', () => {
  const storage = memoryStorage();
  let current = new Date(2026, 11, 31, 23, 59);
  const store = createStore({ storage, now: () => current });
  const game = store.addGame('原神');
  const custom = store.addTask(game.id, '探索する');
  for (const task of [...game.tasks, custom]) store.setTaskCompleted(game.id, task.id, true);
  assert.equal(store.getToday(), '2026-12-31');
  assert.equal(store.read().games[0].tasks.filter(task => task.completedOn === store.getToday()).length, 3);
  const before = storage.getItem(STORAGE_KEY);
  current = new Date(2027, 0, 1, 0, 0);
  assert.equal(store.getToday(), '2027-01-01');
  assert.equal(store.read().games[0].tasks.filter(task => task.completedOn === store.getToday()).length, 0);
  assert.equal(store.read().games[0].tasks.length, 3);
  assert.equal(storage.getItem(STORAGE_KEY), before);
  store.setTaskCompleted(game.id, custom.id, true);
  assert.equal(store.read().games[0].tasks[2].completedOn, '2027-01-01');
  assert.equal(store.read().games[0].tasks[0].completedOn, '2026-12-31');
});

test('calendar dates follow the browser timezone across UTC midnight and leap years', () => {
  const modulePath = path.resolve(__dirname, '../store.js');
  for (const [timezone, input, expected] of [
    ['Asia/Tokyo', '2026-12-31T15:00:00.000Z', '2027-01-01'],
    ['America/Los_Angeles', '2027-01-01T01:00:00.000Z', '2026-12-31'],
    ['Pacific/Kiritimati', '2028-02-28T10:00:00.000Z', '2028-02-29'],
    ['UTC', '2028-02-29T23:59:59.000Z', '2028-02-29']
  ]) {
    const result = spawnSync(process.execPath, ['-e', `process.stdout.write(require(${JSON.stringify(modulePath)}).localDate(new Date(${JSON.stringify(input)})))`], {
      env: { ...process.env, TZ: timezone }, encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, expected, timezone);
  }
  assert.throws(() => localDate(new Date('invalid')), /日付/);
});

test('malformed or unsupported stored data is never silently replaced', () => {
  const { store } = fixture();
  store.addGame('原神');
  const valid = store.read();
  const changed = modifier => {
    const data = structuredClone(valid);
    modifier(data);
    return JSON.stringify(data);
  };
  const damaged = [
    '', '{broken', 'null', '[]', '{}',
    JSON.stringify({ version: 2, games: [] }),
    changed(data => { data.extra = true; }),
    changed(data => { data.games[0].name = '  原神'; }),
    changed(data => { data.games[0].theme = 'missing'; }),
    changed(data => { data.games[0].id = '<script>'; }),
    changed(data => { data.games[0].tasks[1].id = data.games[0].tasks[0].id; }),
    changed(data => { data.games[0].tasks[0].completedOn = '2026-02-30'; }),
    changed(data => { data.games[0].tasks[0].completedOn = '2026-10-09T10:00Z'; }),
    changed(data => { data.games[0].tasks[0].title = 'Changed default'; }),
    changed(data => { data.games[0].tasks.pop(); }),
    changed(data => { data.games[0].tasks[0].kind = 'unknown'; }),
    changed(data => { data.games[0].tasks.push({ id: 'custom_1', title: 'ログイン', kind: 'custom', completedOn: null }); })
  ];
  for (const raw of damaged) {
    const storage = memoryStorage(raw);
    const broken = createStore({ storage });
    assert.throws(() => broken.read(), /保存データ/);
    assert.throws(() => broken.addGame('New game'), /保存データ/);
    assert.equal(storage.getItem(STORAGE_KEY), raw);
  }
});

test('failed storage writes propagate and cannot appear successful or corrupt the previous state', () => {
  const { store, storage } = fixture();
  const game = store.addGame('原神');
  const custom = store.addTask(game.id, '探索する');
  const original = storage.getItem(STORAGE_KEY);
  const quotaError = new Error('QuotaExceededError');
  storage.setItem = () => { throw quotaError; };
  const operations = [
    () => store.addGame('Other'),
    () => store.removeGame(game.id),
    () => store.addTask(game.id, 'Other task'),
    () => store.removeTask(game.id, custom.id),
    () => store.setTaskCompleted(game.id, game.tasks[0].id, true)
  ];
  for (const operation of operations) {
    assert.throws(operation, error => error === quotaError);
    assert.equal(storage.getItem(STORAGE_KEY), original);
  }
  const readError = new Error('SecurityError');
  storage.getItem = () => { throw readError; };
  assert.throws(() => store.read(), error => error === readError);
  assert.throws(() => store.addGame('New'), error => error === readError);
});

test('two existing store clients re-read current storage before every mutation', () => {
  const { store: first, storage } = fixture();
  const second = createStore({ storage, now: () => new Date(2026, 9, 9, 12) });
  assert.deepEqual(second.read().games, []);
  const firstGame = first.addGame('原神');
  const secondGame = second.addGame('スターレイル');
  first.setTaskCompleted(firstGame.id, firstGame.tasks[0].id, true);
  second.addTask(secondGame.id, '探索する');
  assert.equal(first.read().games.length, 2);
  assert.equal(second.read().games[0].tasks[0].completedOn, '2026-10-09');
  assert.equal(first.read().games[1].tasks.length, 3);
  first.removeGame(firstGame.id);
  const before = storage.getItem(STORAGE_KEY);
  assert.throws(() => second.addTask(firstGame.id, 'Stale task'), /ゲームが見つかりません/);
  assert.equal(storage.getItem(STORAGE_KEY), before);
  assert.equal(second.read().games[0].id, secondGame.id);
});

test('user-entered HTML remains plain stored text for safe textContent rendering', () => {
  const { store } = fixture();
  const name = '<img src=x onerror="alert(1)">';
  const title = '<script>alert(2)</script>';
  const game = store.addGame(name);
  store.addTask(game.id, title);
  assert.equal(store.read().games[0].name, name);
  assert.equal(store.read().games[0].tasks[2].title, title);
});
