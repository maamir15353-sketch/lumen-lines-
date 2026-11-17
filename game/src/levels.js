// The twelve levels of Lumen Lines v2, in three chapters of four: Reflection,
// Spectrum and Harmony. Each is built by construction: `solution` is a grid whose
// beam satisfies every receiver exactly, and `grid` is the same board with some
// pieces turned away from it, so every level is solvable and `par` is the fewest
// rotations (plus 1 per moved movable mirror) from `grid` to `solution`.
//
// Tile letters (one per cell, rows top to bottom):
//   .  empty floor            S  light source (direction in `sourceDir`)
//   X  blocker, swallows the beam   C  receiver: must receive EXACTLY its
//        required colour (see `crystals`: {x, y, colour}; default white 7)
//   /  \  mirrors (rotatable)  P  p  prisms, quarter turns (rotatable)
//   Y  y  spectral splitter (rotatable): red straight, green one way, blue other
//   ^ > v <  combiner (rotatable, output cycles clockwise): joins beams
//   M  m  movable mirror (rotatable AND movable between `sockets`)
//
// Colour masks: red 1, green 2, blue 4, yellow 3, magenta 5, white 7.
// `moves` is legacy only — v2 has no move limit and no fail screen.

export const LEVELS = [
  // ---- Chapter 0: Reflection (mirrors + prisms, white source, white crystals)
  {
    name: 'First Light',
    chapter: 0,
    insight: 'One click turns a mirror — the beam bends to the crystal.',
    hint: 'Click the mirror to turn it. The beam bends — light the crystal.',
    hint2: 'The mirror at column 4, row 4 must send the beam north, not south.',
    par: 1,
    moves: 7,
    sourceDir: 'E',
    grid: [
      '...C...',
      '.......',
      '.......',
      'S..\\...',
      '.......',
      '.......',
      '.......',
    ],
    solution: [
      '...C...',
      '.......',
      '.......',
      'S../...',
      '.......',
      '.......',
      '.......',
    ],
  },
  {
    name: 'Two Flames',
    chapter: 0,
    insight: 'One beam can light two crystals if it bends twice.',
    hint: 'One beam can light two crystals if it bends twice.',
    hint2: 'The beam must turn at the top-right corner, then again at the bottom-right — both mirrors matter.',
    par: 2,
    moves: 8,
    sourceDir: 'E',
    grid: [
      '.......',
      'S....C/',
      '.......',
      '.......',
      '.......',
      '.C....\\',
      '.......',
    ],
    solution: [
      '.......',
      'S....C\\',
      '.......',
      '.......',
      '.......',
      '.C..../',
      '.......',
    ],
  },
  {
    name: 'Prism Turn',
    chapter: 0,
    insight: 'A prism bends the beam a quarter turn — P clockwise, p the other way.',
    hint: 'A prism bends the beam a quarter turn. P turns clockwise, p turns the other way.',
    hint2: 'The prism at the bottom must turn the beam north, and the top mirrors must hand it across.',
    par: 3,
    moves: 9,
    sourceDir: 'E',
    grid: [
      '.......',
      '.......',
      '..\\..C\\',
      '.......',
      '..C...\\',
      '.......',
      'S.P....',
    ],
    solution: [
      '.......',
      '.......',
      '../..C\\',
      '.......',
      '..C.../',
      '.......',
      'S.p....',
    ],
  },
  {
    name: 'The Grand Circuit',
    chapter: 0,
    insight: 'One mirror can serve the beam twice — trust the loop.',
    hint: 'The final circuit of the first chapter: one mirror serves the beam twice. Trust the loop.',
    hint2: 'Follow the beam from the source: it visits the bottom mirror, comes back up, and the same mirror sends it on again.',
    par: 5,
    moves: 12,
    sourceDir: 'E',
    grid: [
      './.C/..',
      '.C.....',
      '....C..',
      'S\\C.\\..',
      '.....C.',
      '.C.....',
      './.C.\\.',
    ],
    solution: [
      './.C\\..',
      '.C.....',
      '....C..',
      'S/C./..',
      '.....C.',
      '.C.....',
      '.\\.C./.',
    ],
  },
  // ---- Chapter 1: Spectrum (coloured receivers + splitter)
  {
    name: 'First Colours',
    chapter: 1,
    insight: 'A splitter sends red straight, green one way, blue the other.',
    hint: 'The splitter at the middle splits white light: red goes straight, green turns one way, blue the other.',
    hint2: 'Each crystal needs one colour only — the splitter must send green up and blue down, not the other way round.',
    par: 1,
    moves: 7,
    sourceDir: 'E',
    crystals: [
      { x: 6, y: 3, colour: 1 },
      { x: 3, y: 0, colour: 2 },
      { x: 3, y: 6, colour: 4 },
    ],
    grid: [
      '...C...',
      '.......',
      '.......',
      'S..y..C',
      '.......',
      '.......',
      '...C...',
    ],
    solution: [
      '...C...',
      '.......',
      '.......',
      'S..Y..C',
      '.......',
      '.......',
      '...C...',
    ],
  },
  {
    name: 'Golden Crossing',
    chapter: 1,
    insight: 'Two colours can meet in one crystal — yellow needs red AND green.',
    hint: 'The golden crystal needs red and green together — two beams must cross inside it.',
    hint2: 'Red goes straight along the middle row. Green must travel up, across the top, then down through the golden crystal.',
    par: 3,
    moves: 9,
    sourceDir: 'E',
    crystals: [
      { x: 5, y: 3, colour: 3 },
      { x: 6, y: 6, colour: 4 },
    ],
    grid: [
      '..\\../.',
      '.......',
      '.......',
      'S.Y..C.',
      '.......',
      '.......',
      '../...C',
    ],
    solution: [
      '../..\\.',
      '.......',
      '.......',
      'S.Y..C.',
      '.......',
      '.......',
      '..\\...C',
    ],
  },
  {
    name: 'One Mirror, Two Lights',
    chapter: 1,
    insight: 'One mirror can serve two beams — but only in the right orientation.',
    hint: 'The mirror at column 5, row 2 serves two beams at once. Fix it and both routes open.',
    hint2: 'Red comes in from the west and green from the north — only a backslash mirror sends both where they belong.',
    par: 4,
    moves: 10,
    sourceDir: 'E',
    crystals: [
      { x: 6, y: 1, colour: 2 },
      { x: 4, y: 3, colour: 1 },
      { x: 6, y: 6, colour: 4 },
    ],
    grid: [
      '..\\./..',
      'S.Y./.C',
      '.......',
      '....C..',
      '.......',
      '.......',
      '../...C',
    ],
    solution: [
      '../.\\..',
      'S.Y.\\.C',
      '.......',
      '....C..',
      '.......',
      '.......',
      '..\\...C',
    ],
  },
  {
    name: 'Magenta Meeting',
    chapter: 1,
    insight: 'Magenta needs red and blue to meet — send blue the long way round.',
    hint: 'The magenta crystal needs red and blue together. Blue must loop around the board to meet it.',
    hint2: 'Red goes straight. Blue goes down, across the bottom, then up the right side — through the magenta crystal to its own blue crystal at the top.',
    par: 4,
    moves: 10,
    sourceDir: 'E',
    crystals: [
      { x: 5, y: 3, colour: 5 },
      { x: 4, y: 5, colour: 2 },
      { x: 5, y: 0, colour: 4 },
    ],
    grid: [
      '..\\./C.',
      '.......',
      '.......',
      'S.Y..C.',
      '.......',
      '....C..',
      '../..\\.',
    ],
    solution: [
      '../.\\C.',
      '.......',
      '.......',
      'S.Y..C.',
      '.......',
      '....C..',
      '..\\../.',
    ],
  },
  // ---- Chapter 2: Harmony (combiner + movable mirrors + combined mechanics)
  {
    name: 'Joining Lights',
    chapter: 2,
    insight: 'A combiner joins two colours into one beam — yellow is red plus green.',
    hint: 'The combiner joins the red and green beams into one yellow beam. Point its arrow east.',
    hint2: 'Red arrives from the west, green from the north — the combiner must point east, towards the yellow crystal.',
    par: 4,
    moves: 10,
    sourceDir: 'E',
    crystals: [
      { x: 6, y: 3, colour: 3 },
      { x: 6, y: 6, colour: 4 },
    ],
    grid: [
      '..\\../.',
      '.......',
      '.......',
      'S.Y..^C',
      '.......',
      '.......',
      '../...C',
    ],
    solution: [
      '../..\\.',
      '.......',
      '.......',
      'S.Y..>C',
      '.......',
      '.......',
      '..\\...C',
    ],
  },
  {
    name: 'The Wandering Mirror',
    chapter: 2,
    insight: 'Some mirrors travel — carry this one to its marked socket.',
    hint: 'Click the movable mirror to select it, then click a glowing socket to carry it there.',
    hint2: 'The mirror belongs at column 4, row 4, as a slash — it turns the beam north, up through both crystals.',
    par: 2,
    moves: 8,
    sourceDir: 'E',
    sockets: [
      [3, 3],
      [5, 5],
    ],
    grid: [
      'C..\\...',
      '...C...',
      '.......',
      'S......',
      '.......',
      '.....m.',
      '.......',
    ],
    solution: [
      'C..\\...',
      '...C...',
      '.......',
      'S..M...',
      '.......',
      '.......',
      '.......',
    ],
  },
  {
    name: 'Two Songs',
    chapter: 2,
    insight: 'Magenta is red plus blue — the combiner joins them after a long loop.',
    hint: 'Blue must travel all the way around the bottom and up the right side to join red in the combiner.',
    hint2: 'The combiner must point east. Green takes the short road across the top; blue takes the long road around.',
    par: 4,
    moves: 10,
    sourceDir: 'E',
    crystals: [
      { x: 6, y: 0, colour: 2 },
      { x: 6, y: 1, colour: 5 },
    ],
    grid: [
      '..\\...C',
      'S.Y..^C',
      '.......',
      '.......',
      '.......',
      '.......',
      '../..\\.',
    ],
    solution: [
      '../...C',
      'S.Y..>C',
      '.......',
      '.......',
      '.......',
      '.......',
      '..\\../.',
    ],
  },
  {
    name: 'The Observatory Restored',
    chapter: 2,
    insight: 'Every instrument plays at once — splitter, combiner, wandering mirror, prism.',
    hint: 'The final restoration uses everything: split the light, join red and green, and carry the wandering mirror into place.',
    hint2: 'Blue goes down, across the bottom, up the right side, and the prism turns it west to its crystal. The wandering mirror belongs at column 6, row 7 as a slash.',
    par: 6,
    moves: 12,
    sourceDir: 'E',
    crystals: [
      { x: 6, y: 3, colour: 3 },
      { x: 1, y: 1, colour: 4 },
    ],
    sockets: [
      [5, 6],
      [6, 5],
    ],
    grid: [
      '..\\./..',
      '.C...P.',
      '.......',
      'S.Y.^.C',
      '.......',
      '......m',
      '..\\....',
    ],
    solution: [
      '../.\\..',
      '.C...p.',
      '.......',
      'S.Y.>.C',
      '.......',
      '.......',
      '..\\..M.',
    ],
  },
];

/** Chapter names, in order. */
export const CHAPTERS = ['Reflection', 'Spectrum', 'Harmony'];

/** Chapter taglines for the level-select map. */
export const CHAPTER_TAGLINES = [
  'Mirrors and prisms — learn to bend the light.',
  'Colour splits and joins — every crystal is exact.',
  'All the instruments play together.',
];

/** Total crystals across all levels, for the end screen. */
export function totalCrystals() {
  let count = 0;
  for (const level of LEVELS) {
    for (const row of level.grid) for (const ch of row) if (ch === 'C') count += 1;
  }
  return count;
}
