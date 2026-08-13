import { FIXED_STEP, LEVELS, createGame, movePaddle, stepGame } from './game-core.js?v=1.1.2';
import { createAudioController } from './audio.js?v=1.1.2';
import { bootstrapPwa } from './pwa.js?v=1.1.2';
import { captureRenderState, createRenderer } from './renderer.js?v=1.1.2';

export const PRODUCTION_GAME_OPTIONS = Object.freeze({
  seed: 0xc0ffee,
  maxPhysicalBalls: 192,
  multiplierEvery: 120,
  levelId: 'level-1',
});
export const WAITING_STATUS_MESSAGE = '点按/拖动开始';
const CANVAS_POINTER_STATUS_MESSAGE = '保持球在场内 · 绿色 ×3 会复利增殖';
const KEYBOARD_PADDLE_SPEED = 330;
const HUD_UPDATE_INTERVAL = 80;
const CONTROLS_WORLD_TOP = 60;
const CONTROLS_HEIGHT = 44;
const STATUS_WORLD_TOP = 112;
const STATUS_WORLD_HEIGHT = 32;
const MIN_INTERFACE_GAP = 2;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function advanceFixedClock(clock, frameDelta, options = {}) {
  const fixedStep = options.fixedStep ?? FIXED_STEP;
  const maxFrameDelta = options.maxFrameDelta ?? 0.1;
  const maxSteps = options.maxSteps ?? 8;
  const safeDelta = Number.isFinite(frameDelta)
    ? clamp(frameDelta, 0, maxFrameDelta)
    : 0;
  let accumulator = Math.max(0, Number(clock?.accumulator) || 0) + safeDelta;
  let steps = 0;

  while (accumulator >= fixedStep && steps < maxSteps) {
    accumulator -= fixedStep;
    steps += 1;
  }

  let droppedTime = 0;
  if (accumulator >= fixedStep) {
    droppedTime = accumulator - (accumulator % fixedStep);
    accumulator %= fixedStep;
  }

  return {
    accumulator,
    steps,
    alpha: clamp(accumulator / fixedStep, 0, 1),
    droppedTime,
  };
}

export function createSession(options = {}) {
  const game = createGame(options);
  return {
    game,
    gameOptions: { ...options, seed: game.seed },
    paused: false,
    started: false,
  };
}

export function selectSessionLevel(session, levelId) {
  const selectedLevelId = LEVELS.some((level) => level.id === levelId)
    ? levelId
    : session.game.levelId;
  return createSession({ ...session.gameOptions, levelId: selectedLevelId });
}

export function getLevelLabel(levelId) {
  const index = LEVELS.findIndex((level) => level.id === levelId);
  const safeIndex = index < 0 ? 0 : index;
  return `第${safeIndex + 1}关 · ${LEVELS[safeIndex].title}`;
}

export function startSession(session) {
  if (
    session.started ||
    session.paused ||
    session.game.status !== 'playing'
  ) {
    return false;
  }
  session.started = true;
  return true;
}

export function moveSessionPaddle(session, targetX) {
  return movePaddle(session.game, targetX);
}

export function updateSession(session, input = {}) {
  if (!session.started || session.paused || session.game.status !== 'playing') {
    return session;
  }

  const steps = Math.max(0, Math.trunc(input.steps ?? 1));
  for (let index = 0; index < steps; index += 1) {
    stepGame(session.game, { paddleX: input.paddleX });
  }
  return session;
}

export function togglePause(session, forcePaused = !session.paused) {
  if (!session.started || session.game.status !== 'playing') {
    return session.paused;
  }
  session.paused = Boolean(forcePaused);
  return session.paused;
}

export function restartSession(session) {
  return createSession(session.gameOptions);
}

export function createListenerScope() {
  let disposed = false;
  let removers = [];

  return {
    listen(target, type, listener, options) {
      if (disposed) {
        return () => {};
      }

      target.addEventListener(type, listener, options);
      let active = true;
      const remove = () => {
        if (!active) {
          return;
        }
        active = false;
        target.removeEventListener(type, listener, options);
      };
      removers.push(remove);
      return remove;
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      const pendingRemovers = removers;
      removers = [];
      for (let index = pendingRemovers.length - 1; index >= 0; index -= 1) {
        pendingRemovers[index]();
      }
    },
    get disposed() {
      return disposed;
    },
  };
}

function formatElapsed(seconds) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

