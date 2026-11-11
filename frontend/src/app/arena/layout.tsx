import type { Metadata } from 'next';
import Navbar from '@/components/Navbar';
import BottomNav from '@/components/BottomNav';
import GlobalSidebar from '@/components/GlobalSidebar';

export const metadata: Metadata = {
  title: 'Gaming Arena — NEOBATTLE',
  description: 'Compete in daily Free Fire esports tournaments, access match room codes, and win real cash prizes on NeoBattle.',
};

export default function ArenaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <GlobalSidebar />
      {children}
      <BottomNav />
    </>
  );
}
