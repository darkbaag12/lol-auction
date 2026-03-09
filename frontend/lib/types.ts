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
}

export interface AuctionRound {
  roundId: number;
  roundNumber: number;
  player: PlayerResponse;
  startingPrice: number;
  currentPrice: number;
  highestBidderTeam: string | null;
  status: string;
}

export interface BidResponse {
  bidId: number;
  teamName: string;
  amount: number;
  timestamp: string;
}

export const POSITION_LABELS: Record<string, string> = {
  TOP: '탑',
  JUNGLE: '정글',
  MID: '미드',
  ADC: '원딜',
  SUPPORT: '서포터',
};

export const TIER_COLORS: Record<string, string> = {
  IRON: '#5e5148',
  BRONZE: '#8c5a3c',
  SILVER: '#8b9bae',
  GOLD: '#c89b3c',
  PLATINUM: '#4e9996',
  EMERALD: '#009e6b',
  DIAMOND: '#576cce',
  MASTER: '#9d48e0',
  GRANDMASTER: '#e04848',
  CHALLENGER: '#f4c874',
};
