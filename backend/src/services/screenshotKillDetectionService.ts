import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_MODEL_NAME, GEMINI_FALLBACK_MODELS } from './killDetectionService';
import { privateStorageService } from './privateStorage.service';

export interface ScoreboardRow {
  slot: number;
  name: string;
  kills: number;
  greyed: boolean;
}

export interface PlayerCandidate {
  id: string;
  inGameNickname?: string | null;
  ign?: string | null;
  username?: string | null;
  freeFireId?: string | null;
  teamId?: string | null;
  teamName?: string | null;
  teamTag?: string | null;
}

export interface MatchedPlayerResult {
  candidateId: string | null;
  candidateName: string | null;
  candidateIgn: string | null;
  candidateUid: string | null;
  detectedName: string;
  slot: number;
  kills: number;
  greyed: boolean;
  score: number;
  isTruncated: boolean;
  isAmbiguous: boolean;
  needsManualReview: boolean;
  manualReason?: string;
  potentialMatches: Array<{ id: string; name: string; score: number }>;
}

export interface ScanResult {
  detectedRows: ScoreboardRow[];
  matchedPlayers: MatchedPlayerResult[];
  missingPlayers: PlayerCandidate[];
  tokenUsage: {
    promptTokens: number;
    candidateTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    estimatedCostInr: number;
  };
  modelUsed: string;
  durationMs: number;
}

/**
 * Normalizes player name:
 * 1. Unicode NFKC
 * 2. Lowercase
 * 3. Strips clan brackets ([TAG], {TAG}, (TAG)) and decorative symbols (★, 亗, 彡, ⚡, etc.)
 * 4. Unifies lookalikes (0/O, 1/l/i)
 * 5. Collapses whitespace
 */
