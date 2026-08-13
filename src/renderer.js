import {
  CELL_BRICK,
  CELL_EMPTY,
  CELL_WALL,
  GAME_HEIGHT,
  GAME_WIDTH,
} from './game-core.js';

const COLORS = {
  background: '#07080c',
  backgroundDeep: '#030407',
  gold: '#f5bd55',
  goldBright: '#ffe2a0',
  white: '#fffdf6',
  coral: '#ff766f',
  coralBright: '#ff9d8f',
  lime: '#b8ef68',
  ink: '#15110b',
  wall: '#272b35',
  wallEdge: '#ff8d7d',
};

const PADDLE_STYLE = Object.freeze({
  gradientStart: COLORS.coralBright,
  gradientEnd: COLORS.coral,
  shadow: 'rgba(255, 118, 111, 0.48)',
});

const MAX_DEVICE_PIXEL_RATIO = 2;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function fitWorldToViewport(
  viewportWidth,
  viewportHeight,
  worldWidth = GAME_WIDTH,
  worldHeight = GAME_HEIGHT,
) {
  const scale = Math.min(viewportWidth / worldWidth, viewportHeight / worldHeight);
  const width = worldWidth * scale;
  const height = worldHeight * scale;

  return {
    worldWidth,
    worldHeight,
    viewportWidth,
    viewportHeight,
    scale,
    width,
    height,
    offsetX: (viewportWidth - width) / 2,
    offsetY: (viewportHeight - height) / 2,
  };
}

export function clientToWorld(clientX, clientY, viewport) {
  return {
    x: clamp((clientX - viewport.offsetX) / viewport.scale, 0, viewport.worldWidth),
    y: clamp((clientY - viewport.offsetY) / viewport.scale, 0, viewport.worldHeight),
  };
}

export function getEffectBudget(reducedMotion = false) {
  return reducedMotion
    ? {
        maxParticles: 20,
        maxTrails: 8,
        impactParticles: 2,
        trailBallLimit: 2,
        trailEvery: 7,
      }
    : {
        maxParticles: 96,
        maxTrails: 72,
        impactParticles: 7,
        trailBallLimit: 8,
        trailEvery: 2,
      };
}

export function getPaddleStylePlan() {
  return PADDLE_STYLE;
}

export function captureRenderState(game) {
  return {
    paddleX: game.paddle.x,
    balls: new Map(game.balls.map((ball) => [ball, { x: ball.x, y: ball.y }])),
  };
}

function roundedRectPath(context, x, y, width, height, radius) {
  const corner = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + corner, y);
  context.lineTo(x + width - corner, y);
  context.quadraticCurveTo(x + width, y, x + width, y + corner);
  context.lineTo(x + width, y + height - corner);
  context.quadraticCurveTo(x + width, y + height, x + width - corner, y + height);
  context.lineTo(x + corner, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - corner);
  context.lineTo(x, y + corner);
  context.quadraticCurveTo(x, y, x + corner, y);
  context.closePath();
}

function colorForBrick(row, column) {
  const accent = (row * 17 + column * 11) % 29;
  if (accent === 0) {
    return COLORS.coral;
  }
  if (accent === 7) {
    return COLORS.lime;
  }
  return accent % 5 === 0 ? COLORS.goldBright : COLORS.gold;
}

export function getCellStylePlan(cell, row = 0, column = 0) {
  if (cell === CELL_WALL) {
    return {
      fill: COLORS.wall,
      highlight: COLORS.wallEdge,
      radius: 1.5,
    };
  }
  if (cell === CELL_BRICK) {
    return {
      fill: colorForBrick(row, column),
      highlight: 'rgba(255, 255, 255, 0.28)',
      radius: 2.5,
    };
  }
  return null;
}

function seededFraction(seed) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function interpolate(previous, current, alpha) {
  return previous + (current - previous) * alpha;
}

