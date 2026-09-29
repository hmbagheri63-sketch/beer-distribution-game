"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const ws_1 = require("ws");
const uuid_1 = require("uuid");
const path_1 = __importDefault(require("path"));
const game_1 = require("../core/game");
const db_1 = require("./db");
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const wss = new ws_1.WebSocketServer({ server });
app.use(express_1.default.json());
// Serve static build in production
app.use(express_1.default.static(path_1.default.resolve(process.cwd(), 'dist')));
// Track active socket connections by player token
const sockets = new Map();
// Helper: Filter state for specific role (Authoritative server rule)
function getPlayerView(game, role, assignedRoles) {
    const roleState = game.roles[role];
    const submittedRoles = Object.keys(game.pendingOrders);
    // During game, hide other roles' exact numbers. Show all only when game finished.
    return {
        gameId: '', // injected on send
        round: game.round,
        isFinished: game.isFinished,
        assignedRoles,
        submittedRoles,
        myRole: role,
        hasSubmittedThisRound: game.pendingOrders[role] !== undefined,
        myState: roleState,
        allResults: game.isFinished
            ? Object.fromEntries(game_1.ROLES.map((r) => [
                r,
                {
                    inventory: game.roles[r].inventory,
                    backlog: game.roles[r].backlog,
                    costSoFar: game.roles[r].costSoFar,
                },
            ]))
            : null,
    };
}
function broadcastGame(gameId) {
    const game = (0, db_1.getGame)(gameId);
    if (!game)
        return;
    const players = (0, db_1.getGamePlayers)(gameId);
    const assignedRoles = players.map((p) => p.role);
    for (const player of players) {
        const ws = sockets.get(player.token);
        if (ws && ws.readyState === ws_1.WebSocket.OPEN) {
            const view = getPlayerView(game, player.role, assignedRoles);
            view.gameId = gameId;
            ws.send(JSON.stringify({ type: 'STATE_UPDATE', payload: view }));
        }
    }
}
// REST endpoints for Lobby
app.post('/api/games', (req, res) => {
    const gameId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const initial = (0, game_1.createInitialGame)();
    (0, db_1.saveGame)(gameId, initial);
    res.json({ gameId });
});
app.get('/api/games/:gameId', (req, res) => {
    const { gameId } = req.params;
    const game = (0, db_1.getGame)(gameId);
    if (!game) {
        return res.status(404).json({ error: 'Game not found' });
    }
    const players = (0, db_1.getGamePlayers)(gameId);
    res.json({
        gameId,
        round: game.round,
        isFinished: game.isFinished,
        takenRoles: players.map((p) => p.role),
    });
});
app.post('/api/games/:gameId/join', (req, res) => {
    const { gameId } = req.params;
    const { role } = req.body;
    const game = (0, db_1.getGame)(gameId);
    if (!game)
        return res.status(404).json({ error: 'Game not found' });
    if (!game_1.ROLES.includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
    }
    const token = (0, uuid_1.v4)();
    const assigned = (0, db_1.assignPlayer)(token, gameId, role);
    if (!assigned) {
        return res.status(400).json({ error: 'Role already taken' });
    }
    res.json({ token, role, gameId });
});
// WebSocket Handler
wss.on('connection', (ws) => {
    let playerToken = null;
    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw.toString());
            if (msg.type === 'IDENTIFY') {
                const { token } = msg.payload;
                const player = (0, db_1.getPlayer)(token);
                if (!player) {
                    ws.send(JSON.stringify({ type: 'ERROR', error: 'Invalid token' }));
                    return;
                }
                playerToken = token;
                sockets.set(token, ws);
                broadcastGame(player.gameId);
            }
            if (msg.type === 'PLACE_ORDER') {
                if (!playerToken)
                    return;
                const player = (0, db_1.getPlayer)(playerToken);
                if (!player)
                    return;
                const { order } = msg.payload;
                const game = (0, db_1.getGame)(player.gameId);
                if (!game)
                    return;
                try {
                    const nextState = (0, game_1.submitOrder)(game, player.role, parseInt(order, 10));
                    (0, db_1.saveGame)(player.gameId, nextState);
                    broadcastGame(player.gameId);
                }
                catch (err) {
                    ws.send(JSON.stringify({ type: 'ERROR', error: err.message }));
                }
            }
        }
        catch (e) {
            ws.send(JSON.stringify({ type: 'ERROR', error: 'Malformed message' }));
        }
    });
    ws.on('close', () => {
        if (playerToken) {
            sockets.delete(playerToken);
        }
    });
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
