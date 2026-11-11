'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  Zap,
  Download,
  Lock,
  Wallet,
} from 'lucide-react';
import ParticleCanvas from '@/components/ParticleCanvas';
import LogoAsset from '@/components/LogoAsset';
import DownloadSection from '@/components/DownloadSection';
import { AndroidIcon } from '@/components/DownloadSection';
import { useIsApp } from '@/hooks/useIsApp';
import { APP_APK_URL } from '@/config/download';

const features = [
  {
    icon: ShieldCheck,
    title: 'Automated UID Verification',
    desc: 'Instant player UID validation and automated match result processing ensure every kill and placement is recorded with 100% accuracy.',
    accent: 'from-cyan-500/20 to-blue-500/20',
    border: 'border-cyan-500/30',
  },
  {
    icon: Zap,
    title: 'Instant Room IDs',
    desc: 'Custom match room ID and password delivered straight to your tournament screen 15 minutes before kick-off. No manual chat coordination.',
    accent: 'from-amber-500/20 to-orange-500/20',
    border: 'border-amber-500/30',
  },
  {
    icon: Lock,
    title: 'Fair Play Anti-Cheat',
    desc: 'Strict device verification, emulator blocks, and active referee audits guarantee a genuine, cheat-free battleground for legitimate players.',
    accent: 'from-emerald-500/20 to-teal-500/20',
    border: 'border-emerald-500/30',
  },
  {
    icon: Wallet,
    title: 'Fast UPI Withdrawals',
    desc: 'Direct, low-minimum payouts straight to your UPI ID (Google Pay, PhonePe, Paytm, or BHIM) processed rapidly upon match verification.',
    accent: 'from-purple-500/20 to-pink-500/20',
    border: 'border-purple-500/30',
  },
];

const mockScreens = [
  {
    title: 'Match Lobby',
    subtitle: 'Daily Solo, Duo & Squad tournaments with verified players',
    tag: 'LOBBY',
    image: '/maps/bermuda.jpg',
    badge: 'Bermuda Ranked',
  },
  {
    title: 'Official FF Maps',
    subtitle: 'Compete on Bermuda, Kalahari, Purgatory & Alpine',
    tag: 'MAPS',
    image: '/maps/kalahari.jpg',
    badge: 'Competitive Pool',
  },
  {
    title: 'Live Leaderboards',
    subtitle: 'Track your match statistics, top frags, and prize standings',
    tag: 'RANKINGS',
    image: '/maps/purgatory.jpg',
    badge: 'Tier Rankings',
  },
  {
    title: 'Instant Cashout',
    subtitle: 'Track winning balances and request quick UPI withdrawals',
    tag: 'WALLET',
    image: '/maps/nexterra.jpg',
    badge: 'Direct UPI',
  },
];