export function createRenderer(canvas, options = {}) {
  const context = canvas?.getContext?.('2d', { alpha: false });
  if (!context) {
    throw new TypeError('createRenderer requires a canvas with a 2D context');
  }

  let reducedMotion = Boolean(options.reducedMotion);
  let effectBudget = getEffectBudget(reducedMotion);
  let layout = fitWorldToViewport(GAME_WIDTH, GAME_HEIGHT);
  let devicePixelRatio = 1;
  let brickLayer = null;
  let brickContext = null;
  let brickLayerRatio = 1;
  let cachedGame = null;
  let particles = [];
  let trails = [];
  let trailFrame = 0;
  let hasSizedCanvas = false;

  function createBrickSurface(width, height) {
    if (typeof globalThis.OffscreenCanvas === 'function') {
      return new globalThis.OffscreenCanvas(width, height);
    }
    const surface = canvas.ownerDocument.createElement('canvas');
    surface.width = width;
    surface.height = height;
    return surface;
  }

  function drawCell(game, row, column, cell) {
    const grid = game.grid;
    const style = getCellStylePlan(cell, row, column);
    const inset = cell === CELL_WALL ? Math.max(0.5, grid.brickInset) : grid.brickInset;
    const x = grid.x + column * grid.cellWidth + inset;
    const y = grid.y + row * grid.cellHeight + inset;
    const width = grid.cellWidth - inset * 2;
    const height = grid.cellHeight - inset * 2;

    brickContext.fillStyle = style.fill;
    roundedRectPath(brickContext, x, y, width, height, style.radius);
    brickContext.fill();
    brickContext.fillStyle = style.highlight;
    roundedRectPath(
      brickContext,
      x + 1.5,
      y + 1,
      Math.max(1, width - 3),
      cell === CELL_WALL ? 1 : 1.5,
      0.75,
    );
    brickContext.fill();
  }

  function rebuildBrickLayer(game) {
    brickLayerRatio = devicePixelRatio;
    brickLayer = createBrickSurface(
      Math.round(GAME_WIDTH * brickLayerRatio),
      Math.round(GAME_HEIGHT * brickLayerRatio),
    );
    brickContext = brickLayer.getContext('2d');
    brickContext.setTransform(
      brickLayerRatio,
      0,
      0,
      brickLayerRatio,
      0,
      0,
    );
    brickContext.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    for (let row = 0; row < game.grid.rows; row += 1) {
      for (let column = 0; column < game.grid.columns; column += 1) {
        const index = row * game.grid.columns + column;
        const cell = game.bricks[index];
        if (cell !== CELL_EMPTY) {
          drawCell(game, row, column, cell);
        }
      }
    }
    cachedGame = game;
  }

  function ensureBrickLayer(game) {
    if (
      cachedGame !== game ||
      !brickLayer ||
      Math.abs(brickLayerRatio - devicePixelRatio) > 0.01
    ) {
      rebuildBrickLayer(game);
    }
  }

  function clearBrickCell(game, row, column) {
    if (!brickContext) {
      return;
    }
    const grid = game.grid;
    const x = grid.x + column * grid.cellWidth;
    const y = grid.y + row * grid.cellHeight;
    brickContext.clearRect(x - 0.5, y - 0.5, grid.cellWidth + 1, grid.cellHeight + 1);
  }

  function trimEffects() {
    if (particles.length > effectBudget.maxParticles) {
      particles.splice(0, particles.length - effectBudget.maxParticles);
    }
    if (trails.length > effectBudget.maxTrails) {
      trails.splice(0, trails.length - effectBudget.maxTrails);
    }
  }

  function pushParticle(particle) {
    if (particles.length >= effectBudget.maxParticles) {
      return;
    }
    particles.push(particle);
  }

  function spawnBurst(x, y, color, count, seed) {
    const available = effectBudget.maxParticles - particles.length;
    const particleCount = Math.min(count, available);
    for (let index = 0; index < particleCount; index += 1) {
      const random = seededFraction(seed + index * 1.79);
      const angle = random * Math.PI * 2;
      const speed = 32 + seededFraction(seed + index * 3.13) * 105;
      const life = 0.22 + seededFraction(seed + index * 5.71) * 0.24;
      pushParticle({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 1.2 + seededFraction(seed + index * 7.19) * 2.2,
        color,
      });
    }
  }

  function consumeEvents(game, events) {
    ensureBrickLayer(game);
    let impactEvents = 0;

    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      if (event.type === 'brick-hit') {
        clearBrickCell(game, event.row, event.column);
        if (impactEvents < 24) {
          spawnBurst(
            event.x,
            event.y,
            colorForBrick(event.row, event.column),
            effectBudget.impactParticles,
            event.row * 101 + event.column * 17 + game.stepCount,
          );
          impactEvents += 1;
        }
      } else if (event.type === 'paddle-hit' && impactEvents < 24) {
        spawnBurst(
          event.x,
          game.paddle.y - game.paddle.height / 2,
          COLORS.white,
          Math.max(1, Math.floor(effectBudget.impactParticles / 2)),
          game.stepCount + index,
        );
        impactEvents += 1;
      } else if (event.type === 'multiply') {
        const focusBall = game.balls[0];
        spawnBurst(
          focusBall?.x ?? game.paddle.x,
          focusBall?.y ?? game.paddle.y,
          COLORS.lime,
          effectBudget.impactParticles * 3,
          game.stepCount + 303,
        );
      } else if (event.type === 'lost') {
        spawnBurst(
          game.paddle.x,
          game.paddle.y,
          COLORS.coral,
          effectBudget.impactParticles * 3,
          game.stepCount + 707,
        );
      } else if (event.type === 'won') {
        spawnBurst(
          GAME_WIDTH / 2,
          GAME_HEIGHT * 0.38,
          COLORS.goldBright,
          effectBudget.impactParticles * 4,
          game.stepCount + 909,
        );
      }
    }
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return layout;
    }

    const requestedRatio = options.pixelRatio ?? globalThis.devicePixelRatio ?? 1;
    const nextRatio = clamp(requestedRatio, 1, MAX_DEVICE_PIXEL_RATIO);
    const nextWidth = Math.max(1, Math.round(bounds.width * nextRatio));
    const nextHeight = Math.max(1, Math.round(bounds.height * nextRatio));
    const sizeChanged = canvas.width !== nextWidth || canvas.height !== nextHeight;
    const ratioChanged = Math.abs(devicePixelRatio - nextRatio) > 0.01;

    if (sizeChanged) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
    }
    devicePixelRatio = nextRatio;
    layout = fitWorldToViewport(bounds.width, bounds.height);
    hasSizedCanvas = true;

    if (ratioChanged && cachedGame) {
      rebuildBrickLayer(cachedGame);
    }
    return layout;
  }

  function addTrails(game, paused) {
    trailFrame = (trailFrame + 1) % effectBudget.trailEvery;
    if (
      paused ||
      game.status !== 'playing' ||
      trailFrame !== 0 ||
      game.balls.length === 0
    ) {
      return;
    }

    const sampleCount = Math.min(game.balls.length, effectBudget.trailBallLimit);
    const stride = Math.max(1, Math.floor(game.balls.length / sampleCount));
    for (let index = 0; index < game.balls.length && sampleCount > 0; index += stride) {
      if (trails.length >= effectBudget.maxTrails) {
        break;
      }
      const ball = game.balls[index];
      trails.push({
        x: ball.x,
        y: ball.y,
        radius: Math.max(1.4, ball.radius * 0.62),
        life: reducedMotion ? 0.1 : 0.22,
        maxLife: reducedMotion ? 0.1 : 0.22,
      });
      if (Math.ceil((index + 1) / stride) >= sampleCount) {
        break;
      }
    }
    trimEffects();
  }

  function updateEffects(frameDelta, paused) {
    if (paused) {
      return;
    }

    let writeIndex = 0;
    for (const trail of trails) {
      trail.life -= frameDelta;
      if (trail.life > 0) {
        trails[writeIndex] = trail;
        writeIndex += 1;
      }
    }
    trails.length = writeIndex;

    writeIndex = 0;
    for (const particle of particles) {
      particle.life -= frameDelta;
      if (particle.life > 0) {
        particle.x += particle.vx * frameDelta;
        particle.y += particle.vy * frameDelta;
        particle.vy += 72 * frameDelta;
        particles[writeIndex] = particle;
        writeIndex += 1;
      }
    }
    particles.length = writeIndex;
  }

  function drawBackground() {
    context.fillStyle = COLORS.background;
    context.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const glow = context.createRadialGradient(
      GAME_WIDTH / 2,
      GAME_HEIGHT * 0.48,
      10,
      GAME_WIDTH / 2,
      GAME_HEIGHT * 0.48,
      GAME_WIDTH * 0.72,
    );
    glow.addColorStop(0, 'rgba(245, 189, 85, 0.045)');
    glow.addColorStop(1, 'rgba(7, 8, 12, 0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }

  function drawTrails() {
    if (trails.length === 0) {
      return;
    }
    context.fillStyle = COLORS.white;
    for (const trail of trails) {
      context.globalAlpha = (trail.life / trail.maxLife) * 0.2;
      context.beginPath();
      context.arc(trail.x, trail.y, trail.radius, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawBalls(game, previousState, alpha) {
    if (game.balls.length === 0) {
      return;
    }

    context.fillStyle = COLORS.white;
    context.shadowColor = 'rgba(255, 253, 246, 0.72)';
    context.shadowBlur = reducedMotion ? 3 : 7;
    context.beginPath();
    for (let index = 0; index < game.balls.length; index += 1) {
      const ball = game.balls[index];
      const previous = previousState?.balls.get(ball);
      const x = previous ? interpolate(previous.x, ball.x, alpha) : ball.x;
      const y = previous ? interpolate(previous.y, ball.y, alpha) : ball.y;
      context.moveTo(x + ball.radius, y);
      context.arc(x, y, ball.radius, 0, Math.PI * 2);
    }
    context.fill();
    context.shadowBlur = 0;
  }

  function drawPaddle(game, previousState, alpha) {
    const paddle = game.paddle;
    const previousX = previousState?.paddleX ?? paddle.x;
    const x = interpolate(previousX, paddle.x, alpha) - paddle.width / 2;
    const y = paddle.y - paddle.height / 2;
    const style = getPaddleStylePlan();
    const gradient = context.createLinearGradient(x, y, x, y + paddle.height);
    gradient.addColorStop(0, style.gradientStart);
    gradient.addColorStop(1, style.gradientEnd);

    context.shadowColor = style.shadow;
    context.shadowBlur = reducedMotion ? 4 : 12;
    context.fillStyle = gradient;
    roundedRectPath(context, x, y, paddle.width, paddle.height, paddle.height / 2);
    context.fill();
    context.shadowBlur = 0;
  }

  function drawTokens(game) {
    const tokenCount = Math.min(game.tokens.length, 64);
    for (let index = 0; index < tokenCount; index += 1) {
      const token = game.tokens[index];
      context.fillStyle = COLORS.lime;
      context.beginPath();
      context.arc(token.x, token.y, token.radius + 3, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = COLORS.ink;
      context.font = '700 10px ui-rounded, system-ui, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('×3', token.x, token.y + 0.5);
    }
  }

  function drawParticles() {
    for (const particle of particles) {
      context.globalAlpha = particle.life / particle.maxLife;
      context.fillStyle = particle.color;
      context.fillRect(
        particle.x - particle.size / 2,
        particle.y - particle.size / 2,
        particle.size,
        particle.size,
      );
    }
    context.globalAlpha = 1;
  }

  function drawOverlay(game, paused) {
    if (!paused && game.status === 'playing') {
      return;
    }

    const won = game.status === 'won';
    const lost = game.status === 'lost';
    context.fillStyle = 'rgba(3, 4, 7, 0.74)';
    context.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = won ? COLORS.lime : lost ? COLORS.coral : COLORS.goldBright;
    context.font = '800 34px ui-rounded, system-ui, sans-serif';
    context.fillText(won ? 'CLEARED' : lost ? 'TRY AGAIN' : 'PAUSED', GAME_WIDTH / 2, 408);
    context.fillStyle = COLORS.white;
    context.globalAlpha = 0.78;
    context.font = '600 13px ui-rounded, system-ui, sans-serif';
    context.fillText(
      paused && !won && !lost ? '按空格或暂停按钮继续' : '点击重开，再来一局',
      GAME_WIDTH / 2,
      444,
    );
    context.globalAlpha = 1;
  }

  function render(game, frame = {}) {
    if (!hasSizedCanvas) {
      resize();
    }
    ensureBrickLayer(game);
    const alpha = clamp(frame.alpha ?? 1, 0, 1);
    const frameDelta = clamp(frame.frameDelta ?? 0, 0, 0.05);

    addTrails(game, frame.paused);
    updateEffects(frameDelta, frame.paused);

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = COLORS.backgroundDeep;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(
      devicePixelRatio * layout.scale,
      0,
      0,
      devicePixelRatio * layout.scale,
      devicePixelRatio * layout.offsetX,
      devicePixelRatio * layout.offsetY,
    );

    drawBackground();
    context.drawImage(brickLayer, 0, 0, GAME_WIDTH, GAME_HEIGHT);
    drawTrails();
    drawTokens(game);
    drawBalls(game, frame.previousState, alpha);
    drawPaddle(game, frame.previousState, alpha);
    drawParticles();
    drawOverlay(game, frame.paused);
  }

  return {
    resize,
    render,
    consumeEvents,
    reset(game) {
      cachedGame = null;
      particles = [];
      trails = [];
      rebuildBrickLayer(game);
    },
    setReducedMotion(nextReducedMotion) {
      reducedMotion = Boolean(nextReducedMotion);
      effectBudget = getEffectBudget(reducedMotion);
      trimEffects();
    },
    clientToWorld(clientX, clientY) {
      const bounds = canvas.getBoundingClientRect();
      return clientToWorld(clientX - bounds.left, clientY - bounds.top, layout);
    },
    get layout() {
      return layout;
    },
    get effectCounts() {
      return { particles: particles.length, trails: trails.length };
    },
  };
}
