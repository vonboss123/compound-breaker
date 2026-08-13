export const GAME_WIDTH = 390;
export const GAME_HEIGHT = 844;
export const FIXED_STEP = 1 / 120;
export const MAX_VISIBLE_BALLS = Number.MAX_SAFE_INTEGER;
export const MIN_HORIZONTAL_SPEED_RATIO = 0.12;
export const CELL_EMPTY = 0;
export const CELL_BRICK = 1;
export const CELL_WALL = 2;

export const LEVELS = Object.freeze([
  Object.freeze({
    id: 'level-1',
    title: '复利破阵',
    description: '击穿密集砖阵，让每一次 ×3 滚成雪球。',
  }),
  Object.freeze({
    id: 'level-2',
    title: '长廊核心',
    description: '从唯一入口穿过 L 形长廊，再击碎墙后的核心。',
  }),
]);

const GRID_COLUMNS = 18;
const GRID_ROWS = 22;
const GRID_X = 15;
const GRID_Y = 64;
const CELL_WIDTH = 20;
const CELL_HEIGHT = 14;
const BRICK_INSET = 1;
const DEFAULT_MAX_PHYSICAL_BALLS = 192;
const LEVEL_TWO_GRID = Object.freeze({
  columns: 30,
  rows: 38,
  x: 15,
  y: 64,
  cellWidth: 12,
  cellHeight: 10,
  brickInset: 0,
});
const LEVEL_TWO_ENTRANCE_START = 7;
const LEVEL_TWO_ENTRANCE_WIDTH = 3;
const LEVEL_TWO_TURN_ROW = 7;
const LEVEL_TWO_CORRIDOR_END = 24;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function nextRandom(state) {
  let value = state.rngState | 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  state.rngState = value >>> 0;
  return state.rngState / 0x100000000;
}

function setOutgoingVelocity(
  game,
  ball,
  rawVx,
  verticalSign,
  speed,
  preferredVx = 0,
) {
  const minimumHorizontalSpeed = speed * MIN_HORIZONTAL_SPEED_RATIO;
  let nextVx = rawVx;

  if (Math.abs(nextVx) < minimumHorizontalSpeed) {
    let horizontalSign = Math.sign(preferredVx);
    if (horizontalSign === 0) {
      horizontalSign = nextRandom(game) < 0.5 ? -1 : 1;
    }
    nextVx = horizontalSign * minimumHorizontalSpeed;
  }

  ball.vx = nextVx;
  ball.vy = Math.sign(verticalSign || -1) * Math.sqrt(
    Math.max(0, speed * speed - nextVx * nextVx),
  );
}

function isLaunchCorridor(row, column) {
  const inShaft = row >= 7 && (column === 8 || column === 9);
  const inArrowHead =
    (row === 5 && (column === 8 || column === 9)) ||
    (row === 6 && column >= 7 && column <= 10) ||
    (row === 7 && column >= 6 && column <= 11);
  const inLFoot = row === 16 && column >= 8 && column <= 13;
  return inShaft || inArrowHead || inLFoot;
}

function createLevelOneFortress(game) {
  const bricks = game.bricks;
  let remaining = 0;

  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let column = 0; column < GRID_COLUMNS; column += 1) {
      const index = row * GRID_COLUMNS + column;
      const occupied = !isLaunchCorridor(row, column) && nextRandom(game) >= 0.06;
      bricks[index] = occupied ? CELL_BRICK : CELL_EMPTY;
      remaining += bricks[index];
    }
  }

  return remaining;
}

function setLevelTwoCell(game, row, column, value) {
  game.bricks[row * game.grid.columns + column] = value;
}

