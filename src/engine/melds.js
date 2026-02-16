/**
 * Meld validation — sequences, groups, opening requirements.
 * @module engine/melds
 */

import { RANKS, rankIndex, getCardValue } from './card.js';

/**
 * Check if cards form a valid Sequence (run).
 * Rules:
 * - 3+ consecutive cards of the same suit.
 * - Jokers can substitute but no two Jokers adjacent.
 * - Ace can be high (Q-K-A) or low (A-2-3) but no wrap (K-A-2).
 * @param {Array<object>} cards — ordered by the player
 * @returns {boolean}
 */
export function isValidSequence(cards) {
    if (cards.length < 3) return false;

    // Separate jokers and naturals
    const naturals = cards.filter(c => !c.isJoker);
    const jokerCount = cards.length - naturals.length;

    if (naturals.length === 0) return false; // can't have all jokers

    // All naturals must share the same suit
    const suit = naturals[0].suit;
    if (!naturals.every(c => c.suit === suit)) return false;

    // No two jokers adjacent
    for (let i = 0; i < cards.length - 1; i++) {
        if (cards[i].isJoker && cards[i + 1].isJoker) return false;
    }

    // Build the sequence of rank indices, inserting joker placeholders
    // We need to figure out what ranks the jokers represent.
    // Strategy: iterate through the ordered cards, tracking expected rank index.
    const naturalIndices = naturals.map(c => rankIndex(c.rank));

    // Try both Ace-low and Ace-high interpretations
    return trySequence(cards, naturalIndices, false) || trySequence(cards, naturalIndices, true);
}

/**
 * Internal: attempt to validate sequence with a specific Ace interpretation.
 * @param {Array<object>} cards
 * @param {number[]} naturalIndices — rank indices of natural cards
 * @param {boolean} aceLow — if true, Ace treated as index -1 (before 2)
 * @returns {boolean}
 */
function trySequence(cards, naturalIndices, aceLow) {
    const adjusted = naturalIndices.map(idx => {
        if (idx === 0 && aceLow) return -1; // Ace low: before index 0 (which is '2' at index 1)
        return idx;
    });

    // Determine the starting rank index from the first natural card found
    let pos = 0; // position in cards array
    let currentRank = null;

    // Find the first natural card's adjusted index
    let jokersBeforeFirst = 0;
    for (let i = 0; i < cards.length; i++) {
        if (!cards[i].isJoker) {
            const adjIdx = aceLow && rankIndex(cards[i].rank) === 0 ? -1 : rankIndex(cards[i].rank);
            currentRank = adjIdx - jokersBeforeFirst;
            break;
        }
        jokersBeforeFirst++;
    }

    if (currentRank === null) return false;

    // Now walk through all cards and verify consecutive ranks
    for (let i = 0; i < cards.length; i++) {
        const expectedRank = currentRank + i;

        // Check bounds: rank must be within valid range
        // Ace low = -1, 2 = 1, ..., K = 12.  Ace high = 0 (but value 12 position after Q=11, K=12... A high means after K)
        // Actually, let's rethink: RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K']
        // index:                     0    1   2   3   4   5   6   7   8    9   10  11   12
        // Ace low: A=index -1 (conceptually before 2 at index 1)... wait that doesn't work cleanly.
        // Let me use: Ace low sequence means A(0), 2(1), 3(2) — so Ace stays at 0 and that's fine for low.
        // Ace high: Q(11), K(12), A(13) — Ace goes to 13.
        // No wrap: K(12), A(13), 2(1) is invalid.

        if (!aceLow && expectedRank > 12 && expectedRank !== 13) return false;
        if (aceLow && expectedRank < -1) return false; // shouldn't happen

        if (!cards[i].isJoker) {
            let adjIdx = rankIndex(cards[i].rank);
            if (aceLow && adjIdx === 0) {
                // Ace low stays at 0 in this interpretation
                // Actually we need ace high: ace goes to 13
                // Let me simplify this...
            }
            // For ace-high, A maps to 13
            if (!aceLow && adjIdx === 0) adjIdx = 13;

            if (adjIdx !== expectedRank) return false;
        }
        // Joker: any rank is fine (already checked no adjacent jokers)
    }

    // Verify the range is valid (no wrap-around)
    const startRank = currentRank;
    const endRank = currentRank + cards.length - 1;

    if (aceLow) {
        // Valid range: 0..12 (A=0 low)
        if (startRank < 0 || endRank > 12) return false;
    } else {
        // Valid range: 1..13 (A=13 high, must not include low Ace)
        // If Ace high is used, range can go up to 13 but not wrap
        if (startRank < 0 || endRank > 13) return false;
        // If range includes 0 (Ace) and 13 (Ace high), that's a wrap — invalid
    }

    return true;
}

