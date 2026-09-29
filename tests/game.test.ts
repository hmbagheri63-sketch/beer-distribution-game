import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createInitialGame, submitOrder, ROLES, Role } from '../src/core/game';

describe('Beer Game Rules Verification', () => {
  it('matches the fixture everyone-orders-four.json exactly for all 20 rounds', () => {
    const fixturePath = path.resolve(__dirname, '../fixtures/everyone-orders-four.json');
    const fixtureData = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

    let game = createInitialGame();

    for (let round = 1; round <= 20; round++) {
      expect(game.round).toBe(round);

      // Submit order 4 for all 4 roles to process the round
      for (const role of ROLES) {
        game = submitOrder(game, role, 4);
      }

      const expectedRound = fixtureData.rounds[round - 1];
      expect(expectedRound.round).toBe(round);

      for (const role of ROLES) {
        const roleKey = role.toLowerCase() as 'retailer' | 'wholesaler' | 'distributor' | 'factory';
        const expected = expectedRound[roleKey];
        const actual = game.roles[role];

        expect(actual.lastShipmentArrived).toBe(expected.shipmentArrived);
        expect(actual.lastIncomingOrder).toBe(expected.incomingOrder);
        expect(actual.lastShipped).toBe(expected.shipped);
        expect(actual.inventory).toBe(expected.inventory);
        expect(actual.backlog).toBe(expected.backlog);
        expect(actual.lastRoundCost).toBe(expected.roundCost);
      }
    }

    expect(game.isFinished).toBe(true);

    // Final total costs check
    expect(game.roles.Retailer.costSoFar).toBe(394);
    expect(game.roles.Wholesaler.costSoFar).toBe(120);
    expect(game.roles.Distributor.costSoFar).toBe(120);
    expect(game.roles.Factory.costSoFar).toBe(120);
  });
});
