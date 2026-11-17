// The screenshot scenes behind ?shot=solved|carry|partial|finale. Each one sets
// up a real game state through the same rules a player uses — a level is started,
// tiles are rotated and mirrors moved with rotateTile/moveMirror, and the beam is
// fully grown — so the frame is what a real game looks like, and the same seed
// always gives the same frame.

import { LEVELS } from './levels.js';
import {
  createLevelRun, rotateTile, moveMirror, levelScore,
  SCREEN_TITLE, SCREEN_PLAY, SCREEN_LEVELS, SCREEN_LEVEL_DONE, SCREEN_GAME_DONE,
} from './state.js';

/** Stars/best-moves for a save where only the given levels are solved at par. */
function partialSave(solvedIndexes) {
  const stars = LEVELS.map(() => 0);
  const bestMoves = LEVELS.map(() => undefined);
  for (const i of solvedIndexes) {
    stars[i] = 3;
    bestMoves[i] = LEVELS[i].par;
  }
  return { stars, bestMoves };
}

/**
 * Stage the named scene and return the view's screen, the level run to draw, and
 * any end-of-level numbers (stars and points) the scene should show.
 */
export function stageShot(name) {
  if (name === 'solved') {
    // Level 5, "First Colours", solved at par: the coloured circuit stays
    // visible behind the result panel in the side panel.
    const run = createLevelRun(4);
    rotateTile(run, 3, 3);
    run.beamAge = 1;
    run.winPulse = 1;
    const save = partialSave([4]);
    return {
      screen: SCREEN_LEVEL_DONE, run, lastStars: 3,
      lastScore: levelScore(3, 1, 1), stars: save.stars, bestMoves: save.bestMoves,
    };
  }
  if (name === 'carry') {
    // Level 10, "The Wandering Mirror": the mirror is being carried, the
    // destination socket is selected, the ghost preview shows where it lands.
    const run = createLevelRun(9);
    run.beamAge = 1;
    return {
      screen: SCREEN_PLAY, run, lastStars: 0, lastScore: 0,
      carry: { x: 5, y: 5, ch: 'm' },
      selected: { x: 3, y: 3 },
      carryMessage: '',
    };
  }
  if (name === 'partial') {
    // The chapter map after solving ONLY level 12: 1 of 12 levels restored,
    // no campaign-complete claim anywhere.
    const run = createLevelRun(11);
    run.beamAge = 1;
    const save = partialSave([11]);
    return {
      screen: SCREEN_LEVELS, run, lastStars: 0, lastScore: 0,
      stars: save.stars, bestMoves: save.bestMoves,
    };
  }
  if (name === 'finale') {
    // The whole campaign solved at par: 3 stars a level, 330 points a level.
    const run = createLevelRun(11);
    rotateTile(run, 2, 0);
    rotateTile(run, 4, 0);
    rotateTile(run, 5, 1);
    rotateTile(run, 4, 3);
    moveMirror(run, 6, 5, 5, 6);
    rotateTile(run, 5, 6);
    run.beamAge = 1;
    const stars = LEVELS.map(() => 3);
    const bestMoves = LEVELS.map((l) => l.par);
    const score = LEVELS.reduce((sum, level) => sum + levelScore(3, level.par, level.par), 0);
    return { screen: SCREEN_GAME_DONE, run, lastStars: 3, lastScore: 0, stars, bestMoves, score };
  }
  if (name === 'spectrum') {
    // Level 7, "One Mirror, Two Lights": three of four pieces turned right —
    // the green and red branches are lit, the blue branch is still dark.
    const run = createLevelRun(6);
    rotateTile(run, 2, 0);
    rotateTile(run, 4, 0);
    rotateTile(run, 4, 1);
    run.beamAge = 1;
    return { screen: SCREEN_PLAY, run, lastStars: 0, lastScore: 0 };
  }
  if (name === 'harmony') {
    // Level 12, "The Observatory Restored": four of six moves done — the
    // combiner joins red and green into yellow, blue still waits on its mirror.
    const run = createLevelRun(11);
    rotateTile(run, 2, 0);
    rotateTile(run, 4, 0);
    rotateTile(run, 5, 1);
    rotateTile(run, 4, 3);
    run.beamAge = 1;
    return { screen: SCREEN_PLAY, run, lastStars: 0, lastScore: 0 };
  }
  // 'start' and anything else: the title over level 1, its beam grown and glowing.
  const run = createLevelRun(0);
  run.beamAge = 1;
  return { screen: SCREEN_TITLE, run, lastStars: 0, lastScore: 0 };
}

export { LEVELS };
