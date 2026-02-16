/**
 * Stats viewer — historical replay of completed rounds.
 * Shows per-turn snapshots: hands, melds, win likelihood, actions.
 * Anti-cheat: only completed rounds are viewable.
 * Shell is created once; content updates without flash.
 * @module ui/statsViewer
 */

import { renderCard } from './cards.js';

/**
 * Open the stats viewer overlay.
 * @param {Array<Array<object>>} completedRounds — array of rounds, each an array of snapshots
 */
export function showStatsViewer(completedRounds) {
    if (!completedRounds || completedRounds.length === 0) return;

    // Remove existing overlay if present
    document.getElementById('stats-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'overlay stats-overlay';
    overlay.id = 'stats-overlay';

    let selectedRound = completedRounds.length - 1;
    let selectedTurn = 0;

    // Build shell once — never replaced
    overlay.innerHTML = `
        <div class="overlay__panel stats-panel" id="stats-panel-shell">
            <div class="stats-panel__header">
                <h2 class="overlay__title">📊 Game Stats</h2>
                <button class="stats-close" id="stats-close">✕</button>
            </div>
            <div id="stats-content"></div>
        </div>
    `;

    const contentEl = overlay.querySelector('#stats-content');

    /**
     * Update only the inner content — no shell rebuild, no animation flash.
     */
    function updateContent() {
        const round = completedRounds[selectedRound];
        const snap = round[selectedTurn];

        const roundTabs = completedRounds.map((_, i) => {
            const active = i === selectedRound ? 'stats-tab--active' : '';
            return `<button class="stats-tab ${active}" data-round="${i}">Round ${i + 1}</button>`;
        }).join('');

        const playerPanels = snap.players.map((p, pIdx) => {
            const likePct = Math.round((snap.winLikelihood[pIdx] || 0) * 100);

            // Render hand with green highlights for added cards
            const addedSet = new Set(p.addedCardIds || []);
            const handCards = p.hand.map(c => {
                const el = renderCard(c, { table: true });
                if (addedSet.has(c.id)) {
                    el.classList.add('card--highlight-added');
                }
                return el.outerHTML;
            }).join('');

            // Render removed cards (red highlights) in a separate row
            const removedCards = (p.removedCards || []);
            let removedHTML = '';
            if (removedCards.length > 0) {
                const removedCardsHTML = removedCards.map(c => {
                    const el = renderCard(c, { table: true });
                    el.classList.add('card--highlight-removed');
                    return el.outerHTML;
                }).join('');
                removedHTML = `
                    <div class="stats-player__removed">
                        <span class="stats-player__removed-label">Discarded / Melded:</span>
                        <div class="stats-player__removed-cards">${removedCardsHTML}</div>
                    </div>
                `;
            }

            return `
                <div class="stats-player">
                    <div class="stats-player__header">
                        <span class="stats-player__name">${p.name}</span>
                        <span class="stats-player__info">${p.handSize} cards • ${p.handPoints} pts • Score: ${p.score}</span>
                        <span class="stats-player__opened">${p.hasOpened ? '✓ Opened' : '✗ Not opened'}</span>
                    </div>
                    <div class="stats-likelihood">
                        <div class="stats-likelihood__label">Win Likelihood</div>
                        <div class="stats-likelihood__bar-bg">
                            <div class="stats-likelihood__bar-fill" style="width: ${likePct}%"></div>
                        </div>
                        <span class="stats-likelihood__pct">${likePct}%</span>
                    </div>
                    <div class="stats-player__hand">${handCards}</div>
                    ${removedHTML}
                </div>
            `;
        }).join('');

        const meldsHTML = snap.tableMelds.length > 0
            ? snap.tableMelds.map(m => {
                const ownerName = snap.players[m.owner]?.name || '?';
                const cards = m.cards.map(c => renderCard(c, { table: true }).outerHTML).join('');
                return `<div class="stats-meld"><span class="stats-meld__owner">${ownerName}</span>${cards}</div>`;
            }).join('')
            : '<span class="stats-meld--empty">No melds on table</span>';

        contentEl.innerHTML = `
            <div class="stats-tabs">${roundTabs}</div>

            <div class="stats-turn-nav">
                <button class="stats-turn-btn" id="turn-prev" ${selectedTurn === 0 ? 'disabled' : ''}>◀</button>
                <div class="stats-turn-slider">
                    <input type="range" min="0" max="${round.length - 1}" value="${selectedTurn}"
                           id="turn-slider" class="stats-slider" />
                    <span class="stats-turn-label">Turn ${selectedTurn + 1} / ${round.length}</span>
                </div>
                <button class="stats-turn-btn" id="turn-next" ${selectedTurn >= round.length - 1 ? 'disabled' : ''}>▶</button>
            </div>

            ${snap.actionDescription ? `<div class="stats-action">${snap.actionDescription}</div>` : ''}

            <div class="stats-game-info">
                <span>Stock: ${snap.stockCount}</span>
                <span>Discard: ${snap.discardPileSize}</span>
                <span>Phase: ${snap.phase}</span>
            </div>

            <div class="stats-players">${playerPanels}</div>

            <div class="stats-melds-section">
                <h3 class="stats-section-title">Table Melds</h3>
                <div class="stats-melds">${meldsHTML}</div>
            </div>
        `;

        // Wire content-level events
        contentEl.querySelectorAll('.stats-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                selectedRound = parseInt(btn.dataset.round, 10);
                selectedTurn = 0;
                updateContent();
            });
        });
        contentEl.querySelector('#turn-prev')?.addEventListener('click', () => {
            if (selectedTurn > 0) { selectedTurn--; updateContent(); }
        });
        contentEl.querySelector('#turn-next')?.addEventListener('click', () => {
            if (selectedTurn < round.length - 1) { selectedTurn++; updateContent(); }
        });
        contentEl.querySelector('#turn-slider')?.addEventListener('input', (e) => {
            selectedTurn = parseInt(e.target.value, 10);
            updateContent();
        });
    }

    // Wire shell-level events (once)
    overlay.querySelector('#stats-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });

    // Initial content render
    updateContent();
    document.body.appendChild(overlay);
}
