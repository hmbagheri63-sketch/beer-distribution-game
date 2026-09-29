export type Role = 'Retailer' | 'Wholesaler' | 'Distributor' | 'Factory';

export const ROLES: Role[] = ['Retailer', 'Wholesaler', 'Distributor', 'Factory'];

export interface RoleState {
  inventory: number;
  backlog: number;
  pipeline: number[]; // [arriving next round, arriving round after]
  lastOrderPlaced: number;
  costSoFar: number;
  lastShipmentArrived: number;
  lastIncomingOrder: number;
  lastShipped: number;
  lastRoundCost: number;
}

export interface GameState {
  round: number; // 1 to 20
  isFinished: boolean;
  roles: Record<Role, RoleState>;
  pendingOrders: Partial<Record<Role, number>>;
}

export function createInitialRoleState(): RoleState {
  return {
    inventory: 12,
    backlog: 0,
    pipeline: [4, 4],
    lastOrderPlaced: 4,
    costSoFar: 0,
    lastShipmentArrived: 0,
    lastIncomingOrder: 0,
    lastShipped: 0,
    lastRoundCost: 0,
  };
}

export function getCustomerDemand(round: number): number {
  return round <= 4 ? 4 : 8;
}

export function createInitialGame(): GameState {
  return {
    round: 1,
    isFinished: false,
    roles: {
      Retailer: createInitialRoleState(),
      Wholesaler: createInitialRoleState(),
      Distributor: createInitialRoleState(),
      Factory: createInitialRoleState(),
    },
    pendingOrders: {},
  };
}

export function submitOrder(game: GameState, role: Role, order: number): GameState {
  if (game.isFinished) {
    throw new Error('Game is already finished');
  }
  if (order < 0 || !Number.isInteger(order)) {
    throw new Error('Order must be a non-negative integer');
  }
  if (game.pendingOrders[role] !== undefined) {
    throw new Error(`Order for ${role} already submitted for round ${game.round}`);
  }

  const nextPending = { ...game.pendingOrders, [role]: order };

  // If not all roles have submitted, just record the order
  if (ROLES.some((r) => nextPending[r] === undefined)) {
    return {
      ...game,
      pendingOrders: nextPending,
    };
  }

  // All four have submitted -> Advance the round
  return processRound(game, nextPending as Record<Role, number>);
}

export function processRound(game: GameState, orders: Record<Role, number>): GameState {
  const currentRound = game.round;
  const demand = getCustomerDemand(currentRound);

  // Incoming orders this round:
  // Retailer gets customer demand
  // Other roles get downstream neighbor's order placed last round
  const incomingOrders: Record<Role, number> = {
    Retailer: demand,
    Wholesaler: game.roles.Retailer.lastOrderPlaced,
    Distributor: game.roles.Wholesaler.lastOrderPlaced,
    Factory: game.roles.Distributor.lastOrderPlaced,
  };

  const nextRoles = {} as Record<Role, RoleState>;
  const shipmentsOut = {} as Record<Role, number>;

  // Step 1: Shipments arrive & Step 2: Orders arrive & Step 3: Ship & Step 4: Costs
  for (const role of ROLES) {
    const prev = game.roles[role];
    const arrived = prev.pipeline[0] ?? 0;
    const inventoryAfterArrival = prev.inventory + arrived;

    const incomingOrder = incomingOrders[role];
    const totalDemand = prev.backlog + incomingOrder;
    const shipped = Math.min(inventoryAfterArrival, totalDemand);

    const endingInventory = inventoryAfterArrival - shipped;
    const endingBacklog = totalDemand - shipped;

    const roundCost = 0.5 * endingInventory + 1.0 * endingBacklog;
    const costSoFar = prev.costSoFar + roundCost;

    shipmentsOut[role] = shipped;

    nextRoles[role] = {
      inventory: endingInventory,
      backlog: endingBacklog,
      pipeline: [prev.pipeline[1] ?? 0], // pipeline[1] moves to [0], we will push next arrival below
      lastOrderPlaced: orders[role],
      costSoFar,
      lastShipmentArrived: arrived,
      lastIncomingOrder: incomingOrder,
      lastShipped: shipped,
      lastRoundCost: roundCost,
    };
  }

  // Step 5: Advance pipeline (2 rounds delay)
  // Retailer receives shipment from Wholesaler
  // Wholesaler receives from Distributor
  // Distributor receives from Factory
  // Factory receives from unlimited supplier (ships exactly what Factory ordered last round)
  nextRoles.Retailer.pipeline.push(shipmentsOut.Wholesaler);
  nextRoles.Wholesaler.pipeline.push(shipmentsOut.Distributor);
  nextRoles.Distributor.pipeline.push(shipmentsOut.Factory);
  nextRoles.Factory.pipeline.push(game.roles.Factory.lastOrderPlaced);

  const nextRound = currentRound + 1;
  const isFinished = currentRound >= 20;

  return {
    round: nextRound,
    isFinished,
    roles: nextRoles,
    pendingOrders: {},
  };
}
