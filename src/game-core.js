export const GAME_WIDTH = 390;
export const GAME_HEIGHT = 844;
export const FIXED_STEP = 1 / 120;
export const MAX_VISIBLE_BALLS = 12;
export const MIN_HORIZONTAL_SPEED_RATIO = 0.12;
export const CELL_EMPTY = 0;
export const CELL_BRICK = 1;
export const CELL_WALL = 2;

export const POWERUPS = Object.freeze({
  multiplier: Object.freeze({ name: '三倍球', symbol: '×3', color: '#b8ef68', points: 100 }),
  bomb: Object.freeze({ name: '爆破弹', symbol: '✹', color: '#ff964c', points: 100 }),
  wide: Object.freeze({ name: '加长板', symbol: '↔', color: '#62d7ff', points: 100 }),
  short: Object.freeze({ name: '缩短板', symbol: '↦↤', color: '#c291ff', points: -100 }),
  hard: Object.freeze({ name: '金刚球', symbol: '◆', color: '#ffdf57', points: 100 }),
});
export const POWERUP_RULES = Object.freeze({ firstAt: 2, interval: 7, starters: 4, brickPoints: 60 });
const BONUS_SEQUENCE = ['wide', 'multiplier', 'hard', 'bomb', 'wide', 'short',
  'hard', 'multiplier', 'bomb', 'wide', 'hard', 'bomb'];

export const LEVELS = Object.freeze([
  Object.freeze({
    id: 'level-1',
    title: '复利破阵',
    description: '接住彩色道具，体验增球、爆破与金刚球。',
  }),
  Object.freeze({
    id: 'level-2',
    title: '宽门入阵',
    description: '宽入口、短直道，练习把球送入围墙。',
  }),
  Object.freeze({
    id: 'level-3',
    title: '折角回廊',
    description: '沿宽阔折廊转弯，掌握墙面反弹。',
  }),
  Object.freeze({
    id: 'level-4',
    title: '深巷突围',
    description: '入口收窄、通道加长，挑战精准回球。',
  }),
  Object.freeze({
    id: 'level-5',
    title: '长廊核心',
    description: '原第2关：穿过最窄、最长的 L 形通道。',
  }),
]);

const GRID_COLUMNS = 18;
const GRID_ROWS = 22;
const GRID_X = 15;
const GRID_Y = 150;
const CELL_WIDTH = 20;
const CELL_HEIGHT = 14;
const BRICK_INSET = 1;
const DEFAULT_MAX_PHYSICAL_BALLS = MAX_VISIBLE_BALLS;
const COLLISION_EPSILON = 1e-7;
const FORTRESS_GRID = Object.freeze({
  columns: 30,
  rows: 38,
  x: 0,
  y: GRID_Y,
  cellWidth: GAME_WIDTH / 30,
  cellHeight: 10,
  brickInset: 0,
});
// Keep speed and paddle handling constant; introduce walls, then tighten the route.
const FORTRESSES = Object.freeze({
  'level-2': Object.freeze({ rows: 24, entranceStart: 9, corridorWidth: 12, turnRow: 20, firstBonus: 30, launchVx: -120, rowGap: 9 }),
  'level-3': Object.freeze({ rows: 29, entranceStart: 8, corridorWidth: 7, turnRow: 12, corridorEnd: 21, firstBonus: 40, launchVx: -240, rowGap: 7, columnGap: 7 }),
  'level-4': Object.freeze({ rows: 34, entranceStart: 7, corridorWidth: 5, turnRow: 10, corridorEnd: 23, firstBonus: 60, launchVx: -240, columnGap: 5 }),
  'level-5': Object.freeze({ rows: 38, entranceStart: 7, corridorWidth: 3, turnRow: 7, corridorEnd: 24 }),
});

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

function setFortressCell(game, row, column, value) {
  game.bricks[row * game.grid.columns + column] = value;
}

