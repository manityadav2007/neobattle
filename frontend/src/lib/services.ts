import { api, ApiResponse, setAuthTokens, clearAuthTokens } from './api';

export type UserRole = 'PLAYER' | 'HOST' | 'ADMIN' | 'MODERATOR' | 'SUPER_ADMIN';

export interface User {
  id: string;
  uid: string;
  email: string;
  username: string;
  role: UserRole;
  isVerified: boolean;
  freeFireId: string | null;
  ign: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  verificationScreenshotUrl: string | null;
  notifyTournaments?: boolean;
  notifyResults?: boolean;
  notifyAlerts?: boolean;
  createdAt: string;
  wallet?: { balance: number; currency: string } | null;
}

export interface Tournament {
  id: string;
  uid: string;
  title: string;
  description: string | null;
  format: 'SOLO' | 'DUO' | 'SQUAD';
  platform: 'MOBILE' | 'PC';
  gameMode: 'FULL_MAP' | 'CLASH_SQUAD';
  status: 'DRAFT' | 'REGISTRATION' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'PENDING_PAYOUT' | 'PAID';
  entryFee: number | string;
  prizePool: number | string;
  prizeFirst?: number | string | null;
  prizeSecond?: number | string | null;
  prizeThird?: number | string | null;
  maxParticipants: number;
  mapName: string | null;
  roomId: string | null;
  roomPassword?: string | null;
  rules?: string | null;
  registrationStart?: string;
  startTime: string;
  registrationEnd: string;
  endTime?: string | null;
  delayedCount?: number;
  platformCommission?: number | string;
  hostCommission?: number | string;
  remainingPool?: number | string;
  isRegistered?: boolean;
  _count?: { entries: number };
  creator?: { id: string; username: string };
  creatorId: string;
}

export interface WalletData {
  id: string;
  balance: number;
  currency: string;
  transactions: Transaction[];
}

export interface Transaction {
  id: string;
  type: string;
  status: string;
  amount: number;
  description: string | null;
  createdAt: string;
}

export interface Team {
  id: string;
  name: string;
  tag: string;
  logoUrl: string | null;
  members: Array<{
    user: { id: string; username: string; avatarUrl: string | null };
    role: string;
  }>;
  leader: { id: string; username: string };
  _count?: { members: number };
}

export const authApi = {
  checkUsername: async (username: string) => {
    const res = await api.get<ApiResponse<{ available: boolean }>>('/auth/check-username', { params: { username } });
    return res.data;
  },
  register: async (data: { email: string; username: string; password: string; displayName?: string }) => {
    const res = await api.post<ApiResponse<{ user: User; accessToken: string; refreshToken: string }>>('/auth/register', data);
    if (res.data.data) setAuthTokens(res.data.data.accessToken, res.data.data.refreshToken);
    return res.data;
  },
  login: async (data: { email: string; password: string }) => {
    const res = await api.post<ApiResponse<{ user: User; accessToken: string; refreshToken: string }>>('/auth/login', data);
    if (res.data.data) setAuthTokens(res.data.data.accessToken, res.data.data.refreshToken);
    return res.data;
  },
  logout: async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    try {
      await api.post('/auth/logout', { refreshToken });
    } finally {
      clearAuthTokens();
    }
  },
  me: async () => {
    const res = await api.get<ApiResponse<User>>('/auth/me');
    return res.data;
  },
  updateIgn: async (ign: string) => {
    const res = await api.patch('/auth/ign', { ign });
    return res.data;
  },
};

export const tournamentApi = {
  list: async (params?: { page?: number; status?: string; format?: string; platform?: string; gameMode?: string }) => {
    const res = await api.get<ApiResponse<Tournament[]>>('/tournaments', { params });
    return res.data;
  },
  get: async (id: string) => {
    const res = await api.get<ApiResponse<Tournament>>(`/tournaments/${id}`);
    return res.data;
  },
  register: async (tournamentId: string, teamId?: string, squadUids?: string[]) => {
    const res = await api.post('/tournaments/register', { tournamentId, teamId, squadUids });
    return res.data;
  },
  my: async () => {
    const res = await api.get('/tournaments/my');
    return res.data;
  },
  create: async (data: Record<string, unknown>) => {
    const res = await api.post('/tournaments', data);
    return res.data;
  },
};

