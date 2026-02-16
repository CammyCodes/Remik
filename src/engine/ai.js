/**
 * AI opponent logic — greedy heuristic player.
 * @module engine/ai
 */

import { RANKS, rankIndex, getCardValue, compareCards } from './card.js';
import { isValidSequence, isValidGroup, classifyMeld, isValidOpening, canExtendMeld } from './melds.js';

/**
 * Find all possible melds (sequences & groups) in a hand.
 * @param {Array<object>} hand
 * @returns {Array<Array<object>>}
 */
export function findPossibleMelds(hand) {
    const melds = [];

    // Find groups (same rank, different suits)
    const byRank = groupBy(hand.filter(c => !c.isJoker), c => c.rank);
    for (const [rank, cards] of Object.entries(byRank)) {
        // Ensure unique suits
        const uniqueSuits = [];
        const seen = new Set();
        for (const c of cards) {
            if (!seen.has(c.suit)) {
                seen.add(c.suit);
                uniqueSuits.push(c);
            }
        }
        if (uniqueSuits.length >= 3) {
            melds.push([...uniqueSuits]);
            // Also try 3-card subsets if we have 4
            if (uniqueSuits.length === 4) {
                for (let skip = 0; skip < 4; skip++) {
                    melds.push(uniqueSuits.filter((_, i) => i !== skip));
                }
            }
        }
    }

    // Find sequences (consecutive same suit)
    const bySuit = groupBy(hand.filter(c => !c.isJoker), c => c.suit);
    for (const [suit, cards] of Object.entries(bySuit)) {
        const sorted = [...cards].sort((a, b) => rankIndex(a.rank) - rankIndex(b.rank));
        // Remove duplicates (same rank same suit from double deck)
        const unique = [];
        const seenRanks = new Set();
        for (const c of sorted) {
            if (!seenRanks.has(c.rank)) {
                seenRanks.add(c.rank);
                unique.push(c);
            }
        }

        // Find all consecutive subsequences of length 3+
        for (let start = 0; start < unique.length; start++) {
            for (let end = start + 2; end < unique.length; end++) {
                const sub = unique.slice(start, end + 1);
                // Check if truly consecutive
                let consecutive = true;
                for (let i = 1; i < sub.length; i++) {
                    if (rankIndex(sub[i].rank) !== rankIndex(sub[i - 1].rank) + 1) {
                        consecutive = false;
                        break;
                    }
                }
                if (consecutive && sub.length >= 3) {
                    melds.push(sub);
                }
            }
        }

        // Also check Ace-high sequences (Q, K, A)
        const aceCards = unique.filter(c => c.rank === 'A');
        const kingCards = unique.filter(c => c.rank === 'K');
        const queenCards = unique.filter(c => c.rank === 'Q');
        if (aceCards.length > 0 && kingCards.length > 0 && queenCards.length > 0) {
            melds.push([queenCards[0], kingCards[0], aceCards[0]]);
        }
    }

    return melds;
}

/**
 * AI decides what to do for its entire turn.
 * Returns a sequence of actions.
 * @param {object} state — the full game state
 * @returns {Array<object>} actions — [ { type: 'draw', source }, { type: 'meld', meldCardIds }, ..., { type: 'discard', cardId } ]
 */
export function aiDecideTurn(state) {
    const actions = [];
    const playerIdx = state.currentPlayerIndex;
    const player = state.players[playerIdx];
    const hand = [...player.hand]; // work with a copy for planning

    // 1. Decide draw source
    const drawAction = decideDrawSource(state, hand);
    actions.push(drawAction);

    // Simulate drawing
    if (drawAction.source === 'discard' && state.discardPile.length > 0) {
        const topDiscard = state.discardPile[state.discardPile.length - 1];
        hand.push(topDiscard);
    } else {
        // Drawing from stock — we don't know what we'll get, so skip planning melds pre-draw
        // The actual meld decision will be made after the real draw
    }

    return actions; // Return just the draw action; meld/discard decisions after actual draw
}

