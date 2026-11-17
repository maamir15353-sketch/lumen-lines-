// Play-test for Lumen Lines v2: serves game/, drives it in headless Chromium,
// plays one level from each chapter to a win with real canvas clicks, checks
// undo (including restoring a moved mirror), restart, the 3-stage hints,
// keyboard play (arrows + Space + G carry + drop), a small viewport and
// fullscreen with hit-testing still correct, the final restoration, and takes
// the four screenshots from shots.json. There is no fail state in v2, so a
// wasted-moves attempt is checked to stay in play instead. Fails if any request
// leaves localhost or any console error appears.
//
// Usage: node tools/playtest.mjs
// Exit code 0 when every check passes, 1 otherwise.

import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import { readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOARD, levelCardRect } from '../game/src/render.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const CHROME = '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';
const BASE = 'http://localhost:8080';
const SHOTS = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const server = spawn('node', ['serve.ts'], { cwd: root, stdio: 'pipe' });
let serverReady = false;
server.stdout.on('data', (chunk) => {
  if (chunk.toString().includes('http://localhost:8080')) serverReady = true;
});

try {
  for (let i = 0; i < 50 && !serverReady; i += 1) await sleep(100);
  check('server starts', serverReady);

  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const requests = [];
  const errors = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  const lumen = (expr) => page.evaluate(`window.__lumen.${expr}`);
  const cellPoint = (x, y) => {
    const vw = page.viewportSize().width;
    const vh = page.viewportSize().height;
    return {
      x: ((BOARD.x + x * BOARD.cell + BOARD.cell / 2) / 1280) * vw,
      y: ((BOARD.y + y * BOARD.cell + BOARD.cell / 2) / 800) * vh,
    };
  };
  const clickCell = async (x, y) => {
    const p = cellPoint(x, y);
    await page.mouse.click(p.x, p.y);
    await sleep(120);
  };
  const clickCard = async (i) => {
    const r = levelCardRect(i);
    const vw = page.viewportSize().width;
    const vh = page.viewportSize().height;
    await page.mouse.click(((r.x + r.width / 2) / 1280) * vw, ((r.y + r.height / 2) / 800) * vh);
    await sleep(200);
  };
  // After a win the solved circuit holds briefly (celebration) before the
  // result panel appears; wait until the panel (or the finale) is showing.
  const waitForResult = async () => {
    for (let i = 0; i < 40; i += 1) {
      const s = await lumen('screen()');
      if (s === 'level-done' || s === 'game-done') return s;
      await sleep(100);
    }
    return lumen('screen()');
  };
  const clickStage = async (x, y) => {
    const vw = page.viewportSize().width;
    const vh = page.viewportSize().height;
    await page.mouse.click((x / 1280) * vw, (y / 800) * vh);
    await sleep(150);
  };
  // Seed a save (v2 shape) and reload the game from it.
  const seedSave = async (save) => {
    await page.evaluate((s) => window.localStorage.setItem('lumen-lines-save-v2', JSON.stringify(s)), save);
    await page.goto(`${BASE}/?debug=1`, { waitUntil: 'networkidle' });
    await sleep(400);
  };
  const seedStars = (entries) => {
    const stars = Array(12).fill(0);
    const bestMoves = Array(12).fill(undefined);
    for (const [i, s, m] of entries) {
      stars[i] = s;
      bestMoves[i] = m;
    }
    return { stars, bestMoves, muted: false, reducedMotion: false };
  };
  const PARS = [1, 2, 3, 5, 1, 3, 4, 4, 4, 2, 4, 6];
  // The real clicks that solve level 12 (index 11).
  const solveLevel12 = async () => {
    await clickCell(2, 0);
    await clickCell(4, 0);
    await clickCell(5, 1);
    await clickCell(4, 3); // combiner ^ -> >
    await clickCell(6, 5); // select the wandering mirror
    await clickCell(5, 6); // move it to the socket
    await clickCell(5, 6); // select it again
    await clickCell(5, 6); // rotate it m -> M
  };

  await page.goto(`${BASE}/?debug=1`, { waitUntil: 'networkidle' });
  await sleep(400);
  check('title screen shows', (await lumen('screen()')) === 'title');

  await page.keyboard.press('Space');
  await sleep(200);
  check('Space opens level select', (await lumen('screen()')) === 'levels');

  // Chapter 1: level 1 from the map, won with one real click.
  await clickCard(0);
  check('clicking level 1 card starts it', (await lumen('screen()')) === 'play' && (await lumen('run().index')) === 0);
  await clickCell(3, 3);
  check('rotating the mirror wins level 1', (await lumen('run().won')) === true);
  check('celebration holds the solved circuit first', (await lumen('celebrating()')) === true && (await lumen('screen()')) === 'play');
  // A click during the celebration skips straight to the result.
  await clickStage(640, 400);
  check('click skips the celebration to the result', (await lumen('screen()')) === 'level-done');
  check('win panel shows', (await lumen('screen()')) === 'level-done');
  check('3 stars at par', (await lumen('stars()'))[0] === 3);
  check('score is 330 (3 stars, 1 move at par 1)', (await lumen('score()')) === 330);

  // N moves to level 2.
  await page.keyboard.press('n');
  await sleep(200);
  check('N starts level 2', (await lumen('screen()')) === 'play' && (await lumen('run().index')) === 1);

  // Undo: rotate once, undo, the move and the tile both come back.
  await clickCell(6, 1);
  const usedAfterRotate = await lumen('run().movesUsed');
  const tileAfterRotate = await lumen('run().board.tiles[1][6]');
  await page.keyboard.press('u');
  await sleep(150);
  check('undo refunds the move', usedAfterRotate === 1 && (await lumen('run().movesUsed')) === 0);
  check('undo restores the tile', tileAfterRotate === '\\' && (await lumen('run().board.tiles[1][6]')) === '/');

  // Restart resets moves and tiles.
  await clickCell(6, 1);
  await page.keyboard.press('r');
  await sleep(200);
  check('R restarts the level', (await lumen('run().movesUsed')) === 0 && (await lumen('run().board.tiles[1][6]')) === '/');

  // Hints cycle through 3 stages, the third naming a specific tile.
  await page.keyboard.press('h');
  await sleep(120);
  const hint1 = await lumen('run().hintText');
  check('hint stage 1 shows', (await lumen('run().hintStage')) === 1 && hint1.length > 10, hint1);
  await page.keyboard.press('h');
  await sleep(120);
  check('hint stage 2 shows', (await lumen('run().hintStage')) === 2 && (await lumen('run().hintText')).length > 10);
  await page.keyboard.press('h');
  await sleep(120);
  const hint3 = await lumen('run().hintText');
  check('hint stage 3 names a tile', (await lumen('run().hintStage')) === 3 && /column 7, row 2/.test(hint3), hint3);

  // Wasting moves never fails in v2: the level just stays in play.
  for (let i = 0; i < 10; i += 1) await clickCell(6, 1);
  check('no fail state after wasted moves', (await lumen('screen()')) === 'play');

  // Keyboard play: arrows move the cursor, Space rotates the selected tile.
  await page.keyboard.press('r');
  await sleep(200);
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  await sleep(200);
  check('arrow keys + Space rotates a tile', (await lumen('run().movesUsed')) === 1);

  // Mute toggle persists to the save.
  await page.keyboard.press('m');
  await sleep(120);
  const mutedSaved = await page.evaluate(() => JSON.parse(window.localStorage.getItem('lumen-lines-save-v2') ?? '{}').muted);
  check('M mutes and saves the preference', mutedSaved === true);
  await page.keyboard.press('m');
  await sleep(120);

  // Chapter 2: First Colours (index 4), won with one click on the splitter.
  await lumen('jump(4)');
  await sleep(200);
  check('jump to chapter 2 level', (await lumen('run().index')) === 4);
  await clickCell(3, 3);
  await waitForResult();
  check('splitter click wins First Colours', (await lumen('run().won')) === true && (await lumen('screen()')) === 'level-done');

  // Movable mirror by keyboard: jump to The Wandering Mirror (index 9).
  // Selection starts at the source (0,3); carry the mirror from (5,5) to (3,3).
  await lumen('jump(9)');
  await sleep(200);
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 2; i += 1) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('g');
  await sleep(150);
  check('G picks up the movable mirror', (await lumen('carry()')) !== null);
  for (let i = 0; i < 2; i += 1) await page.keyboard.press('ArrowLeft');
  for (let i = 0; i < 2; i += 1) await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space'); // drop on the socket at (3,3)
  await sleep(200);
  check('Space drops the mirror on the socket', (await lumen('run().board.tiles[3][3]')) === 'm' && (await lumen('run().movesUsed')) === 1);
  // Undo restores the moved mirror to its socket.
  await page.keyboard.press('u');
  await sleep(150);
  check('undo restores a moved mirror', (await lumen('run().board.tiles[5][5]')) === 'm'
    && (await lumen('run().board.tiles[3][3]')) === '.' && (await lumen('run().movesUsed')) === 0);
  // Carry it again, drop it, then rotate it to win.
  for (let i = 0; i < 2; i += 1) await page.keyboard.press('ArrowDown');
  for (let i = 0; i < 2; i += 1) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('g');
  await sleep(120);
  for (let i = 0; i < 2; i += 1) await page.keyboard.press('ArrowLeft');
  for (let i = 0; i < 2; i += 1) await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');
  await sleep(200);
  await page.keyboard.press('Space'); // rotate the dropped mirror m -> M
  await waitForResult();
  check('keyboard carry + rotate wins The Wandering Mirror', (await lumen('run().won')) === true
    && (await lumen('run().movesUsed')) === 2);

  // Chapter 3: Joining Lights (index 8), won with real clicks on each diff.
  await lumen('jump(8)');
  await sleep(200);
  await clickCell(2, 0);
  await clickCell(5, 0);
  await clickCell(2, 6);
  await clickCell(5, 3); // combiner ^ -> >
  await waitForResult();
  check('clicks win Joining Lights (combiner joins red+green)', (await lumen('run().won')) === true);

  // Small viewport: hit-testing still lands on the right cell.
  await page.setViewportSize({ width: 900, height: 600 });
  await lumen('jump(0)');
  await sleep(200);
  await clickCell(3, 3);
  await sleep(300);
  check('small viewport hit-test still correct', (await lumen('run().won')) === true);
  await page.setViewportSize({ width: 1280, height: 800 });
  await sleep(200);

  // Fullscreen: hit-testing still lands on the right cell.
  await page.evaluate(() => document.documentElement.requestFullscreen().catch(() => {}));
  await sleep(300);
  await lumen('jump(0)');
  await sleep(200);
  await clickCell(3, 3);
  await sleep(300);
  check('fullscreen hit-test still correct', (await lumen('run().won')) === true);
  await page.evaluate(() => document.exitFullscreen().catch(() => {}));
  await sleep(200);

  // Final restoration: The Observatory Restored (index 11) by mouse, including
  // carrying the wandering mirror to its socket and turning it. Only 5 of 12
  // levels are solved at this point, so this is a level result, NOT the
  // campaign finale.
  await lumen('jump(11)');
  await sleep(200);
  await solveLevel12();
  await waitForResult();
  check('final level wins: the observatory level is restored', (await lumen('run().won')) === true);
  check('solving level 12 alone is a level result, not the finale', (await lumen('screen()')) === 'level-done'
    && (await lumen('campaignComplete()')) === false && (await lumen('completedCount()')) === 5);
  check('final level earned 3 stars', (await lumen('stars()'))[11] === 3);

  // ---- v2.1 scenarios ------------------------------------------------------
  // Fresh save: solve ONLY level 12 -> campaign incomplete, 1 of 12.
  await seedSave(seedStars([]));
  check('fresh save scores 0', (await lumen('score()')) === 0);
  await lumen('jump(11)');
  await sleep(200);
  await solveLevel12();
  await waitForResult();
  check('fresh save + level 12 only: level-done, not game-done', (await lumen('screen()')) === 'level-done');
  check('fresh save + level 12 only: 1 of 12 restored', (await lumen('completedCount()')) === 1);
  check('fresh save + level 12 only: score 330', (await lumen('score()')) === 330);
  // Replay level 12 at par: no duplicate points.
  await page.keyboard.press('r');
  await sleep(200);
  await solveLevel12();
  await waitForResult();
  check('replaying level 12 at par adds no points', (await lumen('score()')) === 330);
  // View solution: panel dismisses, solved circuit stays visible and frozen.
  await clickStage(950, 648); // "View solution" button in the side panel
  await sleep(200);
  check('View solution shows the solved board', (await lumen('screen()')) === 'play' && (await lumen('resultHidden()')) === true);
  check('solved beams stay visible behind the dismissed panel', (await lumen('run().trace.segments.length')) > 0);
  const movesBefore = await lumen('run().movesUsed');
  await clickCell(2, 0);
  check('extra clicks on a solved board add no moves', (await lumen('run().movesUsed')) === movesBefore);
  await page.keyboard.press('Enter');
  await sleep(200);
  check('Enter brings the result panel back', (await lumen('screen()')) === 'level-done');
  // Next unfinished goes to level 1 (the first unsolved level).
  await page.keyboard.press('n');
  await sleep(200);
  check('Next unfinished starts level 1', (await lumen('screen()')) === 'play' && (await lumen('run().index')) === 0);

  // Improve a result: only the difference is reflected; a worse replay keeps the best.
  await seedSave(seedStars([[0, 1, 5]])); // level 1 solved sloppily: 1 star, 100 pts
  check('sloppy level 1 scores 100', (await lumen('score()')) === 100);
  await lumen('jump(0)');
  await sleep(200);
  await clickCell(3, 3);
  await waitForResult();
  check('improving level 1 to par scores 330 (+230 only)', (await lumen('score()')) === 330);
  await page.keyboard.press('r');
  await sleep(200);
  for (let i = 0; i < 5; i += 1) await clickCell(3, 3); // wins again at 3 moves: 2 stars, worse than the par best
  await waitForResult();
  check('worse replay preserves the best (still 330, 3 stars, best 1)', (await lumen('score()')) === 330
    && (await lumen('stars()'))[0] === 3 && (await lumen('bestMoves()'))[0] === 1);
  // Reload: totals are identical.
  await page.goto(`${BASE}/?debug=1`, { waitUntil: 'networkidle' });
  await sleep(400);
  check('reload preserves score/stars/completion', (await lumen('score()')) === 330
    && (await lumen('stars()'))[0] === 3 && (await lumen('completedCount()')) === 1);

  // Out-of-order finale: 11 solved, the skipped level 1 completed last.
  const eleven = PARS.map((par, i) => [i, 3, par]).filter(([i]) => i !== 0);
  await seedSave(seedStars(eleven));
  check('11 of 12 solved: not complete, score 3630', (await lumen('campaignComplete()')) === false
    && (await lumen('score()')) === 3630);
  await lumen('jump(0)');
  await sleep(200);
  await clickCell(3, 3);
  const finaleScreen = await waitForResult();
  check('skipped level completed last shows the genuine finale', finaleScreen === 'game-done'
    && (await lumen('campaignComplete()')) === true && (await lumen('score()')) === 3960);
  check('36/36 stars is a perfect campaign', (await lumen('perfect()')) === true && (await lumen('totalStars()')) === 36);
  // The finale's Level select button works, and the map offers the observatory back.
  await clickStage(510, 650); // finale "Level select"
  await sleep(200);
  check('finale Level select returns to the map', (await lumen('screen()')) === 'levels');
  await clickStage(1045, 738); // "View the restored observatory"
  await sleep(200);
  check('returning player can revisit the restored observatory', (await lumen('screen()')) === 'game-done');

  // All levels complete below perfect stars: complete, mastery incomplete.
  const twoStars = PARS.map((par, i) => [i, 2, par + 2]);
  await seedSave(seedStars(twoStars));
  check('all levels at 2 stars: complete but not perfect', (await lumen('campaignComplete()')) === true
    && (await lumen('perfect()')) === false && (await lumen('totalStars()')) === 24);
  check('all levels at 2 stars: score 2520', (await lumen('score()')) === 2520);
  await page.keyboard.press('Space');
  await sleep(200);
  await clickStage(1045, 738);
  await sleep(200);
  check('below-perfect finale still shows the observatory', (await lumen('screen()')) === 'game-done');

  // A genuine v2 save (stale cumulative `best` included) keeps its progress.
  await seedSave({ stars: [3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], bestMoves: [1, 2], muted: false, best: 9999 });
  check('v2 save keeps 2 levels, derived score 660 (not stale 9999)', (await lumen('completedCount()')) === 2
    && (await lumen('score()')) === 660);

  // A malformed save loads without errors and degrades to blank.
  await page.evaluate(() => window.localStorage.setItem('lumen-lines-save-v2', '{"stars":"nope","bestMoves":[null,-3]}'));
  await page.goto(`${BASE}/?debug=1`, { waitUntil: 'networkidle' });
  await sleep(400);
  check('malformed save degrades to blank', (await lumen('score()')) === 0 && (await lumen('screen()')) === 'title');

  // Carry cancellation costs no move and leaves the board unchanged.
  await seedSave(seedStars([]));
  await lumen('jump(9)');
  await sleep(200);
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 2; i += 1) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('g');
  await sleep(120);
  check('G picks up the mirror (v2.1)', (await lumen('carry()')) !== null);
  await page.keyboard.press('Escape');
  await sleep(150);
  check('Esc cancels the carry with no move spent', (await lumen('carry()')) === null
    && (await lumen('run().movesUsed')) === 0 && (await lumen('run().board.tiles[5][5]')) === 'm');
  // Clicking a non-socket while carrying explains itself and stays carrying.
  await page.keyboard.press('g');
  await sleep(120);
  await clickCell(0, 0);
  check('invalid destination keeps the carry and explains why', (await lumen('carry()')) !== null
    && (await lumen('run().movesUsed')) === 0 && (await lumen('carryMessage()')).length > 10);
  await page.keyboard.press('Escape');
  await sleep(120);
  // Mouse-only movable-mirror completion via the visible action buttons.
  await clickCell(5, 5); // select the mirror
  await sleep(120);
  check('clicking a mirror exposes Rotate / Move / Cancel', (await lumen('selectedMovable()')) !== null);
  await clickStage(937, 726); // "Move (G)" button
  await sleep(150);
  check('Move button picks the mirror up', (await lumen('carry()')) !== null);
  await clickCell(3, 3); // the glowing socket
  await sleep(150);
  check('clicking a socket places the mirror (1 move)', (await lumen('run().board.tiles[3][3]')) === 'm'
    && (await lumen('run().movesUsed')) === 1);
  await clickCell(3, 3); // select it again
  await clickStage(775, 726); // "Rotate" button
  await waitForResult();
  check('Rotate button turns the placed mirror and wins, mouse-only', (await lumen('run().won')) === true
    && (await lumen('run().movesUsed')) === 2);

  // Reduced motion persists to the save.
  await lumen('jump(0)');
  await sleep(200);
  await page.keyboard.press('t');
  await sleep(120);
  const rmSaved = await page.evaluate(() => JSON.parse(window.localStorage.getItem('lumen-lines-save-v2') ?? '{}').reducedMotion);
  check('T toggles reduced motion and saves it', rmSaved === true && (await lumen('reducedMotion()')) === true);
  await page.keyboard.press('t');
  await sleep(120);

  // Screenshots: each staged scene, waited on until the game says it is ready.
  // Clear the save first so the cover shows a fresh player, not this run.
  await page.evaluate(() => window.localStorage.clear());
  for (const shot of SHOTS) {
    await page.goto(`${BASE}/${shot.query}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 10000 });
    const path = join(root, 'screenshots', shot.name);
    await page.screenshot({ path, type: 'jpeg', quality: 82 });
    const size = statSync(path).size;
    check(`screenshot ${shot.name} under 256 KiB`, size <= 262144, `${size} bytes`);
  }

  const external = requests.filter((url) => !url.startsWith(BASE));
  check('no network request leaves localhost', external.length === 0, external.join(', ') || `${requests.length} local requests`);
  check('no console errors or page errors', errors.length === 0, errors.join(' | '));

  await browser.close();
} finally {
  server.kill();
}

const failed = results.filter((r) => !r.passed).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
