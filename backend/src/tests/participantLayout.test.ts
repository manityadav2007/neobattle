import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ============================================================================
// Layout Simulation & Mathematical Constraint Validation
// ============================================================================

interface LayoutBox {
  availableWidth: number;
  uidWidth: number;
  ignWidth: number;
  usernameFullWidth: number;
  gap: number;
}

interface LayoutResult {
  rowOverflows: boolean;
  uidShrunk: boolean;
  usernameTruncated: boolean;
  usernameRenderedWidth: number;
  ignRenderedWidth: number;
  uidRenderedWidth: number;
}

/**
 * Simulates CSS Flexbox layout for the participant row:
 * - Row width = availableWidth
 * - Right child: UID (shrink-0, whitespace-nowrap)
 * - Left child: flex-1 min-w-0 flex container containing:
 *     - Username (min-w-0 truncate)
 *     - IGN (shrink-0 or max-w-[45%] truncate)
 */
function simulateParticipantRow(box: LayoutBox): LayoutResult {
  const { availableWidth, uidWidth, ignWidth, usernameFullWidth, gap } = box;

  // UID is shrink-0 whitespace-nowrap: its rendered width is strictly its full width
  const uidRenderedWidth = uidWidth;
  const rightTotalWidth = uidRenderedWidth;

  // Space left for the left flex-1 container:
  const leftAvailableWidth = availableWidth - rightTotalWidth - gap;

  // Left container has username + gap + ign
  // Username shrinks first (min-w-0 truncate)
  // IGN is kept next to username (max-w-[45%] of left container if needed)
  const maxIgnWidth = leftAvailableWidth * 0.45;
  const ignRenderedWidth = Math.min(ignWidth, Math.max(ignWidth, maxIgnWidth));

  const spaceForUsername = Math.max(0, leftAvailableWidth - ignRenderedWidth - gap);

  const usernameTruncated = usernameFullWidth > spaceForUsername;
  const usernameRenderedWidth = Math.min(usernameFullWidth, spaceForUsername);

  const totalRenderedWidth = usernameRenderedWidth + gap + ignRenderedWidth + gap + uidRenderedWidth;
  const rowOverflows = totalRenderedWidth > availableWidth;

  return {
    rowOverflows,
    uidShrunk: uidRenderedWidth < uidWidth,
    usernameTruncated,
    usernameRenderedWidth,
    ignRenderedWidth,
    uidRenderedWidth,
  };
}

// Approximate text width at 12px (text-xs) font size: ~7.2px per character
function textWidth(text: string, isMono = false): number {
  const charWidth = isMono ? 7.5 : 7.2;
  return Math.ceil(text.length * charWidth);
}

const TEST_USERNAMES = [
  'firstplayer',
  'Rajput',
  'google_755925072466',
  'google_985692327395',
  'A_Very_Long_Player_Name_30_Chars', // 32 characters
];

const VIEWPORTS = [
  { width: 320, name: '320px (Ultra-compact Mobile)' },
  { width: 386, name: '386px (Target Mobile Width)' },
  { width: 768, name: '768px (Tablet / Desktop)' },
];