export const walletApi = {
  get: async () => {
    const res = await api.get<ApiResponse<WalletData>>('/wallet');
    return res.data;
  },
  deposit: async (amount: number) => {
    const res = await api.post('/wallet/deposit', { amount });
    return res.data;
  },
  withdraw: async (amount: number) => {
    const res = await api.post('/wallet/withdraw', { amount });
    return res.data;
  },
  transactions: async (page = 1) => {
    const res = await api.get('/wallet/transactions', { params: { page } });
    return res.data;
  },
};

export const teamApi = {
  list: async (page = 1) => {
    const res = await api.get<ApiResponse<Team[]>>('/teams', { params: { page } });
    return res.data;
  },
  my: async () => {
    const res = await api.get<ApiResponse<Team | null>>('/teams/my');
    return res.data;
  },
  create: async (data: { name: string; tag: string; logoUrl?: string }) => {
    const res = await api.post('/teams', data);
    return res.data;
  },
  join: async (teamId: string) => {
    const res = await api.post('/teams/join', { teamId });
    return res.data;
  },
  leave: async () => {
    const res = await api.post('/teams/leave');
    return res.data;
  },
  disband: async (id: string) => {
    const res = await api.delete(`/teams/${id}`);
    return res.data;
  },
};

export interface UserStats {
  totalTournamentsPlayed: number;
  totalWins: number;
  totalPrizeMoney: number;
  winRate: number;
  league: string;
}

export const userApi = {
  leaderboard: async () => {
    const res = await api.get('/users/leaderboard');
    return res.data;
  },
  stats: async (userId?: string) => {
    const endpoint = userId ? `/users/${userId}/stats` : '/users/me/stats';
    const res = await api.get<ApiResponse<UserStats>>(endpoint);
    return res.data;
  },
  updateProfile: async (data: Record<string, unknown>) => {
    const res = await api.patch('/users/profile', data);
    return res.data;
  },
  changePassword: async (data: { currentPassword: string; newPassword: string }) => {
    const res = await api.post('/users/change-password', data);
    return res.data;
  },
  deleteAccount: async (data: { password: string }) => {
    const res = await api.post('/users/delete-account', data);
    return res.data;
  },
};

export const uploadApi = {
  avatar: async (file: File) => {
    const formData = new FormData();
    formData.append('avatar', file);
    const res = await api.post('/upload/avatar', formData, { timeout: 30000 });
    return res.data;
  },
  teamLogo: async (file: File) => {
    const formData = new FormData();
    formData.append('teamLogo', file);
    const res = await api.post('/upload/team-logo', formData, { timeout: 30000 });
    return res.data;
  },
  verificationScreenshot: async (file: File) => {
    const formData = new FormData();
    formData.append('screenshot', file);
    const res = await api.post('/upload/verification', formData, { timeout: 30000 });
    return res.data;
  },
  giftCardImage: async (file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    const res = await api.post('/upload/gift-card-image', formData, { timeout: 30000 });
    return res.data;
  },
};

export const verificationApi = {
  submit: async (data: { freeFireId: string; screenshotUrl: string }) => {
    const res = await api.post('/verification/submit', data);
    return res.data;
  },
  my: async () => {
    const res = await api.get('/verification/my');
    return res.data;
  },
  review: async (id: string, data: { status: string; rejectionReason?: string }) => {
    const res = await api.patch(`/verification/${id}/review`, data);
    return res.data;
  },
  listPending: async (page = 1) => {
    const res = await api.get(`/verification/pending?page=${page}`);
    return res.data;
  },
};

export interface DepositRequest {
  id: string;
  userId: string;
  amount: number;
  screenshotUrl: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
  user?: { id: string; username: string; email: string };
  createdAt: string;
}

export interface RedeemRequest {
  id: string;
  userId: string;
  amount: number;
  type: 'GIFT_CARD' | 'BANK_TRANSFER';
  accountDetails?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
  user?: { id: string; username: string; email: string };
  createdAt: string;
}

export interface AdminStats {
  totalUsers: number;
  totalTournaments: number;
  activeTournaments: number;
  pendingVerifications: number;
  totalTransactions: number;
  totalCommissionCollected: number;
  pendingPayouts: number;
  pendingDeposits: number;
  pendingRedeems: number;
  totalHosts: number;
  recentUsers: Array<{ id: string; username: string; email: string; role: string; createdAt: string }>;
}

export interface CommissionBreakdown {
  totalCollection: number;
  platformCommission: number;
  hostCommission: number;
  remainingPool: number;
  maxPrizePool: number;
}

