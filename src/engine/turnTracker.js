/**
 * Turn tracker — records per-turn snapshots for historical replay.
 * Calculates comparative win-likelihood heuristic for stats.
 * @module engine/turnTracker
 */

import { getCardValue } from './card.js';
import { findPossibleMelds } from './ai.js';

/**
 * Manages turn-by-turn snapshots across rounds.
 */
export class TurnTracker {
    constructor() {
        /** @type {Array<Array<object>>} Snapshots for completed rounds (viewable) */
        this.completedRounds = [];
        /** @type {Array<object>} Snapshots for the current round (NOT viewable) */
        this.currentRound = [];
        /** @type {number} */
        this.turnCounter = 0;
    }

    /**
     * Take a snapshot of the current game state.
     * Computes card diffs by comparing to the previous snapshot.
     * @param {object} state — full game state
     * @param {string} [actionDescription] — what just happened
     */
    takeSnapshot(state, actionDescription = '') {
        this.turnCounter++;

        const prevSnap = this.currentRound.length > 0
            ? this.currentRound[this.currentRound.length - 1]
            : null;

        const snapshot = {
            turnNumber: this.turnCounter,
            roundNumber: state.roundNumber,
            currentPlayerIndex: state.currentPlayerIndex,
            phase: state.phase,
            actionDescription,
            players: state.players.map((p, pIdx) => {
                const currentIds = new Set(p.hand.map(c => c.id));
                const prevIds = prevSnap
                    ? new Set(prevSnap.players[pIdx].hand.map(c => c.id))
                    : new Set();

                // Cards in current hand but not in previous = added (drawn)
                const addedCardIds = [...currentIds].filter(id => !prevIds.has(id));
                // Cards in previous hand but not in current = removed (discarded/melded)
                const removedCardIds = prevSnap
                    ? [...prevIds].filter(id => !currentIds.has(id))
                    : [];
                // Actual removed card objects from previous snapshot
                const removedCards = prevSnap
                    ? prevSnap.players[pIdx].hand.filter(c => removedCardIds.includes(c.id)).map(c => ({ ...c }))
                    : [];

                return {
                    name: p.name,
                    hand: p.hand.map(c => ({ ...c })),
                    handSize: p.hand.length,
                    handPoints: p.hand.reduce((sum, c) => sum + getCardValue(c, false), 0),
                    score: p.score,
                    hasOpened: p.hasOpened,
                    isHuman: p.isHuman,
                    addedCardIds,
                    removedCards
                };
            }),
            tableMelds: state.tableMelds.map(m => ({
                cards: m.cards.map(c => ({ ...c })),
                owner: m.owner
            })),
            discardPileSize: state.discardPile.length,
            discardPileTop: state.discardPile.length > 0
                ? { ...state.discardPile[state.discardPile.length - 1] }
                : null,
            stockCount: state.stock.length,
            winLikelihood: calculateComparativeWinLikelihood(state),
            timestamp: Date.now()
        };

        this.currentRound.push(snapshot);
    }

    /**
     * Finalize the current round — move snapshots to completed.
     */
    finalizeRound() {
        if (this.currentRound.length > 0) {
            this.completedRounds.push([...this.currentRound]);
            this.currentRound = [];
        }
        this.turnCounter = 0;
    }

    /**
     * Start a new round — reset current snapshots.
     */
    startNewRound() {
        this.currentRound = [];
        this.turnCounter = 0;
    }

    /**
     * Get serialisable state for saving.
     * @returns {object}
     */
    toJSON() {
        return {
            completedRounds: this.completedRounds,
            currentRound: this.currentRound,
            turnCounter: this.turnCounter
        };
    }

    /**
     * Restore from saved data.
     * @param {object} data
     */
    fromJSON(data) {
        if (!data) return;
        this.completedRounds = data.completedRounds || [];
        this.currentRound = data.currentRound || [];
        this.turnCounter = data.turnCounter || 0;
    }
}

/**
 * Comparative win-likelihood between both players.
 * Returns [p0Likelihood, p1Likelihood] that sum to 1.0.
 * @param {object} state
 * @returns {number[]}
 */
function calculateComparativeWinLikelihood(state) {
    const scores = state.players.map((p, i) => playerScore(p, i, state));
    const total = scores[0] + scores[1];
    if (total === 0) return [0.5, 0.5];
    return scores.map(s => Math.round((s / total) * 100) / 100);
}

/**
 * Raw score for a single player — higher = closer to winning.
 * @param {object} player
 * @param {number} playerIdx
 * @param {object} state
 * @returns {number}
 */
function playerScore(player, playerIdx, state) {
    if (player.hand.length === 0) return 100;

    const startingHand = playerIdx === state.startingPlayerIndex ? 14 : 13;

    // Factor 1: hand shrinkage (0..1)
    const sizeFactor = 1 - (player.hand.length / startingHand);

    // Factor 2: hand penalty weight (lower penalty = better, 0..1)
    const handPoints = player.hand.reduce((s, c) => s + getCardValue(c, false), 0);
    const penaltyFactor = 1 - Math.min(handPoints / 150, 1);

    // Factor 3: meldable ratio — what fraction of the hand is in playable melds
    const melds = findPossibleMelds(player.hand);
    const validMelds = melds.filter(m => m.length >= 3);
    const meldableCardIds = new Set(validMelds.flat().map(c => c.id));
    const meldableRatio = player.hand.length > 0
        ? meldableCardIds.size / player.hand.length
        : 0;

    // Weighted combination
    let raw = (sizeFactor * 0.40) + (penaltyFactor * 0.25) + (meldableRatio * 0.35);

    // Opening gate: if not opened, hard cap at 0.35
    if (!player.hasOpened) {
        raw = Math.min(raw, 0.35);
    }

    return Math.max(raw, 0.01);
}

/**
 * Public export for direct use.
 * @param {number} playerIdx
 * @param {object} state
 * @returns {number}
 */
export function calculateWinLikelihood(playerIdx, state) {
    const likelihoods = calculateComparativeWinLikelihood(state);
    return likelihoods[playerIdx];
}
