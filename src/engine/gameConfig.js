/**
 * Centralized game configuration defaults.
 * All tunable constants in one place for easy customization.
 * @module engine/gameConfig
 */

/** Default game settings */
export const DEFAULTS = {
    /** Elimination threshold — player is out when score reaches this */
    POINTS_LIMIT: 501,
    /** Number of Joker wildcards in the deck (0–10) */
    JOKER_COUNT: 4,
    /** Seconds per turn before auto-discard (30–600) */
    TURN_TIMER_SECONDS: 300,
    /** Minimum players to start a game */
    MIN_PLAYERS: 2,
    /** Maximum players allowed */
    MAX_PLAYERS: 4,
    /** Cards dealt to the starting player */
    HAND_SIZE_FIRST: 14,
    /** Cards dealt to other players */
    HAND_SIZE_OTHER: 13,
    /** Points required for opening meld */
    OPEN_REQUIREMENT: 51,
    /** Whether the 51-point opening rule is enforced */
    REQUIRE_OPENING: true,
    /** Whether players can swap a natural card for a Joker on the table */
    ALLOW_JOKER_SWAP: false,
    /** Speed mode — reduced timer, skip animations */
    SPEED_MODE: false,
};

/**
 * Merge user-provided settings with defaults.
 * @param {object} [overrides={}]
 * @returns {object}
 */
export function mergeConfig(overrides = {}) {
    const config = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS)) {
        if (overrides[key] !== undefined && overrides[key] !== null) {
            config[key] = overrides[key];
        }
    }
    // Clamp values
    config.JOKER_COUNT = Math.max(0, Math.min(10, config.JOKER_COUNT));
    config.TURN_TIMER_SECONDS = Math.max(30, Math.min(600, config.TURN_TIMER_SECONDS));
    config.POINTS_LIMIT = Math.max(50, Math.min(2000, config.POINTS_LIMIT));
    config.HAND_SIZE_FIRST = Math.max(7, Math.min(20, config.HAND_SIZE_FIRST));
    config.HAND_SIZE_OTHER = Math.max(7, Math.min(20, config.HAND_SIZE_OTHER));
    return config;
}

/** Available player colours */
export const PLAYER_COLOURS = [
    '#e63946', // Red
    '#457b9d', // Steel Blue
    '#2a9d8f', // Teal
    '#e9c46a', // Gold
    '#f4a261', // Orange
    '#264653', // Dark Teal
    '#a855f7', // Purple
    '#ec4899', // Pink
];

/** Available player icons (emoji) */
export const PLAYER_ICONS = [
    '♠', '♥', '♦', '♣', '🎴', '🃏', '👑', '🎯', '🔥', '⚡', '🌟', '💎'
];
