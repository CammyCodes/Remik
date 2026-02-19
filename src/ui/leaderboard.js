/**
 * Leaderboard overlay — displays PvP rankings.
 * Fetches data from /api/leaderboard and renders a sortable table.
 * @module ui/leaderboard
 */

/**
 * Show the leaderboard overlay.
 * @param {string} [currentPlayerName=''] — highlight this player's row
 */
export async function showLeaderboard(currentPlayerName = '') {
    // Check if already open
    if (document.getElementById('leaderboard-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'leaderboard-overlay';
    overlay.className = 'leaderboard-overlay';

    overlay.innerHTML = `
        <div class="leaderboard-panel">
            <div class="leaderboard-panel__header">
                <h2>🏆 PvP Leaderboard</h2>
                <button class="leaderboard-panel__close" id="leaderboard-close-btn">✕</button>
            </div>
            <div class="leaderboard-panel__content" id="leaderboard-content">
                <div class="leaderboard-loading">Loading leaderboard…</div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Close handlers
    const closeBtn = document.getElementById('leaderboard-close-btn');
    closeBtn.addEventListener('click', hideLeaderboard);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) hideLeaderboard();
    });

    // Animate in
    requestAnimationFrame(() => overlay.classList.add('leaderboard-overlay--visible'));

    // Fetch data
    try {
        const res = await fetch('/api/leaderboard');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        renderLeaderboardTable(data, currentPlayerName);
    } catch (err) {
        const content = document.getElementById('leaderboard-content');
        if (content) {
            content.innerHTML = `<div class="leaderboard-empty">Could not load leaderboard.<br><small>${err.message}</small></div>`;
        }
    }
}

/**
 * Hide the leaderboard overlay.
 */
export function hideLeaderboard() {
    const overlay = document.getElementById('leaderboard-overlay');
    if (!overlay) return;
    overlay.classList.remove('leaderboard-overlay--visible');
    setTimeout(() => overlay.remove(), 300);
}

/**
 * Render the leaderboard table.
 * @param {Array<object>} entries
 * @param {string} currentPlayerName
 */
function renderLeaderboardTable(entries, currentPlayerName) {
    const content = document.getElementById('leaderboard-content');
    if (!content) return;

    if (!entries || entries.length === 0) {
        content.innerHTML = `
            <div class="leaderboard-empty">
                <p>🎴 No matches recorded yet.</p>
                <p><small>Play a multiplayer game to appear here!</small></p>
            </div>
        `;
        return;
    }

    const normalizedCurrent = (currentPlayerName || '').toLowerCase();

    const rows = entries.map(e => {
        const isMe = e.name.toLowerCase() === normalizedCurrent;
        const rowClass = isMe ? 'leaderboard-row leaderboard-row--me' : 'leaderboard-row';
        return `
            <tr class="${rowClass}">
                <td class="leaderboard-rank">${getRankBadge(e.rank)}</td>
                <td class="leaderboard-name">${escapeHtml(e.name)}${isMe ? ' <span class="leaderboard-tag">YOU</span>' : ''}</td>
                <td class="leaderboard-stat">${e.wins}</td>
                <td class="leaderboard-stat">${e.losses}</td>
                <td class="leaderboard-stat">${e.winRate}</td>
                <td class="leaderboard-stat">${e.totalScore}</td>
            </tr>
        `;
    }).join('');

    content.innerHTML = `
        <table class="leaderboard-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Player</th>
                    <th>Wins</th>
                    <th>Losses</th>
                    <th>Win Rate</th>
                    <th>Total Score</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    `;
}

/**
 * Get a styled rank badge.
 * @param {number} rank
 * @returns {string}
 */
function getRankBadge(rank) {
    if (rank === 1) return '<span class="leaderboard-medal leaderboard-medal--gold">🥇</span>';
    if (rank === 2) return '<span class="leaderboard-medal leaderboard-medal--silver">🥈</span>';
    if (rank === 3) return '<span class="leaderboard-medal leaderboard-medal--bronze">🥉</span>';
    return `<span class="leaderboard-rank-num">${rank}</span>`;
}

/**
 * Escape HTML to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