/**
 * Check if cards form a valid Group (set).
 * Rules:
 * - 3 or 4 cards of the same rank, different suits.
 * - Jokers: at least as many naturals as jokers.
 * - No duplicate suits among naturals.
 * @param {Array<object>} cards
 * @returns {boolean}
 */
export function isValidGroup(cards) {
    if (cards.length < 3 || cards.length > 4) return false;

    const naturals = cards.filter(c => !c.isJoker);
    const jokerCount = cards.length - naturals.length;

    if (naturals.length === 0) return false;

    // At least as many naturals as jokers
    if (naturals.length < jokerCount) return false;

    // All naturals must share the same rank
    const rank = naturals[0].rank;
    if (!naturals.every(c => c.rank === rank)) return false;

    // No duplicate suits
    const suits = naturals.map(c => c.suit);
    if (new Set(suits).size !== suits.length) return false;

    return true;
}

/**
 * Check if a set of cards forms any valid meld (sequence or group).
 * @param {Array<object>} cards
 * @returns {'sequence'|'group'|false}
 */
export function classifyMeld(cards) {
    if (isValidGroup(cards)) return 'group';
    if (isValidSequence(cards)) return 'sequence';
    return false;
}

/**
 * Calculate the total point value of cards in melds (for opening check).
 * In sequences, Ace counts as 1 if in A-2-3 position, else 11.
 * @param {Array<Array<object>>} melds
 * @returns {number}
 */
export function calculateMeldsPoints(melds) {
    let total = 0;
    for (const meld of melds) {
        // Determine if this is a low-ace sequence
        const naturals = meld.filter(c => !c.isJoker);
        const hasAce = naturals.some(c => c.rank === 'A');
        const hasTwo = naturals.some(c => c.rank === '2');
        const hasThree = naturals.some(c => c.rank === '3');
        const lowAce = hasAce && hasTwo && hasThree;

        for (const card of meld) {
            total += getCardValue(card, lowAce && card.rank === 'A');
        }
    }
    return total;
}

/**
 * Check if an opening attempt meets requirements:
 * - Total ≥ 51 points
 * - At least one pure sequence (no jokers in it)
 * @param {Array<Array<object>>} melds
 * @returns {{ valid: boolean, reason?: string }}
 */
export function isValidOpening(melds) {
    if (melds.length === 0) {
        return { valid: false, reason: 'You must play at least one meld to open.' };
    }

    // All melds must be individually valid
    for (let i = 0; i < melds.length; i++) {
        const type = classifyMeld(melds[i]);
        if (!type) {
            return { valid: false, reason: `Meld ${i + 1} is not a valid sequence or group.` };
        }
    }

    // Need at least one pure sequence
    const hasPureSequence = melds.some(meld => {
        const allNatural = meld.every(c => !c.isJoker);
        return allNatural && isValidSequence(meld);
    });

    if (!hasPureSequence) {
        return { valid: false, reason: 'Opening requires at least one pure sequence (no Jokers).' };
    }

    const totalPoints = calculateMeldsPoints(melds);
    if (totalPoints < 51) {
        return { valid: false, reason: `Opening requires ≥ 51 points. You have ${totalPoints}.` };
    }

    return { valid: true };
}

/**
 * Check if adding cards to an existing table meld keeps it valid.
 * @param {Array<object>} existingMeld — current meld on table
 * @param {Array<object>} newCards — cards to add
 * @param {'start'|'end'} position — where to add (for sequences)
 * @returns {boolean}
 */
export function canExtendMeld(existingMeld, newCards, position = 'end') {
    const combined = position === 'start'
        ? [...newCards, ...existingMeld]
        : [...existingMeld, ...newCards];

    return !!classifyMeld(combined);
}

/**
 * Attempt to auto-split a selection of cards into multiple valid melds.
 * Tries sequences-first and groups-first strategies, returning the first
 * partition that uses ALL selected cards.
 * @param {Array<object>} cards — all selected cards
 * @returns {Array<Array<object>>|null} — array of valid melds, or null if no valid partition found
 */
export function autoSplitMelds(cards) {
    // Strategy 1: sequences first, then groups from leftovers
    const result1 = trySplitSequencesFirst(cards);
    if (result1) return result1;

    // Strategy 2: groups first, then sequences from leftovers
    const result2 = trySplitGroupsFirst(cards);
    if (result2) return result2;

    return null;
}

/**
 * Extract valid sequences by suit, then try to form groups from leftovers.
 * @param {Array<object>} cards
 * @returns {Array<Array<object>>|null}
 */
