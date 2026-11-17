// Boot and the one loop for Lumen Lines v2.1: input is read every frame, the beam
// grows over half a second after each rotation, and the renderer paints what is
// there. The game moves between seven screens: title, level select, play, paused,
// help, level done and game done. Relaxed play: no move limit, no fail screen.
//
// Scoring is derived, never accumulated: the campaign score is the sum of the
// best valid result per level (see state.js), so replaying a level can never
// inflate it, a better result replaces that level's contribution, and a reload
// shows exactly the same totals. Campaign completion is derived from ALL
// levels being solved — solving level 12 alone is just one level done.
//
// A win holds the solved circuit briefly (pulse + crystal tones, skippable)
// before the result panel appears; the panel lives in the side panel so the
// solved board stays visible, and "View solution" dismisses it to admire the
// circuit. The board is frozen once a level is won: no more moves or points.
//
// ?shot=start|spectrum|harmony|finale stages that scene instead of running the
// loop, paints it twice and sets window.__shotReady for a screenshot.

import { GRID, STEP, BEAM_GROW_SECONDS, WIN_PULSE_SECONDS, WIN_CELEBRATION_SECONDS, WIN_CELEBRATION_REDUCED_SECONDS, BEST_KEY, STARS_KEY } from './config.js';
import { LEVELS } from './levels.js';
import {
  createLevelRun, rotateTile, moveMirror, undoAction, levelScore, starsFor,
  readSave, writeSave, firstDifference, recordResult,
  campaignScore, completedCount, isCampaignComplete, isPerfectCampaign,
  nextUnfinishedIndex, totalStarsEarned,
  SCREEN_TITLE, SCREEN_LEVELS, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_HELP,
  SCREEN_LEVEL_DONE, SCREEN_GAME_DONE,
} from './state.js';
import { createAudio } from './audio.js';
import {
  createInput,
  ACTION_CONFIRM, ACTION_ROTATE, ACTION_UNDO, ACTION_RESTART,
  ACTION_MENU, ACTION_MUTE, ACTION_NEXT, ACTION_LEVELS,
  ACTION_HINT, ACTION_CARRY, ACTION_HELP, ACTION_REDUCED,
} from './input.js';
import { createRenderer, STAGE_WIDTH, STAGE_HEIGHT, titleHelpButtonRect } from './render.js';
import { isMovable, isRotatable } from './beam.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');

const canvas = document.getElementById('game');
const status = document.getElementById('status');
canvas.width = STAGE_WIDTH;
canvas.height = STAGE_HEIGHT;

