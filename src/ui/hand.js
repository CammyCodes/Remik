/**
 * Player hand UI — drag-and-drop, selection, locking, auto-organize.
 * @module ui/hand
 */

import { renderCard } from './cards.js';
import { compareCards, compareCardsByRank } from '../engine/card.js';
import { playCardSelect, playCardDeselect, playCardClick } from '../engine/soundManager.js';

/**
 * Manage the player's hand UI.
 */
export class HandManager {
    /**
     * @param {HTMLElement} container — the .hand element
     * @param {object} callbacks — { onSelect, onDeselect, onReorder, onDragToMeldZone, onDragToTableMeld }
     */
    constructor(container, callbacks = {}) {
        /** @type {HTMLElement} */
        this.container = container;
        /** @type {Set<number>} card IDs that are selected */
        this.selectedIds = new Set();
        /** @type {Set<number>} card IDs that are locked */
        this.lockedIds = new Set();
        /** @type {Array<object>} current hand cards */
        this.cards = [];
        /** @type {object} */
        this.callbacks = callbacks;
        /** @type {string} sort mode: 'suit' or 'rank' */
        this.sortMode = 'suit';
        /** @type {number|null} card ID being dragged */
        this.dragCardId = null;
        /** @type {boolean} whether the initial deal animation is active */
        this.dealAnimating = false;
    }

    /**
     * Update and re-render the hand.
     * @param {Array<object>} cards
     * @param {object} [options]
     * @param {boolean} [options.animate=false] — deal animation
     * @param {string} [options.newCardAnimClass] — animation for newly drawn card
     * @param {number|null} [options.newCardId] — ID of newly drawn card
     */
    render(cards, options = {}) {
        this.cards = cards;
        this.container.innerHTML = '';

        cards.forEach((card, idx) => {
            const isSelected = this.selectedIds.has(card.id);
            const isLocked = this.lockedIds.has(card.id);

            let animClass = '';
            if (options.newCardId === card.id && options.newCardAnimClass) {
                animClass = options.newCardAnimClass;
            }

            const el = renderCard(card, {
                selected: isSelected,
                locked: isLocked,
                draggable: true,
                dealIndex: options.animate ? idx : undefined,
                animClass
            });

            // Click to select/deselect
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleSelect(card.id);
            });

            // Right-click to lock/unlock
            el.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.toggleLock(card.id);
            });

            // Drag events
            el.addEventListener('dragstart', (e) => {
                this.dragCardId = card.id;
                el.classList.add('card--dragging');
                e.dataTransfer.setData('text/plain', String(card.id));
                e.dataTransfer.effectAllowed = 'move';
                playCardClick();

                // If the card is selected, drag all selected cards
                if (this.selectedIds.has(card.id) && this.selectedIds.size > 1) {
                    const ids = [...this.selectedIds];
                    e.dataTransfer.setData('application/json', JSON.stringify(ids));
                } else {
                    e.dataTransfer.setData('application/json', JSON.stringify([card.id]));
                }
            });

            el.addEventListener('dragend', () => {
                el.classList.remove('card--dragging');
                this.dragCardId = null;
            });

            // Drop zone for reordering within hand
            el.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            });

            el.addEventListener('drop', (e) => {
                e.preventDefault();
                const draggedId = parseInt(e.dataTransfer.getData('text/plain'), 10);
                if (draggedId && draggedId !== card.id) {
                    this.callbacks.onReorder?.(draggedId, card.id);
                }
            });

            this.container.appendChild(el);
        });
    }

    /**
     * Toggle selection of a card.
     * @param {number} cardId
     */
    toggleSelect(cardId) {
        if (this.selectedIds.has(cardId)) {
            this.selectedIds.delete(cardId);
            playCardDeselect();
        } else {
            this.selectedIds.add(cardId);
            playCardSelect();
        }
        this.render(this.cards);
        this.callbacks.onSelectionChange?.(this.selectedIds);
    }

    /**
     * Toggle lock on a card.
     * @param {number} cardId
     */
    toggleLock(cardId) {
        if (this.lockedIds.has(cardId)) {
            this.lockedIds.delete(cardId);
        } else {
            this.lockedIds.add(cardId);
        }
        playCardClick();
        this.render(this.cards);
    }

    /**
     * Clear all selections.
     */
    clearSelection() {
        this.selectedIds.clear();
        this.render(this.cards);
    }

    /**
     * Get currently selected card IDs.
     * @returns {number[]}
     */
    getSelectedIds() {
        return [...this.selectedIds];
    }

    /**
     * Auto-organize: sort unlocked cards, keep locked cards in place.
     * @param {Array<object>} hand — the player's hand array (mutated in place)
     * @returns {Array<object>} — the reordered hand
     */
    autoOrganize(hand) {
        const locked = [];
        const lockedPositions = [];
        const unlocked = [];

        hand.forEach((card, idx) => {
            if (this.lockedIds.has(card.id)) {
                locked.push({ card, originalIdx: idx });
                lockedPositions.push(idx);
            } else {
                unlocked.push(card);
            }
        });

        // Sort unlocked
        const sortFn = this.sortMode === 'suit' ? compareCards : compareCardsByRank;
        unlocked.sort(sortFn);

        // Reconstruct: place locked cards back in their positions, fill gaps with sorted unlocked
        const result = new Array(hand.length);
        for (const { card, originalIdx } of locked) {
            result[originalIdx] = card;
        }
        let uIdx = 0;
        for (let i = 0; i < result.length; i++) {
            if (!result[i]) {
                result[i] = unlocked[uIdx++];
            }
        }

        return result;
    }

    /**
     * Toggle sort mode between suit-first and rank-first.
     */
    toggleSortMode() {
        this.sortMode = this.sortMode === 'suit' ? 'rank' : 'suit';
    }

    /**
     * Get current sort mode label.
     * @returns {string}
     */
    getSortModeLabel() {
        return this.sortMode === 'suit' ? 'by Suit' : 'by Rank';
    }
}