function createFortress(game, route) {
  const { columns, rows } = game.grid;
  const { entranceStart, corridorWidth, turnRow, corridorEnd } = route;
  const entranceEnd = entranceStart + corridorWidth - 1;
  game.bricks.fill(CELL_BRICK);

  for (let column = 0; column < columns; column += 1) {
    setFortressCell(game, 0, column, CELL_WALL);
    setFortressCell(game, rows - 1, column, CELL_WALL);
  }
  for (let row = 0; row < rows; row += 1) {
    setFortressCell(game, row, 0, CELL_WALL);
    setFortressCell(game, row, columns - 1, CELL_WALL);
  }

  // Level 2 introduces a straight gate; later routes add a right-hand turn.
  for (let row = turnRow; row < rows; row += 1) {
    for (
      let column = entranceStart;
      column <= entranceEnd;
      column += 1
    ) {
      setFortressCell(game, row, column, CELL_EMPTY);
    }
  }
  for (
    let row = turnRow;
    corridorEnd !== undefined && row < turnRow + corridorWidth;
    row += 1
  ) {
    for (
      let column = entranceStart;
      column <= corridorEnd;
      column += 1
    ) {
      setFortressCell(game, row, column, CELL_EMPTY);
    }
  }

  // The corridor is the ordinary-ball route; gold can later open internal/bottom walls.
  for (let row = turnRow; row < rows; row += 1) {
    setFortressCell(game, row, entranceStart - 1, CELL_WALL);
  }
  for (
    let row = corridorEnd === undefined ? turnRow : turnRow + corridorWidth;
    row < rows;
    row += 1
  ) {
    setFortressCell(game, row, entranceEnd + 1, CELL_WALL);
  }
  for (
    let column = entranceStart - 1;
    corridorEnd !== undefined && column <= corridorEnd;
    column += 1
  ) {
    setFortressCell(game, turnRow - 1, column, CELL_WALL);
  }
  for (
    let column = entranceEnd + 1;
    corridorEnd !== undefined && column <= corridorEnd;
    column += 1
  ) {
    setFortressCell(
      game,
      turnRow + corridorWidth,
      column,
      CELL_WALL,
    );
  }

  let remaining = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      if (game.bricks[index] !== CELL_BRICK) continue;
      // Air lanes let early fortresses build rallies before the dense final core.
      if ((route.rowGap && row % route.rowGap < 2) || (route.columnGap && column % route.columnGap < 2)) {
        game.bricks[index] = CELL_EMPTY;
      } else {
        remaining += 1;
      }
    }
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
  const route = FORTRESSES[levelId];
  const grid = route
    ? { ...FORTRESS_GRID, rows: route.rows }
    : {
        columns: GRID_COLUMNS,
        rows: GRID_ROWS,
        x: GRID_X,
        y: GRID_Y,
        cellWidth: CELL_WIDTH,
        cellHeight: CELL_HEIGHT,
        brickInset: BRICK_INSET,
      };
  const launchCell = route
    ? {
        row: grid.rows - 1,
        column: route.entranceStart + Math.floor(route.corridorWidth / 2),
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
    y: 700,
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
    itemScore: 0,
    pickups: Object.fromEntries(Object.keys(POWERUPS).map(kind => [kind, 0])),
    effects: { paddleKind: null, paddleUntil: 0, hardUntil: 0 },
    dropCount: 0,
    nextPowerupAt: POWERUP_RULES.firstAt,
    brickScore: 10,
    // Legacy score thresholds are retained for queued v1 result validation only.
    multiplierEvery,
    nextMultiplierScore: Math.min(route?.firstBonus ?? multiplierEvery, multiplierEvery),
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
          route
            ? grid.x + (launchCell.column + 0.5) * grid.cellWidth
            : GAME_WIDTH / 2,
        y: 690,
        vx: route ? route.launchVx ?? -240 : 90,
        vy: route ? -Math.sqrt(300 ** 2 - (route.launchVx ?? -240) ** 2) : -300,
        radius: 5,
        weight: 1,
      },
    ],
    tokens: [],
    tokenFallSpeed: 120,
    events: [],
  };

  game.remainingBricks = route
    ? createFortress(game, route)
    : createLevelOneFortress(game);
  return game;
}

