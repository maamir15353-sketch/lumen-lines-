// Mouse and keyboard input for Lumen Lines. The canvas owns the pointer; the module
// turns raw events into game intents (a cell clicked, a point clicked, a key action)
// and lets main.js decide what each one does on the current screen.
//
// Action bits, so several keys pressed in one frame are all seen.
export const ACTION_CONFIRM = 1;
export const ACTION_ROTATE = 2;
export const ACTION_UNDO = 4;
export const ACTION_RESTART = 8;
export const ACTION_MENU = 16;
export const ACTION_MUTE = 32;
export const ACTION_NEXT = 64;
export const ACTION_LEVELS = 128;
export const ACTION_HINT = 256;
export const ACTION_CARRY = 512;
export const ACTION_HELP = 1024;
export const ACTION_REDUCED = 2048;

/** Which keys count as "confirm / start" on menus. */
const CONFIRM_KEYS = new Set([' ', 'Enter']);
const DIRECTION_KEYS = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  a: { x: -1, y: 0 },
  d: { x: 1, y: 0 },
  w: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
};

export function createInput(canvas) {
  let actions = 0;
  let cursorDelta = { x: 0, y: 0 };
  let clickedPoint = null;

  function onPointerDown(event) {
    const rect = canvas.getBoundingClientRect();
    clickedPoint = {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function onKeyDown(event) {
    const key = event.key;
    if (CONFIRM_KEYS.has(key)) {
      actions |= ACTION_CONFIRM | ACTION_ROTATE;
      event.preventDefault();
    } else if (key === 'Escape' || key === 'p' || key === 'P') {
      actions |= ACTION_MENU;
    } else if (key === 'u' || key === 'U' || key === 'z' || key === 'Z') {
      actions |= ACTION_UNDO;
    } else if (key === 'r' || key === 'R') {
      actions |= ACTION_RESTART;
    } else if (key === 'm' || key === 'M') {
      actions |= ACTION_MUTE;
    } else if (key === 'n' || key === 'N' || key === 'Tab') {
      actions |= ACTION_NEXT;
      event.preventDefault();
    } else if (key === 'l' || key === 'L') {
      actions |= ACTION_LEVELS;
    } else if (key === 'h' || key === 'H') {
      actions |= ACTION_HINT;
    } else if (key === 'g' || key === 'G') {
      actions |= ACTION_CARRY;
    } else if (key === 't' || key === 'T') {
      actions |= ACTION_REDUCED;
    } else if (key === '?' || key === '/') {
      actions |= ACTION_HELP;
    } else if (DIRECTION_KEYS[key]) {
      // Accumulate, so two quick presses in one frame both move the cursor.
      cursorDelta = { x: cursorDelta.x + DIRECTION_KEYS[key].x, y: cursorDelta.y + DIRECTION_KEYS[key].y };
      event.preventDefault();
    }
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('keydown', onKeyDown);

  return {
    /** The arrow-key step taken since the last call (0, 0 when none). */
    takeCursorDelta() {
      const next = cursorDelta;
      cursorDelta = { x: 0, y: 0 };
      return next;
    },
    /** The raw canvas point the player clicked since the last call, or null. */
    takeClickedPoint() {
      const point = clickedPoint;
      clickedPoint = null;
      return point;
    },
    /** The action bits raised since the last call. */
    takeActions() {
      const next = actions;
      actions = 0;
      return next;
    },
  };
}
