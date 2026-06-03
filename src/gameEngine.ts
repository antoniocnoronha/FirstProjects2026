import type { Match, SingleBet, DoubleChanceBet, ComboBet, GroupMember } from './types';
import { getScrapedBaselineOdds } from './matchData';

// Multipliers for each tournament stage to keep the game exciting and allow catchups
export function getMatchdayMultiplier(matchday: number): number {
  switch (matchday) {
    case 1: return 1.0;
    case 2: return 1.05;
    case 3: return 1.10;
    case 4: return 1.20; // Round of 32
    case 5: return 1.25; // Round of 16
    case 6: return 1.30; // Quarterfinals
    case 7: return 1.40; // Semifinals;
    case 8: return 1.50; // Third place & Final
    default: return 1.0;
  }
}

// Resolve a Single Bet
export function resolveSingleBet(
  bet: SingleBet,
  matchResult: '1' | 'X' | '2',
  match: Match
): { status: SingleBet['status']; pointsWon: number } {
  const isCorrect = bet.outcome === matchResult;
  const isFinal = match.matchdayName.includes('Final') && !match.matchdayName.includes('Third');
  const multiplier = bet.multiplier;

  if (isCorrect) {
    const odds = bet.outcome === '1' ? match.homeOdds : bet.outcome === 'X' ? match.drawOdds : match.awayOdds;
    let payout = bet.amount * odds * multiplier;
    
    // Apply Double Points power-up
    if (bet.powerupUsed === 'doublePoints') {
      payout = payout * 2;
    }
    
    return {
      status: 'won',
      pointsWon: Math.round(payout)
    };
  } else {
    // Apply No Loss power-up (failsafe, cannot be used in Final)
    if (bet.powerupUsed === 'noLoss' && !isFinal) {
      return {
        status: 'noLossReturned',
        pointsWon: bet.amount // Return the wager amount back
      };
    }
    
    return {
      status: 'lost',
      pointsWon: 0
    };
  }
}

// Resolve a Double Chance Bet
export function resolveDoubleChanceBet(
  bet: DoubleChanceBet,
  matchResult: '1' | 'X' | '2',
  match: Match
): { outcome1Status: 'won' | 'lost'; outcome2Status: 'won' | 'lost'; pointsWon: number } {
  const isCorrect1 = bet.outcome1 === matchResult;
  const isCorrect2 = bet.outcome2 === matchResult;
  
  let pointsWon = 0;
  const multiplier = bet.multiplier;

  if (isCorrect1) {
    const odds1 = bet.outcome1 === '1' ? match.homeOdds : bet.outcome1 === 'X' ? match.drawOdds : match.awayOdds;
    pointsWon += bet.amount1 * odds1 * multiplier;
  }
  
  if (isCorrect2) {
    const odds2 = bet.outcome2 === '1' ? match.homeOdds : bet.outcome2 === 'X' ? match.drawOdds : match.awayOdds;
    pointsWon += bet.amount2 * odds2 * multiplier;
  }

  return {
    outcome1Status: isCorrect1 ? 'won' : 'lost',
    outcome2Status: isCorrect2 ? 'won' : 'lost',
    pointsWon: Math.round(pointsWon)
  };
}

// Resolve a Combo Bet (3 matches combined)
export function resolveComboBet(
  bet: ComboBet,
  matchResults: { [matchId: string]: '1' | 'X' | '2' | null },
  matches: Match[],
  toggle3MatchBonus: boolean
): { status: ComboBet['status']; pointsWon: number } {
  let allCorrect = true;
  let accumulatedOdds = 1;
  let multiplier = 1.0;

  for (const b of bet.bets) {
    const actualResult = matchResults[b.matchId];
    if (!actualResult || actualResult !== b.outcome) {
      allCorrect = false;
      break;
    }
    
    accumulatedOdds *= b.odds;
    const match = matches.find(m => m.id === b.matchId);
    if (match) {
      multiplier = Math.max(multiplier, getMatchdayMultiplier(match.matchday));
    }
  }

  if (allCorrect) {
    let payout = bet.amount * accumulatedOdds * multiplier;
    
    // Add 3-match bonus if toggled: equivalent to 50% of the total amount utilized to bet
    if (toggle3MatchBonus) {
      payout += bet.amount * 0.5;
    }
    
    return {
      status: 'won',
      pointsWon: Math.round(payout)
    };
  } else {
    return {
      status: 'lost',
      pointsWon: 0
    };
  }
}

