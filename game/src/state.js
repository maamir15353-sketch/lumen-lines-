// Game state for Lumen Lines v2: one level at a time, its moves, its undo stack,
// and the player's progress across all levels (stars and best moves per level,
// mute and reduced-motion preferences, kept under one save key).
// Relaxed play: no move limit, no fail screen — movesUsed is tracked against par
// for stars only. Undo is snapshot-based: before every action the whole tiles
// grid and movesUsed are pushed, so orientations, positions and move counts all
// restore exactly. It knows nothing about drawing or input; main.js drives it,
// beam.js traces it.

import { GRID, SAVE_KEY } from './config.js';
import { LEVELS } from './levels.js';
import { parseBoard, rotated, traceBeam, isRotatable, isMovable } from './beam.js';

/** Screens the game moves between. */
export const SCREEN_TITLE = 'title';
export const SCREEN_LEVELS = 'levels';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_LEVEL_DONE = 'level-done';
export const SCREEN_GAME_DONE = 'game-done';
export const SCREEN_HELP = 'help';

/** Stars for finishing a level: 3 at par, 2 within three more, else 1. */
export function starsFor(movesUsed, par) {
  if (movesUsed <= par) return 3;
  if (movesUsed <= par + 3) return 2;
  return 1;
}

/** Points for finishing a level: stars are worth 100 each, plus 10 per move under par+3. */
export function levelScore(stars, movesUsed, par) {
  return stars * 100 + Math.max(0, par + 3 - movesUsed) * 10;
}

/** A blank save: stars and best moves per level, preferences. No cumulative
 *  score is stored: the campaign score is always derived from the per-level
 *  best results (see campaignScore), so a replay can never inflate it. */
export function blankSave() {
  return { stars: LEVELS.map(() => 0), bestMoves: [], muted: false, reducedMotion: false };
}

/**
 * Coerce any parsed save (including a v2 save, whose `best` was a cumulative
 * session total) into a valid one. Stars are clamped to 0-3, best moves must be
 * a positive integer, anything else is dropped; a level with stars but no valid
 * best-moves entry is treated as solved at par. Missing/malformed fields never
 * throw and never wipe the levels that are valid.
 */
export function sanitizeSave(parsed) {
  const save = blankSave();
  if (!parsed || typeof parsed !== 'object') return save;
  if (Array.isArray(parsed.stars)) {
    for (let i = 0; i < LEVELS.length; i += 1) {
      const s = parsed.stars[i];
      save.stars[i] = Number.isInteger(s) ? Math.min(3, Math.max(0, s)) : 0;
    }
  } else {
    save.stars = LEVELS.map(() => 0);
  }
  if (Array.isArray(parsed.bestMoves)) {
    for (let i = 0; i < LEVELS.length; i += 1) {
      const m = parsed.bestMoves[i];
      if (Number.isInteger(m) && m > 0) save.bestMoves[i] = m;
      else if (save.stars[i] > 0) save.bestMoves[i] = LEVELS[i].par;
    }
  } else {
    for (let i = 0; i < LEVELS.length; i += 1) {
      if (save.stars[i] > 0) save.bestMoves[i] = LEVELS[i].par;
    }
  }
  save.muted = parsed.muted === true;
  save.reducedMotion = parsed.reducedMotion === true;
  // NOTE: a v2 `best` field is deliberately ignored — it was a session
  // accumulator (replays added to it), not a per-level best. The campaign
  // score below is the only score, derived from stars + best moves.
  return save;
}

/** Read the v2 save, tolerating missing, malformed or unavailable storage. */
export function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return blankSave();
    return sanitizeSave(JSON.parse(raw));
  } catch {
    return blankSave();
  }
}

/** Write the save; storage failure keeps progress for this visit only. */
export function writeSave(save) {
  try {
    // `best` is written for display compatibility only: it is always the
    // derived campaign score, never an accumulator.
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ ...save, best: campaignScore(save) }));
  } catch {
    // Storage can be off: progress then lasts this visit only.
  }
}

/** Stars earned on level `index` (0 when unsolved). Level ids are stable: the
 *  level's index in LEVELS, which never changes between versions. */
export function starsForLevel(save, index) {
  return save.stars[index] ?? 0;
}

/** How many campaign levels are solved, from the saved per-level results. */
export function completedCount(save) {
  return LEVELS.filter((_, i) => (save.stars[i] ?? 0) > 0).length;
}

/** True only when EVERY campaign level is solved — never from the current
 *  level's index. Solving level 12 with earlier levels unfinished is not this. */
export function isCampaignComplete(save) {
  return LEVELS.every((_, i) => (save.stars[i] ?? 0) > 0);
}

/** Total stars earned, from the saved per-level results. */
export function totalStarsEarned(save) {
  return LEVELS.reduce((sum, _, i) => sum + (save.stars[i] ?? 0), 0);
}

/** True only at 36/36 stars. Campaign completion and mastery are separate:
 *  finishing all 12 levels below 36 stars is a genuine campaign completion
 *  with mastery still open. */
export function isPerfectCampaign(save) {
  return totalStarsEarned(save) === LEVELS.length * 3;
}

/**
 * The campaign score: the sum over levels of the best valid result per level.
 * A replay replaces a level's contribution only when it is better; a worse
 * replay and a reload leave the total exactly as it was.
 */
export function campaignScore(save) {
  return LEVELS.reduce((sum, level, i) => {
    const stars = save.stars[i] ?? 0;
    if (stars <= 0) return sum;
    const bestMoves = save.bestMoves[i] ?? level.par;
    return sum + levelScore(stars, bestMoves, level.par);
  }, 0);
}

/** First unfinished level index, or -1 when the campaign is complete. */
export function nextUnfinishedIndex(save) {
  return LEVELS.findIndex((_, i) => (save.stars[i] ?? 0) <= 0);
}

