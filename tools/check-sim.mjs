// Simulator unit checks for Lumen Lines v2, run in node against beam.js:
// mirror reflections from all 4 entry directions for / and \; splitter outputs
// for R/G/B/white from all 4 entry directions in both orientations; combiner
// merging (two channels in, combined out; exact-match receiver with excess
// colour inactive; crossing beams not combining); a cyclic loop terminating
// (visited bound) and still propagating a newly arriving channel; simultaneous
// activation of several receivers.
//
// Usage: node tools/check-sim.mjs — exits non-zero on any failure.

import {
  parseBoard, traceBeam, tileOutputs, CH_R, CH_G, CH_B, CH_WHITE, colourName,
} from '../game/src/beam.js';

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
function eq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// --- Mirrors: every entry direction, both orientations ----------------------
const SLASH = { N: 'E', E: 'N', S: 'W', W: 'S' };
const BACKSLASH = { N: 'W', W: 'N', S: 'E', E: 'S' };
for (const dir of ['N', 'S', 'E', 'W']) {
  check(`mirror / turns ${dir} -> ${SLASH[dir]}`, eq(tileOutputs('/', dir, CH_R), [[SLASH[dir], CH_R]]));
  check(`mirror \\ turns ${dir} -> ${BACKSLASH[dir]}`, eq(tileOutputs('\\', dir, CH_R), [[BACKSLASH[dir], CH_R]]));
}

// --- Prisms -----------------------------------------------------------------
check('prism P turns N -> E (clockwise)', eq(tileOutputs('P', 'N', CH_R), [['E', CH_R]]));
check('prism p turns N -> W (counter-clockwise)', eq(tileOutputs('p', 'N', CH_R), [['W', CH_R]]));

// --- Splitter: R/G/B/white from all 4 entries, both orientations -----------
const CW = { N: 'E', E: 'S', S: 'W', W: 'N' };
const CCW = { N: 'W', W: 'S', S: 'E', E: 'N' };
for (const dir of ['N', 'S', 'E', 'W']) {
  check(`splitter Y red ${dir} -> straight`, eq(tileOutputs('Y', dir, CH_R), [[dir, CH_R]]));
  check(`splitter Y green ${dir} -> ${CCW[dir]} (CCW)`, eq(tileOutputs('Y', dir, CH_G), [[CCW[dir], CH_G]]));
  check(`splitter Y blue ${dir} -> ${CW[dir]} (CW)`, eq(tileOutputs('Y', dir, CH_B), [[CW[dir], CH_B]]));
  check(`splitter y green ${dir} -> ${CW[dir]} (CW)`, eq(tileOutputs('y', dir, CH_G), [[CW[dir], CH_G]]));
  check(`splitter y blue ${dir} -> ${CCW[dir]} (CCW)`, eq(tileOutputs('y', dir, CH_B), [[CCW[dir], CH_B]]));
}
// A white beam through a splitter splits into three channel-beams.
{
  const board = parseBoard(
    ['.......', '.......', '.......', 'S.Y....', '.......', '.......', '.......'],
    'E',
  );
  const trace = traceBeam(board);
  const outDirs = new Set(trace.segments.filter((s) => s.x1 === 2 && s.y1 === 3).map((s) => `${s.ch}:${s.x2},${s.y2}`));
  check('white beam splits into R straight, G up, B down', outDirs.has('1:3,3') && outDirs.has('2:2,2') && outDirs.has('4:2,4'), [...outDirs].join(' '));
}

// --- Combiner ---------------------------------------------------------------
check('combiner > sends west entry east', eq(tileOutputs('>', 'E', CH_R), [['E', CH_R]]));
check('combiner > sends north entry east', eq(tileOutputs('>', 'S', CH_G), [['E', CH_G]]));
check('combiner > sends south entry east', eq(tileOutputs('>', 'N', CH_B), [['E', CH_B]]));
check('combiner > passes east entry straight through (west)', eq(tileOutputs('>', 'W', CH_R), [['W', CH_R]]));
check('combiner ^ sends east entry north', eq(tileOutputs('^', 'E', CH_R), [['N', CH_R]]));

