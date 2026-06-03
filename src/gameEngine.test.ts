import { describe, it, expect } from 'vitest';
import {
  getMatchdayMultiplier,
  resolveSingleBet,
  resolveDoubleChanceBet,
  resolveComboBet,
  calculateGroupStandings,
  progressKnockoutRounds,
  getActiveSessionBounds
} from './gameEngine';
import type { Match, SingleBet, DoubleChanceBet, ComboBet } from './types';

describe('gameEngine - Stage Multipliers', () => {
  it('should return correct multiplier for each stage', () => {
    expect(getMatchdayMultiplier(1)).toBe(1.0);
    expect(getMatchdayMultiplier(2)).toBe(1.05);
    expect(getMatchdayMultiplier(3)).toBe(1.10);
    expect(getMatchdayMultiplier(4)).toBe(1.20); // Round of 32
    expect(getMatchdayMultiplier(8)).toBe(1.50); // Final
  });
});

describe('gameEngine - Single Bet Resolution', () => {
  const mockMatch: Match = {
    id: 'm-1',
    homeTeam: 'Germany',
    awayTeam: 'Scotland',
    homeOdds: 1.5,
    drawOdds: 4.0,
    awayOdds: 6.0,
    matchday: 1,
    matchdayName: 'Group Stage - GW1',
    status: 'finished',
    homeScore: 2,
    awayScore: 0,
    kickoffTime: '20:00',
    date: '2026-06-12',
    result: '1'
  };

  it('should resolve a winning single bet correctly', () => {
    const bet: SingleBet = {
      id: 'b-1',
      userId: 'u-1',
      groupId: 'g-1',
      matchId: 'm-1',
      outcome: '1',
      amount: 100,
      powerupUsed: null,
      multiplier: 1.0,
      timestamp: new Date().toISOString(),
      status: 'pending',
      pointsWon: 0
    };
    const res = resolveSingleBet(bet, '1', mockMatch);
    expect(res.status).toBe('won');
    expect(res.pointsWon).toBe(150);
  });

  it('should resolve a losing single bet correctly', () => {
    const bet: SingleBet = {
      id: 'b-1',
      userId: 'u-1',
      groupId: 'g-1',
      matchId: 'm-1',
      outcome: '2',
      amount: 100,
      powerupUsed: null,
      multiplier: 1.0,
      timestamp: new Date().toISOString(),
      status: 'pending',
      pointsWon: 0
    };
    const res = resolveSingleBet(bet, '1', mockMatch);
    expect(res.status).toBe('lost');
    expect(res.pointsWon).toBe(0);
  });

  it('should double the payout when doublePoints power-up is used', () => {
    const bet: SingleBet = {
      id: 'b-1',
      userId: 'u-1',
      groupId: 'g-1',
      matchId: 'm-1',
      outcome: '1',
      amount: 100,
      multiplier: 1.0,
      powerupUsed: 'doublePoints',
      timestamp: new Date().toISOString(),
      status: 'pending',
      pointsWon: 0
    };
    const res = resolveSingleBet(bet, '1', mockMatch);
    expect(res.status).toBe('won');
    expect(res.pointsWon).toBe(300); // 100 * 1.5 * 1.0 * 2
  });

  it('should refund the stake when noLoss power-up is used on a losing group bet', () => {
    const bet: SingleBet = {
      id: 'b-1',
      userId: 'u-1',
      groupId: 'g-1',
      matchId: 'm-1',
      outcome: '2',
      amount: 100,
      multiplier: 1.0,
      powerupUsed: 'noLoss',
      timestamp: new Date().toISOString(),
      status: 'pending',
      pointsWon: 0
    };
    const res = resolveSingleBet(bet, '1', mockMatch);
    expect(res.status).toBe('noLossReturned');
    expect(res.pointsWon).toBe(100); // Refunded
  });
});