// Calculate who got the most correct matches in a Matchday (out of 24)
export function resolveMatchdayMVP(
  matchday: number,
  members: GroupMember[],
  singleBets: SingleBet[],
  doubleChanceBets: DoubleChanceBet[],
  comboBets: ComboBet[],
  matches: Match[]
): { mvpUserIds: string[]; maxCorrect: number; userCorrectCounts: { [userId: string]: number } } {
  const matchdayMatchIds = new Set(
    matches.filter(m => m.matchday === matchday).map(m => m.id)
  );

  const userCorrectCounts: { [userId: string]: number } = {};
  
  // Initialize
  members.forEach(m => {
    userCorrectCounts[m.userId] = 0;
  });

  // Check Single Bets
  singleBets.forEach(bet => {
    if (matchdayMatchIds.has(bet.matchId) && bet.status === 'won') {
      userCorrectCounts[bet.userId] = (userCorrectCounts[bet.userId] || 0) + 1;
    }
  });

  // Check Double Chance Bets
  doubleChanceBets.forEach(bet => {
    if (matchdayMatchIds.has(bet.matchId) && bet.status === 'resolved') {
      const wonAny = bet.outcome1Status === 'won' || bet.outcome2Status === 'won';
      if (wonAny) {
        userCorrectCounts[bet.userId] = (userCorrectCounts[bet.userId] || 0) + 1;
      }
    }
  });

  // Check Combo Bets (Count each correct prediction or just count the full combo?
  // Usually, MVP of matchday matches counts individual matches predicted correctly on that matchday.)
  // Let's count individual matches inside combos that were correct!
  comboBets.forEach(bet => {
    bet.bets.forEach(subBet => {
      const match = matches.find(m => m.id === subBet.matchId);
      if (match && match.matchday === matchday && match.result === subBet.outcome) {
        userCorrectCounts[bet.userId] = (userCorrectCounts[bet.userId] || 0) + 1;
      }
    });
  });

  let maxCorrect = 0;
  let mvpUserIds: string[] = [];

  Object.entries(userCorrectCounts).forEach(([userId, count]) => {
    if (count > maxCorrect) {
      maxCorrect = count;
      mvpUserIds = [userId];
    } else if (count === maxCorrect && count > 0) {
      mvpUserIds.push(userId);
    }
  });

  return { mvpUserIds, maxCorrect, userCorrectCounts };
}

export interface TeamStanding {
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
}

export interface ThirdPlaceStanding extends TeamStanding {
  group: string;
}

const TEAM_RATINGS: Record<string, number> = {
  Argentina: 95, France: 94, Brazil: 93, Spain: 92, England: 92,
  Portugal: 90, Germany: 89, Netherlands: 88, Belgium: 87, Italy: 87,
  Croatia: 86, Uruguay: 87, USA: 83, 'United States': 83, Mexico: 82, Morocco: 86,
  Senegal: 82, Japan: 83, 'South Korea': 81, Canada: 78, Colombia: 85,
  Ecuador: 80, Switzerland: 81, Denmark: 81, Sweden: 80, Poland: 79,
  Nigeria: 79, Cameroon: 78, Egypt: 79, 'Saudi Arabia': 74, Australia: 78,
  Iran: 76, 'South Africa': 75, 'New Zealand': 65, 'Costa Rica': 74,
  Panama: 73, Jamaica: 73, Tunisia: 76, Algeria: 78, Austria: 80,
  Turkey: 81, Türkiye: 81, Chile: 78, Peru: 76, Wales: 78, Ukraine: 80,
  Scotland: 77, Ghana: 76, 'Ivory Coast': 80, Qatar: 72, 'Czech Republic': 77,
  'Bosnia and Herzegovina': 76, Paraguay: 76, Haiti: 68, 'Cape Verde': 74,
  'DR Congo': 73, Uzbekistan: 74, Iraq: 71, Norway: 81, Jordan: 70,
  'Curaçao': 66
};

