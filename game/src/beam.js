// Beam tracing for Lumen Lines v2: pure logic, no drawing. Light travels PER
// CHANNEL (R=1, G=2, B=4; the source emits white 7). A beam is (cell, direction,
// channel-bit); simulation is a worklist fixed-point over a visited set keyed
// (x,y,dir,channel), so results are order-independent, loops are bounded, a
// channel arriving late still propagates, and crossing beams never merge.
//
// Tile letters (7x7 grid strings, rows top to bottom):
//   .  empty floor            S  source (emits white, direction in sourceDir)
//   X  blocker (beam ends)    C  receiver: beam passes through AND the crystal
//                                accumulates that channel
//   /  \  mirrors (rotatable) P  p  prisms, 90-degree turns (rotatable)
//   Y  y  spectral splitter (rotatable, 2 orientations): R goes straight,
//          G turns one way, B the other (Y: G=CCW, B=CW; y: G=CW, B=CCW)
//   ^ > v <  combiner (rotatable, output direction cycles clockwise): beams
//          entering from any side except the output side exit in the output
//          direction, colour unchanged; a beam entering from the output side
//          passes straight through
//   M  m  movable mirror (slash / backslash): rotatable like a mirror and
//          movable between the level's marked sockets

import { GRID } from './config.js';

/** Colour channel bits. */
export const CH_R = 1;
export const CH_G = 2;
export const CH_B = 4;
export const CH_WHITE = 7;

/** Channel colours for drawing and labels. */
export const CHANNELS = [
  { bit: CH_R, name: 'red', css: '#ff5d5d', shape: 'circle' },
  { bit: CH_G, name: 'green', css: '#4ade80', shape: 'triangle' },
  { bit: CH_B, name: 'blue', css: '#5aa2ff', shape: 'square' },
];

/** Human name for a colour mask, e.g. 3 -> "red+green". */
export function colourName(mask) {
  if (mask === 0) return 'nothing';
  if (mask === CH_WHITE) return 'white';
  return CHANNELS.filter((c) => mask & c.bit).map((c) => c.name).join('+');
}

/** Travel directions as unit steps, keyed by letter. */
export const DIRS = {
  N: { x: 0, y: -1 },
  S: { x: 0, y: 1 },
  E: { x: 1, y: 0 },
  W: { x: -1, y: 0 },
};

export const OPPOSITE = { N: 'S', S: 'N', E: 'W', W: 'E' };
export const TURN_CW = { N: 'E', E: 'S', S: 'W', W: 'N' };
export const TURN_CCW = { N: 'W', W: 'S', S: 'E', E: 'N' };

/** How a '/' mirror turns an incoming direction. */
const SLASH_TURN = { N: 'E', E: 'N', S: 'W', W: 'S' };
/** How a '\' mirror turns an incoming direction. */
const BACKSLASH_TURN = { N: 'W', W: 'N', S: 'E', E: 'S' };
/** Combiner letters by output direction. */
export const COMBINER_OUT = { '^': 'N', '>': 'E', v: 'S', '<': 'W' };
const COMBINER_CYCLE = ['^', '>', 'v', '<'];

/** Tiles a click can rotate, and the letter each rotation lands on. */
export const ROTATIONS = {
  '/': '\\',
  '\\': '/',
  P: 'p',
  p: 'P',
  Y: 'y',
  y: 'Y',
  M: 'm',
  m: 'M',
  '^': '>',
  '>': 'v',
  v: '<',
  '<': '^',
};

/** True when the tile letter can be rotated by the player. */
export function isRotatable(ch) {
  return ch in ROTATIONS;
}

/** True when the tile is a movable mirror. */
export function isMovable(ch) {
  return ch === 'M' || ch === 'm';
}

/** True when the tile is a combiner. */
export function isCombiner(ch) {
  return ch in COMBINER_OUT;
}

/** The tile letter after one click on `ch` (unchanged when it cannot rotate). */
export function rotated(ch) {
  return ROTATIONS[ch] ?? ch;
}

/**
 * Parse a level's grid rows into a board: a 2D array of tile letters plus the
 * source cell, the receiver cells (each with its required colour mask), and the
 * movable-mirror sockets. `crystals` overrides the required colour per receiver
 * (default white 7); `sockets` lists [[x,y],...] cells a movable mirror may sit on.
 */
export function parseBoard(rows, sourceDir, crystalsMeta = [], sockets = []) {
  const tiles = rows.map((row) => row.split(''));
  let source = null;
  const crystals = [];
  const metaByCell = new Map(crystalsMeta.map((c) => [`${c.x},${c.y}`, c.colour ?? CH_WHITE]));
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      if (tiles[y][x] === 'S') source = { x, y };
      if (tiles[y][x] === 'C') {
        crystals.push({ id: crystals.length, x, y, required: metaByCell.get(`${x},${y}`) ?? CH_WHITE });
      }
    }
  }
  return { tiles, source, crystals, sourceDir, sockets: sockets.map(([x, y]) => ({ x, y })) };
}

