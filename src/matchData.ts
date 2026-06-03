import type { Match } from './types';

// Pre-scraped real baseline odds for the Group Stage pairings
const baselineOddsTable: Record<string, { homeOdds: number; drawOdds: number; awayOdds: number }> = {
  'Mexico-South Africa': { homeOdds: 1.85, drawOdds: 3.4, awayOdds: 4.8 },
  'South Korea-Czech Republic': { homeOdds: 2.1, drawOdds: 3.25, awayOdds: 3.65 },
  'Canada-Bosnia and Herzegovina': { homeOdds: 1.75, drawOdds: 3.6, awayOdds: 5.05 },
  'United States-Paraguay': { homeOdds: 1.55, drawOdds: 4.1, awayOdds: 6.2 },
  'Qatar-Switzerland': { homeOdds: 4.5, drawOdds: 3.6, awayOdds: 1.8 },
  'Brazil-Morocco': { homeOdds: 1.48, drawOdds: 4.3, awayOdds: 7.2 },
  'Haiti-Scotland': { homeOdds: 5.5, drawOdds: 3.8, awayOdds: 1.65 },
  'Australia-Türkiye': { homeOdds: 2.8, drawOdds: 3.2, awayOdds: 2.55 },
  'Germany-Curaçao': { homeOdds: 1.15, drawOdds: 7.5, awayOdds: 18.0 },
  'Netherlands-Japan': { homeOdds: 1.7, drawOdds: 3.75, awayOdds: 5.1 },
  'Ivory Coast-Ecuador': { homeOdds: 2.5, drawOdds: 3.15, awayOdds: 2.95 },
  'Sweden-Tunisia': { homeOdds: 1.8, drawOdds: 3.5, awayOdds: 4.8 },
  'Spain-Cape Verde': { homeOdds: 1.25, drawOdds: 5.75, awayOdds: 12.0 },
  'Belgium-Egypt': { homeOdds: 1.6, drawOdds: 3.9, awayOdds: 5.8 },
  'Saudi Arabia-Uruguay': { homeOdds: 6.5, drawOdds: 4.2, awayOdds: 1.5 },
  'Iran-New Zealand': { homeOdds: 1.85, drawOdds: 3.4, awayOdds: 4.6 },
  'France-Senegal': { homeOdds: 1.45, drawOdds: 4.4, awayOdds: 7.5 },
  'Iraq-Norway': { homeOdds: 4.2, drawOdds: 3.5, awayOdds: 1.9 },
  'Argentina-Algeria': { homeOdds: 1.3, drawOdds: 5.5, awayOdds: 10.0 },
  'Austria-Jordan': { homeOdds: 1.4, drawOdds: 4.6, awayOdds: 8.0 },
  'Portugal-DR Congo': { homeOdds: 1.35, drawOdds: 5.0, awayOdds: 9.0 },
  'England-Croatia': { homeOdds: 1.8, drawOdds: 3.5, awayOdds: 4.7 },
  'Ghana-Panama': { homeOdds: 1.7, drawOdds: 3.7, awayOdds: 5.2 },
  'Uzbekistan-Colombia': { homeOdds: 4.8, drawOdds: 3.6, awayOdds: 1.75 },
  'Czech Republic-South Africa': { homeOdds: 2.05, drawOdds: 3.3, awayOdds: 3.8 },
  'Switzerland-Bosnia and Herzegovina': { homeOdds: 1.65, drawOdds: 3.8, awayOdds: 5.5 },
  'Canada-Qatar': { homeOdds: 1.5, drawOdds: 4.2, awayOdds: 6.8 },
  'Mexico-South Korea': { homeOdds: 1.95, drawOdds: 3.4, awayOdds: 4.1 },
  'United States-Australia': { homeOdds: 1.65, drawOdds: 3.9, awayOdds: 5.4 },
  'Scotland-Morocco': { homeOdds: 2.75, drawOdds: 3.2, awayOdds: 2.65 },
  'Brazil-Haiti': { homeOdds: 1.1, drawOdds: 9.0, awayOdds: 25.0 },
  'Türkiye-Paraguay': { homeOdds: 2.1, drawOdds: 3.25, awayOdds: 3.6 },
  'Netherlands-Sweden': { homeOdds: 1.9, drawOdds: 3.45, awayOdds: 4.2 },
  'Germany-Ivory Coast': { homeOdds: 1.45, drawOdds: 4.4, awayOdds: 7.2 },
  'Ecuador-Curaçao': { homeOdds: 1.35, drawOdds: 5.0, awayOdds: 9.0 },
  'Tunisia-Japan': { homeOdds: 3.8, drawOdds: 3.3, awayOdds: 2.05 },
  'Spain-Saudi Arabia': { homeOdds: 1.2, drawOdds: 6.5, awayOdds: 15.0 },
  'Belgium-Iran': { homeOdds: 1.4, drawOdds: 4.6, awayOdds: 8.5 },
  'Uruguay-Cape Verde': { homeOdds: 1.3, drawOdds: 5.25, awayOdds: 10.5 },
  'New Zealand-Egypt': { homeOdds: 3.5, drawOdds: 3.3, awayOdds: 2.15 },
  'Argentina-Austria': { homeOdds: 1.5, drawOdds: 4.2, awayOdds: 6.6 },
  'France-Iraq': { homeOdds: 1.2, drawOdds: 6.5, awayOdds: 14.0 },
  'Norway-Senegal': { homeOdds: 2.25, drawOdds: 3.25, awayOdds: 3.3 },
  'Jordan-Algeria': { homeOdds: 3.2, drawOdds: 3.2, awayOdds: 2.3 },
  'Portugal-Uzbekistan': { homeOdds: 1.3, drawOdds: 5.25, awayOdds: 10.0 },
  'England-Ghana': { homeOdds: 1.48, drawOdds: 4.3, awayOdds: 7.0 },
  'Panama-Croatia': { homeOdds: 5.5, drawOdds: 3.8, awayOdds: 1.62 },
  'Colombia-DR Congo': { homeOdds: 1.4, drawOdds: 4.6, awayOdds: 8.5 },
  'Switzerland-Canada': { homeOdds: 2.1, drawOdds: 3.3, awayOdds: 3.6 },
  'Bosnia and Herzegovina-Qatar': { homeOdds: 1.95, drawOdds: 3.4, awayOdds: 4.0 },
  'Morocco-Haiti': { homeOdds: 1.3, drawOdds: 5.25, awayOdds: 10.5 },
  'Scotland-Brazil': { homeOdds: 7.0, drawOdds: 4.5, awayOdds: 1.45 },
  'South Africa-South Korea': { homeOdds: 3.3, drawOdds: 3.3, awayOdds: 2.2 },
  'Czech Republic-Mexico': { homeOdds: 3.6, drawOdds: 3.3, awayOdds: 2.1 },
  'Curaçao-Ivory Coast': { homeOdds: 5.8, drawOdds: 3.9, awayOdds: 1.58 },
  'Ecuador-Germany': { homeOdds: 4.5, drawOdds: 3.75, awayOdds: 1.78 },
  'Japan-Sweden': { homeOdds: 2.4, drawOdds: 3.25, awayOdds: 3.0 },
  'Tunisia-Netherlands': { homeOdds: 5.25, drawOdds: 3.8, awayOdds: 1.65 },
  'Paraguay-Australia': { homeOdds: 2.5, drawOdds: 3.2, awayOdds: 2.9 },
  'Türkiye-United States': { homeOdds: 3.1, drawOdds: 3.25, awayOdds: 2.35 },
  'Norway-France': { homeOdds: 4.8, drawOdds: 3.6, awayOdds: 1.75 },
  'Senegal-Iraq': { homeOdds: 1.7, drawOdds: 3.7, awayOdds: 5.25 },
  'Cape Verde-Saudi Arabia': { homeOdds: 2.15, drawOdds: 3.2, awayOdds: 3.55 },
  'Uruguay-Spain': { homeOdds: 3.5, drawOdds: 3.3, awayOdds: 2.15 },
  'Egypt-Iran': { homeOdds: 2.05, drawOdds: 3.25, awayOdds: 3.8 },
  'New Zealand-Belgium': { homeOdds: 9.0, drawOdds: 5.0, awayOdds: 1.35 },
  'Croatia-Ghana': { homeOdds: 1.85, drawOdds: 3.45, awayOdds: 4.4 },
  'Panama-England': { homeOdds: 12.0, drawOdds: 5.75, awayOdds: 1.25 },
  'Colombia-Portugal': { homeOdds: 3.2, drawOdds: 3.3, awayOdds: 2.25 },
  'DR Congo-Uzbekistan': { homeOdds: 2.65, drawOdds: 3.2, awayOdds: 2.7 },
  'Algeria-Austria': { homeOdds: 2.8, drawOdds: 3.2, awayOdds: 2.6 },
  'Jordan-Argentina': { homeOdds: 13.0, drawOdds: 6.0, awayOdds: 1.22 },
};