export const adminApi = {
  stats: async () => {
    const res = await api.get('/admin/stats');
    return res.data;
  },
  users: async (page = 1) => {
    const res = await api.get('/admin/users', { params: { page } });
    return res.data;
  },
  pendingVerifications: async () => {
    const res = await api.get('/verification/pending');
    return res.data;
  },
  reviewVerification: async (id: string, status: 'APPROVED' | 'REJECTED', rejectionReason?: string) => {
    const res = await api.patch(`/verification/${id}/review`, { status, rejectionReason });
    return res.data;
  },
  pendingDeposits: async () => {
    const res = await api.get('/deposits/pending');
    return res.data;
  },
  reviewDeposit: async (id: string, status: 'APPROVED' | 'REJECTED', rejectionReason?: string) => {
    const res = await api.patch(`/deposits/${id}/review`, { status, rejectionReason });
    return res.data;
  },
  pendingRedeems: async () => {
    const res = await api.get('/redeem/pending');
    return res.data;
  },
  listRedeems: async (status?: string) => {
    const res = await api.get('/redeem/all', { params: { status } });
    return res.data;
  },
  reviewRedeem: async (id: string, status: 'APPROVED' | 'COMPLETED' | 'REJECTED', data?: { rejectionReason?: string; giftCode?: string }) => {
    const res = await api.patch(`/redeem/${id}/review`, { status, ...data });
    return res.data;
  },
  promoteUser: async (userId: string) => {
    const res = await api.patch(`/admin/promote-user/${userId}`);
    return res.data;
  },
  demoteUser: async (userId: string) => {
    const res = await api.patch(`/admin/demote-user/${userId}`);
    return res.data;
  },
};

export interface PlatformStats {
  totalUsers: number;
  totalTournaments: number;
  activeTournaments: number;
  totalTransactions: number;
  totalPrizePool: number;
}

export interface GiftCard {
  id: string;
  name: string;
  value: number;
  imageUrl: string | null;
  priceInCoins: number;
  stockCount: number;
  isActive: boolean;
  createdAt: string;
}

export interface GiftCardRedemption {
  id: string;
  userId: string;
  giftCardId: string;
  status: string;
  createdAt: string;
  user: { id: string; username: string; email: string };
  giftCard: { name: string; value: number };
}

export const giftCardApi = {
  list: async () => {
    const res = await api.get('/gift-cards/list');
    return res.data;
  },
  listAll: async () => {
    const res = await api.get('/gift-cards/all');
    return res.data;
  },
  create: async (data: { name: string; value: number; imageUrl?: string; priceInCoins: number; stockCount: number }) => {
    const res = await api.post('/gift-cards/create', data);
    return res.data;
  },
  update: async (id: string, data: Record<string, unknown>) => {
    const res = await api.patch(`/gift-cards/${id}`, data);
    return res.data;
  },
  redeem: async (giftCardId: string) => {
    const res = await api.post('/gift-cards/redeem', { giftCardId });
    return res.data;
  },
  redemptions: async () => {
    const res = await api.get('/gift-cards/redemptions');
    return res.data;
  },
  updateRedemption: async (id: string, status: string) => {
    const res = await api.patch(`/gift-cards/redemptions/${id}`, { status });
    return res.data;
  },
};

export const statsApi = {
  get: async () => {
    const res = await api.get<ApiResponse<PlatformStats>>('/stats');
    return res.data;
  },
};

export interface GameProfile {
  uid: string;
  ign: string;
  level: number;
  region: string;
  avatarUrl: string | null;
}

export interface WinnerProof {
  id: string;
  tournamentId: string;
  userId: string;
  winnerUid: string;
  winnerIgn: string;
  screenshotUrl: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
}

export const gameApi = {
  fetchProfile: async (uid: string) => {
    const res = await api.get<ApiResponse<GameProfile>>(`/game/profile/${uid}`);
    return res.data;
  },
};

export const hostApi = {
  getMyTournaments: async () => {
    const res = await api.get('/host/tournaments');
    return res.data;
  },
  createTournament: async (data: Record<string, unknown>) => {
    const res = await api.post('/host/tournaments', data);
    return res.data;
  },
  updateStatus: async (id: string, status: string) => {
    const res = await api.patch(`/host/tournaments/${id}/status`, { status });
    return res.data;
  },
  getEntries: async (id: string) => {
    const res = await api.get(`/host/tournaments/${id}/entries`);
    return res.data;
  },
  delayTournament: async (id: string, newStartTime: string) => {
    const res = await api.patch(`/host/tournaments/${id}/delay`, { newStartTime });
    return res.data;
  },
  completeTournament: async (id: string) => {
    const res = await api.post(`/host/tournaments/${id}/complete`);
    return res.data;
  },
};

