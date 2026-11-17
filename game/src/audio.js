// Synthesised sound for Lumen Lines v2: no audio files, just a WebAudio
// oscillator. Every effect is a short envelope so a click, a lit crystal and a
// win all sound different, and the whole thing can be muted with one toggle.
// Audio starts only after a user gesture; nothing sounds per animation frame.
// "Light becomes music": each receiver has its own pentatonic note, and a win
// plays the receivers' notes in the order the beam reaches them, over a warm chord.

import { SAVE_KEY } from './config.js';

/** Pentatonic ladder, one note per receiver index: C5 D5 E5 G5 A5 C6 D6. */
const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66];
const NOTE_C6 = 1046.5;
const NOTE_E6 = 1318.5;

export function createAudio(save) {
  let context = null;
  let muted = save.muted === true;

  function ensureContext() {
    if (!context) {
      const AudioContext = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContext) return null;
      context = new AudioContext();
    }
    if (context.state === 'suspended') void context.resume();
    return context;
  }

  /** Play one tone: a sine that fades out over `seconds`, starting after `delay`. */
  function tone(freq, seconds, delay = 0, volume = 0.12, type = 'sine') {
    if (muted) return;
    const ctx = ensureContext();
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + seconds + 0.05);
  }

  /** Persist the mute preference through the v2 save. */
  function persistMuted() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      parsed.muted = muted;
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(parsed));
    } catch {
      // Storage can be off: the setting then lasts this visit only.
    }
  }

  return {
    get muted() {
      return muted;
    },
    toggleMuted() {
      muted = !muted;
      persistMuted();
      return muted;
    },
    /** A soft click for rotating a tile. */
    click() {
      tone(440, 0.06, 0, 0.06);
    },
    /** A quiet tick for moving the keyboard cursor. */
    tick() {
      tone(660, 0.03, 0, 0.03);
    },
    /** A gentle low thud for an invalid action (nothing there to turn). */
    thud() {
      tone(110, 0.18, 0, 0.1, 'triangle');
    },
    /** A soft pluck when a movable mirror is picked up or set down. */
    carry() {
      tone(392, 0.12, 0, 0.08, 'triangle');
    },
    /**
     * The crystal tone for receiver `index` (0-based): its pentatonic note,
     * with a soft fifth above it. Distinct per receiver, harmonious together.
     */
    crystal(index) {
      const base = PENTA[index % PENTA.length];
      tone(base, 0.4);
      tone(base * 1.5, 0.3, 0.05, 0.06);
    },
    /**
     * The completion phrase: the receivers' notes in the order the beam
     * reaches them, over a warm C-major chord.
     */
    winPhrase(arrivalOrder) {
      const notes = arrivalOrder.length > 0 ? arrivalOrder : [0];
      notes.forEach((id, i) => {
        const base = PENTA[id % PENTA.length];
        tone(base, 0.5, i * 0.16);
      });
      const chordAt = notes.length * 0.16;
      tone(523.25, 1.2, chordAt, 0.07);
      tone(659.25, 1.2, chordAt, 0.06);
      tone(783.99, 1.2, chordAt, 0.06);
      tone(NOTE_C6, 1.0, chordAt + 0.1, 0.05);
    },
    /** A bright fanfare for finishing the whole campaign. */
    fanfare() {
      const seq = [523.25, 659.25, 783.99, 1046.5, 880.0, 1046.5, 1318.5];
      seq.forEach((freq, i) => tone(freq, 0.35, i * 0.11, 0.1));
      tone(NOTE_E6, 1.0, seq.length * 0.11, 0.06);
    },
  };
}
