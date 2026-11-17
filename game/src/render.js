// Rendering for Lumen Lines v2: one canvas, one fixed 1280×800 stage. It draws the
// board, the coloured beams, the tiles, the side panel and every screen (title,
// chapter map, play, paused, help, level done, game done), and it owns every hit
// area, so main.js asks it what a click landed on instead of redoing the geometry.

import { GRID, BEAM_GROW_SECONDS, CRYSTAL_SPARKLE_SECONDS, WIN_PULSE_SECONDS, PALETTE, VERSION } from './config.js';
import { CHANNELS, CH_WHITE, colourName, COMBINER_OUT, isCombiner, isMovable } from './beam.js';
import { CHAPTERS, CHAPTER_TAGLINES, LEVELS } from './levels.js';
import {
  SCREEN_TITLE, SCREEN_LEVELS, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_HELP,
  SCREEN_LEVEL_DONE, SCREEN_GAME_DONE,
} from './state.js';

export const STAGE_WIDTH = 1280;
export const STAGE_HEIGHT = 800;

export const BOARD = { x: 90, y: 110, cell: 82 };
const PANEL = { x: 710, y: 110, width: 480, height: 574 };
const BUTTON_HEIGHT = 42;
const BUTTON_GAP = 8;

/** Deterministic background stars, so the title screen looks the same every run. */
const STARS = [];
{
  let seed = 123456789;
  const next = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < 90; i += 1) {
    STARS.push({ x: next() * STAGE_WIDTH, y: next() * STAGE_HEIGHT, r: 0.6 + next() * 1.6, a: 0.25 + next() * 0.55 });
  }
}

function cellCentre(x, y) {
  return { x: BOARD.x + x * BOARD.cell + BOARD.cell / 2, y: BOARD.y + y * BOARD.cell + BOARD.cell / 2 };
}