export function normalizePlayerName(raw: string): string {
  if (!raw) return '';
  let str = raw.normalize('NFKC').toLowerCase().trim();

  // 1. Convert Unicode small capitals (e.g. ᴅ ᴇ ᴀ ᴅ -> d e a d)
  const smallCaps: Record<string, string> = {
    'ᴀ': 'a', 'ʙ': 'b', 'ᴄ': 'c', 'ᴅ': 'd', 'ᴇ': 'e', 'ꜰ': 'f', 'ɢ': 'g', 'ʜ': 'h',
    'ɪ': 'i', 'ᴊ': 'j', 'ᴋ': 'k', 'ʟ': 'l', 'ᴍ': 'm', 'ɴ': 'n', 'ᴏ': 'o', 'ᴘ': 'p',
    'ǫ': 'q', 'ʀ': 'r', 'ꜱ': 's', 'ᴛ': 't', 'ᴜ': 'u', 'ᴠ': 'v', 'ᴡ': 'w', 'ʏ': 'y', 'ᴢ': 'z',
  };
  str = str.replace(/[ᴀ-ᴢ]/gu, (ch) => smallCaps[ch] || ch);

  // 2. Strip prefix clan tags with bullet or separator (e.g. IND•CRIMINAL, OP-LEGEND)
  str = str.replace(/^[a-z0-9]{2,5}[•·|\-]\s*/iu, '');

  // 3. Strip common gaming decorative Unicode characters and symbols first
  str = str.replace(/[★☆亗彡⚡♛✿™★•●◆◇▼▲►◄✓✔✗✘\-_+=~`!@#$%^&*|\\:;"'<>,.?/]/gu, '');

  // 3. Strip clan tags inside brackets [TAG] ONLY when there are alphanumeric letters outside the brackets
  if (/[a-z0-9]+\s*\[.*?\]|\[.*?\]\s*[a-z0-9]+/i.test(str)) {
    str = str.replace(/\[.*?\]|\(.*?\)|<.*?>|\{.*?\}/g, '');
  }

  // 4. Strip any remaining bracket characters
  str = str.replace(/[\[\]\(\)\{\}<>]/g, '');

  // 5. Lookalike unification (0 -> o, 1/i -> l)
  str = str
    .replace(/0/g, 'o')
    .replace(/[1i]/g, 'l');

  // 6. Collapse whitespace
  return str.replace(/\s+/g, '').trim();
}

/**
 * Calculates string similarity between 0.0 and 1.0 using Dice coefficient / Levenshtein
 */
export function calculateSimilarity(s1: string, s2: string): number {
  const a = normalizePlayerName(s1);
  const b = normalizePlayerName(s2);

  if (a === b) return 1.0;
  if (!a || !b) return 0.0;
  if (a.length < 2 || b.length < 2) {
    return a === b ? 1.0 : 0.0;
  }

  // Substring containment for truncated names
  if (a.length >= 3 && b.startsWith(a)) {
    return 0.85 + (a.length / b.length) * 0.1;
  }
  if (b.length >= 3 && a.startsWith(b)) {
    return 0.85 + (b.length / a.length) * 0.1;
  }

  // Bigram Dice coefficient
  const getBigrams = (str: string) => {
    const bigrams = new Map<string, number>();
    for (let i = 0; i < str.length - 1; i++) {
      const bg = str.slice(i, i + 2);
      bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
    }
    return bigrams;
  };

  const bgA = getBigrams(a);
  const bgB = getBigrams(b);
  let intersection = 0;

  for (const [bg, countA] of bgA.entries()) {
    const countB = bgB.get(bg) || 0;
    intersection += Math.min(countA, countB);
  }

  const total = a.length - 1 + (b.length - 1);
  return total > 0 ? (2 * intersection) / total : 0;
}

/**
 * Merges rows across multiple screenshots by slot and name
 */
export function mergeScoreboardRows(rowSets: ScoreboardRow[][]): ScoreboardRow[] {
  const mergedMap = new Map<string, ScoreboardRow>();

  for (const rows of rowSets) {
    for (const r of rows) {
      if (!r || typeof r.slot !== 'number' || !r.name) continue;
      const key = `slot_${r.slot}`;
      const existing = mergedMap.get(key);

      if (!existing) {
        mergedMap.set(key, {
          slot: r.slot,
          name: String(r.name).trim(),
          kills: Math.max(0, Number(r.kills) || 0),
          greyed: Boolean(r.greyed),
        });
      } else {
        // If slot matches, take higher kill count and prefer non-truncated name
        const kills = Math.max(existing.kills, Math.max(0, Number(r.kills) || 0));
        const preferredName =
          existing.name.endsWith('...') && !r.name.endsWith('...')
            ? r.name
            : existing.name;
        mergedMap.set(key, {
          slot: r.slot,
          name: preferredName.trim(),
          kills,
          greyed: Boolean(existing.greyed && r.greyed),
        });
      }
    }
  }

  return Array.from(mergedMap.values()).sort((a, b) => a.slot - b.slot);
}

/**
 * Fuzzy matches scoreboard rows against registered tournament player roster.
 * CRITICAL RULE: Unsure, truncated ("...") or ambiguous matches are NEVER auto-assigned!
 */
export function matchRowsToCandidates(
  rows: ScoreboardRow[],
  candidates: PlayerCandidate[]
): {
  matchedPlayers: MatchedPlayerResult[];
  missingPlayers: PlayerCandidate[];
} {
  const matchedPlayers: MatchedPlayerResult[] = [];
  const assignedCandidateIds = new Set<string>();

  for (const row of rows) {
    const rawName = row.name || '';
    const isTruncated = rawName.includes('...') || rawName.endsWith('..') || rawName.endsWith('…');

    // Score all candidates
    const scoredCandidates: Array<{ candidate: PlayerCandidate; score: number }> = [];

    for (const cand of candidates) {
      const namesToTest = [
        cand.inGameNickname,
        cand.ign,
        cand.username,
        cand.freeFireId,
      ].filter(Boolean) as string[];

      let maxScore = 0;
      for (const name of namesToTest) {
        const score = calculateSimilarity(rawName, name);
        if (score > maxScore) maxScore = score;
      }

      if (maxScore > 0.4) {
        scoredCandidates.push({ candidate: cand, score: maxScore });
      }
    }

    scoredCandidates.sort((a, b) => b.score - a.score);

    const top = scoredCandidates[0];
    const second = scoredCandidates[1];

    const isAmbiguous =
      Boolean(top && second && Math.abs(top.score - second.score) < 0.1 && top.score >= 0.7);

    // Auto-assignment threshold
    const canAutoAssign =
      Boolean(top) &&
      top.score >= 0.88 &&
      !isTruncated &&
      !isAmbiguous &&
      !assignedCandidateIds.has(top.candidate.id);

    if (canAutoAssign && top) {
      assignedCandidateIds.add(top.candidate.id);
      matchedPlayers.push({
        candidateId: top.candidate.id,
        candidateName: top.candidate.username || null,
        candidateIgn: top.candidate.inGameNickname || top.candidate.ign || null,
        candidateUid: top.candidate.freeFireId || null,
        detectedName: rawName,
        slot: row.slot,
        kills: row.kills,
        greyed: row.greyed,
        score: top.score,
        isTruncated: false,
        isAmbiguous: false,
        needsManualReview: false,
        potentialMatches: scoredCandidates.slice(0, 3).map((sc) => ({
          id: sc.candidate.id,
          name: sc.candidate.inGameNickname || sc.candidate.ign || sc.candidate.username || sc.candidate.id,
          score: Math.round(sc.score * 100) / 100,
        })),
      });
    } else {
      // Unsure, truncated, or ambiguous -> Admin must manually pick!
      matchedPlayers.push({
        candidateId: null,
        candidateName: null,
        candidateIgn: null,
        candidateUid: null,
        detectedName: rawName,
        slot: row.slot,
        kills: row.kills,
        greyed: row.greyed,
        score: top ? top.score : 0,
        isTruncated,
        isAmbiguous,
        needsManualReview: true,
        manualReason: isTruncated
          ? 'Truncated name (...)'
          : isAmbiguous
          ? 'Multiple candidate players matched (ambiguous)'
          : 'Low similarity score — unassigned',
        potentialMatches: scoredCandidates.slice(0, 4).map((sc) => ({
          id: sc.candidate.id,
          name: sc.candidate.inGameNickname || sc.candidate.ign || sc.candidate.username || sc.candidate.id,
          score: Math.round(sc.score * 100) / 100,
        })),
      });
    }
  }

  // Find registered players not found in any row
  const matchedCandidateIds = new Set(
    matchedPlayers.map((m) => m.candidateId).filter(Boolean) as string[]
  );
  const missingPlayers = candidates.filter((c) => !matchedCandidateIds.has(c.id));

  return { matchedPlayers, missingPlayers };
}

/**
 * Main function: Scans an array of tournament screenshot storage keys or image buffers using Gemini Multimodal
 */
export async function scanTournamentScreenshots(
  screenshotSources: Array<{ storageKey?: string; buffer?: Buffer; format?: string }>,
  candidates: PlayerCandidate[]
): Promise<ScanResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in backend environment.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const candidateModels = [GEMINI_MODEL_NAME, ...GEMINI_FALLBACK_MODELS.filter((m) => m !== GEMINI_MODEL_NAME)];

  // Prepare images for Gemini
  const imageParts: Array<{ inlineData: { data: string; mimeType: string } }> = [];

  for (const src of screenshotSources) {
    let buf: Buffer;
    if (src.buffer) {
      buf = src.buffer;
    } else if (src.storageKey) {
      buf = await privateStorageService.getImageBuffer(src.storageKey);
    } else {
      continue;
    }

    const mimeType = src.format === 'png' ? 'image/png' : src.format === 'webp' ? 'image/webp' : 'image/jpeg';
    imageParts.push({
      inlineData: {
        data: buf.toString('base64'),
        mimeType,
      },
    });
  }

  if (imageParts.length === 0) {
    throw new Error('No valid screenshots provided for AI scan.');
  }

  const prompt = `You are an expert Free Fire match referee AI analyzing post-match result scoreboard screenshots.
For each visible player row in the scoreboard table:
1. "slot": the row/slot number (1, 2, 3...) or ordinal position.
2. "name": the exact in-game nickname (IGN) shown for that player.
3. "kills": total kills/eliminations shown for this player (integer, minimum 0).
4. "greyed": true if the player row appears eliminated / knocked / greyed out, false if active/winner.

Return ONLY a valid JSON array of objects conforming exactly to this structure:
[
  {
    "slot": 1,
    "name": "PlayerIGN",
    "kills": 4,
    "greyed": false
  }
]
If no scoreboard rows are visible, return [].
Return strict JSON only, without any commentary or markdown formatting.`;

  let lastError: any = null;
  let rawResponseText = '';
  let modelUsed = '';
  let promptTokens = 0;
  let candidateTokens = 0;
  let totalTokens = 0;
  const startTime = Date.now();

  for (let idx = 0; idx < candidateModels.length; idx++) {
    const currentModel = candidateModels[idx];
    const isFallback = idx > 0;
    const maskedKey = `...${apiKey.slice(-4)}`;

    console.log(`\n======================================================`);
    console.log(`[ScreenshotScan] [Gemini Pre-Flight] ${isFallback ? '(Fallback Model)' : 'Primary'}`);
    console.log(`[ScreenshotScan] API Key (masked): ${maskedKey}`);
    console.log(`[ScreenshotScan] Model: "${currentModel}"`);
    console.log(`[ScreenshotScan] Screenshots to scan: ${imageParts.length}`);
    console.log(`======================================================`);

    try {
      const model = genAI.getGenerativeModel({
        model: currentModel,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });

      const res = await model.generateContent([prompt, ...imageParts]);
      const response = await res.response;
      rawResponseText = response.text();
      modelUsed = currentModel;

      if (response.usageMetadata) {
        promptTokens = response.usageMetadata.promptTokenCount || 0;
        candidateTokens = response.usageMetadata.candidatesTokenCount || 0;
        totalTokens = response.usageMetadata.totalTokenCount || promptTokens + candidateTokens;
      }

      console.log(`[ScreenshotScan] Success with ${currentModel} in ${Date.now() - startTime}ms`);
      break;
    } catch (err: any) {
      lastError = err;
      console.error(`[ScreenshotScan] Error with ${currentModel}:`, err.message || err);
      if (idx < candidateModels.length - 1) {
        console.log(`[ScreenshotScan] Cascading to fallback model: ${candidateModels[idx + 1]}...`);
        continue;
      }
    }
  }

  if (!rawResponseText) {
    throw lastError || new Error('Gemini vision scan failed across all candidate models.');
  }

  // Parse JSON response safely
  let detectedRows: ScoreboardRow[] = [];
  try {
    const cleaned = rawResponseText.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      detectedRows = parsed.map((p, idx) => ({
        slot: typeof p.slot === 'number' ? p.slot : idx + 1,
        name: String(p.name || '').trim(),
        kills: Math.max(0, parseInt(p.kills, 10) || 0),
        greyed: Boolean(p.greyed),
      })).filter((r) => r.name.length > 0);
    }
  } catch (parseErr: any) {
    console.warn('[ScreenshotScan] Failed to parse Gemini response as JSON:', parseErr.message, rawResponseText);
  }

  // If multiple screenshots yielded separate row arrays, merge by slot
  const mergedRows = mergeScoreboardRows([detectedRows]);

  // Match against registered candidates
  const { matchedPlayers, missingPlayers } = matchRowsToCandidates(mergedRows, candidates);

  // Compute pricing
  const inputPricePerM = parseFloat(process.env.GEMINI_INPUT_TOKEN_PRICE_PER_M || '0.10');
  const outputPricePerM = parseFloat(process.env.GEMINI_OUTPUT_TOKEN_PRICE_PER_M || '0.40');
  const usdToInr = parseFloat(process.env.USD_TO_INR_RATE || '86.0');

  const estimatedCostUsd =
    (promptTokens / 1_000_000) * inputPricePerM + (candidateTokens / 1_000_000) * outputPricePerM;
  const estimatedCostInr = estimatedCostUsd * usdToInr;

  console.log(
    `[ScreenshotScan] Usage: ${promptTokens} input, ${candidateTokens} output. Cost: $${estimatedCostUsd.toFixed(6)} (~₹${estimatedCostInr.toFixed(4)})`
  );

  return {
    detectedRows: mergedRows,
    matchedPlayers,
    missingPlayers,
    tokenUsage: {
      promptTokens,
      candidateTokens,
      totalTokens,
      estimatedCostUsd,
      estimatedCostInr,
    },
    modelUsed,
    durationMs: Date.now() - startTime,
  };
}
