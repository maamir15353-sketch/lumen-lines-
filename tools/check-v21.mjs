// v2.1 checks for Lumen Lines: campaign completion and scoring rules, run in
// node against state.js (no browser needed). Covers: completion derived from
// ALL levels (never the current index); campaign score as the sum of best
// per-level results; replays never inflating the total; better results
// replacing, worse replays preserving; reload consistency (derived, not
// accumulated); v2 save migration (stale cumulative `best` ignored, real
// progress kept); malformed saves handled gracefully; perfect (36/36) kept
// separate from campaign completion; next-unfinished derivation.
//
// Usage: node tools/check-v21.mjs — exits non-zero on any failure.

import {
  blankSave, sanitizeSave, campaignScore, completedCount, isCampaignComplete,
  isPerfectCampaign, totalStarsEarned, nextUnfinishedIndex, recordResult,
  levelScore, starsFor,
} from '../game/src/state.js';
import { LEVELS } from '../game/src/levels.js';

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const PAR_SCORE = 330; // levelScore(3, par, par) for every level

// --- Completion is derived from all levels ----------------------------------
{
  const save = blankSave();
  save.stars[11] = 3;
  save.bestMoves[11] = LEVELS[11].par;
  check('solving only level 12 is NOT campaign complete', !isCampaignComplete(save));
  check('solving only level 12 counts as 1 of 12', completedCount(save) === 1, `${completedCount(save)}`);
  check('solving only level 12 scores one level only', campaignScore(save) === PAR_SCORE, `${campaignScore(save)}`);
}
{
  const save = blankSave();
  for (let i = 0; i < 11; i += 1) { save.stars[i] = 3; save.bestMoves[i] = LEVELS[i].par; }
  check('11 of 12 solved is NOT campaign complete', !isCampaignComplete(save));
  check('next unfinished is the missing level', nextUnfinishedIndex(save) === 11, `${nextUnfinishedIndex(save)}`);
  recordResult(save, 11, LEVELS[11].par, LEVELS[11].par);
  check('earlier skipped level completed last DOES complete the campaign', isCampaignComplete(save));
  check('all 12 at par score 3960', campaignScore(save) === 12 * PAR_SCORE, `${campaignScore(save)}`);
}
{
  // Out-of-order: solve level 12 first, then the rest in reverse order.
  const save = blankSave();
  recordResult(save, 11, 6, 6);
  for (let i = 10; i >= 0; i -= 1) {
    recordResult(save, i, LEVELS[i].par, LEVELS[i].par);
    check(`after solving level ${i + 1}, campaign ${i === 0 ? 'complete' : 'incomplete'}`, isCampaignComplete(save) === (i === 0));
  }
  check('reverse-order completion completes the campaign', isCampaignComplete(save));
}

// --- Campaign complete vs perfect -------------------------------------------
{
  const save = blankSave();
  for (let i = 0; i < 12; i += 1) { save.stars[i] = 2; save.bestMoves[i] = LEVELS[i].par + 2; }
  check('all levels at 2 stars: campaign complete', isCampaignComplete(save));
  check('all levels at 2 stars: NOT perfect', !isPerfectCampaign(save));
  check('all levels at 2 stars: 24 of 36 stars', totalStarsEarned(save) === 24, `${totalStarsEarned(save)}`);
  const save2 = blankSave();
  for (let i = 0; i < 12; i += 1) { save2.stars[i] = 3; save2.bestMoves[i] = LEVELS[i].par; }
  check('36/36 stars: campaign complete AND perfect', isCampaignComplete(save2) && isPerfectCampaign(save2));
}

