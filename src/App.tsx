import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Trophy, Users, Calendar, Shield, Zap, Sparkles,
  Plus, Lock, Unlock, Clock, ArrowRight, Share2,
  Trash2, RefreshCw, Play, Info, CheckCircle, AlertCircle, X,
  Monitor, Smartphone, Menu, HelpCircle
} from 'lucide-react';
import type {
  User, Group, Match, SingleBet, DoubleChanceBet, ComboBet, YesterdayRecap, GroupMember, ChatMessage
} from './types';
import { getInitialMatches, GROUPS_TEAMS, getScrapedBaselineOdds } from './matchData';
import { fetchLiveOddsFromAPI, scrapeDailyOddsFeed } from './oddsService';
import {
  getMatchdayMultiplier, resolveSingleBet, resolveDoubleChanceBet,
  resolveComboBet, resolveMatchdayMVP,
  calculateGroupStandings, rankThirdPlaceTeams, progressKnockoutRounds,
  isPlaceholder, getActiveSessionBounds
} from './gameEngine';
import { 
  getFirebaseInstance, 
  signInWithGooglePopup, 
  signUpWithEmail, 
  logInWithEmail, 
  logOutUser 
} from './firebase';
import { doc, setDoc, getDoc, collection, onSnapshot, updateDoc, deleteDoc } from 'firebase/firestore';

// Seed initial users
const DEFAULT_USERS: User[] = [
  { id: 'user-1', username: 'Me (Player)', email: 'user@example.com', avatarUrl: 'M' },
  { id: 'user-2', username: 'Messi10', email: 'messi@example.com', avatarUrl: 'LM' },
  { id: 'user-3', username: 'Pulisic_USA', email: 'pulisic@example.com', avatarUrl: 'CP' },
  { id: 'user-4', username: 'CR7_Fan', email: 'cr7@example.com', avatarUrl: 'CR' },
  { id: 'user-5', username: 'Chicharito', email: 'chicha@example.com', avatarUrl: 'CH' }
];

export function getTeamFlagUrl(teamName: string): string | null {
  const codes: { [team: string]: string } = {
    Argentina: 'ar', France: 'fr', Brazil: 'br', Spain: 'es', England: 'gb-eng',
    Portugal: 'pt', Germany: 'de', Netherlands: 'nl', Belgium: 'be', Italy: 'it',
    Croatia: 'hr', Uruguay: 'uy', USA: 'us', 'United States': 'us', Mexico: 'mx', Morocco: 'ma',
    Senegal: 'sn', Japan: 'jp', 'South Korea': 'kr', Canada: 'ca', Colombia: 'co',
    Ecuador: 'ec', Switzerland: 'ch', Denmark: 'dk', Sweden: 'se', Poland: 'pl',
    Nigeria: 'ng', Cameroon: 'cm', Egypt: 'eg', 'Saudi Arabia': 'sa', Australia: 'au',
    Iran: 'ir', 'South Africa': 'za', 'New Zealand': 'nz', 'Costa Rica': 'cr',
    Panama: 'pa', Jamaica: 'jm', Tunisia: 'tn', Algeria: 'dz', Austria: 'at',
    Turkey: 'tr', Türkiye: 'tr', Chile: 'cl', Peru: 'pe', Wales: 'gb-wls', Ukraine: 'ua',
    Scotland: 'gb-sct', Ghana: 'gh', 'Ivory Coast': 'ci', Qatar: 'qa',
    'Czech Republic': 'cz', 'Bosnia and Herzegovina': 'ba', Haiti: 'ht', Paraguay: 'py',
    'Curaçao': 'cw', Curacao: 'cw', 'Cape Verde': 'cv', Iraq: 'iq', Norway: 'no',
    Jordan: 'jo', 'DR Congo': 'cd', Uzbekistan: 'uz'
  };
  const code = codes[teamName.trim()];
  if (!code) return null;
  return `https://flagcdn.com/w40/${code}.png`;
}

export function TeamFlag({ teamName, size = 20 }: { teamName: string; size?: number }) {
  const url = getTeamFlagUrl(teamName);
  if (!url) {
    return (
      <span style={{ 
        display: 'inline-flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        width: `${size}px`, 
        height: `${Math.round(size * 0.7)}px`, 
        fontSize: `${size - 6}px`,
        verticalAlign: 'middle'
      }}>
        🏳️
      </span>
    );
  }
  
  const height = Math.round(size * 0.7);
  
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: `${size}px`,
        height: `${height}px`,
        verticalAlign: 'middle',
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.03)',
        borderRadius: '2px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
      }}
    >
      <img
        src={url}
        alt={`${teamName} flag`}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          width: 'auto',
          height: 'auto',
          objectFit: 'contain'
        }}
      />
    </span>
  );
}

export function isTeamEliminated(teamName: string, currentMatches: Match[]): boolean {
  if (!teamName) return false;
  
  // 1. Group Stage lock/status check
  const groupMatches = currentMatches.filter(m => m.matchday <= 3);
  const allGroupFinished = groupMatches.every(m => m.status === 'finished');
  
  if (!allGroupFinished) {
    return false; // Group stage still going, no teams are eliminated.
  }
  
  // 2. Check if team is in the Round of 32 matches
  const r32Matches = currentMatches.filter(m => m.matchday === 4);
  const madeR32 = r32Matches.some(m => m.homeTeam === teamName || m.awayTeam === teamName);
  if (!madeR32) {
    return true; // Failed to qualify from groups
  }
  
  // 3. Check knockout match losses
  const knockoutMatches = currentMatches.filter(m => m.matchday >= 4);
  for (const m of knockoutMatches) {
    if (m.status === 'finished' && !m.matchdayName.includes('Third')) {
      if (m.homeTeam === teamName || m.awayTeam === teamName) {
        if (m.winner && m.winner !== teamName) {
          return true; // Lost in knockouts
        }
      }
    }
  }
  
  return false;
}

const SPONSORS = [
  {
    name: 'Qatar Airways',
    tagline: 'The Official Airline of FIFA World Cup 2026™',
    description: 'Fly to over 150 destinations worldwide with the World\'s Best Airline.',
    promo: 'Get 10% off flights using code FW2026',
    logoText: 'QATAR AIRWAYS',
    gradient: 'linear-gradient(135deg, rgba(92, 17, 49, 0.2) 0%, rgba(30, 5, 15, 0.35) 100%)',
    borderColor: 'rgba(92, 17, 49, 0.3)',
    color: '#FFD700',
    link: 'https://www.qatarairways.com'
  },
  {
    name: 'Coca-Cola',
    tagline: 'Real Magic™ - Official Partner',
    description: 'Share a Coke and celebrate the beautiful game together.',
    promo: 'Scan the cap to win match tickets!',
    logoText: 'COCA-COLA',
    gradient: 'linear-gradient(135deg, rgba(244, 0, 9, 0.12) 0%, rgba(50, 0, 2, 0.35) 100%)',
    borderColor: 'rgba(244, 0, 9, 0.25)',
    color: '#ffffff',
    link: 'https://www.coca-cola.com'
  },
  {
    name: 'adidas',
    tagline: 'You Got This. Official Match Ball Supplier.',
    description: 'Experience precision with the official tournament match ball.',
    promo: 'Shop the World Cup collection today.',
    logoText: 'ADIDAS',
    gradient: 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(0, 0, 0, 0.4) 100%)',
    borderColor: 'rgba(255, 255, 255, 0.15)',
    color: '#00c752',
    link: 'https://www.adidas.com'
  },
  {
    name: 'Visa',
    tagline: 'Official Payment Technology Partner',
    description: 'Fast, secure payments everywhere. Wherever you want to be.',
    promo: 'Pay with Visa for exclusive venue perks.',
    logoText: 'VISA',
    gradient: 'linear-gradient(135deg, rgba(26, 76, 175, 0.15) 0%, rgba(10, 30, 80, 0.35) 100%)',
    borderColor: 'rgba(26, 76, 175, 0.25)',
    color: '#FFD700',
    link: 'https://www.visa.com'
  }
];

const TRENDING_GIFS = [
  { url: 'https://media.tenor.com/J7b5-x8w9x8AAAAM/world-cup-trophy.gif', title: 'World Cup Trophy' },
  { url: 'https://media.tenor.com/a4gQ4j1wPqgAAAAM/messi-world-cup.gif', title: 'Messi Celebration' },
  { url: 'https://media.tenor.com/T0bTqR_KPlgAAAAM/ronaldo-siuuu.gif', title: 'Ronaldo SIUUU' },
  { url: 'https://media.tenor.com/V71vW1XqG-cAAAAM/mbappe-france.gif', title: 'Mbappe Goal' },
  { url: 'https://media.tenor.com/5HspN-3iXbMAAAAM/neymar-dance.gif', title: 'Neymar Dance' },
  { url: 'https://media.tenor.com/G55qLh11yLAAAAAM/england-goal-soccer.gif', title: 'England Goal' },
  { url: 'https://media.tenor.com/4S06cR9fL54AAAAM/world-cup-opening-ceremony.gif', title: 'Opening Ceremony' },
  { url: 'https://media.tenor.com/4rYyT7Xb_CgAAAAM/referee-var.gif', title: 'VAR Review' }
];

interface AppTheme {
  id: string;
  name: string;
  isLight?: boolean;
  variables: Record<string, string>;
}

const THEMES: AppTheme[] = [
  {
    id: 'default-dark',
    name: 'Default Dark 🌌',
    variables: {
      '--bg-main': '#010101',
      '--bg-sidebar': '#09090b',
      '--bg-card': 'rgba(20, 20, 26, 0.7)',
      '--bg-card-hover': 'rgba(32, 32, 42, 0.85)',
      '--bg-slip': '#0c0c0f',
      '--border-color': 'rgba(255, 255, 255, 0.08)',
      '--border-hover': 'rgba(49, 80, 255, 0.35)',
      '--color-text-primary': '#ffffff',
      '--color-text-secondary': '#a1a1aa',
      '--color-text-muted': '#71717a',
      '--color-primary': '#3150ff',
      '--color-primary-rgb': '49, 80, 255',
      '--color-primary-hover': '#546eff',
      '--color-secondary': '#00c752',
      '--color-danger': '#d70000',
      '--color-warning': '#ff9e81',
      '--color-info': '#2196f3',
      '--color-purple': '#6101eb',
      '--color-yellow': '#ecff43'
    }
  },
  {
    id: 'light-theme',
    name: 'Light Mode ☀️',
    isLight: true,
    variables: {
      '--bg-main': '#f4f4f5',
      '--bg-sidebar': '#e4e4e7',
      '--bg-card': 'rgba(255, 255, 255, 0.8)',
      '--bg-card-hover': 'rgba(255, 255, 255, 0.95)',
      '--bg-slip': '#f4f4f5',
      '--border-color': 'rgba(9, 9, 11, 0.1)',
      '--border-hover': 'rgba(49, 80, 255, 0.5)',
      '--color-text-primary': '#09090b',
      '--color-text-secondary': '#71717a',
      '--color-text-muted': '#a1a1aa',
      '--color-primary': '#3150ff',
      '--color-primary-rgb': '49, 80, 255',
      '--color-primary-hover': '#1e3bb3',
      '--color-secondary': '#008736',
      '--color-danger': '#d70000',
      '--color-warning': '#ff6347',
      '--color-info': '#2196f3',
      '--color-purple': '#6101eb',
      '--color-yellow': '#d1db0a',
      '--color-status-won': '#008736',
      '--color-status-lost': '#d70000'
    }
  },
  {
    id: 'portugal',
    name: 'Portugal 🇵🇹',
    variables: {
      '--bg-main': '#0c0707',
      '--bg-sidebar': '#140c0c',
      '--bg-card': 'rgba(30, 15, 15, 0.65)',
      '--bg-card-hover': 'rgba(45, 22, 22, 0.8)',
      '--border-color': 'rgba(228, 37, 27, 0.15)',
      '--border-hover': 'rgba(0, 102, 47, 0.5)',
      '--color-primary': '#E4251B',
      '--color-primary-rgb': '228, 37, 27',
      '--color-primary-hover': '#ff4c42',
      '--color-secondary': '#00662F'
    }
  },
  {
    id: 'spain',
    name: 'Spain 🇪🇸',
    variables: {
      '--bg-main': '#0d0b04',
      '--bg-sidebar': '#171306',
      '--bg-card': 'rgba(30, 25, 10, 0.65)',
      '--bg-card-hover': 'rgba(45, 38, 15, 0.8)',
      '--border-color': 'rgba(241, 191, 0, 0.15)',
      '--border-hover': 'rgba(198, 11, 30, 0.5)',
      '--color-primary': '#C60B1E',
      '--color-primary-rgb': '198, 11, 30',
      '--color-primary-hover': '#e32437',
      '--color-secondary': '#F1BF00'
    }
  },
  {
    id: 'france',
    name: 'France 🇫🇷',
    variables: {
      '--bg-main': '#03050f',
      '--bg-sidebar': '#070b1f',
      '--bg-card': 'rgba(15, 22, 50, 0.65)',
      '--bg-card-hover': 'rgba(25, 35, 75, 0.8)',
      '--border-color': 'rgba(0, 35, 149, 0.25)',
      '--border-hover': 'rgba(237, 41, 57, 0.5)',
      '--color-primary': '#002395',
      '--color-primary-rgb': '0, 35, 149',
      '--color-primary-hover': '#1e48cf',
      '--color-secondary': '#ED2939'
    }
  },
  {
    id: 'england',
    name: 'England 🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    variables: {
      '--bg-main': '#0a0d14',
      '--bg-sidebar': '#101420',
      '--bg-card': 'rgba(20, 25, 40, 0.65)',
      '--bg-card-hover': 'rgba(30, 38, 60, 0.8)',
      '--border-color': 'rgba(230, 0, 0, 0.15)',
      '--border-hover': 'rgba(255, 255, 255, 0.3)',
      '--color-primary': '#D70000',
      '--color-primary-rgb': '215, 0, 0',
      '--color-primary-hover': '#ff3333',
      '--color-secondary': '#0A192F'
    }
  },
  {
    id: 'brazil',
    name: 'Brazil 🇧🇷',
    variables: {
      '--bg-main': '#030c04',
      '--bg-sidebar': '#061708',
      '--bg-card': 'rgba(10, 30, 15, 0.65)',
      '--bg-card-hover': 'rgba(15, 45, 22, 0.8)',
      '--border-color': 'rgba(0, 155, 58, 0.25)',
      '--border-hover': 'rgba(255, 223, 0, 0.5)',
      '--color-primary': '#FFDF00',
      '--color-primary-rgb': '255, 223, 0',
      '--color-primary-hover': '#ffee55',
      '--color-secondary': '#009B3A'
    }
  },
  {
    id: 'argentina',
    name: 'Argentina 🇦🇷',
    variables: {
      '--bg-main': '#060d14',
      '--bg-sidebar': '#0b1622',
      '--bg-card': 'rgba(15, 30, 45, 0.65)',
      '--bg-card-hover': 'rgba(22, 45, 65, 0.8)',
      '--border-color': 'rgba(117, 170, 219, 0.25)',
      '--border-hover': 'rgba(252, 191, 73, 0.5)',
      '--color-primary': '#75AADB',
      '--color-primary-rgb': '117, 170, 219',
      '--color-primary-hover': '#9fc2e6',
      '--color-secondary': '#FCBF49'
    }
  },
  {
    id: 'germany',
    name: 'Germany 🇩🇪',
    variables: {
      '--bg-main': '#0a0a0a',
      '--bg-sidebar': '#141414',
      '--bg-card': 'rgba(25, 25, 25, 0.7)',
      '--bg-card-hover': 'rgba(35, 35, 35, 0.85)',
      '--border-color': 'rgba(255, 204, 0, 0.15)',
      '--border-hover': 'rgba(227, 6, 19, 0.5)',
      '--color-primary': '#FFCC00',
      '--color-primary-rgb': '255, 204, 0',
      '--color-primary-hover': '#ffe055',
      '--color-secondary': '#E30613'
    }
  },
  {
    id: 'belgium',
    name: 'Belgium 🇧🇪',
    variables: {
      '--bg-main': '#0c0203',
      '--bg-sidebar': '#170406',
      '--bg-card': 'rgba(30, 10, 12, 0.65)',
      '--bg-card-hover': 'rgba(45, 15, 18, 0.8)',
      '--border-color': 'rgba(227, 6, 19, 0.25)',
      '--border-hover': 'rgba(255, 217, 0, 0.5)',
      '--color-primary': '#E30613',
      '--color-primary-rgb': '227, 6, 19',
      '--color-primary-hover': '#ff3344',
      '--color-secondary': '#FFD900'
    }
  },
  {
    id: 'netherlands',
    name: 'Netherlands 🇳🇱',
    variables: {
      '--bg-main': '#0c0703',
      '--bg-sidebar': '#170c06',
      '--bg-card': 'rgba(35, 18, 10, 0.65)',
      '--bg-card-hover': 'rgba(50, 26, 15, 0.8)',
      '--border-color': 'rgba(241, 90, 36, 0.25)',
      '--border-hover': 'rgba(33, 64, 154, 0.5)',
      '--color-primary': '#F15A24',
      '--color-primary-rgb': '241, 90, 36',
      '--color-primary-hover': '#ff7947',
      '--color-secondary': '#21409A'
    }
  },
  {
    id: 'usa',
    name: 'United States 🇺🇸',
    variables: {
      '--bg-main': '#030712',
      '--bg-sidebar': '#060e22',
      '--bg-card': 'rgba(10, 20, 45, 0.65)',
      '--bg-card-hover': 'rgba(15, 30, 65, 0.8)',
      '--border-color': 'rgba(10, 49, 97, 0.3)',
      '--border-hover': 'rgba(179, 25, 66, 0.5)',
      '--color-primary': '#0A3161',
      '--color-primary-rgb': '10, 49, 97',
      '--color-primary-hover': '#144c91',
      '--color-secondary': '#B31942'
    }
  },
  {
    id: 'canada',
    name: 'Canada 🇨🇦',
    variables: {
      '--bg-main': '#0f0505',
      '--bg-sidebar': '#1c0a0a',
      '--bg-card': 'rgba(40, 15, 15, 0.65)',
      '--bg-card-hover': 'rgba(60, 22, 22, 0.8)',
      '--border-color': 'rgba(255, 0, 0, 0.25)',
      '--border-hover': 'rgba(138, 0, 0, 0.5)',
      '--color-primary': '#FF0000',
      '--color-primary-rgb': '255, 0, 0',
      '--color-primary-hover': '#ff3333',
      '--color-secondary': '#8A0000'
    }
  },
  {
    id: 'mexico',
    name: 'Mexico 🇲🇽',
    variables: {
      '--bg-main': '#020b06',
      '--bg-sidebar': '#04160c',
      '--bg-card': 'rgba(10, 30, 20, 0.65)',
      '--bg-card-hover': 'rgba(15, 45, 30, 0.8)',
      '--border-color': 'rgba(0, 104, 71, 0.25)',
      '--border-hover': 'rgba(206, 17, 38, 0.5)',
      '--color-primary': '#006847',
      '--color-primary-rgb': '0, 104, 71',
      '--color-primary-hover': '#009062',
      '--color-secondary': '#CE1126'
    }
  }
];