export function formatTag(tournament: { format: string; platform?: string; gameMode?: string }): string {
  const parts = [tournament.format];
  if (tournament.gameMode) parts.push(tournament.gameMode === 'FULL_MAP' ? 'Full Map' : 'Clash Squad');
  if (tournament.platform) parts.push(tournament.platform === 'MOBILE' ? 'Mobile' : 'PC');
  return parts.join(' | ');
}

export const winnerProofApi = {
  submit: async (data: { tournamentId: string; winnerUid: string; screenshotUrl: string }) => {
    const res = await api.post('/winner-proof/submit', data);
    return res.data;
  },
  pending: async () => {
    const res = await api.get('/winner-proof/pending');
    return res.data;
  },
  review: async (id: string, status: 'APPROVED' | 'REJECTED', rejectionReason?: string) => {
    const res = await api.patch(`/winner-proof/${id}/review`, { status, rejectionReason });
    return res.data;
  },
};

export const depositApi = {
  request: async (data: { amount: number; screenshotUrl: string }) => {
    const res = await api.post('/deposits/request', data);
    return res.data;
  },
};

export const redeemApi = {
  request: async (data: { amount: number; type: string; accountDetails?: string }) => {
    const res = await api.post('/redeem/request', data);
    return res.data;
  },
  myRequests: async () => {
    const res = await api.get('/redeem/my-requests');
    return res.data;
  },
};

export interface EsportsSeason {
  id: string;
  seasonNumber: number;
  registrationDeadline: string | null;
  registrationOpen: boolean;
  matchDate: string | null;
  matchMap: string | null;
  matchMode: string | null;
  nextSeasonDate: string | null;
  winnerTeamId: string | null;
  createdAt: string;
  teams: EsportsTeam[];
  winner: EsportsTeam | null;
}

export interface EsportsTeam {
  id: string;
  seasonId: string;
  teamName: string;
  player1Uid: string;
  player1Ign: string;
  player2Uid: string;
  player2Ign: string;
  player3Uid: string;
  player3Ign: string;
  player4Uid: string;
  player4Ign: string;
  screenshotUrl: string;
  teamLogoUrl: string | null;
  status: 'REGISTERED' | 'DISQUALIFIED' | 'WINNER';
  registeredById: string;
  registeredBy: { id: string; username: string; email: string };
  createdAt: string;
}

export interface EsportsBan {
  id: string;
  uid: string;
  reason: string | null;
  bannedById: string;
  bannedBy: { id: string; username: string };
  createdAt: string;
}

export const esportsApi = {
  season: async () => {
    const res = await api.get('/esports/season');
    return res.data;
  },
  register: async (data: { teamName: string; player1Uid: string; player2Uid: string; player3Uid: string; player4Uid: string; screenshotUrl: string; teamLogoUrl?: string }) => {
    const res = await api.post('/esports/register', data);
    return res.data;
  },
  myTeam: async () => {
    const res = await api.get('/esports/my-team');
    return res.data;
  },
  leaderboard: async () => {
    const res = await api.get('/esports/leaderboard');
    return res.data;
  },
  bans: async () => {
    const res = await api.get('/esports/bans');
    return res.data;
  },
  addBan: async (data: { uid: string; reason?: string }) => {
    const res = await api.post('/esports/bans', data);
    return res.data;
  },
  removeBan: async (id: string) => {
    const res = await api.delete(`/esports/bans/${id}`);
    return res.data;
  },
  updateSeasonConfig: async (data: { seasonNumber?: number; registrationDeadline?: string | null; registrationOpen?: boolean; matchDate?: string | null; matchMap?: string | null; matchMode?: string | null; nextSeasonDate?: string | null }) => {
    const res = await api.patch('/esports/season/config', data);
    return res.data;
  },
  createSeason: async (seasonNumber: number) => {
    const res = await api.post('/esports/season/create', { seasonNumber });
    return res.data;
  },
  endSeason: async (winnerTeamId?: string) => {
    const res = await api.post('/esports/season/end', { winnerTeamId });
    return res.data;
  },
};