const teamRatings: Record<string, number> = {
  'Argentina': 95,
  'France': 94,
  'Brazil': 93,
  'Spain': 92,
  'England': 92,
  'Portugal': 90,
  'Germany': 89,
  'Netherlands': 88,
  'Belgium': 87,
  'Italy': 87,
  'Croatia': 86,
  'Uruguay': 87,
  'USA': 83,
  'United States': 83,
  'Mexico': 82,
  'Morocco': 86,
  'Senegal': 82,
  'Japan': 83,
  'South Korea': 81,
  'Canada': 78,
  'Colombia': 85,
  'Ecuador': 80,
  'Switzerland': 81,
  'Denmark': 81,
  'Sweden': 80,
  'Poland': 79,
  'Nigeria': 79,
  'Cameroon': 78,
  'Egypt': 79,
  'Saudi Arabia': 74,
  'Australia': 78,
  'Iran': 76,
  'South Africa': 75,
  'New Zealand': 65,
  'Costa Rica': 74,
  'Panama': 73,
  'Jamaica': 73,
  'Tunisia': 76,
  'Algeria': 78,
  'Austria': 80,
  'Turkey': 81,
  'Türkiye': 81,
  'Chile': 78,
  'Peru': 76,
  'Wales': 78,
  'Ukraine': 80,
  'Scotland': 77,
  'Ghana': 76,
  'Ivory Coast': 80,
  'Qatar': 72,
  'Czech Republic': 77,
  'Bosnia and Herzegovina': 76,
  'Paraguay': 76,
  'Haiti': 68,
  'Cape Verde': 74,
  'DR Congo': 73,
  'Uzbekistan': 74,
  'Iraq': 71,
  'Norway': 81,
  'Jordan': 70,
  'Curaçao': 66,
};