/**
 * Record finishing level `index` in `movesUsed` moves. The stored best only
 * improves: a better result replaces the level's contribution, a worse replay
 * keeps the previous best. Returns { stars, score, improved } for this level.
 */
export function recordResult(save, index, movesUsed, par) {
  const stars = starsFor(movesUsed, par);
  const prevStars = save.stars[index] ?? 0;
  const prevBest = save.bestMoves[index];
  const improved = stars > prevStars || prevBest === undefined || movesUsed < prevBest;
  if (stars > prevStars) save.stars[index] = stars;
  if (prevBest === undefined || movesUsed < prevBest) save.bestMoves[index] = movesUsed;
  return { stars: save.stars[index], score: levelScore(save.stars[index], save.bestMoves[index], par), improved };
}

/** Chapters with every level complete, derived from the stars array. */
export function completedChapters(save) {
  return [0, 1, 2].map((chapter) =>
    LEVELS.filter((l) => l.chapter === chapter).every((l) => (save.stars[LEVELS.indexOf(l)] ?? 0) > 0),
  );
}

/** A fresh, playable copy of one level: tiles, trace, moves, undo history. */
export function createLevelRun(index) {
  const level = LEVELS[index];
  const board = parseBoard(level.grid, level.sourceDir, level.crystals, level.sockets);
  const run = {
    index,
    level,
    board,
    movesUsed: 0,
    undoStack: [],
    trace: traceBeam(board),
    newlyLit: new Set(),
    beamAge: 0,
    won: false,
    winPulse: 0,
    hintStage: 0,
    hintCell: null,
    hintText: '',
  };
  run.newlyLit = new Set(run.trace.lit);
  run.won = run.trace.won;
  return run;
}

/** Deep-copy the tiles grid for an undo snapshot. */
function snapshotTiles(tiles) {
  return tiles.map((row) => row.slice());
}

/** Push the pre-action state onto the undo stack. */
function pushUndo(run) {
  run.undoStack.push({ tiles: snapshotTiles(run.board.tiles), movesUsed: run.movesUsed });
}

/** Re-trace after a change and refresh win / newly-lit state. */
function afterChange(run) {
  const wasLit = new Set(run.trace.lit);
  run.trace = traceBeam(run.board);
  run.newlyLit = new Set([...run.trace.lit].filter((id) => !wasLit.has(id)));
  run.beamAge = 0;
  run.won = run.trace.won;
  if (run.won) run.winPulse = 0;
}

/**
 * Rotate the tile at (x, y) once, if it can rotate. Returns true when the board
 * changed: a snapshot is pushed first, a move is spent, and the trace is re-run.
 */
export function rotateTile(run, x, y) {
  if (run.won) return false;
  if (x < 0 || x >= GRID || y < 0 || y >= GRID) return false;
  const before = run.board.tiles[y][x];
  if (!isRotatable(before)) return false;
  pushUndo(run);
  run.board.tiles[y][x] = rotated(before);
  run.movesUsed += 1;
  afterChange(run);
  return true;
}

/**
 * Move a movable mirror from (fx, fy) to a socket (tx, ty). Costs 1 move.
 * Returns true when the mirror moved.
 */
export function moveMirror(run, fx, fy, tx, ty) {
  if (run.won) return false;
  if (!isMovable(run.board.tiles[fy]?.[fx])) return false;
  if (!run.board.sockets.some((s) => s.x === tx && s.y === ty)) return false;
  if (run.board.tiles[ty][tx] !== '.') return false;
  if (fx === tx && fy === ty) return false;
  pushUndo(run);
  run.board.tiles[ty][tx] = run.board.tiles[fy][fx];
  run.board.tiles[fy][fx] = '.';
  run.movesUsed += 1;
  afterChange(run);
  return true;
}

/** Undo the last action, restoring tiles and movesUsed exactly. */
export function undoAction(run) {
  const last = run.undoStack.pop();
  if (!last || run.won) return false;
  run.board.tiles = snapshotTiles(last.tiles);
  run.movesUsed = last.movesUsed;
  run.trace = traceBeam(run.board);
  run.newlyLit = new Set();
  run.beamAge = 0;
  run.won = run.trace.won;
  return true;
}

/** The first differing piece between the current grid and the stored solution. */
export function firstDifference(run) {
  const { grid, solution } = run.level;
  // Movable mirrors first: compare row-major lists of movable tiles.
  const cur = [];
  const sol = [];
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      if (isMovable(run.board.tiles[y][x])) cur.push({ x, y, ch: run.board.tiles[y][x] });
      if (isMovable(solution[y][x])) sol.push({ x, y, ch: solution[y][x] });
    }
  }
  for (let i = 0; i < sol.length; i += 1) {
    const c = cur[i];
    const s = sol[i];
    if (!c) return { kind: 'missing', x: s.x, y: s.y };
    if (c.x !== s.x || c.y !== s.y) {
      return { kind: 'move', x: s.x, y: s.y, fromX: c.x, fromY: c.y };
    }
    if (c.ch !== s.ch) return { kind: 'rotate', x: s.x, y: s.y, tile: 'movable mirror' };
  }
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      if (isMovable(run.board.tiles[y][x]) || isMovable(solution[y][x])) continue;
      if (run.board.tiles[y][x] !== solution[y][x]) {
        return { kind: 'rotate', x, y, tile: tileName(solution[y][x]) };
      }
    }
  }
  return null;
}

function tileName(ch) {
  if (ch === '/' || ch === '\\') return 'mirror';
  if (ch === 'P' || ch === 'p') return 'prism';
  if (ch === 'Y' || ch === 'y') return 'splitter';
  if ('^>v<'.includes(ch)) return 'combiner';
  return 'tile';
}