/**
 * AI decides melds and discard after drawing.
 * @param {object} state
 * @returns {Array<object>} actions
 */
export function aiDecideMeldsAndDiscard(state) {
    const actions = [];
    const playerIdx = state.currentPlayerIndex;
    const player = state.players[playerIdx];
    const hand = [...player.hand];

    // 2. Find melds to play
    if (!player.hasOpened) {
        // Try to open
        const openingMelds = findOpeningMelds(hand);
        if (openingMelds) {
            actions.push({
                type: 'meld',
                meldCardIds: openingMelds.map(meld => meld.map(c => c.id))
            });
            // Remove melded cards from hand copy
            const meldedIds = new Set(openingMelds.flat().map(c => c.id));
            const remaining = hand.filter(c => !meldedIds.has(c.id));
            hand.length = 0;
            hand.push(...remaining);
        }
    } else {
        // Already opened — play any valid melds
        const meldsToPlay = findBestMelds(hand);
        if (meldsToPlay.length > 0) {
            actions.push({
                type: 'meld',
                meldCardIds: meldsToPlay.map(meld => meld.map(c => c.id))
            });
            const meldedIds = new Set(meldsToPlay.flat().map(c => c.id));
            const remaining = hand.filter(c => !meldedIds.has(c.id));
            hand.length = 0;
            hand.push(...remaining);
        }

        // Try to extend existing table melds
        const extensions = findExtensions(hand, state.tableMelds);
        for (const ext of extensions) {
            actions.push({
                type: 'extend',
                tableMeldIndex: ext.tableMeldIndex,
                cardIds: ext.cards.map(c => c.id),
                position: ext.position
            });
            const extIds = new Set(ext.cards.map(c => c.id));
            const remaining = hand.filter(c => !extIds.has(c.id));
            hand.length = 0;
            hand.push(...remaining);
        }
    }

    // 3. Discard — choose the least useful card
    if (hand.length > 0) {
        const discardCard = chooseDiscard(hand);
        actions.push({ type: 'discard', cardId: discardCard.id });
    }

    return actions;
}

/**
 * Decide whether to draw from stock or discard.
 * @param {object} state
 * @param {Array<object>} hand
 * @returns {{ type: 'draw', source: 'stock'|'discard' }}
 */
function decideDrawSource(state, hand) {
    if (state.discardPile.length === 0) {
        return { type: 'draw', source: 'stock' };
    }

    const topDiscard = state.discardPile[state.discardPile.length - 1];

    // Check if the discard card would complete any meld
    const handWithCard = [...hand, topDiscard];
    const meldsWithCard = findPossibleMelds(handWithCard);
    const meldsWithout = findPossibleMelds(hand);

    // If adding the card creates more/better melds, pick from discard
    const newMelds = meldsWithCard.filter(meld =>
        meld.some(c => c.id === topDiscard.id)
    );

    if (newMelds.length > 0 && newMelds.some(m => classifyMeld(m))) {
        return { type: 'draw', source: 'discard' };
    }

    return { type: 'draw', source: 'stock' };
}

/**
 * Find melds that satisfy opening requirements (≥51 pts, pure sequence).
 * @param {Array<object>} hand
 * @returns {Array<Array<object>>|null}
 */
function findOpeningMelds(hand) {
    const allMelds = findPossibleMelds(hand);

    // Filter to only valid melds
    const validMelds = allMelds.filter(m => classifyMeld(m));

    // Find combinations of melds that don't overlap and meet opening requirements
    // Use a greedy approach: start with the highest-value pure sequence, then add more
    const pureSequences = validMelds.filter(m =>
        isValidSequence(m) && m.every(c => !c.isJoker)
    );

    if (pureSequences.length === 0) return null;

    // Sort by value descending
    pureSequences.sort((a, b) => meldValue(b) - meldValue(a));

    for (const pureSeq of pureSequences) {
        const usedIds = new Set(pureSeq.map(c => c.id));
        const combination = [pureSeq];
        let totalPoints = meldValue(pureSeq);

        // Add more non-overlapping melds
        const otherMelds = validMelds
            .filter(m => !m.some(c => usedIds.has(c.id)))
            .sort((a, b) => meldValue(b) - meldValue(a));

        for (const m of otherMelds) {
            if (!m.some(c => usedIds.has(c.id))) {
                combination.push(m);
                totalPoints += meldValue(m);
                m.forEach(c => usedIds.add(c.id));
            }
        }

        if (totalPoints >= 51) {
            return combination;
        }
    }

    return null;
}

