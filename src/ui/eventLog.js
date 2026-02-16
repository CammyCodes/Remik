/**
 * Event log panel — real-time scrollable history of game events.
 * @module ui/eventLog
 */

import { cardToString } from '../engine/card.js';

/**
 * Manages the event log panel on the right side of the game board.
 */
export class EventLog {
    constructor() {
        /** @type {Array<{ icon: string, text: string, type: string, timestamp: number }>} */
        this.entries = [];
        /** @type {HTMLElement|null} */
        this.container = null;
    }

    /**
     * Bind to a DOM container.
     * @param {HTMLElement} el
     */
    mount(el) {
        this.container = el;
        this.renderEntries();
    }

    /**
     * Add a new entry and re-render.
     * @param {string} icon
     * @param {string} text
     * @param {'action'|'info'|'round'|'error'} [type='action']
     */
    addEntry(icon, text, type = 'action') {
        this.entries.push({ icon, text, type, timestamp: Date.now() });
        this.renderEntries();
    }

    /**
     * Clear all entries (e.g. on new game).
     */
    clear() {
        this.entries = [];
        this.renderEntries();
    }

    /**
     * Serialise entries for saving.
     * @returns {Array}
     */
    toJSON() {
        return this.entries;
    }

    /**
     * Restore entries from saved data.
     * @param {Array} data
     */
    fromJSON(data) {
        if (!Array.isArray(data)) return;
        this.entries = data;
        this.renderEntries();
    }

    /**
     * Add a round separator.
     * @param {number} roundNumber
     */
    addRoundSeparator(roundNumber) {
        this.addEntry('🎯', `Round ${roundNumber} started`, 'round');
    }

    /**
     * Render entries into the container.
     */
    renderEntries() {
        if (!this.container) return;

        const html = this.entries.map(entry => {
            const time = new Date(entry.timestamp).toLocaleTimeString([], {
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
            return `
                <div class="event-log__entry event-log__entry--${entry.type}">
                    <span class="event-log__icon">${entry.icon}</span>
                    <span class="event-log__text">${entry.text}</span>
                    <span class="event-log__time">${time}</span>
                </div>
            `;
        }).join('');

        this.container.innerHTML = html;

        // Auto-scroll to bottom
        this.container.scrollTop = this.container.scrollHeight;
    }

    /**
     * Wire up to EventBus events for automatic logging.
     * @param {object} events — the EventBus instance
     * @param {Array<object>} players — player list for name lookup
     */
    subscribe(events, players) {
        events.on('draw', (data) => {
            const name = players[data.playerIndex].name;
            if (data.source === 'stock') {
                this.addEntry('📥', `${name} drew from stock`);
            } else {
                const cardStr = data.card ? cardToString(data.card) : '?';
                this.addEntry('📥', `${name} drew ${cardStr} from discard`);
            }
        });

        events.on('meld', (data) => {
            const name = players[data.playerIndex].name;
            const meldStrs = data.melds.map(meld =>
                meld.map(c => cardToString(c)).join(' ')
            );
            for (const ms of meldStrs) {
                this.addEntry('✅', `${name} played meld: ${ms}`);
            }
        });

        events.on('extend', (data) => {
            const name = players[data.playerIndex].name;
            const cardStr = data.cards.map(c => cardToString(c)).join(' ');
            this.addEntry('➕', `${name} extended meld: ${cardStr}`);
        });

        events.on('discard', (data) => {
            const name = players[data.playerIndex].name;
            const cardStr = data.card ? cardToString(data.card) : '?';
            this.addEntry('🗑️', `${name} discarded ${cardStr}`);
        });

        events.on('roundStart', (data) => {
            this.addRoundSeparator(data.roundNumber);
        });

        events.on('roundEnd', (data) => {
            const winnerName = data.winnerIndex !== null
                ? data.scores[data.winnerIndex].name
                : null;
            if (data.isRemik) {
                this.addEntry('🎉', `${winnerName} played REMIK!`, 'round');
            } else if (winnerName) {
                this.addEntry('🏆', `${winnerName} wins the round!`, 'round');
            } else {
                this.addEntry('📊', 'Stock exhausted — no winner', 'round');
            }
        });

        events.on('reshuffle', (data) => {
            this.addEntry('🔄', `Stock reshuffled (${data.stockCount} cards)`, 'info');
        });
    }
}