const save = readSave();
const reducedMotionDefault =
  save.reducedMotion === true ||
  (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const audio = createAudio(save);
const renderer = createRenderer(canvas);

function runShot(name) {
  const scene = stageShot(name);
  const shotSave = {
    stars: scene.stars ?? save.stars,
    bestMoves: scene.bestMoves ?? save.bestMoves,
  };
  const view = {
    screen: scene.screen,
    run: scene.run,
    levels: LEVELS,
    stars: shotSave.stars,
    bestMoves: shotSave.bestMoves,
    score: campaignScore(shotSave),
    best: campaignScore(shotSave),
    totalStars: totalStarsEarned(shotSave),
    completedCount: completedCount(shotSave),
    campaignComplete: isCampaignComplete(shotSave),
    perfect: isPerfectCampaign(shotSave),
    nextUnfinished: nextUnfinishedIndex(shotSave),
    lastStars: scene.lastStars,
    lastScore: scene.lastScore,
    muted: audio.muted,
    reducedMotion: reducedMotionDefault,
    selected: scene.selected ?? { x: 3, y: 3 },
    hover: null,
    carry: scene.carry ?? null,
    selectedMovable: scene.selectedMovable ?? null,
    carryMessage: scene.carryMessage ?? '',
    celebrating: false,
    resultHidden: false,
  };
  let painted = 0;
  function paint() {
    renderer.draw(view);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let helpReturn = SCREEN_TITLE;
  let run = createLevelRun(0);
  let lastStars = 0;
  let lastScore = 0;
  let lastResultScreen = SCREEN_LEVEL_DONE;
  let selected = { x: 3, y: 3 };
  let hover = null;
  let carry = null; // {x, y, ch} — the movable mirror being carried, or null
  let selectedMovable = null; // {x, y} — the movable mirror selected by click, or null
  let carryMessage = '';
  let reducedMotion = reducedMotionDefault;
  let celebrating = false;
  let celebrationT = 0;
  let resultShown = false; // the win has already produced its result panel
  let resultHidden = false; // result panel dismissed to view the solved board
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function persist() {
    writeSave({
      stars: save.stars,
      bestMoves: save.bestMoves,
      muted: audio.muted,
      reducedMotion,
    });
  }

  function clearHint() {
    run.hintStage = 0;
    run.hintCell = null;
    run.hintText = '';
  }

  function startLevel(index) {
    run = createLevelRun(index);
    selected = { x: run.board.source.x, y: run.board.source.y };
    carry = null;
    selectedMovable = null;
    carryMessage = '';
    celebrating = false;
    celebrationT = 0;
    resultShown = false;
    resultHidden = false;
    clearHint();
    screen = SCREEN_PLAY;
    if (reducedMotion) run.beamAge = 1;
    announce(`Level ${index + 1}, ${run.level.name}. ${run.board.crystals.length} crystals. Par ${run.level.par}.`);
  }

  /**
   * Record the win and show its result. Called only after the celebration
   * hold, so the completion state is saved BEFORE the finale is displayed.
   * The finale appears only when every level is solved — never because the
   * level just solved happens to be number 12.
   */
  function finishLevel() {
    const result = recordResult(save, run.index, run.movesUsed, run.level.par);
    lastStars = result.stars;
    lastScore = result.score;
    persist();
    const done = completedCount(save);
    const campaignDone = isCampaignComplete(save);
    lastResultScreen = campaignDone ? SCREEN_GAME_DONE : SCREEN_LEVEL_DONE;
    screen = lastResultScreen;
    resultHidden = false;
    if (campaignDone) {
      audio.fanfare();
      announce(
        isPerfectCampaign(save)
          ? `Campaign complete — a perfect campaign, 36 of 36 stars. Final score ${campaignScore(save)}.`
          : `Campaign complete — all ${LEVELS.length} levels restored, ${totalStarsEarned(save)} of 36 stars. Final score ${campaignScore(save)}.`,
      );
    } else {
      announce(`Level complete. ${lastStars} stars, ${lastScore} points. ${done} of ${LEVELS.length} levels restored.`);
    }
  }

  /** End the celebration hold and show the result (persisted first). */
  function showResult() {
    if (!celebrating) return;
    celebrating = false;
    finishLevel();
  }

  /** After a successful board action: sounds, win check, celebration start. */
  function afterAction() {
    if (run.newlyLit.size > 0) {
      for (const id of run.newlyLit) audio.crystal(id);
    }
    if (run.won && !celebrating && !resultShown) {
      celebrating = true;
      celebrationT = 0;
      resultShown = true;
      audio.winPhrase(run.trace.arrival);
      announce('Solved! The circuit holds for a moment…');
    }
  }

  /** Cycle the hint through its 3 stages for the current level. Hints are
   *  free: they never cost moves, stars or points. */
  function showHint() {
    run.hintStage = (run.hintStage % 3) + 1;
    const diff = firstDifference(run);
    if (run.hintStage === 1) {
      run.hintText = run.level.hint;
      run.hintCell = diff ? { x: diff.x, y: diff.y } : null;
    } else if (run.hintStage === 2) {
      run.hintText = run.level.hint2;
      run.hintCell = diff ? { x: diff.x, y: diff.y } : null;
    } else if (!diff) {
      run.hintText = 'The pieces already match the solution — every receiver should be lit.';
      run.hintCell = null;
    } else if (diff.kind === 'move') {
      run.hintText = `Move the mirror to the marked socket at column ${diff.x + 1}, row ${diff.y + 1}.`;
      run.hintCell = { x: diff.x, y: diff.y };
    } else {
      run.hintText = `Rotate the ${diff.tile} at column ${diff.x + 1}, row ${diff.y + 1}.`;
      run.hintCell = { x: diff.x, y: diff.y };
    }
    announce(`Hint ${run.hintStage} of 3 (free — no score penalty). ${run.hintText}`);
  }

  /** Pick up the movable mirror at (x, y): enters carry mode, costs no move. */
  function pickUpMirror(x, y) {
    const tile = run.board.tiles[y]?.[x];
    if (!isMovable(tile)) return false;
    carry = { x, y, ch: tile };
    selected = { x, y };
    selectedMovable = null;
    carryMessage = '';
    audio.carry();
    announce('Carrying the mirror. Click a glowing socket to place it, or Cancel (Esc) to put it back — picking up costs no move.');
    return true;
  }

  /** Put the carried mirror back where it was: no move spent, board unchanged. */
  function cancelCarry() {
    if (!carry) {
      selectedMovable = null;
      carryMessage = '';
      return;
    }
    carry = null;
    carryMessage = '';
    audio.tick();
    announce('Carry cancelled. The mirror is back where it was — no move spent.');
  }

  /** Drop the carried mirror on the selected cell, if it is a free socket. */
  function dropCarried() {
    if (!carry) return false;
    const onSocket = run.board.sockets.some((s) => s.x === selected.x && s.y === selected.y);
    if (selected.x === carry.x && selected.y === carry.y) {
      cancelCarry();
      return false;
    }
    if (!onSocket) {
      carryMessage = 'That cell can’t hold a mirror — only the glowing sockets can.';
      audio.thud();
      announce(carryMessage);
      return false;
    }
    if (run.board.tiles[selected.y][selected.x] !== '.') {
      carryMessage = 'That socket is already taken. Choose another glowing socket, or Cancel (Esc).';
      audio.thud();
      announce(carryMessage);
      return false;
    }
    if (moveMirror(run, carry.x, carry.y, selected.x, selected.y)) {
      audio.carry();
      carry = null;
      carryMessage = '';
      clearHint();
      afterAction();
      return true;
    }
    audio.thud();
    return false;
  }

  function handleCellClick(x, y) {
    // The board is frozen once solved: clicks change nothing, add no moves.
    if (run.won) return;
    selected = { x, y };
    const tile = run.board.tiles[y][x];
    // Carrying: a socket click drops the mirror; its home cell puts it back;
    // anything else explains itself and stays in carry mode.
    if (carry) {
      const isSocket = run.board.sockets.some((s) => s.x === x && s.y === y);
      if (x === carry.x && y === carry.y) {
        cancelCarry();
        return;
      }
      if (isSocket) {
        selected = { x, y };
        dropCarried();
        return;
      }
      carryMessage = 'That cell can’t hold a mirror — only the glowing sockets can.';
      audio.thud();
      announce(carryMessage);
      return;
    }
    // Clicking a socket while a movable mirror is selected moves it there.
    const isSocket = run.board.sockets.some((s) => s.x === x && s.y === y);
    if (isSocket && selectedMovable && !(selectedMovable.x === x && selectedMovable.y === y)) {
      if (moveMirror(run, selectedMovable.x, selectedMovable.y, x, y)) {
        audio.carry();
        selectedMovable = null;
        carryMessage = '';
        clearHint();
        afterAction();
      }
      return;
    }
    if (isMovable(tile)) {
      // First click selects (sockets glow, actions appear below the board);
      // a second click on it rotates it.
      if (selectedMovable && selectedMovable.x === x && selectedMovable.y === y) {
        if (rotateTile(run, x, y)) {
          audio.click();
          clearHint();
          afterAction();
        }
        selectedMovable = null;
        carryMessage = '';
      } else {
        selectedMovable = { x, y };
        carryMessage = '';
        audio.tick();
        announce('Wandering mirror selected. Rotate turns it, Move carries it to a socket, Cancel lets go.');
      }
      return;
    }
    selectedMovable = null;
    carryMessage = '';
    if (isRotatable(tile)) {
      if (rotateTile(run, x, y)) {
        audio.click();
        clearHint();
        afterAction();
      }
    } else {
      audio.thud();
    }
  }

  function nextUnfinishedOrLevels() {
    const next = nextUnfinishedIndex(save);
    if (next >= 0) startLevel(next);
    else screen = SCREEN_LEVELS;
  }

  function handleClick(point) {
    const hit = renderer.hitTest(point, view());
    if (!hit) return;
    if (hit.kind === 'cell' && screen === SCREEN_PLAY) {
      handleCellClick(hit.x, hit.y);
      return;
    }
    if (hit.kind === 'button') {
      if (hit.id === 'undo' && screen === SCREEN_PLAY) {
        if (undoAction(run)) {
          audio.click();
          clearHint();
        }
      } else if (hit.id === 'hint' && screen === SCREEN_PLAY) {
        showHint();
      } else if (hit.id === 'restart' && screen === SCREEN_PLAY) {
        startLevel(run.index);
      } else if (hit.id === 'levels') {
        screen = SCREEN_LEVELS;
      } else if (hit.id === 'sound') {
        audio.toggleMuted();
        persist();
      } else if (hit.id === 'mirror-rotate' && screen === SCREEN_PLAY) {
        if (selectedMovable && rotateTile(run, selectedMovable.x, selectedMovable.y)) {
          audio.click();
          clearHint();
          selectedMovable = null;
          carryMessage = '';
          afterAction();
        }
      } else if (hit.id === 'mirror-carry' && screen === SCREEN_PLAY) {
        if (selectedMovable) pickUpMirror(selectedMovable.x, selectedMovable.y);
      } else if (hit.id === 'mirror-cancel' && screen === SCREEN_PLAY) {
        cancelCarry();
      } else if (hit.id === 'show-result' && screen === SCREEN_PLAY) {
        screen = lastResultScreen;
        resultHidden = false;
      } else if (hit.id === 'replay' && screen === SCREEN_LEVEL_DONE) {
        startLevel(run.index);
      } else if (hit.id === 'next' && screen === SCREEN_LEVEL_DONE) {
        nextUnfinishedOrLevels();
      } else if (hit.id === 'solution' && screen === SCREEN_LEVEL_DONE) {
        // Dismiss the panel; the solved circuit stays visible, frozen.
        screen = SCREEN_PLAY;
        resultHidden = true;
        announce('Viewing the solved circuit. Press Enter to show the result.');
      } else if (hit.id === 'view-observatory' && screen === SCREEN_LEVELS) {
        screen = SCREEN_GAME_DONE;
        announce('The restored observatory.');
      } else if (hit.id === 'finale-levels' && screen === SCREEN_GAME_DONE) {
        screen = SCREEN_LEVELS;
      } else if (hit.id === 'finale-replay' && screen === SCREEN_GAME_DONE) {
        startLevel(0);
      }
      return;
    }
    if (hit.kind === 'level') {
      audio.click();
      startLevel(hit.index);
    }
  }

  function view() {
    return {
      screen,
      helpReturn,
      run,
      levels: LEVELS,
      stars: save.stars,
      bestMoves: save.bestMoves,
      score: campaignScore(save),
      best: campaignScore(save),
      totalStars: totalStarsEarned(save),
      completedCount: completedCount(save),
      campaignComplete: isCampaignComplete(save),
      perfect: isPerfectCampaign(save),
      nextUnfinished: nextUnfinishedIndex(save),
      lastStars,
      lastScore,
      muted: audio.muted,
      reducedMotion,
      selected,
      hover,
      carry,
      selectedMovable,
      carryMessage,
      celebrating,
      resultHidden,
    };
  }

  function handleActions() {
    const actions = input.takeActions();
    const delta = input.takeCursorDelta();
    // Any key or click during the celebration hold skips straight to the result.
    if (celebrating) {
      if (actions !== 0 || delta.x !== 0 || delta.y !== 0) showResult();
      return;
    }
    if (delta.x !== 0 || delta.y !== 0) {
      selected = {
        x: Math.min(GRID - 1, Math.max(0, selected.x + delta.x)),
        y: Math.min(GRID - 1, Math.max(0, selected.y + delta.y)),
      };
      audio.tick();
    }
    if (actions & ACTION_MUTE) {
      audio.toggleMuted();
      persist();
    }
    if (actions & ACTION_REDUCED) {
      reducedMotion = !reducedMotion;
      if (reducedMotion) run.beamAge = 1;
      persist();
      announce(reducedMotion ? 'Reduced motion on.' : 'Reduced motion off.');
    }
    if (actions & ACTION_HELP) {
      if (screen === SCREEN_HELP) screen = helpReturn;
      else if (screen === SCREEN_TITLE || screen === SCREEN_PLAY || screen === SCREEN_LEVELS) {
        helpReturn = screen;
        screen = SCREEN_HELP;
      }
      return;
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_HINT) {
        helpReturn = SCREEN_TITLE;
        screen = SCREEN_HELP;
        return;
      }
      if (actions & ACTION_CONFIRM) {
        screen = SCREEN_LEVELS;
        announce('Choose a level.');
      }
      return;
    }
    if (screen === SCREEN_LEVELS) {
      if (actions & ACTION_HINT) {
        helpReturn = SCREEN_LEVELS;
        screen = SCREEN_HELP;
        return;
      }
      if (actions & ACTION_MENU) screen = SCREEN_TITLE;
      if (actions & ACTION_LEVELS) screen = SCREEN_TITLE;
      return;
    }
    if (screen === SCREEN_HELP) {
      if (actions & (ACTION_MENU | ACTION_CONFIRM)) screen = helpReturn;
      return;
    }
    if (screen === SCREEN_PLAY) {
      // Viewing a solved board: only Enter (show result) and L (levels) act.
      if (resultHidden) {
        if (actions & ACTION_CONFIRM) {
          screen = lastResultScreen;
          resultHidden = false;
        } else if (actions & ACTION_MENU) {
          screen = lastResultScreen;
          resultHidden = false;
        } else if (actions & ACTION_LEVELS) {
          screen = SCREEN_LEVELS;
        }
        return;
      }
      if (carry && (actions & ACTION_MENU)) {
        cancelCarry();
        return;
      }
      if (actions & ACTION_MENU) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
        return;
      }
      if (actions & ACTION_LEVELS) {
        screen = SCREEN_LEVELS;
        announce('Choose a level.');
        return;
      }
      if (actions & ACTION_RESTART) {
        startLevel(run.index);
        return;
      }
      if (actions & ACTION_UNDO) {
        if (undoAction(run)) {
          audio.click();
          clearHint();
        }
        return;
      }
      if (actions & ACTION_HINT) {
        showHint();
        return;
      }
      if (actions & ACTION_CARRY) {
        if (carry) {
          cancelCarry();
        } else if (isMovable(run.board.tiles[selected.y]?.[selected.x])) {
          pickUpMirror(selected.x, selected.y);
        } else {
          audio.thud();
        }
        return;
      }
      if (actions & ACTION_ROTATE) {
        if (carry) {
          dropCarried();
          return;
        }
        if (rotateTile(run, selected.x, selected.y)) {
          audio.click();
          clearHint();
          afterAction();
        } else {
          audio.thud();
        }
      }
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_MENU | ACTION_CONFIRM)) screen = SCREEN_PLAY;
      else if (actions & ACTION_LEVELS) screen = SCREEN_LEVELS;
      else if (actions & ACTION_RESTART) startLevel(run.index);
      return;
    }
    if (screen === SCREEN_LEVEL_DONE) {
      if (actions & ACTION_NEXT) nextUnfinishedOrLevels();
      else if (actions & ACTION_RESTART) startLevel(run.index);
      else if (actions & ACTION_CARRY) {
        screen = SCREEN_PLAY;
        resultHidden = true;
        announce('Viewing the solved circuit. Press Enter to show the result.');
      } else if (actions & ACTION_MENU) screen = SCREEN_LEVELS;
      else if (actions & ACTION_CONFIRM) nextUnfinishedOrLevels();
      return;
    }
    if (screen === SCREEN_GAME_DONE) {
      if (actions & (ACTION_CONFIRM | ACTION_MENU | ACTION_NEXT | ACTION_LEVELS)) {
        screen = SCREEN_LEVELS;
        announce('Choose a level.');
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const elapsed = Math.min((now - last) / 1000, 0.25);
    last = now;
    if (reducedMotion) {
      run.beamAge = 1;
    } else if (screen === SCREEN_PLAY || screen === SCREEN_TITLE) {
      run.beamAge = Math.min(1, run.beamAge + elapsed / BEAM_GROW_SECONDS);
    }
    if (run.won && !reducedMotion && run.winPulse < 1) {
      run.winPulse = Math.min(1, run.winPulse + elapsed / WIN_PULSE_SECONDS);
    }
    if (celebrating) {
      celebrationT += elapsed;
      const hold = reducedMotion ? WIN_CELEBRATION_REDUCED_SECONDS : WIN_CELEBRATION_SECONDS;
      if (celebrationT >= hold) showResult();
    }
    const point = input.takeClickedPoint();
    if (point) {
      // A click during the celebration hold skips to the result.
      if (celebrating) {
        showResult();
      } else if (screen === SCREEN_TITLE) {
        const helpButton = titleHelpButtonRect();
        if (point.x >= helpButton.x && point.x <= helpButton.x + helpButton.width
          && point.y >= helpButton.y && point.y <= helpButton.y + helpButton.height) {
          helpReturn = SCREEN_TITLE;
          screen = SCREEN_HELP;
        } else {
          screen = SCREEN_LEVELS;
        }
      } else if (screen === SCREEN_HELP) {
        screen = helpReturn;
      } else {
        handleClick(point);
      }
    }
    // The cell under the mouse, for the hover highlight.
    handleActions();
    renderer.draw(view());
  }

  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    const board = renderer.boardRect();
    const cx = Math.floor((x - board.x) / board.size);
    const cy = Math.floor((y - board.y) / board.size);
    hover = cx >= 0 && cx < GRID && cy >= 0 && cy < GRID ? { x: cx, y: cy } : null;
  });

  // Leaving the tab pauses a running game rather than letting it sit unwatched.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY && !resultHidden) screen = SCREEN_PAUSED;
  });

  // A read-only handle for automated play-tests (?debug=1): the current screen,
  // the level run and the derived totals, plus a jump to any level. It changes
  // nothing about the game itself.
  if (params.get('debug')) {
    window.__lumen = {
      screen: () => screen,
      run: () => run,
      score: () => campaignScore(save),
      stars: () => save.stars,
      bestMoves: () => save.bestMoves,
      carry: () => carry,
      selected: () => ({ ...selected }),
      selectedMovable: () => selectedMovable,
      carryMessage: () => carryMessage,
      celebrating: () => celebrating,
      resultHidden: () => resultHidden,
      completedCount: () => completedCount(save),
      campaignComplete: () => isCampaignComplete(save),
      perfect: () => isPerfectCampaign(save),
      totalStars: () => totalStarsEarned(save),
      nextUnfinished: () => nextUnfinishedIndex(save),
      reducedMotion: () => reducedMotion,
      jump: (index) => startLevel(index),
      startLevel: (index) => startLevel(index),
    };
  }

  announce('Lumen Lines. Press Space or click to choose a level.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

export { BEST_KEY, STARS_KEY, STEP };