describe('gameEngine - Double Chance Bet Resolution', () => {
  const mockMatch: Match = {
    id: 'm-1',
    homeTeam: 'Germany',
    awayTeam: 'Scotland',
    homeOdds: 1.5,
    drawOdds: 4.0,
    awayOdds: 6.0,
    matchday: 1,
    matchdayName: 'Group Stage - GW1',
    status: 'finished',
    homeScore: 1,
    awayScore: 1,
    kickoffTime: '20:00',
    date: '2026-06-12',
    result: 'X'
  };

  it('should award points when one of the outcomes is correct', () => {
    const bet: DoubleChanceBet = {
      id: 'b-2',
      userId: 'u-1',
      groupId: 'g-1',
      matchId: 'm-1',
      outcome1: '1',
      amount1: 50,
      outcome2: 'X',
      amount2: 50,
      multiplier: 1.0,
      timestamp: new Date().toISOString(),
      status: 'pending',
      outcome1Status: 'pending',
      outcome2Status: 'pending',
      pointsWon: 0
    };
    const res = resolveDoubleChanceBet(bet, 'X', mockMatch);
    expect(res.outcome1Status).toBe('lost');
    expect(res.outcome2Status).toBe('won');
    expect(res.pointsWon).toBe(200); // 50 * 4.0
  });
});

describe('gameEngine - Combo Bet Resolution', () => {
  const mockMatches: Match[] = [
    { id: 'm-1', homeTeam: 'Germany', awayTeam: 'Scotland', homeOdds: 1.5, drawOdds: 4.0, awayOdds: 6.0, matchday: 1, matchdayName: 'Group Stage - GW1', status: 'finished', homeScore: 2, awayScore: 0, result: '1', kickoffTime: '20:00', date: '2026-06-12' },
    { id: 'm-2', homeTeam: 'Hungary', awayTeam: 'Switzerland', homeOdds: 3.0, drawOdds: 3.2, awayOdds: 2.3, matchday: 1, matchdayName: 'Group Stage - GW1', status: 'finished', homeScore: 0, awayScore: 2, result: '2', kickoffTime: '20:00', date: '2026-06-12' },
    { id: 'm-3', homeTeam: 'Spain', awayTeam: 'Croatia', homeOdds: 1.8, drawOdds: 3.4, awayOdds: 4.2, matchday: 1, matchdayName: 'Group Stage - GW1', status: 'finished', homeScore: 3, awayScore: 0, result: '1', kickoffTime: '20:00', date: '2026-06-12' }
  ];

  it('should win combo bet when all individual selections match', () => {
    const bet: ComboBet = {
      id: 'cb-1',
      userId: 'u-1',
      groupId: 'g-1',
      amount: 100,
      bets: [
        { matchId: 'm-1', outcome: '1', odds: 1.5 },
        { matchId: 'm-2', outcome: '2', odds: 2.3 },
        { matchId: 'm-3', outcome: '1', odds: 1.8 }
      ],
      timestamp: new Date().toISOString(),
      status: 'pending',
      pointsWon: 0
    };
    const matchResults = { 'm-1': '1' as const, 'm-2': '2' as const, 'm-3': '1' as const };
    const res = resolveComboBet(bet, matchResults, mockMatches, false);
    expect(res.status).toBe('won');
    // Payout = 100 * (1.5 * 2.3 * 1.8) * 1.0 = 100 * 6.21 = 621
    expect(res.pointsWon).toBe(621);
  });

  it('should include a 3-match bonus if toggled', () => {
    const bet: ComboBet = {
      id: 'cb-1',
      userId: 'u-1',
      groupId: 'g-1',
      amount: 100,
      bets: [
        { matchId: 'm-1', outcome: '1', odds: 1.5 },
        { matchId: 'm-2', outcome: '2', odds: 2.3 },
        { matchId: 'm-3', outcome: '1', odds: 1.8 }
      ],
      timestamp: new Date().toISOString(),
      status: 'pending',
      pointsWon: 0
    };
    const matchResults = { 'm-1': '1' as const, 'm-2': '2' as const, 'm-3': '1' as const };
    const res = resolveComboBet(bet, matchResults, mockMatches, true);
    expect(res.status).toBe('won');
    // Payout = (100 * 6.21) + (100 * 0.5) = 621 + 50 = 671
    expect(res.pointsWon).toBe(671);
  });

  it('should lose combo bet if any selection fails', () => {
    const bet: ComboBet = {
      id: 'cb-1',
      userId: 'u-1',
      groupId: 'g-1',
      amount: 100,
      bets: [
        { matchId: 'm-1', outcome: '1', odds: 1.5 },
        { matchId: 'm-2', outcome: '1', odds: 3.0 }, // Incorrect selection
        { matchId: 'm-3', outcome: '1', odds: 1.8 }
      ],
      timestamp: new Date().toISOString(),
      status: 'pending',
      pointsWon: 0
    };
    const matchResults = { 'm-1': '1' as const, 'm-2': '2' as const, 'm-3': '1' as const };
    const res = resolveComboBet(bet, matchResults, mockMatches, false);
    expect(res.status).toBe('lost');
    expect(res.pointsWon).toBe(0);
  });
});