export function shouldIgnoreGameKey(target, key, code) {
  const tagName = String(target?.tagName ?? '').toUpperCase();
  if (
    target?.isContentEditable ||
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT'
  ) {
    return true;
  }

  return tagName === 'BUTTON' && (key === 'Enter' || key === ' ' || code === 'Space');
}

export function isStartGameKey(target, key, code) {
  if (shouldIgnoreGameKey(target, key, code)) {
    return false;
  }
  return (
    key === 'ArrowLeft' || key === 'ArrowRight' || code === 'Space' || key === ' '
  );
}

export function shouldBlockGameKeyForLevelPicker(pickerOpen, key, code) {
  if (!pickerOpen) {
    return false;
  }
  return (
    String(key).startsWith('Arrow') ||
    code === 'Space' ||
    key === ' ' ||
    String(key).toLowerCase() === 'r'
  );
}

export function setLevelPickerOpenState(levelPicker, backgroundElements, open) {
  levelPicker.hidden = !open;
  for (const element of backgroundElements) {
    element.inert = open;
  }
}

export async function setGameFullscreen(documentRef, element, fullscreen) {
  const activeElement =
    documentRef?.fullscreenElement ?? documentRef?.webkitFullscreenElement ?? null;

  if (fullscreen) {
    if (activeElement) {
      return true;
    }
    const request = element?.requestFullscreen ?? element?.webkitRequestFullscreen;
    if (typeof request !== 'function') {
      return null;
    }
    try {
      await request.call(element);
      return true;
    } catch {
      return null;
    }
  }

  if (!activeElement) {
    return false;
  }
  const exit = documentRef?.exitFullscreen ?? documentRef?.webkitExitFullscreen;
  if (typeof exit !== 'function') {
    return null;
  }
  try {
    await exit.call(documentRef);
    return false;
  } catch {
    return null;
  }
}

export function getInterfaceLayoutPlan(layout, game) {
  const scale = Math.max(0, Number(layout?.scale) || 0);
  const offsetY = Number(layout?.offsetY) || 0;
  const requestedControlsTop = offsetY + CONTROLS_WORLD_TOP * scale;
  const statusTop = offsetY + STATUS_WORLD_TOP * scale;
  const statusHeight = Math.max(24, STATUS_WORLD_HEIGHT * scale);
  const gridTop = offsetY + game.grid.y * scale;
  const controlsTop = Math.max(
    offsetY,
    Math.min(
      requestedControlsTop,
      gridTop - CONTROLS_HEIGHT - MIN_INTERFACE_GAP,
    ),
  );
  const touchDeckTop =
    offsetY + (game.paddle.y + game.paddle.height / 2) * scale;
  const compact =
    statusTop < controlsTop + CONTROLS_HEIGHT + MIN_INTERFACE_GAP ||
    statusTop + statusHeight + MIN_INTERFACE_GAP > gridTop;

  return {
    compact,
    controlsTop,
    controlsHeight: CONTROLS_HEIGHT,
    statusTop,
    statusHeight,
    gridTop,
    touchDeckTop,
    minimumGap: MIN_INTERFACE_GAP,
  };
}

function applyInterfaceLayout(gameShell, layout, game) {
  const plan = getInterfaceLayoutPlan(layout, game);
  gameShell.style.setProperty('--controls-top', `${plan.controlsTop}px`);
  gameShell.style.setProperty('--status-top', `${plan.statusTop}px`);
  gameShell.style.setProperty('--status-height', `${plan.statusHeight}px`);
  gameShell.style.setProperty('--touch-deck-top', `${plan.touchDeckTop}px`);
  gameShell.dataset.compactLayout = String(plan.compact);
  return plan;
}

export function getCanvasPointerStatusMessage(session) {
  if (
    !session?.started ||
    session.paused ||
    session.game?.status !== 'playing'
  ) {
    return null;
  }
  return CANVAS_POINTER_STATUS_MESSAGE;
}

export function shouldContinueAnimation(session, effectCounts = {}) {
  if (session.paused || session.started === false) {
    return false;
  }
  if (session.game.status === 'playing') {
    return true;
  }

  const hasEffects =
    (effectCounts.particles ?? 0) > 0 || (effectCounts.trails ?? 0) > 0;
  return (session.game.status === 'won' || session.game.status === 'lost') && hasEffects;
}

