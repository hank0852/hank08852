/* 表示と操作。ゲーム・タスクの入力はすべて textContent で安全に表示します。 */
(() => {
  'use strict';

  const themes = {
    genshin: { label: '森', mark: '✧' },
    starrail: { label: '宇宙', mark: '✦' },
    zzz: { label: '街', mark: 'ϟ' },
    wuwa: { label: '海', mark: '≋' },
  };
  let store;
  let currentState;
  let displayedDate;
  let storageFailed = false;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function setText(id, text) {
    const node = document.getElementById(id);
    if (node) node.textContent = String(text);
  }

  function link(text, href, className) {
    const node = element('a', className, text);
    node.href = href;
    return node;
  }

  function button(text, action, gameId, taskId) {
    const node = element('button', 'button button-danger', text);
    node.type = 'button';
    node.dataset.action = action;
    node.dataset.gameId = gameId;
    if (taskId) node.dataset.taskId = taskId;
    node.dataset.focusKey = `${action}-${gameId}-${taskId || ''}`;
    return node;
  }

  function announce(text) {
    setText('app-message', text);
  }

  function showError(error) {
    const banner = document.getElementById('storage-error');
    if (banner) {
      const message = error && error.message;
      banner.textContent = error && error.name === 'QuotaExceededError'
        ? '保存容量が不足しています。変更は保存されていません。ブラウザーの空き容量を確認してください。'
        : error && error.name === 'SecurityError'
          ? 'このブラウザーではデータを保存できません。サイトの保存設定を確認してください。'
          : message && /[ぁ-んァ-ン一-龯]/.test(message)
            ? message
            : '保存できませんでした。ブラウザーの保存設定を確認してください。';
      banner.hidden = false;
    }
  }

  function clearError() {
    const banner = document.getElementById('storage-error');
    if (banner) { banner.hidden = true; banner.textContent = ''; }
  }

  function done(task, date = displayedDate) {
    return task.completedOn === date;
  }

  function summary(state, date) {
    const tasks = state.games.flatMap(game => game.tasks);
    const completed = tasks.filter(task => done(task, date)).length;
    const logged = state.games.filter(game => game.tasks.some(task => task.kind === 'login' && done(task, date))).length;
    return { total: tasks.length, completed, logged, remaining: tasks.length - completed, percent: tasks.length ? Math.round(completed / tasks.length * 100) : 0 };
  }

  function emptyState(title, description, actionText, href) {
    const box = element('div', 'empty-state');
    const mark = element('span', 'empty-state-mark', '✦');
    mark.setAttribute('aria-hidden', 'true');
    box.append(mark, element('h3', '', title), element('p', '', description));
    if (href) box.append(link(actionText, href, 'button button-primary'));
    return box;
  }

  function progress(game) {
    const completed = game.tasks.filter(task => done(task)).length;
    const track = element('div', `progress-track${completed === game.tasks.length ? ' progress-success' : ''}`);
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-label', `${game.name} の今日の進捗`);
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', String(game.tasks.length));
    track.setAttribute('aria-valuenow', String(completed));
    const fill = element('span');
    fill.style.width = `${completed / game.tasks.length * 100}%`;
    track.append(fill);
    return track;
  }

  function gameHeading(game, headingTag = 'h2') {
    const row = element('div', 'game-name');
    const icon = element('span', `game-icon icon-${game.theme}`, themes[game.theme].mark);
    icon.setAttribute('aria-hidden', 'true');
    const copy = element('div');
    copy.append(element(headingTag, '', game.name));
    row.append(icon, copy);
    return row;
  }

  function taskItem(game, task, dashboard = false) {
    const row = element('div', 'task-item');
    const label = element('label', 'task-row');
    const checkbox = element('input');
    checkbox.type = 'checkbox';
    checkbox.checked = done(task);
    checkbox.dataset.gameId = game.id;
    checkbox.dataset.taskId = task.id;
    checkbox.dataset.focusKey = `check-${game.id}-${task.id}`;
    const content = element('span', 'task-content');
    const detail = dashboard ? game.name : task.kind === 'login' ? '今日ログインしたらチェック' : task.kind === 'daily' ? 'ゲーム内のデイリー目標を達成したらチェック' : '自分で追加した毎日のタスク';
    content.append(element('strong', '', task.title), element('small', '', detail));
    label.append(checkbox, content);
    row.append(label);
    if (!dashboard && task.kind === 'custom') {
      const remove = button('削除', 'remove-task', game.id, task.id);
      remove.setAttribute('aria-label', `${task.title} を削除`);
      row.append(remove);
    } else if (!dashboard) {
      row.append(element('span', 'task-tag', '基本'));
    }
    return row;
  }

  function renderDashboard(state, stats) {
    const list = document.getElementById('dashboard-tasks');
    const reminders = document.getElementById('login-reminders');
    if (!list || !reminders) return;
    list.replaceChildren();
    reminders.replaceChildren();
    if (!state.games.length) {
      setText('hero-summary', '好きなゲームを登録して、自分だけのチェックリストを始めましょう。');
      list.append(emptyState('最初のゲームを登録しましょう', 'ゲームごとに「デイリーミッション」と「ログイン」が用意されます。', 'ゲームを追加', 'games.html#add-game-form'));
      reminders.append(element('p', 'inline-note', 'ゲームを追加すると、今日のログイン状況をここで確認できます。'));
      return;
    }
    setText('hero-summary', stats.remaining ? `未ログインは ${state.games.length - stats.logged} ゲーム、残りのタスクは ${stats.remaining} 件。自分のペースで進めましょう。` : '今日のタスクはすべて完了！あとは好きな時間を楽しみましょう。');
    for (const game of state.games) {
      for (const task of game.tasks) {
        if (!done(task)) list.append(taskItem(game, task, true));
      }
      if (!game.tasks.some(task => task.kind === 'login' && done(task))) {
        const reminder = link('', `tasks.html#game-${game.id}`, 'reminder-link');
        const icon = element('span', `small-game-icon icon-${game.theme}`, themes[game.theme].mark);
        icon.setAttribute('aria-hidden', 'true');
        const name = element('span', '', game.name);
        name.append(element('small', '', '未ログイン'));
        const arrow = element('span', '', '→');
        arrow.setAttribute('aria-hidden', 'true');
        reminder.append(icon, name, arrow);
        reminders.append(reminder);
      }
    }
    if (!stats.remaining) list.append(emptyState('今日のタスクは完了です', 'おつかれさまでした。チェックは次の日に自動で切り替わります。'));
    if (stats.logged === state.games.length) reminders.append(element('p', 'inline-note', 'すべてのゲームにログイン済みです。'));
  }

  function renderGames(state) {
    const list = document.getElementById('games-list');
    if (!list) return;
    list.replaceChildren();
    if (!state.games.length) {
      list.append(emptyState('まだゲームがありません', '上のフォームにゲーム名を入力してください。どんなゲームでも登録できます。'));
      return;
    }
    for (const game of state.games) {
      const complete = game.tasks.filter(task => done(task)).length;
      const logged = game.tasks.some(task => task.kind === 'login' && done(task));
      const card = element('article', 'game-card');
      const cover = element('div', `game-cover cover-${game.theme}`);
      const image = element('img');
      image.src = `assets/${game.theme}.svg`;
      image.alt = `${themes[game.theme].label}をテーマにしたイラスト`;
      const badge = element('span', `badge ${complete === game.tasks.length ? 'badge-success' : 'badge-dark'}`, complete === game.tasks.length ? '今日のタスク完了' : logged ? 'ログイン済み' : '未ログイン');
      cover.append(image, badge);
      const body = element('div', 'game-body');
      body.append(gameHeading(game));
      const count = element('div', 'game-progress');
      count.append(element('span', '', '今日のタスク'), element('strong', '', `${complete} / ${game.tasks.length}`));
      const actions = element('div', 'game-actions');
      const remove = button('ゲームを削除', 'remove-game', game.id);
      remove.setAttribute('aria-label', `${game.name} を削除`);
      actions.append(link('タスクを開く →', `tasks.html#game-${game.id}`, 'text-link'), remove);
      body.append(count, progress(game), actions);
      card.append(cover, body);
      list.append(card);
    }
  }

  function renderTasks(state, stats) {
    const list = document.getElementById('tasks-list');
    if (!list) return;
    setText('tasks-summary', `今日の完了：${stats.completed} / ${stats.total} 件（${stats.percent}%）・残り ${stats.remaining} 件`);
    const jumps = document.getElementById('task-jump-links');
    list.replaceChildren();
    if (jumps) jumps.replaceChildren();
    if (!state.games.length) {
      list.append(emptyState('タスクはまだありません', 'まずは遊んでいるゲームを登録しましょう。', 'ゲームを追加', 'games.html#add-game-form'));
      return;
    }
    for (const game of state.games) {
      const complete = game.tasks.filter(task => done(task)).length;
      if (jumps) {
        const jump = link(game.name, `#game-${game.id}`);
        jump.append(element('span', '', `${complete}/${game.tasks.length}`));
        jumps.append(jump);
      }
      const panel = element('section', 'task-panel panel');
      panel.id = `game-${game.id}`;
      panel.setAttribute('aria-label', `${game.name} のタスク`);
      const heading = element('div', 'panel-heading');
      heading.append(gameHeading(game), element('span', `badge${complete === game.tasks.length ? ' badge-success' : ''}`, `${complete} / ${game.tasks.length} 完了`));
      const rows = element('div', 'task-list');
      for (const task of game.tasks) rows.append(taskItem(game, task));
      const form = element('form', 'custom-task-form');
      form.dataset.gameId = game.id;
      const field = element('div', 'form-field');
      const label = element('label', 'field-label', '自分のタスクを追加');
      label.htmlFor = `task-input-${game.id}`;
      const input = element('input', 'text-input');
      input.id = label.htmlFor;
      input.name = 'taskName';
      input.type = 'text';
      input.required = true;
      input.maxLength = 100;
      input.placeholder = '例：スタミナを使う';
      input.autocomplete = 'off';
      input.dataset.focusKey = `new-task-${game.id}`;
      const submit = element('button', 'button button-primary', '追加');
      submit.type = 'submit';
      submit.setAttribute('aria-label', `${game.name} にタスクを追加`);
      field.append(label, input);
      form.append(field, submit);
      panel.append(heading, rows, form);
      list.append(panel);
    }
  }

  function captureInputs() {
    const drafts = new Map(Array.from(document.querySelectorAll('.custom-task-form input'), input => [input.dataset.focusKey, input.value]));
    const active = document.activeElement;
    const key = active && active.dataset.focusKey;
    const selection = active && active.type === 'text' ? [active.selectionStart, active.selectionEnd] : null;
    return { drafts, key, selection };
  }

  function restoreInputs(saved, fallbackKey) {
    for (const input of document.querySelectorAll('.custom-task-form input')) {
      if (saved.drafts.has(input.dataset.focusKey)) input.value = saved.drafts.get(input.dataset.focusKey);
    }
    const nodes = Array.from(document.querySelectorAll('[data-focus-key]'));
    const target = nodes.find(node => node.dataset.focusKey === saved.key) || nodes.find(node => node.dataset.focusKey === fallbackKey);
    if (target) {
      target.focus({ preventScroll: true });
      if (saved.selection && target.type === 'text') target.setSelectionRange(...saved.selection);
    }
  }

  function render(fallbackKey) {
    const saved = captureInputs();
    try {
      currentState = store.read();
      displayedDate = store.getToday();
      storageFailed = false;
    } catch (error) {
      storageFailed = true;
      showError(error);
      document.querySelectorAll('main form button, main input[type="checkbox"]').forEach(node => { node.disabled = true; });
      return false;
    }
    document.querySelectorAll('main form button').forEach(node => { node.disabled = false; });
    const stats = summary(currentState, displayedDate);
    for (const node of document.querySelectorAll('[data-game-count]')) node.textContent = String(currentState.games.length);
    for (const node of document.querySelectorAll('[data-pending-count]')) node.textContent = String(stats.remaining);
    setText('current-date', new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date()));
    setText('completed-count', stats.completed);
    setText('task-count', stats.total);
    setText('logged-count', stats.logged);
    setText('game-count', currentState.games.length);
    setText('remaining-count', stats.remaining);
    setText('completion-rate', `${stats.percent}%`);
    renderDashboard(currentState, stats);
    renderGames(currentState);
    renderTasks(currentState, stats);
    restoreInputs(saved, fallbackKey);
    return true;
  }

  function mutate(action, message, fallbackKey) {
    if (storageFailed) return false;
    announce('');
    clearError();
    try {
      action();
      if (!render(fallbackKey)) return false;
      announce(message);
      return true;
    } catch (error) {
      // 保存に失敗したチェックも、実際に保存済みの状態に戻します。
      render(fallbackKey);
      showError(error);
      return false;
    }
  }

  function setupHandlers() {
    document.addEventListener('submit', event => {
      const form = event.target;
      if (form.id === 'add-game-form') {
        event.preventDefault();
        const input = form.elements.gameName;
        const name = input.value.trim();
        if (mutate(() => store.addGame(name, form.elements.theme.value), `「${name}」を追加しました。基本タスクは2件です。`)) {
          form.reset();
          input.focus();
        }
      } else if (form.matches('.custom-task-form')) {
        event.preventDefault();
        const input = form.elements.taskName;
        const title = input.value.trim();
        const gameId = form.dataset.gameId;
        const value = input.value;
        input.value = '';
        if (!mutate(() => store.addTask(gameId, title), `「${title}」を追加しました。`, `new-task-${gameId}`)) {
          const replacement = document.getElementById(`task-input-${gameId}`);
          if (replacement) replacement.value = value;
        }
      }
    });

    document.addEventListener('change', event => {
      const input = event.target;
      if (!input.matches('input[type="checkbox"][data-task-id]')) return;
      const checked = input.checked;
      const keys = Array.from(document.querySelectorAll('input[type="checkbox"][data-task-id]'));
      const index = keys.indexOf(input);
      const neighbor = keys[index + 1] || keys[index - 1];
      const fallback = neighbor ? neighbor.dataset.focusKey : null;
      mutate(() => store.setTaskCompleted(input.dataset.gameId, input.dataset.taskId, checked), checked ? '完了として保存しました。' : '未完了に戻しました。', fallback);
    });

    document.addEventListener('click', event => {
      const target = event.target.closest('button[data-action]');
      if (!target || !currentState) return;
      const game = currentState.games.find(item => item.id === target.dataset.gameId);
      if (!game) return;
      if (target.dataset.action === 'remove-game') {
        if (!window.confirm(`「${game.name}」と、このゲームのタスクを削除しますか？`)) return;
        if (mutate(() => store.removeGame(game.id), `「${game.name}」を削除しました。`)) document.querySelector('#add-game-form input')?.focus();
      }
      if (target.dataset.action === 'remove-task') {
        const task = game.tasks.find(item => item.id === target.dataset.taskId);
        if (!task || !window.confirm(`「${task.title}」を削除しますか？`)) return;
        mutate(() => store.removeTask(game.id, task.id), `「${task.title}」を削除しました。`, `new-task-${game.id}`);
      }
    });

    const refresh = () => {
      clearError();
      return render();
    };
    window.addEventListener('storage', event => {
      if (event.key === GameDailyStore.STORAGE_KEY || event.key === null) refresh();
    });
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', event => { if (event.persisted) refresh(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    window.setInterval(() => {
      if (!storageFailed && store.getToday() !== displayedDate && refresh()) {
        announce('新しい日になりました。今日のチェックをリセットしました。');
      }
    }, 1000);
  }

  try {
    store = GameDailyStore.createStore({ storage: window.localStorage });
    setupHandlers();
    if (render() && window.location.hash) {
      let anchor = window.location.hash.slice(1);
      try { anchor = decodeURIComponent(anchor); } catch { /* 無効なアンカーは無視します。 */ }
      const target = document.getElementById(anchor);
      if (target) requestAnimationFrame(() => target.scrollIntoView());
    }
  } catch (error) {
    showError(error);
    document.querySelectorAll('main form button').forEach(node => { node.disabled = true; });
  }
})();
