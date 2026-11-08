import type { Metadata, Viewport } from 'next';
import { Inter, Orbitron } from 'next/font/google';
import GlobalSidebar from '@/components/GlobalSidebar';
import GlobalBackButton from '@/components/GlobalBackButton';
import Navbar from '@/components/Navbar';
import BottomNav from '@/components/BottomNav';
import ConditionalFooter from '@/components/ConditionalFooter';
import AppMain from '@/components/AppMain';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';
import SplashScreen from '@/components/SplashScreen';
import AppScrollReset from '@/components/AppScrollReset';
import AppLoginGate from '@/components/AppLoginGate';
import NotificationPermissionPrompt from '@/components/NotificationPermissionPrompt';
import ForegroundNotificationToast from '@/components/ForegroundNotificationToast';
import { AuthProvider } from '@/hooks/useAuth';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const orbitron = Orbitron({ subsets: ['latin'], variable: '--font-display', display: 'swap' });

export const viewport: Viewport = {
  themeColor: '#000000',
  colorScheme: 'dark',
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
    <html lang="en" className="dark" style={{ background: '#000', colorScheme: 'dark' }}>
      <head>
        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content="#000000" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="NeoBattle" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <style
          dangerouslySetInnerHTML={{
            __html: `html,body{background:#000 !important;color-scheme:dark;}#twa-splash-screen{background:#000;}`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches;var i=window.navigator&&window.navigator.standalone===true;var r=document.referrer&&document.referrer.indexOf('android-app://')===0;var u=window.navigator&&window.navigator.userAgent&&window.navigator.userAgent.indexOf('NeoBattleApp')!==-1;var k=typeof window.Capacitor!=='undefined';var t=s||i||r||u||k;var e=document.documentElement;if(t){e.classList.add('app-mode');if(window.location.pathname==='/'){e.classList.add('app-home');}var v=document.querySelector('meta[name="viewport"]');if(v){var c=v.getAttribute('content')||'';if(c.indexOf('viewport-fit=cover')===-1){v.setAttribute('content',c+', viewport-fit=cover');}}}var d=sessionStorage.getItem('neobattle_splash_shown');if(d){e.classList.add('twa-splash-dismissed');}else if(t){e.classList.add('twa-splash-active');var p=document.createElement('link');p.rel='preload';p.as='image';p.href='/app-splash-bg.webp';p.type='image/webp';document.head.appendChild(p);}}catch(err){}})();`,
          }}
        />
      </head>
      <body
        className={`${inter.variable} ${orbitron.variable} font-body antialiased`}
        style={{ background: '#000' }}
      >
        <SplashScreen />
        <AuthProvider>
          <AppScrollReset />
          <ServiceWorkerRegister />
          <AppLoginGate>
            <Navbar />
            <GlobalSidebar />
            <NotificationPermissionPrompt />
            <ForegroundNotificationToast />
            <AppMain>
              <GlobalBackButton />
              {children}
            </AppMain>
            <BottomNav />
            <ConditionalFooter />
          </AppLoginGate>
        </AuthProvider>
      </body>
    </html>
  );
}
