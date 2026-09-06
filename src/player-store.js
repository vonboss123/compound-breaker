const STORAGE_KEY = 'compound-breaker-player-v1';
const BOARD_IDS = ['total', 'level-1', 'level-2', 'level-3', 'level-4', 'level-5'];

export function normalizeNickname(value) {
  return Array.from(String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/g, '')
    .trim().replace(/\s+/g, ' ')).slice(0, 16).join('');
}

export function createPlayerStore(storage) {
  let saved = {};
  let persistent = Boolean(storage);
  try { saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? '{}') ?? {}; }
  catch { persistent = false; }
  if (typeof saved !== 'object' || Array.isArray(saved)) saved = {};
  const profile = {
    id: typeof saved.profile?.id === 'string' && saved.profile.id.length <= 80
      ? saved.profile.id : globalThis.crypto.randomUUID(),
    name: normalizeNickname(saved.profile?.name),
  };
  let pending = Array.isArray(saved.pending)
    ? saved.pending.filter(item => typeof item?.runId === 'string' && Array.isArray(item.stages)).slice(-30) : [];
  const boards = {};
  for (const id of BOARD_IDS) {
    boards[id] = Array.isArray(saved.boards?.[id]) ? saved.boards[id].slice(0, 10) : [];
  }
  function save() {
    try {
      if (!storage) throw Error('Storage unavailable');
      storage.setItem(STORAGE_KEY, JSON.stringify({ profile, pending, boards }));
      persistent = true;
    } catch { persistent = false; }
  }
  save();
  return {
    profile,
    get persistent() { return persistent; },
    get pending() { return pending.slice(); },
    rename(name) {
      const next = normalizeNickname(name);
      if (!next) return false;
      profile.name = next;
      save();
      return true;
    },
    enqueue(payload) {
      pending = pending.filter(item => item.runId !== payload.runId);
      pending.push(JSON.parse(JSON.stringify(payload)));
      pending = pending.slice(-30);
      save();
    },
    acknowledge(runId, stageCount) {
      pending = pending.filter(item => item.runId !== runId || item.stages.length > stageCount);
      save();
    },
    cacheBoard(board, entries) {
      if (!BOARD_IDS.includes(board) || !Array.isArray(entries)) return;
      boards[board] = entries.slice(0, 10);
      save();
    },
    getBoard(board) { return boards[board]?.slice() ?? []; },
  };
}