describe('gameEngine - Standings Calculations', () => {
  const mockMatches: Match[] = [
    { id: 'm-1', homeTeam: 'Germany', awayTeam: 'Scotland', homeOdds: 1.5, drawOdds: 4.0, awayOdds: 6.0, matchday: 1, matchdayName: 'Group Stage - GW1', status: 'finished', homeScore: 5, awayScore: 1, result: '1', kickoffTime: '20:00', date: '2026-06-12' },
    { id: 'm-2', homeTeam: 'Hungary', awayTeam: 'Switzerland', homeOdds: 3.0, drawOdds: 3.2, awayOdds: 2.3, matchday: 1, matchdayName: 'Group Stage - GW1', status: 'finished', homeScore: 1, awayScore: 3, result: '2', kickoffTime: '20:00', date: '2026-06-12' },
    { id: 'm-3', homeTeam: 'Germany', awayTeam: 'Hungary', homeOdds: 1.4, drawOdds: 4.5, awayOdds: 8.0, matchday: 2, matchdayName: 'Group Stage - GW2', status: 'finished', homeScore: 2, awayScore: 0, result: '1', kickoffTime: '20:00', date: '2026-06-12' }
  ];

  it('should compute standings correctly for group A', () => {
    const groupTeams = ['Germany', 'Scotland', 'Hungary', 'Switzerland'];
    const standings = calculateGroupStandings('A', groupTeams, mockMatches);
    
    // Germany: played 2, won 2, pts 6, gf 7, ga 1, gd 6
    expect(standings[0].team).toBe('Germany');
    expect(standings[0].pts).toBe(6);
    expect(standings[0].gd).toBe(6);

    // Switzerland: played 1, won 1, pts 3, gf 3, ga 1, gd 2
    expect(standings[1].team).toBe('Switzerland');
    expect(standings[1].pts).toBe(3);
  });
});

describe('gameEngine - Knockout Progression', () => {
  it('should advance winning teams through progression rules', () => {
    const mockKnockouts: Match[] = [
      {
        id: 'm-73',
        homeTeam: 'Germany',
        awayTeam: 'Switzerland',
        homeOdds: 1.9,
        drawOdds: 3.3,
        awayOdds: 3.8,
        matchday: 4,
        matchdayName: 'Round of 32',
        status: 'finished',
        homeScore: 2,
        awayScore: 1,
        kickoffTime: '20:00',
        date: '2026-06-25',
        result: '1'
      },
      {
        id: 'm-90',
        homeTeam: 'Placeholder A',
        awayTeam: 'Placeholder B',
        homeOdds: 1.9,
        drawOdds: 3.3,
        awayOdds: 3.8,
        matchday: 5,
        matchdayName: 'Round of 16',
        status: 'scheduled',
        homeScore: null,
        awayScore: null,
        kickoffTime: '20:00',
        date: '2026-06-29',
        result: null
      }
    ];

    const updated = progressKnockoutRounds(mockKnockouts);
    // Match m-73 winner (Germany) should advance to m-90 homeTeam slot
    expect(updated[1].homeTeam).toBe('Germany');
  });
});

describe('gameEngine - Session Bounds', () => {
  it('should calculate correct session bounds for morning cutoff', () => {
    // Current date: 2026-06-12, time 14:00 (after 8:00 AM)
    const bounds = getActiveSessionBounds('2026-06-12', '14:00');
    // Start should be today 8:00 AM
    expect(bounds.start.getHours()).toBe(8);
    expect(bounds.start.getDate()).toBe(12);
    // End should be tomorrow 8:00 AM
    expect(bounds.end.getDate()).toBe(13);
  });

  it('should calculate correct session bounds for early night/morning before cutoff', () => {
    // Current date: 2026-06-12, time 04:00 (before 8:00 AM)
    const bounds = getActiveSessionBounds('2026-06-12', '04:00');
    // Start should be yesterday 8:00 AM
    expect(bounds.start.getDate()).toBe(11);
    // End should be today 8:00 AM
    expect(bounds.end.getDate()).toBe(12);
  });
});