/**
 * Outgoing (direction, channel) pairs for one channel-beam entering a tile while
 * travelling `dir`. Empty when the beam ends at the tile.
 */
export function tileOutputs(tile, dir, ch) {
  switch (tile) {
    case 'X':
      return [];
    case '/':
      return [[SLASH_TURN[dir], ch]];
    case '\\':
    case 'm':
      return [[BACKSLASH_TURN[dir], ch]];
    case 'M':
      return [[SLASH_TURN[dir], ch]];
    case 'P':
      return [[TURN_CW[dir], ch]];
    case 'p':
      return [[TURN_CCW[dir], ch]];
    case 'Y':
      if (ch === CH_R) return [[dir, ch]];
      return [[ch === CH_G ? TURN_CCW[dir] : TURN_CW[dir], ch]];
    case 'y':
      if (ch === CH_R) return [[dir, ch]];
      return [[ch === CH_G ? TURN_CW[dir] : TURN_CCW[dir], ch]];
    case '^':
    case '>':
    case 'v':
    case '<': {
      const out = COMBINER_OUT[tile];
      if (dir === OPPOSITE[out]) return [[dir, ch]]; // entered from the output side: straight through
      return [[out, ch]];
    }
    default: // '.', 'S', 'C': straight through, colour unchanged
      return [[dir, ch]];
  }
}

/**
 * Trace the beams across `board` with a worklist fixed-point. Returns:
 *   segments: [{x1,y1,x2,y2,ch}] in discovery order (a cell-edge may appear
 *     once per channel travelling it);
 *   segMap: Map "x1,y1,x2,y2" -> OR of channels travelling that edge;
 *   received: Map crystal id -> OR of channels that reached it;
 *   lit: a Set of crystal ids whose received mask EXACTLY equals required;
 *   arrival: crystal ids in the order the beam first reaches them;
 *   end: 'edge' | 'blocker' | 'loop' | 'mixed' — how the beams stopped.
 */
export function traceBeam(board) {
  const segments = [];
  const segMap = new Map();
  const received = new Map(board.crystals.map((c) => [c.id, 0]));
  const arrival = [];
  const seen = new Set();
  const queue = [];
  let end = 'edge';

  for (const ch of [CH_R, CH_G, CH_B]) {
    const key = `${board.source.x},${board.source.y},${board.sourceDir},${ch}`;
    seen.add(key);
    queue.push({ x: board.source.x, y: board.source.y, dir: board.sourceDir, ch });
  }

  while (queue.length > 0) {
    const beam = queue.shift();
    const step = DIRS[beam.dir];
    const nx = beam.x + step.x;
    const ny = beam.y + step.y;
    if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) {
      segments.push({ x1: beam.x, y1: beam.y, x2: nx, y2: ny, ch: beam.ch });
      const k = `${beam.x},${beam.y},${nx},${ny}`;
      segMap.set(k, (segMap.get(k) ?? 0) | beam.ch);
      continue;
    }
    const edgeKey = `${beam.x},${beam.y},${nx},${ny}`;
    segments.push({ x1: beam.x, y1: beam.y, x2: nx, y2: ny, ch: beam.ch });
    segMap.set(edgeKey, (segMap.get(edgeKey) ?? 0) | beam.ch);
    const tile = board.tiles[ny][nx];
    if (tile === 'C') {
      const crystal = board.crystals.find((c) => c.x === nx && c.y === ny);
      if (crystal) {
        const before = received.get(crystal.id);
        if (before === 0) arrival.push(crystal.id);
        received.set(crystal.id, before | beam.ch);
      }
    }
    if (tile === 'X') {
      end = end === 'edge' ? 'blocker' : 'mixed';
      continue;
    }
    for (const [outDir, outCh] of tileOutputs(tile, beam.dir, beam.ch)) {
      const key = `${nx},${ny},${outDir},${outCh}`;
      if (seen.has(key)) {
        end = end === 'edge' ? 'loop' : end;
        continue;
      }
      seen.add(key);
      queue.push({ x: nx, y: ny, dir: outDir, ch: outCh });
    }
  }

  const lit = new Set();
  for (const crystal of board.crystals) {
    if ((received.get(crystal.id) ?? 0) === crystal.required) lit.add(crystal.id);
  }
  return { segments, segMap, received, lit, arrival, end, won: lit.size === board.crystals.length };
}

/**
 * How many rotations turn `from` into `to` for one tile (0 when already there,
 * 1 for a two-state tile flipped once, 0-3 clockwise steps for a combiner,
 * Infinity when it cannot be rotated there).
 */
export function rotationsBetween(from, to) {
  if (from === to) return 0;
  if (ROTATIONS[from] === to) return 1;
  if (isCombiner(from) && isCombiner(to)) {
    return (COMBINER_CYCLE.indexOf(to) - COMBINER_CYCLE.indexOf(from) + 4) % 4;
  }
  return Infinity;
}
