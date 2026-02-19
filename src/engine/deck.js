/**
 * Deck creation, shuffling, and dealing.
 * @module engine/deck
 */

import { RANKS, SUITS } from './card.js';

let nextId = 1;

/**
 * Create a fresh deck (2 × 52 standard + configurable Jokers).
 * Each card: { id, rank, suit, isJoker }.
 * @param {number} [jokerCount=4] — number of jokers (0–10)
 * @returns {Array<object>}
 */
export function createDeck(jokerCount = 4) {
    nextId = 1;
    const deck = [];

    for (let copy = 0; copy < 2; copy++) {
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                deck.push({ id: nextId++, rank, suit, isJoker: false });
            }
        }
    }

    // Configurable Jokers (clamped 0–10)
    const clampedJokers = Math.max(0, Math.min(10, jokerCount));
    for (let i = 0; i < clampedJokers; i++) {
        deck.push({ id: nextId++, rank: 'JOKER', suit: '', isJoker: true });
    }

    return deck;
}

/**
 * Fisher-Yates (Knuth) in-place shuffle.
 * @param {Array} deck
 * @returns {Array} the same array, shuffled
 */
export function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

/**
 * Deal cards from the deck into hands.
 * @param {Array} deck  — mutated (cards are spliced off the front)
 * @param {number[]} counts — number of cards for each player, e.g. [14, 13]
 * @returns {{ hands: Array<Array>, stock: Array }}
 */
export function dealCards(deck, counts) {
    const hands = counts.map(() => []);

    // Deal one card at a time round-robin (like real dealing)
    const maxCount = Math.max(...counts);
    for (let round = 0; round < maxCount; round++) {
        for (let p = 0; p < counts.length; p++) {
            if (round < counts[p] && deck.length > 0) {
                hands[p].push(deck.shift());
            }
        }
    }

    return { hands, stock: deck };
}
