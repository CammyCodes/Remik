/**
 * PvP Leaderboard — persisted to data/leaderboard.json.
 * Tracks wins, losses, and total score per player.
 * @module server/leaderboard
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const LB_FILE = path.join(DATA_DIR, 'leaderboard.json');

/**
 * Load leaderboard from disk.
 * @returns {Array<object>}
 */
function loadLeaderboard() {
    try {
        if (!fs.existsSync(LB_FILE)) return [];
        const raw = fs.readFileSync(LB_FILE, 'utf-8');
        return JSON.parse(raw);
    } catch {
        return [];
    }
}

/**
 * Save leaderboard to disk.
 * @param {Array<object>} entries
 */
function saveLeaderboard(entries) {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(LB_FILE, JSON.stringify(entries, null, 2), 'utf-8');
    } catch (err) {
        console.warn('saveLeaderboard: failed —', err.message);
    }
}

/**
 * Record a game result for a player.
 * @param {string} playerName
 * @param {boolean} won
 * @param {number} score — final score at end of game
 */
function recordResult(playerName, won, score) {
    const entries = loadLeaderboard();
    const normalizedName = playerName.trim();

    let entry = entries.find(e => e.name.toLowerCase() === normalizedName.toLowerCase());

    if (!entry) {
        entry = {
            name: normalizedName,
            wins: 0,
            losses: 0,
            totalScore: 0,
            gamesPlayed: 0,
            lastPlayed: Date.now()
        };
        entries.push(entry);
    }

    if (won) {
        entry.wins++;
    } else {
        entry.losses++;
    }
    entry.gamesPlayed++;
    entry.totalScore += score;
    entry.lastPlayed = Date.now();

    // Sort by wins descending, then by win rate
    entries.sort((a, b) => {
        const aRate = a.gamesPlayed > 0 ? a.wins / a.gamesPlayed : 0;
        const bRate = b.gamesPlayed > 0 ? b.wins / b.gamesPlayed : 0;
        if (b.wins !== a.wins) return b.wins - a.wins;
        return bRate - aRate;
    });

    // Keep top 100
    const trimmed = entries.slice(0, 100);
    saveLeaderboard(trimmed);
}

/**
 * Get the leaderboard (top 50).
 * @returns {Array<{ name: string, wins: number, losses: number, gamesPlayed: number, totalScore: number, winRate: string, lastPlayed: number }>}
 */
function getLeaderboard() {
    const entries = loadLeaderboard();
    return entries.slice(0, 50).map((e, i) => ({
        rank: i + 1,
        name: e.name,
        wins: e.wins,
        losses: e.losses,
        gamesPlayed: e.gamesPlayed,
        totalScore: e.totalScore,
        winRate: e.gamesPlayed > 0
            ? `${Math.round((e.wins / e.gamesPlayed) * 100)}%`
            : '0%',
        lastPlayed: e.lastPlayed
    }));
}

module.exports = {
    recordResult,
    getLeaderboard
};