function trySplitSequencesFirst(cards) {
    const melds = [];
    const used = new Set();

    // Group cards by suit (jokers go to a separate pool)
    const bySuit = {};
    const jokers = [];
    for (const card of cards) {
        if (card.isJoker) {
            jokers.push(card);
        } else {
            if (!bySuit[card.suit]) bySuit[card.suit] = [];
            bySuit[card.suit].push(card);
        }
    }

    // For each suit, sort by rank and extract consecutive runs of 3+
    for (const suit of Object.keys(bySuit)) {
        const suitCards = bySuit[suit].sort((a, b) => rankIndex(a.rank) - rankIndex(b.rank));
        const runs = extractConsecutiveRuns(suitCards);
        for (const run of runs) {
            if (isValidSequence(run)) {
                melds.push(run);
                run.forEach(c => used.add(c.id));
            }
        }
    }

    // Remaining cards → try to form groups by rank
    const remaining = cards.filter(c => !used.has(c.id) && !c.isJoker);
    const groupMelds = extractGroups(remaining);
    for (const g of groupMelds) {
        melds.push(g);
        g.forEach(c => used.add(c.id));
    }

    // Check if all non-joker cards are used
    const unusedNonJoker = cards.filter(c => !used.has(c.id) && !c.isJoker);
    if (unusedNonJoker.length > 0) return null;

    // Distribute unused jokers (not supported in auto-split — they must be manually placed)
    const unusedJokers = jokers.filter(j => !used.has(j.id));
    if (unusedJokers.length > 0) return null;

    return melds.length > 0 ? melds : null;
}

/**
 * Extract valid groups by rank, then try to form sequences from leftovers.
 * @param {Array<object>} cards
 * @returns {Array<Array<object>>|null}
 */
function trySplitGroupsFirst(cards) {
    const melds = [];
    const used = new Set();

    // Separate jokers
    const naturals = cards.filter(c => !c.isJoker);
    const jokers = cards.filter(c => c.isJoker);

    // Group by rank and extract valid groups
    const groupMelds = extractGroups(naturals);
    for (const g of groupMelds) {
        melds.push(g);
        g.forEach(c => used.add(c.id));
    }

    // Remaining → try sequences by suit
    const remaining = naturals.filter(c => !used.has(c.id));
    const bySuit = {};
    for (const card of remaining) {
        if (!bySuit[card.suit]) bySuit[card.suit] = [];
        bySuit[card.suit].push(card);
    }

    for (const suit of Object.keys(bySuit)) {
        const suitCards = bySuit[suit].sort((a, b) => rankIndex(a.rank) - rankIndex(b.rank));
        const runs = extractConsecutiveRuns(suitCards);
        for (const run of runs) {
            if (isValidSequence(run)) {
                melds.push(run);
                run.forEach(c => used.add(c.id));
            }
        }
    }

    const unusedNonJoker = naturals.filter(c => !used.has(c.id));
    if (unusedNonJoker.length > 0) return null;

    const unusedJokers = jokers.filter(j => !used.has(j.id));
    if (unusedJokers.length > 0) return null;

    return melds.length > 0 ? melds : null;
}

/**
 * Given cards of a single suit sorted by rank, extract consecutive runs of 3+.
 * @param {Array<object>} sortedCards — same suit, sorted by rank index ascending
 * @returns {Array<Array<object>>}
 */
function extractConsecutiveRuns(sortedCards) {
    if (sortedCards.length < 3) return [sortedCards.length >= 3 ? sortedCards : []].filter(r => r.length > 0);

    const runs = [];
    let currentRun = [sortedCards[0]];

    for (let i = 1; i < sortedCards.length; i++) {
        const prevIdx = rankIndex(sortedCards[i - 1].rank);
        const currIdx = rankIndex(sortedCards[i].rank);

        if (currIdx === prevIdx + 1) {
            currentRun.push(sortedCards[i]);
        } else {
            if (currentRun.length >= 3) {
                runs.push(currentRun);
            }
            currentRun = [sortedCards[i]];
        }
    }

    if (currentRun.length >= 3) {
        runs.push(currentRun);
    }

    return runs;
}

/**
 * Given natural cards, group by rank and return valid groups (3-4 different suits).
 * @param {Array<object>} cards — non-joker cards
 * @returns {Array<Array<object>>}
 */
function extractGroups(cards) {
    const byRank = {};
    for (const card of cards) {
        if (!byRank[card.rank]) byRank[card.rank] = [];
        byRank[card.rank].push(card);
    }

    const groups = [];
    for (const rank of Object.keys(byRank)) {
        const group = byRank[rank];
        // Deduplicate suits
        const uniqueSuits = new Map();
        for (const c of group) {
            if (!uniqueSuits.has(c.suit)) uniqueSuits.set(c.suit, c);
        }
        const dedupedGroup = Array.from(uniqueSuits.values());
        if (dedupedGroup.length >= 3 && dedupedGroup.length <= 4 && isValidGroup(dedupedGroup)) {
            groups.push(dedupedGroup);
        }
    }

    return groups;
}
