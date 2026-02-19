/**
 * Card constants and utility helpers.
 * @module engine/card
 */

/** Ordered ranks from low to high */
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/** Available suits */
export const SUITS = ['♠', '♥', '♦', '♣'];

/** Suit colours for rendering */
export const SUIT_COLORS = {
    '♠': '#1a1a2e',
    '♣': '#1a1a2e',
    '♥': '#e63946',
    '♦': '#e63946'
};

/** Point values for scoring / opening check */
const POINT_VALUES = {
    'A': 11,
    '2': 2, '3': 3, '4': 4, '5': 5,
    '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10,
    'J': 10, 'Q': 10, 'K': 10,
    'JOKER': 50
};

/**
 * Return the numeric index of a rank (0-based, Ace = 0, King = 12).
 * @param {string} rank
 * @returns {number}
 */
export function rankIndex(rank) {
    return RANKS.indexOf(rank);
}

/**
 * Get the point value of a card.
 * Ace is 11 by default; pass `lowAce = true` for A-2-3 sequences (value 1).
 * @param {{ rank: string, isJoker: boolean }} card
 * @param {boolean} [lowAce=false]
 * @returns {number}
 */
export function getCardValue(card, lowAce = false) {
    if (card.isJoker) return POINT_VALUES.JOKER;
    if (card.rank === 'A' && lowAce) return 1;
    return POINT_VALUES[card.rank] ?? 0;
}

/**
 * Human-readable card label.
 * @param {{ rank: string, suit: string, isJoker: boolean }} card
 * @returns {string}
 */
export function cardToString(card) {
    if (card.isJoker) return '🃏';
    return `${card.rank}${card.suit}`;
}

/**
 * Compare two cards for sorting: by suit first, then by rank.
 * @param {{ rank: string, suit: string, isJoker: boolean }} a
 * @param {{ rank: string, suit: string, isJoker: boolean }} b
 * @returns {number}
 */
export function compareCards(a, b) {
    if (a.isJoker && b.isJoker) return 0;
    if (a.isJoker) return 1;
    if (b.isJoker) return -1;
    const suitDiff = SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
    if (suitDiff !== 0) return suitDiff;
    return rankIndex(a.rank) - rankIndex(b.rank);
}

/**
 * Compare two cards for sorting: by rank first, then by suit.
 * @param {{ rank: string, suit: string, isJoker: boolean }} a
 * @param {{ rank: string, suit: string, isJoker: boolean }} b
 * @returns {number}
 */
export function compareCardsByRank(a, b) {
    if (a.isJoker && b.isJoker) return 0;
    if (a.isJoker) return 1;
    if (b.isJoker) return -1;
    const rankDiff = rankIndex(a.rank) - rankIndex(b.rank);
    if (rankDiff !== 0) return rankDiff;
    return SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
}

/** Return adjusted rank index treating Ace as 13 (after King). */
function aceHighRankIndex(card) {
    if (card.rank === 'A') return 13;
    return rankIndex(card.rank);
}

/**
 * Compare two cards for sorting: by suit first, then by rank — Ace sorts HIGH (after King).
 * @param {{ rank: string, suit: string, isJoker: boolean }} a
 * @param {{ rank: string, suit: string, isJoker: boolean }} b
 * @returns {number}
 */
export function compareCardsAceHigh(a, b) {
    if (a.isJoker && b.isJoker) return 0;
    if (a.isJoker) return 1;
    if (b.isJoker) return -1;
    const suitDiff = SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
    if (suitDiff !== 0) return suitDiff;
    return aceHighRankIndex(a) - aceHighRankIndex(b);
}

/**
 * Compare two cards for sorting: by rank first, then by suit — Ace sorts HIGH (after King).
 * @param {{ rank: string, suit: string, isJoker: boolean }} a
 * @param {{ rank: string, suit: string, isJoker: boolean }} b
 * @returns {number}
 */
export function compareCardsByRankAceHigh(a, b) {
    if (a.isJoker && b.isJoker) return 0;
    if (a.isJoker) return 1;
    if (b.isJoker) return -1;
    const rankDiff = aceHighRankIndex(a) - aceHighRankIndex(b);
    if (rankDiff !== 0) return rankDiff;
    return SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
}
