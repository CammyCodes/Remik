/**
 * Sound manager — procedural audio via Web Audio API.
 * Zero external dependencies; all sounds are synthesized.
 * @module engine/soundManager
 */

/** @type {AudioContext|null} */
let ctx = null;

/** Lazily initialise AudioContext (must be after user gesture). */
function getContext() {
    if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (ctx.state === 'suspended') {
        ctx.resume();
    }
    return ctx;
}

/* ── Primitive helpers ── */

/**
 * Play a sine tone.
 * @param {number} freq
 * @param {number} duration — seconds
 * @param {number} [volume=0.15]
 * @param {number} [startTime]
 */
function sine(freq, duration, volume = 0.15, startTime) {
    const ac = getContext();
    const t = startTime ?? ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + duration);
}

/**
 * Play a frequency sweep.
 * @param {number} startFreq
 * @param {number} endFreq
 * @param {number} duration — seconds
 * @param {number} [volume=0.12]
 */
function sweep(startFreq, endFreq, duration, volume = 0.12) {
    const ac = getContext();
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.linearRampToValueAtTime(endFreq, t + duration);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + duration);
}

/**
 * Short noise burst (click / thud).
 * @param {number} duration — seconds
 * @param {number} [volume=0.08]
 */
function noiseBurst(duration, volume = 0.08) {
    const ac = getContext();
    const t = ac.currentTime;
    const bufferSize = Math.ceil(ac.sampleRate * duration);
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const src = ac.createBufferSource();
    const gain = ac.createGain();
    src.buffer = buffer;
    gain.gain.setValueAtTime(volume, t);
    src.connect(gain).connect(ac.destination);
    src.start(t);
}

/**
 * Square-wave buzz (error).
 * @param {number} freq
 * @param {number} duration
 * @param {number} [volume=0.10]
 */
function buzz(freq, duration, volume = 0.10) {
    const ac = getContext();
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + duration);
}

/* ── Public sound library ── */

/** Card click (generic tap). */
export function playCardClick() {
    sine(800, 0.05, 0.10);
}

/** Card selected (rising). */
export function playCardSelect() {
    sweep(600, 900, 0.08, 0.12);
}

/** Card deselected (falling). */
export function playCardDeselect() {
    sweep(900, 600, 0.08, 0.10);
}

/** Draw a card from stock/discard. */
export function playCardDraw() {
    sweep(400, 800, 0.12, 0.10);
}

/** Meld played successfully. */
export function playMeldSuccess() {
    const ac = getContext();
    const t = ac.currentTime;
    sine(523, 0.15, 0.12, t);        // C
    sine(659, 0.15, 0.10, t + 0.04); // E
    sine(784, 0.20, 0.10, t + 0.08); // G
}

/** Card discarded (thud). */
export function playDiscard() {
    sine(200, 0.10, 0.10);
    noiseBurst(0.06, 0.05);
}

/** Button click. */
export function playButtonClick() {
    noiseBurst(0.03, 0.06);
}

/** Round won — ascending arpeggio. */
export function playRoundWin() {
    const ac = getContext();
    const t = ac.currentTime;
    sine(523, 0.25, 0.12, t);        // C
    sine(659, 0.25, 0.12, t + 0.12); // E
    sine(784, 0.25, 0.12, t + 0.24); // G
    sine(1047, 0.35, 0.14, t + 0.36); // C5
}

/** Round lost — descending minor. */
export function playRoundLose() {
    const ac = getContext();
    const t = ac.currentTime;
    sine(523, 0.25, 0.10, t);        // C
    sine(466, 0.25, 0.10, t + 0.15); // Bb
    sine(392, 0.25, 0.10, t + 0.30); // G
    sine(330, 0.35, 0.10, t + 0.45); // E low
}

/** Error / invalid action. */
export function playError() {
    buzz(150, 0.15, 0.08);
}

/** Turn start — soft chime. */
export function playTurnStart() {
    sine(1000, 0.06, 0.08);
}

/** Extend meld — quick two-note. */
export function playExtend() {
    const ac = getContext();
    const t = ac.currentTime;
    sine(700, 0.10, 0.10, t);
    sine(880, 0.12, 0.10, t + 0.06);
}

/** Reshuffle stock — shuffling noise. */
export function playReshuffle() {
    for (let i = 0; i < 5; i++) {
        setTimeout(() => noiseBurst(0.04, 0.04), i * 40);
    }
}
