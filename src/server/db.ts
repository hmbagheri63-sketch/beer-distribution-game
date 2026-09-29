import Database from 'better-sqlite3';
import path from 'path';
import { GameState, Role, createInitialGame } from '../core/game';

const dbPath = path.resolve(process.cwd(), 'beer_game.db');
const db = new Database(dbPath);

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

export interface StoredGame {
  id: string;
  state: GameState;
}

export function saveGame(gameId: string, state: GameState): void {
  const stmt = db.prepare(`
    INSERT INTO games (id, state) VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET state = excluded.state
  `);
  stmt.run(gameId, JSON.stringify(state));
}

export function getGame(gameId: string): GameState | null {
  const row = db.prepare('SELECT state FROM games WHERE id = ?').get(gameId) as { state: string } | undefined;
  if (!row) return null;
  return JSON.parse(row.state) as GameState;
}

export function assignPlayer(token: string, gameId: string, role: Role): boolean {
  try {
    const stmt = db.prepare('INSERT INTO players (token, game_id, role) VALUES (?, ?, ?)');
    stmt.run(token, gameId, role);
    return true;
  } catch (err) {
    return false; // Role already taken or player exists
  }
}

export function getPlayer(token: string): { gameId: string; role: Role } | null {
  const row = db.prepare('SELECT game_id, role FROM players WHERE token = ?').get(token) as
    | { game_id: string; role: Role }
    | undefined;
  if (!row) return null;
  return { gameId: row.game_id, role: row.role };
}

export function getGamePlayers(gameId: string): { role: Role; token: string }[] {
  const rows = db.prepare('SELECT role, token FROM players WHERE game_id = ?').all(gameId) as {
    role: Role;
    token: string;
  }[];
  return rows;
}