export function bootstrapGame(documentRef = globalThis.document, windowRef = globalThis.window) {
  if (!documentRef || !windowRef) {
    return null;
  }

  const canvas = documentRef.getElementById('game-canvas');
  const scoreOutput = documentRef.getElementById('score-output');
  const timeOutput = documentRef.getElementById('time-output');
  const ballsOutput = documentRef.getElementById('balls-output');
  const statusMessage = documentRef.getElementById('status-message');
  const paddleTouchZone = documentRef.getElementById('paddle-touch-zone');
  const pauseButton = documentRef.getElementById('pause-button');
  const soundButton = documentRef.getElementById('sound-button');
  const restartButton = documentRef.getElementById('restart-button');
  const levelButton = documentRef.getElementById('level-button');
  const fullscreenButton = documentRef.getElementById('fullscreen-button');
  const levelPicker = documentRef.getElementById('level-picker');
  const levelCards = levelPicker
    ? [...levelPicker.querySelectorAll('[data-level-id]')]
    : [];
  const gameHeader = documentRef.querySelector('.game-header');
  const gameControls = documentRef.querySelector('.game-controls');
  const gameShell = documentRef.querySelector('.game-shell');

  if (
    !canvas ||
    !scoreOutput ||
    !timeOutput ||
    !ballsOutput ||
    !statusMessage ||
    !paddleTouchZone ||
    !pauseButton ||
    !soundButton ||
    !restartButton ||
    !levelButton ||
    !fullscreenButton ||
    !levelPicker ||
    !gameHeader ||
    !gameControls ||
    !gameShell ||
    levelCards.length !== LEVELS.length
  ) {
    return null;
  }

  const reducedMotionQuery = windowRef.matchMedia?.('(prefers-reduced-motion: reduce)');
  const renderer = createRenderer(canvas, {
    reducedMotion: reducedMotionQuery?.matches ?? false,
  });
  const audio = createAudioController({ enabled: true });
  const listeners = createListenerScope();
  const numberFormatter = new Intl.NumberFormat('zh-CN');
  const compactFormatter = new Intl.NumberFormat('zh-CN', {
    notation: 'compact',
    maximumSignificantDigits: 4,
  });

  let session = createSession(PRODUCTION_GAME_OPTIONS);
  let clock = { accumulator: 0, steps: 0, alpha: 1, droppedTime: 0 };
  let previousState = captureRenderState(session.game);
  let paddleTarget = session.game.paddle.x;
  let activePointerId = null;
  let activePointerSurface = null;
  let lastTimestamp = null;
  let lastHudUpdate = Number.NEGATIVE_INFINITY;
  let resizePending = true;
  let audioGestureHandled = false;
  let animationFrameId = null;
  let destroyed = false;
  let destroyPromise = null;
  let removeAudioPointerListener = () => {};
  let removeAudioKeyListener = () => {};
  const heldDirections = new Set();
  const pickerBackground = [
    canvas,
    paddleTouchZone,
    gameHeader,
    statusMessage,
    gameControls,
  ];

  function displayBallCount(count) {
    return count < 1_000_000 ? numberFormatter.format(count) : compactFormatter.format(count);
  }

  function setStatus(message, tone = 'neutral') {
    const levelMessage = `${getLevelLabel(session.game.levelId)} · ${message}`;
    if (statusMessage.textContent !== levelMessage) {
      statusMessage.textContent = levelMessage;
    }
    if (tone === 'neutral') {
      delete statusMessage.dataset.tone;
    } else {
      statusMessage.dataset.tone = tone;
    }
  }

  function syncControls() {
    const gameCanPause = session.started && session.game.status === 'playing';
    pauseButton.disabled = !gameCanPause;
    pauseButton.textContent = session.paused ? '继续' : '暂停';
    pauseButton.setAttribute('aria-pressed', String(session.paused));
    soundButton.textContent = audio.enabled ? '声音 开' : '声音 关';
    soundButton.setAttribute('aria-pressed', String(audio.enabled));
    const fullscreenActive = Boolean(
      documentRef.fullscreenElement ?? documentRef.webkitFullscreenElement,
    );
    fullscreenButton.textContent = fullscreenActive ? '退出' : '全屏';
    fullscreenButton.setAttribute('aria-pressed', String(fullscreenActive));
    for (const card of levelCards) {
      if (card.dataset.levelId === session.game.levelId) {
        card.setAttribute('aria-current', 'true');
      } else {
        card.removeAttribute('aria-current');
      }
    }
  }

  function updateHud(timestamp, force = false) {
    if (!force && timestamp - lastHudUpdate < HUD_UPDATE_INTERVAL) {
      return;
    }
    lastHudUpdate = timestamp;

    const exactBallCount = numberFormatter.format(session.game.visibleBallCount);
    scoreOutput.textContent = numberFormatter.format(session.game.score);
    timeOutput.textContent = formatElapsed(session.game.time);
    ballsOutput.textContent = displayBallCount(session.game.visibleBallCount);
    ballsOutput.title = `${exactBallCount} 个球`;
    ballsOutput.setAttribute('aria-label', `${exactBallCount} 个可见球`);
  }

  function clearClock() {
    clock = { accumulator: 0, steps: 0, alpha: 1, droppedTime: 0 };
    previousState = captureRenderState(session.game);
    lastTimestamp = null;
  }

  function requestFrame() {
    if (destroyed || animationFrameId !== null) {
      return false;
    }
    animationFrameId = windowRef.requestAnimationFrame(renderFrame);
    return true;
  }

  function setPaused(nextPaused, message) {
    if (!session.started || session.game.status !== 'playing') {
      return;
    }
    togglePause(session, nextPaused);
    clearClock();
    syncControls();
    setStatus(
      message ?? (session.paused ? '已暂停 · 随时继续' : '继续击碎金砖 · 接住 ×3'),
    );
    requestFrame();
  }

  function restart() {
    session = restartSession(session);
    paddleTarget = session.game.paddle.x;
    activePointerId = null;
    heldDirections.clear();
    clearClock();
    renderer.reset(session.game);
    setStatus(WAITING_STATUS_MESSAGE);
    syncControls();
    updateHud(windowRef.performance.now(), true);
    requestFrame();
  }

  function showLevelPicker() {
    if (session.started && !session.paused && session.game.status === 'playing') {
      setPaused(true, '选择关卡');
    }
    setLevelPickerOpenState(levelPicker, pickerBackground, true);
    const currentCard = levelCards.find(
      (card) => card.dataset.levelId === session.game.levelId,
    );
    currentCard?.focus({ preventScroll: true });
  }

  function requestFullscreenForPlay() {
    void setGameFullscreen(documentRef, gameShell, true).then(() => {
      syncControls();
      markResizePending();
    });
  }

  async function toggleFullscreen() {
    const fullscreenActive = Boolean(
      documentRef.fullscreenElement ?? documentRef.webkitFullscreenElement,
    );
    const result = await setGameFullscreen(
      documentRef,
      gameShell,
      !fullscreenActive,
    );
    syncControls();
    markResizePending();
    if (result === null) {
      setStatus('iPhone：添加到主屏幕即可全屏');
    } else {
      setStatus(result ? '已进入全屏' : '已退出全屏');
    }
  }

  function selectLevel(levelId) {
    session = selectSessionLevel(session, levelId);
    paddleTarget = session.game.paddle.x;
    activePointerId = null;
    heldDirections.clear();
    clearClock();
    renderer.reset(session.game);
    setLevelPickerOpenState(levelPicker, pickerBackground, false);
    setStatus(WAITING_STATUS_MESSAGE);
    syncControls();
    updateHud(windowRef.performance.now(), true);
    canvas.focus({ preventScroll: true });
    requestFrame();
  }

  function beginSession() {
    if (!startSession(session)) {
      return false;
    }
    clearClock();
    syncControls();
    setStatus('保持球在场内 · 接住绿色 ×3');
    requestFrame();
    return true;
  }

  function respondToCoreEvents(events) {
    for (const event of events) {
      if (event.type === 'multiply') {
        setStatus(`×3！现在有 ${displayBallCount(event.visibleBallCount)} 个球`, 'success');
      } else if (event.type === 'won') {
        setStatus(`清场成功 · 得分 ${numberFormatter.format(event.score)}`, 'success');
      } else if (event.type === 'lost') {
        setStatus(`本局结束 · 得分 ${numberFormatter.format(event.score)}`, 'danger');
      }
    }
    if (session.game.status !== 'playing') {
      syncControls();
    }
  }

  function unlockAudioFromGesture() {
    if (audioGestureHandled) {
      return;
    }
    audioGestureHandled = true;
    removeAudioPointerListener();
    removeAudioKeyListener();
    void audio.unlock();
  }

  function updatePaddleFromPointer(event) {
    if (session.paused || session.game.status !== 'playing') {
      return;
    }
    const worldPoint = renderer.clientToWorld(event.clientX, event.clientY);
    paddleTarget = moveSessionPaddle(session, worldPoint.x);
  }

  function onPointerDown(event) {
    if (
      activePointerId !== null ||
      event.isPrimary === false ||
      (event.pointerType === 'mouse' && event.button !== 0)
    ) {
      return;
    }
    activePointerId = event.pointerId;
    activePointerSurface = event.currentTarget;
    activePointerSurface.setPointerCapture?.(event.pointerId);
    beginSession();
    updatePaddleFromPointer(event);
    canvas.focus({ preventScroll: true });
    const pointerStatusMessage = getCanvasPointerStatusMessage(session);
    if (pointerStatusMessage) {
      setStatus(pointerStatusMessage);
    }
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (event.pointerId !== activePointerId) {
      return;
    }
    updatePaddleFromPointer(event);
    event.preventDefault();
  }

  function releasePointer(event) {
    if (event.pointerId !== activePointerId) {
      return;
    }
    if (activePointerSurface?.hasPointerCapture?.(event.pointerId)) {
      activePointerSurface.releasePointerCapture(event.pointerId);
    }
    activePointerId = null;
    activePointerSurface = null;
  }

  function onKeyDown(event) {
    if (
      shouldBlockGameKeyForLevelPicker(
        !levelPicker.hidden,
        event.key,
        event.code,
      )
    ) {
      heldDirections.clear();
      if (String(event.key).startsWith('Arrow')) {
        event.preventDefault();
      }
      return;
    }
    if (
      shouldIgnoreGameKey(event.target, event.key, event.code) ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    ) {
      return;
    }

    const wasWaiting = !session.started;
    if (isStartGameKey(event.target, event.key, event.code)) {
      beginSession();
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      heldDirections.add(event.key);
      event.preventDefault();
    } else if ((event.code === 'Space' || event.key === ' ') && !event.repeat) {
      if (!wasWaiting) {
        setPaused(!session.paused);
      }
      event.preventDefault();
    } else if (event.key.toLowerCase() === 'r' && !event.repeat) {
      restart();
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    if (shouldIgnoreGameKey(event.target, event.key, event.code)) {
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      heldDirections.delete(event.key);
      event.preventDefault();
    }
  }

  function markResizePending() {
    resizePending = true;
    requestFrame();
  }

  function renderFrame(timestamp) {
    animationFrameId = null;
    if (destroyed) {
      return;
    }

    const frameDelta =
      lastTimestamp === null ? 0 : Math.max(0, (timestamp - lastTimestamp) / 1000);
    lastTimestamp = timestamp;

    if (resizePending) {
      const layout = renderer.resize();
      applyInterfaceLayout(gameShell, layout, session.game);
      resizePending = false;
    }

    const frameEvents = [];
    if (!session.paused && session.game.status === 'playing') {
      const direction =
        Number(heldDirections.has('ArrowRight')) - Number(heldDirections.has('ArrowLeft'));
      if (direction !== 0) {
        paddleTarget += direction * KEYBOARD_PADDLE_SPEED * Math.min(frameDelta, 0.05);
        moveSessionPaddle(session, paddleTarget);
        paddleTarget = session.game.paddle.x;
      }

      clock = advanceFixedClock(clock, frameDelta, {
        fixedStep: FIXED_STEP,
        maxFrameDelta: 0.1,
        maxSteps: 8,
      });

      for (let step = 0; step < clock.steps; step += 1) {
        if (step === clock.steps - 1) {
          previousState = captureRenderState(session.game);
        }
        updateSession(session, { steps: 1, paddleX: paddleTarget });
        if (session.game.events.length > 0) {
          frameEvents.push(...session.game.events);
        }
        if (session.game.status !== 'playing') {
          break;
        }
      }
    } else {
      clock = { accumulator: 0, steps: 0, alpha: 1, droppedTime: 0 };
    }

    if (frameEvents.length > 0) {
      renderer.consumeEvents(session.game, frameEvents);
      audio.playEvents(frameEvents);
      respondToCoreEvents(frameEvents);
    }

    renderer.render(session.game, {
      alpha: clock.alpha,
      previousState,
      paused: session.paused,
      frameDelta: Math.min(frameDelta, 0.05),
    });
    updateHud(timestamp, frameEvents.length > 0);
    if (shouldContinueAnimation(session, renderer.effectCounts)) {
      requestFrame();
    }
  }

  listeners.listen(canvas, 'pointerdown', onPointerDown);
  listeners.listen(canvas, 'pointermove', onPointerMove);
  listeners.listen(canvas, 'pointerup', releasePointer);
  listeners.listen(canvas, 'pointercancel', releasePointer);
  listeners.listen(paddleTouchZone, 'pointerdown', onPointerDown);
  listeners.listen(paddleTouchZone, 'pointermove', onPointerMove);
  listeners.listen(paddleTouchZone, 'pointerup', releasePointer);
  listeners.listen(paddleTouchZone, 'pointercancel', releasePointer);
  listeners.listen(pauseButton, 'click', () => setPaused(!session.paused));
  listeners.listen(soundButton, 'click', () => {
    const enabled = audio.toggle();
    if (enabled) {
      void audio.unlock();
    }
    syncControls();
    const soundStatus = enabled ? '声音已开启' : '声音已关闭';
    setStatus(
      session.started ? soundStatus : `${soundStatus} · ${WAITING_STATUS_MESSAGE}`,
    );
  });
  listeners.listen(restartButton, 'click', restart);
  listeners.listen(levelButton, 'click', showLevelPicker);
  listeners.listen(fullscreenButton, 'click', () => void toggleFullscreen());
  for (const card of levelCards) {
    listeners.listen(card, 'click', () => {
      requestFullscreenForPlay();
      selectLevel(card.dataset.levelId);
    });
  }
  const onFullscreenChange = () => {
    syncControls();
    markResizePending();
  };
  listeners.listen(documentRef, 'fullscreenchange', onFullscreenChange);
  listeners.listen(documentRef, 'webkitfullscreenchange', onFullscreenChange);
  listeners.listen(windowRef, 'keydown', onKeyDown);
  listeners.listen(windowRef, 'keyup', onKeyUp);
  listeners.listen(windowRef, 'blur', () => heldDirections.clear());
  listeners.listen(windowRef, 'resize', markResizePending, { passive: true });
  if (windowRef.visualViewport?.addEventListener) {
    listeners.listen(windowRef.visualViewport, 'resize', markResizePending, {
      passive: true,
    });
  }
  removeAudioPointerListener = listeners.listen(
    documentRef,
    'pointerdown',
    unlockAudioFromGesture,
    {
      capture: true,
      passive: true,
    },
  );
  removeAudioKeyListener = listeners.listen(
    documentRef,
    'keydown',
    unlockAudioFromGesture,
    true,
  );
  listeners.listen(documentRef, 'visibilitychange', () => {
    if (documentRef.hidden && !session.paused && session.game.status === 'playing') {
      setPaused(true, '切换页面，游戏已自动暂停');
    } else {
      requestFrame();
    }
  });

  const resizeObserver = windowRef.ResizeObserver
    ? new windowRef.ResizeObserver(markResizePending)
    : null;
  resizeObserver?.observe(canvas);
  if (reducedMotionQuery?.addEventListener) {
    listeners.listen(reducedMotionQuery, 'change', (event) => {
      renderer.setReducedMotion(event.matches);
      requestFrame();
    });
  }

  applyInterfaceLayout(gameShell, renderer.resize(), session.game);
  resizePending = false;
  renderer.reset(session.game);
  syncControls();
  updateHud(windowRef.performance.now(), true);
  setStatus(WAITING_STATUS_MESSAGE);
  showLevelPicker();
  requestFrame();

  return {
    get session() {
      return session;
    },
    restart,
    selectLevel,
    showLevelPicker,
    destroy() {
      if (destroyPromise) {
        return destroyPromise;
      }
      destroyed = true;
      listeners.dispose();
      if (animationFrameId !== null) {
        windowRef.cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      if (
        activePointerId !== null &&
        activePointerSurface?.hasPointerCapture?.(activePointerId)
      ) {
        activePointerSurface.releasePointerCapture(activePointerId);
      }
      activePointerId = null;
      activePointerSurface = null;
      heldDirections.clear();
      resizeObserver?.disconnect();
      destroyPromise = audio.dispose();
      return destroyPromise;
    },
  };
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  const start = () => {
    bootstrapGame(document, window);
    bootstrapPwa({ documentRef: document, windowRef: window });
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}