// Calculate standings for a specific group A-L
export function calculateGroupStandings(
  _groupLetter: string,
  groupTeams: string[],
  matches: Match[]
): TeamStanding[] {
  const standings: Record<string, TeamStanding> = {};
  
  groupTeams.forEach(t => {
    standings[t] = { team: t, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
  });

  const groupTeamsSet = new Set(groupTeams);

  matches.forEach(m => {
    if (m.matchday <= 3 && groupTeamsSet.has(m.homeTeam) && groupTeamsSet.has(m.awayTeam)) {
      if (m.status === 'finished' && m.homeScore !== null && m.awayScore !== null) {
        const home = standings[m.homeTeam];
        const away = standings[m.awayTeam];
        
        home.played += 1;
        away.played += 1;
        home.gf += m.homeScore;
        home.ga += m.awayScore;
        away.gf += m.awayScore;
        away.ga += m.homeScore;
        home.gd = home.gf - home.ga;
        away.gd = away.gf - away.ga;

        if (m.homeScore > m.awayScore) {
          home.won += 1;
          home.pts += 3;
          away.lost += 1;
        } else if (m.homeScore === m.awayScore) {
          home.drawn += 1;
          home.pts += 1;
          away.drawn += 1;
          away.pts += 1;
        } else {
          away.won += 1;
          away.pts += 3;
          home.lost += 1;
        }
      }
    }
  });

  return Object.values(standings).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    const ratingA = TEAM_RATINGS[a.team] || 70;
    const ratingB = TEAM_RATINGS[b.team] || 70;
    if (ratingB !== ratingA) return ratingB - ratingA;
    return a.team.localeCompare(b.team);
  });
}

// Rank the 12 third-placed teams from Groups A-L to extract the top 8
export function rankThirdPlaceTeams(
  groupsTeams: Record<string, string[]>,
  matches: Match[]
): ThirdPlaceStanding[] {
  const thirds: ThirdPlaceStanding[] = [];

  Object.entries(groupsTeams).forEach(([groupLetter, teams]) => {
    const groupStandings = calculateGroupStandings(groupLetter, teams, matches);
    if (groupStandings.length >= 3) {
      thirds.push({
        group: groupLetter,
        ...groupStandings[2]
      });
    }
  });

  return thirds.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    const ratingA = TEAM_RATINGS[a.team] || 70;
    const ratingB = TEAM_RATINGS[b.team] || 70;
    if (ratingB !== ratingA) return ratingB - ratingA;
    return a.team.localeCompare(b.team);
  });
}

export function isPlaceholder(team: string): boolean {
  if (!team) return true;
  const realTeams = new Set([
    'Mexico', 'South Africa', 'South Korea', 'Czech Republic',
    'Canada', 'Bosnia and Herzegovina', 'Qatar', 'Switzerland',
    'Brazil', 'Morocco', 'Haiti', 'Scotland',
    'United States', 'USA', 'Paraguay', 'Australia', 'Türkiye', 'Turkey',
    'Germany', 'Curaçao', 'Ivory Coast', 'Ecuador',
    'Netherlands', 'Japan', 'Sweden', 'Tunisia',
    'Belgium', 'Egypt', 'Iran', 'New Zealand',
    'Spain', 'Uruguay', 'Cape Verde', 'Saudi Arabia',
    'France', 'Senegal', 'Iraq', 'Norway',
    'Argentina', 'Algeria', 'Austria', 'Jordan',
    'Portugal', 'DR Congo', 'Uzbekistan', 'Colombia',
    'England', 'Croatia', 'Ghana', 'Panama'
  ]);
  return !realTeams.has(team);
}

const PROGRESSION_MAP: Record<number, { targetId: number; pos: 'home' | 'away' }> = {
  // R32 -> R16
  73: { targetId: 90, pos: 'home' },
  74: { targetId: 89, pos: 'home' },
  75: { targetId: 90, pos: 'away' },
  76: { targetId: 91, pos: 'home' },
  77: { targetId: 89, pos: 'away' },
  78: { targetId: 91, pos: 'away' },
  79: { targetId: 92, pos: 'home' },
  80: { targetId: 92, pos: 'away' },
  81: { targetId: 94, pos: 'home' },
  82: { targetId: 94, pos: 'away' },
  83: { targetId: 93, pos: 'home' },
  84: { targetId: 93, pos: 'away' },
  85: { targetId: 96, pos: 'home' },
  86: { targetId: 95, pos: 'home' },
  87: { targetId: 96, pos: 'away' },
  88: { targetId: 95, pos: 'away' },

  // R16 -> QF
  89: { targetId: 97, pos: 'home' },
  90: { targetId: 97, pos: 'away' },
  91: { targetId: 99, pos: 'home' },
  92: { targetId: 99, pos: 'away' },
  93: { targetId: 98, pos: 'home' },
  94: { targetId: 98, pos: 'away' },
  95: { targetId: 100, pos: 'home' },
  96: { targetId: 100, pos: 'away' },

  // QF -> SF
  97: { targetId: 101, pos: 'home' },
  98: { targetId: 101, pos: 'away' },
  99: { targetId: 102, pos: 'home' },
  100: { targetId: 102, pos: 'away' }
};