/**
 * Find the best non-overlapping melds to play (post-opening).
 * @param {Array<object>} hand
 * @returns {Array<Array<object>>}
 */
function findBestMelds(hand) {
    const allMelds = findPossibleMelds(hand).filter(m => classifyMeld(m));
    if (allMelds.length === 0) return [];

    // Sort by size descending (prefer to play more cards)
    allMelds.sort((a, b) => b.length - a.length);

    const usedIds = new Set();
    const result = [];

    for (const meld of allMelds) {
        if (!meld.some(c => usedIds.has(c.id))) {
            result.push(meld);
            meld.forEach(c => usedIds.add(c.id));
        }
    }

    return result;
}

/**
 * Find cards that can extend existing table melds.
 * @param {Array<object>} hand
 * @param {Array<object>} tableMelds
 * @returns {Array<{ tableMeldIndex: number, cards: Array<object>, position: 'start'|'end' }>}
 */
function findExtensions(hand, tableMelds) {
    const extensions = [];
    const usedIds = new Set();

    for (let i = 0; i < tableMelds.length; i++) {
        const meld = tableMelds[i].cards;
        for (const card of hand) {
            if (usedIds.has(card.id)) continue;
            // Try adding to end
            if (canExtendMeld(meld, [card], 'end')) {
                extensions.push({ tableMeldIndex: i, cards: [card], position: 'end' });
                usedIds.add(card.id);
                break; // one extension per meld for simplicity
            }
            // Try adding to start
            if (canExtendMeld(meld, [card], 'start')) {
                extensions.push({ tableMeldIndex: i, cards: [card], position: 'start' });
                usedIds.add(card.id);
                break;
            }
        }
    }

    return extensions;
}

/**
 * Choose which card to discard (least useful).
 * Strategy: discard the card with highest point value that isn't part of a partial meld.
 * @param {Array<object>} hand
 * @returns {object}
 */
function chooseDiscard(hand) {
    if (hand.length === 1) return hand[0];

    // Score each card's "usefulness" (lower = more discardable)
    const scores = hand.map(card => {
        let score = 0;

        // Cards that are part of partial sequences (2 consecutive same suit) are useful
        const samesuit = hand.filter(c => c.suit === card.suit && c.id !== card.id && !c.isJoker);
        for (const c of samesuit) {
            const diff = Math.abs(rankIndex(c.rank) - rankIndex(card.rank));
            if (diff === 1) score += 3; // adjacent
            if (diff === 2) score += 1; // one-gap
        }

        // Cards that are part of partial groups (same rank) are useful
        const samerank = hand.filter(c => c.rank === card.rank && c.id !== card.id && c.suit !== card.suit);
        score += samerank.length * 2;

        // Jokers are always useful
        if (card.isJoker) score += 10;

        // Penalty: high-value cards are worse to keep (if not useful)
        score -= getCardValue(card) * 0.1;

        return { card, score };
    });

    // Sort by score ascending — discard the least useful
    scores.sort((a, b) => a.score - b.score);

    return scores[0].card;
}

/**
 * Calculate point value of a meld.
 * @param {Array<object>} meld
 * @returns {number}
 */
function meldValue(meld) {
    return meld.reduce((sum, c) => sum + getCardValue(c), 0);
}

/**
 * Group array items by a key function.
 * @param {Array} arr
 * @param {Function} keyFn
 * @returns {Object}
 */
function groupBy(arr, keyFn) {
    const result = {};
    for (const item of arr) {
        const key = keyFn(item);
        if (!result[key]) result[key] = [];
        result[key].push(item);
    }
    return result;
}
