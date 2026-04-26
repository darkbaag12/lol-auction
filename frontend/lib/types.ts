export interface Tournament {
  id: number;
  name: string;
  totalPoints: number;
  bidUnit: number;
  maxTeamSize: number;
  status: string;
  hasAccessCode: boolean;
  teams: TeamResponse[];
}

export interface TeamResponse {
  id: number;
  name: string;
  captainName: string;
  remainingPoints: number;
  filledSlots: number;
  remainingSlots: number;
  members: TeamMember[];
}

export interface TeamMember {
  playerId: number;
  summonerName: string;
  assignedPosition: string;
  purchasePrice: number;
  tier: string;
}

export interface PlayerResponse {
  id: number;
  name: string;
  summonerName: string;
  tier: string;
  rankDivision: string;
  lp: number;
  mainPosition: string;
  subPosition: string;
  mostChampions: string;
  isNewMember: boolean;
  status: string;
  teamId: number | null;
  teamName: string | null;
  soldPrice: number | null;
  profileIconUrl: string | null;
  resolution?: string;
  startingScore?: number;
}

export interface AuctionRound {
  roundId: number;
  roundNumber: number;
  player: PlayerResponse;
  startingPrice: number;
  maxPrice?: number | null;
  currentPrice: number;
  highestBidderTeam: string | null;
  status: string;
}

export interface BidResponse {
  bidId: number;
  teamId: number;
  teamName: string;
  amount: number;
  timestamp: string;
  teamsPoints?: Record<string, number>;
}

export const POSITION_LABELS: Record<string, string> = {
  TOP: '탑',
  JUNGLE: '정글',
  MID: '미드',
  ADC: '원딜',
  SUPPORT: '서포터',
  DUELIST: '타격대',
  INITIATOR: '척후대',
  CONTROLLER: '전략가',
  SENTINEL: '감시자',
  FLEX: '올라운더',
};

export const TIER_COLORS: Record<string, string> = {
  IRON: '#5e5148',
  BRONZE: '#8c5a3c',
  SILVER: '#8b9bae',
  GOLD: '#c89b3c',
  PLATINUM: '#4e9996',
  EMERALD: '#009e6b',
  DIAMOND: '#576cce',
  ASCENDANT: '#2b846e',
  IMMORTAL: '#b83d5a',
  RADIANT: '#fff9c4',
  MASTER: '#9d48e0',
  GRANDMASTER: '#e04848',
  CHALLENGER: '#f4c874',
};

export const TIER_LABELS: Record<string, string> = {
  IRON: '아이언',
  BRONZE: '브론즈',
  SILVER: '실버',
  GOLD: '골드',
  PLATINUM: '플래티넘',
  EMERALD: '에메랄드',
  DIAMOND: '다이아몬드',
  ASCENDANT: '초월자',
  IMMORTAL: '불멸',
  RADIANT: '레디언트',
  MASTER: '마스터',
  GRANDMASTER: '그랜드마스터',
  CHALLENGER: '챌린저',
};