/** CSS colour for a channel mask (channels averaged; white is warm pale). */
export function maskCss(mask) {
  if (mask === 0) return '#3a4472';
  if (mask === CH_WHITE) return '#fff3c4';
  const parts = CHANNELS.filter((c) => mask & c.bit);
  const hex = (css) => [1, 3, 5].map((i) => parseInt(css.slice(i, i + 2), 16));
  const avg = [0, 1, 2].map((i) => Math.round(parts.reduce((s, c) => s + hex(c.css)[i], 0) / parts.length));
  return `rgb(${avg[0]}, ${avg[1]}, ${avg[2]})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function starPath(ctx, cx, cy, r, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(angle) * radius;
    const py = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** The level-card rectangle for level `i` on the chapter map. */
export function levelCardRect(i) {
  const level = LEVELS[i];
  const col = i % 4;
  const chapter = level.chapter;
  return {
    x: 90 + col * 280,
    y: 170 + chapter * 195 + 34,
    width: 260,
    height: 128,
  };
}

/** The two buttons on the compact completion panel. */
export function doneButtonRects() {
  // Four stacked buttons in the side panel (see drawResultPanel).
  const x = 734;
  const width = 432;
  return [
    { id: 'replay', x, y: 470, width, height: 44 },
    { id: 'next', x, y: 522, width, height: 44 },
    { id: 'levels', x, y: 574, width, height: 44 },
    { id: 'solution', x, y: 626, width, height: 44 },
  ];
}

/** Buttons on the finale (game-done) screen. */
export function finaleButtonRects() {
  return [
    { id: 'finale-levels', x: 400, y: 628, width: 220, height: 44 },
    { id: 'finale-replay', x: 660, y: 628, width: 220, height: 44 },
  ];
}

/** "View the restored observatory" button on the level-select map. */
export function observatoryButtonRect() {
  return { x: 900, y: 716, width: 290, height: 44 };
}

/** The "Show result" button shown while viewing a solved board. */
export function showResultButtonRect() {
  return { x: 90, y: 700, width: 1100, height: 52 };
}

/**
 * The movable-mirror action bar at the bottom of the play screen. When a
 * movable mirror is selected: Rotate / Move / Cancel. While carrying: Cancel
 * only (placement is by clicking a glowing socket, or Space on it).
 */
export function mirrorBarRects(view) {
  if (view.carry) {
    return [{ id: 'mirror-cancel', x: 980, y: 700, width: 210, height: 52 }];
  }
  if (view.selectedMovable) {
    return [
      { id: 'mirror-rotate', x: 700, y: 700, width: 150, height: 52 },
      { id: 'mirror-carry', x: 862, y: 700, width: 150, height: 52 },
      { id: 'mirror-cancel', x: 1024, y: 700, width: 166, height: 52 },
    ];
  }
  return [];
}

/** The "How to play" button on the title overlay (title card: 4 lines). */
export function titleHelpButtonRect() {
  const h = 150 + 4 * 34 + 90;
  const y = (STAGE_HEIGHT - h) / 2;
  return { x: (STAGE_WIDTH - 220) / 2, y: y + h - 118, width: 220, height: 42 };
}

const DIR_ARROW = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

function drawArrow(ctx, cx, cy, dir, len, colour, width = 4) {
  const [dx, dy] = DIR_ARROW[dir];
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - dx * len * 0.4, cy - dy * len * 0.4);
  ctx.lineTo(cx + dx * len * 0.6, cy + dy * len * 0.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + dx * (len * 0.6 + 8), cy + dy * (len * 0.6 + 8));
  ctx.lineTo(cx - dy * 6 + dx * len * 0.6, cy + dx * 6 + dy * len * 0.6);
  ctx.lineTo(cx + dy * 6 + dx * len * 0.6, cy - dx * 6 + dy * len * 0.6);
  ctx.closePath();
  ctx.fill();
}

/**
 * A small observatory: dome, tower and lit windows. `lit` of `total` windows
 * glow; when the chapter is complete the whole building glows gold. Each
 * chapter adds its own visible contribution as its levels complete: chapter 1
 * (Spectrum) raises the telescope and lens, chapter 2 (Harmony) adds the
 * brass rings and a constellation overhead. `detail` is the chapter index.
 */
function drawObservatory(ctx, x, y, scale, lit, total, complete, detail = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  const glow = complete ? PALETTE.gold : '#8affd8';
  // Base and tower.
  ctx.fillStyle = complete ? '#2a3468' : '#1a2145';
  ctx.fillRect(-34, -6, 68, 34);
  ctx.fillRect(-12, -34, 24, 30);
  // Dome.
  ctx.fillStyle = complete ? '#3a4472' : '#232c5c';
  ctx.beginPath();
  ctx.arc(0, -34, 20, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  // Telescope: an angled tube out of the dome slit, raised once the chapter
  // has any light (Spectrum chapter and beyond), with a coloured lens glow
  // fed by the restored instruments.
  if (lit > 0 || complete || detail >= 1) {
    ctx.strokeStyle = complete ? PALETTE.gold : '#cdd6ff';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(6, -50);
    ctx.lineTo(18, -66);
    ctx.stroke();
    ctx.fillStyle = glow;
    ctx.shadowColor = glow;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(19, -67, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  } else {
    ctx.strokeStyle = glow;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(6, -50);
    ctx.lineTo(16, -62);
    ctx.stroke();
  }
  // Brass rings around the dome (Harmony chapter): they appear as its levels
  // complete and spin gold when the chapter is done.
  if (detail >= 2 && (lit > 0 || complete)) {
    ctx.strokeStyle = complete ? PALETTE.gold : '#8a6d2f';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, -34, 30, 9, -0.4, 0, Math.PI * 2);
    ctx.stroke();
    if (complete) {
      ctx.beginPath();
      ctx.ellipse(0, -34, 38, 12, 0.4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // Windows: lit ones glow.
  for (let i = 0; i < total; i += 1) {
    const wx = -26 + i * 14;
    const isLit = i < lit;
    ctx.fillStyle = isLit ? glow : '#2c3a6e';
    if (isLit) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = 8;
    }
    ctx.fillRect(wx, 6, 8, 10);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
  // Constellation overhead: one connected star per lit level, drawn in the
  // sky above the building so chapter progress is visible at a glance.
  if (lit > 0) {
    const pts = [
      [x - 44, y - 78], [x - 16, y - 96], [x + 12, y - 84], [x + 40, y - 100],
    ].slice(0, lit);
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
    ctx.stroke();
    ctx.fillStyle = PALETTE.gold;
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p[0], p[1], 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, STAGE_HEIGHT);
    gradient.addColorStop(0, PALETTE.background);
    gradient.addColorStop(1, PALETTE.backgroundGlow);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    for (const star of STARS) {
      ctx.globalAlpha = star.a;
      ctx.fillStyle = '#dfe6ff';
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawTopBar(view) {
    ctx.fillStyle = PALETTE.text;
    ctx.font = '800 30px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('LUMEN LINES', 90, 62);
    ctx.fillStyle = PALETTE.gold;
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.fillText(`v${VERSION}`, 300, 42);
    ctx.fillStyle = PALETTE.textDim;
    ctx.font = '500 17px system-ui, sans-serif';
    ctx.fillText('bend the light · wake every crystal', 300, 60);
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.text;
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.fillText(`Score ${view.score}`, 1190, 56);
    if (view.best > 0) {
      ctx.fillStyle = PALETTE.textDim;
      ctx.font = '500 15px system-ui, sans-serif';
      ctx.fillText(`Best ${view.best}`, 1190, 80);
    }
    ctx.textAlign = 'left';
  }

  /** One channel glyph: circle = red, triangle = green, square = blue. */
  function drawChannelGlyph(cx, cy, bit, filled) {
    const colour = CHANNELS.find((c) => c.bit === bit).css;
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (bit === 1) {
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    } else if (bit === 2) {
      ctx.moveTo(cx, cy - 7);
      ctx.lineTo(cx + 7, cy + 5);
      ctx.lineTo(cx - 7, cy + 5);
      ctx.closePath();
    } else {
      ctx.rect(cx - 6, cy - 6, 12, 12);
    }
    if (filled) ctx.fill();
    else ctx.stroke();
  }

  function drawTile(tile, cx, cy, size) {
    const half = size / 2;
    if (tile === '/' || tile === 'M') {
      ctx.strokeStyle = PALETTE.mirror;
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.shadowColor = '#aebaff';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(cx - half + 12, cy + half - 12);
      ctx.lineTo(cx + half - 12, cy - half + 12);
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else if (tile === '\\' || tile === 'm') {
      ctx.strokeStyle = PALETTE.mirror;
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.shadowColor = '#aebaff';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(cx - half + 12, cy - half + 12);
      ctx.lineTo(cx + half - 12, cy + half - 12);
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else if (tile === 'P' || tile === 'p') {
      const pointingRight = tile === 'P';
      ctx.fillStyle = PALETTE.prism;
      ctx.shadowColor = PALETTE.prism;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      if (pointingRight) {
        ctx.moveTo(cx + half - 10, cy);
        ctx.lineTo(cx - half + 14, cy - half + 16);
        ctx.lineTo(cx - half + 14, cy + half - 16);
      } else {
        ctx.moveTo(cx - half + 10, cy);
        ctx.lineTo(cx + half - 14, cy - half + 16);
        ctx.lineTo(cx + half - 14, cy + half - 16);
      }
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
    } else if (tile === 'Y' || tile === 'y') {
      // Splitter: violet triangle, plus small coloured output arrows. Every
      // splitter in the campaign is entered from the west, so the arrows show
      // the real split: red straight, green and blue to the sides.
      ctx.fillStyle = PALETTE.splitter;
      ctx.shadowColor = PALETTE.splitter;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 18);
      ctx.lineTo(cx + 18, cy + 14);
      ctx.lineTo(cx - 18, cy + 14);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      const greenDir = tile === 'Y' ? 'N' : 'S';
      const blueDir = tile === 'Y' ? 'S' : 'N';
      drawArrow(ctx, cx + 26, cy, 'E', 12, PALETTE.red, 3);
      drawArrow(ctx, cx, cy - 26, greenDir, 10, PALETTE.green, 3);
      drawArrow(ctx, cx, cy + 26, blueDir, 10, PALETTE.blue, 3);
    } else if (isCombiner(tile)) {
      // Combiner: gold ring with a bold arrow in its output direction.
      ctx.strokeStyle = PALETTE.combiner;
      ctx.lineWidth = 5;
      ctx.shadowColor = PALETTE.combiner;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(cx, cy, 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = PALETTE.combiner;
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.fill();
      drawArrow(ctx, cx, cy, COMBINER_OUT[tile], 12, PALETTE.combiner, 4);
    } else if (tile === 'X') {
      ctx.fillStyle = PALETTE.blocker;
      roundRect(ctx, cx - half + 12, cy - half + 12, size - 24, size - 24, 10);
      ctx.fill();
      ctx.strokeStyle = '#7c86b8';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 12, cy - 12);
      ctx.lineTo(cx + 12, cy + 12);
      ctx.moveTo(cx + 12, cy - 12);
      ctx.lineTo(cx - 12, cy + 12);
      ctx.stroke();
    }
  }

  function drawCrystal(crystal, cx, cy, received, sparkle) {
    const required = crystal.required;
    const active = received === required;
    const size = active ? 26 : 20;
    const colour = maskCss(required);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    if (active) {
      ctx.shadowColor = colour;
      ctx.shadowBlur = 22;
      ctx.fillStyle = colour;
    } else {
      ctx.fillStyle = '#2c3a6e';
      ctx.strokeStyle = colour;
      ctx.lineWidth = 2;
    }
    ctx.fillRect(-size / 2, -size / 2, size, size);
    if (!active) ctx.strokeRect(-size / 2, -size / 2, size, size);
    ctx.restore();
    if (active && sparkle > 0) {
      ctx.save();
      ctx.globalAlpha = sparkle;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i += 1) {
        const angle = (i / 4) * Math.PI * 2 + sparkle * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * 20, cy + Math.sin(angle) * 20);
        ctx.lineTo(cx + Math.cos(angle) * 30, cy + Math.sin(angle) * 30);
        ctx.stroke();
      }
      ctx.restore();
    }
    // Required vs received glyphs: one shape per required channel, filled
    // when that channel has arrived, outline when it has not.
    const requiredBits = CHANNELS.filter((c) => required & c.bit);
    const totalW = (requiredBits.length - 1) * 18;
    requiredBits.forEach((c, i) => {
      drawChannelGlyph(cx - totalW / 2 + i * 18, cy + 32, c.bit, (received & c.bit) !== 0);
    });
  }

  function drawSource(cx, cy, dir) {
    ctx.fillStyle = PALETTE.source;
    ctx.shadowColor = PALETTE.source;
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.fill();
    drawArrow(ctx, cx, cy, dir, 10, PALETTE.source, 5);
  }

  /** Point along the beam path (discovery order) at fractional progress `t`. */
  function beamPointAt(run, t) {
    const segments = run.trace.segments;
    let total = 0;
    const lengths = segments.map((s) => {
      const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
      total += len;
      return len;
    });
    if (total === 0) return null;
    let target = total * t;
    for (let i = 0; i < segments.length; i += 1) {
      if (target <= lengths[i]) {
        const s = segments[i];
        const a = cellCentre(s.x1, s.y1);
        const b = cellCentre(s.x2, s.y2);
        const f = lengths[i] === 0 ? 0 : target / lengths[i];
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, ch: s.ch };
      }
      target -= lengths[i];
    }
    const last = segments[segments.length - 1];
    const b = cellCentre(last.x2, last.y2);
    return { x: b.x, y: b.y, ch: last.ch };
  }

  function drawBeam(run, reducedMotion) {
    // One entry per physical edge, keyed by its endpoints, carrying the OR of
    // the channels travelling it — so a combined edge (red+green = yellow)
    // is drawn once in its combined colour, and a single-channel edge keeps
    // its own red, green or blue core. The core is the channel colour itself,
    // never white: a pale core washed the channels out.
    const edges = [];
    const seenEdge = new Map();
    for (const s of run.trace.segments) {
      const key = `${s.x1},${s.y1},${s.x2},${s.y2}`;
      if (!seenEdge.has(key)) {
        seenEdge.set(key, edges.length);
        edges.push({ x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, mask: 0, len: Math.hypot(s.x2 - s.x1, s.y2 - s.y1) });
      }
      edges[seenEdge.get(key)].mask |= s.ch;
    }
    if (edges.length === 0) return;
    const grow = reducedMotion ? 1 : Math.min(1, run.beamAge / BEAM_GROW_SECONDS);
    const total = edges.reduce((sum, e) => sum + e.len, 0);
    const shown = total * grow;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    let drawn = 0;
    for (const edge of edges) {
      if (drawn >= shown) break;
      const take = Math.min(edge.len, shown - drawn);
      const a = cellCentre(edge.x1, edge.y1);
      const b = cellCentre(edge.x2, edge.y2);
      const t = edge.len === 0 ? 0 : take / edge.len;
      const endX = a.x + (b.x - a.x) * t;
      const endY = a.y + (b.y - a.y) * t;
      const colour = maskCss(edge.mask);
      // Soft glow in the edge's own colour, then a saturated core in the
      // same colour, then a thin pale centre line for definition only.
      ctx.strokeStyle = colour;
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = 15;
      ctx.shadowColor = colour;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 248, 220, 0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      drawn += edge.len;
    }
    ctx.shadowBlur = 0;
    // Win pulse: a bright dot travelling the solved circuit, unless reduced motion.
    if (run.won && !reducedMotion && run.winPulse < 1) {
      const p = beamPointAt(run, run.winPulse);
      if (p) {
        const colour = maskCss(p.ch);
        ctx.fillStyle = colour;
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 26;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  }

  function drawBoard(view) {
    const run = view.run;
    const reducedMotion = view.reducedMotion === true;
    for (let y = 0; y < GRID; y += 1) {
      for (let x = 0; x < GRID; x += 1) {
        const px = BOARD.x + x * BOARD.cell;
        const py = BOARD.y + y * BOARD.cell;
        ctx.fillStyle = (x + y) % 2 === 0 ? PALETTE.tile : '#151b3c';
        roundRect(ctx, px + 2, py + 2, BOARD.cell - 4, BOARD.cell - 4, 12);
        ctx.fill();
        if (view.hover && view.hover.x === x && view.hover.y === y) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
          roundRect(ctx, px + 2, py + 2, BOARD.cell - 4, BOARD.cell - 4, 12);
          ctx.fill();
        }
        if (view.selected && view.selected.x === x && view.selected.y === y && view.screen === SCREEN_PLAY) {
          ctx.strokeStyle = PALETTE.gold;
          ctx.lineWidth = 3;
          ctx.setLineDash([8, 6]);
          roundRect(ctx, px + 4, py + 4, BOARD.cell - 8, BOARD.cell - 8, 10);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        // Hint highlight: a pulsing ring on the hinted cell.
        if (run.hintCell && run.hintCell.x === x && run.hintCell.y === y) {
          ctx.strokeStyle = PALETTE.good;
          ctx.lineWidth = 4;
          roundRect(ctx, px + 6, py + 6, BOARD.cell - 12, BOARD.cell - 12, 10);
          ctx.stroke();
        }
        // Sockets glow while a movable mirror is selected or carried, so the
        // player can see where it may go before committing a move.
        const isSocket = run.board.sockets.some((s) => s.x === x && s.y === y);
        if (isSocket && (view.carry || view.selectedMovable)) {
          const carrying = Boolean(view.carry);
          ctx.strokeStyle = carrying ? PALETTE.socket : PALETTE.gold;
          ctx.lineWidth = carrying ? 4 : 3;
          ctx.setLineDash([6, 5]);
          ctx.beginPath();
          ctx.arc(px + BOARD.cell / 2, py + BOARD.cell / 2, carrying ? 32 : 28, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          if (carrying) {
            ctx.fillStyle = PALETTE.socket;
            ctx.font = '700 13px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('socket', px + BOARD.cell / 2, py + BOARD.cell - 8);
            ctx.textAlign = 'left';
          }
        }
      }
    }
    drawBeam(run, reducedMotion);
    for (let y = 0; y < GRID; y += 1) {
      for (let x = 0; x < GRID; x += 1) {
        const tile = run.board.tiles[y][x];
        const centre = cellCentre(x, y);
        if (tile === 'S') drawSource(centre.x, centre.y, run.board.sourceDir);
        else if (tile === 'C') {
          const crystal = run.board.crystals.find((c) => c.x === x && c.y === y);
          const received = crystal ? (run.trace.received.get(crystal.id) ?? 0) : 0;
          const sparkle = crystal && run.newlyLit.has(crystal.id)
            ? Math.max(0, 1 - run.beamAge / CRYSTAL_SPARKLE_SECONDS) : 0;
          drawCrystal(crystal, centre.x, centre.y, received, sparkle);
        } else {
          drawTile(tile, centre.x, centre.y, BOARD.cell);
          if (isMovable(tile)) {
            // Movable mirrors carry a small "can travel" mark.
            ctx.fillStyle = PALETTE.socket;
            ctx.font = '700 15px system-ui, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText('↔', centre.x + 32, centre.y - 22);
            ctx.textAlign = 'left';
          }
        }
      }
    }
    // Carry ghost: the carried mirror follows the keyboard selection. A valid
    // socket shows the ghost mirror; any other cell shows a red "no" mark and
    // the reason is spelled out in the action bar below the board.
    if (view.carry && view.screen === SCREEN_PLAY) {
      const c = cellCentre(view.selected.x, view.selected.y);
      const onSocket = run.board.sockets.some((s) => s.x === view.selected.x && s.y === view.selected.y)
        && !(view.selected.x === view.carry.x && view.selected.y === view.carry.y);
      if (onSocket) {
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = PALETTE.socket;
        ctx.lineWidth = 9;
        ctx.lineCap = 'round';
        ctx.beginPath();
        if (view.carry.ch === 'M') {
          ctx.moveTo(c.x - 22, c.y + 22);
          ctx.lineTo(c.x + 22, c.y - 22);
        } else {
          ctx.moveTo(c.x - 22, c.y - 22);
          ctx.lineTo(c.x + 22, c.y + 22);
        }
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.save();
        ctx.strokeStyle = PALETTE.danger;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(c.x, c.y, 24, 0, Math.PI * 2);
        ctx.moveTo(c.x - 12, c.y - 12);
        ctx.lineTo(c.x + 12, c.y + 12);
        ctx.moveTo(c.x + 12, c.y - 12);
        ctx.lineTo(c.x - 12, c.y + 12);
        ctx.stroke();
        ctx.restore();
      }
    }
    // Selected movable mirror (not yet carried): a gold ring marks it, distinct
    // from the teal carrying state.
    if (view.selectedMovable && !view.carry && view.screen === SCREEN_PLAY) {
      const c = cellCentre(view.selectedMovable.x, view.selectedMovable.y);
      ctx.strokeStyle = PALETTE.gold;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 34, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function panelButtons(view) {
    const x = PANEL.x + 24;
    const width = PANEL.width - 48;
    const labels = [
      { id: 'undo', label: 'Undo  (U)', enabled: view.run.undoStack.length > 0 },
      { id: 'hint', label: 'Hint  (H)', enabled: true },
      { id: 'restart', label: 'Restart level  (R)', enabled: true },
      { id: 'levels', label: 'Level select  (L)', enabled: true },
      { id: 'sound', label: view.muted ? 'Sound: off  (M)' : 'Sound: on  (M)', enabled: true },
    ];
    return labels.map((button, i) => ({
      ...button,
      x,
      y: PANEL.y + 300 + i * (BUTTON_HEIGHT + BUTTON_GAP),
      width,
      height: BUTTON_HEIGHT,
    }));
  }

  function drawButton(button) {
    ctx.fillStyle = button.enabled ? '#232c5c' : '#1a2145';
    roundRect(ctx, button.x, button.y, button.width, button.height, 10);
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1.5;
    roundRect(ctx, button.x, button.y, button.width, button.height, 10);
    ctx.stroke();
    ctx.fillStyle = button.enabled ? PALETTE.text : PALETTE.textFaint;
    ctx.font = '600 17px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(button.label, button.x + button.width / 2, button.y + button.height / 2 + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  function wrapText(text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let cy = y;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, cy);
        line = word;
        cy += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, cy);
    return cy;
  }

  /** First-appearance cue for a mechanic this level introduces, or ''. */
  function firstCue(index) {
    const has = (letterSet) => LEVELS.slice(0, index).some((l) => l.grid.join('').split('').some((c) => letterSet.includes(c)));
    const cur = LEVELS[index].grid.join('');
    if ((cur.includes('Y') || cur.includes('y')) && !has(['Y', 'y'])) {
      return 'New: splitter — red goes straight, green and blue turn aside.';
    }
    if ((cur.includes('^') || cur.includes('>') || cur.includes('v') || cur.includes('<')) && !has(['^', '>', 'v', '<'])) {
      return 'New: combiner — beams in from any side leave by the gold arrow.';
    }
    if ((cur.includes('M') || cur.includes('m')) && !has(['M', 'm'])) {
      return 'New: wandering mirror — click it, then Rotate, Move or Cancel below the board.';
    }
    if ((cur.includes('P') || cur.includes('p')) && !has(['P', 'p'])) {
      return 'New: prism — it bends the beam a quarter turn.';
    }
    return '';
  }

  function drawPanel(view) {
    const run = view.run;
    ctx.fillStyle = PALETTE.panel;
    roundRect(ctx, PANEL.x, PANEL.y, PANEL.width, PANEL.height, 18);
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1.5;
    roundRect(ctx, PANEL.x, PANEL.y, PANEL.width, PANEL.height, 18);
    ctx.stroke();

    ctx.fillStyle = PALETTE.text;
    ctx.font = '800 24px system-ui, sans-serif';
    ctx.fillText(`Level ${run.index + 1} of ${LEVELS.length} · ${CHAPTERS[run.level.chapter]}`, PANEL.x + 24, PANEL.y + 40);
    ctx.fillStyle = PALETTE.gold;
    ctx.font = '700 20px system-ui, sans-serif';
    ctx.fillText(run.level.name, PANEL.x + 24, PANEL.y + 70);

    ctx.fillStyle = PALETTE.textDim;
    ctx.font = '500 15px system-ui, sans-serif';
    const afterInsight = wrapText(run.level.insight, PANEL.x + 24, PANEL.y + 96, PANEL.width - 48, 20);

    // Receivers: each one lists what it needs and what it is receiving.
    let ry = Math.max(afterInsight + 18, PANEL.y + 150);
    ctx.font = '700 19px system-ui, sans-serif';
    if (run.board.crystals.length <= 3) {
      run.board.crystals.forEach((crystal) => {
        const received = run.trace.received.get(crystal.id) ?? 0;
        const active = received === crystal.required;
        ctx.fillStyle = active ? PALETTE.good : PALETTE.text;
        const status = active
          ? '✓ lit'
          : received === 0
            ? '— receiving nothing'
            : (received & ~crystal.required) !== 0
              ? `— receiving ${colourName(received)} (too much ${colourName(received & ~crystal.required)})`
              : `— receiving ${colourName(received)} (needs ${colourName(crystal.required & ~received)} too)`;
        ctx.fillText(`needs ${colourName(crystal.required)} ${status}`, PANEL.x + 24, ry);
        ry += 26;
      });
    } else {
      const litCount = run.trace.lit.size;
      const total = run.board.crystals.length;
      ctx.fillStyle = litCount === total ? PALETTE.good : PALETTE.text;
      ctx.fillText(`Crystals  ${litCount} / ${total} lit`, PANEL.x + 24, ry);
      ry += 26;
    }
    ctx.fillStyle = PALETTE.text;
    ctx.font = '700 19px system-ui, sans-serif';
    ctx.fillText(`Moves used  ${run.movesUsed}  ·  par ${run.level.par}`, PANEL.x + 24, ry + 6);
    const cue = firstCue(run.index);
    if (cue) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = '500 15px system-ui, sans-serif';
      wrapText(cue, PANEL.x + 24, ry + 32, PANEL.width - 48, 20);
    }
    ctx.fillStyle = PALETTE.textDim;
    ctx.font = '500 15px system-ui, sans-serif';
    ctx.fillText('Click a tile to turn it · Wandering mirror: Rotate / Move / Cancel', PANEL.x + 24, PANEL.y + 288);

    for (const button of panelButtons(view)) drawButton(button);
  }

  function drawHintBanner(view) {
    const run = view.run;
    if (!run.hintText) return;
    ctx.fillStyle = 'rgba(18, 24, 50, 0.92)';
    roundRect(ctx, 90, 700, 1100, 52, 12);
    ctx.fill();
    ctx.strokeStyle = PALETTE.good;
    ctx.lineWidth = 1.5;
    roundRect(ctx, 90, 700, 1100, 52, 12);
    ctx.stroke();
    ctx.fillStyle = PALETTE.text;
    ctx.font = '600 17px system-ui, sans-serif';
    ctx.fillText(`Hint ${run.hintStage} of 3 — ${run.hintText}`, 110, 733);
  }

  function drawLevelCards(view) {
    ctx.fillStyle = PALETTE.text;
    ctx.font = '800 34px system-ui, sans-serif';
    ctx.fillText('Choose a level', 90, 108);
    ctx.fillStyle = PALETTE.textDim;
    ctx.font = '500 18px system-ui, sans-serif';
    ctx.fillText('Restore the observatory, one instrument at a time. Click a level to play it.', 90, 136);
    const doneCount = view.completedCount ?? LEVELS.filter((_, i) => (view.stars[i] ?? 0) > 0).length;
    ctx.fillStyle = view.campaignComplete ? PALETTE.gold : PALETTE.text;
    ctx.font = '700 19px system-ui, sans-serif';
    ctx.fillText(
      view.campaignComplete
        ? `Campaign complete — all ${LEVELS.length} levels restored · ${view.totalStars} of ${LEVELS.length * 3} stars · Score ${view.score}`
        : `${doneCount} of ${LEVELS.length} levels restored · ${view.totalStars} of ${LEVELS.length * 3} stars · Score ${view.score}`,
      90, 160,
    );
    [0, 1, 2].forEach((chapter) => {
      const headerY = 170 + chapter * 195;
      const chapterLevels = LEVELS.map((l, i) => ({ l, i })).filter(({ l }) => l.chapter === chapter);
      const done = chapterLevels.filter(({ i }) => (view.stars[i] ?? 0) > 0).length;
      const complete = done === chapterLevels.length;
      ctx.fillStyle = complete ? PALETTE.gold : PALETTE.text;
      ctx.font = '800 22px system-ui, sans-serif';
      ctx.fillText(`Chapter ${chapter + 1} · ${CHAPTERS[chapter]}`, 90, headerY + 24);
      ctx.fillStyle = PALETTE.textDim;
      ctx.font = '500 16px system-ui, sans-serif';
      ctx.fillText(CHAPTER_TAGLINES[chapter], 430, headerY + 24);
      drawObservatory(ctx, 1150, headerY + 22, 0.9, done, chapterLevels.length, complete, chapter);
      chapterLevels.forEach(({ l, i }) => {
        const rect = levelCardRect(i);
        const col = i % 4;
        void col;
        ctx.fillStyle = PALETTE.panel;
        roundRect(ctx, rect.x, rect.y, rect.width, rect.height, 16);
        ctx.fill();
        ctx.strokeStyle = (view.stars[i] ?? 0) > 0 ? PALETTE.gold : PALETTE.panelEdge;
        ctx.lineWidth = 1.5;
        roundRect(ctx, rect.x, rect.y, rect.width, rect.height, 16);
        ctx.stroke();
        ctx.fillStyle = PALETTE.gold;
        ctx.font = '800 20px system-ui, sans-serif';
        ctx.fillText(`Level ${i + 1}`, rect.x + 18, rect.y + 32);
        ctx.fillStyle = PALETTE.text;
        ctx.font = '700 18px system-ui, sans-serif';
        ctx.fillText(l.name, rect.x + 18, rect.y + 60);
        ctx.fillStyle = PALETTE.textDim;
        ctx.font = '500 14px system-ui, sans-serif';
        const crystals = l.grid.flat().join('').split('').filter((c) => c === 'C').length;
        const best = view.bestMoves[i];
        ctx.fillText(`${crystals} crystal${crystals === 1 ? '' : 's'} · par ${l.par}${best ? ` · best ${best}` : ''}`, rect.x + 18, rect.y + 86);
        const stars = view.stars[i] ?? 0;
        for (let s = 0; s < 3; s += 1) {
          ctx.fillStyle = s < stars ? PALETTE.gold : PALETTE.starEmpty;
          starPath(ctx, rect.x + 32 + s * 32, rect.y + 112, 12);
          ctx.fill();
        }
      });
    });
    ctx.fillStyle = PALETTE.textFaint;
    ctx.font = '500 15px system-ui, sans-serif';
    ctx.fillText('H how to play · M sound · Esc back to title', 90, 772);
    if (view.campaignComplete) {
      const b = observatoryButtonRect();
      ctx.fillStyle = '#3a5a2e';
      roundRect(ctx, b.x, b.y, b.width, b.height, 10);
      ctx.fill();
      ctx.strokeStyle = PALETTE.gold;
      ctx.lineWidth = 1.5;
      roundRect(ctx, b.x, b.y, b.width, b.height, 10);
      ctx.stroke();
      ctx.fillStyle = PALETTE.text;
      ctx.font = '600 17px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('View the restored observatory', b.x + b.width / 2, b.y + b.height / 2 + 1);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
  }

  function drawOverlayCard(title, lines) {
    ctx.fillStyle = 'rgba(5, 8, 20, 0.72)';
    ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    const w = 640;
    const h = 150 + lines.length * 34 + 90;
    const x = (STAGE_WIDTH - w) / 2;
    const y = (STAGE_HEIGHT - h) / 2;
    ctx.fillStyle = PALETTE.panel;
    roundRect(ctx, x, y, w, h, 20);
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, y, w, h, 20);
    ctx.stroke();
    ctx.fillStyle = PALETTE.text;
    ctx.font = '800 34px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, STAGE_WIDTH / 2, y + 62);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.textDim;
    ctx.font = '500 19px system-ui, sans-serif';
    lines.forEach((line, i) => {
      ctx.textAlign = 'center';
      ctx.fillText(line, STAGE_WIDTH / 2, y + 106 + i * 34);
    });
    ctx.textAlign = 'left';
    return { x, y, w, h };
  }

  function drawStarsRow(cx, cy, stars) {
    for (let s = 0; s < 3; s += 1) {
      ctx.fillStyle = s < stars ? PALETTE.gold : PALETTE.starEmpty;
      ctx.shadowColor = s < stars ? PALETTE.gold : 'transparent';
      ctx.shadowBlur = s < stars ? 14 : 0;
      starPath(ctx, cx + (s - 1) * 56, cy, 22);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  /**
   * The level result, drawn in the side panel so the solved board stays fully
   * visible behind it: stars, moves vs par, points, and true campaign progress
   * (levels restored, stars, campaign score) — never a claim the save does
   * not support. Buttons: Replay, Next unfinished level, Level select,
   * View solution (dismisses the panel, keeps the solved circuit on screen).
   */
  function drawResultPanel(view) {
    const run = view.run;
    ctx.fillStyle = PALETTE.panel;
    roundRect(ctx, PANEL.x, PANEL.y, PANEL.width, PANEL.height, 18);
    ctx.fill();
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 2;
    roundRect(ctx, PANEL.x, PANEL.y, PANEL.width, PANEL.height, 18);
    ctx.stroke();
    ctx.fillStyle = PALETTE.gold;
    ctx.font = '800 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Level restored!', 950, PANEL.y + 48);
    ctx.textAlign = 'left';
    drawStarsRow(950, PANEL.y + 100, view.lastStars);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '700 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${run.level.name}`, 950, PANEL.y + 146);
    ctx.fillStyle = PALETTE.textDim;
    ctx.font = '500 18px system-ui, sans-serif';
    ctx.fillText(`${view.lastScore} points · ${run.movesUsed} moves (par ${run.level.par})`, 950, PANEL.y + 176);
    ctx.fillText(`Best on this level: ${view.bestMoves[run.index]} moves`, 950, PANEL.y + 204);
    ctx.fillStyle = view.campaignComplete ? PALETTE.gold : PALETTE.text;
    ctx.font = '700 19px system-ui, sans-serif';
    ctx.fillText(`${view.completedCount} of ${LEVELS.length} levels restored`, 950, PANEL.y + 244);
    ctx.fillStyle = PALETTE.textDim;
    ctx.font = '500 18px system-ui, sans-serif';
    ctx.fillText(`${view.totalStars} of ${LEVELS.length * 3} stars · Campaign score ${view.score}`, 950, PANEL.y + 272);
    if (!view.campaignComplete && view.nextUnfinished >= 0) {
      ctx.fillText(`Next unfinished: Level ${view.nextUnfinished + 1} · ${LEVELS[view.nextUnfinished].name}`, 950, PANEL.y + 300);
    }
    ctx.textAlign = 'left';
    const labels = {
      replay: 'Replay  (R)',
      next: view.nextUnfinished >= 0 ? 'Next unfinished  (N)' : 'Level select  (N)',
      levels: 'Level select  (L)',
      solution: 'View solution  (G)',
    };
    for (const button of doneButtonRects()) {
      ctx.fillStyle = button.id === 'next' ? '#3a5a2e' : '#232c5c';
      roundRect(ctx, button.x, button.y, button.width, button.height, 10);
      ctx.fill();
      ctx.strokeStyle = PALETTE.panelEdge;
      ctx.lineWidth = 1.5;
      roundRect(ctx, button.x, button.y, button.width, button.height, 10);
      ctx.stroke();
      ctx.fillStyle = PALETTE.text;
      ctx.font = '600 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labels[button.id], button.x + button.width / 2, button.y + button.height / 2 + 1);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
  }

  /** The movable-mirror action bar under the board (selected / carrying). */
  function drawMirrorBar(view) {
    const buttons = mirrorBarRects(view);
    if (buttons.length === 0 && !view.carryMessage) return;
    ctx.fillStyle = 'rgba(18, 24, 50, 0.92)';
    roundRect(ctx, 90, 700, 1100, 52, 12);
    ctx.fill();
    ctx.strokeStyle = view.carry ? PALETTE.socket : PALETTE.gold;
    ctx.lineWidth = 1.5;
    roundRect(ctx, 90, 700, 1100, 52, 12);
    ctx.stroke();
    ctx.fillStyle = PALETTE.text;
    ctx.font = '600 17px system-ui, sans-serif';
    const text = view.carry
      ? (view.carryMessage || 'Carrying the mirror — click a glowing socket to place it (1 move).')
      : (view.carryMessage || 'Wandering mirror selected — choose an action:');
    // Never let the text run under the buttons: ellipsize to the free width.
    const freeWidth = (buttons.length > 0 ? buttons[0].x : 1190) - 130;
    let shown = text;
    while (shown.length > 1 && ctx.measureText(shown).width > freeWidth) {
      shown = shown.slice(0, -2);
    }
    if (shown !== text) shown = `${shown.trimEnd()}…`;
    ctx.fillText(shown, 110, 733);
    for (const button of buttons) {
      ctx.fillStyle = button.id === 'mirror-cancel' ? '#4a2a2a' : '#232c5c';
      roundRect(ctx, button.x, button.y, button.width, button.height, 10);
      ctx.fill();
      ctx.strokeStyle = PALETTE.panelEdge;
      ctx.lineWidth = 1.5;
      roundRect(ctx, button.x, button.y, button.width, button.height, 10);
      ctx.stroke();
      ctx.fillStyle = PALETTE.text;
      ctx.font = '600 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = button.id === 'mirror-rotate' ? 'Rotate' : button.id === 'mirror-carry' ? 'Move  (G)' : 'Cancel  (Esc)';
      ctx.fillText(label, button.x + button.width / 2, button.y + button.height / 2 + 1);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
  }

  /** "Show result" banner while the player is viewing a solved board. */
  function drawShowResultBanner() {
    const b = showResultButtonRect();
    ctx.fillStyle = 'rgba(18, 24, 50, 0.92)';
    roundRect(ctx, b.x, b.y, b.width, b.height, 12);
    ctx.fill();
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 1.5;
    roundRect(ctx, b.x, b.y, b.width, b.height, 12);
    ctx.stroke();
    ctx.fillStyle = PALETTE.text;
    ctx.font = '600 17px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Solved circuit — click here, or press Enter, to show the result  ·  L for level select', b.x + b.width / 2, b.y + b.height / 2 + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  function draw(view) {
    drawBackground();
    drawTopBar(view);
    if (view.screen === SCREEN_TITLE) {
      drawBoard(view);
      const card = drawOverlayCard('LUMEN LINES', [
        'A dark observatory. One beam of white light. Restore it,',
        'crystal by crystal — light becomes music.',
        'Click a tile to turn it · Arrows + Space work too · U undoes',
        'H how to play · G carries a wandering mirror · M sound',
      ]);
      ctx.fillStyle = PALETTE.gold;
      ctx.font = '700 22px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Click anywhere, or press Space, to begin', STAGE_WIDTH / 2, card.y + card.h - 34);
      ctx.textAlign = 'left';
      const helpButton = titleHelpButtonRect();
      ctx.fillStyle = '#232c5c';
      roundRect(ctx, helpButton.x, helpButton.y, helpButton.width, helpButton.height, 10);
      ctx.fill();
      ctx.strokeStyle = PALETTE.panelEdge;
      ctx.lineWidth = 1.5;
      roundRect(ctx, helpButton.x, helpButton.y, helpButton.width, helpButton.height, 10);
      ctx.stroke();
      ctx.fillStyle = PALETTE.text;
      ctx.font = '600 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('How to play  (H)', STAGE_WIDTH / 2, helpButton.y + helpButton.height / 2 + 1);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      if (view.best > 0) {
        ctx.fillStyle = PALETTE.textDim;
        ctx.font = '500 16px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`Best score ${view.best} · ${view.totalStars} of ${LEVELS.length * 3} stars`, STAGE_WIDTH / 2, 748);
        ctx.textAlign = 'left';
      }
      return;
    }
    if (view.screen === SCREEN_LEVELS) {
      drawLevelCards(view);
      return;
    }
    if (view.screen === SCREEN_GAME_DONE) {
      // The restored observatory — only ever shown after genuine campaign
      // completion (every level solved). Dome, telescope and lens, brass
      // rings, three constellations (one per chapter) and coloured beams
      // feeding the instruments from every side.
      const beamCols = [PALETTE.red, PALETTE.green, PALETTE.blue, PALETTE.gold];
      beamCols.forEach((col, i) => {
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        const sx = 180 + i * 300;
        ctx.moveTo(sx, 620);
        ctx.quadraticCurveTo(sx + 60, 480, 640 + (i - 1.5) * 40, 470);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
      // Three constellations, one per chapter.
      const constellations = [
        [[300, 150], [340, 120], [380, 150], [420, 118]],
        [[860, 140], [900, 108], [940, 138], [980, 110]],
        [[560, 110], [600, 82], [640, 112], [680, 84]],
      ];
      for (const pts of constellations) {
        ctx.strokeStyle = 'rgba(255, 209, 102, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
        ctx.stroke();
        ctx.fillStyle = PALETTE.gold;
        for (const p of pts) {
          ctx.beginPath();
          ctx.arc(p[0], p[1], 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      drawObservatory(ctx, 640, 500, 4.0, 4, 4, true, 2);
      ctx.fillStyle = PALETTE.text;
      ctx.font = '800 44px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(view.perfect ? 'Every crystal lit — a perfect campaign!' : 'Every crystal lit!', STAGE_WIDTH / 2, 180);
      ctx.fillStyle = PALETTE.gold;
      ctx.font = '600 24px system-ui, sans-serif';
      ctx.fillText('The observatory is awake — light becomes music.', STAGE_WIDTH / 2, 224);
      ctx.fillStyle = PALETTE.textDim;
      ctx.font = '500 20px system-ui, sans-serif';
      ctx.fillText(
        `All ${LEVELS.length} levels complete · ${view.totalStars} of ${LEVELS.length * 3} stars · Final score ${view.score}`,
        STAGE_WIDTH / 2,
        706,
      );
      ctx.fillStyle = view.perfect ? PALETTE.gold : PALETTE.text;
      ctx.font = '700 20px system-ui, sans-serif';
      ctx.fillText(
        view.perfect
          ? 'Perfect campaign — 36 of 36 stars. A flawless restoration.'
          : `Mastery still open: ${view.totalStars} of 36 stars — replay any level to earn the rest.`,
        STAGE_WIDTH / 2,
        738,
      );
      ctx.textAlign = 'left';
      for (const button of finaleButtonRects()) {
        ctx.fillStyle = button.id === 'finale-replay' ? '#3a5a2e' : '#232c5c';
        roundRect(ctx, button.x, button.y, button.width, button.height, 10);
        ctx.fill();
        ctx.strokeStyle = PALETTE.panelEdge;
        ctx.lineWidth = 1.5;
        roundRect(ctx, button.x, button.y, button.width, button.height, 10);
        ctx.stroke();
        ctx.fillStyle = PALETTE.text;
        ctx.font = '600 18px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(button.id === 'finale-replay' ? 'Play again from Level 1' : 'Level select', button.x + button.width / 2, button.y + button.height / 2 + 1);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      }
      return;
    }
    // The help overlay keeps the screen it came from behind it.
    if (view.screen === SCREEN_HELP && view.helpReturn === SCREEN_LEVELS) {
      drawLevelCards(view);
    } else if (view.screen === SCREEN_HELP && view.helpReturn === SCREEN_TITLE) {
      drawBoard(view);
    } else if (view.screen === SCREEN_LEVEL_DONE) {
      // Solved board stays visible; the result lives in the side panel.
      drawBoard(view);
      drawResultPanel(view);
      drawHintBanner(view);
    } else {
      drawBoard(view);
      drawPanel(view);
      const bottomBusy = view.resultHidden || view.celebrating || view.selectedMovable || view.carry || view.carryMessage;
      if (!bottomBusy) {
        ctx.fillStyle = PALETTE.textFaint;
        ctx.font = '500 15px system-ui, sans-serif';
        ctx.fillText('L levels · R restart · U undo · H hint · M sound · Esc pause', 90, 730);
      }
      if (view.resultHidden) drawShowResultBanner();
      else if (view.celebrating) {
        ctx.fillStyle = 'rgba(18, 24, 50, 0.92)';
        roundRect(ctx, 90, 700, 1100, 52, 12);
        ctx.fill();
        ctx.strokeStyle = PALETTE.gold;
        ctx.lineWidth = 1.5;
        roundRect(ctx, 90, 700, 1100, 52, 12);
        ctx.stroke();
        ctx.fillStyle = PALETTE.text;
        ctx.font = '600 17px system-ui, sans-serif';
        ctx.fillText('The circuit holds… click or press any key to see the result.', 110, 733);
      } else if (view.selectedMovable || view.carry || view.carryMessage) drawMirrorBar(view);
      else drawHintBanner(view);
    }

    if (view.screen === SCREEN_PAUSED) {
      drawOverlayCard('Paused', ['The light is holding still.', 'Esc to keep playing · L for level select · R to restart']);
    } else if (view.screen === SCREEN_HELP) {
      drawOverlayCard('How to play', [
        'Turn mirrors, prisms, splitters and combiners so the beam',
        'reaches every crystal with EXACTLY the colour it needs.',
        'Red ○  Green △  Blue □ — filled shapes have arrived.',
        'A splitter sends red straight, green one way, blue the other.',
        'A combiner joins beams by its gold arrow. Wandering mirrors',
        'move: click one, then Rotate, Move or Cancel below the board;',
        'Move carries it — click a glowing socket to place it (1 move).',
        'Keyboard: arrows move, Space turns, G carries, Space places,',
        'Esc cancels carrying without changing the board. U undoes.',
        'No move limit, no fail — beat par for 3 stars. Hints are free.',
        'T toggles reduced motion (beam appears instantly, no pulse).',
        'Esc or ? closes this help.',
      ]);
    }
  }

  /** The board's pixel rectangle, for turning a click into a cell. */
  function boardRect() {
    return { x: BOARD.x, y: BOARD.y, size: BOARD.cell };
  }

  /**
   * What a canvas point landed on: a board cell, a panel button, a level card,
   * a completion button, or nothing.
   */
  function hitTest(point, view) {
    if (view.screen === SCREEN_LEVELS) {
      for (let i = 0; i < view.levels.length; i += 1) {
        const rect = levelCardRect(i);
        if (point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height) {
          return { kind: 'level', index: i };
        }
      }
      if (view.campaignComplete) {
        const b = observatoryButtonRect();
        if (point.x >= b.x && point.x <= b.x + b.width && point.y >= b.y && point.y <= b.y + b.height) {
          return { kind: 'button', id: 'view-observatory' };
        }
      }
      return null;
    }
    if (view.screen === SCREEN_GAME_DONE) {
      for (const button of finaleButtonRects()) {
        if (point.x >= button.x && point.x <= button.x + button.width && point.y >= button.y && point.y <= button.y + button.height) {
          return { kind: 'button', id: button.id };
        }
      }
      return null;
    }
    if (view.screen === SCREEN_LEVEL_DONE) {
      // Only the panel buttons respond: clicks on the solved board do nothing,
      // so an extra click can never advance, add moves or points.
      for (const button of doneButtonRects()) {
        if (point.x >= button.x && point.x <= button.x + button.width && point.y >= button.y && point.y <= button.y + button.height) {
          return { kind: 'button', id: button.id };
        }
      }
      return null;
    }
    if (view.screen === SCREEN_PLAY || view.screen === SCREEN_PAUSED) {
      if (view.screen === SCREEN_PLAY) {
        // Movable-mirror action bar and "Show result" banner first: they sit
        // below the board, so check them before the board itself.
        for (const button of mirrorBarRects(view)) {
          if (point.x >= button.x && point.x <= button.x + button.width && point.y >= button.y && point.y <= button.y + button.height) {
            return { kind: 'button', id: button.id };
          }
        }
        if (view.resultHidden) {
          const b = showResultButtonRect();
          if (point.x >= b.x && point.x <= b.x + b.width && point.y >= b.y && point.y <= b.y + b.height) {
            return { kind: 'button', id: 'show-result' };
          }
        }
      }
      const rect = boardRect();
      const cx = Math.floor((point.x - rect.x) / rect.size);
      const cy = Math.floor((point.y - rect.y) / rect.size);
      if (cx >= 0 && cx < GRID && cy >= 0 && cy < GRID) return { kind: 'cell', x: cx, y: cy };
      if (view.screen === SCREEN_PLAY) {
        for (const button of panelButtons(view)) {
          if (point.x >= button.x && point.x <= button.x + button.width && point.y >= button.y && point.y <= button.y + button.height) {
            return { kind: 'button', id: button.id };
          }
        }
      }
      return null;
    }
    return null;
  }

  return { draw, boardRect, hitTest };
}