export function movePaddle(game, x) {
  const halfWidth = game.paddle.width / 2;
  game.paddle.x = clamp(x, halfWidth, GAME_WIDTH - halfWidth);
  return game.paddle.x;
}

export function getPowerupDropLimit(brickPoints, seconds) {
  const earned = POWERUP_RULES.starters + Math.floor(Math.max(0, brickPoints) / POWERUP_RULES.brickPoints);
  const paced = Math.max(0, 1 + Math.floor((seconds - POWERUP_RULES.firstAt) / POWERUP_RULES.interval));
  return Math.min(earned, paced);
}

function updatePowerupSupply(game) {
  if (game.status !== 'playing' || game.time < game.nextPowerupAt ||
      game.dropCount >= getPowerupDropLimit(game.score, game.time)) return;
  let kind = BONUS_SEQUENCE[game.dropCount % BONUS_SEQUENCE.length];
  if (kind === 'multiplier' && game.visibleBallCount >= 6) kind = 'wide';
  const x = clamp(game.paddle.x + (game.dropCount % 2 ? 26 : -26), 12, GAME_WIDTH - 12);
  const y = game.grid.y + game.grid.rows * game.grid.cellHeight + 12;
  game.tokens.push({ kind, value: 3, x, y, radius: 8, vy: game.tokenFallSpeed });
  game.dropCount += 1;
  game.nextPowerupAt = game.time + POWERUP_RULES.interval;
}

function awardBrick(game, row, column) {
  const index = row * game.grid.columns + column;
  if (game.bricks[index] !== CELL_BRICK || game.status !== 'playing') return;
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

  if (game.remainingBricks === 0) {
    game.tokens.length = 0;
    game.status = 'won';
    game.events.push({ type: 'won', score: game.score });
  }
}

function breakWall(game, row, column) {
  const { grid } = game;
  if (game.effects.hardUntil <= game.time || row === 0 || column === 0 ||
      column === grid.columns - 1) return;
  game.bricks[row * grid.columns + column] = CELL_EMPTY;
  game.events.push({ type: 'wall-break', row, column,
    x: grid.x + (column + 0.5) * grid.cellWidth,
    y: grid.y + (row + 0.5) * grid.cellHeight });
}

function explodeBricks(game) {
  const { grid } = game;
  const focus = game.balls[0] ?? game.paddle;
  let target = null;
  let nearest = Infinity;
  for (let index = 0; index < game.bricks.length; index += 1) {
    if (game.bricks[index] !== CELL_BRICK) continue;
    const x = grid.x + (index % grid.columns + 0.5) * grid.cellWidth;
    const y = grid.y + (Math.floor(index / grid.columns) + 0.5) * grid.cellHeight;
    const distance = (x - focus.x) ** 2 + (y - focus.y) ** 2;
    if (distance < nearest) { nearest = distance; target = { x, y }; }
  }
  if (!target) return;
  const radius = 54;
  game.events.push({ type: 'bomb', ...target, radius });
  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const x = grid.x + (column + 0.5) * grid.cellWidth;
      const y = grid.y + (row + 0.5) * grid.cellHeight;
      if ((x - target.x) ** 2 + (y - target.y) ** 2 <= radius ** 2) awardBrick(game, row, column);
    }
  }
}

export function activatePowerup(game, kind) {
  const pickup = POWERUPS[kind];
  if (!pickup || game.status !== 'playing') return false;
  game.pickups[kind] += 1;
  game.itemScore += pickup.points;
  game.events.push({ type: 'pickup', kind, points: pickup.points });
  if (kind === 'multiplier') activateMultiplier(game);
  else if (kind === 'bomb') explodeBricks(game);
  else if (kind === 'hard') game.effects.hardUntil = game.time + 8;
  else {
    game.effects.paddleKind = kind;
    game.effects.paddleUntil = game.time + 12;
    game.paddle.width = kind === 'wide' ? 138 : 60;
    movePaddle(game, game.paddle.x);
  }
  return true;
}

