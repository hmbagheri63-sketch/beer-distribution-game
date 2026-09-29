import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import {
  Role,
  ROLES,
  GameState,
  createInitialGame,
  submitOrder,
} from '../core/game';
import {
  saveGame,
  getGame,
  assignPlayer,
  getPlayer,
  getGamePlayers,
} from './db';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());

// Serve static build in production
app.use(express.static(path.resolve(process.cwd(), 'dist')));

// Track active socket connections by player token
const sockets = new Map<string, WebSocket>();

// Helper: Filter state for specific role (Authoritative server rule)
function getPlayerView(game: GameState, role: Role, assignedRoles: Role[]) {
  const roleState = game.roles[role];
  const submittedRoles = Object.keys(game.pendingOrders) as Role[];

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
      ? Object.fromEntries(
          ROLES.map((r) => [
            r,
            {
              inventory: game.roles[r].inventory,
              backlog: game.roles[r].backlog,
              costSoFar: game.roles[r].costSoFar,
            },
          ])
        )
      : null,
  };
}

function broadcastGame(gameId: string) {
  const game = getGame(gameId);
  if (!game) return;

  const players = getGamePlayers(gameId);
  const assignedRoles = players.map((p) => p.role);

  for (const player of players) {
    const ws = sockets.get(player.token);
    if (ws && ws.readyState === WebSocket.OPEN) {
      const view = getPlayerView(game, player.role, assignedRoles);
      view.gameId = gameId;
      ws.send(JSON.stringify({ type: 'STATE_UPDATE', payload: view }));
    }
  }
}

// REST endpoints for Lobby
app.post('/api/games', (req, res) => {
  const gameId = Math.random().toString(36).substring(2, 8).toUpperCase();
  const initial = createInitialGame();
  saveGame(gameId, initial);
  res.json({ gameId });
});

app.get('/api/games/:gameId', (req, res) => {
  const { gameId } = req.params;
  const game = getGame(gameId);
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  const players = getGamePlayers(gameId);
  res.json({
    gameId,
    round: game.round,
    isFinished: game.isFinished,
    takenRoles: players.map((p) => p.role),
  });
});

app.post('/api/games/:gameId/join', (req, res) => {
  const { gameId } = req.params;
  const { role } = req.body as { role: Role };

  const game = getGame(gameId);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  const token = uuidv4();
  const assigned = assignPlayer(token, gameId, role);
  if (!assigned) {
    return res.status(400).json({ error: 'Role already taken' });
  }

  res.json({ token, role, gameId });
});

// WebSocket Handler
wss.on('connection', (ws) => {
  let playerToken: string | null = null;

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === 'IDENTIFY') {
        const { token } = msg.payload;
        const player = getPlayer(token);
        if (!player) {
          ws.send(JSON.stringify({ type: 'ERROR', error: 'Invalid token' }));
          return;
        }

        playerToken = token;
        sockets.set(token, ws);
        broadcastGame(player.gameId);
      }

      if (msg.type === 'PLACE_ORDER') {
        if (!playerToken) return;
        const player = getPlayer(playerToken);
        if (!player) return;

        const { order } = msg.payload;
        const game = getGame(player.gameId);
        if (!game) return;

        try {
          const nextState = submitOrder(game, player.role, parseInt(order, 10));
          saveGame(player.gameId, nextState);
          broadcastGame(player.gameId);
        } catch (err: any) {
          ws.send(JSON.stringify({ type: 'ERROR', error: err.message }));
        }
      }
    } catch (e) {
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
