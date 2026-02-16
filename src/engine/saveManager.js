/**
 * Game save / load via localStorage.
 * Persists the full game state after every turn.
 * @module engine/saveManager
 */

const SAVE_KEY = 'remik_save';

/**
 * Persist current game state to localStorage.
 * @param {object} state — the full gameState object
 * @param {Array} [turnHistory] — optional turn tracker snapshots
 * @param {Array} [eventLogData] — optional event log entries
 */
export function saveGame(state, turnHistory = null, eventLogData = null) {
    try {
        const payload = {
            state: structuredClone(state),
            turnHistory: turnHistory ? structuredClone(turnHistory) : null,
            eventLog: eventLogData ? structuredClone(eventLogData) : null,
            savedAt: Date.now()
        };
        localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    } catch (err) {
        console.warn('saveGame: failed to persist —', err.message);
    }
}

/**
 * Load a previously saved game.
 * @returns {{ state: object, turnHistory: Array|null, savedAt: number }|null}
 */
export function loadGame() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/**
 * Delete the saved game.
 */
export function deleteSave() {
    localStorage.removeItem(SAVE_KEY);
}

/**
 * Check whether a save exists.
 * @returns {boolean}
 */
export function hasSave() {
    return localStorage.getItem(SAVE_KEY) !== null;
}