// --- Scoring: replays, improvements, reloads --------------------------------
{
  const save = blankSave();
  const r1 = recordResult(save, 0, 1, 1);
  check('first solve at par: 3 stars, 330 points', r1.stars === 3 && r1.score === PAR_SCORE, JSON.stringify(r1));
  check('campaign score after one level is 330', campaignScore(save) === PAR_SCORE);
  const before = campaignScore(save);
  recordResult(save, 0, 1, 1); // replay at par again
  check('replaying at par adds nothing', campaignScore(save) === before, `${campaignScore(save)}`);
  recordResult(save, 0, 4, 1); // worse replay (1 star)
  check('worse replay preserves the previous best', campaignScore(save) === before && save.stars[0] === 3 && save.bestMoves[0] === 1);
  recordResult(save, 0, 1, 1);
  check('replaying easy level repeatedly never inflates', campaignScore(save) === before);
}
{
  // Improve a result: only the difference is reflected.
  const save = blankSave();
  recordResult(save, 0, 5, 1); // 1 star: 100 + 0 = 100
  check('sloppy solve scores 100', campaignScore(save) === 100, `${campaignScore(save)}`);
  recordResult(save, 0, 1, 1); // now 3 stars at par: 330
  check('improving replaces the level contribution (+230 only)', campaignScore(save) === PAR_SCORE, `${campaignScore(save)}`);
  recordResult(save, 0, 2, 1); // 2 stars: 200 + 20 = 220 — worse than best, ignored
  check('a middling replay after a perfect one changes nothing', campaignScore(save) === PAR_SCORE);
}
{
  // Reload consistency: the score is derived from the save, so re-reading
  // the same save gives the same totals (no session accumulator exists).
  const save = blankSave();
  recordResult(save, 0, 1, 1);
  recordResult(save, 4, 1, 1);
  const json = JSON.stringify({ ...save, best: campaignScore(save) });
  const reloaded = sanitizeSave(JSON.parse(json));
  check('reload preserves score', campaignScore(reloaded) === campaignScore(save));
  check('reload preserves stars', LEVELS.every((_, i) => (reloaded.stars[i] ?? 0) === (save.stars[i] ?? 0)));
  check('reload preserves completion', isCampaignComplete(reloaded) === isCampaignComplete(save));
  check('reload preserves best moves', JSON.stringify(reloaded.bestMoves) === JSON.stringify(save.bestMoves));
}

// --- v2 save migration -------------------------------------------------------
{
  // A genuine v2 save: stars + best moves kept, stale cumulative `best`
  // (which replays had inflated) ignored in favour of the derived total.
  const v2 = { stars: [3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], bestMoves: [1, 2], muted: true, best: 9999 };
  const save = sanitizeSave(v2);
  check('v2 save keeps legitimate progress (2 levels)', completedCount(save) === 2);
  check('v2 save keeps mute preference', save.muted === true);
  check('v2 stale cumulative best is ignored (derived 660, not 9999)', campaignScore(save) === 660, `${campaignScore(save)}`);
  recordResult(save, 0, 1, 1);
  check('replaying a v2-solved level does not inflate the migrated total', campaignScore(save) === 660);
}
{
  // A v2 save with stars but a missing best-moves entry: treated as par.
  const save = sanitizeSave({ stars: [3], bestMoves: [] });
  check('stars without best moves default to par', save.bestMoves[0] === 1 && campaignScore(save) === PAR_SCORE);
}

// --- Malformed saves ----------------------------------------------------------
{
  const save = sanitizeSave({ stars: 'nope', bestMoves: [null, -3, 'x', 2.5], muted: 'yes' });
  check('malformed stars/bestMoves degrade to blank without throwing', completedCount(save) === 0 && campaignScore(save) === 0);
  check('malformed muted is false, not truthy', save.muted === false);
  const save2 = sanitizeSave(JSON.parse('{"stars":[9,-1,2.9,"3",null]}'));
  check('out-of-range stars are clamped/dropped', save2.stars[0] === 3 && save2.stars[1] === 0 && save2.stars[2] === 0 && save2.stars[3] === 0);
  check('malformed save still yields 12 level slots', save2.stars.length === LEVELS.length);
  const save3 = sanitizeSave(null);
  check('null save is blank', completedCount(save3) === 0);
  const save4 = sanitizeSave('garbage');
  check('non-object save is blank', completedCount(save4) === 0);
}

// --- Stars / points helpers ----------------------------------------------------
check('stars: at par is 3', starsFor(1, 1) === 3);
check('stars: par+3 is 2', starsFor(4, 1) === 2);
check('stars: beyond par+3 is 1', starsFor(5, 1) === 1);
check('levelScore: 3 stars at par is 330', levelScore(3, 1, 1) === 330);
check('levelScore: hint-free scoring has no hidden penalty term', levelScore(3, 6, 6) === 330);

const failed = results.filter((r) => !r.passed).length;
console.log(`\n${results.length - failed}/${results.length} v2.1 checks passed`);
process.exit(failed === 0 ? 0 : 1);