export default function App() {
  // --- Custom Notification Toast State ---
  const [notifications, setNotifications] = useState<{ id: string; message: string; type: 'success' | 'error' | 'info' | 'warning' }[]>([]);

  // --- Banner Ad State & Rotation ---
  const [showBannerAd, setShowBannerAd] = useState(true);
  const [currentSponsorIndex, setCurrentSponsorIndex] = useState(0);

  useEffect(() => {
    if (!showBannerAd) return;
    const interval = setInterval(() => {
      setCurrentSponsorIndex(prev => (prev + 1) % SPONSORS.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [showBannerAd]);

  // --- Responsive Layout Modes ---
  const [layoutMode, setLayoutMode] = useState<'desktop' | 'mobile'>('desktop');
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showMobileSlip, setShowMobileSlip] = useState(false);


  const showNotification = useCallback((message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 4000);
  }, []);

  const alert = useCallback((message: string) => {
    let type: 'success' | 'error' | 'info' | 'warning' = 'info';
    const lowercaseMsg = message.toLowerCase();
    if (lowercaseMsg.includes('success') || lowercaseMsg.includes('joined') || lowercaseMsg.includes('confirmed')) {
      type = 'success';
    } else if (
      lowercaseMsg.includes('insufficient') || 
      lowercaseMsg.includes('limit') || 
      lowercaseMsg.includes('locked') ||
      lowercaseMsg.includes('out of') ||
      lowercaseMsg.includes('failed') ||
      lowercaseMsg.includes('error') ||
      lowercaseMsg.includes('cannot')
    ) {
      type = 'error';
    } else if (
      lowercaseMsg.includes('select') || 
      lowercaseMsg.includes('valid') ||
      lowercaseMsg.includes('please')
    ) {
      type = 'warning';
    }

    showNotification(message, type);
  }, [showNotification]);

  // --- Reward Ads Simulator Overlay State ---
  const [adActive, setAdActive] = useState<boolean>(false);
  const [adDuration, setAdDuration] = useState<number>(30); // 30 or 60
  const [adCountdown, setAdCountdown] = useState<number>(0);
  const [adDescription, setAdDescription] = useState<string>('');
  const [onAdComplete, setOnAdComplete] = useState<(() => void) | null>(null);

  useEffect(() => {
    let timer: any = null;
    if (adActive && adCountdown > 0) {
      timer = setInterval(() => {
        setAdCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            // Wait 500ms and trigger completion to feel smooth
            setTimeout(() => {
              if (onAdComplete) {
                onAdComplete();
              }
              setAdActive(false);
              setOnAdComplete(null);
            }, 500);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [adActive, adCountdown, onAdComplete]);

  const runSponsoredAd = (duration: number, description: string, onCompleteAction: () => void) => {
    setAdDuration(duration);
    setAdCountdown(duration);
    setAdDescription(description);
    setOnAdComplete(() => onCompleteAction);
    setAdActive(true);
  };

  const startDailyAd = () => {
    if (!activeMemberInfo || !activeGroup) return;
    const watched = activeMemberInfo.dailyAdsWatched || 0;
    if (watched >= 2) {
      alert("You have already watched the maximum of 2 reward ads today.");
      return;
    }
    const reward = Math.round(activeGroup.startingBudget * 0.05);
    
    runSponsoredAd(
      30,
      `Earn ${reward} Credits (Sponsored Video Ad)`,
      async () => {
        const updatedGroup = {
          ...activeGroup,
          members: {
            ...activeGroup.members,
            [currentUser.id]: {
              ...activeMemberInfo,
              balance: activeMemberInfo.balance + reward,
              dailyAdsWatched: watched + 1
            }
          }
        };
        await dbWriteGroup(updatedGroup);
        alert(`Ad completed! You earned ${reward} credits!`);
      }
    );
  };

  const watchExtraBoostAd = (boostType: 'noLoss' | 'doubleChance' | 'doublePoints') => {
    if (!activeMemberInfo || !activeGroup) return;
    
    const alreadyEarned = 
      boostType === 'noLoss' ? activeMemberInfo.extraNoLossEarned :
      boostType === 'doubleChance' ? activeMemberInfo.extraDoubleChanceEarned :
      activeMemberInfo.extraDoublePointsEarned;
      
    if (alreadyEarned) {
      alert("You have already earned your extra charge for this boost.");
      return;
    }

    runSponsoredAd(
      60,
      `Watching Sponsored Video (1 Min) to earn +1 Extra charge of ${boostType === 'doublePoints' ? 'Double Returns' : boostType === 'noLoss' ? 'No Loss' : 'Double Chance'} boost!`,
      async () => {
        const updatedGroup = {
          ...activeGroup,
          members: {
            ...activeGroup.members,
            [currentUser.id]: {
              ...activeMemberInfo,
              extraNoLossEarned: boostType === 'noLoss' ? true : (activeMemberInfo.extraNoLossEarned || false),
              extraDoubleChanceEarned: boostType === 'doubleChance' ? true : (activeMemberInfo.extraDoubleChanceEarned || false),
              extraDoublePointsEarned: boostType === 'doublePoints' ? true : (activeMemberInfo.extraDoublePointsEarned || false)
            }
          }
        };
        await dbWriteGroup(updatedGroup);
        alert(`Ad completed! You received +1 extra charge for ${boostType === 'doublePoints' ? 'Double Returns' : boostType === 'noLoss' ? 'No Loss' : 'Double Chance'}!`);
      }
    );
  };

  // --- Firebase State & Online Database Sync ---
  const [firebaseConfig, setFirebaseConfig] = useState<string>(() => {
    return localStorage.getItem('wc_firebase_config') || '';
  });

  const fbInstance = useMemo(() => {
    return getFirebaseInstance(firebaseConfig);
  }, [firebaseConfig]);

  const [isOnlineLoggedIn, setIsOnlineLoggedIn] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');

  // Firestore/Offline state-saving helper wrappers
  const dbWriteBet = async (bet: any, type: 'single' | 'doubleChance' | 'combo') => {
    if (fbInstance) {
      if (!fbInstance.auth.currentUser) {
        alert("Authentication Error: You must be logged in to place a bet.");
        return;
      }
      await setDoc(doc(fbInstance.db, 'bets', bet.id), { ...bet, type });
    } else {
      if (type === 'single') {
        setSingleBets(prev => [...prev, bet]);
      } else if (type === 'doubleChance') {
        setDoubleChanceBets(prev => [...prev, bet]);
      } else {
        setComboBets(prev => [...prev, bet]);
      }
    }
  };

  const dbWriteGroup = async (group: Group) => {
    if (fbInstance) {
      if (!fbInstance.auth.currentUser) {
        alert("Authentication Error: You must be logged in to edit group settings.");
        return;
      }
      const currentUid = fbInstance.auth.currentUser.uid;
      // Security Check: Only allow league admin to modify settings, unless it's only updating the current user's member slot.
      const existingGroup = groups.find(g => g.id === group.id);
      const isOnlyUpdatingOwnMember = 
        existingGroup &&
        group.id === existingGroup.id &&
        group.adminId === existingGroup.adminId &&
        group.name === existingGroup.name &&
        group.startingBudget === existingGroup.startingBudget &&
        group.allowCombos === existingGroup.allowCombos &&
        group.allowOverdraft === existingGroup.allowOverdraft &&
        group.seasonStarted === existingGroup.seasonStarted &&
        Object.keys(group.members).length === Object.keys(existingGroup.members).length &&
        Object.keys(group.members).every(uid => {
          if (uid === currentUid) return true;
          return JSON.stringify(group.members[uid]) === JSON.stringify(existingGroup.members[uid]);
        });

      if (!isOnlyUpdatingOwnMember && group.adminId !== currentUid) {
        alert("Security Error: Only the group administrator can modify these league settings.");
        return;
      }
      await setDoc(doc(fbInstance.db, 'groups', group.id), group);
    } else {
      setGroups(prev => {
        const idx = prev.findIndex(g => g.id === group.id);
        if (idx !== -1) {
          const updated = [...prev];
          updated[idx] = group;
          return updated;
        }
        return [...prev, group];
      });
    }
  };

  const dbWriteMatches = async (updatedMatches: Match[]) => {
    if (fbInstance) {
      if (!fbInstance.auth.currentUser) {
        alert("Authentication Error: You must be logged in to modify matches.");
        return;
      }
      for (const m of updatedMatches) {
        await setDoc(doc(fbInstance.db, 'matches', m.id), m);
      }
    } else {
      setMatches(updatedMatches);
    }
  };

  const dbResolveDailySession = async (
    rMatches: Match[],
    rSingles: SingleBet[],
    rDCs: DoubleChanceBet[],
    rCombos: ComboBet[],
    rGroup: Group,
    rRecap?: YesterdayRecap
  ) => {
    if (fbInstance) {
      if (!fbInstance.auth.currentUser) {
        alert("Authentication Error: You must be logged in to resolve matches.");
        return;
      }
      await setDoc(doc(fbInstance.db, 'groups', rGroup.id), rGroup);
      for (const m of rMatches) {
        await setDoc(doc(fbInstance.db, 'matches', m.id), m);
      }
      for (const b of rSingles) {
        await setDoc(doc(fbInstance.db, 'bets', b.id), { ...b, type: 'single' });
      }
      for (const b of rDCs) {
        await setDoc(doc(fbInstance.db, 'bets', b.id), { ...b, type: 'doubleChance' });
      }
      for (const b of rCombos) {
        await setDoc(doc(fbInstance.db, 'bets', b.id), { ...b, type: 'combo' });
      }
      if (rRecap) {
        await setDoc(doc(fbInstance.db, 'recaps', `${rRecap.groupId}_${rRecap.date}`), rRecap);
      }
    } else {
      setMatches(rMatches);
      setSingleBets(rSingles);
      setDoubleChanceBets(rDCs);
      setComboBets(rCombos);
      setGroups(prev => prev.map(g => g.id === rGroup.id ? rGroup : g));
      if (rRecap) {
        setRecaps(prev => [rRecap, ...prev]);
      }
    }
  };

  // --- Persistent Storage State ---
  const [users] = useState<User[]>(() => {
    const saved = localStorage.getItem('wc_users');
    return saved ? JSON.parse(saved) : DEFAULT_USERS;
  });

  const [currentUser, setCurrentUser] = useState<User>(() => {
    const saved = localStorage.getItem('wc_current_user');
    return saved ? JSON.parse(saved) : DEFAULT_USERS[0];
  });

  const [groups, setGroups] = useState<Group[]>(() => {
    const saved = localStorage.getItem('wc_groups');
    if (saved) return JSON.parse(saved);
    // Seed default group
    const defaultGroup: Group = {
      id: 'group-1',
      name: 'Qatar-2022 Rematch League',
      inviteCode: 'FIFA26',
      adminId: 'user-1',
      startingBudget: 500,
      toggle3MatchBonus: true,
      toggleMdBonus: true,
      mdBonusPoints: 100,
      allowCombos: true,
      allowOverdraft: true,
      seasonStarted: false,
      members: {
        'user-1': { userId: 'user-1', username: 'Me (Player)', balance: 500, correctCount: 0, totalBetsCount: 0, winRate: 0, noLossUsed: 0, doubleChanceUsed: 0, doublePointsUsed: 0 },
        'user-2': { userId: 'user-2', username: 'Messi10', balance: 500, correctCount: 0, totalBetsCount: 0, winRate: 0, noLossUsed: 0, doubleChanceUsed: 0, doublePointsUsed: 0 },
        'user-3': { userId: 'user-3', username: 'Pulisic_USA', balance: 500, correctCount: 0, totalBetsCount: 0, winRate: 0, noLossUsed: 0, doubleChanceUsed: 0, doublePointsUsed: 0 },
        'user-4': { userId: 'user-4', username: 'CR7_Fan', balance: 500, correctCount: 0, totalBetsCount: 0, winRate: 0, noLossUsed: 0, doubleChanceUsed: 0, doublePointsUsed: 0 },
        'user-5': { userId: 'user-5', username: 'Chicharito', balance: 500, correctCount: 0, totalBetsCount: 0, winRate: 0, noLossUsed: 0, doubleChanceUsed: 0, doublePointsUsed: 0 }
      }
    };
    return [defaultGroup];
  });

  const [activeGroupId, setActiveGroupId] = useState<string>(() => {
    const saved = localStorage.getItem('wc_active_group_id');
    return saved || 'group-1';
  });

  const [matches, setMatches] = useState<Match[]>(() => {
    const saved = localStorage.getItem('wc_matches');
    return saved ? JSON.parse(saved) : getInitialMatches();
  });

  const [singleBets, setSingleBets] = useState<SingleBet[]>(() => {
    const saved = localStorage.getItem('wc_single_bets');
    return saved ? JSON.parse(saved) : [];
  });

  const [doubleChanceBets, setDoubleChanceBets] = useState<DoubleChanceBet[]>(() => {
    const saved = localStorage.getItem('wc_double_chance_bets');
    return saved ? JSON.parse(saved) : [];
  });

  const [comboBets, setComboBets] = useState<ComboBet[]>(() => {
    const saved = localStorage.getItem('wc_combo_bets');
    return saved ? JSON.parse(saved) : [];
  });

  const [recaps, setRecaps] = useState<YesterdayRecap[]>(() => {
    const saved = localStorage.getItem('wc_recaps');
    return saved ? JSON.parse(saved) : [];
  });

  // --- Simulated Tournament Date & Time ---
  const [currentDate, setCurrentDate] = useState<string>(() => {
    return localStorage.getItem('wc_sim_date') || '2026-06-11'; // Matchday 1 Kickoff Day
  });

  const [currentTime, setCurrentTime] = useState<string>(() => {
    return localStorage.getItem('wc_sim_time') || '12:00';
  });

  const [oddsSyncStatus, setOddsSyncStatus] = useState<string>('Synced Today at 08:00 AM UK');
  const [activeTab, setActiveTab] = useState<string>('matches');

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem('wc_chats');
    return saved ? JSON.parse(saved) : [];
  });

  const [currentTheme, setCurrentTheme] = useState<string>(() => {
    return localStorage.getItem('wc_app_theme') || 'default-dark';
  });

  const [randomizeTheme, setRandomizeTheme] = useState<boolean>(() => {
    return localStorage.getItem('wc_randomize_theme') === 'true';
  });

  // Real-time Chat Sync
  useEffect(() => {
    if (!fbInstance) {
      // Offline mode
      const saved = localStorage.getItem('wc_chats');
      if (saved) setChatMessages(JSON.parse(saved));
      return;
    }
    if (!activeGroupId) return;

    const chatsRef = collection(fbInstance.db, 'groups', activeGroupId, 'chats');
    const unsubChats = onSnapshot(chatsRef, (snapshot) => {
      const messages: ChatMessage[] = [];
      snapshot.forEach(docSnap => {
        messages.push(docSnap.data() as ChatMessage);
      });
      messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      setChatMessages(messages);
      localStorage.setItem('wc_chats', JSON.stringify(messages));
    });

    return () => unsubChats();
  }, [fbInstance, activeGroupId]);

  // CSS Variables Injection Theme Engine
  useEffect(() => {
    const selected = THEMES.find(t => t.id === currentTheme) || THEMES[0];
    
    // Clear custom styling properties
    const defaults = THEMES[0].variables;
    Object.keys(defaults).forEach(key => {
      document.documentElement.style.removeProperty(key);
    });

    // Apply active theme's variables
    Object.entries(selected.variables).forEach(([key, val]) => {
      document.documentElement.style.setProperty(key, val);
    });
  }, [currentTheme]);

  // Auto-randomization on page load
  useEffect(() => {
    const shouldRandomize = localStorage.getItem('wc_randomize_theme') === 'true';
    if (shouldRandomize) {
      const teamThemes = THEMES.filter(t => t.id !== 'default-dark' && t.id !== 'light-theme');
      const randomSelected = teamThemes[Math.floor(Math.random() * teamThemes.length)];
      setCurrentTheme(randomSelected.id);
      localStorage.setItem('wc_app_theme', randomSelected.id);
    }
  }, []);

  const writeChatMessage = async (text: string, type: 'chat' | 'activity', gifUrl?: string, senderId?: string, senderUsername?: string) => {
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newMsg: ChatMessage = {
      id: messageId,
      groupId: activeGroupId,
      userId: senderId || currentUser.id,
      username: senderUsername || currentUser.username,
      text,
      type,
      timestamp: new Date().toISOString(),
      gifUrl
    };

    if (fbInstance) {
      await setDoc(doc(fbInstance.db, 'groups', activeGroupId, 'chats', messageId), newMsg);
    } else {
      setChatMessages(prev => {
        const updated = [...prev, newMsg];
        localStorage.setItem('wc_chats', JSON.stringify(updated));
        return updated;
      });
    }
  };

  // Auto-close mobile sidebar when navigation occurs
  useEffect(() => {
    if (layoutMode === 'mobile') {
      setShowMobileSidebar(false);
    }
  }, [activeTab, activeGroupId, layoutMode]);

  // --- Swipe Gesture to Open Mobile Sidebar ---
  useEffect(() => {
    if (layoutMode !== 'mobile') return;

    let touchStartX = 0;
    let touchStartY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;

      const diffX = touchEndX - touchStartX;
      const diffY = touchEndY - touchStartY;

      // Swipe must be horizontal (diffX > 80), not diagonal/vertical, and start from the left 40% of screen width
      if (diffX > 80 && Math.abs(diffY) < 45 && touchStartX < window.innerWidth * 0.4) {
        setShowMobileSidebar(true);
      }
      
      // Swipe right-to-left closes the sidebar
      if (diffX < -80 && Math.abs(diffY) < 45 && showMobileSidebar) {
        setShowMobileSidebar(false);
      }
    };

    document.addEventListener('touchstart', handleTouchStart);
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [layoutMode, showMobileSidebar]);

  // --- UI Interactions State ---
  const [inviteInput, setInviteInput] = useState<string>('');
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('invite');
    if (code) {
      window.history.replaceState({}, document.title, window.location.pathname || '/');
      return code.trim().toUpperCase();
    }
    return null;
  });
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [selectedMemberForHistory, setSelectedMemberForHistory] = useState<GroupMember | null>(null);
  const [betsToAcknowledge, setBetsToAcknowledge] = useState<any[]>([]);
  const [showLockRulesConfirm, setShowLockRulesConfirm] = useState<boolean>(false);
  const [newGroupName, setNewGroupName] = useState<string>('');
  const [newStartingBudget, setNewStartingBudget] = useState<number>(500);
  const [new3MatchBonus, setNew3MatchBonus] = useState<boolean>(true);
  const [newMdBonus, setNewMdBonus] = useState<boolean>(true);
  const [newMdBonusPoints, setNewMdBonusPoints] = useState<number>(100);
  const [newAllowOverdraft, setNewAllowOverdraft] = useState<boolean>(true);

  // --- Bet Slip State ---
  const [slipTab, setSlipTab] = useState<'single' | 'combo'>('single');
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [singleOutcome, setSingleOutcome] = useState<'1' | 'X' | '2' | null>(null);
  const [singleStake, setSingleStake] = useState<string>('');
  const [activePowerup, setActivePowerup] = useState<'noLoss' | 'doubleChance' | 'doublePoints' | null>(null);
  
  // Double Chance secondary selection
  const [dcOutcome2, setDcOutcome2] = useState<'1' | 'X' | '2' | null>(null);
  const [dcStake2, setDcStake2] = useState<string>('');

  // Combo Bet selections (exactly 3 matches)
  const [comboSelections, setComboSelections] = useState<{ matchId: string; outcome: '1' | 'X' | '2' }[]>([]);
  const [comboStake, setComboStake] = useState<string>('');

  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // --- Odds Sync API Configuration States ---
  const [oddsApiKey, setOddsApiKey] = useState<string>(() => {
    return localStorage.getItem('wc_odds_api_key') || '9d82a6aa7cdf7acda17da7fee79266eb';
  });
  const [klipyApiKey, setKlipyApiKey] = useState<string>(() => {
    return localStorage.getItem('wc_klipy_api_key') || '';
  });
  const [oddsSource, setOddsSource] = useState<'api' | 'scrape'>(() => {
    return (localStorage.getItem('wc_odds_source') as 'api' | 'scrape') || 'api';
  });
  const [isSyncingOdds, setIsSyncingOdds] = useState<boolean>(false);

  // --- Synchronization with LocalStorage ---
  useEffect(() => {
    localStorage.setItem('wc_users', JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    localStorage.setItem('wc_current_user', JSON.stringify(currentUser));
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('wc_groups', JSON.stringify(groups));
  }, [groups]);

  useEffect(() => {
    localStorage.setItem('wc_active_group_id', activeGroupId);
  }, [activeGroupId]);

  useEffect(() => {
    localStorage.setItem('wc_odds_api_key', oddsApiKey);
  }, [oddsApiKey]);

  useEffect(() => {
    localStorage.setItem('wc_klipy_api_key', klipyApiKey);
  }, [klipyApiKey]);

  useEffect(() => {
    localStorage.setItem('wc_odds_source', oddsSource);
  }, [oddsSource]);

  useEffect(() => {
    localStorage.setItem('wc_matches', JSON.stringify(matches));
  }, [matches]);

  useEffect(() => {
    localStorage.setItem('wc_single_bets', JSON.stringify(singleBets));
  }, [singleBets]);

  useEffect(() => {
    localStorage.setItem('wc_double_chance_bets', JSON.stringify(doubleChanceBets));
  }, [doubleChanceBets]);

  useEffect(() => {
    localStorage.setItem('wc_combo_bets', JSON.stringify(comboBets));
  }, [comboBets]);

  useEffect(() => {
    localStorage.setItem('wc_recaps', JSON.stringify(recaps));
  }, [recaps]);

  useEffect(() => {
    localStorage.setItem('wc_sim_date', currentDate);
  }, [currentDate]);

  useEffect(() => {
    localStorage.setItem('wc_sim_time', currentTime);
  }, [currentTime]);

  useEffect(() => {
    localStorage.setItem('wc_firebase_config', firebaseConfig);
  }, [firebaseConfig]);

  // --- Check Unacknowledged Resolved Bets ---
  useEffect(() => {
    if (!currentUser?.id || !activeGroupId) return;

    // Filter only current user's resolved bets
    const myResolvedSingles = singleBets.filter(b => b.userId === currentUser.id && b.groupId === activeGroupId && b.status !== 'pending');
    const myResolvedDCs = doubleChanceBets.filter(b => b.userId === currentUser.id && b.groupId === activeGroupId && b.status !== 'pending');
    const myResolvedCombos = comboBets.filter(b => b.userId === currentUser.id && b.groupId === activeGroupId && b.status !== 'pending');

    const allResolved = [...myResolvedSingles, ...myResolvedDCs, ...myResolvedCombos];

    // Load acknowledged IDs
    const savedAck = localStorage.getItem('acknowledged_bets');
    const ackList: string[] = savedAck ? JSON.parse(savedAck) : [];
    const ackSet = new Set(ackList);

    // Find unacknowledged ones
    const unacknowledged = allResolved.filter(b => !ackSet.has(b.id));

    if (unacknowledged.length > 0) {
      setBetsToAcknowledge(unacknowledged);
    }
  }, [singleBets, doubleChanceBets, comboBets, currentUser?.id, activeGroupId]);

  // --- Auto-Open How to Play Tab on First Join/Load ---
  useEffect(() => {
    if (!activeGroupId) return;
    const seenKey = `wc_rules_shown_${activeGroupId}`;
    const hasSeen = localStorage.getItem(seenKey);
    if (!hasSeen) {
      localStorage.setItem(seenKey, 'true');
      setActiveTab('howplay');
    }
  }, [activeGroupId]);

  const getBetDetailsForSummary = (bet: any) => {
    const isSingle = !('bets' in bet) && !('outcome2' in bet);
    const isDC = 'outcome2' in bet;
    const isCombo = 'bets' in bet;

    let title = '';
    let details = '';
    let statusLabel = '';
    let netChange = 0;
    let color = '';

    if (isSingle) {
      const match = matches.find(m => m.id === bet.matchId);
      const matchName = match ? `${match.homeTeam} vs ${match.awayTeam}` : `Match ${bet.matchId}`;
      title = 'Single Bet';
      details = `${matchName} (Pick: ${bet.outcome === '1' ? 'Home' : bet.outcome === 'X' ? 'Draw' : 'Away'})`;
      netChange = bet.pointsWon - bet.amount;
      if (bet.status === 'won') {
        statusLabel = 'Won';
        color = 'var(--color-status-won)';
      } else if (bet.status === 'lost') {
        statusLabel = 'Lost';
        color = 'var(--color-status-lost)';
      } else {
        statusLabel = 'Refunded';
        color = 'var(--color-info)';
      }
    } else if (isDC) {
      const match = matches.find(m => m.id === bet.matchId);
      const matchName = match ? `${match.homeTeam} vs ${match.awayTeam}` : `Match ${bet.matchId}`;
      title = 'Double Chance';
      details = `${matchName} (Pick: ${bet.outcome1} & ${bet.outcome2})`;
      const totalStake = bet.amount1 + bet.amount2;
      netChange = bet.pointsWon - totalStake;
      if (bet.pointsWon > 0) {
        statusLabel = 'Won';
        color = 'var(--color-status-won)';
      } else {
        statusLabel = 'Lost';
        color = 'var(--color-status-lost)';
      }
    } else if (isCombo) {
      title = '3-Match Combo';
      const matchDetails = bet.bets.map((b: any) => {
        const match = matches.find(m => m.id === b.matchId);
        return match ? `${match.homeTeam} (${b.outcome})` : b.matchId;
      }).join(', ');
      details = `Combo: ${matchDetails}`;
      netChange = bet.pointsWon - bet.amount;
      if (bet.status === 'won') {
        statusLabel = 'Won';
        color = 'var(--color-status-won)';
      } else {
        statusLabel = 'Lost';
        color = 'var(--color-status-lost)';
      }
    }

    return { title, details, statusLabel, netChange, color };
  };

  // Firebase Auth State Listener
  useEffect(() => {
    if (!fbInstance) {
      setIsOnlineLoggedIn(false);
      return;
    }

    const unsubscribe = fbInstance.auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        setIsOnlineLoggedIn(true);
        
        const userDocRef = doc(fbInstance.db, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);
        
        const avatar = firebaseUser.displayName ? firebaseUser.displayName.charAt(0).toUpperCase() : firebaseUser.email?.charAt(0).toUpperCase() || 'U';
        const name = firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User';

        const userProfile = {
          id: firebaseUser.uid,
          username: name,
          email: firebaseUser.email || '',
          avatarUrl: avatar
        };

        if (!userDoc.exists()) {
          await setDoc(userDocRef, userProfile);
        }

        setCurrentUser(userProfile);

        // Auto-join default league
        const groupDocRef = doc(fbInstance.db, 'groups', 'group-1');
        const groupDoc = await getDoc(groupDocRef);
        if (groupDoc.exists()) {
          const groupData = groupDoc.data() as Group;
          if (!groupData.members[firebaseUser.uid]) {
            const updatedMembers = {
              ...groupData.members,
              [firebaseUser.uid]: {
                userId: firebaseUser.uid,
                username: name,
                balance: groupData.startingBudget || 500,
                correctCount: 0,
                totalBetsCount: 0,
                winRate: 0,
                noLossUsed: 0,
                doubleChanceUsed: 0,
                doublePointsUsed: 0
              }
            };
            await updateDoc(groupDocRef, { members: updatedMembers });
          }
        } else {
          const defaultGroup: Group = {
            id: 'group-1',
            name: 'Qatar-2022 Rematch League',
            inviteCode: 'FIFA26',
            adminId: firebaseUser.uid,
            startingBudget: 500,
            toggle3MatchBonus: true,
            toggleMdBonus: true,
            mdBonusPoints: 100,
            allowCombos: true,
            allowOverdraft: true,
            seasonStarted: false,
            members: {
              [firebaseUser.uid]: {
                userId: firebaseUser.uid,
                username: name,
                balance: 500,
                correctCount: 0,
                totalBetsCount: 0,
                winRate: 0,
                noLossUsed: 0,
                doubleChanceUsed: 0,
                doublePointsUsed: 0
              }
            }
          };
          await setDoc(groupDocRef, defaultGroup);
        }
      } else {
        setIsOnlineLoggedIn(false);
        const savedUser = localStorage.getItem('wc_current_user');
        setCurrentUser(savedUser ? JSON.parse(savedUser) : DEFAULT_USERS[0]);
      }
    });

    return () => unsubscribe();
  }, [fbInstance]);

  // Real-time Firestore Database sync
  useEffect(() => {
    if (!fbInstance) return;

    const unsubMatches = onSnapshot(collection(fbInstance.db, 'matches'), async (snapshot) => {
      if (snapshot.empty) {
        const initial = getInitialMatches();
        for (const m of initial) {
          await setDoc(doc(fbInstance.db, 'matches', m.id), m);
        }
      } else {
        const list: Match[] = [];
        snapshot.forEach(docSnap => {
          list.push(docSnap.data() as Match);
        });
        list.sort((a, b) => {
          const numA = parseInt(a.id.replace('m-', ''));
          const numB = parseInt(b.id.replace('m-', ''));
          return numA - numB;
        });
        setMatches(list);
      }
    });

    const unsubGroups = onSnapshot(collection(fbInstance.db, 'groups'), (snapshot) => {
      if (!snapshot.empty) {
        const list: Group[] = [];
        snapshot.forEach(docSnap => {
          list.push(docSnap.data() as Group);
        });
        setGroups(list);
      }
    });

    const unsubBets = onSnapshot(collection(fbInstance.db, 'bets'), (snapshot) => {
      const singles: SingleBet[] = [];
      const dcs: DoubleChanceBet[] = [];
      const combos: ComboBet[] = [];
      
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.type === 'single') {
          singles.push(data as SingleBet);
        } else if (data.type === 'doubleChance') {
          dcs.push(data as DoubleChanceBet);
        } else if (data.type === 'combo') {
          combos.push(data as ComboBet);
        }
      });
      
      setSingleBets(singles);
      setDoubleChanceBets(dcs);
      setComboBets(combos);
    });

    const unsubState = onSnapshot(doc(fbInstance.db, 'settings', 'state'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.currentDate) setCurrentDate(data.currentDate);
        if (data.currentTime) setCurrentTime(data.currentTime);
      } else {
        if (fbInstance.auth.currentUser) {
          setDoc(doc(fbInstance.db, 'settings', 'state'), {
            currentDate: '2026-06-11',
            currentTime: '12:00'
          });
        }
      }
    });

    const unsubRecaps = onSnapshot(collection(fbInstance.db, 'recaps'), (snapshot) => {
      const list: YesterdayRecap[] = [];
      snapshot.forEach(docSnap => {
        list.push(docSnap.data() as YesterdayRecap);
      });
      list.sort((a, b) => b.date.localeCompare(a.date));
      setRecaps(list);
    });

    return () => {
      unsubMatches();
      unsubGroups();
      unsubBets();
      unsubState();
      unsubRecaps();
    };
  }, [fbInstance]);

  // Auto-sync real-life results from results.json when simulated time passes kickoff
  useEffect(() => {
    const syncResultsOnTimeChange = async () => {
      try {
        const res = await fetch('/results.json');
        if (!res.ok) return;
        const realScores = await res.json();
        
        const [year, month, day] = currentDate.split('-').map(Number);
        const [hour, minute] = currentTime.split(':').map(Number);
        const currentSimDateTime = new Date(year, month - 1, day, hour, minute);

        let changed = false;
        const updated = matches.map(m => {
          const score = realScores[m.id];
          if (score !== undefined && score !== null && score.homeScore !== undefined && m.status === 'scheduled') {
            const [mYear, mMonth, mDay] = m.date.split('-').map(Number);
            const [mHour, mMinute] = m.kickoffTime.split(':').map(Number);
            const matchDateTime = new Date(mYear, mMonth - 1, mDay, mHour, mMinute);

            // ONLY resolve if the match kickoff time is in the past or equal in the simulation
            if (matchDateTime <= currentSimDateTime) {
              const homeScore = score.homeScore;
              const awayScore = score.awayScore;
              let result: '1' | 'X' | '2';
              if (homeScore > awayScore) result = '1';
              else if (homeScore === awayScore) result = 'X';
              else result = '2';

              let winner = score.winner || null;
              if (m.matchday >= 4 && !winner) {
                if (homeScore > awayScore) winner = m.homeTeam;
                else if (awayScore > homeScore) winner = m.awayTeam;
              }

              changed = true;
              return {
                ...m,
                status: 'finished' as const,
                homeScore,
                awayScore,
                result,
                winner
              };
            }
          }
          return m;
        });

        if (changed) {
          const progressed = progressKnockoutRounds(updated);
          setMatches(progressed);
          console.log("Synced real-life match results from results.json for elapsed matches.");
        }
      } catch (err) {
        console.warn("Could not sync real-life results:", err);
      }
    };
    syncResultsOnTimeChange();
  }, [currentDate, currentTime]);

  // --- Handle Shared Invite Links ---
  useEffect(() => {
    if (!pendingInviteCode || groups.length === 0 || !currentUser?.id) return;
    
    const targetGroup = groups.find(g => g.inviteCode.toUpperCase() === pendingInviteCode);
    if (targetGroup) {
      if (targetGroup.members[currentUser.id]) {
        setActiveGroupId(targetGroup.id);
      } else {
        // Auto-join
        const newMember = {
          userId: currentUser.id,
          username: currentUser.username,
          balance: targetGroup.startingBudget,
          correctCount: 0,
          totalBetsCount: 0,
          winRate: 0,
          noLossUsed: 0,
          doubleChanceUsed: 0,
          doublePointsUsed: 0
        };
        const updatedGroup = {
          ...targetGroup,
          members: {
            ...targetGroup.members,
            [currentUser.id]: newMember
          }
        };
        dbWriteGroup(updatedGroup).then(() => {
          setActiveGroupId(targetGroup.id);
          alert(`Successfully joined league: ${targetGroup.name}! 🎉`);
        });
      }
    } else {
      alert(`League with code "${pendingInviteCode}" not found.`);
    }
    
    setPendingInviteCode(null);
  }, [pendingInviteCode, groups, currentUser?.id]);

  // --- Derived Values ---
  const activeGroup = useMemo(() => {
    return groups.find(g => g.id === activeGroupId) || groups[0];
  }, [groups, activeGroupId]);

  const activeMemberInfo = useMemo(() => {
    if (!activeGroup) return null;
    return activeGroup.members[currentUser.id] || null;
  }, [activeGroup, currentUser]);

  const todayMatches = useMemo(() => {
    const bounds = getActiveSessionBounds(currentDate, currentTime);
    
    const [year, month, day] = currentDate.split('-').map(Number);
    const [hour, minute] = currentTime.split(':').map(Number);
    const currentSimDateTime = new Date(year, month - 1, day, hour, minute);

    return matches.filter(m => {
      const [mYear, mMonth, mDay] = m.date.split('-').map(Number);
      const [mHour, mMinute] = m.kickoffTime.split(':').map(Number);
      const matchDateTime = new Date(mYear, mMonth - 1, mDay, mHour, mMinute);
      
      // Match falls inside active betting session: from current time to 8 AM the next day
      return matchDateTime >= currentSimDateTime && matchDateTime < bounds.end;
    });
  }, [matches, currentDate, currentTime]);

  // Check if a match is lockable (within 2 hours of kick-off)
  const isMatchLocked = (match: Match) => {
    if (match.status === 'finished') return true;

    const [year, month, day] = currentDate.split('-').map(Number);
    const [hour, minute] = currentTime.split(':').map(Number);
    const currentSimDateTime = new Date(year, month - 1, day, hour, minute);

    const [mYear, mMonth, mDay] = match.date.split('-').map(Number);
    const [mHour, mMinute] = match.kickoffTime.split(':').map(Number);
    const matchDateTime = new Date(mYear, mMonth - 1, mDay, mHour, mMinute);

    const diffMinutes = (matchDateTime.getTime() - currentSimDateTime.getTime()) / (1000 * 60);
    return diffMinutes <= 120;
  };

  // --- Auth handlers ---

  // --- Group actions ---
  const handleJoinGroup = async () => {
    if (!inviteInput.trim()) return;
    const code = inviteInput.trim().toUpperCase();
    const targetGroup = groups.find(g => g.inviteCode.toUpperCase() === code);

    if (!targetGroup) {
      alert('Group not found with code: ' + code);
      return;
    }

    if (targetGroup.members[currentUser.id]) {
      setActiveGroupId(targetGroup.id);
      setInviteInput('');
      alert('You are already a member of this group!');
      return;
    }

    // Join
    const newMember = {
      userId: currentUser.id,
      username: currentUser.username,
      balance: targetGroup.startingBudget,
      correctCount: 0,
      totalBetsCount: 0,
      winRate: 0,
      noLossUsed: 0,
      doubleChanceUsed: 0,
      doublePointsUsed: 0
    };

    const updatedGroup = {
      ...targetGroup,
      members: {
        ...targetGroup.members,
        [currentUser.id]: newMember
      }
    };

    await dbWriteGroup(updatedGroup);

    setActiveGroupId(targetGroup.id);
    setInviteInput('');
    alert(`Joined group: ${targetGroup.name}`);
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    let newCode = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let isUnique = false;
    while (!isUnique) {
      newCode = '';
      for (let i = 0; i < 6; i++) {
        newCode += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      isUnique = !groups.some(g => g.inviteCode.toUpperCase() === newCode);
    }
    const newId = 'group-' + Math.random().toString(36).substring(2, 9);
    const newGroup: Group = {
      id: newId,
      name: newGroupName.trim(),
      inviteCode: newCode,
      adminId: currentUser.id,
      startingBudget: newStartingBudget,
      toggle3MatchBonus: new3MatchBonus,
      toggleMdBonus: newMdBonus,
      mdBonusPoints: newMdBonusPoints,
      allowCombos: true,
      allowOverdraft: newAllowOverdraft,
      seasonStarted: false,
      members: {
        [currentUser.id]: {
          userId: currentUser.id,
          username: currentUser.username,
          balance: newStartingBudget,
          correctCount: 0,
          totalBetsCount: 0,
          winRate: 0,
          noLossUsed: 0,
          doubleChanceUsed: 0,
          doublePointsUsed: 0
        }
      }
    };

    await dbWriteGroup(newGroup);
    setActiveGroupId(newGroup.id);
    setShowCreateModal(false);
    setNewGroupName('');
  };

  // --- Copy Invite Link ---
  const copyInviteLink = () => {
    if (!activeGroup) return;
    const link = `${window.location.origin}?invite=${activeGroup.inviteCode}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // --- Odds Synchronization Logic ---
  const triggerOddsSync = async (
    targetDate: string,
    source: 'api' | 'scrape' = oddsSource,
    key: string = oddsApiKey
  ) => {
    setIsSyncingOdds(true);
    setOddsSyncStatus('Syncing odds from source...');
    try {
      if (source === 'api' && key.trim()) {
        const liveOdds = await fetchLiveOddsFromAPI(key.trim());
        const updated = matches.map(m => {
          if (m.date === targetDate) {
            const lookupKey = `${m.homeTeam}-${m.awayTeam}`;
            const lookupKeyAlt = `${m.awayTeam}-${m.homeTeam}`;
            const found = liveOdds[lookupKey] || liveOdds[lookupKeyAlt];
            if (found) {
              return {
                ...m,
                homeOdds: found.homeOdds,
                drawOdds: found.drawOdds,
                awayOdds: found.awayOdds
              };
            }
          }
          return m;
        });
        await dbWriteMatches(updated);
        setOddsSyncStatus('Synced Today at 08:00 AM UK via The Odds API');
      } else {
        // Scraped proxy fallback
        const dayMatches = matches.filter(m => m.date === targetDate);
        if (dayMatches.length > 0) {
          const scrapedOdds = await scrapeDailyOddsFeed(dayMatches);
          const updated = matches.map(m => {
            if (m.date === targetDate && scrapedOdds[m.id]) {
              return {
                ...m,
                ...scrapedOdds[m.id]
              };
            }
            return m;
          });
          await dbWriteMatches(updated);
        }
        setOddsSyncStatus('Synced Today at 08:00 AM UK via Scraped Odds Feed');
      }
    } catch (err: any) {
      console.error('Odds API sync failed, falling back to scraped simulator', err);
      
      // Notify user about API key quota/limit issues
      if (source === 'api') {
        showNotification(
          "The Odds API key is invalid or has reached its usage limit. Falling back to simulated live odds. You can paste your own free key in Settings.",
          "warning"
        );
      }

      // Automatically fall back to scraped/simulated live odds
      try {
        const dayMatches = matches.filter(m => m.date === targetDate);
        if (dayMatches.length > 0) {
          const scrapedOdds = await scrapeDailyOddsFeed(dayMatches);
          const updated = matches.map(m => {
            if (m.date === targetDate && scrapedOdds[m.id]) {
              return {
                ...m,
                ...scrapedOdds[m.id]
              };
            }
            return m;
          });
          await dbWriteMatches(updated);
          setOddsSyncStatus('Synced Today at 08:00 AM UK via Simulated Live Odds (API fallback)');
        } else {
          setOddsSyncStatus('API Sync Failed. Used offline baseline odds.');
        }
      } catch (fallbackErr) {
        console.error('Fallback scraped odds synchronization failed', fallbackErr);
        setOddsSyncStatus('Sync Failed. Used offline baseline odds.');
      }
    } finally {
      setIsSyncingOdds(false);
    }
  };

  useEffect(() => {
    // Only trigger API sync if the current user is the administrator of the league,
    // or if they are playing in the offline sandbox mode. This prevents normal league members
    // from wasting your API key quota when they open the website.
    const isOffline = !localStorage.getItem('wc_firebase_config');
    const isAdmin = activeGroup ? activeGroup.adminId === currentUser?.id : true;
    
    if (isOffline || isAdmin) {
      triggerOddsSync(currentDate);
    }
  }, [activeGroup?.id, currentUser?.id]);

  // --- Bet Placement logic ---
  const handlePlaceSingleBet = async () => {
    if (!selectedMatch || !activeMemberInfo) return;
    
    // Validate: only 1 bet per game (single, double chance, or combo)
    const hasSingleBet = singleBets.some(b => b.userId === currentUser.id && b.matchId === selectedMatch.id && b.groupId === activeGroupId && b.status === 'pending');
    const hasDCBet = doubleChanceBets.some(b => b.userId === currentUser.id && b.matchId === selectedMatch.id && b.groupId === activeGroupId && b.status === 'pending');
    const hasComboBet = comboBets.some(b => b.userId === currentUser.id && b.groupId === activeGroupId && b.status === 'pending' && b.bets.some(sb => sb.matchId === selectedMatch.id));
    
    if (hasSingleBet || hasDCBet || hasComboBet) {
      alert("You have already placed a bet on this match! Only 1 bet per game is allowed.");
      return;
    }

    if (isMatchLocked(selectedMatch)) {
      alert("This match is locked (within 2 hours of kickoff) and cannot receive bets.");
      return;
    }

    const isFinal = selectedMatch.matchdayName.includes('Final') && !selectedMatch.matchdayName.includes('Third');

    // Declare common variables to be captured
    let updatedGroup: any = null;
    let newBetObj: any = null;
    let betType: 'single' | 'doubleChance' = 'single';

    if (activePowerup === 'doubleChance') {
      // 1. Double Chance Validations
      if (!singleOutcome || !dcOutcome2) {
        alert('Please select both outcomes for Double Chance');
        return;
      }
      if (singleOutcome === dcOutcome2) {
        alert('Please choose two different outcomes');
        return;
      }
      const amt1 = Number(singleStake);
      const amt2 = Number(dcStake2);

      if (isNaN(amt1) || amt1 <= 0 || isNaN(amt2) || amt2 <= 0) {
        alert('Please enter valid bet amounts');
        return;
      }

      const totalRequired = amt1 + amt2;
      const maxStake = Math.round(activeGroup.startingBudget * 0.2);
      if (activeMemberInfo.balance > 0) {
        if (totalRequired > activeMemberInfo.balance) {
          alert(`Insufficient balance! Your double chance bet requires a total stake of ${totalRequired} credits, which exceeds your current balance of ${activeMemberInfo.balance} credits.`);
          return;
        }
      } else {
        if (activeGroup.allowOverdraft === false) {
          alert('Insufficient balance! Overdraft is disabled in this league.');
          return;
        }
        if (totalRequired > maxStake) {
          alert(`You are in overdraft! In the red, you can only wager up to 20% of the starting budget (${maxStake} credits) per match.`);
          return;
        }
      }

      const maxDC = 2 + (activeMemberInfo.extraDoubleChanceEarned ? 1 : 0);
      if (activeMemberInfo.doubleChanceUsed >= maxDC) {
        alert('Out of Double Chance power-up uses!');
        return;
      }

      // 2. Prepare Double Chance data
      betType = 'doubleChance';
      updatedGroup = {
        ...activeGroup,
        members: {
          ...activeGroup.members,
          [currentUser.id]: {
            ...activeMemberInfo,
            balance: activeMemberInfo.balance - totalRequired,
            doubleChanceUsed: activeMemberInfo.doubleChanceUsed + 1
          }
        }
      };

      newBetObj = {
        id: 'dc-' + Math.random().toString(36).substring(2, 9),
        userId: currentUser.id,
        groupId: activeGroupId,
        matchId: selectedMatch.id,
        outcome1: singleOutcome,
        amount1: amt1,
        outcome2: dcOutcome2,
        amount2: amt2,
        status: 'pending',
        outcome1Status: 'pending',
        outcome2Status: 'pending',
        pointsWon: 0,
        multiplier: getMatchdayMultiplier(selectedMatch.matchday),
        timestamp: new Date().toISOString(),
        placedInRed: activeMemberInfo.balance <= 0
      };

    } else {
      // 1. Standard Single Bet Validations
      if (!singleOutcome) {
        alert('Select a prediction (1, X, or 2)');
        return;
      }
      const amt = Number(singleStake);
      if (isNaN(amt) || amt <= 0) {
        alert('Enter a valid points amount');
        return;
      }
      const maxStake = Math.round(activeGroup.startingBudget * 0.2);
      if (activeMemberInfo.balance > 0) {
        if (amt > activeMemberInfo.balance) {
          alert(`Insufficient balance! Your bet exceeds your current balance of ${activeMemberInfo.balance} credits.`);
          return;
        }
      } else {
        if (activeGroup.allowOverdraft === false) {
          alert('Insufficient balance! Overdraft is disabled in this league.');
          return;
        }
        if (amt > maxStake) {
          alert(`You are in overdraft! In the red, you can only wager up to 20% of the starting budget (${maxStake} credits) per match.`);
          return;
        }
      }

      // Power-up validations
      if (activePowerup === 'noLoss') {
        if (isFinal) {
          alert('Cannot use No Loss power-up in the Tournament Final!');
          return;
        }
        const maxNoLoss = 2 + (activeMemberInfo.extraNoLossEarned ? 1 : 0);
        if (activeMemberInfo.noLossUsed >= maxNoLoss) {
          alert('Out of No Loss power-up charges!');
          return;
        }
      }
      if (activePowerup === 'doublePoints') {
        const maxDP = 2 + (activeMemberInfo.extraDoublePointsEarned ? 1 : 0);
        if (activeMemberInfo.doublePointsUsed >= maxDP) {
          alert('Out of Double Points power-up charges!');
          return;
        }
      }

      // 2. Prepare Single Bet data
      betType = 'single';
      updatedGroup = {
        ...activeGroup,
        members: {
          ...activeGroup.members,
          [currentUser.id]: {
            ...activeMemberInfo,
            balance: activeMemberInfo.balance - amt,
            noLossUsed: activePowerup === 'noLoss' ? activeMemberInfo.noLossUsed + 1 : activeMemberInfo.noLossUsed,
            doublePointsUsed: activePowerup === 'doublePoints' ? activeMemberInfo.doublePointsUsed + 1 : activeMemberInfo.doublePointsUsed
          }
        }
      };

      newBetObj = {
        id: 'bet-' + Math.random().toString(36).substring(2, 9),
        userId: currentUser.id,
        groupId: activeGroupId,
        matchId: selectedMatch.id,
        outcome: singleOutcome,
        amount: amt,
        powerupUsed: activePowerup,
        status: 'pending',
        pointsWon: 0,
        multiplier: getMatchdayMultiplier(selectedMatch.matchday),
        timestamp: new Date().toISOString(),
        placedInRed: activeMemberInfo.balance <= 0
      };
    }

    // Function to write to DB and clear slip
    const completePlacement = async () => {
      await dbWriteGroup(updatedGroup);
      await dbWriteBet(newBetObj, betType);
      
      try {
        if (betType === 'single') {
          const match = matches.find(m => m.id === newBetObj.matchId);
          const mName = match ? `${match.homeTeam} vs ${match.awayTeam}` : 'Match';
          const selectionText = newBetObj.outcome === '1' ? 'Home' : newBetObj.outcome === 'X' ? 'Draw' : 'Away';
          const powerupText = newBetObj.powerupUsed ? ` using [${newBetObj.powerupUsed === 'doublePoints' ? 'Double Returns' : newBetObj.powerupUsed === 'noLoss' ? 'No Loss' : newBetObj.powerupUsed}] boost` : '';
          await writeChatMessage(`${currentUser.username} placed a ${newBetObj.amount} credit Single Bet on ${mName} (${selectionText})${powerupText}. 🚀`, 'activity');
        } else if (betType === 'doubleChance') {
          const match = matches.find(m => m.id === newBetObj.matchId);
          const mName = match ? `${match.homeTeam} vs ${match.awayTeam}` : 'Match';
          const s1 = newBetObj.outcome1 === '1' ? 'Home' : newBetObj.outcome1 === 'X' ? 'Draw' : 'Away';
          const s2 = newBetObj.outcome2 === '1' ? 'Home' : newBetObj.outcome2 === 'X' ? 'Draw' : 'Away';
          const totalStake = newBetObj.amount1 + newBetObj.amount2;
          await writeChatMessage(`${currentUser.username} used [Double Chance] boost! Placed a total of ${totalStake} credits on ${mName} (${s1} for ${newBetObj.amount1} & ${s2} for ${newBetObj.amount2}). ⚡`, 'activity');
        }
      } catch (err) {
        console.error("Failed to post chat activity", err);
      }

      // Reset slip
      setSelectedMatch(null);
      setSingleOutcome(null);
      setSingleStake('');
      setActivePowerup(null);
      setDcOutcome2(null);
      setDcStake2('');
      alert('Bet placed successfully!');
    };

    // If using a power-up / boost, require a 30s unskippable ad!
    if (activePowerup !== null) {
      setAdDuration(30);
      setAdCountdown(30);
      setAdDescription(`Watching Sponsored Video (30s) to unlock and activate your ${activePowerup === 'doublePoints' ? 'Double Returns' : activePowerup === 'noLoss' ? 'No Loss' : 'Double Chance'} boost!`);
      setOnAdComplete(() => () => {
        completePlacement();
      });
      setAdActive(true);
    } else {
      // No boost, place immediately
      completePlacement();
    }
  };

  const handlePlaceComboBet = async () => {
    if (comboSelections.length !== 3 || !activeMemberInfo) return;

    // Validate: only 1 bet per game (single, double chance, or combo) for each match in the combo ticket
    for (const sel of comboSelections) {
      const hasSingleBet = singleBets.some(b => b.userId === currentUser.id && b.matchId === sel.matchId && b.groupId === activeGroupId && b.status === 'pending');
      const hasDCBet = doubleChanceBets.some(b => b.userId === currentUser.id && b.matchId === sel.matchId && b.groupId === activeGroupId && b.status === 'pending');
      const hasComboBet = comboBets.some(b => b.userId === currentUser.id && b.groupId === activeGroupId && b.status === 'pending' && b.bets.some(sb => sb.matchId === sel.matchId));
      
      if (hasSingleBet || hasDCBet || hasComboBet) {
        const match = matches.find(m => m.id === sel.matchId);
        const matchName = match ? `${match.homeTeam} vs ${match.awayTeam}` : 'Match';
        alert(`You have already placed a bet on ${matchName}! Only 1 bet per game is allowed.`);
        return;
      }
    }

    const anyLocked = comboSelections.some(sel => {
      const match = matches.find(m => m.id === sel.matchId);
      return match ? isMatchLocked(match) : false;
    });
    if (anyLocked) {
      alert("One or more matches in your combo ticket are locked (within 2 hours of kickoff)!");
      return;
    }

    const amt = Number(comboStake);
    if (isNaN(amt) || amt <= 0) {
      alert('Enter a valid points amount');
      return;
    }
    const maxStake = Math.round(activeGroup.startingBudget * 0.2);
    if (activeMemberInfo.balance > 0) {
      if (amt > activeMemberInfo.balance) {
        alert(`Insufficient balance! Your combo bet exceeds your current balance of ${activeMemberInfo.balance} credits.`);
        return;
      }
    } else {
      if (activeGroup.allowOverdraft === false) {
        alert('Insufficient balance! Overdraft is disabled in this league.');
        return;
      }
      if (amt > maxStake) {
        alert(`You are in overdraft! In the red, combo tickets are limited to 20% of the starting budget (${maxStake} credits).`);
        return;
      }
    }

    // Deduct
    const updatedGroup = {
      ...activeGroup,
      members: {
        ...activeGroup.members,
        [currentUser.id]: {
          ...activeMemberInfo,
          balance: activeMemberInfo.balance - amt
        }
      }
    };
    await dbWriteGroup(updatedGroup);

    const betsDetails = comboSelections.map(sel => {
      const match = matches.find(m => m.id === sel.matchId)!;
      const odds = sel.outcome === '1' ? match.homeOdds : sel.outcome === 'X' ? match.drawOdds : match.awayOdds;
      return { matchId: sel.matchId, outcome: sel.outcome, odds };
    });

    const newCombo: ComboBet = {
      id: 'combo-' + Math.random().toString(36).substring(2, 9),
      userId: currentUser.id,
      groupId: activeGroupId,
      bets: betsDetails,
      amount: amt,
      status: 'pending',
      pointsWon: 0,
      timestamp: new Date().toISOString(),
      placedInRed: activeMemberInfo.balance <= 0
    };

    await dbWriteBet(newCombo, 'combo');
    
    try {
      const comboMatches = comboSelections.map(sel => {
        const match = matches.find(m => m.id === sel.matchId);
        const predictionText = sel.outcome === '1' ? 'Home' : sel.outcome === 'X' ? 'Draw' : 'Away';
        return match ? `${match.homeTeam} vs ${match.awayTeam} (${predictionText})` : '';
      }).join(', ');
      await writeChatMessage(`${currentUser.username} placed a ${amt} credit 3-Match Combo Bet: ${comboMatches}. 🎯`, 'activity');
    } catch (err) {
      console.error("Failed to post combo chat activity", err);
    }

    setComboSelections([]);
    setComboStake('');
    alert('Combo Bet placed successfully!');
  };

  const handleAddToCombo = (match: Match, outcome: '1' | 'X' | '2') => {
    // Check if match already added
    const existsIndex = comboSelections.findIndex(s => s.matchId === match.id);
    if (existsIndex >= 0) {
      // Update outcome
      const copy = [...comboSelections];
      copy[existsIndex].outcome = outcome;
      setComboSelections(copy);
    } else {
      if (comboSelections.length >= 3) {
        alert('You can only select exactly 3 matches for a Combo Bet.');
        return;
      }
      setComboSelections(prev => [...prev, { matchId: match.id, outcome }]);
    }
  };

  const handleRemoveFromCombo = (matchId: string) => {
    setComboSelections(prev => prev.filter(s => s.matchId !== matchId));
  };

  // --- Friends Bet Autoplacement Simulation ---
  // When advancing day, other members place randomized reasonable wagers.
  const simulateFriendsBets = (dayMatches: Match[], activeGp: Group) => {
    const friendBetsToAdd: SingleBet[] = [];
    const friendDCBetsToAdd: DoubleChanceBet[] = [];
    const friendCombosToAdd: ComboBet[] = [];

    const groupMembersKeys = Object.keys(activeGp.members).filter(uid => uid !== currentUser.id);

    groupMembersKeys.forEach(uid => {
      const mbr = activeGp.members[uid];
      if (mbr.balance < 10) return; // Insufficient to bet

      // Check how many matches this user wants to bet on (e.g. 1 to 3 matches)
      const numBets = Math.min(dayMatches.length, Math.floor(Math.random() * 3) + 1);
      
      // Shuffle day matches
      const shuffled = [...dayMatches].sort(() => 0.5 - Math.random());
      const selected = shuffled.slice(0, numBets);

      // Randomly choose single, double chance, or combo
      const roll = Math.random();
      
      if (roll > 0.85 && selected.length >= 3 && activeGp.allowCombos !== false && activeGp.toggle3MatchBonus) {
        // Place a Combo Bet
        const wager = Math.min(mbr.balance, Math.floor(Math.random() * 40) + 15);
        const comboMatches = selected.slice(0, 3);
        const subBets = comboMatches.map(m => {
          const outcomes: ('1'|'X'|'2')[] = ['1', 'X', '2'];
          const outcome = outcomes[Math.floor(Math.random() * 3)];
          const odds = outcome === '1' ? m.homeOdds : outcome === 'X' ? m.drawOdds : m.awayOdds;
          return { matchId: m.id, outcome, odds };
        });

        // Deduct
        mbr.balance -= wager;

        friendCombosToAdd.push({
          id: 'combo-' + Math.random().toString(36).substring(2, 9),
          userId: uid,
          groupId: activeGp.id,
          bets: subBets,
          amount: wager,
          status: 'pending',
          pointsWon: 0,
          timestamp: new Date().toISOString()
        });

      } else {
        // Place Single or Double chance bets
        selected.forEach(m => {
          if (mbr.balance < 10) return;
          const outcomes: ('1'|'X'|'2')[] = ['1', 'X', '2'];
          const outcome1 = outcomes[Math.floor(Math.random() * 3)];

          // 20% chance to place a Double Chance bet if they have powerups left
          const useDC = Math.random() < 0.2 && mbr.doubleChanceUsed < 2;
          
          if (useDC) {
            const outcome2 = outcomes.filter(o => o !== outcome1)[Math.floor(Math.random() * 2)];
            const wager1 = Math.min(mbr.balance / 2, Math.floor(Math.random() * 30) + 10);
            const wager2 = Math.min(mbr.balance - wager1, Math.floor(Math.random() * 30) + 10);

            mbr.balance -= (wager1 + wager2);
            mbr.doubleChanceUsed += 1;

            friendDCBetsToAdd.push({
              id: 'dc-' + Math.random().toString(36).substring(2, 9),
              userId: uid,
              groupId: activeGp.id,
              matchId: m.id,
              outcome1,
              amount1: wager1,
              outcome2,
              amount2: wager2,
              status: 'pending',
              outcome1Status: 'pending',
              outcome2Status: 'pending',
              pointsWon: 0,
              multiplier: getMatchdayMultiplier(m.matchday),
              timestamp: new Date().toISOString()
            });

          } else {
            // Single Bet
            const wager = Math.min(mbr.balance, Math.floor(Math.random() * 50) + 10);
            
            // Friends powerup usage logic
            let pUp: SingleBet['powerupUsed'] = null;
            const isFinal = m.matchdayName.includes('Final') && !m.matchdayName.includes('Third');

            if (Math.random() < 0.15 && mbr.noLossUsed < 2 && !isFinal) {
              pUp = 'noLoss';
              mbr.noLossUsed += 1;
            } else if (Math.random() < 0.15 && mbr.doublePointsUsed < 2) {
              pUp = 'doublePoints';
              mbr.doublePointsUsed += 1;
            }

            mbr.balance -= wager;

            friendBetsToAdd.push({
              id: 'bet-' + Math.random().toString(36).substring(2, 9),
              userId: uid,
              groupId: activeGp.id,
              matchId: m.id,
              outcome: outcome1,
              amount: wager,
              powerupUsed: pUp,
              status: 'pending',
              pointsWon: 0,
              multiplier: getMatchdayMultiplier(m.matchday),
              timestamp: new Date().toISOString()
            });
          }
        });
      }
    });

    return { friendBetsToAdd, friendDCBetsToAdd, friendCombosToAdd };
  };

  // --- Advance Day Simulation ---
  const handleAdvanceDay = async () => {
    const bounds = getActiveSessionBounds(currentDate, currentTime);
    
    // 1. Get all scheduled matches for the active daily session window (start to end)
    const matchesToResolve = matches.filter(m => {
      const [mYear, mMonth, mDay] = m.date.split('-').map(Number);
      const [mHour, mMinute] = m.kickoffTime.split(':').map(Number);
      const matchDateTime = new Date(mYear, mMonth - 1, mDay, mHour, mMinute);
      return matchDateTime >= bounds.start && matchDateTime < bounds.end && m.status === 'scheduled';
    });
    
    if (matchesToResolve.length === 0) {
      alert("No matches scheduled for today! Advancing date directly.");
      advanceDateOnly();
      return;
    }

    // Automatically simulate friends' bets for today before resolving, if not already placed
    const groupsCopy = [...groups];
    const activeGpIndex = groupsCopy.findIndex(g => g.id === activeGroupId);
    const activeGp = { ...groupsCopy[activeGpIndex] };
    activeGp.members = { ...activeGp.members };
    Object.keys(activeGp.members).forEach(uid => {
      activeGp.members[uid] = { ...activeGp.members[uid] };
    });

    // Calculate and cache the current rankings BEFORE resolving the matches
    const sortedBefore = Object.values(activeGp.members).sort((a, b) => b.balance - a.balance);
    const beforeRankMap: { [userId: string]: number } = {};
    sortedBefore.forEach((mbr, index) => {
      beforeRankMap[mbr.userId] = index + 1; // 1-based rank
    });

    const { friendBetsToAdd, friendDCBetsToAdd, friendCombosToAdd } = simulateFriendsBets(matchesToResolve, activeGp);

    // Post chat activity notifications for simulated friends' bets
    for (const b of friendBetsToAdd) {
      const mbr = activeGp.members[b.userId];
      if (mbr) {
        const match = matches.find(m => m.id === b.matchId);
        const mName = match ? `${match.homeTeam} vs ${match.awayTeam}` : 'Match';
        const selectionText = b.outcome === '1' ? 'Home' : b.outcome === 'X' ? 'Draw' : 'Away';
        const powerupText = b.powerupUsed ? ` using [${b.powerupUsed === 'doublePoints' ? 'Double Returns' : b.powerupUsed === 'noLoss' ? 'No Loss' : b.powerupUsed}] boost` : '';
        await writeChatMessage(`${mbr.username} placed a ${b.amount} credit Single Bet on ${mName} (${selectionText})${powerupText}. 🚀`, 'activity', undefined, b.userId, mbr.username);
      }
    }
    for (const b of friendDCBetsToAdd) {
      const mbr = activeGp.members[b.userId];
      if (mbr) {
        const match = matches.find(m => m.id === b.matchId);
        const mName = match ? `${match.homeTeam} vs ${match.awayTeam}` : 'Match';
        const s1 = b.outcome1 === '1' ? 'Home' : b.outcome1 === 'X' ? 'Draw' : 'Away';
        const s2 = b.outcome2 === '1' ? 'Home' : b.outcome2 === 'X' ? 'Draw' : 'Away';
        const totalStake = b.amount1 + b.amount2;
        await writeChatMessage(`${mbr.username} used [Double Chance] boost! Placed a total of ${totalStake} credits on ${mName} (${s1} for ${b.amount1} & ${s2} for ${b.amount2}). ⚡`, 'activity', undefined, b.userId, mbr.username);
      }
    }
    for (const b of friendCombosToAdd) {
      const mbr = activeGp.members[b.userId];
      if (mbr) {
        const comboMatches = b.bets.map(sb => {
          const match = matches.find(m => m.id === sb.matchId);
          const predictionText = sb.outcome === '1' ? 'Home' : sb.outcome === 'X' ? 'Draw' : 'Away';
          return match ? `${match.homeTeam} vs ${match.awayTeam} (${predictionText})` : '';
        }).join(', ');
        await writeChatMessage(`${mbr.username} placed a ${b.amount} credit 3-Match Combo Bet: ${comboMatches}. 🎯`, 'activity', undefined, b.userId, mbr.username);
      }
    }

    // Concat newly generated bets from friends
    const currentSingles = [...singleBets, ...friendBetsToAdd];
    const currentDCs = [...doubleChanceBets, ...friendDCBetsToAdd];
    const currentCombos = [...comboBets, ...friendCombosToAdd];

    // Try fetching real-life scores from results.json
    let realScores: Record<string, { homeScore: number; awayScore: number; winner?: string | null }> = {};
    try {
      const res = await fetch('/results.json');
      if (res.ok) {
        realScores = await res.json();
      }
    } catch (e) {
      console.warn("Could not fetch results.json, using simulated fallback.", e);
    }

    // 2. Resolve scores of today's matches
    let resolvedMatches = matches.map(m => {
      const [mYear, mMonth, mDay] = m.date.split('-').map(Number);
      const [mHour, mMinute] = m.kickoffTime.split(':').map(Number);
      const matchDateTime = new Date(mYear, mMonth - 1, mDay, mHour, mMinute);
      const isSessionMatch = matchDateTime >= bounds.start && matchDateTime < bounds.end;

      if (isSessionMatch && m.status === 'scheduled') {
        const realScore = realScores[m.id];
        let homeScore = 0;
        let awayScore = 0;
        let winner: string | null = null;
        let result: '1' | 'X' | '2' = 'X';

        if (realScore !== undefined && realScore !== null && realScore.homeScore !== undefined) {
          // Use real-life score from results.json
          homeScore = realScore.homeScore;
          awayScore = realScore.awayScore;
          winner = realScore.winner || null;
          if (homeScore > awayScore) result = '1';
          else if (homeScore === awayScore) result = 'X';
          else result = '2';

          if (m.matchday >= 4 && !winner) {
            if (homeScore > awayScore) winner = m.homeTeam;
            else if (awayScore > homeScore) winner = m.awayTeam;
          }
        } else {
          // Fallback to simulation
          const homeRating = teamRatings[m.homeTeam] || 75;
          const awayRating = teamRatings[m.awayTeam] || 75;
          const ratingDiff = homeRating - awayRating;
          const homeLambda = Math.max(0.5, 1.4 + ratingDiff * 0.04);
          const awayLambda = Math.max(0.5, 1.2 - ratingDiff * 0.04);

          const getGoals = (lambda: number) => {
            let L = Math.exp(-lambda);
            let k = 0;
            let p = 1.0;
            do {
              k++;
              p *= Math.random();
            } while (p > L && k < 8);
            return k - 1;
          };

          homeScore = getGoals(homeLambda);
          awayScore = getGoals(awayLambda);

          if (homeScore > awayScore) result = '1';
          else if (homeScore === awayScore) result = 'X';
          else result = '2';

          if (m.matchday >= 4) {
            if (homeScore > awayScore) winner = m.homeTeam;
            else if (awayScore > homeScore) winner = m.awayTeam;
            else winner = Math.random() < 0.5 ? m.homeTeam : m.awayTeam;
          }
        }

        return {
          ...m,
          status: 'finished' as const,
          homeScore,
          awayScore,
          result,
          winner
        };
      }
      return m;
    });

    // 2b. Check if Group Stage just finished (all m-1 to m-72 status === 'finished')
    const groupStageFinished = resolvedMatches.filter(m => m.matchday <= 3).every(m => m.status === 'finished');
    const r32MatchesUnseeded = isPlaceholder(resolvedMatches.filter(m => m.id === 'm-73')[0]?.homeTeam);

    if (groupStageFinished && r32MatchesUnseeded) {
      const winners: Record<string, string> = {};
      const runnersUp: Record<string, string> = {};

      Object.keys(GROUPS_TEAMS).forEach(gLetter => {
        const groupStandings = calculateGroupStandings(gLetter, GROUPS_TEAMS[gLetter], resolvedMatches);
        winners[gLetter] = groupStandings[0].team;
        runnersUp[gLetter] = groupStandings[1].team;
      });

      const rankedThirds = rankThirdPlaceTeams(GROUPS_TEAMS, resolvedMatches);
      const t = rankedThirds.slice(0, 8).map(x => x.team);

      const seedingMap: { id: string; home: string; away: string }[] = [
        { id: 'm-73', home: runnersUp['A'], away: runnersUp['B'] },
        { id: 'm-74', home: winners['E'], away: t[0] },
        { id: 'm-75', home: winners['F'], away: runnersUp['C'] },
        { id: 'm-76', home: winners['C'], away: runnersUp['F'] },
        { id: 'm-77', home: winners['I'], away: t[1] },
        { id: 'm-78', home: runnersUp['E'], away: runnersUp['I'] },
        { id: 'm-79', home: winners['A'], away: t[2] },
        { id: 'm-80', home: winners['L'], away: t[3] },
        { id: 'm-81', home: winners['D'], away: t[4] },
        { id: 'm-82', home: winners['G'], away: t[5] },
        { id: 'm-83', home: runnersUp['K'], away: runnersUp['L'] },
        { id: 'm-84', home: winners['H'], away: runnersUp['J'] },
        { id: 'm-85', home: winners['B'], away: t[6] },
        { id: 'm-86', home: winners['J'], away: runnersUp['H'] },
        { id: 'm-87', home: winners['K'], away: t[7] },
        { id: 'm-88', home: runnersUp['D'], away: runnersUp['G'] }
      ];

      seedingMap.forEach(s => {
        const mIdx = resolvedMatches.findIndex(m => m.id === s.id);
        if (mIdx !== -1) {
          const odds = getScrapedBaselineOdds(s.home, s.away);
          resolvedMatches[mIdx] = {
            ...resolvedMatches[mIdx],
            homeTeam: s.home,
            awayTeam: s.away,
            ...odds
          };
        }
      });
    }

    // 2c. Progress standard knockout brackets
    resolvedMatches = progressKnockoutRounds(resolvedMatches);

    // Create a results map for fast lookup
    const resultsMap: { [matchId: string]: '1' | 'X' | '2' } = {};
    resolvedMatches.forEach(m => {
      if (m.status === 'finished' && m.result) {
        resultsMap[m.id] = m.result;
      }
    });

    // 3. Resolve all bets for today
    const resolvedSingles = currentSingles.map(bet => {
      const match = resolvedMatches.find(m => m.id === bet.matchId);
      if (bet.groupId === activeGroupId && match && match.status === 'finished' && bet.status === 'pending') {
        let res = resolveSingleBet(bet, resultsMap[bet.matchId], match);
        
        // Halve earnings if placed in red
        if (bet.placedInRed && res.status === 'won') {
          const normalProfit = res.pointsWon - bet.amount;
          const halvedProfit = normalProfit > 0 ? normalProfit / 2 : 0;
          res = {
            ...res,
            pointsWon: Math.round(bet.amount + halvedProfit)
          };
        }

        // Update member budget
        const mbr = activeGp.members[bet.userId];
        if (mbr) {
          mbr.balance += res.pointsWon;
          mbr.totalBetsCount += 1;
          if (res.status === 'won') {
            mbr.correctCount += 1;
          }
          mbr.winRate = Math.round((mbr.correctCount / mbr.totalBetsCount) * 100);
        }

        return {
          ...bet,
          status: res.status,
          pointsWon: res.pointsWon
        };
      }
      return bet;
    });

    const resolvedDCs = currentDCs.map(bet => {
      const match = resolvedMatches.find(m => m.id === bet.matchId);
      if (bet.groupId === activeGroupId && match && match.status === 'finished' && bet.status === 'pending') {
        let res = resolveDoubleChanceBet(bet, resultsMap[bet.matchId], match);
        
        // Halve earnings if placed in red
        if (bet.placedInRed) {
          const totalStake = bet.amount1 + bet.amount2;
          const normalProfit = res.pointsWon - totalStake;
          const halvedProfit = normalProfit > 0 ? normalProfit / 2 : 0;
          res = {
            ...res,
            pointsWon: Math.round(res.pointsWon <= totalStake ? res.pointsWon : totalStake + halvedProfit)
          };
        }

        // Update member budget
        const mbr = activeGp.members[bet.userId];
        if (mbr) {
          mbr.balance += res.pointsWon;
          mbr.totalBetsCount += 1;
          const wonAny = res.outcome1Status === 'won' || res.outcome2Status === 'won';
          if (wonAny) {
            mbr.correctCount += 1;
          }
          mbr.winRate = Math.round((mbr.correctCount / mbr.totalBetsCount) * 100);
        }

        return {
          ...bet,
          status: 'resolved' as const,
          outcome1Status: res.outcome1Status,
          outcome2Status: res.outcome2Status,
          pointsWon: res.pointsWon
        };
      }
      return bet;
    });

    const resolvedCombos = currentCombos.map(bet => {
      // Check if all matches in this combo belong to this day (or completed today)
      const allComboMatchesToday = bet.bets.every(b => {
        const match = resolvedMatches.find(m => m.id === b.matchId);
        return match && match.status === 'finished';
      });

      if (bet.groupId === activeGroupId && allComboMatchesToday && bet.status === 'pending') {
        // Compile all results
        const comboResults: { [matchId: string]: '1' | 'X' | '2' | null } = {};
        resolvedMatches.forEach(m => {
          comboResults[m.id] = m.result;
        });

        let res = resolveComboBet(bet, comboResults, resolvedMatches, activeGp.toggle3MatchBonus);

        // Halve earnings if placed in red
        if (bet.placedInRed && res.status === 'won') {
          const normalProfit = res.pointsWon - bet.amount;
          const halvedProfit = normalProfit > 0 ? normalProfit / 2 : 0;
          res = {
            ...res,
            pointsWon: Math.round(bet.amount + halvedProfit)
          };
        }

        // Update member budget
        const mbr = activeGp.members[bet.userId];
        if (mbr) {
          mbr.balance += res.pointsWon;
          mbr.totalBetsCount += 1;
          if (res.status === 'won') {
            mbr.correctCount += 3; // award 3 correct predictions
          }
          mbr.winRate = Math.round((mbr.correctCount / mbr.totalBetsCount) * 100);
        }

        return {
          ...bet,
          status: res.status,
          pointsWon: res.pointsWon
        };
      }
      return bet;
    });

    // Write settlement activity logs for today's resolved bets
    for (let i = 0; i < currentSingles.length; i++) {
      const originalBet = currentSingles[i];
      const resolvedBet = resolvedSingles[i];
      if (originalBet.groupId === activeGroupId && originalBet.status === 'pending' && resolvedBet.status !== 'pending') {
        const mbr = activeGp.members[originalBet.userId];
        const match = resolvedMatches.find(m => m.id === originalBet.matchId);
        const mName = match ? `${match.homeTeam} vs ${match.awayTeam}` : 'Match';
        const selectionText = originalBet.outcome === '1' ? 'Home' : originalBet.outcome === 'X' ? 'Draw' : 'Away';
        const netChange = resolvedBet.pointsWon - originalBet.amount;
        const uName = mbr?.username || 'User';

        if (resolvedBet.status === 'noLossReturned') {
          await writeChatMessage(`${uName}'s Single Bet on ${mName} (${selectionText}) was protected by No Loss boost. Returned stake of ${originalBet.amount} credits. 🛡️`, 'activity', undefined, originalBet.userId, uName);
        } else {
          const gainText = netChange > 0 ? `won! Gained +${netChange.toFixed(0)} credits. 🎉` : `lost. Lost -${originalBet.amount} credits. ❌`;
          await writeChatMessage(`${uName}'s Single Bet on ${mName} (${selectionText}) ${gainText}`, 'activity', undefined, originalBet.userId, uName);
        }
      }
    }

    for (let i = 0; i < currentDCs.length; i++) {
      const originalBet = currentDCs[i];
      const resolvedBet = resolvedDCs[i];
      if (originalBet.groupId === activeGroupId && originalBet.status === 'pending' && resolvedBet.status !== 'pending') {
        const mbr = activeGp.members[originalBet.userId];
        const match = resolvedMatches.find(m => m.id === originalBet.matchId);
        const mName = match ? `${match.homeTeam} vs ${match.awayTeam}` : 'Match';
        const totalStake = originalBet.amount1 + originalBet.amount2;
        const netChange = resolvedBet.pointsWon - totalStake;
        const uName = mbr?.username || 'User';
        const wonAny = resolvedBet.outcome1Status === 'won' || resolvedBet.outcome2Status === 'won';

        const gainText = wonAny ? `won! Gained +${netChange.toFixed(0)} credits. 🎉` : `lost. Lost -${totalStake} credits. ❌`;
        await writeChatMessage(`${uName}'s Double Chance Bet on ${mName} ${gainText}`, 'activity', undefined, originalBet.userId, uName);
      }
    }

    for (let i = 0; i < currentCombos.length; i++) {
      const originalBet = currentCombos[i];
      const resolvedBet = resolvedCombos[i];
      if (originalBet.groupId === activeGroupId && originalBet.status === 'pending' && resolvedBet.status !== 'pending') {
        const mbr = activeGp.members[originalBet.userId];
        const netChange = resolvedBet.pointsWon - originalBet.amount;
        const uName = mbr?.username || 'User';

        const gainText = resolvedBet.status === 'won' ? `won! Gained +${netChange.toFixed(0)} credits. 🎉` : `lost. Lost -${originalBet.amount} credits. ❌`;
        await writeChatMessage(`${uName}'s 3-Match Combo Bet ${gainText}`, 'activity', undefined, originalBet.userId, uName);
      }
    }

    // 3b. Check Tournament Winner Prediction Payout
    const finalMatch = matchesToResolve.find(m => m.id === 'm-104');
    if (finalMatch) {
      const resolvedFinal = resolvedMatches.find(rm => rm.id === 'm-104');
      if (resolvedFinal && resolvedFinal.status === 'finished' && resolvedFinal.winner) {
        const tournamentWinner = resolvedFinal.winner;
        for (const uid of Object.keys(activeGp.members)) {
          const mbr = activeGp.members[uid];
          if (mbr && mbr.winnerPrediction && mbr.winnerPrediction.trim().toLowerCase() === tournamentWinner.trim().toLowerCase()) {
            const predictionCount = mbr.winnerPredictionCount || 1;
            const factor = Math.pow(0.5, predictionCount - 1);
            const payout = Math.round(activeGp.startingBudget * factor);
            mbr.balance += payout;
            await writeChatMessage(`🏆 TOURNAMENT WINNER REVEALED: ${mbr.username} predicted ${tournamentWinner} correctly! Gained +${payout} credits (Prediction #${predictionCount})! 🥳`, 'activity', undefined, uid, mbr.username);
          }
        }
      }
    }

    // 4. Matchday MVP Check (Check if the active Matchday is fully resolved)
    // GW1, GW2, GW3 and all individual knockout rounds except for the final.
    // If the simulated day finishes the matchday, calculate MVP.
    const activeMatchday = matchesToResolve[0].matchday;
    const matchdayMatches = resolvedMatches.filter(m => m.matchday === activeMatchday);
    const allMatchdayResolved = matchdayMatches.every(m => m.status === 'finished');

    if (allMatchdayResolved && activeGp.toggleMdBonus && activeMatchday < 8) {
      const membersArray = Object.values(activeGp.members);
      const mvpRes = resolveMatchdayMVP(
        activeMatchday,
        membersArray,
        resolvedSingles,
        resolvedDCs,
        resolvedCombos,
        resolvedMatches
      );

      if (mvpRes.mvpUserIds.length > 0 && mvpRes.maxCorrect > 0) {
        mvpRes.mvpUserIds.forEach(mvpUid => {
          const mbr = activeGp.members[mvpUid];
          if (mbr) {
            mbr.balance += activeGp.mdBonusPoints;
          }
        });
        alert(`Matchday ${activeMatchday} MVP: ${mvpRes.mvpUserIds.map(uid => activeGp.members[uid]?.username).join(', ')} got the most predictions correct (${mvpRes.maxCorrect}/${matchdayMatches.length})! Awarded ${activeGp.mdBonusPoints} bonus credits!`);
      }
    }

    // Update group object in copy
    groupsCopy[activeGpIndex] = activeGp;

    // 5. Generate Yesterday Recap Entry before moving date
    const dayRecap: YesterdayRecap = {
      groupId: activeGroupId,
      date: currentDate,
      matchResults: matchesToResolve.map(m => {
        const fullMatch = resolvedMatches.find(rm => rm.id === m.id)!;
        return {
          matchId: m.id,
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          score: `${fullMatch.homeScore}-${fullMatch.awayScore}`,
          result: fullMatch.result!
        };
      }),
      memberRecaps: Object.values(activeGp.members).map(m => {
        // Collect single bets from this user on today's matches
        const singles = resolvedSingles.filter(sb => {
          if (sb.userId !== m.userId || sb.groupId !== activeGroupId) return false;
          const orig = currentSingles.find(os => os.id === sb.id);
          return orig && orig.status === 'pending' && sb.status !== 'pending';
        });
        const dcs = resolvedDCs.filter(db => {
          if (db.userId !== m.userId || db.groupId !== activeGroupId) return false;
          const orig = currentDCs.find(od => od.id === db.id);
          return orig && orig.status === 'pending' && db.status !== 'pending';
        });
        
        // Combo bets resolved today
        const combos = resolvedCombos.filter(cb => {
          if (cb.userId !== m.userId || cb.groupId !== activeGroupId) return false;
          const orig = currentCombos.find(oc => oc.id === cb.id);
          return orig && orig.status === 'pending' && cb.status !== 'pending';
        });

        const betsPlacedDetails = [
          ...singles.map(s => {
            const mData = resolvedMatches.find(rm => rm.id === s.matchId)!;
            const isWon = s.status === 'won';
            const isRet = s.status === 'noLossReturned';
            return {
              matchId: s.matchId,
              matchName: `${mData.homeTeam} vs ${mData.awayTeam}`,
              prediction: s.outcome === '1' ? 'Home' : s.outcome === 'X' ? 'Draw' : 'Away',
              amount: `${s.amount} pts`,
              powerup: s.powerupUsed,
              status: s.status === 'won' ? 'won' as const : s.status === 'noLossReturned' ? 'noLossReturned' as const : 'lost' as const,
              netPoints: isWon ? s.pointsWon - s.amount : isRet ? 0 : -s.amount
            };
          }),
          ...dcs.map(d => {
            const mData = resolvedMatches.find(rm => rm.id === d.matchId)!;
            const outcomeText = `${d.outcome1 === '1' ? 'Home' : d.outcome1 === 'X' ? 'Draw' : 'Away'} & ${d.outcome2 === '1' ? 'Home' : d.outcome2 === 'X' ? 'Draw' : 'Away'}`;
            const totalBet = d.amount1 + d.amount2;
            const wonAny = d.outcome1Status === 'won' || d.outcome2Status === 'won';
            return {
              matchId: d.matchId,
              matchName: `${mData.homeTeam} vs ${mData.awayTeam}`,
              prediction: outcomeText,
              amount: `${d.amount1} + ${d.amount2} pts`,
              powerup: 'doubleChance',
              status: wonAny ? 'won' as const : 'lost' as const,
              netPoints: d.pointsWon - totalBet
            };
          })
        ];

        const comboDetails = combos.map(c => {
          const names = c.bets.map(b => {
            const md = resolvedMatches.find(rm => rm.id === b.matchId)!;
            return `${md.homeTeam} vs ${md.awayTeam}`;
          });
          const predictions = c.bets.map(b => b.outcome === '1' ? 'Home' : b.outcome === 'X' ? 'Draw' : 'Away');
          const isWon = c.status === 'won';
          return {
            matches: names,
            predictions,
            amount: c.amount,
            status: c.status === 'won' ? 'won' as const : 'lost' as const,
            netPoints: isWon ? c.pointsWon - c.amount : -c.amount
          };
        });

        const totalNetChange = betsPlacedDetails.reduce((sum, item) => sum + item.netPoints, 0) +
                               comboDetails.reduce((sum, item) => sum + item.netPoints, 0);

        return {
          userId: m.userId,
          username: m.username,
          betsPlaced: betsPlacedDetails,
          comboBets: comboDetails,
          netChange: totalNetChange
        };
      })
    };

    // Reset daily ads watched count for all league members when advancing the calendar day
    Object.keys(activeGp.members).forEach(uid => {
      activeGp.members[uid].dailyAdsWatched = 0;
      activeGp.members[uid].previousRank = beforeRankMap[uid] ?? 1;
    });

    // Save state changes
    await dbResolveDailySession(
      resolvedMatches,
      resolvedSingles,
      resolvedDCs,
      resolvedCombos,
      activeGp,
      dayRecap
    );

    // 6. Advance simulated calendar date & reset time to 8 AM
    await advanceDateOnly();
  };

  const advanceDateOnly = async () => {
    // Advance simulated date
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 1);
    
    // Jump over gaps between group and knockout stage if any
    let nextDateStr = d.toISOString().split('T')[0];
    if (nextDateStr === '2026-06-26') nextDateStr = '2026-06-28'; // Jump to R32
    if (nextDateStr === '2026-07-02') nextDateStr = '2026-07-04'; // Jump to R16
    if (nextDateStr === '2026-07-08') nextDateStr = '2026-07-10'; // Jump to QF
    if (nextDateStr === '2026-07-13') nextDateStr = '2026-07-15'; // Jump to SF
    if (nextDateStr === '2026-07-17') nextDateStr = '2026-07-18'; // Jump to Third Place
    
    if (d.getFullYear() > 2026 || (d.getMonth() === 6 && d.getDate() > 20)) {
      alert("Tournament has finished! Reset app data to restart.");
      return;
    }

    if (fbInstance) {
      await setDoc(doc(fbInstance.db, 'settings', 'state'), { currentDate: nextDateStr, currentTime: '08:00' });
    } else {
      setCurrentDate(nextDateStr);
      setCurrentTime('08:00'); // Sync occurs daily at 8:00 AM
    }
    setShowBannerAd(true); // Restore the banner ad for the new day
    setActiveTab('recap'); // Automatically show yesterday's recap
    triggerOddsSync(nextDateStr);
  };

  // --- Reset All Application Data ---
  const handleResetData = async () => {
    if (confirm("Are you sure you want to reset all game data, balances, and history?")) {
      if (fbInstance) {
        try {
          // Reset clock state on Firestore
          await setDoc(doc(fbInstance.db, 'settings', 'state'), { currentDate: '2026-06-11', currentTime: '12:00' });
          
          // Re-upload default matches to Firestore
          const initial = getInitialMatches();
          for (const m of initial) {
            await setDoc(doc(fbInstance.db, 'matches', m.id), m);
          }
          
          // Reset default group 'group-1' members
          const defaultGroup: Group = {
            id: 'group-1',
            name: 'Qatar-2022 Rematch League',
            inviteCode: 'FIFA26',
            adminId: currentUser.id,
            startingBudget: 500,
            toggle3MatchBonus: true,
            toggleMdBonus: true,
            mdBonusPoints: 100,
            allowCombos: true,
            allowOverdraft: true,
            seasonStarted: false,
            members: {
              [currentUser.id]: {
                userId: currentUser.id,
                username: currentUser.username,
                balance: 500,
                correctCount: 0,
                totalBetsCount: 0,
                winRate: 0,
                noLossUsed: 0,
                doubleChanceUsed: 0,
                doublePointsUsed: 0
              }
            }
          };
          await setDoc(doc(fbInstance.db, 'groups', 'group-1'), defaultGroup);
          
          // Delete all bets and recaps
          for (const b of singleBets) {
            try { await deleteDoc(doc(fbInstance.db, 'bets', b.id)); } catch(e){}
          }
          for (const b of doubleChanceBets) {
            try { await deleteDoc(doc(fbInstance.db, 'bets', b.id)); } catch(e){}
          }
          for (const b of comboBets) {
            try { await deleteDoc(doc(fbInstance.db, 'bets', b.id)); } catch(e){}
          }
          for (const r of recaps) {
            try { await deleteDoc(doc(fbInstance.db, 'recaps', `${r.groupId}_${r.date}`)); } catch(e){}
          }
        } catch (e: any) {
          alert("Error resetting online database: " + e.message);
        }
      }
      
      localStorage.removeItem('wc_users');
      localStorage.removeItem('wc_current_user');
      localStorage.removeItem('wc_groups');
      localStorage.removeItem('wc_active_group_id');
      localStorage.removeItem('wc_matches');
      localStorage.removeItem('wc_single_bets');
      localStorage.removeItem('wc_double_chance_bets');
      localStorage.removeItem('wc_combo_bets');
      localStorage.removeItem('wc_recaps');
      localStorage.removeItem('wc_sim_date');
      localStorage.removeItem('wc_sim_time');
      localStorage.removeItem('wc_firebase_config');
      
      // Force reload to pick up seeded initial states
      window.location.href = window.location.pathname;
    }
  };

  // --- Leaderboard Calculation ---
  const sortedMembers = useMemo(() => {
    if (!activeGroup) return [];
    return Object.values(activeGroup.members).sort((a, b) => b.balance - a.balance);
  }, [activeGroup]);

  const myRank = useMemo(() => {
    if (!activeGroup || !currentUser) return null;
    const index = sortedMembers.findIndex(m => m.userId === currentUser.id);
    return index !== -1 ? index + 1 : null;
  }, [sortedMembers, currentUser]);

  const mySingles = useMemo(() => {
    return singleBets.filter(b => b.userId === currentUser.id && b.groupId === activeGroupId);
  }, [singleBets, currentUser, activeGroupId]);

  const myDCs = useMemo(() => {
    return doubleChanceBets.filter(b => b.userId === currentUser.id && b.groupId === activeGroupId);
  }, [doubleChanceBets, currentUser, activeGroupId]);

  const myCombos = useMemo(() => {
    return comboBets.filter(b => b.userId === currentUser.id && b.groupId === activeGroupId);
  }, [comboBets, currentUser, activeGroupId]);

  const myAllBetsCombined = useMemo(() => {
    const list: any[] = [];
    mySingles.forEach(b => list.push({ ...b, betType: 'single' }));
    myDCs.forEach(b => list.push({ ...b, betType: 'doubleChance' }));
    myCombos.forEach(b => list.push({ ...b, betType: 'combo' }));
    return list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [mySingles, myDCs, myCombos]);

  const balanceProgression = useMemo(() => {
    if (!activeGroup) return [];
    const groupRecaps = recaps
      .filter(r => r.groupId === activeGroupId)
      .sort((a, b) => a.date.localeCompare(b.date));

    let currentBal = activeGroup.startingBudget;
    const progression = [{ date: 'Start', balance: currentBal }];

    groupRecaps.forEach(r => {
      const mRecap = r.memberRecaps.find(mr => mr.userId === currentUser.id);
      if (mRecap) {
        currentBal += mRecap.netChange;
        progression.push({ date: r.date, balance: currentBal });
      }
    });
    return progression;
  }, [recaps, activeGroup, activeGroupId, currentUser]);

  const bettingStats = useMemo(() => {
    const userSingles = singleBets.filter(b => b.userId === currentUser.id && b.groupId === activeGroupId);
    const userDCs = doubleChanceBets.filter(b => b.userId === currentUser.id && b.groupId === activeGroupId);
    const userCombos = comboBets.filter(b => b.userId === currentUser.id && b.groupId === activeGroupId);

    const singlesWon = userSingles.filter(b => b.status === 'won').length;
    const singlesResolved = userSingles.filter(b => b.status !== 'pending').length;

    const dcsWon = userDCs.filter(b => b.status === 'resolved' && (b.outcome1Status === 'won' || b.outcome2Status === 'won')).length;
    const dcsResolved = userDCs.filter(b => b.status !== 'pending').length;

    const combosWon = userCombos.filter(b => b.status === 'won').length;
    const combosResolved = userCombos.filter(b => b.status !== 'pending').length;

    const noLossBets = userSingles.filter(b => b.powerupUsed === 'noLoss');
    const noLossWon = noLossBets.filter(b => b.status === 'won').length;
    const noLossResolved = noLossBets.filter(b => b.status !== 'pending').length;

    const doublePointsBets = userSingles.filter(b => b.powerupUsed === 'doublePoints');
    const doublePointsWon = doublePointsBets.filter(b => b.status === 'won').length;
    const doublePointsResolved = doublePointsBets.filter(b => b.status !== 'pending').length;

    const doubleChanceBetsCount = userDCs.length;
    const doubleChanceWonCount = dcsWon;
    const doubleChanceResolvedCount = dcsResolved;

    return {
      singles: { won: singlesWon, resolved: singlesResolved, pct: singlesResolved ? Math.round((singlesWon / singlesResolved) * 100) : 0 },
      dcs: { won: dcsWon, resolved: dcsResolved, pct: dcsResolved ? Math.round((dcsWon / dcsResolved) * 100) : 0 },
      combos: { won: combosWon, resolved: combosResolved, pct: combosResolved ? Math.round((combosWon / combosResolved) * 100) : 0 },
      boosts: {
        noLoss: { won: noLossWon, resolved: noLossResolved, pct: noLossResolved ? Math.round((noLossWon / noLossResolved) * 100) : 0, total: noLossBets.length },
        doublePoints: { won: doublePointsWon, resolved: doublePointsResolved, pct: doublePointsResolved ? Math.round((doublePointsWon / doublePointsResolved) * 100) : 0, total: doublePointsBets.length },
        doubleChance: { won: doubleChanceWonCount, resolved: doubleChanceResolvedCount, pct: doubleChanceResolvedCount ? Math.round((doubleChanceWonCount / doubleChanceResolvedCount) * 100) : 0, total: doubleChanceBetsCount }
      }
    };
  }, [singleBets, doubleChanceBets, comboBets, currentUser, activeGroupId]);

  // --- Third Place Teams ranking selectors ---
  const rankedThirdPlaceList = useMemo(() => {
    return rankThirdPlaceTeams(GROUPS_TEAMS, matches);
  }, [matches]);

  const top8ThirdPlaceTeams = useMemo(() => {
    return new Set(rankedThirdPlaceList.slice(0, 8).map(t => t.team));
  }, [rankedThirdPlaceList]);

  // --- Team strengths helper for listing ratings ---
  const teamRatings: { [team: string]: number } = {
    Argentina: 95, France: 94, Brazil: 93, Spain: 92, England: 92,
    Portugal: 90, Germany: 89, Netherlands: 88, Belgium: 87, Italy: 87,
    Croatia: 86, Uruguay: 87, USA: 83, Mexico: 82, Morocco: 86,
    Senegal: 82, Japan: 83, 'South Korea': 81, Canada: 78, Colombia: 85,
    Ecuador: 80, Switzerland: 81, Denmark: 81, Sweden: 80, Poland: 79,
    Nigeria: 79, Cameroon: 78, Egypt: 79, 'Saudi Arabia': 74, Australia: 78,
    Iran: 76, 'South Africa': 75, 'New Zealand': 65, 'Costa Rica': 74,
    Panama: 73, Jamaica: 73, Tunisia: 76, Algeria: 78, Austria: 80,
    Turkey: 81, Chile: 78, Peru: 76, Wales: 78, Ukraine: 80,
    Scotland: 77, Ghana: 76, 'Ivory Coast': 80, Qatar: 72
  };

  const getMemberHistory = (userId: string) => {
    const memberSingles = singleBets.filter(b => b.userId === userId && b.groupId === activeGroupId && b.status !== 'pending');
    const memberDCs = doubleChanceBets.filter(b => b.userId === userId && b.groupId === activeGroupId && b.status !== 'pending');
    const memberCombos = comboBets.filter(b => b.userId === userId && b.groupId === activeGroupId && b.status !== 'pending');

    const winsList: any[] = [];
    const lossesList: any[] = [];
    let totalWon = 0;
    let totalLost = 0;

    // Process Singles
    memberSingles.forEach(b => {
      const match = matches.find(m => m.id === b.matchId);
      const matchName = match ? `${match.homeTeam} vs ${match.awayTeam}` : `Match ${b.matchId}`;
      const odds = b.outcome === '1' ? match?.homeOdds : b.outcome === 'X' ? match?.drawOdds : match?.awayOdds;
      
      if (b.status === 'won') {
        const netGain = b.pointsWon - b.amount;
        winsList.push({
          id: b.id,
          type: 'Single',
          details: `${matchName} (${b.outcome})`,
          odds: odds || 1,
          stake: b.amount,
          net: netGain,
          returned: b.pointsWon
        });
        totalWon += netGain;
      } else if (b.status === 'lost') {
        lossesList.push({
          id: b.id,
          type: 'Single',
          details: `${matchName} (${b.outcome})`,
          odds: odds || 1,
          stake: b.amount,
          net: -b.amount
        });
        totalLost += b.amount;
      }
    });

    // Process Double Chance
    memberDCs.forEach(b => {
      const match = matches.find(m => m.id === b.matchId);
      const matchName = match ? `${match.homeTeam} vs ${match.awayTeam}` : `Match ${b.matchId}`;
      
      const totalStake = b.amount1 + b.amount2;
      const net = b.pointsWon - totalStake;
      
      if (b.pointsWon > 0) {
        winsList.push({
          id: b.id,
          type: 'Double Chance',
          details: `${matchName} (${b.outcome1} & ${b.outcome2})`,
          odds: b.multiplier,
          stake: totalStake,
          net: net,
          returned: b.pointsWon
        });
        if (net > 0) totalWon += net;
        else totalLost += Math.abs(net);
      } else {
        lossesList.push({
          id: b.id,
          type: 'Double Chance',
          details: `${matchName} (${b.outcome1} & ${b.outcome2})`,
          odds: b.multiplier,
          stake: totalStake,
          net: -totalStake
        });
        totalLost += totalStake;
      }
    });

    // Process Combos
    memberCombos.forEach(b => {
      const details = b.bets.map(sb => {
        const match = matches.find(m => m.id === sb.matchId);
        return match ? `${match.homeTeam} (${sb.outcome})` : sb.matchId;
      }).join(', ');

      if (b.status === 'won') {
        const netGain = b.pointsWon - b.amount;
        winsList.push({
          id: b.id,
          type: 'Combo',
          details: `3-Match Combo: ${details}`,
          odds: b.pointsWon / b.amount,
          stake: b.amount,
          net: netGain,
          returned: b.pointsWon
        });
        totalWon += netGain;
      } else if (b.status === 'lost') {
        lossesList.push({
          id: b.id,
          type: 'Combo',
          details: `3-Match Combo: ${details}`,
          odds: 1,
          stake: b.amount,
          net: -b.amount
        });
        totalLost += b.amount;
      }
    });

    return {
      wins: winsList,
      losses: lossesList,
      totalWon,
      totalLost
    };
  };

  const renderMeSectionCard = () => {
    if (!activeMemberInfo) return null;
    return (
      <div style={{
        padding: '16px',
        background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-sidebar) 100%)',
        border: '1px solid rgba(255, 215, 0, 0.25)', // slight gold border tint
        borderRadius: '16px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        {/* Header info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: '800',
            fontSize: '18px',
            boxShadow: '0 0 12px rgba(var(--color-primary-rgb), 0.4)'
          }}>
            {currentUser.avatarUrl}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '11px', color: 'var(--color-primary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Active Player
            </div>
            <div style={{ fontWeight: '700', fontSize: '16px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#fff' }}>
              {currentUser.username}
            </div>
          </div>
        </div>

        {/* Prominent Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {/* Points Box */}
          <div 
            onClick={() => {
              setActiveTab('history');
              if (layoutMode === 'mobile') setShowMobileSidebar(false);
            }}
            style={{ 
              background: 'rgba(255, 255, 255, 0.03)', 
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
            title="View your entire betting history"
          >
            <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: '600' }}>
              Balance
            </span>
            <span className="text-gold" style={{ fontSize: '20px', fontWeight: '800', marginTop: '4px' }}>
              {activeMemberInfo?.balance ?? 0}
            </span>
            <span style={{ fontSize: '9px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              credits
            </span>
          </div>

          {/* Rank Box */}
          <div 
            onClick={() => {
              setActiveTab('leaderboard');
              if (layoutMode === 'mobile') setShowMobileSidebar(false);
            }}
            style={{ 
              background: 'rgba(255, 255, 255, 0.03)', 
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
            title="View league leaderboard standings"
          >
            <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: '600' }}>
              Standing
            </span>
            <span style={{ fontSize: '20px', fontWeight: '800', color: '#fff', marginTop: '4px' }}>
              #{myRank ?? '-'}
            </span>
            <span style={{ fontSize: '9px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              of {sortedMembers.length} players
            </span>
          </div>
        </div>

        {/* Rank Change / Indicator */}
        {myRank !== null && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            paddingTop: '12px',
            marginTop: '-4px'
          }}>
            {(() => {
              if (!activeMemberInfo) return null;
              const prevRank = activeMemberInfo.previousRank;
              if (prevRank === undefined || prevRank === null) {
                return (
                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                    <span>•</span> New League
                  </span>
                );
              }

              const change = prevRank - myRank;
              if (change > 0) {
                return (
                  <span style={{ 
                    fontSize: '11px', 
                    color: '#10b981', // green
                    fontWeight: '700',
                    background: 'rgba(16, 185, 129, 0.1)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '2px'
                  }}>
                    ▲ Gained {change} {change === 1 ? 'spot' : 'spots'}
                  </span>
                );
              } else if (change < 0) {
                return (
                  <span style={{ 
                    fontSize: '11px', 
                    color: '#ef4444', // red
                    fontWeight: '700',
                    background: 'rgba(239, 68, 68, 0.1)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '2px'
                  }}>
                    ▼ Lost {Math.abs(change)} {Math.abs(change) === 1 ? 'spot' : 'spots'}
                  </span>
                );
              } else {
                return (
                  <span style={{ 
                    fontSize: '11px', 
                    color: 'var(--color-text-muted)',
                    fontWeight: '500',
                    background: 'rgba(255, 255, 255, 0.05)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '2px'
                  }}>
                    ▬ No change
                  </span>
                );
              }
            })()}
          </div>
        )}
      </div>
    );
  };

  return (
    <div 
      className={`app-container ${layoutMode === 'mobile' ? 'mobile-mode' : ''}`} 
      style={
        layoutMode === 'mobile' 
          ? { 
              gridTemplateColumns: '1fr', 
              maxWidth: '480px', 
              margin: '0 auto', 
              position: 'relative', 
              borderLeft: '1px solid var(--border-color)', 
              borderRight: '1px solid var(--border-color)', 
              background: 'var(--bg-main)', 
              boxShadow: '0 0 50px rgba(0,0,0,0.6)',
              overflow: 'hidden',
              height: '100vh'
            } 
          : {}
      }
    >
      {layoutMode === 'mobile' && showMobileSidebar && (
        <div 
          onClick={() => setShowMobileSidebar(false)}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            zIndex: 9998
          }}
        />
      )}
      
      {/* --- SIDEBAR: Profile & Groups --- */}
      <aside style={
        layoutMode === 'mobile' 
          ? {
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: '260px',
              zIndex: 9999,
              transform: showMobileSidebar ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              background: 'var(--bg-sidebar)',
              borderRight: '1px solid var(--border-color)',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
              boxShadow: showMobileSidebar ? '10px 0 30px rgba(0,0,0,0.5)' : 'none',
              overflowY: 'auto'
            }
          : {
              background: 'var(--bg-sidebar)',
              borderRight: '1px solid var(--border-color)',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
              height: '100vh',
              position: 'sticky',
              top: 0,
              overflowY: 'auto'
            }
      }>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Trophy style={{ color: 'var(--color-primary)', width: '32px', height: '32px' }} />
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: '800', lineHeight: 1.1 }}>
              WORLD CUP <span style={{ color: 'var(--color-primary)' }}>2026</span>
            </h1>
            <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', letterSpacing: '1px', textTransform: 'uppercase' }}>
              Predictions League
            </span>
          </div>
        </div>

        {/* User profile card & account mock switcher */}
        {layoutMode === 'mobile' && renderMeSectionCard()}

        {/* Logout button (for logged-in online accounts) */}
        {fbInstance && isOnlineLoggedIn && (
          <button
            onClick={async () => {
              try {
                await logOutUser(fbInstance.auth);
                alert("Logged out successfully!");
              } catch (e: any) {
                alert("Logout failed: " + e.message);
              }
            }}
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: '#ef4444',
              borderRadius: '8px',
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
              width: '100%',
              textAlign: 'center',
              transition: 'background 0.2s',
              marginTop: '-12px'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)' }}
          >
            Log Out Account
          </button>
        )}

        {/* Quick Account Switcher for Simulation Testing */}
        {!isOnlineLoggedIn && (
          <div className="glass-panel" style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '4px', background: 'rgba(255,255,255,0.015)', marginTop: '-12px' }}>
            <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', display: 'block' }}>
              Switch Mock Account (Testing):
            </label>
            <select
              value={currentUser.id}
              onChange={(e) => {
                const u = users.find(usr => usr.id === e.target.value)!;
                setCurrentUser(u);
              }}
              style={{ width: '100%', fontSize: '12px', padding: '6px', background: 'rgba(0,0,0,0.4)', borderColor: 'var(--border-color)', borderRadius: '6px' }}
            >
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.username} {u.id === 'user-1' ? '(Admin)' : '(Friend)'}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* User's Available Power-ups Details */}
        {activeMemberInfo && (
          <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--bg-card)' }}>
            <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              My Power-Ups & Ads
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px' }}>
              {/* No Loss Power-up */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--color-text-secondary)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Shield size={12} style={{ color: 'var(--color-info)' }} /> No Loss (Insurance)
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: '600' }}>
                    {2 + (activeMemberInfo.extraNoLossEarned ? 1 : 0) - activeMemberInfo.noLossUsed}/{2 + (activeMemberInfo.extraNoLossEarned ? 1 : 0)} left
                  </span>
                  {!activeMemberInfo.extraNoLossEarned && (
                    <button
                      onClick={() => watchExtraBoostAd('noLoss')}
                      style={{
                        background: 'rgba(var(--color-primary-rgb), 0.1)',
                        border: '1px solid rgba(var(--color-primary-rgb), 0.25)',
                        borderRadius: '4px',
                        padding: '2px 4px',
                        fontSize: '9px',
                        color: 'var(--color-info)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px'
                      }}
                      title="Watch 1 min ad to earn +1 No Loss charge"
                    >
                      +1 📺
                    </button>
                  )}
                </div>
              </div>

              {/* Double Chance Power-up */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--color-text-secondary)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Users size={12} style={{ color: 'var(--color-secondary)' }} /> Double Chance
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: '600' }}>
                    {2 + (activeMemberInfo.extraDoubleChanceEarned ? 1 : 0) - activeMemberInfo.doubleChanceUsed}/{2 + (activeMemberInfo.extraDoubleChanceEarned ? 1 : 0)} left
                  </span>
                  {!activeMemberInfo.extraDoubleChanceEarned && (
                    <button
                      onClick={() => watchExtraBoostAd('doubleChance')}
                      style={{
                        background: 'rgba(0, 199, 82, 0.1)',
                        border: '1px solid rgba(0, 199, 82, 0.25)',
                        borderRadius: '4px',
                        padding: '2px 4px',
                        fontSize: '9px',
                        color: 'var(--color-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px'
                      }}
                      title="Watch 1 min ad to earn +1 Double Chance charge"
                    >
                      +1 📺
                    </button>
                  )}
                </div>
              </div>

              {/* Double Returns Power-up */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--color-text-secondary)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Zap size={12} style={{ color: 'var(--color-warning)' }} /> Double Returns (2x)
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: '600' }}>
                    {2 + (activeMemberInfo.extraDoublePointsEarned ? 1 : 0) - activeMemberInfo.doublePointsUsed}/{2 + (activeMemberInfo.extraDoublePointsEarned ? 1 : 0)} left
                  </span>
                  {!activeMemberInfo.extraDoublePointsEarned && (
                    <button
                      onClick={() => watchExtraBoostAd('doublePoints')}
                      style={{
                        background: 'rgba(255, 158, 129, 0.1)',
                        border: '1px solid rgba(255, 158, 129, 0.25)',
                        borderRadius: '4px',
                        padding: '2px 4px',
                        fontSize: '9px',
                        color: 'var(--color-warning)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px'
                      }}
                      title="Watch 1 min ad to earn +1 Double Returns charge"
                    >
                      +1 📺
                    </button>
                  )}
                </div>
              </div>

              {/* Sponsored Daily Ad Rewards */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px', marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-text-muted)', fontWeight: '700', textTransform: 'uppercase', fontSize: '9px', letterSpacing: '0.5px' }}>
                    <Sparkles size={10} style={{ color: 'var(--color-warning)' }} /> Sponsored Ad Rewards
                  </span>
                  <span style={{ color: 'var(--color-text-secondary)', fontSize: '10px', fontWeight: '500' }}>
                    {activeMemberInfo.dailyAdsWatched || 0}/2 today
                  </span>
                </div>
                {activeGroup.seasonStarted ? (
                  (activeMemberInfo.dailyAdsWatched || 0) < 2 ? (
                    <button
                      onClick={startDailyAd}
                      className="btn-secondary"
                      style={{ width: '100%', padding: '6px', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', borderRadius: '6px' }}
                    >
                      <Play size={10} fill="currentColor" /> Watch Ad (+{Math.round(activeGroup.startingBudget * 0.05)} credits)
                    </button>
                  ) : (
                    <div style={{ color: 'var(--color-text-muted)', fontSize: '10px', fontStyle: 'italic', textAlign: 'center' }}>
                      Daily reward limit reached. Resets tomorrow.
                    </div>
                  )
                ) : (
                  <div style={{ color: 'var(--color-text-muted)', fontSize: '10px', fontStyle: 'italic', textAlign: 'center' }}>
                    Reward ads unlock when season starts.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Navigation Tabs (Unified Sidebar Menu) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
            Menu Navigation
          </span>
          {[
            { id: 'matches', label: 'Match Center', icon: '🏟️' },
            { id: 'leaderboard', label: 'Leaderboard', icon: '🏆' },
            { id: 'standings', label: 'Standings & Bracket', icon: '📊' },
            { id: 'chat', label: 'Banter Chat', icon: '💬' },
            { id: 'history', label: 'Betting History', icon: '📜' },
            { id: 'recap', label: "Yesterday's Recap", icon: '📑' },
            { id: 'howplay', label: 'How to Play', icon: '❓' },
            { id: 'settings', label: 'League Settings', icon: '⚙️' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                if (layoutMode === 'mobile') {
                  setShowMobileSidebar(false);
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                background: activeTab === tab.id ? 'rgba(var(--color-primary-rgb), 0.1)' : 'transparent',
                border: '1px solid',
                borderColor: activeTab === tab.id ? 'var(--color-primary)' : 'transparent',
                color: activeTab === tab.id ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                fontSize: '13px',
                fontWeight: activeTab === tab.id ? '700' : '500',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s'
              }}
            >
              <span style={{ fontSize: '14px' }}>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Groups Selection */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '0.5px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
              My Leagues
            </span>
            <button
              onClick={() => setShowCreateModal(true)}
              style={{ background: 'none', color: 'var(--color-primary)' }}
              title="Create new league"
            >
              <Plus size={16} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {groups.map(g => (
              <div
                key={g.id}
                onClick={() => setActiveGroupId(g.id)}
                style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: g.id === activeGroupId ? 'rgba(212, 175, 55, 0.08)' : 'transparent',
                  border: '1px solid',
                  borderColor: g.id === activeGroupId ? 'var(--color-primary)' : 'transparent',
                  color: g.id === activeGroupId ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'var(--transition-smooth)'
                }}
              >
                <Users size={16} style={{ color: g.id === activeGroupId ? 'var(--color-primary)' : 'var(--color-text-muted)' }} />
                <span style={{ fontSize: '13px', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {g.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Join League Code */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto' }}>
          <label style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Join League with Code:</label>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              type="text"
              placeholder="FIFA26"
              value={inviteInput}
              onChange={(e) => setInviteInput(e.target.value)}
              style={{ fontSize: '12px', padding: '8px', flex: 1 }}
            />
            <button
              onClick={handleJoinGroup}
              style={{
                background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%)',
                color: '#ffffff',
                borderRadius: '8px',
                padding: '0 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <ArrowRight size={14} />
            </button>
          </div>

          {activeGroup && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
              <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', textAlign: 'center' }}>
                Active League Code: <span style={{ color: 'var(--color-text)', fontWeight: '700', letterSpacing: '1px' }}>{activeGroup.inviteCode}</span>
              </div>
              <button
                onClick={copyInviteLink}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px dashed var(--border-color)',
                  borderRadius: '8px',
                  padding: '8px',
                  fontSize: '11px',
                  color: 'var(--color-primary)',
                  width: '100%'
                }}
              >
                <Share2 size={12} />
                {copiedLink ? 'Link Copied!' : 'Copy Direct Share Link'}
              </button>
            </div>
          )}
        </div>

        {/* Theme Switcher in Main Menu */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          paddingTop: '12px',
          marginTop: '12px'
        }}>
          <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            App Theme
          </span>
          <div style={{ position: 'relative' }}>
            <select
              value={currentTheme}
              onChange={(e) => {
                const selected = e.target.value;
                setCurrentTheme(selected);
                localStorage.setItem('wc_app_theme', selected);
              }}
              style={{
                width: '100%',
                background: 'rgba(0,0,0,0.3)',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '8px 12px 8px 34px',
                fontSize: '12px',
                fontWeight: '600',
                outline: 'none',
                cursor: 'pointer',
                appearance: 'none',
                WebkitAppearance: 'none'
              }}
            >
              {THEMES.map(theme => (
                <option key={theme.id} value={theme.id} style={{ background: 'var(--bg-sidebar)', color: '#fff' }}>
                  {theme.name}
                </option>
              ))}
            </select>
            {/* Display Flag inside select container absolutely */}
            <div style={{
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center'
            }}>
              {(() => {
                const THEME_COUNTRY_MAP: Record<string, string> = {
                  portugal: 'Portugal',
                  spain: 'Spain',
                  france: 'France',
                  england: 'England',
                  brazil: 'Brazil',
                  argentina: 'Argentina',
                  germany: 'Germany',
                  belgium: 'Belgium',
                  netherlands: 'Netherlands',
                  usa: 'USA',
                  canada: 'Canada',
                  mexico: 'Mexico'
                };
                const country = THEME_COUNTRY_MAP[currentTheme];
                if (country) {
                  return <TeamFlag teamName={country} size={16} />;
                }
                return currentTheme === 'light-theme' ? '☀️' : '🌌';
              })()}
            </div>
            {/* Custom down arrow */}
            <div style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
              fontSize: '10px',
              color: 'var(--color-text-muted)'
            }}>
              ▼
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <input
              type="checkbox"
              id="sidebarRandomizeTheme"
              checked={randomizeTheme}
              onChange={(e) => {
                const checked = e.target.checked;
                setRandomizeTheme(checked);
                localStorage.setItem('wc_randomize_theme', checked ? 'true' : 'false');
              }}
              style={{
                width: '12px',
                height: '12px',
                margin: 0,
                cursor: 'pointer'
              }}
            />
            <label htmlFor="sidebarRandomizeTheme" style={{ fontSize: '10px', color: 'var(--color-text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
              Randomize on startup 🎲
            </label>
          </div>
        </div>

        {/* Layout Toggle Switch */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          paddingTop: '12px',
          marginTop: 'auto'
        }}>
          <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Layout View
          </span>
          <div style={{
            display: 'flex',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '8px',
            padding: '2px',
            border: '1px solid var(--border-color)'
          }}>
            <button
              onClick={() => {
                setLayoutMode('desktop');
                setShowMobileSidebar(false);
              }}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: '600',
                borderRadius: '6px',
                background: layoutMode === 'desktop' ? 'var(--color-primary)' : 'none',
                color: layoutMode === 'desktop' ? '#000' : 'var(--color-text-secondary)',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <Monitor size={12} /> PC
            </button>
            <button
              onClick={() => {
                setLayoutMode('mobile');
                setShowMobileSidebar(false);
              }}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: '600',
                borderRadius: '6px',
                background: layoutMode === 'mobile' ? 'var(--color-primary)' : 'none',
                color: layoutMode === 'mobile' ? '#000' : 'var(--color-text-secondary)',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <Smartphone size={12} /> Mobile
            </button>
          </div>
        </div>

        {/* Clean Storage Helper */}
        <button
          onClick={handleResetData}
          style={{
            background: 'none',
            color: 'rgba(255,74,90,0.5)',
            fontSize: '11px',
            textAlign: 'left',
            padding: '4px 0',
            borderTop: '1px solid rgba(255,255,255,0.05)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            marginTop: '8px'
          }}
        >
          <Trash2 size={12} /> Reset Database
        </button>
      </aside>

      {/* --- MAIN PAGE VIEW --- */}
      <main style={
        layoutMode === 'mobile'
          ? {
              padding: '16px',
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: '24px',
              height: '100vh',
              overflowY: 'auto',
              overflowX: 'hidden'
            }
          : {
              padding: '32px',
              display: 'grid',
              gridTemplateColumns: '1fr 340px',
              gap: '32px',
              maxHeight: '100vh',
              overflowY: 'auto'
            }
      }>
        {/* Main Content Area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Mobile Header Bar */}
          {layoutMode === 'mobile' && (
            <header style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              background: 'var(--bg-sidebar)',
              borderBottom: '1px solid var(--border-color)',
              borderRadius: '12px',
              marginBottom: '4px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  onClick={() => setShowMobileSidebar(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-text-primary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Menu size={20} />
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Trophy size={18} style={{ color: 'var(--color-primary)' }} />
                  <span style={{ fontWeight: '800', fontSize: '14px' }}>WORLD CUP 2026</span>
                </div>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  onClick={() => setLayoutMode('desktop')}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'var(--color-text-secondary)',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    fontSize: '11px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer'
                  }}
                  title="Switch to PC layout"
                >
                  <Monitor size={12} /> PC View
                </button>
                <span 
                  onClick={() => setActiveTab('history')}
                  style={{ 
                    fontSize: '11px', 
                    fontWeight: '700', 
                    color: 'var(--color-primary)', 
                    background: 'rgba(var(--color-primary-rgb), 0.1)',
                    border: '1px solid rgba(var(--color-primary-rgb), 0.2)',
                    padding: '3px 8px',
                    borderRadius: '10px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  title="View your entire betting history"
                >
                  {activeMemberInfo?.balance ?? 0} pts
                </span>
                <div 
                  onClick={() => setActiveTab('leaderboard')}
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: '700',
                    fontSize: '11px',
                    cursor: 'pointer'
                  }}
                  title="View league standings"
                >
                  {currentUser.avatarUrl}
                </div>
                <button
                  onClick={() => {
                    setActiveTab('howplay');
                    if (layoutMode === 'mobile') {
                      setShowMobileSidebar(false);
                    }
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: activeTab === 'howplay' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4px'
                  }}
                  title="How to Play"
                >
                  <HelpCircle size={20} />
                </button>
              </div>
            </header>
          )}
          
          {/* TOURNAMENT SIMULATION DASHBOARD PANEL (ADMIN CONTROL) */}
          <section className="glass-panel pulse-gold-border" style={{
            background: 'linear-gradient(135deg, rgba(18, 30, 24, 0.9) 0%, rgba(10, 15, 13, 0.9) 100%)',
            borderWidth: '1px',
            borderColor: 'var(--color-primary)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Sparkles style={{ color: 'var(--color-primary)' }} />
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: '700' }}>
                    Tournament Simulation Console
                  </h3>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                    Test the system in real time. Simulate daily kick-offs and bet resolutions.
                  </span>
                </div>
              </div>
              <div style={{ background: 'rgba(var(--color-primary-rgb), 0.15)', color: 'var(--color-primary)', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '700' }}>
                LOCAL TESTING RUN
              </div>
            </div>

            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '16px',
              background: 'rgba(0,0,0,0.3)',
              padding: '12px 16px',
              borderRadius: '10px',
              alignItems: 'center',
              border: '1px solid rgba(255,255,255,0.05)'
            }}>
              {/* Simulated Date */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>
                  Simulated Date
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calendar size={14} style={{ color: 'var(--color-primary)' }} />
                  <input
                    type="date"
                    value={currentDate}
                    onChange={(e) => {
                      const dStr = e.target.value;
                      setCurrentDate(dStr);
                      triggerOddsSync(dStr);
                    }}
                    style={{ padding: '4px 8px', fontSize: '13px', width: '135px' }}
                    min="2026-06-11"
                    max="2026-07-20"
                  />
                </div>
              </div>

              {/* Simulated Time */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>
                  Simulated Time (UK)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={14} style={{ color: 'var(--color-primary)' }} />
                  <input
                    type="time"
                    value={currentTime}
                    onChange={(e) => setCurrentTime(e.target.value)}
                    style={{ padding: '4px 8px', fontSize: '13px', width: '90px' }}
                  />
                </div>
              </div>

              {/* Odds Sync Info */}
              <div style={{ flex: 1, minWidth: '180px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => triggerOddsSync(currentDate)}
                  disabled={isSyncingOdds}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '50%',
                    width: '28px',
                    height: '28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-primary)'
                  }}
                  title="Sync Odds Now"
                >
                  <RefreshCw size={12} style={{ animation: isSyncingOdds ? 'spin 1.5s linear infinite' : 'none' }} />
                </button>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {oddsSyncStatus}
                  </div>
                  <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
                    (Synced automatically at 8:00 AM daily)
                  </span>
                </div>
              </div>

              {/* Resolution Trigger button */}
              <button
                disabled={activeGroup && !activeGroup.seasonStarted}
                onClick={handleAdvanceDay}
                className="btn-primary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 18px',
                  borderRadius: '10px',
                  opacity: (activeGroup && !activeGroup.seasonStarted) ? 0.4 : 1,
                  cursor: (activeGroup && !activeGroup.seasonStarted) ? 'not-allowed' : 'pointer'
                }}
                title={activeGroup && !activeGroup.seasonStarted ? "Start the season from settings first" : "Simulate Today & Advance"}
              >
                <Play size={16} fill="#0b110e" /> Simulate Today & Advance
              </button>
            </div>
          </section>

          {layoutMode === 'mobile' && renderMeSectionCard()}

          {/* Tab Navigation */}
          {/* Top tab navigation menu removed - unified into the sidebar menu */}

          {/* TAB CONTENTS */}

          {/* TAB 1: Match Center */}
          {activeTab === 'matches' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {activeGroup && currentUser && activeMemberInfo && (
                <WinnerPredictionWidget
                  matches={matches}
                  activeGroup={activeGroup}
                  activeMemberInfo={activeMemberInfo}
                  dbWriteGroup={dbWriteGroup}
                  writeChatMessage={writeChatMessage}
                  currentUser={currentUser}
                  currentDate={currentDate}
                  currentTime={currentTime}
                  runSponsoredAd={runSponsoredAd}
                  alert={alert}
                />
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: '700' }}>
                    Active Betting Session Matches (Simulated Time: {currentTime})
                  </h2>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                    Only matches scheduled between the simulated time and the next 8:00 AM cutoff are visible and bettable.
                  </span>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', display: 'flex', gap: '12px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Lock size={12} /> Locked (Kickoff &lt; 2h)</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Unlock size={12} className="text-neon" /> Open for Bets</span>
                </div>
              </div>

              {activeGroup && !activeGroup.seasonStarted && (
                <div style={{
                  background: 'rgba(255, 158, 129, 0.08)',
                  border: '1px solid var(--color-warning)',
                  padding: '16px',
                  borderRadius: '8px',
                  color: 'var(--color-text-primary)',
                  fontSize: '13px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}>
                  <div style={{ fontWeight: '700', color: 'var(--color-warning)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    ⚠️ Season Not Started (Rules Configuration Open)
                  </div>
                  <div>
                    The league administrator has not started the season yet. You can browse the matches, but you cannot place bets until the administrator locks the league rules and starts the season.
                  </div>
                  {currentUser.id === activeGroup.adminId && (
                    <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                      👉 Go to the <strong>Settings</strong> tab to adjust league rules and click <strong>Start Season & Lock Rules</strong> when you are ready!
                    </div>
                  )}
                </div>
              )}

              {todayMatches.length === 0 ? (
                <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                  <Calendar size={40} style={{ color: 'var(--color-text-muted)', marginBottom: '12px' }} />
                  <p style={{ fontWeight: '500' }}>No World Cup games scheduled on this date.</p>
                  <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Use the Console at the top to change dates or simulate jumps.</p>
                </div>
              ) : (
                <div className="match-grid">
                  {todayMatches.map(match => {
                    const locked = isMatchLocked(match);
                    const multiplier = getMatchdayMultiplier(match.matchday);
                    
                    // Find currentUser's bet for this match (if any)
                    const userSingle = singleBets.find(b => b.userId === currentUser.id && b.matchId === match.id && b.groupId === activeGroupId);
                    const userDC = doubleChanceBets.find(b => b.userId === currentUser.id && b.matchId === match.id && b.groupId === activeGroupId);
                    const userCombo = comboSelections.find(s => s.matchId === match.id);

                    // Count other group members' bets on this match
                    const groupSingles = singleBets.filter(b => b.userId !== currentUser.id && b.matchId === match.id && b.groupId === activeGroupId);
                    const groupDCs = doubleChanceBets.filter(b => b.userId !== currentUser.id && b.matchId === match.id && b.groupId === activeGroupId);
                    const groupBetsCount = groupSingles.length + groupDCs.length;

                    const homeFlagUrl = getTeamFlagUrl(match.homeTeam);
                    const awayFlagUrl = getTeamFlagUrl(match.awayTeam);

                    return (
                      <div
                        key={match.id}
                        className="glass-panel"
                        style={{
                          position: 'relative',
                          overflow: 'hidden',
                          padding: '16px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '14px',
                          borderColor: locked ? 'rgba(255,255,255,0.03)' : 'var(--border-color)',
                          background: locked ? 'rgba(0,0,0,0.25)' : 'var(--bg-card)',
                          transition: 'var(--transition-smooth)'
                        }}
                      >
                        {/* Split Flag Background Watermarks */}
                        {!isPlaceholder(match.homeTeam) && homeFlagUrl && (
                          <div
                            style={{
                              position: 'absolute',
                              left: 0,
                              top: 0,
                              bottom: 0,
                              width: '50%',
                              backgroundImage: `url(${homeFlagUrl})`,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                              opacity: 0.3,
                              filter: 'brightness(0.35) saturate(0.7) blur(0.5px)',
                              zIndex: 0,
                              pointerEvents: 'none'
                            }}
                          />
                        )}
                        {!isPlaceholder(match.awayTeam) && awayFlagUrl && (
                          <div
                            style={{
                              position: 'absolute',
                              right: 0,
                              top: 0,
                              bottom: 0,
                              width: '50%',
                              backgroundImage: `url(${awayFlagUrl})`,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                              opacity: 0.3,
                              filter: 'brightness(0.35) saturate(0.7) blur(0.5px)',
                              zIndex: 0,
                              pointerEvents: 'none'
                            }}
                          />
                        )}
                        {/* Overlay split transition / vignette */}
                        <div
                          style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            top: 0,
                            bottom: 0,
                            background: 'linear-gradient(to right, rgba(10, 10, 15, 0.15) 0%, rgba(10, 10, 15, 0.8) 50%, rgba(10, 10, 15, 0.15) 100%)',
                            zIndex: 1,
                            pointerEvents: 'none'
                          }}
                        />

                        {/* Content wrapper on top of watermarks */}
                        <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', gap: '14px', height: '100%' }}>
                          {/* Match Header info */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                            <span style={{ color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Clock size={12} /> {match.kickoffTime} UK | MD{match.matchday}
                            </span>
                            
                            {multiplier > 1.0 && (
                              <span style={{
                                color: 'var(--color-warning)',
                                background: 'rgba(255, 183, 0, 0.1)',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontWeight: '700',
                                fontSize: '10px'
                              }}>
                                x{multiplier.toFixed(2)} Points Multiplier
                              </span>
                            )}

                            <span style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontWeight: '600',
                              color: locked ? 'var(--color-danger)' : 'var(--color-secondary)'
                            }}>
                              {locked ? <Lock size={12} /> : <Unlock size={12} />}
                              {locked ? 'Locked' : 'Open'}
                            </span>
                          </div>

                          {/* Match Team Layout */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                            {/* Home */}
                            <div style={{ flex: 1, textAlign: 'center' }}>
                              <div style={{ fontWeight: '700', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                <TeamFlag teamName={match.homeTeam} />
                                <span>{match.homeTeam}</span>
                              </div>
                            </div>

                            {/* Score / VS */}
                            <div style={{ padding: '0 12px', textAlign: 'center' }}>
                              {match.status === 'finished' ? (
                                <div style={{ fontSize: '20px', fontWeight: '800', letterSpacing: '4px', color: 'var(--color-primary)' }}>
                                  {match.homeScore}-{match.awayScore}
                                </div>
                              ) : (
                                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: '700', background: 'rgba(255,255,255,0.03)', padding: '4px 10px', borderRadius: '12px' }}>
                                  VS
                                </div>
                              )}
                            </div>

                            {/* Away */}
                            <div style={{ flex: 1, textAlign: 'center' }}>
                              <div style={{ fontWeight: '700', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                <TeamFlag teamName={match.awayTeam} />
                                <span>{match.awayTeam}</span>
                              </div>
                            </div>
                          </div>

                          {/* Odds Betting buttons */}
                          {(() => {
                            const active1 = (selectedMatch?.id === match.id && singleOutcome === '1' && slipTab === 'single') || 
                                            (userSingle?.outcome === '1') ||
                                            (userCombo?.outcome === '1');
                            const activeX = (selectedMatch?.id === match.id && singleOutcome === 'X' && slipTab === 'single') || 
                                            (userSingle?.outcome === 'X') ||
                                            (userCombo?.outcome === 'X');
                            const active2 = (selectedMatch?.id === match.id && singleOutcome === '2' && slipTab === 'single') || 
                                            (userSingle?.outcome === '2') ||
                                            (userCombo?.outcome === '2');

                            return (
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                                <button
                                  disabled={locked || (activeGroup && !activeGroup.seasonStarted)}
                                  onClick={() => {
                                    setSelectedMatch(match);
                                    setSingleOutcome('1');
                                    setSlipTab('single');
                                  }}
                                  style={{
                                    background: active1 ? 'rgba(0, 199, 82, 0.18)' : 'rgba(0,0,0,0.3)',
                                    border: active1 ? '1px solid var(--color-secondary)' : '1px solid rgba(255,255,255,0.05)',
                                    borderRadius: '8px',
                                    padding: '8px 4px',
                                    color: 'var(--color-text-primary)',
                                    boxShadow: active1 ? '0 0 10px rgba(0, 199, 82, 0.15)' : 'none',
                                    transition: 'var(--transition-smooth)',
                                    opacity: (locked || (activeGroup && !activeGroup.seasonStarted)) && !active1 ? 0.4 : 1,
                                    cursor: (locked || (activeGroup && !activeGroup.seasonStarted)) ? 'not-allowed' : 'pointer'
                                  }}
                                >
                                  <div style={{ fontSize: '10px', color: active1 ? '#ffffff' : 'var(--color-text-muted)' }}>1 (Home)</div>
                                  <div style={{ fontWeight: '700', fontSize: '13px', color: active1 ? 'var(--color-secondary)' : 'var(--color-primary)' }}>{match.homeOdds}</div>
                                </button>

                                <button
                                  disabled={locked || (activeGroup && !activeGroup.seasonStarted)}
                                  onClick={() => {
                                    setSelectedMatch(match);
                                    setSingleOutcome('X');
                                    setSlipTab('single');
                                  }}
                                  style={{
                                    background: activeX ? 'rgba(0, 199, 82, 0.18)' : 'rgba(0,0,0,0.3)',
                                    border: activeX ? '1px solid var(--color-secondary)' : '1px solid rgba(255,255,255,0.05)',
                                    borderRadius: '8px',
                                    padding: '8px 4px',
                                    color: 'var(--color-text-primary)',
                                    boxShadow: activeX ? '0 0 10px rgba(0, 199, 82, 0.15)' : 'none',
                                    transition: 'var(--transition-smooth)',
                                    opacity: (locked || (activeGroup && !activeGroup.seasonStarted)) && !activeX ? 0.4 : 1,
                                    cursor: (locked || (activeGroup && !activeGroup.seasonStarted)) ? 'not-allowed' : 'pointer'
                                  }}
                                >
                                  <div style={{ fontSize: '10px', color: activeX ? '#ffffff' : 'var(--color-text-muted)' }}>X (Draw)</div>
                                  <div style={{ fontWeight: '700', fontSize: '13px', color: activeX ? 'var(--color-secondary)' : 'var(--color-primary)' }}>{match.drawOdds}</div>
                                </button>

                                <button
                                  disabled={locked || (activeGroup && !activeGroup.seasonStarted)}
                                  onClick={() => {
                                    setSelectedMatch(match);
                                    setSingleOutcome('2');
                                    setSlipTab('single');
                                  }}
                                  style={{
                                    background: active2 ? 'rgba(0, 199, 82, 0.18)' : 'rgba(0,0,0,0.3)',
                                    border: active2 ? '1px solid var(--color-secondary)' : '1px solid rgba(255,255,255,0.05)',
                                    borderRadius: '8px',
                                    padding: '8px 4px',
                                    color: 'var(--color-text-primary)',
                                    boxShadow: active2 ? '0 0 10px rgba(0, 199, 82, 0.15)' : 'none',
                                    transition: 'var(--transition-smooth)',
                                    opacity: (locked || (activeGroup && !activeGroup.seasonStarted)) && !active2 ? 0.4 : 1,
                                    cursor: (locked || (activeGroup && !activeGroup.seasonStarted)) ? 'not-allowed' : 'pointer'
                                  }}
                                >
                                  <div style={{ fontSize: '10px', color: active2 ? '#ffffff' : 'var(--color-text-muted)' }}>2 (Away)</div>
                                  <div style={{ fontWeight: '700', fontSize: '13px', color: active2 ? 'var(--color-secondary)' : 'var(--color-primary)' }}>{match.awayOdds}</div>
                                </button>
                              </div>
                            );
                          })()}

                          {/* Combo bet adder */}
                          {!locked && activeGroup && activeGroup.allowCombos !== false && activeGroup.seasonStarted && (
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '10px' }}>
                              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center' }}>
                                Combo Slip:
                              </span>
                              <button
                                onClick={() => handleAddToCombo(match, '1')}
                                className={`btn-secondary`}
                                style={{ fontSize: '10px', padding: '4px 8px', borderRadius: '4px', border: userCombo?.outcome === '1' ? '1px solid var(--color-primary)' : '' }}
                              >
                                +Home
                              </button>
                              <button
                                onClick={() => handleAddToCombo(match, 'X')}
                                className={`btn-secondary`}
                                style={{ fontSize: '10px', padding: '4px 8px', borderRadius: '4px', border: userCombo?.outcome === 'X' ? '1px solid var(--color-primary)' : '' }}
                              >
                                +Draw
                              </button>
                              <button
                                onClick={() => handleAddToCombo(match, '2')}
                                className={`btn-secondary`}
                                style={{ fontSize: '10px', padding: '4px 8px', borderRadius: '4px', border: userCombo?.outcome === '2' ? '1px solid var(--color-primary)' : '' }}
                              >
                                +Away
                              </button>
                            </div>
                          )}

                          {/* Active Prediction Info (My Bet) */}
                          {(userSingle || userDC) && (
                            <div style={{
                              background: 'rgba(0, 255, 135, 0.05)',
                              border: '1px solid rgba(0, 255, 135, 0.2)',
                              borderRadius: '8px',
                              padding: '8px 12px',
                              fontSize: '12px'
                            }}>
                              {userSingle && (
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span>My Bet: <strong>{userSingle.outcome === '1' ? 'Home Win' : userSingle.outcome === 'X' ? 'Draw' : 'Away Win'}</strong> ({userSingle.amount} pts)</span>
                                  {userSingle.powerupUsed && (
                                    <span style={{ color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                      <Sparkles size={10} /> {userSingle.powerupUsed}
                                    </span>
                                  )}
                                </div>
                              )}
                              {userDC && (
                                <div>
                                  <span>My DC Bet: <strong>{userDC.outcome1} & {userDC.outcome2}</strong></span>
                                  <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                                    <span>{userDC.outcome1}: {userDC.amount1} pts</span>
                                    <span>{userDC.outcome2}: {userDC.amount2} pts</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Other group members' bets details */}
                          {groupBetsCount > 0 && (
                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.02)', padding: '6px 10px', borderRadius: '6px' }}>
                              <span>🔒 {groupBetsCount} other member bets placed. </span>
                              <span style={{ fontStyle: 'italic', fontSize: '10px' }}>Predictions revealed at kick-off!</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Leaderboard */}
          {activeTab === 'leaderboard' && (
            <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '700' }}>
                  {activeGroup?.name || 'League Leaderboard'}
                </h2>
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  Members are ranked by Total Credit Balance. Win rates calculate prediction accuracy.
                </span>
              </div>

              {/* Multi-line points progression chart */}
              {activeGroup && (
                <MultiLineProgressionChart
                  recaps={recaps}
                  activeGroupId={activeGroupId}
                  activeGroup={activeGroup}
                />
              )}

              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--color-text-secondary)' }}>
                    <th style={{ padding: '12px 8px' }}>Rank</th>
                    <th style={{ padding: '12px 8px' }}>Member</th>
                    <th style={{ padding: '12px 8px' }}>Correct Predictions</th>
                    <th style={{ padding: '12px 8px' }}>Win Rate %</th>
                    <th style={{ padding: '12px 8px', textAlign: 'right' }}>Total Credits</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMembers.map((m, index) => {
                    const isSelf = m.userId === currentUser.id;
                    return (
                      <tr
                        key={m.userId}
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          background: isSelf ? 'rgba(var(--color-primary-rgb), 0.08)' : 'transparent',
                          fontWeight: isSelf ? '700' : 'normal'
                        }}
                      >
                        <td style={{ padding: '14px 8px' }}>
                          {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`}
                        </td>
                        <td style={{ padding: '14px 8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            background: isSelf ? 'var(--color-primary)' : 'rgba(255,255,255,0.1)',
                            color: isSelf ? '#ffffff' : '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '11px',
                            fontWeight: '700'
                          }}>
                            {m.username.substring(0, 2).toUpperCase()}
                          </div>
                          <span
                            onClick={() => setSelectedMemberForHistory(m)}
                            style={{
                              cursor: 'pointer',
                              color: 'var(--color-primary)',
                              textDecoration: 'underline',
                              fontWeight: '600'
                            }}
                            title="Click to view player win/loss betting history"
                          >
                            {m.username}
                          </span>
                          {isSelf && <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginLeft: '4px' }}>(You)</span>}
                        </td>
                        <td style={{ padding: '14px 8px', color: 'var(--color-text-secondary)' }}>
                          {m.correctCount} / {m.totalBetsCount}
                        </td>
                        <td style={{ padding: '14px 8px', color: 'var(--color-secondary)' }}>
                          {m.winRate}%
                        </td>
                        <td style={{ padding: '14px 8px', textAlign: 'right', fontWeight: '700' }} className="text-gold">
                          {m.balance}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB: Standings & Bracket */}
          {activeTab === 'standings' && (
            <StandingsAndBracketView
              matches={matches}
              top8ThirdPlaceTeams={top8ThirdPlaceTeams}
              rankedThirds={rankedThirdPlaceList}
              activeGroup={activeGroup}
              activeMemberInfo={activeMemberInfo}
              dbWriteGroup={dbWriteGroup}
              writeChatMessage={writeChatMessage}
              currentUser={currentUser}
              currentDate={currentDate}
              currentTime={currentTime}
              runSponsoredAd={runSponsoredAd}
              alert={alert}
            />
          )}

          {/* TAB: Banter Chat */}
          {activeTab === 'chat' && (
            <ChatTab
              messages={chatMessages}
              onSendMessage={writeChatMessage}
              currentUser={currentUser}
              klipyApiKey={klipyApiKey}
            />
          )}

          {/* TAB: Betting History */}
          {activeTab === 'history' && (
            <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '700' }}>Betting History</h2>
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  View all of your predictions, wagers, and results since the tournament started.
                </span>
              </div>

              {/* Summary Metrics */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: '600' }}>Total Bets</span>
                  <div style={{ fontSize: '24px', fontWeight: '800', marginTop: '4px', color: '#fff' }}>
                    {myAllBetsCombined.length}
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: '600' }}>Accuracy</span>
                  <div style={{ fontSize: '24px', fontWeight: '800', marginTop: '4px', color: 'var(--color-secondary)' }}>
                    {activeMemberInfo ? `${activeMemberInfo.winRate}%` : '0%'}
                  </div>
                  <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
                    {activeMemberInfo?.correctCount ?? 0} of {activeMemberInfo?.totalBetsCount ?? 0}
                  </span>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: '600' }}>Total Winnings</span>
                  <div style={{ fontSize: '24px', fontWeight: '800', marginTop: '4px', color: '#ffd700' }}>
                    {(() => {
                      const totalWon = myAllBetsCombined.reduce((sum, b) => sum + (b.pointsWon || 0), 0);
                      return `${Math.round(totalWon * 10) / 10} pts`;
                    })()}
                  </div>
                </div>
              </div>

              {/* Performance Insights Dashboard */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '20px' }}>
                <BalanceHistoryChart data={balanceProgression} />
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                  {/* Accuracy by Bet Type */}
                  <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(255,255,255,0.015)' }}>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Zap size={14} color="var(--color-primary)" />
                      Accuracy by Bet Type
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--color-text-secondary)' }}>Single Bets:</span>
                        <span style={{ fontWeight: '700' }}>{bettingStats.singles.won}/{bettingStats.singles.resolved} ({bettingStats.singles.pct}%)</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--color-text-secondary)' }}>Double Chance Bets:</span>
                        <span style={{ fontWeight: '700' }}>{bettingStats.dcs.won}/{bettingStats.dcs.resolved} ({bettingStats.dcs.pct}%)</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--color-text-secondary)' }}>3-Match Combos:</span>
                        <span style={{ fontWeight: '700' }}>{bettingStats.combos.won}/{bettingStats.combos.resolved} ({bettingStats.combos.pct}%)</span>
                      </div>
                    </div>
                  </div>

                  {/* Boost Efficiency */}
                  <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(255,255,255,0.015)' }}>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Sparkles size={14} color="#ffd700" />
                      Boost Efficiency
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--color-text-secondary)' }}>No Loss (Shield):</span>
                        <span style={{ fontWeight: '700' }}>{bettingStats.boosts.noLoss.won}/{bettingStats.boosts.noLoss.resolved} ({bettingStats.boosts.noLoss.pct}%)</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--color-text-secondary)' }}>Double Returns (2x):</span>
                        <span style={{ fontWeight: '700' }}>{bettingStats.boosts.doublePoints.won}/{bettingStats.boosts.doublePoints.resolved} ({bettingStats.boosts.doublePoints.pct}%)</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--color-text-secondary)' }}>Double Chance (2 Ways):</span>
                        <span style={{ fontWeight: '700' }}>{bettingStats.boosts.doubleChance.won}/{bettingStats.boosts.doubleChance.resolved} ({bettingStats.boosts.doubleChance.pct}%)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* History List */}
              {myAllBetsCombined.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-secondary)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '12px' }}>
                  <span style={{ fontSize: '24px', display: 'block', marginBottom: '8px' }}>📜</span>
                  <p style={{ fontSize: '13px', margin: 0 }}>You haven't placed any bets in this league yet.</p>
                  <button
                    onClick={() => setActiveTab('matches')}
                    className="btn-primary"
                    style={{ marginTop: '16px', padding: '8px 16px', borderRadius: '6px', fontSize: '12px' }}
                  >
                    Go to Match Center
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {myAllBetsCombined.map(bet => {
                    const isSingle = bet.betType === 'single';
                    const isDC = bet.betType === 'doubleChance';
                    const isCombo = bet.betType === 'combo';

                    // Format Status Badge
                    let statusLabel = 'Pending';
                    let statusColor = 'var(--color-warning)';
                    let statusBg = 'rgba(255, 179, 0, 0.1)';
                    if (bet.status === 'won') {
                      statusLabel = 'Won';
                      statusColor = 'var(--color-status-won)';
                      statusBg = 'rgba(0, 199, 82, 0.1)';
                    } else if (bet.status === 'lost') {
                      statusLabel = 'Lost';
                      statusColor = 'var(--color-status-lost)';
                      statusBg = 'rgba(215, 0, 0, 0.1)';
                    } else if (bet.status === 'noLossReturned') {
                      statusLabel = 'Refunded (No Loss)';
                      statusColor = 'var(--color-info)';
                      statusBg = 'rgba(var(--color-primary-rgb), 0.1)';
                    }

                    // Get match information helper
                    const getMatchInfo = (mId: string) => matches.find(m => m.id === mId);

                    return (
                      <div
                        key={bet.id}
                        style={{
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid rgba(255,255,255,0.05)',
                          borderRadius: '12px',
                          padding: '16px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px'
                        }}
                      >
                        {/* Header of Bet item */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                          <span style={{
                            fontSize: '10px',
                            fontWeight: '800',
                            textTransform: 'uppercase',
                            letterSpacing: '1px',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: isSingle ? 'rgba(var(--color-primary-rgb), 0.15)' : isDC ? 'rgba(0, 199, 82, 0.15)' : 'rgba(255, 179, 0, 0.15)',
                            color: isSingle ? 'var(--color-primary)' : isDC ? 'var(--color-secondary)' : 'var(--color-warning)'
                          }}>
                            {isSingle ? 'Single Bet' : isDC ? 'Double Chance' : '3-Match Combo'}
                          </span>
                          
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                              {new Date(bet.timestamp).toLocaleDateString()} {new Date(bet.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span style={{
                              fontSize: '11px',
                              fontWeight: '700',
                              color: statusColor,
                              background: statusBg,
                              padding: '3px 8px',
                              borderRadius: '6px',
                              border: `1px solid ${statusColor}40`
                            }}>
                              {statusLabel}
                            </span>
                          </div>
                        </div>

                        {/* Bet Details body */}
                        {isSingle && (() => {
                          const m = getMatchInfo(bet.matchId);
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '600' }}>
                                <TeamFlag teamName={m?.homeTeam ?? ''} />
                                <span>{m?.homeTeam}</span>
                                <span style={{ color: 'var(--color-text-muted)' }}>vs</span>
                                <TeamFlag teamName={m?.awayTeam ?? ''} />
                                <span>{m?.awayTeam}</span>
                                {m?.status === 'finished' && (
                                  <span style={{ color: 'var(--color-secondary)', marginLeft: '6px', fontSize: '12px' }}>
                                    ({m.homeScore}-{m.awayScore})
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginTop: '4px', flexWrap: 'wrap', gap: '10px' }}>
                                <div>
                                  <span style={{ color: 'var(--color-text-muted)' }}>Prediction:</span>{' '}
                                  <span style={{ fontWeight: '700', color: '#fff' }}>
                                    {bet.outcome === '1' ? `Home Winner (${m?.homeTeam})` : bet.outcome === '2' ? `Away Winner (${m?.awayTeam})` : 'Draw (X)'}
                                  </span>
                                </div>
                                <div>
                                  <span style={{ color: 'var(--color-text-muted)' }}>Odds:</span>{' '}
                                  <span style={{ fontWeight: '700', color: 'var(--color-secondary)' }}>
                                    {bet.outcome === '1' ? m?.homeOdds : bet.outcome === '2' ? m?.awayOdds : m?.drawOdds}
                                  </span>
                                </div>
                                <div>
                                  <span style={{ color: 'var(--color-text-muted)' }}>Stake:</span>{' '}
                                  <span style={{ fontWeight: '700', color: '#ffd700' }}>{bet.amount} pts</span>
                                </div>
                                {bet.powerupUsed && (
                                  <div>
                                    <span style={{ color: 'var(--color-text-muted)' }}>Boost:</span>{' '}
                                    <span style={{ fontWeight: '700', color: 'var(--color-primary)' }}>
                                      {bet.powerupUsed === 'noLoss' ? '🛡️ No Loss' : bet.powerupUsed === 'doubleChance' ? '👥 Double Chance' : '⚡ 2x Returns'}
                                    </span>
                                  </div>
                                )}
                                {bet.placedInRed && (
                                  <div>
                                    <span style={{ color: 'var(--color-danger)', fontWeight: '700' }}>🔴 Overdraft Bet (Halved Profits)</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}

                        {isDC && (() => {
                          const m = getMatchInfo(bet.matchId);
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '600' }}>
                                <TeamFlag teamName={m?.homeTeam ?? ''} />
                                <span>{m?.homeTeam}</span>
                                <span style={{ color: 'var(--color-text-muted)' }}>vs</span>
                                <TeamFlag teamName={m?.awayTeam ?? ''} />
                                <span>{m?.awayTeam}</span>
                                {m?.status === 'finished' && (
                                  <span style={{ color: 'var(--color-secondary)', marginLeft: '6px', fontSize: '12px' }}>
                                    ({m.homeScore}-{m.awayScore})
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginTop: '4px', flexWrap: 'wrap', gap: '10px' }}>
                                <div>
                                  <span style={{ color: 'var(--color-text-muted)' }}>Selection 1:</span>{' '}
                                  <span style={{ fontWeight: '600', color: '#fff' }}>
                                    {bet.outcome1 === '1' ? 'Home' : bet.outcome1 === '2' ? 'Away' : 'Draw'} ({bet.amount1} pts)
                                  </span>
                                </div>
                                <div>
                                  <span style={{ color: 'var(--color-text-muted)' }}>Selection 2:</span>{' '}
                                  <span style={{ fontWeight: '600', color: '#fff' }}>
                                    {bet.outcome2 === '1' ? 'Home' : bet.outcome2 === '2' ? 'Away' : 'Draw'} ({bet.amount2} pts)
                                  </span>
                                </div>
                                <div>
                                  <span style={{ color: 'var(--color-text-muted)' }}>Multiplier:</span>{' '}
                                  <span style={{ fontWeight: '700', color: 'var(--color-secondary)' }}>{bet.multiplier}x</span>
                                </div>
                                <div>
                                  <span style={{ color: 'var(--color-text-muted)' }}>Total Stake:</span>{' '}
                                  <span style={{ fontWeight: '700', color: '#ffd700' }}>{bet.amount1 + bet.amount2} pts</span>
                                </div>
                                {bet.placedInRed && (
                                  <div>
                                    <span style={{ color: 'var(--color-danger)', fontWeight: '700' }}>🔴 Overdraft Bet</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}

                        {isCombo && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '8px' }}>
                              {bet.bets.map((sub: { matchId: string; outcome: '1' | 'X' | '2'; odds: number }, i: number) => {
                                const m = getMatchInfo(sub.matchId);
                                return (
                                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', color: '#fff' }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                      <TeamFlag teamName={m?.homeTeam ?? ''} />
                                      <span>{m?.homeTeam}</span>
                                      <span style={{ color: 'var(--color-text-muted)' }}>vs</span>
                                      <TeamFlag teamName={m?.awayTeam ?? ''} />
                                      <span>{m?.awayTeam}</span>
                                    </span>
                                    <span>
                                      Prediction: <span style={{ fontWeight: '700', color: 'var(--color-primary)' }}>{sub.outcome === '1' ? 'Home' : sub.outcome === '2' ? 'Away' : 'Draw'}</span> ({sub.odds})
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', flexWrap: 'wrap', gap: '10px' }}>
                              <div>
                                <span style={{ color: 'var(--color-text-muted)' }}>Stake:</span>{' '}
                                <span style={{ fontWeight: '700', color: '#ffd700' }}>{bet.amount} pts</span>
                              </div>
                              {bet.placedInRed && (
                                <div>
                                  <span style={{ color: 'var(--color-danger)', fontWeight: '700' }}>🔴 Overdraft Bet</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Profit/Winnings outcome */}
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                          <span style={{ color: 'var(--color-text-secondary)' }}>Winnings:</span>
                          {bet.status === 'pending' ? (
                            <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Pending Match Results</span>
                          ) : (
                            <span style={{
                              fontWeight: '800',
                              fontSize: '15px',
                              color: bet.status === 'won' ? 'var(--color-status-won)' : bet.status === 'noLossReturned' ? 'var(--color-info)' : 'var(--color-status-lost)'
                            }}>
                              {bet.status === 'won' ? `+${bet.pointsWon} pts` : bet.status === 'noLossReturned' ? 'Returned (No Loss)' : `-${isDC ? bet.amount1 + bet.amount2 : bet.amount} pts`}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Yesterday's Recap */}
          {activeTab === 'recap' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '700' }}>
                  Yesterday's Match Outcomes & Member Bets Recap
                </h2>
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  All private bets are fully revealed once kickoff occurs. Check how your group performed yesterday.
                </span>
              </div>

              {recaps.length === 0 ? (
                <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                  <Info size={40} style={{ color: 'var(--color-text-muted)', marginBottom: '12px' }} />
                  <p style={{ fontWeight: '500' }}>No yesterday logs available yet.</p>
                  <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Place bets on today's matches, then trigger the simulator to see recaps!</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {recaps.map((rec, rIdx) => (
                    <div key={rIdx} className="glass-panel" style={{ padding: '20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px', marginBottom: '16px' }}>
                        <span style={{ fontWeight: '700', color: 'var(--color-primary)' }}>
                          Recap for {new Date(rec.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                          {rec.matchResults.length} Matches resolved
                        </span>
                      </div>

                      {/* Match results list */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '20px' }}>
                        {rec.matchResults.map(mr => (
                          <div key={mr.matchId} style={{ background: 'rgba(0,0,0,0.3)', padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: '8px', fontSize: '12px' }}>
                            <span>{mr.homeTeam} vs {mr.awayTeam}</span>
                            <span style={{ fontWeight: '800', color: 'var(--color-primary)' }}>{mr.score}</span>
                            <span style={{ color: 'var(--color-text-muted)' }}>({mr.result})</span>
                          </div>
                        ))}
                      </div>

                      {/* Member bets revealed */}
                      <h4 style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Member Betting Details & Net Balance Changes
                      </h4>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {rec.memberRecaps.map(mbr => {
                          const isPositive = mbr.netChange > 0;
                          return (
                            <div key={mbr.userId} style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.03)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <span style={{ fontWeight: '600', fontSize: '13px' }}>{mbr.username}</span>
                                <span style={{
                                  fontSize: '12px',
                                  fontWeight: '800',
                                  color: isPositive ? 'var(--color-status-won)' : mbr.netChange < 0 ? 'var(--color-status-lost)' : 'var(--color-text-secondary)'
                                }}>
                                  {isPositive ? `+${mbr.netChange}` : mbr.netChange} pts
                                </span>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '8px' }}>
                                {mbr.betsPlaced.length === 0 && mbr.comboBets.length === 0 && (
                                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Did not place any bets on this day.</span>
                                )}
                                
                                {mbr.betsPlaced.map((b, idx) => (
                                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                    <span>
                                      ⚽ {b.matchName}: Predicted <strong>{b.prediction}</strong> ({b.amount}) 
                                      {b.powerup && <span style={{ color: 'var(--color-primary)', fontSize: '10px', marginLeft: '4px' }}>[{b.powerup}]</span>}
                                    </span>
                                    <span style={{ color: b.status === 'won' ? 'var(--color-status-won)' : b.status === 'noLossReturned' ? 'var(--color-info)' : 'var(--color-status-lost)' }}>
                                      {b.status === 'won' ? 'Won' : b.status === 'noLossReturned' ? 'Returned' : 'Lost'} ({b.netPoints >= 0 ? `+${b.netPoints}` : b.netPoints})
                                    </span>
                                  </div>
                                ))}

                                {mbr.comboBets.map((c, idx) => (
                                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                    <span>
                                      🎫 Combo Bet ({c.amount} pts): {c.matches.join(' | ')} (Predicted {c.predictions.join(', ')})
                                    </span>
                                    <span style={{ color: c.status === 'won' ? 'var(--color-status-won)' : 'var(--color-status-lost)' }}>
                                      {c.status === 'won' ? 'Won' : 'Lost'} ({c.netPoints >= 0 ? `+${c.netPoints}` : c.netPoints})
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: Settings */}
          {activeTab === 'settings' && (
            <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '700' }}>
                  League Rules & Configuration
                </h2>
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  Manage the rules of the group. (Only Admin {activeGroup && users.find(u => u.id === activeGroup.adminId)?.username} can edit).
                </span>
              </div>

              {activeGroup && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  
                  {/* Budget setting */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600' }}>Starting Budget Points</label>
                    <select
                      value={activeGroup.startingBudget}
                      disabled={currentUser.id !== activeGroup.adminId || activeGroup.seasonStarted}
                      onChange={async (e) => {
                        const val = Number(e.target.value);
                        await dbWriteGroup({ ...activeGroup, startingBudget: val });
                      }}
                      style={{ maxWidth: '200px' }}
                    >
                      <option value="100">100 Credits</option>
                      <option value="200">200 Credits</option>
                      <option value="500">500 Credits</option>
                      <option value="1000">1000 Credits</option>
                      <option value="2000">2000 Credits</option>
                      <option value="5000">5000 Credits</option>
                      <option value="10000">10000 Credits</option>
                      <option value="20000">20000 Credits</option>
                    </select>
                  </div>

                  {/* Allow Combo bets rule */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input
                      type="checkbox"
                      id="allowCombos"
                      checked={activeGroup.allowCombos !== false}
                      disabled={currentUser.id !== activeGroup.adminId || activeGroup.seasonStarted}
                      onChange={async (e) => {
                        const checked = e.target.checked;
                        await dbWriteGroup({ ...activeGroup, allowCombos: checked });
                      }}
                    />
                    <label htmlFor="allowCombos" style={{ fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                      Allow 3-Match Combo bets in this league
                    </label>
                  </div>

                  {/* Toggle 3-Match Combo Bonus */}
                  {activeGroup.allowCombos !== false && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <input
                        type="checkbox"
                        id="toggleCombo"
                        checked={activeGroup.toggle3MatchBonus}
                        disabled={currentUser.id !== activeGroup.adminId || activeGroup.seasonStarted}
                        onChange={async (e) => {
                          const checked = e.target.checked;
                          await dbWriteGroup({ ...activeGroup, toggle3MatchBonus: checked });
                        }}
                      />
                      <label htmlFor="toggleCombo" style={{ fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                        Activate 3-Match Combo Ticket Bonus (+50% bet stake return)
                      </label>
                    </div>
                  )}

                  {/* Toggle Matchday MVP Bonus */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <input
                        type="checkbox"
                        id="toggleMVP"
                        checked={activeGroup.toggleMdBonus}
                        disabled={currentUser.id !== activeGroup.adminId || activeGroup.seasonStarted}
                        onChange={async (e) => {
                          const checked = e.target.checked;
                          await dbWriteGroup({ ...activeGroup, toggleMdBonus: checked });
                        }}
                      />
                      <label htmlFor="toggleMVP" style={{ fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                        Activate Matchday MVP Bonus (highest count of correct predictions per 24 matches)
                      </label>
                    </div>

                    {activeGroup.toggleMdBonus && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '24px' }}>
                        <label style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>MVP Reward Points</label>
                        <select
                          value={activeGroup.mdBonusPoints}
                          disabled={currentUser.id !== activeGroup.adminId || activeGroup.seasonStarted}
                          onChange={async (e) => {
                            const val = Number(e.target.value);
                            await dbWriteGroup({ ...activeGroup, mdBonusPoints: val });
                          }}
                          style={{ maxWidth: '150px' }}
                        >
                          <option value="50">50 Points</option>
                          <option value="100">100 Points</option>
                          <option value="200">200 Points</option>
                          <option value="500">500 Points</option>
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Toggle Overdraft Settings */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input
                      type="checkbox"
                      id="toggleOverdraft"
                      checked={activeGroup.allowOverdraft !== false}
                      disabled={currentUser.id !== activeGroup.adminId || activeGroup.seasonStarted}
                      onChange={async (e) => {
                        const checked = e.target.checked;
                        await dbWriteGroup({ ...activeGroup, allowOverdraft: checked });
                      }}
                    />
                    <label htmlFor="toggleOverdraft" style={{ fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                      Allow players to go into Overdraft (negative balances)
                    </label>
                  </div>

                  {/* Start Season Status / Actions */}
                  {currentUser.id === activeGroup.adminId ? (
                    !activeGroup.seasonStarted ? (
                      <div style={{
                        background: 'rgba(0, 199, 82, 0.05)',
                        border: '1px solid rgba(0, 199, 82, 0.2)',
                        padding: '16px',
                        borderRadius: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        marginTop: '10px'
                      }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-secondary)' }}>
                          🚀 League Configuration Setup Open
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                          Players (including yourself) cannot place bets or simulate dates until you start the season.
                        </div>
                        <button
                          className="btn-primary"
                          onClick={() => setShowLockRulesConfirm(true)}
                          style={{
                            background: 'var(--color-secondary)',
                            borderColor: 'var(--color-secondary)',
                            alignSelf: 'flex-start',
                            padding: '8px 14px',
                            fontSize: '12px',
                            fontWeight: '600',
                            borderRadius: '6px'
                          }}
                        >
                          Start Season & Lock Rules
                        </button>
                      </div>
                    ) : (
                      <div style={{
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid var(--border-color)',
                        padding: '16px',
                        borderRadius: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        marginTop: '10px'
                      }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          🔒 Season Active & Rules Locked
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                          You have started the season. League configuration rules are locked and can no longer be edited.
                        </div>
                      </div>
                    )
                  ) : (
                    <div style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border-color)',
                      padding: '16px',
                      borderRadius: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      marginTop: '10px'
                    }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: activeGroup.seasonStarted ? 'var(--color-secondary)' : 'var(--color-warning)' }}>
                        {activeGroup.seasonStarted ? '🔒 Season Active & Rules Locked' : '⏳ Waiting for Admin to Start Season'}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                        {activeGroup.seasonStarted 
                          ? 'The league rules are locked and can no longer be edited by the administrator.' 
                          : 'The league administrator is currently adjusting the rules. Bets will unlock once they start the season.'}
                      </div>
                    </div>
                  )}
                </div>
              )}


              {/* Firebase Database Connection Card */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '20px', marginTop: '10px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--color-primary)' }}>Firebase Server Settings</h3>
                <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  Provide your Firebase Web Config JSON string below to enable Multiplayer Sync Mode. 
                  If left empty, the application runs in local-only Sandbox Mode.
                </p>
                
                <textarea
                  placeholder='{"apiKey": "...", "authDomain": "...", "projectId": "...", ...}'
                  rows={6}
                  value={firebaseConfig}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFirebaseConfig(val);
                  }}
                  style={{
                    width: '100%',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    padding: '10px',
                    background: 'rgba(0,0,0,0.4)',
                    border: '1px solid var(--border-color)',
                    color: '#fff',
                    borderRadius: '8px',
                    resize: 'vertical'
                  }}
                />
                {fbInstance ? (
                  <span style={{ fontSize: '11px', color: 'var(--color-secondary)', fontWeight: '600' }}>
                    ✔ Connected to Firebase Online Database
                  </span>
                ) : firebaseConfig ? (
                  <span style={{ fontSize: '11px', color: 'var(--color-danger)', fontWeight: '600' }}>
                    ✖ Invalid Firebase Config JSON
                  </span>
                ) : (
                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    Running in Offline Sandbox Mode (using localStorage)
                  </span>
                )}
              </div>

              {/* Odds Feed Settings Card */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '20px', marginTop: '10px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--color-primary)' }}>Odds Feed Settings (Personal)</h3>
                <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Configure how betting odds are synced daily. These settings are local to your browser.</p>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>Odds Synchronization Source</label>
                  <div style={{ display: 'flex', gap: '20px', fontSize: '13px', padding: '6px 0' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="oddsSource"
                        value="scrape"
                        checked={oddsSource === 'scrape'}
                        onChange={() => {
                          setOddsSource('scrape');
                          triggerOddsSync(currentDate, 'scrape');
                        }}
                      />
                      Scraped Daily Feed (Offline Fallback)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="oddsSource"
                        value="api"
                        checked={oddsSource === 'api'}
                        onChange={() => {
                          setOddsSource('api');
                          triggerOddsSync(currentDate, 'api');
                        }}
                      />
                      The Odds API (Real Betting Client)
                    </label>
                  </div>
                </div>

                {oddsSource === 'api' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600' }}>The Odds API Key</label>
                    <input
                      type="password"
                      placeholder="Paste API Key (from the-odds-api.com)"
                      value={oddsApiKey}
                      onChange={(e) => {
                        const val = e.target.value;
                        setOddsApiKey(val);
                        triggerOddsSync(currentDate, 'api', val);
                      }}
                      style={{ maxWidth: '350px', fontSize: '12px', padding: '8px' }}
                    />
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                      Your key is saved in local browser storage. Free keys are available by registering at <strong>the-odds-api.com</strong>.
                    </span>
                  </div>
                )}
              </div>

              {/* Klipy GIF Keyboard Settings Card */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '20px', marginTop: '10px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--color-primary)' }}>Klipy GIF Keyboard Settings (Personal)</h3>
                <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Configure your Klipy GIF search API key. This setting is saved locally in your browser.</p>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600' }}>Klipy API Key</label>
                  <input
                    type="password"
                    placeholder="Paste Klipy API Key (from partner.klipy.com)"
                    value={klipyApiKey}
                    onChange={(e) => setKlipyApiKey(e.target.value)}
                    style={{ maxWidth: '350px', fontSize: '12px', padding: '8px' }}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    An API Key from your **Klipy Partner Panel** dashboard is required.
                    If left blank, a fallback demo key is used.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: Rules & Scoring System */}
          {/* TAB 5: How to Play */}
          {activeTab === 'howplay' && (
            <div className="glass-panel" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Header section */}
              <div style={{ 
                borderBottom: '1px solid rgba(255,255,255,0.08)', 
                paddingBottom: '16px', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                gap: '12px' 
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '32px' }}>📖</span>
                  <div>
                    <h2 style={{ fontSize: '20px', fontWeight: '800', margin: 0, color: '#fff' }}>
                      How to Play & League Rules
                    </h2>
                    <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
                      Welcome to the tournament! Outline of game mechanics, boosts, rewards, and social features.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab('matches')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '8px',
                    borderRadius: '50%',
                    transition: 'all 0.2s'
                  }}
                  title="Close and go to Match Center"
                  onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-secondary)'}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Rules Grid */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* 1. Core Gameplay */}
                <div className="glass-panel" style={{ padding: '20px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '20px' }}>🏟️</span>
                    <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--color-primary)', margin: 0 }}>
                      1. Core Gameplay & Match Predictions
                    </h3>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: '1.6' }}>
                    <p>• <strong>Betting with Credits:</strong> Predict game outcomes (<strong>1</strong>: Home Win, <strong>X</strong>: Draw, <strong>2</strong>: Away Win) by wagering your points balance. Payouts are computed as: <code>Wager Stake x Real-Life Decimal Odds</code>.</p>
                    <p>• <strong>Only 1 Bet Per Game:</strong> You are allowed exactly <strong>1 bet per match</strong>. This can be a Single bet, a Double Chance bet, or part of a 3-Match Combo. Multiple overlapping bets on the same game are blocked.</p>
                    <p>• <strong>Early Kickoff Lock:</strong> Predictions must be submitted at least <strong>2 hours before kickoff time</strong>. Matches are locked after this window to prevent cheating.</p>
                    <div>• <strong>Tournament Stage Multipliers:</strong> Payouts scale dynamically to reward later stages and enable dramatic catchups:
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '6px', marginTop: '8px', fontSize: '11px', color: '#fff' }}>
                        <div>GW 1-3 (Groups): <strong>1.0x - 1.1x</strong></div>
                        <div>Round of 32: <strong>1.20x</strong></div>
                        <div>Round of 16: <strong>1.25x</strong></div>
                        <div>Quarterfinals: <strong>1.30x</strong></div>
                        <div>Semifinals: <strong>1.40x</strong></div>
                        <div>3rd Place & Final: <strong>1.50x</strong></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Boosts & Power-ups */}
                <div className="glass-panel" style={{ padding: '20px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '20px' }}>⚡</span>
                    <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--color-primary)', margin: 0 }}>
                      2. Boosts, Power-ups & Extra Rewards
                    </h3>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: '1.6' }}>
                    <p>Every manager starts with a limit of <strong>2 charges per boost</strong> for the entire tournament. Spend them wisely! Watch a 60s sponsored video ad in the sidebar to earn <strong>+1 extra charge</strong> (max 1/boost per league).</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '8px' }}>
                      <p>🛡️ <strong>No Loss Boost:</strong> If your prediction loses, your stake is returned in full. <em>(Disabled for the World Cup Final)</em>.</p>
                      <p>👥 <strong>Double Chance Boost:</strong> Allows choosing 2 outcomes (e.g. Home & Draw) on a single game with separate stakes. Correct returns are fully paid out.</p>
                      <p>🔥 <strong>Double Returns (Double Points):</strong> Doubles the net points won from a correct prediction.</p>
                    </div>
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px', marginTop: '4px' }}>
                      <p>• <strong>Matchday MVP Bonus:</strong> The manager who gets the most correct outcomes in a Matchday (out of 24 games) receives a bonus of <strong>{activeGroup?.mdBonusPoints ?? 100} credits</strong> at 8:00 AM daily sync.</p>
                      <p>• <strong>Daily Video Ads:</strong> Click the ad panel in the sidebar menu to watch a short sponsored clip and earn a reward of <strong>5% of the starting budget</strong> (up to 2/day).</p>
                    </div>
                  </div>
                </div>

                {/* 3. Overdraft */}
                <div className="glass-panel" style={{ padding: '20px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '20px' }}>🔴</span>
                    <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--color-primary)', margin: 0 }}>
                      3. Overdraft Mode (League Rules)
                    </h3>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: '1.6' }}>
                    <p>• <strong>Status:</strong> Overdraft is currently <strong>{activeGroup?.allowOverdraft ? 'ENABLED ✅' : 'DISABLED ❌'}</strong> in this league.</p>
                    {activeGroup?.allowOverdraft ? (
                      <>
                        <p>• <strong>Emergency Betting:</strong> When your balance falls to or below 0 credits, you can continue to place predictions on credit.</p>
                        <p>• <strong>Stake Limits:</strong> Overdraft wagers are capped at a maximum of <strong>20% of the league's starting budget</strong> ({Math.round((activeGroup?.startingBudget || 500) * 0.2)} credits) per match.</p>
                        <p>• <strong>Halved Profits:</strong> To penalize being in the red, any winning payout while in overdraft pays <strong>half the net profits</strong>. The stake is returned in full, helping you dig yourself out of the hole.</p>
                      </>
                    ) : (
                      <p>• <strong>Rules:</strong> You cannot place wagers if your balance is 0 or negative. Manage your bankroll carefully so you don't run out of points before the knockout rounds begin!</p>
                    )}
                  </div>
                </div>

                {/* 4. Social & Tracker Features */}
                <div className="glass-panel" style={{ padding: '20px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '20px' }}>💬</span>
                    <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--color-primary)', margin: 0 }}>
                      4. Social Features, Standings & Performance Tracker
                    </h3>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: '1.6' }}>
                    <p>• <strong>Banter Chat:</strong> Chat in real-time with league members, send emojis, or search and post football clips using the integrated Klipy GIF Keyboard.</p>
                    <p>• <strong>Activity Log:</strong> An automated system log posts live feed updates about every manager's bets, boost usages, and match outcome settlements.</p>
                    <p>• <strong>Leaderboard Standings:</strong> Check rankings in real-time. Highlights rank changes (e.g. ▲ Gained 2 spots) and features a multi-line SVG progression chart tracing everyone's credit history. Click any manager's name to view their categorized wins and losses ledger!</p>
                    <p>• <strong>My Tracker:</strong> Open the "Betting History" tab to view your performance stats, win accuracies for single/combo bets, and boost efficiency charts.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* BANNER AD SPOT */}
          {showBannerAd && (
            <div 
              className="glass-panel"
              style={{
                position: 'relative',
                padding: '16px 20px',
                background: SPONSORS[currentSponsorIndex].gradient,
                borderColor: SPONSORS[currentSponsorIndex].borderColor,
                borderWidth: '1px',
                borderStyle: 'solid',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '20px',
                overflow: 'hidden',
                transition: 'all 0.5s ease',
                marginTop: '12px'
              }}
            >
              {/* Decorative Subtle Glowing Background Light */}
              <div style={{
                position: 'absolute',
                top: '-50%',
                left: '-10%',
                width: '120px',
                height: '120px',
                background: SPONSORS[currentSponsorIndex].borderColor,
                filter: 'blur(40px)',
                opacity: 0.15,
                pointerEvents: 'none',
                borderRadius: '50%'
              }} />

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, zIndex: 1 }}>
                {/* Mock Logo / Icon Badge */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${SPONSORS[currentSponsorIndex].borderColor}`,
                  borderRadius: '8px',
                  padding: '8px 12px',
                  fontWeight: '900',
                  fontSize: '14px',
                  letterSpacing: '1.5px',
                  color: SPONSORS[currentSponsorIndex].color,
                  textTransform: 'uppercase',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                  minWidth: '100px',
                  textAlign: 'center'
                }}>
                  {SPONSORS[currentSponsorIndex].logoText}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ 
                      fontSize: '9px', 
                      background: 'rgba(255,255,255,0.08)', 
                      padding: '2px 6px', 
                      borderRadius: '4px', 
                      color: 'var(--color-text-muted)',
                      fontWeight: '700',
                      letterSpacing: '0.5px'
                    }}>
                      SPONSORED
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#fff' }}>
                      {SPONSORS[currentSponsorIndex].tagline}
                    </span>
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                    {SPONSORS[currentSponsorIndex].description}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--color-primary)', fontWeight: '600' }}>
                    🎁 {SPONSORS[currentSponsorIndex].promo}
                  </span>
                </div>
              </div>

              {/* Action Button & Close Button Container */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', zIndex: 1 }}>
                <a 
                  href={SPONSORS[currentSponsorIndex].link} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="btn-primary"
                  style={{
                    padding: '8px 16px',
                    fontSize: '12px',
                    borderRadius: '6px',
                    textDecoration: 'none',
                    fontWeight: '700',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 4px 10px rgba(var(--color-primary-rgb), 0.2)'
                  }}
                >
                  Visit Partner
                </a>

                <button
                  onClick={() => setShowBannerAd(false)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: 'var(--color-text-muted)',
                    borderRadius: '50%',
                    width: '28px',
                    height: '28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  title="Close Advertisement"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 74, 90, 0.15)';
                    e.currentTarget.style.color = '#ff4a5a';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                    e.currentTarget.style.color = 'var(--color-text-muted)';
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

        </div>

        {/* --- RIGHT DRAWER: Betting Slip --- */}
        {layoutMode === 'mobile' && showMobileSlip && (
          <div 
            onClick={() => setShowMobileSlip(false)}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(4px)',
              zIndex: 9998
            }}
          />
        )}

        <div style={
          layoutMode === 'mobile'
            ? {
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                maxHeight: '85vh',
                zIndex: 9999,
                display: showMobileSlip ? 'flex' : 'none',
                flexDirection: 'column',
                background: 'var(--bg-slip)',
                borderTop: '2px solid var(--color-primary)',
                borderRadius: '20px 20px 0 0',
                padding: '20px',
                overflowY: 'auto',
                boxShadow: '0 -10px 30px rgba(0,0,0,0.5)',
                transition: 'transform 0.3s ease'
              }
            : {
                display: 'flex',
                flexDirection: 'column',
                gap: '24px'
              }
        }>
          
          {layoutMode === 'desktop' && renderMeSectionCard()}
          <div className="glass-panel" style={
            layoutMode === 'mobile'
              ? {
                  padding: '10px 0',
                  background: 'transparent',
                  border: 'none',
                  boxShadow: 'none'
                }
              : {
                  padding: '20px',
                  position: 'sticky',
                  top: '32px',
                  background: 'var(--bg-slip)',
                  borderColor: 'var(--color-primary)'
                }
          }>
            {/* If mobile, show drag handle and header */}
            {layoutMode === 'mobile' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '10px' }}>
                <div style={{
                  width: '40px',
                  height: '4px',
                  background: 'rgba(255,255,255,0.2)',
                  borderRadius: '2px',
                  alignSelf: 'center'
                }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '700' }}>Betting Slip</h3>
                  <button 
                    onClick={() => setShowMobileSlip(false)}
                    style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>
            )}
            {/* Slip Tabs */}
            <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border-color)', marginBottom: '16px' }}>
              <button
                onClick={() => setSlipTab('single')}
                style={{
                  flex: 1,
                  background: 'none',
                  color: slipTab === 'single' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                  fontWeight: slipTab === 'single' ? '700' : '500',
                  padding: '8px 0',
                  fontSize: '13px',
                  borderBottom: slipTab === 'single' ? '2px solid var(--color-primary)' : 'none'
                }}
              >
                Single Prediction
              </button>
              {activeGroup && activeGroup.allowCombos !== false && (
                <button
                  onClick={() => setSlipTab('combo')}
                  style={{
                    flex: 1,
                    background: 'none',
                    color: slipTab === 'combo' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                    fontWeight: slipTab === 'combo' ? '700' : '500',
                    padding: '8px 0',
                    fontSize: '13px',
                    borderBottom: slipTab === 'combo' ? '2px solid var(--color-primary)' : 'none'
                  }}
                >
                  Combo Ticket ({comboSelections.length}/3)
                </button>
              )}
            </div>

            {/* TAB CONTENT: Single Bet Slip */}
            {slipTab === 'single' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {!selectedMatch ? (
                  <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
                    <Info size={24} style={{ color: 'var(--color-text-muted)', marginBottom: '6px' }} />
                    <p>Click on any match outcome or team odds to add to this slip.</p>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>BET SLIP</span>
                      <button onClick={() => setSelectedMatch(null)} style={{ background: 'none', color: 'var(--color-danger)' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {activeMemberInfo && activeGroup && (
                      activeGroup.allowOverdraft !== false ? (
                        activeMemberInfo.balance <= 0 && (
                          <div style={{
                            background: 'rgba(215, 0, 0, 0.08)',
                            border: '1px solid var(--color-danger)',
                            padding: '10px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            color: '#ff9b9b',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2px',
                            marginTop: '4px'
                          }}>
                            <div style={{ fontWeight: '700' }}>🔴 Overdraft Mode Active</div>
                            <div>You are at or below 0 credits. Max stake is 20% of starting budget ({Math.round(activeGroup.startingBudget * 0.2)} credits). Winnings are halved.</div>
                          </div>
                        )
                      ) : (
                        activeMemberInfo.balance <= 0 && (
                          <div style={{
                            background: 'rgba(215, 0, 0, 0.08)',
                            border: '1px solid var(--color-danger)',
                            padding: '10px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            color: '#ff9b9b',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2px',
                            marginTop: '4px'
                          }}>
                            <div style={{ fontWeight: '700' }}>🔴 Overdraft Disabled</div>
                            <div>You have insufficient credits. Overdraft is disabled in this league.</div>
                          </div>
                        )
                      )
                    )}

                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', fontSize: '12px' }}>
                      <div style={{ fontWeight: '700', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span><TeamFlag teamName={selectedMatch.homeTeam} /> {selectedMatch.homeTeam}</span>
                        <span style={{ color: 'var(--color-text-muted)' }}>vs</span>
                        <span><TeamFlag teamName={selectedMatch.awayTeam} /> {selectedMatch.awayTeam}</span>
                      </div>
                      <span style={{ color: 'var(--color-text-secondary)' }}>Stage: {selectedMatch.matchdayName} (Multiplier: x{getMatchdayMultiplier(selectedMatch.matchday).toFixed(2)})</span>
                    </div>

                    {/* Outcome Choice Display */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Prediction</label>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {['1', 'X', '2'].map(out => {
                          const odds = out === '1' ? selectedMatch.homeOdds : out === 'X' ? selectedMatch.drawOdds : selectedMatch.awayOdds;
                          const active = singleOutcome === out;
                          const isDCSecond = dcOutcome2 === out;
                          return (
                            <button
                              key={out}
                              onClick={() => {
                                if (activePowerup === 'doubleChance') {
                                  if (active) {
                                    setSingleOutcome(null);
                                  } else if (isDCSecond) {
                                    setDcOutcome2(null);
                                  } else if (!singleOutcome) {
                                    setSingleOutcome(out as any);
                                  } else if (!dcOutcome2) {
                                    setDcOutcome2(out as any);
                                  }
                                } else {
                                  setSingleOutcome(out as any);
                                }
                              }}
                              style={{
                                flex: 1,
                                padding: '8px 0',
                                borderRadius: '6px',
                                background: active ? 'rgba(0, 199, 82, 0.2)' : isDCSecond ? 'rgba(0, 255, 135, 0.15)' : 'rgba(0,0,0,0.3)',
                                border: active ? '1px solid var(--color-secondary)' : isDCSecond ? '1px solid var(--color-secondary)' : '1px solid rgba(255,255,255,0.05)',
                                color: '#fff',
                                fontSize: '12px',
                                fontWeight: '700',
                                boxShadow: active ? '0 0 10px rgba(0, 199, 82, 0.15)' : 'none',
                                transition: 'var(--transition-smooth)'
                              }}
                            >
                              {out === '1' ? 'Home' : out === 'X' ? 'Draw' : 'Away'} ({odds})
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Power-up Activation Badges */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                      <label style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Apply Simulation Power-up:</label>
                      
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {/* No Loss Powerup badge */}
                        <button
                          disabled={selectedMatch.matchdayName.includes('Final') && !selectedMatch.matchdayName.includes('Third')}
                          onClick={() => {
                            if (activePowerup === 'noLoss') setActivePowerup(null);
                            else {
                              setActivePowerup('noLoss');
                              setDcOutcome2(null); // disable double chance selections
                              setDcStake2('');
                            }
                          }}
                          style={{
                            flex: 1,
                            padding: '6px 4px',
                            borderRadius: '6px',
                            fontSize: '10px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '2px',
                            background: activePowerup === 'noLoss' ? 'rgba(0, 191, 255, 0.15)' : 'rgba(0,0,0,0.2)',
                            border: activePowerup === 'noLoss' ? '1px solid var(--color-info)' : '1px solid transparent',
                            color: activePowerup === 'noLoss' ? '#fff' : 'var(--color-text-secondary)'
                          }}
                        >
                          <Shield size={12} style={{ color: 'var(--color-info)' }} />
                          <span>No Loss</span>
                        </button>

                        {/* Double Chance Powerup badge */}
                        <button
                          onClick={() => {
                            if (activePowerup === 'doubleChance') {
                              setActivePowerup(null);
                              setDcOutcome2(null);
                              setDcStake2('');
                            } else {
                              setActivePowerup('doubleChance');
                            }
                          }}
                          style={{
                            flex: 1,
                            padding: '6px 4px',
                            borderRadius: '6px',
                            fontSize: '10px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '2px',
                            background: activePowerup === 'doubleChance' ? 'rgba(0, 255, 135, 0.15)' : 'rgba(0,0,0,0.2)',
                            border: activePowerup === 'doubleChance' ? '1px solid var(--color-secondary)' : '1px solid transparent',
                            color: activePowerup === 'doubleChance' ? '#fff' : 'var(--color-text-secondary)'
                          }}
                        >
                          <Users size={12} style={{ color: 'var(--color-secondary)' }} />
                          <span>Double Chance</span>
                        </button>

                        {/* Double Points Powerup badge */}
                        <button
                          onClick={() => {
                            if (activePowerup === 'doublePoints') setActivePowerup(null);
                            else {
                              setActivePowerup('doublePoints');
                              setDcOutcome2(null);
                              setDcStake2('');
                            }
                          }}
                          style={{
                            flex: 1,
                            padding: '6px 4px',
                            borderRadius: '6px',
                            fontSize: '10px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '2px',
                            background: activePowerup === 'doublePoints' ? 'rgba(255, 183, 0, 0.15)' : 'rgba(0,0,0,0.2)',
                            border: activePowerup === 'doublePoints' ? '1px solid var(--color-warning)' : '1px solid transparent',
                            color: activePowerup === 'doublePoints' ? '#fff' : 'var(--color-text-secondary)'
                          }}
                        >
                          <Zap size={12} style={{ color: 'var(--color-warning)' }} />
                          <span>Double Pts</span>
                        </button>
                      </div>
                    </div>

                    {/* Stake Inputs */}
                    {activePowerup === 'doubleChance' ? (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                            Stake ({singleOutcome || 'Bet A'}):
                          </label>
                          <input
                            type="number"
                            placeholder="Pts"
                            value={singleStake}
                            onChange={(e) => setSingleStake(e.target.value)}
                            style={{ padding: '8px', fontSize: '13px' }}
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                            Stake ({dcOutcome2 || 'Bet B'}):
                          </label>
                          <input
                            type="number"
                            placeholder="Pts"
                            value={dcStake2}
                            onChange={(e) => setDcStake2(e.target.value)}
                            style={{ padding: '8px', fontSize: '13px' }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Wager Credits</label>
                        <input
                          type="number"
                          placeholder="Points to wager"
                          value={singleStake}
                          onChange={(e) => setSingleStake(e.target.value)}
                          style={{ padding: '10px', fontSize: '14px' }}
                        />
                      </div>
                    )}

                    {/* Possible Return Summary info */}
                    {singleStake && (
                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-secondary)' }}>
                          <span>Total Stake:</span>
                          <span>{activePowerup === 'doubleChance' ? Number(singleStake) + Number(dcStake2) : Number(singleStake)} pts</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700' }} className="text-gold">
                          <span>Max Potential Returns:</span>
                          <span>
                            {activePowerup === 'doubleChance' ? (() => {
                              const match = selectedMatch;
                              const mult = getMatchdayMultiplier(match.matchday);
                              const pot1 = Number(singleStake) * (singleOutcome === '1' ? match.homeOdds : singleOutcome === 'X' ? match.drawOdds : match.awayOdds) * mult;
                              const pot2 = Number(dcStake2) * (dcOutcome2 === '1' ? match.homeOdds : dcOutcome2 === 'X' ? match.drawOdds : match.awayOdds) * mult;
                              return Math.round(Math.max(pot1, pot2));
                            })() : (() => {
                              const match = selectedMatch;
                              const odds = singleOutcome === '1' ? match.homeOdds : singleOutcome === 'X' ? match.drawOdds : match.awayOdds;
                              const pUpMult = activePowerup === 'doublePoints' ? 2 : 1;
                              const val = Number(singleStake) * odds * getMatchdayMultiplier(match.matchday) * pUpMult;
                              return isNaN(val) ? 0 : Math.round(val);
                            })()} pts
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Submission Button */}
                    <button
                      onClick={handlePlaceSingleBet}
                      className="btn-primary"
                      style={{ padding: '12px', width: '100%', fontSize: '14px', borderRadius: '8px', marginTop: '6px' }}
                    >
                      Confirm Prediction
                    </button>
                  </>
                )}
              </div>
            )}

            {/* TAB CONTENT: Combo Bet Slip */}
            {slipTab === 'combo' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>COMBO TICKET (MUST CHOOSE EXACTLY 3)</span>
                  {comboSelections.length > 0 && (
                    <button onClick={() => setComboSelections([])} style={{ background: 'none', color: 'var(--color-danger)' }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                {activeMemberInfo && activeGroup && (
                  activeGroup.allowOverdraft !== false ? (
                    activeMemberInfo.balance <= 0 && (
                      <div style={{
                        background: 'rgba(215, 0, 0, 0.08)',
                        border: '1px solid var(--color-danger)',
                        padding: '10px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        color: '#ff9b9b',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                        marginTop: '4px'
                      }}>
                        <div style={{ fontWeight: '700' }}>🔴 Overdraft Mode Active</div>
                        <div>You are at or below 0 credits. Max stake is 20% of starting budget ({Math.round(activeGroup.startingBudget * 0.2)} credits). Winnings are halved.</div>
                      </div>
                    )
                  ) : (
                    activeMemberInfo.balance <= 0 && (
                      <div style={{
                        background: 'rgba(215, 0, 0, 0.08)',
                        border: '1px solid var(--color-danger)',
                        padding: '10px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        color: '#ff9b9b',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                        marginTop: '4px'
                      }}>
                        <div style={{ fontWeight: '700' }}>🔴 Overdraft Disabled</div>
                        <div>You have insufficient credits. Overdraft is disabled in this league.</div>
                      </div>
                    )
                  )
                )}

                {comboSelections.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
                    <Info size={24} style={{ color: 'var(--color-text-muted)', marginBottom: '6px' }} />
                    <p>Add matches to the combo slip by selecting +Home, +Draw, or +Away in the Match Center.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {comboSelections.map(sel => {
                      const match = matches.find(m => m.id === sel.matchId)!;
                      const odds = sel.outcome === '1' ? match.homeOdds : sel.outcome === 'X' ? match.drawOdds : match.awayOdds;
                      return (
                        <div key={sel.matchId} style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                          <div>
                            <div style={{ fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span><TeamFlag teamName={match.homeTeam} /> {match.homeTeam}</span>
                              <span style={{ color: 'var(--color-text-muted)' }}>vs</span>
                              <span><TeamFlag teamName={match.awayTeam} /> {match.awayTeam}</span>
                            </div>
                            <span style={{ color: 'var(--color-text-secondary)' }}>
                              Predicted: <strong>{sel.outcome === '1' ? 'Home Win' : sel.outcome === 'X' ? 'Draw' : 'Away Win'}</strong> ({odds})
                            </span>
                          </div>
                          <button onClick={() => handleRemoveFromCombo(sel.matchId)} style={{ background: 'none', color: 'rgba(255,74,90,0.6)' }}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      );
                    })}

                    {comboSelections.length === 3 && (
                      <>
                        {/* Combined Odds readout */}
                        {activeGroup.toggle3MatchBonus && (
                          <div style={{ background: 'rgba(var(--color-primary-rgb), 0.08)', border: '1px solid rgba(var(--color-primary-rgb), 0.2)', padding: '8px 12px', borderRadius: '6px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Sparkles size={12} style={{ color: 'var(--color-primary)' }} />
                            <span><strong>3-Match Combo Bonus Active:</strong> Extra points payout equivalent to 50% of your wager returns on success!</span>
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span>Combined Ticket Odds:</span>
                          <span style={{ fontWeight: '700', color: 'var(--color-secondary)' }}>
                            {(() => {
                              const comb = comboSelections.reduce((acc, s) => {
                                const m = matches.find(rm => rm.id === s.matchId)!;
                                const o = s.outcome === '1' ? m.homeOdds : s.outcome === 'X' ? m.drawOdds : m.awayOdds;
                                return acc * o;
                              }, 1);
                              return comb.toFixed(2);
                            })()}
                          </span>
                        </div>

                        {/* Wager inputs */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Combo Wager Points</label>
                          <input
                            type="number"
                            placeholder="Points"
                            value={comboStake}
                            onChange={(e) => setComboStake(e.target.value)}
                            style={{ padding: '8px', fontSize: '13px' }}
                          />
                        </div>

                        {comboStake && (
                          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-secondary)' }}>
                              <span>Stake:</span>
                              <span>{comboStake} pts</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700' }} className="text-gold">
                              <span>Potential Returns:</span>
                              <span>
                                {(() => {
                                  const combOdds = comboSelections.reduce((acc, s) => {
                                    const m = matches.find(rm => rm.id === s.matchId)!;
                                    const o = s.outcome === '1' ? m.homeOdds : s.outcome === 'X' ? m.drawOdds : m.awayOdds;
                                    return acc * o;
                                  }, 1);
                                  // Find maximum matchday stage multiplier in selected matches
                                  const maxMult = comboSelections.reduce((acc, s) => {
                                    const m = matches.find(rm => rm.id === s.matchId)!;
                                    return Math.max(acc, getMatchdayMultiplier(m.matchday));
                                  }, 1.0);

                                  let returns = Number(comboStake) * combOdds * maxMult;
                                  if (activeGroup.toggle3MatchBonus) {
                                    returns += Number(comboStake) * 0.5; // combo bonus points
                                    returns = Math.round(returns);
                                  }
                                  return Math.round(returns);
                                })()} pts
                              </span>
                            </div>
                          </div>
                        )}

                        <button
                          onClick={handlePlaceComboBet}
                          className="btn-primary"
                          style={{ padding: '12px', width: '100%', fontSize: '14px', borderRadius: '8px', marginTop: '6px' }}
                        >
                          Place Combo Bet
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>

      </main>

      {/* Floating Mobile Bet Slip Toggle */}
      {layoutMode === 'mobile' && !showMobileSlip && (
        <button
          onClick={() => setShowMobileSlip(true)}
          style={{
            position: 'absolute',
            bottom: '24px',
            right: '24px',
            background: 'var(--color-primary)',
            color: '#fff',
            border: 'none',
            borderRadius: '50px',
            padding: '12px 24px',
            fontSize: '14px',
            fontWeight: '700',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 8px 24px rgba(var(--color-primary-rgb), 0.4)',
            zIndex: 9997,
            cursor: 'pointer',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: 'rgba(255,255,255,0.1)'
          }}
        >
          <span>🎫</span>
          <span>Bet Slip</span>
          {((singleOutcome && selectedMatch) || comboSelections.length > 0) && (
            <span style={{
              background: 'var(--color-secondary)',
              color: '#000',
              borderRadius: '50%',
              width: '18px',
              height: '18px',
              fontSize: '10px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '800'
            }}>
              {slipTab === 'single' ? (selectedMatch ? 1 : 0) : comboSelections.length}
            </span>
          )}
        </button>
      )}

      {/* --- CREATE LEAGUE DIALOG MODAL --- */}
      {showCreateModal && (
        <div style={{
          position: layoutMode === 'mobile' ? 'absolute' : 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <form
            onSubmit={handleCreateGroup}
            className="glass-panel"
            style={{
              padding: '28px',
              maxWidth: '440px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
              background: 'var(--bg-slip)'
            }}
          >
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: '700' }}>Create a New Predictions League</h3>
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>Set up custom rules and invite your friends to predict the World Cup.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: '600' }}>League Name</label>
              <input
                type="text"
                placeholder="e.g. Work World Cup League"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: '600' }}>Starting Budget (Points)</label>
              <select
                value={newStartingBudget}
                onChange={(e) => setNewStartingBudget(Number(e.target.value))}
              >
                <option value="100">100 Credits</option>
                <option value="200">200 Credits</option>
                <option value="500">500 Credits</option>
                <option value="1000">1000 Credits</option>
                <option value="2000">2000 Credits</option>
                <option value="5000">5000 Credits</option>
                <option value="10000">10000 Credits</option>
                <option value="20000">20000 Credits</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
              <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: '700' }}>Custom Bonuses</span>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="modalCombo"
                  checked={new3MatchBonus}
                  onChange={(e) => setNew3MatchBonus(e.target.checked)}
                />
                <label htmlFor="modalCombo" style={{ fontSize: '12px', cursor: 'pointer' }}>
                  Enable 3-Match Combo Bonus (+50% of stake back)
                </label>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="modalMVP"
                    checked={newMdBonus}
                    onChange={(e) => setNewMdBonus(e.target.checked)}
                  />
                  <label htmlFor="modalMVP" style={{ fontSize: '12px', cursor: 'pointer' }}>
                    Enable Matchday MVP Bonus
                  </label>
                </div>

                {newMdBonus && (
                  <select
                    value={newMdBonusPoints}
                    onChange={(e) => setNewMdBonusPoints(Number(e.target.value))}
                    style={{ marginLeft: '20px', padding: '6px', fontSize: '12px', maxWidth: '120px' }}
                  >
                    <option value="50">50 Points</option>
                    <option value="100">100 Points</option>
                    <option value="200">200 Points</option>
                    <option value="500">500 Points</option>
                  </select>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <input
                  type="checkbox"
                  id="modalOverdraft"
                  checked={newAllowOverdraft}
                  onChange={(e) => setNewAllowOverdraft(e.target.checked)}
                />
                <label htmlFor="modalOverdraft" style={{ fontSize: '12px', cursor: 'pointer' }}>
                  Enable Overdraft (allow negative balances)
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowCreateModal(false)}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                style={{ flex: 1 }}
              >
                Create League
              </button>
            </div>
          </form>
        </div>
      )}

      {/* --- MEMBER BETTING HISTORY MODAL --- */}
      {selectedMemberForHistory && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '20px'
        }}>
          <div className="glass-panel" style={{
            padding: '24px',
            maxWidth: '650px',
            width: '100%',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            background: 'var(--bg-card)',
            border: '1px solid rgba(var(--color-primary-rgb), 0.25)',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
            borderRadius: '16px',
            overflow: 'hidden'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'var(--color-primary)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: '700',
                  fontSize: '14px'
                }}>
                  {selectedMemberForHistory.username.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0, color: '#fff' }}>
                    {selectedMemberForHistory.username}'s Betting History
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                    Accurate up to current simulated date: {currentDate}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedMemberForHistory(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-muted)',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Content body scrollable */}
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', paddingRight: '4px' }}>
              
              {/* Aggregates Summary card */}
              {(() => {
                const history = getMemberHistory(selectedMemberForHistory.userId);
                return (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div style={{ background: 'rgba(0, 199, 82, 0.08)', border: '1px solid rgba(0, 199, 82, 0.15)', padding: '12px', borderRadius: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Total Net Won</span>
                        <span style={{ fontSize: '18px', fontWeight: '800', color: 'var(--color-status-won)', marginTop: '4px' }}>+{history.totalWon.toFixed(0)} pts</span>
                        <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{history.wins.length} successful bets</span>
                      </div>
                      <div style={{ background: 'rgba(215, 0, 0, 0.08)', border: '1px solid rgba(215, 0, 0, 0.15)', padding: '12px', borderRadius: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>Total Lost</span>
                        <span style={{ fontSize: '18px', fontWeight: '800', color: 'var(--color-danger)', marginTop: '4px' }}>-{history.totalLost.toFixed(0)} pts</span>
                        <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{history.losses.length} failed bets</span>
                      </div>
                    </div>

                    {/* Section: Wins */}
                    <div>
                      <h4 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-status-won)', borderBottom: '1px solid rgba(0, 199, 82, 0.2)', paddingBottom: '4px', marginBottom: '8px' }}>
                        Wins ({history.wins.length})
                      </h4>
                      {history.wins.length === 0 ? (
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontStyle: 'italic', padding: '8px 0' }}>No wins recorded yet</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {history.wins.map(w => (
                            <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: '8px', fontSize: '12px' }}>
                              <div>
                                <div style={{ fontWeight: '600', color: '#fff' }}>{w.details}</div>
                                <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                                  {w.type} • Odds: {w.odds.toFixed(2)}
                                </div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontWeight: '700', color: 'var(--color-status-won)' }}>+{w.net.toFixed(0)} pts</div>
                                <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px' }}>Stake: {w.stake} • Ret: {w.returned.toFixed(0)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Section: Losses */}
                    <div>
                      <h4 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-danger)', borderBottom: '1px solid rgba(215, 0, 0, 0.2)', paddingBottom: '4px', marginBottom: '8px' }}>
                        Losses ({history.losses.length})
                      </h4>
                      {history.losses.length === 0 ? (
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontStyle: 'italic', padding: '8px 0' }}>No losses recorded yet</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {history.losses.map(l => (
                            <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: '8px', fontSize: '12px' }}>
                              <div>
                                <div style={{ fontWeight: '600', color: '#fff' }}>{l.details}</div>
                                <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                                  {l.type} • Odds: {l.odds.toFixed(2)}
                                </div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontWeight: '700', color: 'var(--color-danger)' }}>-{l.stake} pts</div>
                                <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px' }}>Stake lost</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
            
            {/* Footer close */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '4px' }}>
              <button
                onClick={() => setSelectedMemberForHistory(null)}
                className="btn-secondary"
                style={{ padding: '8px 16px', fontSize: '12px', borderRadius: '6px' }}
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- BET RESOLUTION POPUP SUMMARY MODAL --- */}
      {betsToAcknowledge.length > 0 && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10005,
          padding: '20px'
        }}>
          <div className="glass-panel pulse-gold-border" style={{
            padding: '28px',
            maxWidth: '500px',
            width: '100%',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            background: 'var(--bg-card)',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
            borderRadius: '16px',
            border: '1px solid rgba(var(--color-primary-rgb), 0.25)',
            overflow: 'hidden'
          }}>
            {/* Title / Header */}
            <div style={{ textAlign: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px' }}>
              <span style={{ fontSize: '32px' }}>📊</span>
              <h3 style={{ fontSize: '18px', fontWeight: '800', margin: '8px 0 4px', color: '#fff' }}>
                New Match Resolutions!
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: 0 }}>
                Here is how your recent bets resolved:
              </p>
            </div>

            {/* Bet list */}
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px' }}>
              {betsToAcknowledge.map(b => {
                const info = getBetDetailsForSummary(b);
                return (
                  <div key={b.id} style={{
                    padding: '12px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px'
                  }}>
                    <div>
                      <span style={{ fontWeight: '700', fontSize: '10px', textTransform: 'uppercase', color: 'var(--color-primary)', display: 'block', marginBottom: '2px' }}>
                        {info.title}
                      </span>
                      <span style={{ color: '#fff', fontWeight: '500' }}>
                        {info.details}
                      </span>
                    </div>
                    <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <span style={{
                        fontSize: '10px',
                        fontWeight: '700',
                        color: info.color,
                        background: `${info.color}15`,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        display: 'inline-block',
                        marginBottom: '4px'
                      }}>
                        {info.statusLabel}
                      </span>
                      <span style={{
                        display: 'block',
                        fontWeight: '700',
                        color: info.netChange >= 0 ? 'var(--color-status-won)' : 'var(--color-status-lost)'
                      }}>
                        {info.netChange >= 0 ? `+${info.netChange.toFixed(0)}` : info.netChange.toFixed(0)} pts
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Performance Summary Card */}
            {(() => {
              let netProfit = 0;
              betsToAcknowledge.forEach(b => {
                const info = getBetDetailsForSummary(b);
                netProfit += info.netChange;
              });

              return (
                <div style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '10px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Net Session Change:</span>
                    <span style={{
                      fontWeight: '800',
                      color: netProfit >= 0 ? 'var(--color-status-won)' : 'var(--color-status-lost)'
                    }}>
                      {netProfit >= 0 ? `+${netProfit.toFixed(0)}` : netProfit.toFixed(0)} credits
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px' }}>
                    <span style={{ color: '#fff', fontWeight: '600' }}>Your Total Credits:</span>
                    <span className="text-gold" style={{ fontWeight: '800' }}>
                      {activeMemberInfo?.balance ?? 0} pts
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Acknowledge Button */}
            <button
              onClick={() => {
                // Save acknowledged IDs
                const savedAck = localStorage.getItem('acknowledged_bets');
                const ackList = savedAck ? JSON.parse(savedAck) : [];
                betsToAcknowledge.forEach(b => ackList.push(b.id));
                localStorage.setItem('acknowledged_bets', JSON.stringify(ackList));
                setBetsToAcknowledge([]);
              }}
              className="btn-primary"
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '10px',
                fontWeight: '700',
                fontSize: '13px'
              }}
            >
              Great, Continue!
            </button>
          </div>
        </div>
      )}

      {/* --- START SEASON / LOCK RULES CONFIRMATION DIALOG MODAL --- */}
      {showLockRulesConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10010,
          padding: '20px'
        }}>
          <div className="glass-panel pulse-gold-border" style={{
            padding: '28px',
            maxWidth: '440px',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            background: 'var(--bg-slip)',
            border: '1px solid var(--color-primary)',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
            borderRadius: '16px',
            textAlign: 'center'
          }}>
            <div>
              <span style={{ fontSize: '36px' }}>🔒</span>
              <h3 style={{ fontSize: '18px', fontWeight: '800', margin: '12px 0 6px', color: '#fff' }}>
                Lock In League Rules?
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: '1.5', margin: 0 }}>
                Are you sure you want to start the season and lock league rules? You won't be able to change the starting budget or allowed bet types after this action.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowLockRulesConfirm(false)}
                style={{ flex: 1, padding: '10px 0', fontSize: '12px', fontWeight: '700', borderRadius: '8px' }}
              >
                No, Go Back
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={async () => {
                  if (activeGroup) {
                    await dbWriteGroup({ ...activeGroup, seasonStarted: true });
                    alert("Season started! League rules are now locked.");
                  }
                  setShowLockRulesConfirm(false);
                }}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  fontSize: '12px',
                  fontWeight: '700',
                  borderRadius: '8px',
                  background: 'var(--color-secondary)',
                  borderColor: 'var(--color-secondary)'
                }}
              >
                Confirm & Lock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- FIREBASE MULTIPLAYER AUTHENTICATION MODAL --- */}
      {fbInstance && !isOnlineLoggedIn && (
        <div style={{
          position: layoutMode === 'mobile' ? 'absolute' : 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(10, 15, 30, 0.95)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '20px'
        }}>
          <div className="glass-panel" style={{
            padding: '32px',
            maxWidth: '400px',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            background: 'var(--bg-slip)',
            border: '1px solid var(--color-primary)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
          }}>
            <div style={{ textAlign: 'center' }}>
              <Trophy style={{ color: 'var(--color-primary)', width: '48px', height: '48px', margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: '20px', fontWeight: '800' }}>Online Multiplayer Login</h3>
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                Join the online World Cup 2026 Prediction league and sync in real-time with other players.
              </p>
            </div>

            {/* Google Sign In Button */}
            <button
              onClick={async () => {
                try {
                  await signInWithGooglePopup(fbInstance.auth, fbInstance.googleProvider);
                  alert("Successfully signed in with Google!");
                } catch (e: any) {
                  alert("Google Sign-In failed: " + e.message);
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                padding: '12px',
                width: '100%',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                background: '#ffffff',
                color: '#1f2937',
                border: 'none',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.47h4.84c-.21 1.12-.84 2.07-1.8 2.71v2.24h2.91c1.7-1.56 2.69-3.86 2.69-6.58z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.2l-2.91-2.24c-.8.54-1.84.87-3.05.87-2.35 0-4.33-1.59-5.04-3.73H.95v2.3C2.43 15.89 5.5 18 9 18z"/>
                <path fill="#FBBC05" d="M3.96 10.7a5.4 5.4 0 0 1 0-3.4V5H.95a9 9 0 0 0 0 8l3.01-2.3z"/>
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35L15 2.1C13.47.7 11.43 0 9 0 5.5 0 2.43 2.11.95 5.3l3.01 2.3c.71-2.14 2.69-3.73 5.04-3.73z"/>
              </svg>
              Sign In with Google
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--color-text-muted)', fontSize: '11px' }}>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }}></div>
              <span>OR EMAIL / PASSWORD</span>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }}></div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: '600' }}>Email Address</label>
                <input
                  type="email"
                  placeholder="name@example.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  style={{ padding: '10px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: '600' }}>Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  style={{ padding: '10px' }}
                />
              </div>
            </div>

            <button
              onClick={async () => {
                if (!authEmail.trim() || !authPassword.trim()) {
                  alert("Please enter both email and password.");
                  return;
                }
                try {
                  if (authMode === 'login') {
                    await logInWithEmail(fbInstance.auth, authEmail, authPassword);
                    alert("Logged in successfully!");
                  } else {
                    await signUpWithEmail(fbInstance.auth, authEmail, authPassword);
                    alert("Account created and logged in successfully!");
                  }
                } catch (e: any) {
                  alert("Authentication failed: " + e.message);
                }
              }}
              className="btn-primary"
              style={{ padding: '12px', fontSize: '14px', borderRadius: '8px', fontWeight: '700' }}
            >
              {authMode === 'login' ? 'Log In with Email' : 'Sign Up with Email'}
            </button>

            <div style={{ textAlign: 'center', fontSize: '12px' }}>
              {authMode === 'login' ? (
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  Don't have an account?{' '}
                  <button
                    onClick={() => setAuthMode('signup')}
                    style={{ background: 'none', color: 'var(--color-primary)', fontWeight: '600', textDecoration: 'underline' }}
                  >
                    Sign up
                  </button>
                </span>
              ) : (
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  Already have an account?{' '}
                  <button
                    onClick={() => setAuthMode('login')}
                    style={{ background: 'none', color: 'var(--color-primary)', fontWeight: '600', textDecoration: 'underline' }}
                  >
                    Log in
                  </button>
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--color-text-muted)', fontSize: '11px', marginTop: '10px' }}>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }}></div>
              <span>OR BACKOUT</span>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }}></div>
            </div>

            <button
              onClick={() => {
                setFirebaseConfig('');
                localStorage.removeItem('wc_firebase_config');
              }}
              style={{
                background: 'rgba(255, 74, 90, 0.1)',
                color: 'var(--color-danger)',
                border: '1px solid rgba(255, 74, 90, 0.3)',
                padding: '8px',
                borderRadius: '8px',
                fontSize: '12px',
                cursor: 'pointer',
                width: '100%'
              }}
            >
              Disconnect Firebase & Return to Sandbox
            </button>
          </div>
        </div>
      )}

      {/* Toast Notifications Container */}
      <div className="toast-container" style={layoutMode === 'mobile' ? { position: 'absolute', top: '16px', right: '16px', width: 'calc(100% - 32px)' } : {}}>
        {notifications.map(n => {
          let Icon = Info;
          if (n.type === 'success') Icon = CheckCircle;
          if (n.type === 'error' || n.type === 'warning') Icon = AlertCircle;
          
          return (
            <div key={n.id} className={`toast-item toast-${n.type}`}>
              <Icon className="toast-icon" size={16} />
              <div className="toast-content">{n.message}</div>
              <button 
                onClick={() => setNotifications(prev => prev.filter(item => item.id !== n.id))} 
                className="toast-close"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Reward Ads Simulator Overlay */}
      {adActive && (
        <div style={{
          position: layoutMode === 'mobile' ? 'absolute' : 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(1, 1, 1, 0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          zIndex: 11000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff',
          padding: '20px',
          textAlign: 'center'
        }}>
          {/* Ad Player Window */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(20, 20, 26, 0.8) 0%, rgba(9, 9, 11, 0.95) 100%)',
            border: '1px solid rgba(var(--color-primary-rgb), 0.25)',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(var(--color-primary-rgb), 0.15)',
            borderRadius: '20px',
            padding: '40px',
            maxWidth: '500px',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '24px',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* Pulsing background effect */}
            <div style={{
              position: 'absolute',
              top: '-50%',
              left: '-50%',
              width: '200%',
              height: '200%',
              background: 'radial-gradient(circle, rgba(var(--color-primary-rgb), 0.08) 0%, transparent 60%)',
              pointerEvents: 'none'
            }} />

            {/* sponsored badge */}
            <div style={{
              background: 'rgba(var(--color-primary-rgb), 0.15)',
              border: '1px solid rgba(var(--color-primary-rgb), 0.3)',
              color: '#a1c2ff',
              padding: '6px 14px',
              borderRadius: '30px',
              fontSize: '11px',
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <Sparkles size={12} style={{ color: 'var(--color-warning)' }} /> Sponsored Partner Video
            </div>

            {/* Video Placeholder Box */}
            <div style={{
              width: '100%',
              aspectRatio: '16/9',
              background: '#040406',
              border: '1px solid rgba(255,255,255,0.04)',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              boxShadow: 'inset 0 4px 20px rgba(0,0,0,0.8)',
              position: 'relative'
            }}>
              {/* Spinner */}
              <RefreshCw className="pulse-gold-border" size={32} style={{ color: 'var(--color-primary)', animation: 'spin 2s linear infinite', borderRadius: '50%', padding: '4px' }} />
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: '600' }}>Streaming Sponsored Ad...</div>
              
              {/* Countdown corner */}
              <div style={{
                position: 'absolute',
                bottom: '12px',
                right: '12px',
                background: 'rgba(215, 0, 0, 0.85)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: '700',
                color: '#ffffff',
                letterSpacing: '0.5px'
              }}>
                Unskippable • {adCountdown}s
              </div>
            </div>

            {/* Description and Reward Progress */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 1 }}>
              <div style={{ fontSize: '15px', fontWeight: '700', color: '#ffffff' }}>
                {adDescription}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                Please watch the unskippable video to unlock your rewards. Winnings multipliers and boosts will activate immediately upon completion.
              </div>
            </div>

            {/* Progress bar */}
            <div style={{
              width: '100%',
              height: '4px',
              background: 'rgba(255,255,255,0.06)',
              borderRadius: '2px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${((adDuration - adCountdown) / adDuration) * 100}%`,
                height: '100%',
                background: 'linear-gradient(90deg, var(--color-primary) 0%, var(--color-secondary) 100%)',
                transition: 'width 1s linear'
              }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function WinnerPredictionWidget({
  matches,
  activeGroup,
  activeMemberInfo,
  dbWriteGroup,
  writeChatMessage,
  currentUser,
  currentDate,
  currentTime,
  runSponsoredAd,
  alert
}: {
  matches: Match[];
  activeGroup: Group | null;
  activeMemberInfo: GroupMember | null;
  dbWriteGroup: (group: Group) => Promise<void>;
  writeChatMessage: (text: string, type: 'chat' | 'activity', gifUrl?: string) => Promise<void>;
  currentUser: User;
  currentDate: string;
  currentTime: string;
  runSponsoredAd: (duration: number, description: string, onCompleteAction: () => void) => void;
  alert: (message: string) => void;
}) {
  const allTeams = useMemo(() => {
    return Object.values(GROUPS_TEAMS).flat().sort();
  }, []);

  const firstMatchKickoff = new Date(2026, 5, 11, 13, 0); // 2026-06-11 13:00
  const [cy, cm, cd] = currentDate.split('-').map(Number);
  const [ch, cmin] = currentTime.split(':').map(Number);
  const currentSimDateTime = new Date(cy, cm - 1, cd, ch, cmin);
  const beforeFirstKickoff = currentSimDateTime < firstMatchKickoff;

  const groupMatches = matches.filter(m => m.matchday <= 3);
  const allGroupFinished = groupMatches.every(m => m.status === 'finished');

  const userPrediction = activeMemberInfo?.winnerPrediction;
  const predictionCount = activeMemberInfo?.winnerPredictionCount || 1;
  const isEliminated = userPrediction ? isTeamEliminated(userPrediction, matches) : false;

  const canChangePrediction = beforeFirstKickoff || allGroupFinished || !userPrediction || isEliminated;
  const requiresAd = !beforeFirstKickoff && (allGroupFinished || isEliminated) && !!userPrediction;

  const availableTeams = useMemo(() => {
    if (beforeFirstKickoff) {
      return allTeams;
    }
    // After group stage, only allow non-eliminated teams
    return allTeams.filter(t => !isTeamEliminated(t, matches));
  }, [matches, beforeFirstKickoff, allTeams]);

  const handlePredictWinner = async (team: string) => {
    if (!activeGroup || !activeMemberInfo || !dbWriteGroup) return;

    if (!canChangePrediction) {
      alert("Winner predictions are locked during the Group Stage!");
      return;
    }

    const currentCount = activeMemberInfo.winnerPredictionCount || 1;
    const newCount = activeMemberInfo.winnerPrediction ? currentCount + 1 : 1;

    const performSave = async () => {
      const updatedGroup = {
        ...activeGroup,
        members: {
          ...activeGroup.members,
          [currentUser.id]: {
            ...activeMemberInfo,
            winnerPrediction: team,
            winnerPredictionCount: newCount
          }
        }
      };
      try {
        await dbWriteGroup(updatedGroup);
        const factor = Math.pow(0.5, newCount - 1);
        const payout = Math.round(activeGroup.startingBudget * factor);
        await writeChatMessage(`${currentUser.username} predicted ${team} to win the 2026 World Cup! 🏆 (Prediction #${newCount}, potential payout: ${payout} credits)`, 'activity');
        alert(`Successfully predicted ${team} as the tournament winner!`);
      } catch (err) {
        console.error(err);
        alert("Failed to save prediction.");
      }
    };

    if (requiresAd) {
      runSponsoredAd(
        60,
        `Watching Sponsored Video (1 Min) to change your Tournament Winner prediction to ${team}`,
        performSave
      );
    } else {
      await performSave();
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)', border: '1px solid rgba(255, 215, 0, 0.15)', borderRadius: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Trophy size={18} style={{ color: '#ffd700' }} />
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: '13px', fontWeight: '700', color: '#fff', margin: 0 }}>Tournament Winner Prediction</h3>
          <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)', margin: 0 }}>
            {beforeFirstKickoff 
              ? "Free to bet! Predict the World Cup winner before kickoff. Correct guess pays 100% of starting budget credits!" 
              : !allGroupFinished
                ? "Locked during the Group Stage. Re-opens during knockouts."
                : "Watch a 1-minute video ad to change your prediction. Payout scales down with subsequent predictions (100% -> 50% -> 25%...)."
            }
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Selection:</span>
          {userPrediction ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255, 215, 0, 0.1)', padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(255, 215, 0, 0.3)' }}>
              <TeamFlag teamName={userPrediction} />
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#ffd700' }}>{userPrediction}</span>
            </div>
          ) : (
            <span style={{ fontSize: '12px', fontStyle: 'italic', color: 'var(--color-text-muted)' }}>None selected yet</span>
          )}
          
          {userPrediction && isEliminated && (
            <span style={{ fontSize: '11px', color: 'var(--color-danger)', fontWeight: '700', background: 'rgba(215,0,0,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
              ❌ ELIMINATED
            </span>
          )}
          
          {userPrediction && (
            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
              (Prediction #{predictionCount}, Potential Payout: {Math.round((activeGroup?.startingBudget || 500) * Math.pow(0.5, predictionCount - 1))} pts)
            </span>
          )}
        </div>
        
        {canChangePrediction && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select
              value={userPrediction || ''}
              onChange={(e) => handlePredictWinner(e.target.value)}
              style={{
                background: 'var(--bg-main)',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '12px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="" disabled>Select a team...</option>
              {availableTeams.map(team => (
                <option key={team} value={team}>{team}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

function MultiLineProgressionChart({
  recaps,
  activeGroupId,
  activeGroup
}: {
  recaps: YesterdayRecap[];
  activeGroupId: string;
  activeGroup: Group;
}) {
  const allMembersProgression = useMemo(() => {
    if (!activeGroup) return { dates: [], membersProgression: [] };
    
    const groupRecaps = recaps
      .filter(r => r.groupId === activeGroupId)
      .sort((a, b) => a.date.localeCompare(b.date));

    const dates = ['Start', ...groupRecaps.map(r => r.date)];
    const membersList = Object.values(activeGroup.members);
    
    const membersProgression = membersList.map(mbr => {
      let currentBal = activeGroup.startingBudget;
      const progression = [currentBal];
      
      groupRecaps.forEach(r => {
        const mRecap = r.memberRecaps.find(mr => mr.userId === mbr.userId);
        if (mRecap) {
          currentBal += mRecap.netChange;
        }
        progression.push(currentBal);
      });
      
      return {
        userId: mbr.userId,
        username: mbr.username,
        progression
      };
    });

    return {
      dates,
      membersProgression
    };
  }, [recaps, activeGroup, activeGroupId]);

  const { dates, membersProgression } = allMembersProgression;

  if (dates.length <= 1) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '13px', fontStyle: 'italic' }}>
        No progression data available yet. Daily points will trace here once matches begin resolving!
      </div>
    );
  }

  // Calculate limits
  let minBal = activeGroup.startingBudget;
  let maxBal = activeGroup.startingBudget;
  membersProgression.forEach(mp => {
    mp.progression.forEach(bal => {
      if (bal < minBal) minBal = bal;
      if (bal > maxBal) maxBal = bal;
    });
  });

  const diff = maxBal - minBal || 100;
  minBal = Math.max(0, Math.floor(minBal - diff * 0.1));
  maxBal = Math.ceil(maxBal + diff * 0.1);

  const width = 500;
  const height = 200;
  const paddingLeft = 40;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 30;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const getX = (index: number) => {
    return paddingLeft + index * (chartWidth / (dates.length - 1 || 1));
  };

  const getY = (bal: number) => {
    return paddingTop + chartHeight - ((bal - minBal) / (maxBal - minBal)) * chartHeight;
  };

  const colors = [
    '#3150ff', // Blue
    '#00c752', // Green
    '#ff9e81', // Coral
    '#ecff43', // Yellow
    '#6101eb', // Purple
    '#e4251b', // Red
    '#ff007f', // Pink
    '#00ffff', // Cyan
    '#ffa500', // Orange
    '#ffffff'  // White
  ];

  return (
    <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(255,255,255,0.015)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
      <h3 style={{ fontSize: '13px', fontWeight: '700', color: '#fff' }}>Leagues Points Progression Curve</h3>
      
      <div style={{ position: 'relative', width: '100%' }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
          {/* Grid lines */}
          {[0, 0.5, 1].map((ratio, idx) => {
            const val = Math.round(minBal + ratio * (maxBal - minBal));
            const y = getY(val);
            return (
              <g key={idx}>
                <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="rgba(255,255,255,0.05)" strokeDasharray="3,3" />
                <text x={paddingLeft - 8} y={y + 4} fill="var(--color-text-muted)" fontSize="9" textAnchor="end">{val}</text>
              </g>
            );
          })}

          {/* Date labels on X axis */}
          {dates.map((d, idx) => {
            if (dates.length > 8 && idx % Math.ceil(dates.length / 6) !== 0 && idx !== dates.length - 1) return null;
            const x = getX(idx);
            const label = d === 'Start' ? 'Start' : d.substring(5); // Show MM-DD instead of YYYY-MM-DD
            return (
              <text key={idx} x={x} y={height - 10} fill="var(--color-text-muted)" fontSize="8" textAnchor="middle">
                {label}
              </text>
            );
          })}

          {/* Lines for each member */}
          {membersProgression.map((mp, mIdx) => {
            const color = colors[mIdx % colors.length];
            const pathPoints = mp.progression.map((bal, idx) => `${getX(idx)},${getY(bal)}`).join(' ');
            return (
              <g key={mp.userId}>
                <polyline
                  fill="none"
                  stroke={color}
                  strokeWidth="2.5"
                  points={pathPoints}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ transition: 'all 0.3s' }}
                />
                {/* Dots on points */}
                {mp.progression.map((bal, idx) => (
                  <circle
                    key={idx}
                    cx={getX(idx)}
                    cy={getY(bal)}
                    r="3.5"
                    fill={color}
                    stroke="#14141a"
                    strokeWidth="1"
                  >
                    <title>{`${mp.username}: ${bal} pts`}</title>
                  </circle>
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '11px', marginTop: '6px' }}>
        {membersProgression.map((mp, mIdx) => {
          const color = colors[mIdx % colors.length];
          return (
            <div key={mp.userId} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, display: 'inline-block' }} />
              <span style={{ color: 'var(--color-text-secondary)', fontWeight: '500' }}>{mp.username}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StandingsAndBracketView({
  matches,
  top8ThirdPlaceTeams,
  rankedThirds,
  activeGroup,
  activeMemberInfo,
  dbWriteGroup,
  writeChatMessage,
  currentUser,
  currentDate,
  currentTime,
  runSponsoredAd,
  alert
}: {
  matches: Match[];
  top8ThirdPlaceTeams: Set<string>;
  rankedThirds: any[];
  activeGroup?: Group | null;
  activeMemberInfo?: GroupMember | null;
  dbWriteGroup?: (group: Group) => Promise<void>;
  writeChatMessage?: (text: string, type: 'chat' | 'activity', gifUrl?: string) => Promise<void>;
  currentUser?: User | null;
  currentDate: string;
  currentTime: string;
  runSponsoredAd: (duration: number, description: string, onCompleteAction: () => void) => void;
  alert: (message: string) => void;
}) {
  const [subTab, setSubTab] = useState<'groups' | 'bracket'>('groups');

  const r32 = matches.filter(m => m.matchday === 4);
  const r16 = matches.filter(m => m.matchday === 5);
  const qf = matches.filter(m => m.matchday === 6);
  const sf = matches.filter(m => m.matchday === 7);
  const finals = matches.filter(m => m.matchday === 8); // Final & 3rd Place

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Winner Prediction Card */}
      {activeGroup && currentUser && activeMemberInfo && dbWriteGroup && writeChatMessage && (
        <WinnerPredictionWidget
          matches={matches}
          activeGroup={activeGroup}
          activeMemberInfo={activeMemberInfo}
          dbWriteGroup={dbWriteGroup}
          writeChatMessage={writeChatMessage}
          currentUser={currentUser}
          currentDate={currentDate}
          currentTime={currentTime}
          runSponsoredAd={runSponsoredAd}
          alert={alert}
        />
      )}
      {/* Header and sub-tab toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: '700' }}>Standings & Tournament Bracket</h2>
          <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            Follow the group standings and the dynamic progression of teams to the final.
          </span>
        </div>
        
        {/* Toggle button */}
        <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <button
            onClick={() => setSubTab('groups')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '600',
              background: subTab === 'groups' ? 'var(--color-primary)' : 'transparent',
              color: subTab === 'groups' ? '#fff' : 'var(--color-text-secondary)'
            }}
          >
            Group Stages (A-L)
          </button>
          <button
            onClick={() => setSubTab('bracket')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '600',
              background: subTab === 'bracket' ? 'var(--color-primary)' : 'transparent',
              color: subTab === 'bracket' ? '#fff' : 'var(--color-text-secondary)'
            }}
          >
            Knockout Bracket
          </button>
        </div>
      </div>

      {subTab === 'groups' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          {/* 12 Group Tables Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '20px'
          }}>
            {Object.entries(GROUPS_TEAMS).map(([gLetter, teams]) => {
              const groupStandings = calculateGroupStandings(gLetter, teams, matches);
              return (
                <div key={gLetter} className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: '700', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '6px', color: 'var(--color-primary)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Group {gLetter}</span>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>2026 World Cup</span>
                  </h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ color: 'var(--color-text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <th style={{ padding: '4px 2px' }}>Team</th>
                        <th style={{ padding: '4px 2px', textAlign: 'center' }}>P</th>
                        <th style={{ padding: '4px 2px', textAlign: 'center' }}>GD</th>
                        <th style={{ padding: '4px 2px', textAlign: 'right' }}>Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupStandings.map((row, idx) => {
                        const isTop2 = idx < 2;
                        const isBest3rd = idx === 2 && top8ThirdPlaceTeams.has(row.team);
                        
                        let rowBg = 'transparent';
                        let indicatorColor = 'transparent';
                        if (isTop2) {
                          rowBg = 'rgba(0, 199, 82, 0.04)';
                          indicatorColor = 'var(--color-secondary)';
                        } else if (isBest3rd) {
                          rowBg = 'rgba(236, 255, 67, 0.03)';
                          indicatorColor = 'var(--color-yellow)';
                        } else if (idx === 2) {
                          indicatorColor = 'var(--color-warning)';
                        } else {
                          indicatorColor = 'var(--color-danger)';
                        }

                        return (
                          <tr key={row.team} style={{ background: rowBg, borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                            <td style={{ padding: '6px 2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: indicatorColor }} />
                              <TeamFlag teamName={row.team} />
                              <span style={{ fontWeight: isTop2 || isBest3rd ? '600' : 'normal', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                                {row.team}
                              </span>
                            </td>
                            <td style={{ padding: '6px 2px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>{row.played}</td>
                            <td style={{ padding: '6px 2px', textAlign: 'center', color: row.gd > 0 ? 'var(--color-secondary)' : row.gd < 0 ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}>
                              {row.gd > 0 ? `+${row.gd}` : row.gd}
                            </td>
                            <td style={{ padding: '6px 2px', textAlign: 'right', fontWeight: '700', color: isTop2 || isBest3rd ? '#fff' : 'var(--color-text-secondary)' }}>{row.pts}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>

          {/* Third Place Rankings Table */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '6px', color: 'var(--color-yellow)' }}>
              Third-Place Teams Leaderboard
            </h3>
            <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '14px' }}>
              The 8 best third-placed teams across all 12 groups advance to the Round of 32 (highlighted in yellow).
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ color: 'var(--color-text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <th style={{ padding: '8px' }}>Rank</th>
                  <th style={{ padding: '8px' }}>Group</th>
                  <th style={{ padding: '8px' }}>Team</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>Played</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>Goal Diff</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Points</th>
                </tr>
              </thead>
              <tbody>
                {rankedThirds.map((row, idx) => {
                  const advances = idx < 8;
                  return (
                    <tr
                      key={row.team}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        background: advances ? 'rgba(236, 255, 67, 0.04)' : 'transparent',
                        fontWeight: advances ? '600' : 'normal'
                      }}
                    >
                      <td style={{ padding: '10px 8px' }}>
                        {idx < 8 ? `💛 ${idx + 1}` : `${idx + 1}`}
                      </td>
                      <td style={{ padding: '10px 8px', color: 'var(--color-text-secondary)' }}>Group {row.group}</td>
                      <td style={{ padding: '10px 8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <TeamFlag teamName={row.team} />
                        <span>{row.team}</span>
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>{row.played}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', color: row.gd > 0 ? 'var(--color-secondary)' : row.gd < 0 ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}>
                        {row.gd > 0 ? `+${row.gd}` : row.gd}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '700' }} className={advances ? 'text-neon' : ''}>{row.pts}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Vertical scrollable rounds */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '24px'
          }}>
            {/* Round of 32 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ 
                fontSize: '12px', 
                fontWeight: '800', 
                color: 'var(--color-primary)', 
                textTransform: 'uppercase', 
                borderBottom: '1px solid rgba(255,255,255,0.06)', 
                paddingBottom: '4px',
                letterSpacing: '0.5px'
              }}>
                Round of 32 ({r32.length} Matches)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
                {r32.map(m => (
                  <BracketMatchCard key={m.id} match={m} />
                ))}
              </div>
            </div>

            {/* Round of 16 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ 
                fontSize: '12px', 
                fontWeight: '800', 
                color: 'var(--color-primary)', 
                textTransform: 'uppercase', 
                borderBottom: '1px solid rgba(255,255,255,0.06)', 
                paddingBottom: '4px',
                letterSpacing: '0.5px'
              }}>
                Round of 16 ({r16.length} Matches)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
                {r16.map(m => (
                  <BracketMatchCard key={m.id} match={m} />
                ))}
              </div>
            </div>

            {/* Quarterfinals */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ 
                fontSize: '12px', 
                fontWeight: '800', 
                color: 'var(--color-primary)', 
                textTransform: 'uppercase', 
                borderBottom: '1px solid rgba(255,255,255,0.06)', 
                paddingBottom: '4px',
                letterSpacing: '0.5px'
              }}>
                Quarterfinals ({qf.length} Matches)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
                {qf.map(m => (
                  <BracketMatchCard key={m.id} match={m} />
                ))}
              </div>
            </div>

            {/* Semifinals */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ 
                fontSize: '12px', 
                fontWeight: '800', 
                color: 'var(--color-primary)', 
                textTransform: 'uppercase', 
                borderBottom: '1px solid rgba(255,255,255,0.06)', 
                paddingBottom: '4px',
                letterSpacing: '0.5px'
              }}>
                Semifinals ({sf.length} Matches)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
                {sf.map(m => (
                  <BracketMatchCard key={m.id} match={m} />
                ))}
              </div>
            </div>

            {/* Finals */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ 
                fontSize: '12px', 
                fontWeight: '800', 
                color: 'var(--color-primary)', 
                textTransform: 'uppercase', 
                borderBottom: '1px solid rgba(255,255,255,0.06)', 
                paddingBottom: '4px',
                letterSpacing: '0.5px'
              }}>
                Finals ({finals.length} Matches)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
                {finals.find(m => m.matchdayName.includes('Final')) && (
                  <BracketMatchCard match={finals.find(m => m.matchdayName.includes('Final'))!} title="World Cup Final" />
                )}
                {finals.find(m => m.matchdayName.includes('Third')) && (
                  <BracketMatchCard match={finals.find(m => m.matchdayName.includes('Third'))!} title="Third Place Playoff" />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



function BracketMatchCard({ match, title }: { match: Match; title?: string }) {
  const isHomeWinner = match.status === 'finished' && match.winner === match.homeTeam;
  const isAwayWinner = match.status === 'finished' && match.winner === match.awayTeam;

  return (
    <div
      className="glass-panel"
      style={{
        padding: '8px 12px',
        fontSize: '11px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        background: 'rgba(255,255,255,0.015)',
        borderColor: match.status === 'finished' ? 'rgba(0, 199, 82, 0.15)' : 'var(--border-color)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-muted)', fontSize: '9px', fontWeight: '600' }}>
        <span>{title || match.id.toUpperCase()}</span>
        <span>{match.date.substring(5)} {match.kickoffTime}</span>
      </div>
      
      {/* Home row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span
          style={{
            fontWeight: isHomeWinner ? '700' : 'normal',
            color: isHomeWinner ? 'var(--color-secondary)' : isPlaceholder(match.homeTeam) ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
            fontStyle: isPlaceholder(match.homeTeam) ? 'italic' : 'normal',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          <TeamFlag teamName={match.homeTeam} size={16} />
          <span>{match.homeTeam}</span>
        </span>
        {match.status === 'finished' && (
          <span style={{ fontWeight: '700', color: isHomeWinner ? 'var(--color-secondary)' : 'var(--color-text-secondary)' }}>
            {match.homeScore}
          </span>
        )}
      </div>

      {/* Away row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span
          style={{
            fontWeight: isAwayWinner ? '700' : 'normal',
            color: isAwayWinner ? 'var(--color-secondary)' : isPlaceholder(match.awayTeam) ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
            fontStyle: isPlaceholder(match.awayTeam) ? 'italic' : 'normal',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          <TeamFlag teamName={match.awayTeam} size={16} />
          <span>{match.awayTeam}</span>
        </span>
        {match.status === 'finished' && (
          <span style={{ fontWeight: '700', color: isAwayWinner ? 'var(--color-secondary)' : 'var(--color-text-secondary)' }}>
            {match.awayScore}
          </span>
        )}
      </div>

      {/* Shootout details */}
      {match.status === 'finished' && match.homeScore === match.awayScore && match.winner && (
        <div style={{ fontSize: '8px', color: 'var(--color-text-muted)', textAlign: 'right', fontStyle: 'italic', borderTop: '1px dashed rgba(255,255,255,0.04)', paddingTop: '2px', marginTop: '2px' }}>
          {match.winner} advanced on pens
        </div>
      )}
    </div>
  );
}

function BalanceHistoryChart({ data }: { data: { date: string; balance: number }[] }) {
  if (data.length <= 1) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: 'var(--color-text-secondary)', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
        No historical performance data available yet. Complete match sessions to see progression chart.
      </div>
    );
  }

  const values = data.map(d => d.balance);
  const minVal = Math.min(...values, 0);
  const maxVal = Math.max(...values, 100);
  const range = maxVal - minVal;

  const width = 500;
  const height = 150;
  const paddingX = 40;
  const paddingY = 20;

  const points = data.map((d, index) => {
    const x = paddingX + (index / (data.length - 1)) * (width - 2 * paddingX);
    // invert y coordinate because SVG (0,0) is top-left
    const y = height - paddingY - ((d.balance - minVal) / (range || 1)) * (height - 2 * paddingY);
    return `${x},${y}`;
  }).join(' ');

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-text-primary)' }}>Balance Progression</span>
      <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
          {/* Grid lines */}
          <line x1={paddingX} y1={paddingY} x2={width - paddingX} y2={paddingY} stroke="rgba(255,255,255,0.05)" strokeDasharray="3" />
          <line x1={paddingX} y1={height / 2} x2={width - paddingX} y2={height / 2} stroke="rgba(255,255,255,0.05)" strokeDasharray="3" />
          <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} stroke="rgba(255,255,255,0.05)" strokeDasharray="3" />

          {/* Min and Max labels */}
          <text x={paddingX - 10} y={paddingY + 4} fill="var(--color-text-secondary)" fontSize="10" textAnchor="end">{maxVal}</text>
          <text x={paddingX - 10} y={height - paddingY + 4} fill="var(--color-text-secondary)" fontSize="10" textAnchor="end">{minVal}</text>

          {/* Sparkline Path */}
          <polyline
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
          />

          {/* Data Points */}
          {data.map((d, index) => {
            const x = paddingX + (index / (data.length - 1)) * (width - 2 * paddingX);
            const y = height - paddingY - ((d.balance - minVal) / (range || 1)) * (height - 2 * paddingY);
            return (
              <g key={index}>
                <circle cx={x} cy={y} r="4" fill="var(--color-secondary)" stroke="#fff" strokeWidth="1" />
                <title>{d.date}: {d.balance} pts</title>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export function ChatTab({
  messages,
  onSendMessage,
  currentUser,
  klipyApiKey
}: {
  messages: ChatMessage[];
  onSendMessage: (text: string, type: 'chat' | 'activity', gifUrl?: string) => Promise<void>;
  currentUser: User;
  klipyApiKey: string;
}) {
  const [inputText, setInputText] = useState('');
  const [showGifPanel, setShowGifPanel] = useState(false);
  const [gifQuery, setGifQuery] = useState('');
  const [gifs, setGifs] = useState<string[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'chat' | 'activity'>('chat');
  const chatEndRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showGifPanel) {
      handleGifSearch('');
    }
  }, [showGifPanel]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeSubTab]);

  const handleGifSearch = async (q: string) => {
    setGifQuery(q);
    if (!q.trim()) {
      setGifs(TRENDING_GIFS.map(g => g.url));
      return;
    }
    try {
      const activeKey = klipyApiKey.trim() || 'LIVDTRZKB1A1';
      const res = await fetch(`https://api.klipy.com/v2/search?q=${encodeURIComponent(q)}&key=${activeKey}&limit=8`);
      if (res.ok) {
        const data = await res.json();
        const urls = data.results.map((item: any) => item.media_formats.nanogif?.url || item.media_formats.tinygif?.url);
        setGifs(urls.filter(Boolean));
      } else {
        setGifs(TRENDING_GIFS.map(g => g.url));
      }
    } catch (e) {
      setGifs(TRENDING_GIFS.map(g => g.url));
    }
  };

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    await onSendMessage(inputText.trim(), 'chat');
    setInputText('');
  };

  const handleSendGif = async (url: string) => {
    await onSendMessage('Sent a GIF', 'chat', url);
    setShowGifPanel(false);
  };

  const filteredMessages = messages.filter(msg => 
    activeSubTab === 'chat' ? msg.type !== 'activity' : msg.type === 'activity'
  );

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', height: '600px', padding: '16px', gap: '12px' }}>
      <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0 }}>
            {activeSubTab === 'chat' ? 'League Banter Chat 💬' : 'Activity Log 📋'}
          </h3>
          <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
            {activeSubTab === 'chat' 
              ? 'Freely chat and send GIFs to other managers.'
              : 'Follow real-time betting activities, settlements, and power-up usage.'}
          </span>
        </div>
        
        {/* Sub Tab Controls */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          <button
            onClick={() => setActiveSubTab('chat')}
            style={{
              background: activeSubTab === 'chat' ? 'rgba(var(--color-primary-rgb), 0.12)' : 'rgba(255,255,255,0.02)',
              color: activeSubTab === 'chat' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              border: '1px solid',
              borderColor: activeSubTab === 'chat' ? 'var(--color-primary)' : 'rgba(255,255,255,0.08)',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Banter Chat 💬
          </button>
          <button
            onClick={() => setActiveSubTab('activity')}
            style={{
              background: activeSubTab === 'activity' ? 'rgba(var(--color-primary-rgb), 0.12)' : 'rgba(255,255,255,0.02)',
              color: activeSubTab === 'activity' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              border: '1px solid',
              borderColor: activeSubTab === 'activity' ? 'var(--color-primary)' : 'rgba(255,255,255,0.08)',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Activity Log 📋
          </button>
        </div>
      </div>

      {/* Messages List */}
      <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px' }}>
        {filteredMessages.length === 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--color-text-secondary)', fontSize: '13px', fontStyle: 'italic' }}>
            {activeSubTab === 'chat' ? 'No chat messages yet. Start the banter!' : 'No activities recorded yet.'}
          </div>
        ) : (
          filteredMessages.map(msg => {
            const isMe = msg.userId === currentUser.id;
            const isActivity = msg.type === 'activity';

            if (isActivity) {
              return (
                <div key={msg.id} style={{ display: 'flex', justifyContent: 'center', margin: '4px 0' }}>
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '6px 12px', fontSize: '11px', color: 'var(--color-text-secondary)', textAlign: 'center', maxWidth: '85%', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Zap size={10} color="var(--color-primary)" />
                    <span>{msg.text}</span>
                  </div>
                </div>
              );
            }

            return (
              <div key={msg.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', maxWidth: '70%' }}>
                  <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginBottom: '2px', paddingLeft: '4px', paddingRight: '4px' }}>
                    {msg.username}
                  </span>
                  <div style={{
                    background: isMe ? 'var(--color-primary)' : 'rgba(255,255,255,0.07)',
                    color: '#fff',
                    borderRadius: isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                    padding: '8px 12px',
                    fontSize: '13px',
                    wordBreak: 'break-word'
                  }}>
                    {msg.gifUrl ? (
                      <img src={msg.gifUrl} alt="gif" style={{ maxWidth: '180px', borderRadius: '6px', display: 'block' }} />
                    ) : (
                      msg.text
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={chatEndRef} />
      </div>

      {/* GIF Popup Drawer */}
      {activeSubTab === 'chat' && showGifPanel && (
        <div className="glass-panel" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative', zIndex: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: '700' }}>Search Tenor GIFs</span>
            <button onClick={() => setShowGifPanel(false)} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>
          <input
            type="text"
            placeholder="Type search terms (e.g. messi, goal)..."
            value={gifQuery}
            onChange={(e) => handleGifSearch(e.target.value)}
            style={{
              width: '100%',
              background: 'var(--bg-main)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '6px 8px',
              fontSize: '12px',
              boxSizing: 'border-box'
            }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', maxHeight: '120px', overflowY: 'auto', padding: '2px' }}>
            {gifs.map((url, index) => (
              <img
                key={index}
                src={url}
                alt="searched-gif"
                onClick={() => handleSendGif(url)}
                style={{ width: '100%', height: '55px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer', border: '1px solid transparent' }}
                onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                onMouseOut={(e) => e.currentTarget.style.borderColor = 'transparent'}
              />
            ))}
          </div>
        </div>
      )}

      {/* Input Form */}
      {activeSubTab === 'chat' && (
        <form onSubmit={handleSendText} style={{ display: 'flex', gap: '8px' }}>
        <button
          type="button"
          onClick={() => setShowGifPanel(!showGifPanel)}
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--border-color)',
            color: 'var(--color-text-primary)',
            borderRadius: '8px',
            padding: '8px 12px',
            fontSize: '12px',
            cursor: 'pointer',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          <Sparkles size={14} color="#ffd700" />
          GIF
        </button>
        <input
          type="text"
          placeholder="Message the league..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          style={{
            flexGrow: 1,
            background: 'var(--bg-main)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '8px 12px',
            fontSize: '13px',
            outline: 'none'
          }}
        />
        <button
          type="submit"
          style={{
            background: 'var(--color-primary)',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: '700',
            cursor: 'pointer'
          }}
        >
          Send
        </button>
      </form>
      )}
    </div>
  );
}

