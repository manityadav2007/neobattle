/**
 * String similarity and nickname normalization utility for Free Fire OCR kill-feed matching.
 * Handles fancy Unicode symbols, stylish fonts, fullwidth letters, and minor OCR typos.
 */

// Common Free Fire decoration symbols
const FF_SYMBOLS_REGEX = /[★☆亗꧁꧂༺༻⚡✿ツ☬♛乂彡°•・|丨★†‡✦✧✪✫✬✭✮✯✰▲▼◆◇●○■□★]/gu;

/**
 * Normalizes a player name by stripping decorative symbols, decomposing
 * Unicode accents/fonts (NFKD), removing spaces/punctuation, and lowercasing.
 */
export function normalizeName(name: string): string {
  if (!name || typeof name !== 'string') return '';

  return name
    .normalize('NFKD') // Decompose fullwidth & accented characters
    .replace(FF_SYMBOLS_REGEX, '') // Remove FF decorative clan tags/badges
    .replace(/[\u0300-\u036f]/g, '') // Strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // Keep only standard alphanumeric characters
    .trim();
}

/**
 * Standard Levenshtein distance between two strings.
 */
export function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;

  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return dp[m][n];
}

/**
 * Computes a similarity score between 0.0 and 1.0.
 */
export function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;

  const raw1 = str1.trim().toLowerCase();
  const raw2 = str2.trim().toLowerCase();

  // Exact raw match
  if (raw1 === raw2) return 1.0;

  const norm1 = normalizeName(str1);
  const norm2 = normalizeName(str2);

  // Exact normalized match
  if (norm1 && norm2 && norm1 === norm2) return 0.98;

  // Substring match (e.g. clan tag removed by OCR)
  if (norm1.length >= 4 && norm2.length >= 4) {
    if (norm1.includes(norm2) || norm2.includes(norm1)) {
      const minLen = Math.min(norm1.length, norm2.length);
      const maxLen = Math.max(norm1.length, norm2.length);
      return Math.max(0.85, minLen / maxLen);
    }
  }

  // Levenshtein similarity on normalized strings
  if (norm1.length > 0 && norm2.length > 0) {
    const distNorm = levenshteinDistance(norm1, norm2);
    const maxNormLen = Math.max(norm1.length, norm2.length);
    const simNorm = Math.max(0, 1 - distNorm / maxNormLen);

    // Also check distance on raw lowercase strings with spaces removed
    const compactRaw1 = raw1.replace(/\s+/g, '');
    const compactRaw2 = raw2.replace(/\s+/g, '');
    const distRaw = levenshteinDistance(compactRaw1, compactRaw2);
    const maxRawLen = Math.max(compactRaw1.length, compactRaw2.length);
    const simRaw = Math.max(0, 1 - distRaw / maxRawLen);

    return Math.max(simNorm, simRaw);
  }

  // Fallback to raw string Levenshtein
  const dist = levenshteinDistance(raw1, raw2);
  const maxLen = Math.max(raw1.length, raw2.length);
  return Math.max(0, 1 - dist / maxLen);
}

export interface PlayerCandidate {
  id: string;
  inGameNickname?: string | null;
  ign?: string | null;
  username?: string | null;
  freeFireId?: string | null;
  gameLevel?: number | null;
  teamId?: string | null;
  teamName?: string | null;
  teamTag?: string | null;
}

export interface MatchResult {
  matched: boolean;
  player: PlayerCandidate | null;
  score: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  matchedField?: 'inGameNickname' | 'ign' | 'username' | 'freeFireId';
}

/**
 * Finds the best player match in a roster for a detected name.
 * Confidence threshold is 0.72 by default.
 */
export function findBestPlayerMatch(
  detectedName: string,
  players: PlayerCandidate[],
  threshold = 0.72
): MatchResult {
  if (!detectedName || !players || players.length === 0) {
    return { matched: false, player: null, score: 0, confidence: 'LOW' };
  }

  let bestPlayer: PlayerCandidate | null = null;
  let bestScore = 0;
  let bestField: 'inGameNickname' | 'ign' | 'username' | 'freeFireId' | undefined;

  for (const p of players) {
    const namesToCheck: Array<{ field: 'inGameNickname' | 'ign' | 'username' | 'freeFireId'; val: string | null | undefined }> = [
      { field: 'inGameNickname', val: p.inGameNickname },
      { field: 'ign', val: p.ign },
      { field: 'username', val: p.username },
      { field: 'freeFireId', val: p.freeFireId },
    ];

    for (const { field, val } of namesToCheck) {
      if (!val) continue;
      const score = calculateSimilarity(detectedName, val);
      if (score > bestScore) {
        bestScore = score;
        bestPlayer = p;
        bestField = field;
      }
    }
  }

  const isMatched = bestScore >= threshold;
  const confidence = bestScore >= 0.88 ? 'HIGH' : bestScore >= threshold ? 'MEDIUM' : 'LOW';

  return {
    matched: isMatched,
    player: bestPlayer,
    score: Math.round(bestScore * 100) / 100,
    confidence,
    matchedField: bestField,
  };
}
