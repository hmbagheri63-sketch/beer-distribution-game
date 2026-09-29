"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveGame = saveGame;
exports.getGame = getGame;
exports.assignPlayer = assignPlayer;
exports.getPlayer = getPlayer;
exports.getGamePlayers = getGamePlayers;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const dbPath = path_1.default.resolve(process.cwd(), 'beer_game.db');
const db = new better_sqlite3_1.default(dbPath);
// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS players (
    token TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(game_id, role)
  );
`);
function saveGame(gameId, state) {
    const stmt = db.prepare(`
    INSERT INTO games (id, state) VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET state = excluded.state
  `);
    stmt.run(gameId, JSON.stringify(state));
}
function getGame(gameId) {
    const row = db.prepare('SELECT state FROM games WHERE id = ?').get(gameId);
    if (!row)
        return null;
    return JSON.parse(row.state);
}
function assignPlayer(token, gameId, role) {
    try {
        const stmt = db.prepare('INSERT INTO players (token, game_id, role) VALUES (?, ?, ?)');
        stmt.run(token, gameId, role);
        return true;
    }
    catch (err) {
        return false; // Role already taken or player exists
    }
}
function getPlayer(token) {
    const row = db.prepare('SELECT game_id, role FROM players WHERE token = ?').get(token);
    if (!row)
        return null;
    return { gameId: row.game_id, role: row.role };
}
function getGamePlayers(gameId) {
    const rows = db.prepare('SELECT role, token FROM players WHERE game_id = ?').all(gameId);
    return rows;
}
