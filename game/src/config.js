// Shared constants for Lumen Lines: grid, timing, palette and storage keys.
// One job only: numbers and colours the other modules agree on.

export const GRID = 7;
export const STEP = 1 / 60;

/** Rotations a tile needs, at most, to reach any orientation. */
export const MAX_ROTATIONS = 3;

/** How long, in seconds, the beam takes to grow across the board after a change. */
export const BEAM_GROW_SECONDS = 0.55;
/** How long a newly lit crystal sparkles before it settles. */
export const CRYSTAL_SPARKLE_SECONDS = 0.8;
/** How long the win pulse takes to travel the solved circuit, in seconds. */
export const WIN_PULSE_SECONDS = 1.6;

export const SAVE_KEY = 'lumen-lines-save-v2';
export const BEST_KEY = 'lumen-lines-best';
export const STARS_KEY = 'lumen-lines-stars';
export const MUTED_KEY = 'lumen-lines-muted';

/** Visible build identifier, shown in the top bar so a cached build is obvious. */
export const VERSION = 'v2.1';

/** How long the solved circuit is held (pulse + tones) before the result panel. */
export const WIN_CELEBRATION_SECONDS = 1.8;
/** The same hold with reduced motion: no pulse to wait for, just a beat. */
export const WIN_CELEBRATION_REDUCED_SECONDS = 0.6;

export const PALETTE = {
  background: '#0b1026',
  backgroundGlow: '#141b3d',
  panel: '#121832',
  panelEdge: '#2a3468',
  gridLine: '#232c5c',
  tile: '#171e42',
  tileHover: '#222b5e',
  text: '#eef1ff',
  textDim: '#9aa5d6',
  textFaint: '#6b76ab',
  beam: '#ffd166',
  beamCore: '#fff3c4',
  crystal: '#7ef0e0',
  crystalLit: '#8affd8',
  mirror: '#cdd6ff',
  prism: '#ff9ecf',
  blocker: '#4a5478',
  source: '#ffb703',
  danger: '#ff6b6b',
  good: '#7cf2a0',
  gold: '#ffd166',
  starEmpty: '#3a4472',
  red: '#ff5d5d',
  green: '#4ade80',
  blue: '#5aa2ff',
  splitter: '#e8b4ff',
  combiner: '#ffd166',
  socket: '#7ef0e0',
};
