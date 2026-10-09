(function (root, factory) {
  'use strict';

  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.GameDailyStore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORAGE_KEY = 'game-daily-hub:v1';
  const THEMES = ['genshin', 'starrail', 'zzz', 'wuwa'];
  const DEFAULT_TITLES = { daily: 'デイリーミッション', login: 'ログイン' };
  let fallbackSequence = 0;

  function localDate(date) {
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
      throw new Error('日付を取得できませんでした。端末の日時を確認してください。');
    }
    const year = String(date.getFullYear()).padStart(4, '0');
    if (year.length !== 4 || date.getFullYear() < 0) {
      throw new Error('端末の日付が対応範囲外です。');
    }
    return `${year}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function normalized(value) {
    return value.normalize('NFKC').trim().toLowerCase();
  }

  function cleanText(value, label, maximum) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`${label}を入力してください。`);
    }
    const result = value.trim();
    if (result.length > maximum) {
      throw new Error(`${label}は${maximum}文字以内で入力してください。`);
    }
    return result;
  }

  function hasExactKeys(value, keys) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      && Object.keys(value).length === keys.length
      && keys.every(function (key) { return Object.prototype.hasOwnProperty.call(value, key); });
  }

  function validDate(value) {
    if (value === null) return true;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function validText(value, maximum) {
    return typeof value === 'string' && value.length > 0 && value.length <= maximum
      && value === value.trim();
  }

  function invalidData(detail) {
    return new Error(`保存データを読み込めません（${detail}）。元のデータは変更していません。`);
  }

  function validate(data) {
    if (data && typeof data === 'object' && 'version' in data && data.version !== 1) {
      throw invalidData('未対応のバージョン');
    }
    if (!hasExactKeys(data, ['version', 'games']) || data.version !== 1 || !Array.isArray(data.games)) {
      throw invalidData('データ形式が不正です');
    }
    const ids = new Set();
    const names = new Set();
    function validateId(id) {
      if (typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(id) || ids.has(id)) {
        throw invalidData('識別番号が不正です');
      }
      ids.add(id);
    }
    data.games.forEach(function (game) {
      if (!hasExactKeys(game, ['id', 'name', 'theme', 'tasks']) || !validText(game.name, 80)
          || !THEMES.includes(game.theme) || !Array.isArray(game.tasks)) {
        throw invalidData('ゲーム情報が不正です');
      }
      validateId(game.id);
      if (names.has(normalized(game.name))) throw invalidData('ゲーム名が重複しています');
      names.add(normalized(game.name));
      const titles = new Set();
      const defaults = new Set();
      game.tasks.forEach(function (task) {
        if (!hasExactKeys(task, ['id', 'title', 'kind', 'completedOn']) || !validText(task.title, 100)
            || !['daily', 'login', 'custom'].includes(task.kind) || !validDate(task.completedOn)) {
          throw invalidData('タスク情報が不正です');
        }
        validateId(task.id);
        if (titles.has(normalized(task.title))) throw invalidData('タスク名が重複しています');
        titles.add(normalized(task.title));
        if (task.kind !== 'custom') {
          if (task.title !== DEFAULT_TITLES[task.kind] || defaults.has(task.kind)) {
            throw invalidData('基本タスクが不正です');
          }
          defaults.add(task.kind);
        }
      });
      if (defaults.size !== 2) throw invalidData('基本タスクが不足しています');
    });
    return data;
  }

  function createStore(options) {
    const storage = options && options.storage;
    const now = options && options.now ? options.now : function () { return new Date(); };
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
      throw new Error('ブラウザーの保存機能を利用できません。');
    }
    if (typeof now !== 'function') throw new Error('日時の設定が不正です。');

    function read() {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw === null) return { version: 1, games: [] };
      let data;
      try {
        data = JSON.parse(raw);
      } catch (error) {
        throw invalidData('JSON の形式が不正です');
      }
      return validate(data);
    }

    function getToday() {
      return localDate(now());
    }

    function newId(data, prefix) {
      const used = new Set();
      data.games.forEach(function (game) {
        used.add(game.id);
        game.tasks.forEach(function (task) { used.add(task.id); });
      });
      let id;
      do {
        const suffix = typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function'
          ? globalThis.crypto.randomUUID()
          : `${Date.now().toString(36)}_${(++fallbackSequence).toString(36)}_${Math.random().toString(36).slice(2)}`;
        id = `${prefix}_${suffix}`;
      } while (used.has(id));
      return id;
    }

    function gameById(data, gameId) {
      const game = data.games.find(function (item) { return item.id === gameId; });
      if (!game) throw new Error('ゲームが見つかりません。ページを更新してください。');
      return game;
    }

    function taskById(game, taskId) {
      const task = game.tasks.find(function (item) { return item.id === taskId; });
      if (!task) throw new Error('タスクが見つかりません。ページを更新してください。');
      return task;
    }

    function save(data) {
      validate(data);
      storage.setItem(STORAGE_KEY, JSON.stringify(data));
      return data;
    }

    function addGame(name, theme) {
      const title = cleanText(name, 'ゲーム名', 80);
      const selectedTheme = theme === undefined ? 'genshin' : theme;
      if (!THEMES.includes(selectedTheme)) throw new Error('カードのカラーを選び直してください。');
      const data = read();
      if (data.games.some(function (game) { return normalized(game.name) === normalized(title); })) {
        throw new Error('同じ名前のゲームは登録済みです。');
      }
      const game = { id: newId(data, 'game'), name: title, theme: selectedTheme, tasks: [] };
      data.games.push(game);
      ['daily', 'login'].forEach(function (kind) {
        game.tasks.push({ id: newId(data, 'task'), title: DEFAULT_TITLES[kind], kind: kind, completedOn: null });
      });
      save(data);
      return game;
    }

    function removeGame(gameId) {
      const data = read();
      const game = gameById(data, gameId);
      data.games.splice(data.games.indexOf(game), 1);
      return save(data);
    }

    function addTask(gameId, title) {
      const taskTitle = cleanText(title, 'タスク名', 100);
      const data = read();
      const game = gameById(data, gameId);
      if (game.tasks.some(function (task) { return normalized(task.title) === normalized(taskTitle); })) {
        throw new Error('同じ名前のタスクは登録済みです。');
      }
      const task = { id: newId(data, 'task'), title: taskTitle, kind: 'custom', completedOn: null };
      game.tasks.push(task);
      save(data);
      return task;
    }

    function removeTask(gameId, taskId) {
      const data = read();
      const game = gameById(data, gameId);
      const task = taskById(game, taskId);
      if (task.kind !== 'custom') throw new Error('基本タスクは削除できません。');
      game.tasks.splice(game.tasks.indexOf(task), 1);
      return save(data);
    }

    function setTaskCompleted(gameId, taskId, completed) {
      if (typeof completed !== 'boolean') throw new Error('完了状態の指定が不正です。');
      const data = read();
      const task = taskById(gameById(data, gameId), taskId);
      task.completedOn = completed ? getToday() : null;
      return save(data);
    }

    return { read, addGame, removeGame, addTask, removeTask, setTaskCompleted, getToday };
  }

  return { STORAGE_KEY, createStore, localDate };
});