function createLevelTwoFortress(game) {
  const { columns, rows } = game.grid;
  const entranceEnd = LEVEL_TWO_ENTRANCE_START + LEVEL_TWO_ENTRANCE_WIDTH - 1;
  game.bricks.fill(CELL_BRICK);

  for (let column = 0; column < columns; column += 1) {
    setLevelTwoCell(game, 0, column, CELL_WALL);
    setLevelTwoCell(game, rows - 1, column, CELL_WALL);
  }
  for (let row = 0; row < rows; row += 1) {
    setLevelTwoCell(game, row, 0, CELL_WALL);
    setLevelTwoCell(game, row, columns - 1, CELL_WALL);
  }

  // A three-cell shaft enters from below and turns right near the top.
  for (let row = LEVEL_TWO_TURN_ROW; row < rows; row += 1) {
    for (
      let column = LEVEL_TWO_ENTRANCE_START;
      column <= entranceEnd;
      column += 1
    ) {
      setLevelTwoCell(game, row, column, CELL_EMPTY);
    }
  }
  for (
    let row = LEVEL_TWO_TURN_ROW;
    row < LEVEL_TWO_TURN_ROW + LEVEL_TWO_ENTRANCE_WIDTH;
    row += 1
  ) {
    for (
      let column = LEVEL_TWO_ENTRANCE_START;
      column <= LEVEL_TWO_CORRIDOR_END;
      column += 1
    ) {
      setLevelTwoCell(game, row, column, CELL_EMPTY);
    }
  }

  // Permanent walls make the corridor the only route to the breakable core.
  for (let row = LEVEL_TWO_TURN_ROW; row < rows; row += 1) {
    setLevelTwoCell(game, row, LEVEL_TWO_ENTRANCE_START - 1, CELL_WALL);
  }
  for (
    let row = LEVEL_TWO_TURN_ROW + LEVEL_TWO_ENTRANCE_WIDTH;
    row < rows;
    row += 1
  ) {
    setLevelTwoCell(game, row, entranceEnd + 1, CELL_WALL);
  }
  for (
    let column = LEVEL_TWO_ENTRANCE_START - 1;
    column <= LEVEL_TWO_CORRIDOR_END;
    column += 1
  ) {
    setLevelTwoCell(game, LEVEL_TWO_TURN_ROW - 1, column, CELL_WALL);
  }
  for (
    let column = entranceEnd + 1;
    column <= LEVEL_TWO_CORRIDOR_END;
    column += 1
  ) {
    setLevelTwoCell(
      game,
      LEVEL_TWO_TURN_ROW + LEVEL_TWO_ENTRANCE_WIDTH,
      column,
      CELL_WALL,
    );
  }

  let remaining = 0;
  for (const cell of game.bricks) {
    if (cell === CELL_BRICK) remaining += 1;
  }
  return remaining;
}

