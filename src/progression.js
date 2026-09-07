import { LEVELS, POWERUPS } from './game-core.js?v=1.3.1';

export function calculateStageScore({ brickPoints = 0, seconds = 0, won = false, pickups = {} }) {
  brickPoints = Math.max(0, Math.trunc(Number(brickPoints) || 0));
  seconds = Math.max(0, Math.round((Number(seconds) || 0) * 1000) / 1000);
  let itemBonus = 0;
  let itemPenalty = 0;
  for (const [kind, item] of Object.entries(POWERUPS)) {
    const points = Math.max(0, Math.trunc(Number(pickups[kind]) || 0)) * item.points;
    if (points >= 0) itemBonus += points;
    else itemPenalty += points;
  }
  const itemPoints = itemBonus + itemPenalty;
  const clearBonus = won ? 500 : 0;
  const timeBonus = won ? Math.max(0, 1800 - Math.floor(seconds) * 10) : 0;
  return { brickPoints, seconds, itemBonus, itemPenalty, itemPoints, clearBonus, timeBonus,
    total: Math.max(0, brickPoints + itemPoints + clearBonus + timeBonus) };
}

export function createRun(profile, { mode = 'campaign', levelId = 'level-1', id = globalThis.crypto.randomUUID() } = {}) {
  const practice = mode === 'practice';
  return { id, playerId: profile.id, nickname: profile.name, mode: practice ? 'practice' : 'campaign',
    currentLevelId: practice && LEVELS.some(level => level.id === levelId) ? levelId : 'level-1',
    stages: [], total: 0, finished: false };
}

export function settleStage(run, game) {
  if (!run || game.levelId !== run.currentLevelId || !['won', 'lost'].includes(game.status)) return null;
  const prior = run.stages.find(stage => stage.levelId === game.levelId);
  if (prior) return prior;
  if (run.finished) return null;
  const won = game.status === 'won';
  const pickups = Object.freeze({ ...game.pickups });
  const score = calculateStageScore({ brickPoints: game.score, seconds: game.time, won, pickups });
  const result = Object.freeze({ levelId: game.levelId, won, pickups, ...score });
  run.stages.push(result);
  run.total += result.total;
  run.finished = !won || run.mode === 'practice' || game.levelId === LEVELS.at(-1).id;
  return result;
}

export function advanceRun(run) {
  const last = run?.stages.at(-1);
  if (!last?.won || run.finished || last.levelId !== run.currentLevelId) return null;
  const next = LEVELS[LEVELS.findIndex(level => level.id === last.levelId) + 1]?.id;
  if (!next) return null;
  run.currentLevelId = next;
  return next;
}

export function resultPayload(run) {
  return { rules: 2, runId: run.id, playerId: run.playerId, nickname: run.nickname, mode: run.mode,
    stages: run.stages.map(({ levelId, won, brickPoints, seconds, pickups }) =>
      ({ levelId, won, brickPoints, seconds, pickups: { ...pickups } })) };
}
