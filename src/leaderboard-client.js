export function createLeaderboardClient({ store, baseUrl, fetchFn = globalThis.fetch }) {
  const base = String(baseUrl ?? '').replace(/\/$/, '');
  let syncing = null;
  let lastError = '';
  async function request(path, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetchFn(`${base}${path}`, { signal: controller.signal, cache: 'no-store',
        ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
      if (!response.ok) throw Object.assign(new Error('排行榜暂时不可用'), { status: response.status });
      return await response.json();
    } finally { clearTimeout(timeout); }
  }
  function flush() {
    if (!base) return Promise.resolve(false);
    if (syncing) return syncing;
    syncing = (async () => {
      while (store.pending.length) {
        const payload = store.pending[0];
        try {
          await request('/results', payload);
          store.acknowledge(payload.runId, payload.stages.length);
        } catch (error) {
          if (error.status === 400 || error.status === 413) {
            store.acknowledge(payload.runId, payload.stages.length);
            lastError = '有一条成绩未被接受，不影响继续游戏';
          } else return false;
        }
      }
      return true;
    })().finally(() => { syncing = null; });
    return syncing;
  }
  return {
    flush,
    get lastError() { return lastError; },
    async getBoard(board) {
      if (base) {
        try {
          await flush();
          const data = await request(`/leaderboard?board=${encodeURIComponent(board)}`);
          if (!Array.isArray(data.entries)) throw Error('Invalid leaderboard');
          store.cacheBoard(board, data.entries);
          return { entries: store.getBoard(board), online: true };
        } catch { /* A failed leaderboard request must never stop a game. */ }
      }
      return { entries: store.getBoard(board), online: false };
    },
  };
}