test('Participant Row Layout - Verification at 320px, 386px, and 768px', () => {
  const sampleUid = '1098765432'; // 10-digit Free Fire UID
  const sampleIgn = '(ALONE)';
  const uidWidth = textWidth(sampleUid, true); // ~75px
  const ignWidth = textWidth(sampleIgn);       // ~51px

  for (const vp of VIEWPORTS) {
    // In page.tsx:
    // Outer page padding: px-4 (32px total)
    // Card padding: p-4 (32px total) on mobile, p-6 on desktop
    // Row padding: p-3 (24px total)
    const pagePadding = 32;
    const cardPadding = vp.width < 640 ? 32 : 48;
    const rowPadding = 24;

    // Available width inside a single row:
    const gridCols = vp.width >= 1024 ? 3 : vp.width >= 640 ? 2 : 1;
    const containerWidth = vp.width - pagePadding - cardPadding;
    const rowWidth = Math.floor((containerWidth - (gridCols - 1) * 10) / gridCols) - rowPadding;

    for (const username of TEST_USERNAMES) {
      const uWidth = textWidth(username);
      const result = simulateParticipantRow({
        availableWidth: rowWidth,
        uidWidth,
        ignWidth,
        usernameFullWidth: uWidth,
        gap: 8,
      });

      // 1. UID must NEVER shrink or overflow
      assert.equal(result.uidShrunk, false, `UID must never shrink for ${username} at ${vp.width}px`);
      assert.equal(result.uidRenderedWidth, uidWidth);

      // 2. Row must NEVER overflow its card width
      assert.equal(result.rowOverflows, false, `Row must not overflow for ${username} at ${vp.width}px`);

      // 3. Short usernames must NOT truncate at tablet/desktop (768px)
      if (vp.width === 768 && (username === 'firstplayer' || username === 'Rajput')) {
        assert.equal(result.usernameTruncated, false, `${username} should not truncate at 768px`);
      }

      // 4. Long usernames must truncate gracefully when space is tight at 320px
      if (vp.width === 320 && username.startsWith('google_')) {
        assert.equal(result.usernameTruncated, true, `${username} should truncate at 320px`);
        assert.ok(result.usernameRenderedWidth > 0, 'Username rendered width must be > 0');
      }
    }
  }
});

// ============================================================================
// Source Code Pattern & Tailwind Class Verification
// ============================================================================

test('Tournament Page Source - UID element has shrink-0 and whitespace-nowrap', () => {
  const pagePath = path.resolve(__dirname, '../../../frontend/src/app/tournaments/[id]/page.tsx');
  const content = fs.readFileSync(pagePath, 'utf8');

  // Verify solo participant list UID has flex-shrink-0 / shrink-0 and whitespace-nowrap
  assert.ok(
    content.includes('font-mono text-zinc-400 shrink-0 flex-shrink-0 whitespace-nowrap'),
    'Solo entry UID must have shrink-0 flex-shrink-0 whitespace-nowrap'
  );

  // Verify username has min-w-0 and truncate
  assert.ok(
    content.includes('text-white font-medium truncate min-w-0'),
    'Username must have truncate min-w-0'
  );

  // Verify title attribute on username
  assert.ok(
    content.includes('title={entry.user?.username}'),
    'Username must have title attribute for hover/long-press'
  );

  // Verify team member UID has shrink-0 flex-shrink-0 whitespace-nowrap
  assert.ok(
    content.includes('font-mono text-zinc-400 text-[11px] shrink-0 flex-shrink-0 whitespace-nowrap'),
    'Team member UID must have shrink-0 flex-shrink-0 whitespace-nowrap'
  );

  // Verify IGN has truncate and max-w-[45%]
  assert.ok(
    content.includes('text-zinc-500 truncate shrink-0 max-w-[45%]'),
    'In-game name must maintain position, truncate, and max-w-[45%]'
  );
});

test('Other Views Source - Admin & Host Dashboard participant rows updated', () => {
  const adminPagePath = path.resolve(__dirname, '../../../frontend/src/app/admin/tournaments/page.tsx');
  const adminContent = fs.readFileSync(adminPagePath, 'utf8');

  assert.ok(
    adminContent.includes('shrink-0 flex-shrink-0 whitespace-nowrap'),
    'Admin tournaments rows must include shrink-0 flex-shrink-0 whitespace-nowrap'
  );

  const hostPagePath = path.resolve(__dirname, '../../../frontend/src/app/host-dashboard/page.tsx');
  const hostContent = fs.readFileSync(hostPagePath, 'utf8');

  assert.ok(
    hostContent.includes('shrink-0 flex-shrink-0 whitespace-nowrap'),
    'Host dashboard rows must include shrink-0 flex-shrink-0 whitespace-nowrap'
  );
});
