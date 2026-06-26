import type { Metadata } from 'next';
import { Inter, Orbitron } from 'next/font/google';
import GlobalSidebar from '@/components/GlobalSidebar';
import GlobalBackButton from '@/components/GlobalBackButton';
import Navbar from '@/components/Navbar';
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
          <main className="min-h-screen pl-20 pt-16 sm:pl-24">
            <GlobalBackButton />
            {children}
          </main>
          <ConditionalFooter />
        </AuthProvider>
      </body>
    </html>
  );
}
