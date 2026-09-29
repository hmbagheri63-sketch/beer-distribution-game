import React, { useState, useEffect, useRef } from 'react';

type Role = 'Retailer' | 'Wholesaler' | 'Distributor' | 'Factory';
const ALL_ROLES: Role[] = ['Retailer', 'Wholesaler', 'Distributor', 'Factory'];

const ROLE_ICONS: Record<Role, string> = {
  Retailer: '🏪',
  Wholesaler: '🏢',
  Distributor: '🚚',
  Factory: '🏭',
};

interface RoleHistoryPoint {
  round: number;
  inventory: number;
  backlog: number;
  order: number;
  cost: number;
}

interface RoleState {
  inventory: number;
  backlog: number;
  pipeline: number[];
  lastOrderPlaced: number;
  costSoFar: number;
  lastShipmentArrived: number;
  lastIncomingOrder: number;
  lastShipped: number;
  lastRoundCost: number;
}

interface GamePayload {
  gameId: string;
  round: number;
  isFinished: boolean;
  assignedRoles: Role[];
  submittedRoles: Role[];
  myRole: Role;
  hasSubmittedThisRound: boolean;
  myState: RoleState;
  allResults: Record<Role, { inventory: number; backlog: number; costSoFar: number }> | null;
}

export function App() {
  const [token, setToken] = useState<string>(() => sessionStorage.getItem('player_token') || '');
  const [gameId, setGameId] = useState<string>(() => sessionStorage.getItem('game_id') || '');
  const [myRole, setMyRole] = useState<Role | null>(() => (sessionStorage.getItem('player_role') as Role) || null);
  
  const [gameState, setGameState] = useState<GamePayload | null>(null);
  const [orderInput, setOrderInput] = useState<string>('4');
  const [joinRoomInput, setJoinRoomInput] = useState<string>('');
  const [availableRoles, setAvailableRoles] = useState<Role[]>(ALL_ROLES);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [history, setHistory] = useState<RoleHistoryPoint[]>([]);
  
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'IDENTIFY', payload: { token } }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'STATE_UPDATE') {
        const payload: GamePayload = msg.payload;
        setGameState(payload);
        setErrorMsg('');

        if (payload.myState) {
          setHistory((prev) => {
            if (prev.some((p) => p.round === payload.round)) return prev;
            return [
              ...prev,
              {
                round: payload.round,
                inventory: payload.myState.inventory,
                backlog: payload.myState.backlog,
                order: payload.myState.lastOrderPlaced,
                cost: payload.myState.costSoFar,
              },
            ];
          });
        }
      } else if (msg.type === 'ERROR') {
        setErrorMsg(msg.error);
      }
    };

    return () => {
      ws.close();
    };
  }, [token]);

  const handleCreateGame = async () => {
    try {
      const res = await fetch('/api/games', { method: 'POST' });
      const data = await res.json();
      setGameId(data.gameId);
      sessionStorage.setItem('game_id', data.gameId);
      fetchRoomDetails(data.gameId);
    } catch {
      setErrorMsg('Failed to create game room');
    }
  };

  const fetchRoomDetails = async (id: string) => {
    try {
      const res = await fetch(`/api/games/${id}`);
      if (!res.ok) throw new Error('Room not found');
      const data = await res.json();
      setAvailableRoles(ALL_ROLES.filter((r) => !data.takenRoles.includes(r)));
      setGameId(id);
    } catch (e: any) {
      setErrorMsg(e.message);
    }
  };

  const handleJoinRole = async (role: Role) => {
    try {
      const res = await fetch(`/api/games/${gameId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to join');
      }
      const data = await res.json();
      sessionStorage.setItem('player_token', data.token);
      sessionStorage.setItem('game_id', gameId);
      sessionStorage.setItem('player_role', role);
      setToken(data.token);
      setMyRole(role);
    } catch (e: any) {
      setErrorMsg(e.message);
    }
  };

  const handleSendOrder = () => {
    const orderNum = parseInt(orderInput, 10);
    if (isNaN(orderNum) || orderNum < 0) {
      setErrorMsg('Please enter a valid non-negative order count');
      return;
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'PLACE_ORDER', payload: { order: orderNum } }));
    }
  };

  const handleLeave = () => {
    sessionStorage.clear();
    setToken('');
    setGameId('');
    setMyRole(null);
    setGameState(null);
    setHistory([]);
  };

  const renderTrendChart = () => {
    if (history.length < 2) return null;

    const width = 860;
    const height = 170;
    const padding = 34;

    const maxVal = Math.max(...history.map((h) => Math.max(h.inventory, h.backlog, 15)));
    const getX = (idx: number) => padding + (idx / (history.length - 1)) * (width - 2 * padding);
    const getY = (val: number) => height - padding - (val / maxVal) * (height - 2 * padding);

    const invPoints = history.map((h, i) => `${getX(i)},${getY(h.inventory)}`).join(' ');
    const backPoints = history.map((h, i) => `${getX(i)},${getY(h.backlog)}`).join(' ');

    return (
      <div style={{ background: '#ffffff', padding: 22, borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>
            Inventory & Backlog Trajectory
          </div>
          <div style={{ display: 'flex', gap: 20, fontSize: 13, fontWeight: 600 }}>
            <span style={{ color: '#0284c7', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#0284c7' }}></span> Inventory
            </span>
            <span style={{ color: '#e11d48', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#e11d48' }}></span> Backlog
            </span>
          </div>
        </div>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 160 }}>
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#e2e8f0" strokeWidth="1.5" />
          <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#e2e8f0" strokeWidth="1.5" />
          <polyline fill="none" stroke="#0284c7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={invPoints} />
          <polyline fill="none" stroke="#e11d48" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={backPoints} />
          {history.map((h, i) => (
            <circle key={`inv-${i}`} cx={getX(i)} cy={getY(h.inventory)} r="5" fill="#0284c7" stroke="#ffffff" strokeWidth="2" />
          ))}
          {history.map((h, i) => (
            <circle key={`bk-${i}`} cx={getX(i)} cy={getY(h.backlog)} r="5" fill="#e11d48" stroke="#ffffff" strokeWidth="2" />
          ))}
        </svg>
      </div>
    );
  };

  // 1. Lobby View
  if (!token || !gameState) {
    return (
      <div style={{ maxWidth: 580, margin: '60px auto', background: '#ffffff', padding: 40, borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 20px 25px -5px rgba(15,23,42,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 36, background: '#eff6ff', width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 16 }}>
            🍺
          </div>
          <div>
            <h1 style={{ fontSize: 24, margin: 0, color: '#0f172a', fontWeight: 800 }}>Beer Game Simulator</h1>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>Real-Time MIT Supply Chain Coordination</p>
          </div>
        </div>

        {errorMsg && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '12px 16px', borderRadius: 10, margin: '20px 0', fontSize: 14 }}>
            {errorMsg}
          </div>
        )}

        {!gameId ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 24 }}>
            <button
              onClick={handleCreateGame}
              style={{ background: '#2563eb', color: '#ffffff', padding: '16px', fontSize: 16, borderRadius: 12, boxShadow: '0 4px 12px rgba(37,99,235,0.25)' }}
            >
              + Create New Game Room
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0' }}>
              <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>OR JOIN EXISTING</span>
              <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                placeholder="6-character code"
                value={joinRoomInput}
                onChange={(e) => setJoinRoomInput(e.target.value.toUpperCase())}
                style={{ flex: 1, padding: '12px 16px', fontSize: 15 }}
              />
              <button
                onClick={() => fetchRoomDetails(joinRoomInput)}
                style={{ background: '#0f172a', color: '#ffffff', padding: '12px 24px', borderRadius: 10 }}
              >
                Join
              </button>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, background: '#f8fafc', padding: '12px 18px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <div>
                <span style={{ fontSize: 13, color: '#64748b' }}>Room: </span>
                <strong style={{ fontSize: 18, color: '#2563eb', letterSpacing: 1 }}>{gameId}</strong>
              </div>
              <button onClick={() => setGameId('')} style={{ background: '#e2e8f0', color: '#475569', padding: '6px 14px', borderRadius: 8, fontSize: 13 }}>Change</button>
            </div>
            <p style={{ fontSize: 14, color: '#475569', marginBottom: 14, fontWeight: 600 }}>Select your role in the supply chain:</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {ALL_ROLES.map((role) => {
                const isAvailable = availableRoles.includes(role);
                return (
                  <button
                    key={role}
                    disabled={!isAvailable}
                    onClick={() => handleJoinRole(role)}
                    style={{
                      padding: '18px 16px',
                      borderRadius: 14,
                      background: isAvailable ? '#ffffff' : '#f8fafc',
                      border: `1.5px solid ${isAvailable ? '#bfdbfe' : '#e2e8f0'}`,
                      color: isAvailable ? '#1e3a8a' : '#94a3b8',
                      cursor: isAvailable ? 'pointer' : 'not-allowed',
                      textAlign: 'left',
                      boxShadow: isAvailable ? '0 4px 6px -1px rgba(59,130,246,0.08)' : 'none',
                    }}
                  >
                    <div style={{ fontSize: 24, marginBottom: 4 }}>{ROLE_ICONS[role]}</div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{role}</div>
                    <div style={{ fontSize: 12, marginTop: 4, color: isAvailable ? '#2563eb' : '#94a3b8', fontWeight: 600 }}>
                      {isAvailable ? 'Click to Join' : 'Occupied'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // 2. Results View
  if (gameState.isFinished && gameState.allResults) {
    const totalCost = Object.values(gameState.allResults).reduce((sum, r) => sum + r.costSoFar, 0);
    return (
      <div style={{ background: '#ffffff', padding: 40, borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 20px 25px -5px rgba(15,23,42,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <span style={{ fontSize: 36 }}>🏆</span>
          <div>
            <h1 style={{ color: '#15803d', margin: 0, fontSize: 24, fontWeight: 800 }}>Simulation Complete (20 Rounds)</h1>
            <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: 14 }}>Chain-wide performance breakdown and cumulative costs</p>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', margin: '24px 0' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#64748b', fontSize: 13, textTransform: 'uppercase' }}>
              <th style={{ padding: '14px 12px' }}>Role</th>
              <th style={{ padding: '14px 12px' }}>Final Inventory</th>
              <th style={{ padding: '14px 12px' }}>Final Backlog</th>
              <th style={{ padding: '14px 12px' }}>Cumulative Expense</th>
            </tr>
          </thead>
          <tbody>
            {ALL_ROLES.map((role) => {
              const res = gameState.allResults![role];
              const isMe = role === gameState.myRole;
              return (
                <tr key={role} style={{ borderBottom: '1px solid #f1f5f9', background: isMe ? '#eff6ff' : 'transparent' }}>
                  <td style={{ padding: '16px 12px', fontWeight: 700, color: isMe ? '#1d4ed8' : '#0f172a' }}>
                    <span style={{ marginRight: 8 }}>{ROLE_ICONS[role]}</span>
                    {role} {isMe && '(You)'}
                  </td>
                  <td style={{ padding: '16px 12px', fontWeight: 600 }}>{res.inventory} units</td>
                  <td style={{ padding: '16px 12px', fontWeight: 600, color: res.backlog > 0 ? '#dc2626' : '#16a34a' }}>{res.backlog} units</td>
                  <td style={{ padding: '16px 12px', fontWeight: 800, color: '#d97706', fontSize: 16 }}>${res.costSoFar.toFixed(1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '20px 24px', borderRadius: 14, border: '1.5px solid #e2e8f0', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Total Chain Cost</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>Sum of all participant holding and backlog costs</div>
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#d97706' }}>${totalCost.toFixed(1)}</div>
        </div>

        <button onClick={handleLeave} style={{ background: '#0f172a', color: '#ffffff', padding: '14px 28px', borderRadius: 10 }}>Return to Lobby</button>
      </div>
    );
  }

  // 3. Active Simulation View
  const { myState, round, myRole: role, hasSubmittedThisRound, assignedRoles, submittedRoles } = gameState;
  const isWaitingForOthers = assignedRoles.length < 4;
  const rolesOrder: Role[] = ['Retailer', 'Wholesaler', 'Distributor', 'Factory'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Navbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff', padding: '16px 24px', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <div>
            <span style={{ color: '#64748b', fontSize: 12, textTransform: 'uppercase', fontWeight: 700 }}>Room Code</span>
            <div style={{ fontWeight: 800, fontSize: 18, color: '#0f172a' }}>{gameId}</div>
          </div>
          <div style={{ height: 28, width: 1, background: '#e2e8f0' }} />
          <div>
            <span style={{ color: '#64748b', fontSize: 12, textTransform: 'uppercase', fontWeight: 700 }}>Your Role</span>
            <div style={{ fontWeight: 800, fontSize: 18, color: '#2563eb', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{ROLE_ICONS[role]}</span> {role}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ background: '#eff6ff', padding: '8px 18px', borderRadius: 12, border: '1px solid #dbeafe', textAlign: 'center' }}>
            <span style={{ fontSize: 12, color: '#3b82f6', fontWeight: 700, textTransform: 'uppercase' }}>Round</span>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#1d4ed8' }}>{round} <span style={{ fontSize: 14, color: '#93c5fd' }}>/ 20</span></div>
          </div>
          <button onClick={handleLeave} style={{ background: '#f1f5f9', color: '#475569', padding: '10px 18px', borderRadius: 10, fontSize: 13, border: '1px solid #e2e8f0' }}>Quit</button>
        </div>
      </div>

      {/* Visual Supply Chain Pipeline */}
      <div style={{ background: '#ffffff', padding: 20, borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.03)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 14, letterSpacing: 0.5 }}>End-to-End Supply Chain Stream</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
          <div style={{ padding: '10px 16px', background: '#f8fafc', borderRadius: 12, fontSize: 13, color: '#64748b', border: '1px dashed #cbd5e1', fontWeight: 600 }}>
            🛒 Consumers
          </div>
          <span style={{ color: '#94a3b8', fontWeight: 'bold' }}>➔</span>
          {rolesOrder.map((r, idx) => {
            const isCurrent = r === role;
            const isAssigned = assignedRoles.includes(r);
            return (
              <React.Fragment key={r}>
                <div
                  style={{
                    padding: '12px 18px',
                    borderRadius: 12,
                    background: isCurrent ? '#2563eb' : isAssigned ? '#f8fafc' : '#f1f5f9',
                    border: isCurrent ? '2px solid #1d4ed8' : `1px solid ${isAssigned ? '#cbd5e1' : '#e2e8f0'}`,
                    color: isCurrent ? '#ffffff' : isAssigned ? '#0f172a' : '#94a3b8',
                    fontWeight: 700,
                    textAlign: 'center',
                    minWidth: 120,
                    boxShadow: isCurrent ? '0 4px 14px rgba(37,99,235,0.3)' : 'none',
                  }}
                >
                  <div style={{ fontSize: 18, marginBottom: 2 }}>{ROLE_ICONS[r]}</div>
                  <div style={{ fontSize: 13 }}>{r}</div>
                </div>
                {idx < rolesOrder.length - 1 && <span style={{ color: '#94a3b8', fontWeight: 'bold' }}>➔</span>}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {isWaitingForOthers ? (
        <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', padding: 28, borderRadius: 16, color: '#92400e', textAlign: 'center' }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: 18 }}>Waiting for other players to join... ({assignedRoles.length}/4)</h3>
          <p style={{ margin: 0, fontSize: 14, color: '#b45309' }}>Share Room Code <strong style={{ color: '#78350f', fontSize: 16 }}>{gameId}</strong> with teammates.</p>
        </div>
      ) : (
        <>
          {/* Key Metrics Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
            <div style={{ background: '#ffffff', padding: 20, borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
              <div style={{ color: '#64748b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Current Inventory</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: '#0284c7', margin: '4px 0' }}>{myState.inventory}</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Holding cost: $0.50/unit</div>
            </div>
            <div style={{ background: '#ffffff', padding: 20, borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
              <div style={{ color: '#64748b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Backlog (Unfilled)</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: myState.backlog > 0 ? '#e11d48' : '#16a34a', margin: '4px 0' }}>{myState.backlog}</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Penalty cost: $1.00/unit</div>
            </div>
            <div style={{ background: '#ffffff', padding: 20, borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
              <div style={{ color: '#64748b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Shipments in Transit</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#854d0e', margin: '6px 0' }}>
                {myState.pipeline[0] ?? 0} <span style={{ fontSize: 14, color: '#94a3b8', fontWeight: 500 }}>➔ next</span> | {myState.pipeline[1] ?? 0}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>2-round transit delay</div>
            </div>
            <div style={{ background: '#ffffff', padding: 20, borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
              <div style={{ color: '#64748b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Cumulative Cost</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: '#d97706', margin: '4px 0' }}>${myState.costSoFar.toFixed(1)}</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Last round: +${myState.lastRoundCost.toFixed(1)}</div>
            </div>
          </div>

          {/* Last Round Summary Bar */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '14px 20px', borderRadius: 12, fontSize: 13, display: 'flex', gap: 28, color: '#334155', fontWeight: 500 }}>
            <span>📦 Arrived: <strong style={{ color: '#0f172a' }}>{myState.lastShipmentArrived}</strong></span>
            <span>📥 Demand Received: <strong style={{ color: '#0f172a' }}>{myState.lastIncomingOrder}</strong></span>
            <span>📤 Shipped: <strong style={{ color: '#0f172a' }}>{myState.lastShipped}</strong></span>
            <span>💰 Round Cost: <strong style={{ color: '#d97706' }}>${myState.lastRoundCost.toFixed(1)}</strong></span>
          </div>

          {/* Order Placement Panel */}
          <div style={{ background: '#ffffff', padding: 24, borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.03)' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#0f172a', fontWeight: 700 }}>
              Order Units to Upstream Supplier (Round {round})
            </h3>
            {hasSubmittedThisRound ? (
              <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', color: '#15803d', padding: '14px 18px', borderRadius: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>✓</span> Order submitted! Waiting for the remaining roles to finalize round {round}...
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 14 }}>
                <input
                  type="number"
                  min="0"
                  value={orderInput}
                  onChange={(e) => setOrderInput(e.target.value)}
                  style={{ width: 140, fontSize: 18, padding: '10px 16px', fontWeight: 700 }}
                />
                <button
                  onClick={handleSendOrder}
                  style={{ background: '#16a34a', color: '#ffffff', padding: '10px 28px', fontSize: 15, borderRadius: 10, boxShadow: '0 4px 12px rgba(22,163,74,0.2)' }}
                >
                  Submit Order
                </button>
              </div>
            )}
          </div>

          {/* Peer Activity Badges */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: 18, borderRadius: 14 }}>
            <div style={{ color: '#64748b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', marginBottom: 10 }}>Team Status (Round {round}):</div>
            <div style={{ display: 'flex', gap: 12 }}>
              {ALL_ROLES.map((r) => {
                const submitted = submittedRoles.includes(r);
                return (
                  <div
                    key={r}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 10,
                      background: submitted ? '#f0fdf4' : '#f8fafc',
                      color: submitted ? '#15803d' : '#64748b',
                      fontSize: 13,
                      fontWeight: 600,
                      border: `1.5px solid ${submitted ? '#86efac' : '#e2e8f0'}`,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span>{ROLE_ICONS[r]}</span> {r}: {submitted ? 'Ready ✓' : 'Deciding...'}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Trend Chart */}
          {renderTrendChart()}
        </>
      )}
    </div>
  );
}
