export interface User {
  id: string;
  username: string;
  email: string;
  avatarUrl: string;
}

export interface GroupMember {
  userId: string;
  username: string;
  balance: number; // points budget
  correctCount: number;
  totalBetsCount: number;
  winRate: number; // percentage (0 to 100)
  noLossUsed: number; // 0, 1, 2
  doubleChanceUsed: number; // 0, 1, 2
  doublePointsUsed: number; // 0, 1, 2
  dailyAdsWatched?: number;
  extraNoLossEarned?: boolean;
  extraDoubleChanceEarned?: boolean;
  extraDoublePointsEarned?: boolean;
  previousRank?: number;
  winnerPrediction?: string;
  winnerPredictionCount?: number;
}

export interface ChatMessage {
  id: string;
  groupId: string;
  userId: string;
  username: string;
  text: string;
  type: 'chat' | 'activity';
  timestamp: string;
  gifUrl?: string;
}

export interface Group {
  id: string;
  name: string;
  inviteCode: string;
  adminId: string;
  startingBudget: number; // 100, 200, 500, 1000
  toggle3MatchBonus: boolean;
  toggleMdBonus: boolean;
  mdBonusPoints: number; // e.g. 50, 100
  allowCombos?: boolean;
  allowOverdraft?: boolean;
  seasonStarted?: boolean;
  members: { [userId: string]: GroupMember };
}

export interface Match {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeOdds: number;
  drawOdds: number;
  awayOdds: number;
  kickoffTime: string; // HH:MM
  date: string; // YYYY-MM-DD
  matchday: number; // 1, 2, 3, 4 (Round of 32), 5 (Round of 16), 6 (QF), 7 (SF), 8 (Final)
  matchdayName: string; // 'Matchday 1', 'Round of 32', etc.
  status: 'scheduled' | 'live' | 'finished';
  result: '1' | 'X' | '2' | null;
  homeScore: number | null;
  awayScore: number | null;
  winner?: string | null;
}

export interface SingleBet {
  id: string;
  userId: string;
  groupId: string;
  matchId: string;
  outcome: '1' | 'X' | '2';
  amount: number;
  powerupUsed: 'noLoss' | 'doubleChance' | 'doublePoints' | null;
  status: 'pending' | 'won' | 'lost' | 'noLossReturned';
  pointsWon: number;
  multiplier: number; // e.g. 1.0, 1.05, 1.10
  timestamp: string;
  placedInRed?: boolean;
}

// Representing a Double Chance bet which consists of up to two outcomes selected by a user
export interface DoubleChanceBet {
  id: string;
  userId: string;
  groupId: string;
  matchId: string;
  outcome1: '1' | 'X' | '2';
  amount1: number;
  outcome2: '1' | 'X' | '2';
  amount2: number;
  status: 'pending' | 'resolved';
  outcome1Status: 'pending' | 'won' | 'lost';
  outcome2Status: 'pending' | 'won' | 'lost';
  pointsWon: number;
  multiplier: number;
  timestamp: string;
  placedInRed?: boolean;
}

export interface ComboBet {
  id: string;
  userId: string;
  groupId: string;
  bets: {
    matchId: string;
    outcome: '1' | 'X' | '2';
    odds: number;
  }[]; // Must contain exactly 3 match predictions
  amount: number;
  status: 'pending' | 'won' | 'lost';
  pointsWon: number;
  timestamp: string;
  placedInRed?: boolean;
}

export interface YesterdayRecap {
  groupId: string;
  date: string;
  matchResults: {
    matchId: string;
    homeTeam: string;
    awayTeam: string;
    score: string; // "3-1", "1-1", etc
    result: '1' | 'X' | '2';
  }[];
  memberRecaps: {
    userId: string;
    username: string;
    betsPlaced: {
      matchId: string;
      matchName: string;
      prediction: string; // "1", "1 & 2", etc
      amount: string; // "50 pts" or "50 + 50 pts"
      powerup: string | null;
      status: 'won' | 'lost' | 'noLossReturned';
      netPoints: number; // e.g. +75, -50, 0
    }[];
    comboBets: {
      matches: string[];
      predictions: string[];
      amount: number;
      status: 'won' | 'lost';
      netPoints: number;
    }[];
    netChange: number;
  }[];
}