export const GROUPS_TEAMS: Record<string, string[]> = {
  A: ["Mexico", "South Africa", "South Korea", "Czech Republic"],
  B: ["Canada", "Bosnia and Herzegovina", "Qatar", "Switzerland"],
  C: ["Brazil", "Morocco", "Haiti", "Scotland"],
  D: ["United States", "Paraguay", "Australia", "T\u00fcrkiye"],
  E: ["Germany", "Cura\u00e7ao", "Ivory Coast", "Ecuador"],
  F: ["Netherlands", "Japan", "Sweden", "Tunisia"],
  G: ["Belgium", "Egypt", "Iran", "New Zealand"],
  H: ["Spain", "Uruguay", "Cape Verde", "Saudi Arabia"],
  I: ["France", "Senegal", "Iraq", "Norway"],
  J: ["Argentina", "Algeria", "Austria", "Jordan"],
  K: ["Portugal", "DR Congo", "Uzbekistan", "Colombia"],
  L: ["England", "Croatia", "Ghana", "Panama"],
};

export function getScrapedBaselineOdds(home: string, away: string): { homeOdds: number; drawOdds: number; awayOdds: number } {
  const key1 = home + '-' + away;
  const key2 = away + '-' + home;
  
  if (baselineOddsTable[key1]) {
    return baselineOddsTable[key1];
  }
  if (baselineOddsTable[key2]) {
    const original = baselineOddsTable[key2];
    return { homeOdds: original.awayOdds, drawOdds: original.drawOdds, awayOdds: original.homeOdds };
  }

  const rHome = teamRatings[home] || 75;
  const rAway = teamRatings[away] || 75;
  const diff = rHome - rAway;

  let homeProb = 0.38 + diff * 0.015;
  let awayProb = 0.34 - diff * 0.015;
  
  homeProb = Math.max(0.1, Math.min(0.8, homeProb));
  awayProb = Math.max(0.1, Math.min(0.8, awayProb));
  const drawProb = 1.0 - homeProb - awayProb;

  const margin = 1.06;
  const homeOdds = Math.round((margin / homeProb) * 100) / 100;
  const drawOdds = Math.round((margin / drawProb) * 100) / 100;
  const awayOdds = Math.round((margin / awayProb) * 100) / 100;

  return { homeOdds, drawOdds, awayOdds };
}