function positiveOption(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function createGame(options = {}) {
  const requestedLevelId = options.levelId;
  const levelId = LEVELS.some(({ id }) => id === requestedLevelId)
    ? requestedLevelId
    : 'level-1';
  const grid = levelId === 'level-2'
    ? { ...LEVEL_TWO_GRID }
    : {
        columns: GRID_COLUMNS,
        rows: GRID_ROWS,
        x: GRID_X,
        y: GRID_Y,
        cellWidth: CELL_WIDTH,
        cellHeight: CELL_HEIGHT,
        brickInset: BRICK_INSET,
      };
  const launchCell = levelId === 'level-2'
    ? {
        row: grid.rows - 1,
        column: LEVEL_TWO_ENTRANCE_START + Math.floor(LEVEL_TWO_ENTRANCE_WIDTH / 2),
      }
    : {
        row: GRID_ROWS - 1,
        column: 9,
      };
  const seed = (options.seed ?? 0x6d2b79f5) >>> 0 || 0x6d2b79f5;
  const maxPhysicalBalls = Math.max(
    1,
    Math.trunc(positiveOption(options.maxPhysicalBalls, DEFAULT_MAX_PHYSICAL_BALLS)),
  );
  const multiplierEvery = positiveOption(options.multiplierEvery, 200);
  const paddle = {
    x: GAME_WIDTH / 2,
    y: 760,
    width: 92,
    height: 14,
  };
  const game = {
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    levelId,
    seed,
    rngState: seed,
    status: 'playing',
    stepCount: 0,
    time: 0,
    score: 0,
    brickScore: 10,
    multiplierEvery,
    nextMultiplierScore: multiplierEvery,
    ballRadius: 5,
    maxPhysicalBalls,
    visibleBallCount: 1,
    grid,
    launchCell,
    bricks: new Uint8Array(grid.columns * grid.rows),
    remainingBricks: 0,
    paddle,
    balls: [
      {
        x:
          levelId === 'level-2'
            ? grid.x + (launchCell.column + 0.5) * grid.cellWidth - 8
            : GAME_WIDTH / 2,
        y: 690,
        vx: levelId === 'level-2' ? 24 : 90,
        vy: -300,
        radius: 5,
        weight: 1,
      },
    ],
    tokens: [],
    tokenFallSpeed: 110,
    events: [],
  };

  game.remainingBricks = levelId === 'level-2'
    ? createLevelTwoFortress(game)
    : createLevelOneFortress(game);
  return game;
}

export function movePaddle(game, x) {
  const halfWidth = game.paddle.width / 2;
  game.paddle.x = clamp(x, halfWidth, GAME_WIDTH - halfWidth);
  return game.paddle.x;
}

function pushMultiplierToken(game, x, y) {
  game.tokens.push({
    kind: 'multiplier',
    value: 3,
    x,
    y,
    radius: 8,
    vy: game.tokenFallSpeed,
  });
}

function awardBrick(game, row, column) {
  const index = row * game.grid.columns + column;
  game.bricks[index] = CELL_EMPTY;
  game.remainingBricks -= 1;
  game.score += game.brickScore;

  const x = game.grid.x + (column + 0.5) * game.grid.cellWidth;
  const y = game.grid.y + (row + 0.5) * game.grid.cellHeight;
  game.events.push({
    type: 'brick-hit',
    row,
    column,
    x,
    y,
    score: game.score,
  });

  while (game.score >= game.nextMultiplierScore) {
    pushMultiplierToken(game, x, y);
    game.nextMultiplierScore += game.multiplierEvery;
  }

  if (game.remainingBricks === 0) {
    game.tokens.length = 0;
    game.status = 'won';
    game.events.push({ type: 'won', score: game.score });
  }
}

function reflectFromBrick(ball, left, top, right, bottom, previousX, previousY) {
  const radius = ball.radius;

  if (previousX + radius <= left && ball.vx > 0) {
    ball.x = left - radius;
    ball.vx = -ball.vx;
  } else if (previousX - radius >= right && ball.vx < 0) {
    ball.x = right + radius;
    ball.vx = -ball.vx;
  } else if (previousY + radius <= top && ball.vy > 0) {
    ball.y = top - radius;
    ball.vy = -ball.vy;
  } else if (previousY - radius >= bottom && ball.vy < 0) {
    ball.y = bottom + radius;
    ball.vy = -ball.vy;
  } else if (Math.abs(ball.vx) > Math.abs(ball.vy)) {
    const movingRight = ball.vx > 0;
    ball.x = movingRight ? left - radius : right + radius;
    ball.vx = -ball.vx;
  } else {
    const movingDown = ball.vy > 0;
    ball.y = movingDown ? top - radius : bottom + radius;
    ball.vy = -ball.vy;
  }
}

function hitNearbyBrick(game, ball, previousX, previousY) {
  const grid = game.grid;
  const radius = ball.radius;
  const minimumColumn = clamp(
    Math.floor((ball.x - radius - grid.x) / grid.cellWidth),
    0,
    grid.columns - 1,
  );
  const maximumColumn = clamp(
    Math.floor((ball.x + radius - grid.x) / grid.cellWidth),
    0,
    grid.columns - 1,
  );
  const minimumRow = clamp(
    Math.floor((ball.y - radius - grid.y) / grid.cellHeight),
    0,
    grid.rows - 1,
  );
  const maximumRow = clamp(
    Math.floor((ball.y + radius - grid.y) / grid.cellHeight),
    0,
    grid.rows - 1,
  );

  if (
    ball.x + radius < grid.x ||
    ball.x - radius > grid.x + grid.columns * grid.cellWidth ||
    ball.y + radius < grid.y ||
    ball.y - radius > grid.y + grid.rows * grid.cellHeight
  ) {
    return false;
  }

  for (let row = minimumRow; row <= maximumRow; row += 1) {
    for (let column = minimumColumn; column <= maximumColumn; column += 1) {
      const index = row * grid.columns + column;
      const cell = game.bricks[index];
      if (cell === CELL_EMPTY) {
        continue;
      }

      const left = grid.x + column * grid.cellWidth + grid.brickInset;
      const top = grid.y + row * grid.cellHeight + grid.brickInset;
      const right = left + grid.cellWidth - 2 * grid.brickInset;
      const bottom = top + grid.cellHeight - 2 * grid.brickInset;
      const nearestX = clamp(ball.x, left, right);
      const nearestY = clamp(ball.y, top, bottom);
      const dx = ball.x - nearestX;
      const dy = ball.y - nearestY;

      if (dx * dx + dy * dy > radius * radius) {
        continue;
      }

      reflectFromBrick(ball, left, top, right, bottom, previousX, previousY);
      if (cell === CELL_BRICK) {
        awardBrick(game, row, column);
      }
      return true;
    }
  }

  return false;
}

function reflectFromWalls(game, ball) {
  const radius = ball.radius;
  if (ball.x < radius) {
    ball.x = radius;
    ball.vx = Math.abs(ball.vx);
  } else if (ball.x > GAME_WIDTH - radius) {
    ball.x = GAME_WIDTH - radius;
    ball.vx = -Math.abs(ball.vx);
  }

  if (ball.y < radius) {
    ball.y = radius;
    ball.vy = Math.abs(ball.vy);
  }
}

function reflectFromPaddle(game, ball, previousX, previousY) {
  if (ball.vy <= 0) {
    return false;
  }

  const paddle = game.paddle;
  const halfWidth = paddle.width / 2;
  const halfHeight = paddle.height / 2;
  const top = paddle.y - halfHeight;
  if (
    previousY + ball.radius > top ||
    ball.y + ball.radius < top
  ) {
    return false;
  }

  const travelY = ball.y - previousY;
  const crossingFraction =
    travelY === 0
      ? 0
      : clamp((top - ball.radius - previousY) / travelY, 0, 1);
  const collisionX = previousX + (ball.x - previousX) * crossingFraction;
  if (
    collisionX + ball.radius < paddle.x - halfWidth ||
    collisionX - ball.radius > paddle.x + halfWidth
  ) {
    return false;
  }

  const hitPosition = clamp((collisionX - paddle.x) / halfWidth, -1, 1);
  const maximumAngle = (65 * Math.PI) / 180;
  const angle = hitPosition * maximumAngle;
  const speed = Math.max(1, Math.hypot(ball.vx, ball.vy));
  const priorVx = ball.vx;
  const rawVx = Math.sin(angle) * speed;
  ball.x = collisionX;
  ball.y = top - ball.radius;
  setOutgoingVelocity(
    game,
    ball,
    rawVx,
    -1,
    speed,
    hitPosition === 0 ? priorVx : hitPosition,
  );
  game.events.push({ type: 'paddle-hit', x: ball.x, hitPosition });
  return true;
}

function updateTokens(game) {
  const paddle = game.paddle;
  const halfWidth = paddle.width / 2;
  const halfHeight = paddle.height / 2;

  for (let index = game.tokens.length - 1; index >= 0; index -= 1) {
    const token = game.tokens[index];
    token.y += token.vy * FIXED_STEP;
    const touchesPaddle =
      token.x + token.radius >= paddle.x - halfWidth &&
      token.x - token.radius <= paddle.x + halfWidth &&
      token.y + token.radius >= paddle.y - halfHeight &&
      token.y - token.radius <= paddle.y + halfHeight;

    if (touchesPaddle) {
      game.tokens.splice(index, 1);
      activateMultiplier(game);
    } else if (token.y - token.radius > GAME_HEIGHT) {
      game.tokens.splice(index, 1);
    }
  }
}

function removeLostBall(game, index) {
  const ball = game.balls[index];
  game.visibleBallCount = Math.max(0, game.visibleBallCount - ball.weight);
  game.balls.splice(index, 1);
}

function updateBalls(game) {
  for (let index = game.balls.length - 1; index >= 0; index -= 1) {
    const ball = game.balls[index];
    const previousX = ball.x;
    const previousY = ball.y;
    ball.x += ball.vx * FIXED_STEP;
    ball.y += ball.vy * FIXED_STEP;
    reflectFromWalls(game, ball);
    reflectFromPaddle(game, ball, previousX, previousY);
    hitNearbyBrick(game, ball, previousX, previousY);

    if (ball.y - ball.radius > GAME_HEIGHT) {
      removeLostBall(game, index);
    }
  }

  if (game.balls.length === 0 && game.status === 'playing') {
    game.visibleBallCount = 0;
    game.status = 'lost';
    game.events.push({ type: 'lost', score: game.score });
  }
}

export function activateMultiplier(game) {
  if (game.balls.length === 0 || game.visibleBallCount === 0) {
    return game.visibleBallCount;
  }

  const nextVisibleCount =
    game.visibleBallCount > Math.floor(MAX_VISIBLE_BALLS / 3)
      ? MAX_VISIBLE_BALLS
      : game.visibleBallCount * 3;
  const targetPhysicalCount = Math.min(game.maxPhysicalBalls, nextVisibleCount);
  const sourceCount = game.balls.length;

  while (game.balls.length < targetPhysicalCount) {
    const source = game.balls[game.balls.length % sourceCount];
    game.balls.push({
      x: source.x,
      y: source.y,
      vx: source.vx,
      vy: source.vy,
      radius: source.radius,
      weight: 1,
    });
  }

  const baseWeight = Math.floor(nextVisibleCount / targetPhysicalCount);
  const extraWeight = nextVisibleCount % targetPhysicalCount;
  const fanAngle = (130 * Math.PI) / 180;

  for (let index = 0; index < targetPhysicalCount; index += 1) {
    const ball = game.balls[index];
    const priorVx = ball.vx;
    const speed = Math.max(1, Math.hypot(ball.vx, ball.vy));
    const fraction = targetPhysicalCount === 1 ? 0.5 : index / (targetPhysicalCount - 1);
    const angle = -Math.PI / 2 + (fraction - 0.5) * fanAngle;
    setOutgoingVelocity(game, ball, Math.cos(angle) * speed, -1, speed, priorVx);
    ball.weight = baseWeight + (index < extraWeight ? 1 : 0);
  }

  game.visibleBallCount = nextVisibleCount;
  game.events.push({
    type: 'multiply',
    factor: 3,
    visibleBallCount: nextVisibleCount,
    physicalBallCount: targetPhysicalCount,
  });
  return nextVisibleCount;
}

export function stepGame(game, input) {
  game.events.length = 0;
  if (game.status !== 'playing') {
    return game;
  }

  if (input && Number.isFinite(input.paddleX)) {
    movePaddle(game, input.paddleX);
  }

  game.stepCount += 1;
  game.time = game.stepCount * FIXED_STEP;
  updateTokens(game);
  updateBalls(game);
  return game;
}