function expirePowerups(game) {
  if (game.effects.paddleKind && game.effects.paddleUntil <= game.time) {
    game.effects.paddleKind = null;
    game.effects.paddleUntil = 0;
    game.paddle.width = 92;
    movePaddle(game, game.paddle.x);
  }
  if (game.effects.hardUntil <= game.time) game.effects.hardUntil = 0;
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

function sweepCircleAgainstRectangle(
  ball,
  previousX,
  previousY,
  left,
  top,
  right,
  bottom,
) {
  const travelX = ball.x - previousX;
  const travelY = ball.y - previousY;
  const expandedLeft = left - ball.radius;
  const expandedTop = top - ball.radius;
  const expandedRight = right + ball.radius;
  const expandedBottom = bottom + ball.radius;

  function axisTimes(start, travel, minimum, maximum) {
    if (Math.abs(travel) <= COLLISION_EPSILON) {
      return start < minimum || start > maximum
        ? null
        : { entry: Number.NEGATIVE_INFINITY, exit: Number.POSITIVE_INFINITY, normal: 0 };
    }
    if (travel > 0) {
      return {
        entry: (minimum - start) / travel,
        exit: (maximum - start) / travel,
        normal: -1,
      };
    }
    return {
      entry: (maximum - start) / travel,
      exit: (minimum - start) / travel,
      normal: 1,
    };
  }

  const xTimes = axisTimes(previousX, travelX, expandedLeft, expandedRight);
  const yTimes = axisTimes(previousY, travelY, expandedTop, expandedBottom);
  if (!xTimes || !yTimes) {
    return null;
  }

  const entryTime = Math.max(xTimes.entry, yTimes.entry);
  const exitTime = Math.min(xTimes.exit, yTimes.exit);
  if (
    entryTime > exitTime + COLLISION_EPSILON ||
    exitTime < -COLLISION_EPSILON ||
    entryTime < -COLLISION_EPSILON ||
    entryTime > 1 + COLLISION_EPSILON
  ) {
    return null;
  }

  let normalX = 0;
  let normalY = 0;
  if (xTimes.entry >= yTimes.entry - COLLISION_EPSILON) {
    normalX = xTimes.normal;
  }
  if (yTimes.entry >= xTimes.entry - COLLISION_EPSILON) {
    normalY = yTimes.normal;
  }
  if (
    (normalX === 0 && normalY === 0) ||
    travelX * normalX + travelY * normalY >= -COLLISION_EPSILON
  ) {
    return null;
  }

  return {
    time: clamp(entryTime, 0, 1),
    normalX,
    normalY,
  };
}

function getCellBounds(grid, row, column) {
  const left = grid.x + column * grid.cellWidth + grid.brickInset;
  const top = grid.y + row * grid.cellHeight + grid.brickInset;
  return {
    left,
    top,
    right: left + grid.cellWidth - 2 * grid.brickInset,
    bottom: top + grid.cellHeight - 2 * grid.brickInset,
  };
}

function hitNearbyBrick(game, ball, previousX, previousY) {
  const grid = game.grid;
  const radius = ball.radius;
  const sweptLeft = Math.min(previousX, ball.x) - radius;
  const sweptRight = Math.max(previousX, ball.x) + radius;
  const sweptTop = Math.min(previousY, ball.y) - radius;
  const sweptBottom = Math.max(previousY, ball.y) + radius;
  const minimumColumn = clamp(
    Math.floor((sweptLeft - grid.x) / grid.cellWidth),
    0,
    grid.columns - 1,
  );
  const maximumColumn = clamp(
    Math.floor((sweptRight - grid.x) / grid.cellWidth),
    0,
    grid.columns - 1,
  );
  const minimumRow = clamp(
    Math.floor((sweptTop - grid.y) / grid.cellHeight),
    0,
    grid.rows - 1,
  );
  const maximumRow = clamp(
    Math.floor((sweptBottom - grid.y) / grid.cellHeight),
    0,
    grid.rows - 1,
  );

  if (
    sweptRight < grid.x ||
    sweptLeft > grid.x + grid.columns * grid.cellWidth ||
    sweptBottom < grid.y ||
    sweptTop > grid.y + grid.rows * grid.cellHeight
  ) {
    return false;
  }

  const contacts = [];
  let earliestTime = Number.POSITIVE_INFINITY;
  for (let row = minimumRow; row <= maximumRow; row += 1) {
    for (let column = minimumColumn; column <= maximumColumn; column += 1) {
      const index = row * grid.columns + column;
      const cell = game.bricks[index];
      if (cell === CELL_EMPTY) {
        continue;
      }

      const bounds = getCellBounds(grid, row, column);
      const sweptHit = sweepCircleAgainstRectangle(
        ball,
        previousX,
        previousY,
        bounds.left,
        bounds.top,
        bounds.right,
        bounds.bottom,
      );
      if (!sweptHit || sweptHit.time > earliestTime + COLLISION_EPSILON) {
        continue;
      }
      const contact = { ...sweptHit, cell, row, column, bounds };
      if (sweptHit.time < earliestTime - COLLISION_EPSILON) {
        earliestTime = sweptHit.time;
        contacts.length = 0;
      }
      contacts.push(contact);
    }
  }

  if (contacts.length > 0) {
    const permanentContacts = contacts.filter(({ cell }) => cell === CELL_WALL);
    const activeContacts = permanentContacts.length > 0 ? permanentContacts : contacts;
    const travelX = ball.x - previousX;
    const travelY = ball.y - previousY;
    let normalX = activeContacts.reduce((sum, contact) => sum + contact.normalX, 0);
    let normalY = activeContacts.reduce((sum, contact) => sum + contact.normalY, 0);
    normalX = Math.sign(normalX || activeContacts[0].normalX);
    normalY = Math.sign(normalY || activeContacts[0].normalY);
    ball.x = previousX + travelX * earliestTime + normalX * COLLISION_EPSILON;
    ball.y = previousY + travelY * earliestTime + normalY * COLLISION_EPSILON;
    if (normalX !== 0 && ball.vx * normalX < 0) {
      ball.vx = -ball.vx;
    }
    if (normalY !== 0 && ball.vy * normalY < 0) {
      ball.vy = -ball.vy;
    }
    if (permanentContacts.length === 0) {
      awardBrick(game, activeContacts[0].row, activeContacts[0].column);
    } else {
      for (const contact of permanentContacts) breakWall(game, contact.row, contact.column);
    }
    return true;
  }

  for (let row = minimumRow; row <= maximumRow; row += 1) {
    for (let column = minimumColumn; column <= maximumColumn; column += 1) {
      const index = row * grid.columns + column;
      const cell = game.bricks[index];
      if (cell === CELL_EMPTY) continue;
      const { left, top, right, bottom } = getCellBounds(grid, row, column);
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
      } else if (cell === CELL_WALL) {
        breakWall(game, row, column);
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
  const halfHeight = paddle.height / 2;

  for (let index = game.tokens.length - 1; index >= 0 && game.status === 'playing'; index -= 1) {
    const halfWidth = paddle.width / 2;
    const token = game.tokens[index];
    token.y += token.vy * FIXED_STEP;
    const touchesPaddle =
      token.x + token.radius >= paddle.x - halfWidth &&
      token.x - token.radius <= paddle.x + halfWidth &&
      token.y + token.radius >= paddle.y - halfHeight &&
      token.y - token.radius <= paddle.y + halfHeight;

    if (touchesPaddle) {
      game.tokens.splice(index, 1);
      activatePowerup(game, token.kind);
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

  const nextVisibleCount = Math.min(MAX_VISIBLE_BALLS, game.visibleBallCount * 3);
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
  expirePowerups(game);
  updateTokens(game);
  updateBalls(game);
  updatePowerupSupply(game);
  return game;
}
