/**
 * WebSocket client wrapper for multiplayer communication.
 * Handles connection, reconnection, and message routing.
 * @module engine/networkClient
 */

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/** @type {WebSocket|null} */
let socket = null;
/** @type {Object<string, Function[]>} */
const handlers = {};
/** @type {boolean} */
let intentionalClose = false;
/** @type {number} */
let retryCount = 0;
/** @type {string|null} */
let lastUrl = null;
/** @type {Function|null} */
let onDisconnect = null;
/** @type {Function|null} */
let onReconnect = null;

/**
 * Register a disconnect callback.
 * @param {Function} fn
 */
export function setOnDisconnect(fn) {
    onDisconnect = fn;
}

/**
 * Register a reconnect callback.
 * @param {Function} fn
 */
export function setOnReconnect(fn) {
    onReconnect = fn;
}

/**
 * Connect to the WebSocket server.
 * @param {string} [url] — ws:// or wss:// URL (auto-derived from page URL if omitted)
 * @returns {Promise<void>}
 */
export function connect(url) {
    if (!url) {
        const loc = window.location;
        const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
        url = `${proto}//${loc.host}`;
    }
    lastUrl = url;
    intentionalClose = false;
    retryCount = 0;

    return new Promise((resolve, reject) => {
        try {
            socket = new WebSocket(url);
        } catch (err) {
            reject(new Error(`WebSocket connection failed: ${err.message}`));
            return;
        }

        socket.addEventListener('open', () => {
            retryCount = 0;
            resolve();
        });

        socket.addEventListener('message', (event) => {
            try {
                const msg = JSON.parse(event.data);
                const type = msg.type;
                if (type && handlers[type]) {
                    for (const fn of handlers[type]) {
                        fn(msg);
                    }
                }
            } catch (err) {
                console.warn('networkClient: failed to parse message —', err.message);
            }
        });

        socket.addEventListener('close', () => {
            if (!intentionalClose) {
                onDisconnect?.();
                attemptReconnect();
            }
        });

        socket.addEventListener('error', (err) => {
            console.warn('networkClient: WebSocket error —', err);
            // The 'close' event will follow, triggering reconnection
            reject(new Error('WebSocket error'));
        });
    });
}

/**
 * Attempt automatic reconnection with exponential backoff.
 */
function attemptReconnect() {
    if (intentionalClose || retryCount >= MAX_RETRIES || !lastUrl) return;

    retryCount++;
    const delayMs = BASE_DELAY_MS * Math.pow(2, retryCount - 1);

    setTimeout(async () => {
        try {
            await connect(lastUrl);
            onReconnect?.();

            // Re-send reconnect message with session info
            const session = getSession();
            if (session) {
                send('reconnect', {
                    roomCode: session.roomCode,
                    playerId: session.playerId,
                    playerName: session.playerName
                });
            }
        } catch {
            // Will retry via close handler
        }
    }, delayMs);
}

/**
 * Send a typed message to the server.
 * @param {string} type — message type
 * @param {object} [payload={}]
 */
export function send(type, payload = {}) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.warn('networkClient: cannot send, socket not open');
        return;
    }
    socket.send(JSON.stringify({ type, ...payload }));
}

/**
 * Register a handler for a specific message type.
 * @param {string} type
 * @param {Function} callback
 */
export function on(type, callback) {
    if (!handlers[type]) handlers[type] = [];
    handlers[type].push(callback);
}

/**
 * Remove all handlers for a specific type (or all types).
 * @param {string} [type]
 */
export function off(type) {
    if (type) {
        delete handlers[type];
    } else {
        for (const key of Object.keys(handlers)) {
            delete handlers[key];
        }
    }
}

/**
 * Disconnect cleanly.
 */
export function disconnect() {
    intentionalClose = true;
    if (socket) {
        socket.close();
        socket = null;
    }
}

/**
 * Check if connected.
 * @returns {boolean}
 */
export function isConnected() {
    return socket !== null && socket.readyState === WebSocket.OPEN;
}

// ═══════════════════════════════
// SESSION / COOKIE MANAGEMENT
// ═══════════════════════════════

const SESSION_COOKIE = 'remik_session';

/**
 * Save session info to a cookie (24h expiry).
 * @param {{ roomCode: string, playerId: string, playerName: string }} session
 */
export function saveSession(session) {
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toUTCString();
    const value = encodeURIComponent(JSON.stringify(session));
    document.cookie = `${SESSION_COOKIE}=${value}; expires=${expires}; path=/; SameSite=Strict`;
}

/**
 * Read session info from cookie.
 * @returns {{ roomCode: string, playerId: string, playerName: string }|null}
 */
export function getSession() {
    const match = document.cookie.split('; ').find(row => row.startsWith(`${SESSION_COOKIE}=`));
    if (!match) return null;
    try {
        return JSON.parse(decodeURIComponent(match.split('=')[1]));
    } catch {
        return null;
    }
}

/**
 * Clear the session cookie.
 */
export function clearSession() {
    document.cookie = `${SESSION_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Strict`;
}
