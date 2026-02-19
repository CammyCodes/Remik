/**
 * Meld validation — sequences, groups, opening requirements.
 * @module engine/melds
 */

import { RANKS, rankIndex, getCardValue } from './card.js';

// ── Sequence validation helpers ──────────────────────────────────────────────

/**
 * Return the rank index treating Ace as 13 (after King).
 * @param {string} rank
 * @returns {number}
 */
function aceHighIndex(rank) {
    if (rank === 'A') return 13;
    return rankIndex(rank);
}

/**
 * Core range-fit check: can `naturalRanks` (sorted ascending) plus `jokerCount`
 * wildcards fill a contiguous run of `naturalRanks.length + jokerCount` slots,
 * all within [minRank, maxRank]?
 *
 * Each natural rank must occupy a unique slot; jokers fill gaps.
 * No two jokers may be adjacent (enforced separately before calling this).
 *
 * @param {number[]} naturalRanks — sorted ascending rank indices of natural cards
 * @param {number} jokerCount
 * @param {number} minRank — inclusive lower bound for valid slots
 * @param {number} maxRank — inclusive upper bound for valid slots
 * @returns {boolean}
 */
function canFitInRange(naturalRanks, jokerCount, minRank, maxRank) {
    const totalLen = naturalRanks.length + jokerCount;
    const span = naturalRanks[naturalRanks.length - 1] - naturalRanks[0];

    // The naturals must fit within a window of size totalLen
    if (span >= totalLen) return false; // gap too large, not enough jokers to bridge

    // All naturals must be distinct (no duplicate ranks in a sequence)
    for (let i = 1; i < naturalRanks.length; i++) {
        if (naturalRanks[i] === naturalRanks[i - 1]) return false;
    }

    // The run [start, start + totalLen - 1] must fit inside [minRank, maxRank].
    // The start can range from (naturalRanks[0] - jokerCount) to naturalRanks[0],
    // and the end must be naturalRanks[last] + remaining jokers after last natural.
    // We just need ANY valid start position.
    const latestStart = naturalRanks[0];           // start can't be after the first natural
    const earliestStart = naturalRanks[0] - jokerCount; // start can't leave naturals unreachable

    for (let start = earliestStart; start <= latestStart; start++) {
        const end = start + totalLen - 1;
        if (start >= minRank && end <= maxRank) {
            // Verify all naturals land on distinct slots inside [start, end]
            let valid = true;
            for (const r of naturalRanks) {
                if (r < start || r > end) { valid = false; break; }
            }
            if (valid) return true;
        }
    }
    return false;
}

/**
 * Check if cards form a valid Sequence (run).
 * Rules:
 * - 3+ consecutive cards of the same suit.
 * - Jokers can substitute but no two Jokers adjacent.
 * - Ace can be high (Q-K-A) or low (A-2-3) but no wrap (K-A-2).
 * - Input order does NOT matter — any permutation of a valid sequence is accepted.
 * @param {Array<object>} cards — card objects (order-independent)
 * @returns {boolean}
 */