export function getInitialMatches(): Match[] {
  const matches: Match[] = [];

  matches.push({
    id: 'm-1',
    homeTeam: 'Mexico',
    awayTeam: 'South Africa',
    ...getScrapedBaselineOdds('Mexico', 'South Africa'),
    kickoffTime: '20:00',
    date: '2026-06-11',
    matchday: 1,
    matchdayName: 'Matchday 1',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-2',
    homeTeam: 'South Korea',
    awayTeam: 'Czech Republic',
    ...getScrapedBaselineOdds('South Korea', 'Czech Republic'),
    kickoffTime: '03:00',
    date: '2026-06-12',
    matchday: 1,
    matchdayName: 'Matchday 1',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-3',
    homeTeam: 'Czech Republic',
    awayTeam: 'South Africa',
    ...getScrapedBaselineOdds('Czech Republic', 'South Africa'),
    kickoffTime: '17:00',
    date: '2026-06-18',
    matchday: 2,
    matchdayName: 'Matchday 2',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-4',
    homeTeam: 'Mexico',
    awayTeam: 'South Korea',
    ...getScrapedBaselineOdds('Mexico', 'South Korea'),
    kickoffTime: '02:00',
    date: '2026-06-19',
    matchday: 2,
    matchdayName: 'Matchday 2',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-5',
    homeTeam: 'Czech Republic',
    awayTeam: 'Mexico',
    ...getScrapedBaselineOdds('Czech Republic', 'Mexico'),
    kickoffTime: '02:00',
    date: '2026-06-25',
    matchday: 3,
    matchdayName: 'Matchday 3',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-6',
    homeTeam: 'South Africa',
    awayTeam: 'South Korea',
    ...getScrapedBaselineOdds('South Africa', 'South Korea'),
    kickoffTime: '02:00',
    date: '2026-06-25',
    matchday: 3,
    matchdayName: 'Matchday 3',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-7',
    homeTeam: 'Canada',
    awayTeam: 'Bosnia and Herzegovina',
    ...getScrapedBaselineOdds('Canada', 'Bosnia and Herzegovina'),
    kickoffTime: '20:00',
    date: '2026-06-12',
    matchday: 1,
    matchdayName: 'Matchday 1',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-8',
    homeTeam: 'Qatar',
    awayTeam: 'Switzerland',
    ...getScrapedBaselineOdds('Qatar', 'Switzerland'),
    kickoffTime: '20:00',
    date: '2026-06-13',
    matchday: 1,
    matchdayName: 'Matchday 1',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-9',
    homeTeam: 'Switzerland',
    awayTeam: 'Bosnia and Herzegovina',
    ...getScrapedBaselineOdds('Switzerland', 'Bosnia and Herzegovina'),
    kickoffTime: '20:00',
    date: '2026-06-18',
    matchday: 2,
    matchdayName: 'Matchday 2',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-10',
    homeTeam: 'Canada',
    awayTeam: 'Qatar',
    ...getScrapedBaselineOdds('Canada', 'Qatar'),
    kickoffTime: '23:00',
    date: '2026-06-18',
    matchday: 2,
    matchdayName: 'Matchday 2',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-11',
    homeTeam: 'Switzerland',
    awayTeam: 'Canada',
    ...getScrapedBaselineOdds('Switzerland', 'Canada'),
    kickoffTime: '20:00',
    date: '2026-06-24',
    matchday: 3,
    matchdayName: 'Matchday 3',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-12',
    homeTeam: 'Bosnia and Herzegovina',
    awayTeam: 'Qatar',
    ...getScrapedBaselineOdds('Bosnia and Herzegovina', 'Qatar'),
    kickoffTime: '20:00',
    date: '2026-06-24',
    matchday: 3,
    matchdayName: 'Matchday 3',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-13',
    homeTeam: 'Brazil',
    awayTeam: 'Morocco',
    ...getScrapedBaselineOdds('Brazil', 'Morocco'),
    kickoffTime: '23:00',
    date: '2026-06-13',
    matchday: 1,
    matchdayName: 'Matchday 1',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-14',
    homeTeam: 'Haiti',
    awayTeam: 'Scotland',
    ...getScrapedBaselineOdds('Haiti', 'Scotland'),
    kickoffTime: '02:00',
    date: '2026-06-14',
    matchday: 1,
    matchdayName: 'Matchday 1',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-15',
    homeTeam: 'Scotland',
    awayTeam: 'Morocco',
    ...getScrapedBaselineOdds('Scotland', 'Morocco'),
    kickoffTime: '23:00',
    date: '2026-06-19',
    matchday: 2,
    matchdayName: 'Matchday 2',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-16',
    homeTeam: 'Brazil',
    awayTeam: 'Haiti',
    ...getScrapedBaselineOdds('Brazil', 'Haiti'),
    kickoffTime: '01:30',
    date: '2026-06-20',
    matchday: 2,
    matchdayName: 'Matchday 2',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-17',
    homeTeam: 'Scotland',
    awayTeam: 'Brazil',
    ...getScrapedBaselineOdds('Scotland', 'Brazil'),
    kickoffTime: '23:00',
    date: '2026-06-24',
    matchday: 3,
    matchdayName: 'Matchday 3',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-18',
    homeTeam: 'Morocco',
    awayTeam: 'Haiti',
    ...getScrapedBaselineOdds('Morocco', 'Haiti'),
    kickoffTime: '23:00',
    date: '2026-06-24',
    matchday: 3,
    matchdayName: 'Matchday 3',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-19',
    homeTeam: 'United States',
    awayTeam: 'Paraguay',
    ...getScrapedBaselineOdds('United States', 'Paraguay'),
    kickoffTime: '02:00',
    date: '2026-06-13',
    matchday: 1,
    matchdayName: 'Matchday 1',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-20',
    homeTeam: 'Australia',
    awayTeam: 'Türkiye',
    ...getScrapedBaselineOdds('Australia', 'Türkiye'),
    kickoffTime: '05:00',
    date: '2026-06-14',
    matchday: 1,
    matchdayName: 'Matchday 1',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-21',
    homeTeam: 'United States',
    awayTeam: 'Australia',
    ...getScrapedBaselineOdds('United States', 'Australia'),
    kickoffTime: '20:00',
    date: '2026-06-19',
    matchday: 2,
    matchdayName: 'Matchday 2',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-22',
    homeTeam: 'Türkiye',
    awayTeam: 'Paraguay',
    ...getScrapedBaselineOdds('Türkiye', 'Paraguay'),
    kickoffTime: '04:00',
    date: '2026-06-20',
    matchday: 2,
    matchdayName: 'Matchday 2',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-23',
    homeTeam: 'Türkiye',
    awayTeam: 'United States',
    ...getScrapedBaselineOdds('Türkiye', 'United States'),
    kickoffTime: '03:00',
    date: '2026-06-26',
    matchday: 3,
    matchdayName: 'Matchday 3',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-24',
    homeTeam: 'Paraguay',
    awayTeam: 'Australia',
    ...getScrapedBaselineOdds('Paraguay', 'Australia'),
    kickoffTime: '03:00',
    date: '2026-06-26',
    matchday: 3,
    matchdayName: 'Matchday 3',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-25',
    homeTeam: 'Germany',
    awayTeam: 'Curaçao',
    ...getScrapedBaselineOdds('Germany', 'Curaçao'),
    kickoffTime: '18:00',
    date: '2026-06-14',
    matchday: 1,
    matchdayName: 'Matchday 1',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-26',
    homeTeam: 'Ivory Coast',
    awayTeam: 'Ecuador',
    ...getScrapedBaselineOdds('Ivory Coast', 'Ecuador'),
    kickoffTime: '00:00',
    date: '2026-06-15',
    matchday: 1,
    matchdayName: 'Matchday 1',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-27',
    homeTeam: 'Germany',
    awayTeam: 'Ivory Coast',
    ...getScrapedBaselineOdds('Germany', 'Ivory Coast'),
    kickoffTime: '21:00',
    date: '2026-06-20',
    matchday: 2,
    matchdayName: 'Matchday 2',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-28',
    homeTeam: 'Ecuador',
    awayTeam: 'Curaçao',
    ...getScrapedBaselineOdds('Ecuador', 'Curaçao'),
    kickoffTime: '01:00',
    date: '2026-06-21',
    matchday: 2,
    matchdayName: 'Matchday 2',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-29',
    homeTeam: 'Curaçao',
    awayTeam: 'Ivory Coast',
    ...getScrapedBaselineOdds('Curaçao', 'Ivory Coast'),
    kickoffTime: '21:00',
    date: '2026-06-25',
    matchday: 3,
    matchdayName: 'Matchday 3',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-30',
    homeTeam: 'Ecuador',
    awayTeam: 'Germany',
    ...getScrapedBaselineOdds('Ecuador', 'Germany'),
    kickoffTime: '21:00',
    date: '2026-06-25',
    matchday: 3,
    matchdayName: 'Matchday 3',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-31',
    homeTeam: 'Netherlands',
    awayTeam: 'Japan',
    ...getScrapedBaselineOdds('Netherlands', 'Japan'),
    kickoffTime: '21:00',
    date: '2026-06-14',
    matchday: 1,
    matchdayName: 'Matchday 1',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-32',
    homeTeam: 'Sweden',
    awayTeam: 'Tunisia',
    ...getScrapedBaselineOdds('Sweden', 'Tunisia'),
    kickoffTime: '03:00',
    date: '2026-06-15',
    matchday: 1,
    matchdayName: 'Matchday 1',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-33',
    homeTeam: 'Netherlands',
    awayTeam: 'Sweden',
    ...getScrapedBaselineOdds('Netherlands', 'Sweden'),
    kickoffTime: '18:00',
    date: '2026-06-20',
    matchday: 2,
    matchdayName: 'Matchday 2',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-34',
    homeTeam: 'Tunisia',
    awayTeam: 'Japan',
    ...getScrapedBaselineOdds('Tunisia', 'Japan'),
    kickoffTime: '05:00',
    date: '2026-06-21',
    matchday: 2,
    matchdayName: 'Matchday 2',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-35',
    homeTeam: 'Japan',
    awayTeam: 'Sweden',
    ...getScrapedBaselineOdds('Japan', 'Sweden'),
    kickoffTime: '00:00',
    date: '2026-06-26',
    matchday: 3,
    matchdayName: 'Matchday 3',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-36',
    homeTeam: 'Tunisia',
    awayTeam: 'Netherlands',
    ...getScrapedBaselineOdds('Tunisia', 'Netherlands'),
    kickoffTime: '00:00',
    date: '2026-06-26',
    matchday: 3,
    matchdayName: 'Matchday 3',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-37',
    homeTeam: 'Belgium',
    awayTeam: 'Egypt',
    ...getScrapedBaselineOdds('Belgium', 'Egypt'),
    kickoffTime: '20:00',
    date: '2026-06-15',
    matchday: 1,
    matchdayName: 'Matchday 1',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-38',
    homeTeam: 'Iran',
    awayTeam: 'New Zealand',
    ...getScrapedBaselineOdds('Iran', 'New Zealand'),
    kickoffTime: '02:00',
    date: '2026-06-16',
    matchday: 1,
    matchdayName: 'Matchday 1',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-39',
    homeTeam: 'Belgium',
    awayTeam: 'Iran',
    ...getScrapedBaselineOdds('Belgium', 'Iran'),
    kickoffTime: '20:00',
    date: '2026-06-21',
    matchday: 2,
    matchdayName: 'Matchday 2',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-40',
    homeTeam: 'New Zealand',
    awayTeam: 'Egypt',
    ...getScrapedBaselineOdds('New Zealand', 'Egypt'),
    kickoffTime: '02:00',
    date: '2026-06-22',
    matchday: 2,
    matchdayName: 'Matchday 2',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-41',
    homeTeam: 'Egypt',
    awayTeam: 'Iran',
    ...getScrapedBaselineOdds('Egypt', 'Iran'),
    kickoffTime: '04:00',
    date: '2026-06-27',
    matchday: 3,
    matchdayName: 'Matchday 3',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-42',
    homeTeam: 'New Zealand',
    awayTeam: 'Belgium',
    ...getScrapedBaselineOdds('New Zealand', 'Belgium'),
    kickoffTime: '04:00',
    date: '2026-06-27',
    matchday: 3,
    matchdayName: 'Matchday 3',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-43',
    homeTeam: 'Spain',
    awayTeam: 'Cape Verde',
    ...getScrapedBaselineOdds('Spain', 'Cape Verde'),
    kickoffTime: '17:00',
    date: '2026-06-15',
    matchday: 1,
    matchdayName: 'Matchday 1',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-44',
    homeTeam: 'Saudi Arabia',
    awayTeam: 'Uruguay',
    ...getScrapedBaselineOdds('Saudi Arabia', 'Uruguay'),
    kickoffTime: '23:00',
    date: '2026-06-15',
    matchday: 1,
    matchdayName: 'Matchday 1',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-45',
    homeTeam: 'Spain',
    awayTeam: 'Saudi Arabia',
    ...getScrapedBaselineOdds('Spain', 'Saudi Arabia'),
    kickoffTime: '17:00',
    date: '2026-06-21',
    matchday: 2,
    matchdayName: 'Matchday 2',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-46',
    homeTeam: 'Uruguay',
    awayTeam: 'Cape Verde',
    ...getScrapedBaselineOdds('Uruguay', 'Cape Verde'),
    kickoffTime: '23:00',
    date: '2026-06-21',
    matchday: 2,
    matchdayName: 'Matchday 2',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-47',
    homeTeam: 'Cape Verde',
    awayTeam: 'Saudi Arabia',
    ...getScrapedBaselineOdds('Cape Verde', 'Saudi Arabia'),
    kickoffTime: '01:00',
    date: '2026-06-27',
    matchday: 3,
    matchdayName: 'Matchday 3',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-48',
    homeTeam: 'Uruguay',
    awayTeam: 'Spain',
    ...getScrapedBaselineOdds('Uruguay', 'Spain'),
    kickoffTime: '01:00',
    date: '2026-06-27',
    matchday: 3,
    matchdayName: 'Matchday 3',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-49',
    homeTeam: 'France',
    awayTeam: 'Senegal',
    ...getScrapedBaselineOdds('France', 'Senegal'),
    kickoffTime: '20:00',
    date: '2026-06-16',
    matchday: 1,
    matchdayName: 'Matchday 1',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-50',
    homeTeam: 'Iraq',
    awayTeam: 'Norway',
    ...getScrapedBaselineOdds('Iraq', 'Norway'),
    kickoffTime: '23:00',
    date: '2026-06-16',
    matchday: 1,
    matchdayName: 'Matchday 1',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-51',
    homeTeam: 'France',
    awayTeam: 'Iraq',
    ...getScrapedBaselineOdds('France', 'Iraq'),
    kickoffTime: '22:00',
    date: '2026-06-22',
    matchday: 2,
    matchdayName: 'Matchday 2',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-52',
    homeTeam: 'Norway',
    awayTeam: 'Senegal',
    ...getScrapedBaselineOdds('Norway', 'Senegal'),
    kickoffTime: '01:00',
    date: '2026-06-23',
    matchday: 2,
    matchdayName: 'Matchday 2',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-53',
    homeTeam: 'Norway',
    awayTeam: 'France',
    ...getScrapedBaselineOdds('Norway', 'France'),
    kickoffTime: '20:00',
    date: '2026-06-26',
    matchday: 3,
    matchdayName: 'Matchday 3',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-54',
    homeTeam: 'Senegal',
    awayTeam: 'Iraq',
    ...getScrapedBaselineOdds('Senegal', 'Iraq'),
    kickoffTime: '20:00',
    date: '2026-06-26',
    matchday: 3,
    matchdayName: 'Matchday 3',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-55',
    homeTeam: 'Argentina',
    awayTeam: 'Algeria',
    ...getScrapedBaselineOdds('Argentina', 'Algeria'),
    kickoffTime: '02:00',
    date: '2026-06-17',
    matchday: 1,
    matchdayName: 'Matchday 1',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-56',
    homeTeam: 'Austria',
    awayTeam: 'Jordan',
    ...getScrapedBaselineOdds('Austria', 'Jordan'),
    kickoffTime: '05:00',
    date: '2026-06-17',
    matchday: 1,
    matchdayName: 'Matchday 1',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-57',
    homeTeam: 'Argentina',
    awayTeam: 'Austria',
    ...getScrapedBaselineOdds('Argentina', 'Austria'),
    kickoffTime: '18:00',
    date: '2026-06-22',
    matchday: 2,
    matchdayName: 'Matchday 2',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-58',
    homeTeam: 'Jordan',
    awayTeam: 'Algeria',
    ...getScrapedBaselineOdds('Jordan', 'Algeria'),
    kickoffTime: '04:00',
    date: '2026-06-23',
    matchday: 2,
    matchdayName: 'Matchday 2',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-59',
    homeTeam: 'Algeria',
    awayTeam: 'Austria',
    ...getScrapedBaselineOdds('Algeria', 'Austria'),
    kickoffTime: '03:00',
    date: '2026-06-28',
    matchday: 3,
    matchdayName: 'Matchday 3',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-60',
    homeTeam: 'Jordan',
    awayTeam: 'Argentina',
    ...getScrapedBaselineOdds('Jordan', 'Argentina'),
    kickoffTime: '03:00',
    date: '2026-06-28',
    matchday: 3,
    matchdayName: 'Matchday 3',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-61',
    homeTeam: 'Portugal',
    awayTeam: 'DR Congo',
    ...getScrapedBaselineOdds('Portugal', 'DR Congo'),
    kickoffTime: '18:00',
    date: '2026-06-17',
    matchday: 1,
    matchdayName: 'Matchday 1',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-62',
    homeTeam: 'Uzbekistan',
    awayTeam: 'Colombia',
    ...getScrapedBaselineOdds('Uzbekistan', 'Colombia'),
    kickoffTime: '03:00',
    date: '2026-06-18',
    matchday: 1,
    matchdayName: 'Matchday 1',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-63',
    homeTeam: 'Portugal',
    awayTeam: 'Uzbekistan',
    ...getScrapedBaselineOdds('Portugal', 'Uzbekistan'),
    kickoffTime: '18:00',
    date: '2026-06-23',
    matchday: 2,
    matchdayName: 'Matchday 2',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-64',
    homeTeam: 'Colombia',
    awayTeam: 'DR Congo',
    ...getScrapedBaselineOdds('Colombia', 'DR Congo'),
    kickoffTime: '03:00',
    date: '2026-06-24',
    matchday: 2,
    matchdayName: 'Matchday 2',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-65',
    homeTeam: 'Colombia',
    awayTeam: 'Portugal',
    ...getScrapedBaselineOdds('Colombia', 'Portugal'),
    kickoffTime: '00:30',
    date: '2026-06-28',
    matchday: 3,
    matchdayName: 'Matchday 3',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-66',
    homeTeam: 'DR Congo',
    awayTeam: 'Uzbekistan',
    ...getScrapedBaselineOdds('DR Congo', 'Uzbekistan'),
    kickoffTime: '00:30',
    date: '2026-06-28',
    matchday: 3,
    matchdayName: 'Matchday 3',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-67',
    homeTeam: 'England',
    awayTeam: 'Croatia',
    ...getScrapedBaselineOdds('England', 'Croatia'),
    kickoffTime: '21:00',
    date: '2026-06-17',
    matchday: 1,
    matchdayName: 'Matchday 1',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-68',
    homeTeam: 'Ghana',
    awayTeam: 'Panama',
    ...getScrapedBaselineOdds('Ghana', 'Panama'),
    kickoffTime: '00:00',
    date: '2026-06-18',
    matchday: 1,
    matchdayName: 'Matchday 1',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-69',
    homeTeam: 'England',
    awayTeam: 'Ghana',
    ...getScrapedBaselineOdds('England', 'Ghana'),
    kickoffTime: '21:00',
    date: '2026-06-23',
    matchday: 2,
    matchdayName: 'Matchday 2',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-70',
    homeTeam: 'Panama',
    awayTeam: 'Croatia',
    ...getScrapedBaselineOdds('Panama', 'Croatia'),
    kickoffTime: '00:00',
    date: '2026-06-24',
    matchday: 2,
    matchdayName: 'Matchday 2',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-71',
    homeTeam: 'Panama',
    awayTeam: 'England',
    ...getScrapedBaselineOdds('Panama', 'England'),
    kickoffTime: '22:00',
    date: '2026-06-27',
    matchday: 3,
    matchdayName: 'Matchday 3',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-72',
    homeTeam: 'Croatia',
    awayTeam: 'Ghana',
    ...getScrapedBaselineOdds('Croatia', 'Ghana'),
    kickoffTime: '22:00',
    date: '2026-06-27',
    matchday: 3,
    matchdayName: 'Matchday 3',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-73',
    homeTeam: '2A',
    awayTeam: '2B',
    homeOdds: 1.90,
    drawOdds: 3.30,
    awayOdds: 3.80,
    kickoffTime: '20:00',
    date: '2026-06-28',
    matchday: 4,
    matchdayName: 'Round of 32',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-74',
    homeTeam: '1E',
    awayTeam: '3A/B/C/D/F',
    homeOdds: 1.90,
    drawOdds: 3.30,
    awayOdds: 3.80,
    kickoffTime: '21:30',
    date: '2026-06-29',
    matchday: 4,
    matchdayName: 'Round of 32',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-75',
    homeTeam: '1F',
    awayTeam: '2C',
    homeOdds: 1.90,
    drawOdds: 3.30,
    awayOdds: 3.80,
    kickoffTime: '02:00',
    date: '2026-06-30',
    matchday: 4,
    matchdayName: 'Round of 32',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-76',
    homeTeam: '1C',
    awayTeam: '2F',
    homeOdds: 1.90,
    drawOdds: 3.30,
    awayOdds: 3.80,
    kickoffTime: '18:00',
    date: '2026-06-29',
    matchday: 4,
    matchdayName: 'Round of 32',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-77',
    homeTeam: '1I',
    awayTeam: '3C/D/F/G/H',
    homeOdds: 1.90,
    drawOdds: 3.30,
    awayOdds: 3.80,
    kickoffTime: '22:00',
    date: '2026-06-30',
    matchday: 4,
    matchdayName: 'Round of 32',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-78',
    homeTeam: '2E',
    awayTeam: '2I',
    homeOdds: 1.90,
    drawOdds: 3.30,
    awayOdds: 3.80,
    kickoffTime: '18:00',
    date: '2026-06-30',
    matchday: 4,
    matchdayName: 'Round of 32',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-79',
    homeTeam: '1A',
    awayTeam: '3C/E/F/H/I',
    homeOdds: 1.90,
    drawOdds: 3.30,
    awayOdds: 3.80,
    kickoffTime: '02:00',
    date: '2026-07-01',
    matchday: 4,
    matchdayName: 'Round of 32',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-80',
    homeTeam: '1L',
    awayTeam: '3E/H/I/J/K',
    homeOdds: 1.90,
    drawOdds: 3.30,
    awayOdds: 3.80,
    kickoffTime: '17:00',
    date: '2026-07-01',
    matchday: 4,
    matchdayName: 'Round of 32',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-81',
    homeTeam: '1D',
    awayTeam: '3B/E/F/I/J',
    homeOdds: 1.90,
    drawOdds: 3.30,
    awayOdds: 3.80,
    kickoffTime: '01:00',
    date: '2026-07-02',
    matchday: 4,
    matchdayName: 'Round of 32',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-82',
    homeTeam: '1G',
    awayTeam: '3A/E/H/I/J',
    homeOdds: 1.90,
    drawOdds: 3.30,
    awayOdds: 3.80,
    kickoffTime: '21:00',
    date: '2026-07-01',
    matchday: 4,
    matchdayName: 'Round of 32',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-83',
    homeTeam: '2K',
    awayTeam: '2L',
    homeOdds: 1.90,
    drawOdds: 3.30,
    awayOdds: 3.80,
    kickoffTime: '00:00',
    date: '2026-07-03',
    matchday: 4,
    matchdayName: 'Round of 32',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-84',
    homeTeam: '1H',
    awayTeam: '2J',
    homeOdds: 1.90,
    drawOdds: 3.30,
    awayOdds: 3.80,
    kickoffTime: '20:00',
    date: '2026-07-02',
    matchday: 4,
    matchdayName: 'Round of 32',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-85',
    homeTeam: '1B',
    awayTeam: '3E/F/G/I/J',
    homeOdds: 1.90,
    drawOdds: 3.30,
    awayOdds: 3.80,
    kickoffTime: '04:00',
    date: '2026-07-03',
    matchday: 4,
    matchdayName: 'Round of 32',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-86',
    homeTeam: '1J',
    awayTeam: '2H',
    homeOdds: 1.90,
    drawOdds: 3.30,
    awayOdds: 3.80,
    kickoffTime: '23:00',
    date: '2026-07-03',
    matchday: 4,
    matchdayName: 'Round of 32',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-87',
    homeTeam: '1K',
    awayTeam: '3D/E/I/J/L',
    homeOdds: 1.90,
    drawOdds: 3.30,
    awayOdds: 3.80,
    kickoffTime: '02:30',
    date: '2026-07-04',
    matchday: 4,
    matchdayName: 'Round of 32',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-88',
    homeTeam: '2D',
    awayTeam: '2G',
    homeOdds: 1.90,
    drawOdds: 3.30,
    awayOdds: 3.80,
    kickoffTime: '19:00',
    date: '2026-07-03',
    matchday: 4,
    matchdayName: 'Round of 32',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-89',
    homeTeam: 'W74',
    awayTeam: 'W77',
    homeOdds: 1.90,
    drawOdds: 3.30,
    awayOdds: 3.80,
    kickoffTime: '22:00',
    date: '2026-07-04',
    matchday: 5,
    matchdayName: 'Round of 16',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-90',
    homeTeam: 'W73',
    awayTeam: 'W75',
    homeOdds: 1.90,
    drawOdds: 3.30,
    awayOdds: 3.80,
    kickoffTime: '18:00',
    date: '2026-07-04',
    matchday: 5,
    matchdayName: 'Round of 16',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-91',
    homeTeam: 'W76',
    awayTeam: 'W78',
    homeOdds: 1.90,
    drawOdds: 3.30,
    awayOdds: 3.80,
    kickoffTime: '21:00',
    date: '2026-07-05',
    matchday: 5,
    matchdayName: 'Round of 16',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-92',
    homeTeam: 'W79',
    awayTeam: 'W80',
    homeOdds: 1.90,
    drawOdds: 3.30,
    awayOdds: 3.80,
    kickoffTime: '01:00',
    date: '2026-07-06',
    matchday: 5,
    matchdayName: 'Round of 16',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-93',
    homeTeam: 'W83',
    awayTeam: 'W84',
    homeOdds: 1.90,
    drawOdds: 3.30,
    awayOdds: 3.80,
    kickoffTime: '20:00',
    date: '2026-07-06',
    matchday: 5,
    matchdayName: 'Round of 16',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-94',
    homeTeam: 'W81',
    awayTeam: 'W82',
    homeOdds: 1.90,
    drawOdds: 3.30,
    awayOdds: 3.80,
    kickoffTime: '01:00',
    date: '2026-07-07',
    matchday: 5,
    matchdayName: 'Round of 16',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-95',
    homeTeam: 'W86',
    awayTeam: 'W88',
    homeOdds: 1.90,
    drawOdds: 3.30,
    awayOdds: 3.80,
    kickoffTime: '17:00',
    date: '2026-07-07',
    matchday: 5,
    matchdayName: 'Round of 16',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-96',
    homeTeam: 'W85',
    awayTeam: 'W87',
    homeOdds: 1.90,
    drawOdds: 3.30,
    awayOdds: 3.80,
    kickoffTime: '21:00',
    date: '2026-07-07',
    matchday: 5,
    matchdayName: 'Round of 16',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-97',
    homeTeam: 'W89',
    awayTeam: 'W90',
    homeOdds: 1.90,
    drawOdds: 3.30,
    awayOdds: 3.80,
    kickoffTime: '21:00',
    date: '2026-07-09',
    matchday: 6,
    matchdayName: 'Quarterfinals',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-98',
    homeTeam: 'W93',
    awayTeam: 'W94',
    homeOdds: 1.90,
    drawOdds: 3.30,
    awayOdds: 3.80,
    kickoffTime: '20:00',
    date: '2026-07-10',
    matchday: 6,
    matchdayName: 'Quarterfinals',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-99',
    homeTeam: 'W91',
    awayTeam: 'W92',
    homeOdds: 1.90,
    drawOdds: 3.30,
    awayOdds: 3.80,
    kickoffTime: '22:00',
    date: '2026-07-11',
    matchday: 6,
    matchdayName: 'Quarterfinals',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-100',
    homeTeam: 'W95',
    awayTeam: 'W96',
    homeOdds: 1.90,
    drawOdds: 3.30,
    awayOdds: 3.80,
    kickoffTime: '02:00',
    date: '2026-07-12',
    matchday: 6,
    matchdayName: 'Quarterfinals',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-101',
    homeTeam: 'W97',
    awayTeam: 'W98',
    homeOdds: 1.90,
    drawOdds: 3.30,
    awayOdds: 3.80,
    kickoffTime: '20:00',
    date: '2026-07-14',
    matchday: 7,
    matchdayName: 'Semifinals',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-102',
    homeTeam: 'W99',
    awayTeam: 'W100',
    homeOdds: 1.90,
    drawOdds: 3.30,
    awayOdds: 3.80,
    kickoffTime: '20:00',
    date: '2026-07-15',
    matchday: 7,
    matchdayName: 'Semifinals',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-103',
    homeTeam: 'L101',
    awayTeam: 'L102',
    homeOdds: 1.90,
    drawOdds: 3.30,
    awayOdds: 3.80,
    kickoffTime: '22:00',
    date: '2026-07-18',
    matchday: 8,
    matchdayName: 'Third Place Playoff',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  matches.push({
    id: 'm-104',
    homeTeam: 'W101',
    awayTeam: 'W102',
    homeOdds: 1.90,
    drawOdds: 3.30,
    awayOdds: 3.80,
    kickoffTime: '20:00',
    date: '2026-07-19',
    matchday: 8,
    matchdayName: 'World Cup Final',
    status: 'scheduled',
    result: null,
    homeScore: null,
    awayScore: null
  });

  return matches;
}