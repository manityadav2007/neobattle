import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Gaming Arena — NEOBATTLE',
  description: 'Compete in daily Free Fire esports tournaments, access match room codes, and win real cash prizes on NeoBattle.',
};

export default function ArenaLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