export function isValidSequence(cards) {
    if (cards.length < 3) return false;

    const naturals = cards.filter(c => !c.isJoker);
    const jokerCount = cards.length - naturals.length;

    if (naturals.length === 0) return false;

    // All naturals must share the same suit
    const suit = naturals[0].suit;
    if (!naturals.every(c => c.suit === suit)) return false;

    // No two jokers adjacent — check in given order AND sorted order.
    // We check both because the player may have laid them in any order.
    // For the "no adjacent jokers" rule we enforce it on the *final arranged* sequence,
    // which means we just ensure jokers don't exceed a density that forces adjacency:
    // with N naturals and J jokers, the rule "no two jokers adjacent" means J <= N+1
    // (jokers can only slot between/around naturals, never side-by-side).
    if (jokerCount > naturals.length + 1) return false;

    // Collect natural rank indices for ace-low and ace-high interpretations
    const naturalRanksLow  = naturals.map(c => rankIndex(c.rank)).sort((a, b) => a - b);
    const naturalRanksHigh = naturals.map(c => aceHighIndex(c.rank)).sort((a, b) => a - b);

    // Ace-low: valid range 0 (A) .. 12 (K)
    const aceLowValid = canFitInRange(naturalRanksLow, jokerCount, 0, 12);

    // Ace-high: valid range 1 (2) .. 13 (A).
    // But we must exclude pure A-low sequences from this path to avoid double-counting
    // sequences where Ace is low being accepted as ace-high (e.g. A-2-3 should NOT
    // also pass aceHigh check, but that's fine — being valid in either is OK).
    const aceHighValid = canFitInRange(naturalRanksHigh, jokerCount, 1, 13);

    return aceLowValid || aceHighValid;
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
 * Sequences are checked first (more restrictive).
 * @param {Array<object>} cards
 * @returns {'sequence'|'group'|false}
 */
export function classifyMeld(cards) {
    if (isValidSequence(cards)) return 'sequence';
    if (isValidGroup(cards)) return 'group';
    return false;
}

// ── Point calculation ─────────────────────────────────────────────────────────

/**
 * Determine if an Ace in a meld should count as 1 (low) or 11 (high).
 * Ace is low if the sequence's naturals span the low end (ranks 0, 1, 2 = A, 2, 3)
 * and the meld is a valid sequence.
 * @param {Array<object>} meld
 * @returns {boolean}
 */
function isMeldLowAce(meld) {
    const naturals = meld.filter(c => !c.isJoker);
    if (!naturals.some(c => c.rank === 'A')) return false;

    // Only relevant for sequences
    if (!isValidSequence(meld)) return false;

    // Check if the meld fits in ace-low range but NOT ace-high range.
    // i.e., the Ace is functioning as rank 0, not rank 13.
    const naturalRanksLow  = naturals.map(c => rankIndex(c.rank)).sort((a, b) => a - b);
    const naturalRanksHigh = naturals.map(c => aceHighIndex(c.rank)).sort((a, b) => a - b);
    const jokerCount = meld.length - naturals.length;

    const fitsLow  = canFitInRange(naturalRanksLow,  jokerCount, 0, 12);
    const fitsHigh = canFitInRange(naturalRanksHigh, jokerCount, 1, 13);

    // If it only fits low, Ace is definitely low.
    // If it fits both (e.g. A-2-3 also technically fits high? No — A=13, so 13,1,2 is
    // not a contiguous range), prefer low.
    // In practice a meld cannot be both low and high simultaneously.
    return fitsLow && !fitsHigh;
}

/**
 * Calculate the total point value of cards in melds (for opening check).
 * In sequences, Ace counts as 1 if it is acting as the low card (A-2-3).
 * @param {Array<Array<object>>} melds
 * @returns {number}
 */
export function calculateMeldsPoints(melds) {
    let total = 0;
    for (const meld of melds) {
        const lowAce = isMeldLowAce(meld);
        for (const card of meld) {
            total += getCardValue(card, lowAce && card.rank === 'A');
        }
    }
    return total;
}

/**
 * Check whether the natural (non-joker) cards in a sequence meld contain
 * a consecutive run of 3 or more cards of the same suit.
 *
 * This is the "pure sub-run" test for the opening requirement. The meld
 * itself must already pass isValidSequence() (which enforces same-suit
 * naturals and no two adjacent jokers) before this helper is called.
 *
 * @param {Array<object>} naturals — non-joker cards from a valid sequence meld
 * @returns {boolean}
 */
function hasPureSubRun(naturals) {
    if (naturals.length < 3) return false;

    function longestRun(indices) {
        const sorted = [...indices].sort((a, b) => a - b);
        let run = 1;
        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i] === sorted[i - 1] + 1) {
                run++;
                if (run >= 3) return true;
            } else if (sorted[i] !== sorted[i - 1]) {
                run = 1;
            }
        }
        return false;
    }

    // Ace-low (A=0, 2=1, …, K=12)
    if (longestRun(naturals.map(c => rankIndex(c.rank)))) return true;
    // Ace-high (A=13, 2=1, …, K=12)
    if (longestRun(naturals.map(c => aceHighIndex(c.rank)))) return true;
    return false;
}

/**
 * Check if an opening attempt meets requirements:
 * - Total ≥ openRequirement points (default 51)
 * - At least one sequence whose natural cards include 3+ consecutive same-suit cards
 * @param {Array<Array<object>>} melds
 * @param {number} [openRequirement=51]
 * @returns {{ valid: boolean, reason?: string }}
 */