export const notificationApi = {
  list: async () => {
    const res = await api.get('/notifications');
    return res.data;
  },
  markRead: async (id: string) => {
    const res = await api.patch(`/notifications/${id}/read`);
    return res.data;
  },
  markAllRead: async () => {
    const res = await api.patch('/notifications/read-all');
    return res.data;
  },
};

export function formatCurrency(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num);
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function getMapTheme(mapName: string | null): { gradient: string; accent: string; label: string; overlay: string; image: string | null } {
  const map = (mapName || '').toLowerCase();
  if (map.includes('bermuda')) return {
    gradient: '135deg, #0f766e 0%, #0d9488 25%, #0891b2 50%, #155e75 75%, #0c4a6e 100%',
    accent: '#2dd4bf',
    label: 'Bermuda',
    overlay: 'radial-gradient(circle at 20% 30%, rgba(45,212,191,0.12) 0%, transparent 60%), radial-gradient(circle at 80% 70%, rgba(14,116,144,0.15) 0%, transparent 50%)',
    image: '/maps/bermuda.jpg',
  };
  if (map.includes('kalahari')) return {
    gradient: '135deg, #92400e 0%, #a16207 25%, #ca8a04 50%, #854d0e 75%, #713f12 100%',
    accent: '#fbbf24',
    label: 'Kalahari',
    overlay: 'radial-gradient(circle at 60% 20%, rgba(251,191,36,0.15) 0%, transparent 55%), radial-gradient(circle at 30% 80%, rgba(146,64,14,0.18) 0%, transparent 50%)',
    image: '/maps/kalahari.jpg',
  };
  if (map.includes('purgatorio') || map.includes('purgatory')) return {
    gradient: '135deg, #4c1d95 0%, #6d28d9 25%, #7c3aed 50%, #581c87 75%, #3b0764 100%',
    accent: '#a78bfa',
    label: 'Purgatorio',
    overlay: 'radial-gradient(circle at 40% 30%, rgba(167,139,250,0.12) 0%, transparent 55%), radial-gradient(circle at 70% 80%, rgba(124,58,237,0.15) 0%, transparent 50%)',
    image: '/maps/purgatory.jpg',
  };
  if (map.includes('alpine')) return {
    gradient: '135deg, #0c4a6e 0%, #075985 25%, #0284c7 50%, #0e7490 75%, #155e75 100%',
    accent: '#38bdf8',
    label: 'Alpine',
    overlay: 'radial-gradient(circle at 30% 20%, rgba(56,189,248,0.15) 0%, transparent 55%), radial-gradient(circle at 80% 60%, rgba(12,74,110,0.18) 0%, transparent 50%)',
    image: null,
  };
  if (map.includes('nexterra')) return {
    gradient: '135deg, #7f1d1d 0%, #991b1b 25%, #b91c1c 50%, #9f1239 75%, #881337 100%',
    accent: '#fb7185',
    label: 'Nexterra',
    overlay: 'radial-gradient(circle at 50% 25%, rgba(251,113,133,0.12) 0%, transparent 55%), radial-gradient(circle at 20% 80%, rgba(185,28,28,0.18) 0%, transparent 50%)',
    image: '/maps/nexterra.jpg',
  };
  return {
    gradient: '135deg, #1e293b 0%, #334155 25%, #475569 50%, #1e293b 75%, #0f172a 100%',
    accent: '#f97316',
    label: mapName || 'Unknown',
    overlay: 'radial-gradient(circle at 50% 50%, rgba(249,115,22,0.08) 0%, transparent 60%)',
    image: null,
  };
}

export function getCountdown(date: string): string {
  const diff = new Date(date).getTime() - Date.now();
  if (diff <= 0) return 'Started';
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h`;
  return `${h}h ${m}m`;
}

export function resolveAssetUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, '');
  return `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    REGISTRATION: 'text-green-400 bg-green-400/10',
    ACTIVE: 'text-fire-400 bg-fire-400/10',
    COMPLETED: 'text-blue-400 bg-blue-400/10',
    CANCELLED: 'text-red-400 bg-red-400/10',
    DRAFT: 'text-zinc-400 bg-zinc-400/10',
    PENDING_PAYOUT: 'text-yellow-400 bg-yellow-400/10',
    PAID: 'text-purple-400 bg-purple-400/10',
  };
  return colors[status] || 'text-zinc-400 bg-zinc-400/10';
}