// Progress winners through the knockout bracket tree automatically
export function progressKnockoutRounds(matches: Match[]): Match[] {
  const updatedMatches = [...matches];

  const getWinnerName = (m: Match): string => {
    if (m.homeScore === null || m.awayScore === null) return '';
    if (m.homeScore > m.awayScore) return m.homeTeam;
    if (m.awayScore > m.homeScore) return m.awayTeam;
    return m.winner || m.homeTeam;
  };

  const getLoserName = (m: Match): string => {
    if (m.homeScore === null || m.awayScore === null) return '';
    if (m.homeScore > m.awayScore) return m.awayTeam;
    if (m.awayScore > m.homeScore) return m.homeTeam;
    return m.winner === m.homeTeam ? m.awayTeam : m.homeTeam;
  };

  for (let i = 0; i < updatedMatches.length; i++) {
    const match = updatedMatches[i];
    const matchIdNum = parseInt(match.id.replace('m-', ''));

    if (match.status === 'finished' && matchIdNum >= 73) {
      const winnerName = getWinnerName(match);
      const loserName = getLoserName(match);

      if (matchIdNum >= 73 && matchIdNum <= 100) {
        const prog = PROGRESSION_MAP[matchIdNum];
        if (prog) {
          const targetIdx = updatedMatches.findIndex(m => m.id === `m-${prog.targetId}`);
          if (targetIdx !== -1) {
            const target = { ...updatedMatches[targetIdx] };
            if (prog.pos === 'home') {
              target.homeTeam = winnerName;
            } else {
              target.awayTeam = winnerName;
            }
            updatedMatches[targetIdx] = target;
          }
        }
      } else if (matchIdNum === 101 || matchIdNum === 102) {
        // SF -> 3rd Place Playoff (m-103) & Final (m-104)
        const isHome = (matchIdNum === 101);
        const finalIdx = updatedMatches.findIndex(m => m.id === 'm-104');
        const thirdIdx = updatedMatches.findIndex(m => m.id === 'm-103');
        
        if (finalIdx !== -1) {
          const finalMatch = { ...updatedMatches[finalIdx] };
          if (isHome) finalMatch.homeTeam = winnerName;
          else finalMatch.awayTeam = winnerName;
          updatedMatches[finalIdx] = finalMatch;
        }
        
        if (thirdIdx !== -1) {
          const thirdMatch = { ...updatedMatches[thirdIdx] };
          if (isHome) thirdMatch.homeTeam = loserName;
          else thirdMatch.awayTeam = loserName;
          updatedMatches[thirdIdx] = thirdMatch;
        }
      }
    }
  }

  // Update betting odds dynamically when both teams are populated
  for (let i = 0; i < updatedMatches.length; i++) {
    const match = updatedMatches[i];
    const matchIdNum = parseInt(match.id.replace('m-', ''));
    if (matchIdNum >= 73) {
      if (!isPlaceholder(match.homeTeam) && !isPlaceholder(match.awayTeam)) {
        if (match.homeOdds === 1.90 && match.drawOdds === 3.30 && match.awayOdds === 3.80) {
          const odds = getScrapedBaselineOdds(match.homeTeam, match.awayTeam);
          updatedMatches[i] = {
            ...match,
            ...odds
          };
        }
      }
    }
  }

  return updatedMatches;
}

export interface SessionBounds {
  start: Date;
  end: Date;
}

export function getActiveSessionBounds(currentDateStr: string, currentTimeStr: string): SessionBounds {
  const [year, month, day] = currentDateStr.split('-').map(Number);
  const [hour, minute] = currentTimeStr.split(':').map(Number);
  const currentSimDateTime = new Date(year, month - 1, day, hour, minute);

  const cutoffToday = new Date(year, month - 1, day, 8, 0);

  if (currentSimDateTime >= cutoffToday) {
    const start = new Date(year, month - 1, day, 8, 0);
    const end = new Date(year, month - 1, day + 1, 8, 0);
    return { start, end };
  } else {
    const start = new Date(year, month - 1, day - 1, 8, 0);
    const end = new Date(year, month - 1, day, 8, 0);
    return { start, end };
  }
}