export function isValidOpening(melds, openRequirement = 51) {
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

    // Need at least one sequence whose natural cards form a pure sub-run of 3+
    const hasPureSequence = melds.some(meld =>
        isValidSequence(meld) && hasPureSubRun(meld.filter(c => !c.isJoker))
    );

    if (!hasPureSequence) {
        return { valid: false, reason: 'Opening requires at least one sequence with 3+ consecutive natural cards.' };
    }

    const totalPoints = calculateMeldsPoints(melds);
    if (totalPoints < openRequirement) {
        return { valid: false, reason: `Opening requires ≥ ${openRequirement} points. You have ${totalPoints}.` };
    }

    return { valid: true };
}

/**
 * Check if adding cards to an existing table meld keeps it valid.
 * @param {Array<object>} existingMeld — current meld on table
 * @param {Array<object>} newCards — cards to add
 * @param {'start'|'end'} [position='end'] — where to add (for sequences)
 * @returns {boolean}
 */
export function canExtendMeld(existingMeld, newCards, position = 'end') {
    const combined = position === 'start'
        ? [...newCards, ...existingMeld]
        : [...existingMeld, ...newCards];

    if (!classifyMeld(combined)) return false;

    // For sequences: enforce that new cards actually belong at the specified end
    if (isValidSequence(combined)) {
        const existingNaturals = existingMeld.filter(c => !c.isJoker);
        const newNaturals = newCards.filter(c => !c.isJoker);

        if (existingNaturals.length > 0 && newNaturals.length > 0) {
            const exLow  = existingNaturals.map(c => rankIndex(c.rank));
            const newLow = newNaturals.map(c => rankIndex(c.rank));
            const exHigh  = existingNaturals.map(c => aceHighIndex(c.rank));
            const newHigh = newNaturals.map(c => aceHighIndex(c.rank));

            if (position === 'end') {
                const lowOk  = Math.min(...newLow)  > Math.max(...exLow);
                const highOk = Math.min(...newHigh) > Math.max(...exHigh);
                if (!lowOk && !highOk) return false;
            } else { // 'start'
                const lowOk  = Math.max(...newLow)  < Math.min(...exLow);
                const highOk = Math.max(...newHigh) < Math.min(...exHigh);
                if (!lowOk && !highOk) return false;
            }
        }
    }

    return true;
}

// ── Auto-split helpers ────────────────────────────────────────────────────────

/**
 * Given cards of a single suit sorted by rank (ace-low, A=0), extract
 * consecutive runs of 3+.
 * @param {Array<object>} sortedCards — same suit, sorted by rankIndex ascending
 * @returns {Array<Array<object>>}
 */
function extractConsecutiveRunsLow(sortedCards) {
    const runs = [];
    if (sortedCards.length === 0) return runs;

    let currentRun = [sortedCards[0]];

    for (let i = 1; i < sortedCards.length; i++) {
        const prevIdx = rankIndex(sortedCards[i - 1].rank);
        const currIdx = rankIndex(sortedCards[i].rank);

        if (currIdx === prevIdx + 1) {
            currentRun.push(sortedCards[i]);
        } else {
            if (currentRun.length >= 3) runs.push(currentRun);
            currentRun = [sortedCards[i]];
        }
    }
    if (currentRun.length >= 3) runs.push(currentRun);

    return runs;
}

/**
 * Given cards of a single suit, detect ace-high runs (Q-K-A style).
 * Sorts by aceHighIndex (A=13) and extracts consecutive runs of 3+.
 * @param {Array<object>} cards — same suit (any order)
 * @returns {Array<Array<object>>}
 */
function extractConsecutiveRunsHigh(cards) {
    const sorted = [...cards].sort((a, b) => aceHighIndex(a.rank) - aceHighIndex(b.rank));
    const runs = [];
    if (sorted.length === 0) return runs;

    let currentRun = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
        const prevIdx = aceHighIndex(sorted[i - 1].rank);
        const currIdx = aceHighIndex(sorted[i].rank);

        if (currIdx === prevIdx + 1) {
            currentRun.push(sorted[i]);
        } else {
            if (currentRun.length >= 3) runs.push(currentRun);
            currentRun = [sorted[i]];
        }
    }
    if (currentRun.length >= 3) runs.push(currentRun);

    // Filter: only keep runs that are valid ace-high sequences (contain an Ace
    // and the Ace is at the high end, i.e., index 13).
    return runs.filter(run => run.some(c => c.rank === 'A'));
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
        // Deduplicate suits (keep first of each suit encountered)
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

