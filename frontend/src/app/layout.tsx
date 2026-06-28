import type { Metadata } from 'next';
import { Inter, Orbitron } from 'next/font/google';
import GlobalSidebar from '@/components/GlobalSidebar';
import GlobalBackButton from '@/components/GlobalBackButton';
import Navbar from '@/components/Navbar';
import BottomNav from '@/components/BottomNav';
import ConditionalFooter from '@/components/ConditionalFooter';
import { AuthProvider } from '@/hooks/useAuth';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-body' });
const orbitron = Orbitron({ subsets: ['latin'], variable: '--font-display' });

export const metadata: Metadata = {
  title: 'NEOBATTLE — Free Fire Tournament Platform',
  description: 'Compete in elite Free Fire tournaments. Win prizes. Dominate the arena.',
  icons: {
    icon: '/logo/image_21332e.jpg?v=2',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${orbitron.variable} font-body antialiased`}>
        <AuthProvider>
          <Navbar />
          <GlobalSidebar />
          <main className="min-h-screen pt-16 md:pl-20 pb-16 md:pb-0 max-w-full overflow-x-hidden">
            <GlobalBackButton />
            {children}
          </main>
          <BottomNav />
          <ConditionalFooter />
        </AuthProvider>
      </body>
    </html>
  );
}
