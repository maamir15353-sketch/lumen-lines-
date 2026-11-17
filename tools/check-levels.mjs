// Level checker for Lumen Lines v2: for EVERY level, verify the rows are 7x7,
// the solution grid satisfies the win (all receivers exact-match) when traced
// with the per-channel simulator, the initial grid does NOT satisfy the win,
// every solution cell is reachable from the initial cell (rotation distance
// finite for fixed rotatables; combiner clockwise steps; movable mirrors
// matched row-major between grid and solution, a position change counting 1),
// and the computed par EQUALS the listed par. Exits non-zero on any failure
// and prints a per-level line.
//
// Usage: node tools/check-levels.mjs

import { LEVELS } from '../game/src/levels.js';
import { parseBoard, traceBeam, rotationsBetween, isMovable } from '../game/src/beam.js';

let ok = true;

/** Par from grid to solution: rotations + 1 per moved movable mirror. */
function parCalc(lv) {
  const gridMov = [];
  const solMov = [];
  for (let y = 0; y < 7; y += 1) {
    for (let x = 0; x < 7; x += 1) {
      if (isMovable(lv.grid[y][x])) gridMov.push({ x, y, ch: lv.grid[y][x] });
      if (isMovable(lv.solution[y][x])) solMov.push({ x, y, ch: lv.solution[y][x] });
    }
  }
  if (gridMov.length !== solMov.length) return { par: Infinity, unreach: 1, notes: 'movable count mismatch' };
  let par = 0;
  const movedCells = new Set();
  for (let i = 0; i < gridMov.length; i += 1) {
    const g = gridMov[i];
    const s = solMov[i];
    if (g.x !== s.x || g.y !== s.y) par += 1;
    const d = rotationsBetween(g.ch, s.ch);
    if (d === Infinity) return { par: Infinity, unreach: 1, notes: 'movable rotation unreachable' };
    par += d;
    movedCells.add(`${g.x},${g.y}`);
    movedCells.add(`${s.x},${s.y}`);
  }
  let unreach = 0;
  for (let y = 0; y < 7; y += 1) {
    for (let x = 0; x < 7; x += 1) {
      if (movedCells.has(`${x},${y}`)) continue;
      const d = rotationsBetween(lv.grid[y][x], lv.solution[y][x]);
      if (d === Infinity) unreach += 1;
      else par += d;
    }
  }
  return { par, unreach, notes: '' };
}

LEVELS.forEach((lv, i) => {
  const badRows = lv.grid.some((r) => r.length !== 7) || lv.solution.some((r) => r.length !== 7)
    || lv.grid.length !== 7 || lv.solution.length !== 7;
  const start = parseBoard(lv.grid, lv.sourceDir, lv.crystals, lv.sockets);
  const solved = parseBoard(lv.solution, lv.sourceDir, lv.crystals, lv.sockets);
  const a = traceBeam(start);
  const b = traceBeam(solved);
  const { par, unreach, notes } = parCalc(lv);
  const crystalsMatch = solved.crystals.length === start.crystals.length;
  const solvedWins = b.won && b.lit.size === solved.crystals.length;
  const startLoses = !a.won;
  const parMatches = par === lv.par;
  const line = `L${i + 1} ch${lv.chapter} ${lv.name}: rows7=${!badRows} crystals=${start.crystals.length} `
    + `startWon=${a.won} solvedWon=${b.won} solvedLit=${b.lit.size}/${solved.crystals.length} `
    + `parCalc=${par} parListed=${lv.par} unreach=${unreach}${notes ? ` ${notes}` : ''}`;
  console.log(line);
  if (badRows || !crystalsMatch || !solvedWins || !startLoses || !parMatches || unreach > 0) ok = false;
});

console.log(ok ? 'ALL LEVELS OK' : 'LEVEL PROBLEMS FOUND');
process.exit(ok ? 0 : 1);