/**
 * Extract valid sequences by suit (both ace-low and ace-high), then try to
 * form groups from leftovers.
 * @param {Array<object>} cards
 * @returns {Array<Array<object>>|null}
 */
function trySplitSequencesFirst(cards) {
    const melds = [];
    const used = new Set();

    const jokers = cards.filter(c => c.isJoker);
    const naturals = cards.filter(c => !c.isJoker);

    // Group by suit
    const bySuit = {};
    for (const card of naturals) {
        if (!bySuit[card.suit]) bySuit[card.suit] = [];
        bySuit[card.suit].push(card);
    }

    // For each suit: try ace-low runs first, then ace-high runs
    for (const suit of Object.keys(bySuit)) {
        const suitCards = bySuit[suit];
        const sortedLow = [...suitCards].sort((a, b) => rankIndex(a.rank) - rankIndex(b.rank));

        // Ace-low runs
        const lowRuns = extractConsecutiveRunsLow(sortedLow);
        for (const run of lowRuns) {
            if (!run.some(c => used.has(c.id)) && isValidSequence(run)) {
                melds.push(run);
                run.forEach(c => used.add(c.id));
            }
        }

        // Ace-high runs (Q-K-A etc.) — only consider cards not yet used
        const remainingSuit = suitCards.filter(c => !used.has(c.id));
        const highRuns = extractConsecutiveRunsHigh(remainingSuit);
        for (const run of highRuns) {
            if (!run.some(c => used.has(c.id)) && isValidSequence(run)) {
                melds.push(run);
                run.forEach(c => used.add(c.id));
            }
        }
    }

    // Remaining naturals → try groups
    const remaining = naturals.filter(c => !used.has(c.id));
    const groupMelds = extractGroups(remaining);
    for (const g of groupMelds) {
        melds.push(g);
        g.forEach(c => used.add(c.id));
    }

    const unusedNonJoker = naturals.filter(c => !used.has(c.id));
    if (unusedNonJoker.length > 0) return null;

    // Auto-split doesn't handle jokers — they must be placed manually
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

    const naturals = cards.filter(c => !c.isJoker);
    const jokers = cards.filter(c => c.isJoker);

    // Groups first
    const groupMelds = extractGroups(naturals);
    for (const g of groupMelds) {
        melds.push(g);
        g.forEach(c => used.add(c.id));
    }

    // Remaining → sequences by suit (low + high)
    const remaining = naturals.filter(c => !used.has(c.id));
    const bySuit = {};
    for (const card of remaining) {
        if (!bySuit[card.suit]) bySuit[card.suit] = [];
        bySuit[card.suit].push(card);
    }

    for (const suit of Object.keys(bySuit)) {
        const suitCards = bySuit[suit];
        const sortedLow = [...suitCards].sort((a, b) => rankIndex(a.rank) - rankIndex(b.rank));

        const lowRuns = extractConsecutiveRunsLow(sortedLow);
        for (const run of lowRuns) {
            if (!run.some(c => used.has(c.id)) && isValidSequence(run)) {
                melds.push(run);
                run.forEach(c => used.add(c.id));
            }
        }

        const remainingSuit = suitCards.filter(c => !used.has(c.id));
        const highRuns = extractConsecutiveRunsHigh(remainingSuit);
        for (const run of highRuns) {
            if (!run.some(c => used.has(c.id)) && isValidSequence(run)) {
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
 * Attempt to auto-split a selection of cards into multiple valid melds.
 * Tries sequences-first and groups-first strategies, returning the first
 * partition that uses ALL selected cards.
 * @param {Array<object>} cards — all selected cards
 * @returns {Array<Array<object>>|null} — array of valid melds, or null if no valid partition found
 */
export function autoSplitMelds(cards) {
    const result1 = trySplitSequencesFirst(cards);
    if (result1) return result1;

    const result2 = trySplitGroupsFirst(cards);
    if (result2) return result2;

    return null;
}