// Combiner merging: red from the west + green from the north exit east together
// into a yellow receiver, while a blue beam crossing the same cell does not join.
{
  const board = parseBoard(
    ['../..\\.', '.......', '.......', 'S.Y..>C', '.......', '.......', '..\\...C'],
    'E',
    [{ x: 6, y: 3, colour: 3 }, { x: 6, y: 6, colour: 4 }],
  );
  const trace = traceBeam(board);
  const yellow = trace.received.get(0);
  check('combiner merges red+green into yellow (mask 3)', yellow === 3, `received=${yellow} (${colourName(yellow ?? 0)})`);
  check('yellow receiver active (exact match)', trace.lit.has(0));
}

// Exact-match receiver: excess colour keeps it inactive.
{
  const board = parseBoard(
    ['...C...', '.......', '.......', 'S..Y..C', '.......', '.......', '...C...'],
    'E',
    [{ x: 6, y: 3, colour: 1 }, { x: 3, y: 0, colour: 2 }, { x: 3, y: 6, colour: 4 }],
  );
  const trace = traceBeam(board);
  check('all three split receivers active at once', trace.won && trace.lit.size === 3);
  // Same board, but the red receiver now demands white: red alone is not enough.
  const board2 = parseBoard(
    ['...C...', '.......', '.......', 'S..Y..C', '.......', '.......', '...C...'],
    'E',
    [{ x: 6, y: 3, colour: CH_WHITE }, { x: 3, y: 0, colour: 2 }, { x: 3, y: 6, colour: 4 }],
  );
  const trace2 = traceBeam(board2);
  // Crystal ids are row-major: (3,0) is id 0, the red receiver (6,3) is id 1.
  check('red-only beam does not satisfy a white receiver (excess rule)', !trace2.lit.has(1) && trace2.received.get(1) === 1);
}

// Crossing beams do not combine: a red beam travelling east crosses a green
// beam travelling south at (4,3); each keeps its own colour and its own
// receiver, and no edge carries both channels.
{
  const board = parseBoard(
    ['../.\\..', '.......', '.......', 'S.Y...C', '.......', '.......', '....C..'],
    'E',
    [{ x: 6, y: 3, colour: 1 }, { x: 4, y: 6, colour: 2 }],
  );
  const t = traceBeam(board);
  check('red receiver gets red only at the crossing', t.received.get(0) === 1, `received=${t.received.get(0)}`);
  check('green receiver gets green only at the crossing', t.received.get(1) === 2, `received=${t.received.get(1)}`);
  check('crossing edges stay single-channel', t.segMap.get('3,3,4,3') === 1
    && t.segMap.get('4,2,4,3') === 2 && t.segMap.get('4,3,4,4') === 2 && t.segMap.get('4,3,5,3') === 1);
  check('both crossing receivers active at once', t.won);
}

// --- Loop: terminates, and a newly arriving channel still propagates --------
// A closed 2x2 mirror loop, fed by a source inside it: the beam goes round
// until the visited set stops it, and the trace finishes.
{
  const loop = parseBoard(
    ['.......', './.\\...', '.S.....', '.\\./...', '.......', '.......', '.......'],
    'S',
  );
  const t = traceBeam(loop);
  check('mirror loop terminates (bounded segments)', t.segments.length < 200, `${t.segments.length} segments`);
  check('loop trace still ends somewhere definite', ['edge', 'blocker', 'loop', 'mixed'].includes(t.end));
}
// A channel arriving late at a cell another channel already crossed must still
// propagate: red crosses (5,3) travelling east first; green arrives there
// travelling south by the long way round and must still reach its crystal.
{
  const late = parseBoard(
    ['../..\\.', '.......', '.......', 'S.Y....', '.......', '.....C.', '.......'],
    'E',
    [{ x: 5, y: 5, colour: 2 }],
  );
  const t2 = traceBeam(late);
  check('late channel still propagates past a crossed cell', t2.received.get(0) === 2, `received=${t2.received.get(0)}`);
}

// --- Simultaneous activation -------------------------------------------------
{
  const board = parseBoard(
    ['...C...', '.......', '.......', 'S..Y..C', '.......', '.......', '...C...'],
    'E',
    [{ x: 6, y: 3, colour: 1 }, { x: 3, y: 0, colour: 2 }, { x: 3, y: 6, colour: 4 }],
  );
  const trace = traceBeam(board);
  check('simultaneous activation: all receivers lit in one trace', trace.won);
  check('arrival order lists all three receivers', trace.arrival.length === 3, trace.arrival.join(','));
}

const failed = results.filter((r) => !r.passed).length;
console.log(`\n${results.length - failed}/${results.length} sim checks passed`);
process.exit(failed === 0 ? 0 : 1);
