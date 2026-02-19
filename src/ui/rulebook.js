/**
 * Rulebook overlay — displays game rules during gameplay.
 * Content sourced from REMIK.md, rendered as formatted HTML.
 * @module ui/rulebook
 */

/**
 * Show the rulebook overlay.
 */
export function showRulebook() {
    // Check if already open
    if (document.getElementById('rulebook-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'rulebook-overlay';
    overlay.className = 'rulebook-overlay';

    overlay.innerHTML = `
        <div class="rulebook-panel">
            <div class="rulebook-panel__header">
                <h2>📖 Remik — Rules</h2>
                <button class="rulebook-panel__close" id="rulebook-close-btn">✕</button>
            </div>
            <div class="rulebook-panel__content">
                ${getRulesHTML()}
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Close handlers
    const closeBtn = document.getElementById('rulebook-close-btn');
    closeBtn.addEventListener('click', hideRulebook);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) hideRulebook();
    });

    // Animate in
    requestAnimationFrame(() => overlay.classList.add('rulebook-overlay--visible'));
}

/**
 * Hide the rulebook overlay.
 */
export function hideRulebook() {
    const overlay = document.getElementById('rulebook-overlay');
    if (!overlay) return;
    overlay.classList.remove('rulebook-overlay--visible');
    setTimeout(() => overlay.remove(), 300);
}

/**
 * Get the rules as formatted HTML.
 * @returns {string}
 */
function getRulesHTML() {
    return `
        <section>
            <h3>🎯 Objective</h3>
            <p>Be the last player standing! Each round, get rid of all your cards by forming valid <strong>melds</strong>
            (sequences or groups). Players who accumulate too many penalty points are eliminated.</p>
        </section>

        <section>
            <h3>🃏 The Deck</h3>
            <ul>
                <li>2 standard 52-card decks + Jokers (configurable)</li>
                <li>Jokers are wild — they can substitute for any card in a meld</li>
                <li>Card values: A=11 (or 1 in low sequences), Face cards (J/Q/K)=10, Number cards=face value, Joker=50</li>
            </ul>
        </section>

        <section>
            <h3>📋 Setup</h3>
            <ul>
                <li>Starting player receives <strong>14 cards</strong> and must discard first (no draw)</li>
                <li>All other players receive <strong>13 cards</strong></li>
                <li>Remaining cards form the <strong>stock pile</strong></li>
            </ul>
        </section>

        <section>
            <h3>🔄 Turn Order</h3>
            <ol>
                <li><strong>Draw</strong> — Take 1 card from the stock pile OR the discard pile</li>
                <li><strong>Meld</strong> (optional) — Place valid melds on the table or add cards to existing melds</li>
                <li><strong>Discard</strong> — Place 1 card on the discard pile to end your turn</li>
            </ol>
        </section>

        <section>
            <h3>✅ Valid Melds</h3>
            <table class="rulebook-table">
                <thead>
                    <tr><th>Type</th><th>Description</th><th>Example</th></tr>
                </thead>
                <tbody>
                    <tr>
                        <td><strong>Sequence</strong></td>
                        <td>3+ consecutive cards of the same suit</td>
                        <td>5♥ 6♥ 7♥ or 10♠ J♠ Q♠ K♠</td>
                    </tr>
                    <tr>
                        <td><strong>Group</strong></td>
                        <td>3–4 cards of the same rank, different suits</td>
                        <td>8♠ 8♥ 8♦ or K♠ K♥ K♦ K♣</td>
                    </tr>
                </tbody>
            </table>
        </section>

        <section>
            <h3>🔓 Opening</h3>
            <p>Your first meld of each round must meet these requirements:</p>
            <ul>
                <li>Total value ≥ <strong>51 points</strong> (configurable)</li>
                <li>Must include at least one <strong>pure sequence</strong> (no Jokers)</li>
            </ul>
            <p>After opening, you may play any valid meld or extend melds already on the table.</p>
        </section>

        <section>
            <h3>⚠️ Discard Pile Rules</h3>
            <ul>
                <li>If you draw from the discard pile, you <strong>must</strong> use that card in a meld this turn</li>
                <li>You <strong>cannot</strong> discard the same card you just drew from the discard pile</li>
            </ul>
        </section>

        <section>
            <h3>🏆 Scoring</h3>
            <table class="rulebook-table">
                <thead>
                    <tr><th>Outcome</th><th>Points</th></tr>
                </thead>
                <tbody>
                    <tr><td>Round winner</td><td><strong>−10</strong> (subtracted from score)</td></tr>
                    <tr><td>Remik winner</td><td><strong>−20</strong> (all cards in one turn!)</td></tr>
                    <tr><td>Losers</td><td><strong>+penalty</strong> (sum of remaining card values)</td></tr>
                    <tr><td>Losers vs Remik</td><td><strong>+double penalty</strong></td></tr>
                </tbody>
            </table>
            <p>Players are <strong>eliminated</strong> when their score reaches the points limit (default: 501).</p>
        </section>

        <section>
            <h3>♠ Ace Rules</h3>
            <ul>
                <li>Ace can be <strong>high</strong> (after K: Q K A) — worth 11 points</li>
                <li>Ace can be <strong>low</strong> (before 2: A 2 3) — worth 1 point</li>
                <li>Ace <strong>cannot</strong> wrap around (K A 2 is invalid)</li>
            </ul>
        </section>

        <section>
            <h3>🎮 Joker Rules</h3>
            <ul>
                <li>Jokers substitute for any card in a meld</li>
                <li>Two Jokers <strong>cannot</strong> be adjacent in a sequence</li>
                <li>Jokers carry a <strong>50-point</strong> penalty if left in hand</li>
            </ul>
        </section>
    `;
}
