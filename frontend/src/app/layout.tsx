import type { Metadata, Viewport } from 'next';
import { Inter, Orbitron } from 'next/font/google';
import GlobalSidebar from '@/components/GlobalSidebar';
import GlobalBackButton from '@/components/GlobalBackButton';
import Navbar from '@/components/Navbar';
import BottomNav from '@/components/BottomNav';
import ConditionalFooter from '@/components/ConditionalFooter';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';
import { AuthProvider } from '@/hooks/useAuth';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-body' });
const orbitron = Orbitron({ subsets: ['latin'], variable: '--font-display' });

export const viewport: Viewport = {
  themeColor: '#0a0a0f',
};

export const metadata: Metadata = {
  title: 'NEOBATTLE — Free Fire Tournament Platform',
  description: 'Compete in elite Free Fire tournaments. Win prizes. Dominate the arena.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/logo/image_21332e.jpg?v=2',
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  appleWebApp: {
    capable: true,
    title: 'NeoBattle',
    statusBarStyle: 'black-translucent',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#0a0a0f" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="NeoBattle" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className={`${inter.variable} ${orbitron.variable} font-body antialiased`}>
        <AuthProvider>
          <ServiceWorkerRegister />
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
