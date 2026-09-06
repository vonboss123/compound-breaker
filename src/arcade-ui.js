import { LEVELS } from './game-core.js?v=1.3.0';

const number = value => new Intl.NumberFormat('zh-CN').format(value);
const time = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export function createArcadeUI({ documentRef, windowRef, store, leaderboard,
  onStart, onResume, onNext, onReplay, onOpen }) {
  const get = id => documentRef.getElementById(id);
  const cover = get('level-picker');
  const settlement = get('settlement');
  const background = [...documentRef.querySelectorAll('#game-canvas, #paddle-touch-zone, .game-header, #status-message, .game-controls')];
  const removers = [];
  let boardRequest = 0;
  let destroyed = false;
  let scoreFrame = null;
  let focusBeforeOpen = null;

  function listen(element, type, callback) {
    element.addEventListener(type, callback);
    removers.push(() => element.removeEventListener(type, callback));
  }

  function cancelScoreAnimation() {
    if (scoreFrame !== null) windowRef.cancelAnimationFrame?.(scoreFrame);
    scoreFrame = null;
  }

  function openPanel(panel) {
    cancelScoreAnimation();
    boardRequest += 1;
    if (cover.hidden && settlement.hidden) focusBeforeOpen = documentRef.activeElement;
    cover.hidden = panel !== cover;
    settlement.hidden = panel !== settlement;
    background.forEach(element => { element.inert = true; });
    panel.querySelector('.level-picker-panel').scrollTop = 0;
    onOpen();
  }

  function close() {
    cancelScoreAnimation();
    boardRequest += 1;
    cover.hidden = true;
    settlement.hidden = true;
    background.forEach(element => { element.inert = false; });
    focusBeforeOpen?.focus?.({ preventScroll: true });
  }

  function fillBoardSelect(select) {
    for (const [value, title] of [['total', '总榜 · 一命闯关'], ...LEVELS.map((level, i) => [level.id, `第${i + 1}关 · ${level.title}`])]) {
      const option = documentRef.createElement('option');
      option.value = value;
      option.textContent = title;
      select.append(option);
    }
  }

  async function showBoard(board, listId, statusId) {
    const request = ++boardRequest;
    const list = get(listId);
    const status = get(statusId);
    list.replaceChildren();
    status.textContent = '正在同步成绩…';
    let result;
    try { result = await leaderboard.getBoard(board); }
    catch { result = { entries: store.getBoard(board), online: false }; }
    if (destroyed || request !== boardRequest) return;
    status.textContent = result.online
      ? (store.pending.length ? '榜单已更新；你的成绩仍待上传，下次打开榜单时重试。' : leaderboard.lastError || '大家共享的最新成绩')
      : '暂时离线：显示已缓存的榜单，待上传成绩联网后重试。';
    for (const [index, entry] of result.entries.slice(0, 10).entries()) {
      const row = documentRef.createElement('li');
      const rank = documentRef.createElement('b');
      rank.textContent = String(index + 1).padStart(2, '0');
      const player = documentRef.createElement('span');
      const name = documentRef.createElement('strong');
      name.textContent = entry.nickname;
      const detail = documentRef.createElement('small');
      detail.textContent = `${time(entry.seconds)} · ${board === 'total' ? `通过 ${entry.cleared} 关` : entry.cleared ? '已通关' : '挑战记录'}`;
      player.append(name, detail);
      const points = documentRef.createElement('em');
      points.textContent = number(entry.score);
      row.append(rank, player, points);
      list.append(row);
    }
    if (!result.entries.length) {
      const empty = documentRef.createElement('li');
      empty.className = 'ranking-empty';
      empty.textContent = result.online ? '还没有记录，来拿下榜首！' : '还没有缓存记录，不影响继续玩。';
      list.append(empty);
    }
  }

  function selectTab(tab) {
    if (!store.profile.name) tab = 'player';
    boardRequest += 1;
    for (const name of ['play', 'boards', 'player']) {
      get(`cover-${name}`).hidden = name !== tab;
      documentRef.querySelector(`[data-cover-tab="${name}"]`).setAttribute('aria-pressed', String(name === tab));
    }
    if (tab === 'player') {
      get('player-name').value = store.profile.name;
      get('player-feedback').textContent = store.persistent ? '' : '浏览器未允许保存数据：本次仍可玩，关闭后可能需要重新输入。';
    }
    if (tab === 'boards') void showBoard(get('leaderboard-select').value, 'cover-ranking', 'cover-board-status');
  }

  function showCover({ canResume = false } = {}) {
    openPanel(cover);
    get('resume-game').hidden = !canResume;
    get('cover-greeting').textContent = store.profile.name ? `欢迎回来，${store.profile.name}` : '第一次见面，先起个游戏名字吧。';
    selectTab('play');
    (store.profile.name ? get(canResume ? 'resume-game' : 'campaign-start') : get('player-name')).focus({ preventScroll: true });
  }

  function showSettlement(run, result) {
    openPanel(settlement);
    get('settlement-kicker').textContent = result.won ? 'STAGE CLEAR' : 'GAME OVER';
    get('settlement-title').textContent = result.won ? (run.finished && run.mode === 'campaign' ? '五关全破！' : '破阵成功！') : '本次挑战结束';
    const level = LEVELS.find(level => level.id === result.levelId);
    get('settlement-subtitle').textContent = `${level.title} · ${run.mode === 'campaign' ? '一命闯关' : '单关练习'}`;
    get('score-bricks').textContent = number(result.brickPoints);
    get('score-positive').textContent = `+${number(result.itemBonus)}`;
    get('score-negative').textContent = `−${number(Math.abs(result.itemPenalty))}`;
    get('score-clear').textContent = `+${number(result.clearBonus)}`;
    get('score-speed').textContent = `+${number(result.timeBonus)}`;
    get('score-time').textContent = `(${time(result.seconds)})`;
    get('stage-total').textContent = number(result.total);
    get('stage-total').setAttribute('aria-label', `本关总分 ${result.total}`);
    get('run-total').textContent = run.mode === 'campaign'
      ? `一命累计 ${number(run.total)} 分 · 已过 ${run.stages.filter(stage => stage.won).length} 关`
      : '练习成绩计入单关榜；一命闯关才能冲总榜。';
    get('settlement-next').hidden = run.finished;
    get('settlement-replay').textContent = run.mode === 'campaign' ? '重新闯关' : '再练一次';
    get('settlement-board').value = run.mode === 'campaign' && run.finished ? 'total' : result.levelId;
    void showBoard(get('settlement-board').value, 'settlement-ranking', 'settlement-board-status');
    get(run.finished ? 'settlement-replay' : 'settlement-next').focus({ preventScroll: true });
    if (!windowRef.matchMedia?.('(prefers-reduced-motion: reduce)').matches && windowRef.requestAnimationFrame) {
      let started = null;
      const tick = timestamp => {
        started ??= timestamp;
        const fraction = Math.min(1, (timestamp - started) / 550);
        get('stage-total').textContent = number(Math.round(result.total * (1 - (1 - fraction) ** 3)));
        scoreFrame = fraction < 1 ? windowRef.requestAnimationFrame(tick) : null;
      };
      scoreFrame = windowRef.requestAnimationFrame(tick);
    }
  }

  fillBoardSelect(get('leaderboard-select'));
  fillBoardSelect(get('settlement-board'));
  for (const tab of documentRef.querySelectorAll('[data-cover-tab]')) listen(tab, 'click', () => selectTab(tab.dataset.coverTab));
  listen(get('player-form'), 'submit', event => {
    event.preventDefault();
    if (!store.rename(get('player-name').value)) {
      get('player-feedback').textContent = '请输入一个游戏名字。';
      return;
    }
    get('cover-greeting').textContent = `欢迎回来，${store.profile.name}`;
    selectTab('play');
    get('campaign-start').focus({ preventScroll: true });
  });
  function start(mode, levelId) {
    if (!store.profile.name) { selectTab('player'); return; }
    onStart(mode, levelId);
  }
  listen(get('campaign-start'), 'click', () => start('campaign', 'level-1'));
  for (const card of cover.querySelectorAll('[data-level-id]')) listen(card, 'click', () => start('practice', card.dataset.levelId));
  listen(get('resume-game'), 'click', onResume);
  listen(get('settlement-next'), 'click', onNext);
  listen(get('settlement-replay'), 'click', onReplay);
  listen(get('settlement-cover'), 'click', () => showCover({ canResume: !get('settlement-next').hidden }));
  listen(get('leaderboard-select'), 'change', () => void showBoard(get('leaderboard-select').value, 'cover-ranking', 'cover-board-status'));
  listen(get('settlement-board'), 'change', () => void showBoard(get('settlement-board').value, 'settlement-ranking', 'settlement-board-status'));
  listen(documentRef, 'keydown', event => {
    const panel = !cover.hidden ? cover : !settlement.hidden ? settlement : null;
    if (!panel || event.key !== 'Tab') return;
    const focusable = [...panel.querySelectorAll('button, input, select, a, summary')].filter(element => !element.disabled && !element.closest('[hidden]') && (!element.closest('details:not([open])') || element.tagName === 'SUMMARY'));
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && documentRef.activeElement === first) { last?.focus(); event.preventDefault(); }
    else if (!event.shiftKey && documentRef.activeElement === last) { first?.focus(); event.preventDefault(); }
  });

  return { showCover, showSettlement, close, get open() { return !cover.hidden || !settlement.hidden; },
    destroy() { destroyed = true; close(); removers.splice(0).forEach(remove => remove()); } };
}