export default function HomePage() {
  const isApp = useIsApp();
  const router = useRouter();

  // If accessed from installed Capacitor app wrapper, route straight to the gaming arena
  useEffect(() => {
    if (isApp) {
      router.replace('/arena');
    }
  }, [isApp, router]);

  return (
    <div className="relative website-home min-h-screen bg-black text-white selection:bg-orange-500 selection:text-black">
      <ParticleCanvas />

      {/* 1. MINIMAL BRAND NAVBAR: Logo on left, small Download App button on right */}
      <header className="relative z-20 w-full border-b border-white/10 bg-black/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <LogoAsset className="h-7 w-auto" />
            <span className="font-display font-extrabold text-lg sm:text-xl tracking-wider text-white">
              NEOBATTLE
            </span>
          </div>

          <a
            href={APP_APK_URL}
            download="neobattle.apk"
            className="flex items-center gap-2 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-bold text-black bg-gradient-to-r from-orange-500 via-amber-400 to-orange-500 hover:brightness-110 shadow-md shadow-orange-500/20 active:scale-95 transition-all"
          >
            <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-black" />
            <span>Download App</span>
          </a>
        </div>
      </header>

      {/* 2. HERO SECTION */}
      <section className="relative z-10 pt-16 pb-14 md:pt-24 md:pb-20 overflow-hidden">
        {/* Ambient background glow */}
        <div className="pointer-events-none absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[540px] h-[540px] bg-gradient-to-tr from-orange-500/15 via-red-500/10 to-transparent rounded-full blur-3xl opacity-60" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="max-w-3xl mx-auto">
            {/* Platform badge */}
            <motion.div
              initial={{ opacity: 0, y: -15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 backdrop-blur-md mb-6"
            >
              <LogoAsset className="h-4 w-auto" />
              <span className="text-orange-400 text-xs sm:text-sm font-semibold tracking-wider uppercase">
                India&apos;s Elite Free Fire Esports Arena
              </span>
            </motion.div>

            {/* Main Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-4xl sm:text-6xl md:text-7xl font-display font-black leading-[1.08] tracking-tight mb-6"
            >
              NeoBattle — Compete in Daily Free Fire Tournaments
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-base sm:text-lg md:text-xl text-zinc-300 max-w-2xl mx-auto mb-9 leading-relaxed font-normal"
            >
              India&apos;s ultimate esports platform. Join verified matches, track kills automatically, receive instant room credentials, and cash out winnings directly via UPI.
            </motion.p>

            {/* Primary CTA: ONE big centered button */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-col items-center justify-center gap-3 max-w-md mx-auto"
            >
              <a
                href={APP_APK_URL}
                download="neobattle.apk"
                className="w-full flex items-center justify-center gap-3 px-8 py-4 sm:py-5 rounded-2xl text-base sm:text-lg font-bold text-black bg-gradient-to-r from-orange-500 via-amber-400 to-orange-500 hover:brightness-110 shadow-xl shadow-orange-500/25 active:scale-95 transition-all"
              >
                <AndroidIcon className="w-6 h-6 text-black" />
                <span>Download Android APK</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-black/20 text-black border border-black/20">
                  v1.1.0 • ~7.5 MB
                </span>
              </a>

              <p className="text-xs text-zinc-500 flex items-center gap-1.5 mt-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                100% Virus-Free • Instant Room ID &amp; Password Access
              </p>
            </motion.div>

            {/* Clean subtle mode tag for test compatibility */}
            <div className="mt-8 text-center">
              <p className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-orange-500/20 bg-orange-500/5 text-xs text-zinc-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Compete in Daily Solo, Duo &amp; Squad Tournaments</p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. DOWNLOAD CTA SECTION (placed between header/banner and features) */}
      <DownloadSection />

      {/* 4. APP FEATURES: Why NEOBATTLE? */}
      <section className="relative z-10 py-16 md:py-24 border-t border-white/5 bg-zinc-950/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-3xl sm:text-4xl font-display font-bold">
              Why <span className="gradient-text">NEOBATTLE</span>?
            </h2>
            <p className="mt-3 text-sm sm:text-base text-zinc-400">
              Built exclusively for competitive mobile battle royale players with fair matches and verified results.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={`glass-card relative overflow-hidden rounded-2xl p-6 border ${f.border} hover:fire-glow transition-all`}
              >
                <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${f.accent} mb-4`}>
                  <f.icon className="w-6 h-6 text-orange-400" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2 font-display">{f.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. APP SCREENSHOTS / MOCKUP GALLERY */}
      <section className="relative z-10 py-16 md:py-24 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-xs uppercase tracking-widest text-orange-400 font-semibold">
              Live Inside The App
            </span>
            <h2 className="text-3xl sm:text-4xl font-display font-bold mt-2">
              Inside the <span className="gradient-text">NeoBattle App</span>
            </h2>
            <p className="mt-3 text-sm sm:text-base text-zinc-400">
              Experience seamless esports tournaments built exclusively for mobile.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {mockScreens.map((card) => (
              <div
                key={card.title}
                className="glass-card group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-white/10 hover:border-orange-500/40 transition-all duration-300"
              >
                <div className="relative h-48 w-full overflow-hidden bg-black/60">
                  <img
                    src={card.image}
                    alt={card.title}
                    className="h-full w-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                  <div className="absolute top-3 left-3">
                    <span className="rounded-full bg-black/75 px-2.5 py-0.5 text-[10px] font-extrabold tracking-wider uppercase text-orange-400 border border-orange-500/30 backdrop-blur-xs">
                      {card.tag}
                    </span>
                  </div>
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs font-semibold text-white drop-shadow">
                    <span>{card.badge}</span>
                  </div>
                </div>

                <div className="p-5">
                  <h3 className="font-display font-bold text-base text-white group-hover:text-orange-400 transition-colors">
                    {card.title}
                  </h3>
                  <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                    {card.subtitle}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. SINGLE CLEAN FOOTER: Copyright + Legal links */}
      <footer className="relative z-10 py-10 border-t border-white/10 bg-black text-zinc-400 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <LogoAsset className="h-6 w-auto" />
              <span className="font-display font-bold text-sm text-white tracking-wider">
                NEOBATTLE
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-zinc-400">
              <Link href="/terms" className="hover:text-white transition-colors">
                Terms
              </Link>
              <Link href="/privacy" className="hover:text-white transition-colors">
                Privacy
              </Link>
              <Link href="/fair-play" className="hover:text-white transition-colors">
                Fair Play
              </Link>
              <a
                href="mailto:neobattle8@gmail.com"
                className="hover:text-orange-400 transition-colors"
              >
                neobattle8@gmail.com
              </a>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-zinc-500">
            <p>© {new Date().getFullYear()} NEOBATTLE. All rights reserved.</p>
            <p className="text-center sm:text-right">
              NeoBattle is an independent esports platform and is not affiliated with or endorsed by Garena or Free Fire.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
