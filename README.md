# Lumen Lines

[![make.fun](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01)
[![rank](https://make.fun/badge/best-game-01/maamir15353-sketch/lumen-lines-/rank.svg)](https://make.fun/bounty/best-game-01)
[![reward](https://make.fun/badge/best-game-01/maamir15353-sketch/lumen-lines-/reward.svg)](https://make.fun/bounty/best-game-01)

**Lumen Lines** is an original light-bending puzzle game, built for the
[make.fun "Make the best game" bounty](https://make.fun/bounty/best-game-01).
Light becomes music: restore a dark abandoned celestial observatory by routing
coloured light through its instruments. Each crystal you wake adds a note; a
completed circuit plays a short harmonious phrase and lights another part of
the observatory.

## How to play

- **Goal:** light every receiver with EXACTLY the colour it needs — too much
  colour fails, too little fails. A receiver's required channels are shown as
  shapes under it: red ○, green △, blue □ — filled when that channel has
  arrived, outline when it has not. The panel lists each receiver, e.g.
  "needs red — receiving red+green (too much green)".
- **Light travels per colour.** The source emits white (red+green+blue).
  Beams never merge at crossings; each colour keeps its own route.
- **Click** a mirror (`/` or `\`), prism, splitter or combiner to turn it.
  The beams re-route live, so you can watch the light find — or miss — its
  targets. Click a wandering mirror once to select it: Rotate, Move and Cancel
  appear below the board (Move carries it — click a glowing socket to place
  it, 1 move; picking it up and cancelling cost nothing). Clicking a cell
  that cannot hold a mirror says why instead of dropping it.
- **Splitter** (`Y`/`y`): red goes straight, green turns one way, blue the
  other. **Combiner** (`^` `>` `v` `<`): beams entering from any side except
  the output side leave by the gold arrow, colour unchanged; a beam entering
  from the output side passes straight through.
- **No move limit, no fail screen.** Moves used are tracked against par for
  stars only: 3 stars at par, 2 within par+3, else 1. Score per level is
  stars×100 + max(0, par+3−moves used)×10, and the campaign score is the sum
  of each level's *best* result — replaying a level never adds points twice,
  a better result replaces that level's contribution, a worse replay keeps
  the previous best. Hints are free: they never cost moves, stars or points.
- **Keyboard:** arrows move the cursor, **Space**/**Enter** turns the selected
  tile, **G** picks up / drops a wandering mirror (arrows choose the socket,
  **Space** places it, **Esc** cancels the carry without changing the board),
  **U** undoes (unlimited, restores tiles, positions and move counts exactly),
  **R** restarts, **H** cycles the 3-stage hint, **L** level select, **Esc**
  pause / close, **M** sound, **T** reduced motion, **N** next unfinished
  level, **G** on a level result views the solved circuit, **?** how to play.
  A win holds the solved circuit briefly (click or press any key to skip),
  then the result panel appears beside the board — the beams stay visible,
  and extra clicks on a solved board change nothing.
- **Campaign completion** is counted from all 12 levels: solving level 12
  alone restores 1 of 12, and the true finale only appears when every level
  is solved — including an earlier skipped level finished last. Finishing
  all 12 below 36 stars still completes the campaign; 36/36 stars is a
  separate perfect-campaign acknowledgement. The restored observatory can be
  revisited from the level map afterwards. Progress is kept on your machine
  under `lumen-lines-save-v2` (in-memory fallback if storage is unavailable);
  v2 saves are read as-is — their stars and best moves are kept, the old
  cumulative score is ignored in favour of the derived total. The build
  identifier `v2.1` is shown in the top bar, so a cached build is obvious.
- **Hints** cycle 3 stages: (1) a pointer to a relevant cell, (2) the
  relationship to consider, (3) a specific move computed from the current
  board ("Rotate the mirror at column 4, row 3").
- **12 handcrafted levels in 3 chapters** — Reflection (mirrors + prisms),
  Spectrum (coloured receivers + splitter), Harmony (combiner + wandering
  mirrors + everything together) — ending with the restored observatory.
  The level select is a chapter map: each chapter's observatory illustration
  gains lit windows as its levels complete — the Spectrum chapter raises its
  telescope, Harmony adds brass rings and a constellation — and the fully
  restored observatory appears there once the campaign is complete. Stars and best moves are kept on
  your machine under `lumen-lines-save-v2` (in-memory fallback if storage is
  unavailable). The daily challenge was deliberately skipped: an unvalidated
  daily is worse than none.

## Play it

```sh
node serve.ts
# open http://localhost:8080 in a desktop browser
```

No build step, no network requests: `game/index.html` and its modules under
`game/` are all the game needs. Sounds are synthesised in the browser with
WebAudio — there are no audio files. Audio starts only after a gesture and is
fully playable muted.

## Verify it

```sh
node tools/check-levels.mjs   # every level: solution wins, start loses, par exact
node tools/check-sim.mjs      # simulator unit checks (mirrors, splitter, combiner, loops)
node tools/check-v21.mjs      # v2.1 completion + scoring rules (51 checks, no browser)
node tools/playtest.mjs       # headless Chromium: plays a level per chapter to a win,
                              # undo/restart/hints/keyboard/carry, resize + fullscreen,
                              # the v2.1 completion and scoring scenarios, and takes
                              # the 4 screenshots
MAKEFUN_OUTPUT_DIR=out node main.ts   # builds out/dossier.json
```

## Layout

- `game/` — the playable game as static files (`index.html`, `src/*.js`):
  `beam.js` per-channel simulation, `levels.js` level data,
  `state.js` state / snapshot undo / save, `render.js` drawing and hit areas,
  `audio.js` WebAudio synth, `input.js` input, `main.js` orchestration,
  `shots.js` screenshot scenes
- `screenshots/` — 4 screenshots taken from the game's own code in a browser
- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to `/output`
  and writes `/output/dossier.json` with the vendored make.fun library
- `vendor/makefun-game.ts` — the kit's library, unchanged
- `serve.ts` — a tiny static server for local play
- `tools/` — the checks that verified the levels and played the game

## License

MIT — see [LICENSE](LICENSE).
