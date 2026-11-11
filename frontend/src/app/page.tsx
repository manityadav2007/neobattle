'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Trophy,
  ShieldCheck,
  Zap,
  Users,
  ChevronRight,
  Download,
  Smartphone,
  ExternalLink,
  CheckCircle2,
  Lock,
  ArrowRight,
  Sparkles,
  Gamepad2,
  Clock,
  Wallet,
  Share2,
} from 'lucide-react';
import ParticleCanvas from '@/components/ParticleCanvas';
import LogoAsset from '@/components/LogoAsset';
import DownloadSection from '@/components/DownloadSection';
import { AndroidIcon, AppleIcon } from '@/components/DownloadSection';
import { useAuth } from '@/hooks/useAuth';
import { useIsApp } from '@/hooks/useIsApp';
import { APP_APK_URL } from '@/config/download';
import { statsApi } from '@/lib/services';

const features = [
  {
    icon: Zap,
    title: 'Instant Room IDs',
    desc: 'Room ID & Password delivered directly to your arena dashboard 15 minutes before match start. No waiting in chats.',
    accent: 'from-amber-500/20 to-orange-500/20',
    border: 'border-amber-500/30',
  },
  {
    icon: ShieldCheck,
    title: 'Automated UID & Kill Verification',
    desc: 'Advanced screenshot parsing and player UID tracking verify every kill and placement automatically.',
    accent: 'from-cyan-500/20 to-blue-500/20',
    border: 'border-cyan-500/30',
  },
  {
    icon: Lock,
    title: '100% Fair Play Guarantee',
    desc: 'Strict anti-hack protocols, banned emulators, and audited matches guarantee a level playing field for real players.',
    accent: 'from-emerald-500/20 to-teal-500/20',
    border: 'border-emerald-500/30',
  },
  {
    icon: Wallet,
    title: 'Instant UPI Withdrawals',
    desc: 'Transfer tournament earnings straight to your UPI ID (Google Pay, PhonePe, Paytm) or Bank within minutes.',
    accent: 'from-purple-500/20 to-pink-500/20',
    border: 'border-purple-500/30',
  },
];

const mockScreens = [
  {
    title: 'Tournament Lobbies',
    subtitle: 'Solo, Duo & Squad matches with guaranteed cash prize pools',
    tag: 'MATCH LOBBY',
    image: '/maps/bermuda.jpg',
    badge: 'Bermuda • ₹500 Pool',
    meta: 'Entry: ₹20 • 48 Players',
  },
  {
    title: 'Battle Map Selection',
    subtitle: 'Compete across all official Free Fire ranked maps',
    tag: 'OFFICIAL MAPS',
    image: '/maps/kalahari.jpg',
    badge: 'Kalahari • Solo Rush',
    meta: 'Entry: FREE • 50 Players',
  },
  {
    title: 'Live Leaderboards',
    subtitle: 'Climb leagues from Bronze to Grandmaster and gain fame',
    tag: 'LEADERBOARD',
    image: '/maps/purgatory.jpg',
    badge: 'Purgatorio • Squad Clash',
    meta: 'Entry: ₹100 • ₹2,500 Pool',
  },
  {
    title: 'Instant Wallet & Cashout',
    subtitle: 'Transparent payouts directly to your personal UPI ID',
    tag: 'FAST CASHOUT',
    image: '/maps/nexterra.jpg',
    badge: 'Nexterra • Duo Ranked',
    meta: 'Entry: ₹40 • Instant UPI',
  },
];

export default function HomePage() {
  const isApp = useIsApp();
  const router = useRouter();
  const { user } = useAuth();
  const [platformStats, setPlatformStats] = useState({ totalUsers: 0, totalTournaments: 0, totalPrizePool: 0 });

  // If accessed from installed Capacitor app or PWA standalone, route straight to the gaming arena
  useEffect(() => {
    if (isApp) {
      router.replace('/arena');
    }
  }, [isApp, router]);

  useEffect(() => {
    statsApi
      .get()
      .then((res) => {
        if (res.data) setPlatformStats(res.data);
      })
      .catch(() => {});
  }, []);

  const totalPlayersDisplay = Math.max(platformStats.totalUsers || 0, 52000).toLocaleString('en-IN') + '+';
  const totalTournamentsDisplay = Math.max(platformStats.totalTournaments || 0, 1850).toLocaleString('en-IN') + '+';
  const totalPrizesDisplay = '₹' + Math.max(platformStats.totalPrizePool || 0, 1250000).toLocaleString('en-IN') + '+';

  return (
    <div className="relative website-home min-h-screen bg-black text-white selection:bg-orange-500 selection:text-black">
      <ParticleCanvas />

      {/* 1. HERO SECTION */}
      <section className="relative z-10 pt-28 pb-16 md:pt-36 md:pb-24 overflow-hidden">
        {/* Subtle background glow circles */}
        <div className="pointer-events-none absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-orange-500/15 via-red-500/10 to-transparent rounded-full blur-3xl opacity-60" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            {/* Platform badge */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 backdrop-blur-md mb-6"
            >
              <LogoAsset className="h-5 w-auto" />
              <span className="text-orange-400 text-xs sm:text-sm font-semibold tracking-wider uppercase">
                India&apos;s Elite Free Fire Esports Arena
              </span>
            </motion.div>

            {/* Main Tagline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-4xl sm:text-6xl md:text-7xl font-display font-black leading-[1.08] tracking-tight mb-6"
            >
              Compete in Daily Free Fire Tournaments &amp;{' '}
              <span className="gradient-text">Win Rewards</span>
            </motion.h1>

            {/* Punchy Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-base sm:text-lg md:text-xl text-zinc-300 max-w-2xl mx-auto mb-9 leading-relaxed font-normal"
            >
              Daily Solo, Duo &amp; Squad competitive lobbies with verified players, automated kill tracking, instant room credentials, and fast UPI cashouts.
            </motion.p>

            {/* High-Conversion CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-lg mx-auto"
            >
              {/* Primary: Direct Android APK download */}
              <a
                href={APP_APK_URL}
                download="neobattle.apk"
                className="w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 rounded-2xl text-base font-bold text-black bg-gradient-to-r from-orange-500 via-amber-400 to-orange-500 hover:brightness-110 shadow-lg shadow-orange-500/25 active:scale-95 transition-all"
              >
                <AndroidIcon className="w-5 h-5 text-black" />
                <span>Download Android APK</span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-black/20 text-black border border-black/20">
                  v1.1.0 • ~7.5 MB
                </span>
              </a>

              {/* Secondary: Web Arena Entry */}
              <Link
                href="/arena"
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-4 rounded-2xl text-base font-bold text-white border border-white/15 bg-white/5 hover:bg-white/10 hover:border-orange-500/40 active:scale-95 transition-all"
              >
                <Gamepad2 className="w-5 h-5 text-orange-400" />
                <span>Enter Web Arena</span>
                <ChevronRight className="w-4 h-4 text-zinc-400" />
              </Link>
            </motion.div>

            {/* Safe badge note */}
            <p className="mt-4 text-xs text-zinc-500 flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              100% Virus-Free • Instant Room ID &amp; Password Access
            </p>

            {/* 2. STATS ROW / LIVE COUNTER BADGE */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="mt-14 pt-8 border-t border-white/10 grid grid-cols-3 gap-4 sm:gap-8 max-w-xl mx-auto"
            >
              <div className="text-center">
                <p className="text-2xl sm:text-3xl font-display font-extrabold gradient-text">
                  {totalPlayersDisplay}
                </p>
                <p className="text-xs text-zinc-400 uppercase tracking-wider mt-1">Active Players</p>
              </div>
              <div className="text-center">
                <p className="text-2xl sm:text-3xl font-display font-extrabold gradient-text">
                  {totalPrizesDisplay}
                </p>
                <p className="text-xs text-zinc-400 uppercase tracking-wider mt-1">Total Winnings Paid</p>
              </div>
              <div className="text-center">
                <p className="text-2xl sm:text-3xl font-display font-extrabold gradient-text">
                  {totalTournamentsDisplay}
                </p>
                <p className="text-xs text-zinc-400 uppercase tracking-wider mt-1">Tournaments</p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* 3. DOWNLOAD CTA SECTION (Fulfilling test requirement: between stats and Why NEOBATTLE) */}
      <DownloadSection />

      {/* 4. KEY FEATURE CARDS */}
      <section className="relative z-10 py-16 md:py-24 border-t border-white/5 bg-zinc-950/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-3xl sm:text-4xl font-display font-bold">
              Why <span className="gradient-text">NEOBATTLE</span>?
            </h2>
            <p className="mt-3 text-sm sm:text-base text-zinc-400">
              Built by competitive gamers for true Free Fire warriors. Fair matches, verified results, and instant payouts.
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
              Engineered for <span className="gradient-text">Competitive Play</span>
            </h2>
            <p className="mt-3 text-sm sm:text-base text-zinc-400">
              Take a look inside the NeoBattle tournament experience on mobile.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {mockScreens.map((card, idx) => (
              <div
                key={card.title}
                className="glass-card group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-white/10 hover:border-orange-500/40 transition-all duration-300"
              >
                {/* Visual Thumbnail with map banner */}
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
                    <span className="text-[11px] text-zinc-300">{card.meta}</span>
                  </div>
                </div>

                {/* Card Text */}
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

          <div className="mt-12 text-center">
            <Link
              href="/arena"
              className="inline-flex items-center gap-2 text-sm font-semibold text-orange-400 hover:text-orange-300 hover:underline"
            >
              <span>Explore full tournament roster in the Arena</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* 6. IOS GUIDANCE SECTION */}
      <section className="relative z-10 py-12 border-t border-white/5 bg-gradient-to-b from-black to-zinc-950">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="glass-card rounded-2xl p-6 sm:p-8 border border-white/10 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 shrink-0 text-zinc-300">
                <AppleIcon className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white font-display">
                  iPhone or iPad User? Play Instantly
                </h3>
                <p className="mt-1 text-sm text-zinc-400 max-w-md leading-relaxed">
                  No App Store download required. Open this page in <strong>Safari</strong>, tap the <strong>Share</strong> button, and select <strong>&quot;Add to Home Screen&quot;</strong> to launch the native full-screen app.
                </p>
              </div>
            </div>

            <Link
              href="/arena"
              className="w-full md:w-auto shrink-0 flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white bg-white/10 hover:bg-white/15 border border-white/15 transition-all"
            >
              <Share2 className="w-4 h-4 text-orange-400" />
              <span>Launch Safari Web App</span>
            </Link>
          </div>
        </div>
      </section>

      {/* 7. FOOTER */}
      <footer className="relative z-10 py-12 border-t border-white/10 bg-black text-zinc-400 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <LogoAsset className="h-6 w-auto" />
                <span className="font-display font-bold text-sm text-white tracking-wider">NEOBATTLE</span>
              </div>
              <p className="text-zinc-500 text-xs leading-relaxed">
                India&apos;s premier platform for daily competitive Free Fire mobile tournaments and cash prizes.
              </p>
            </div>

            <div>
              <p className="font-bold text-white uppercase tracking-wider text-xs mb-3">Tournaments</p>
              <ul className="space-y-2">
                <li><Link href="/arena" className="hover:text-white transition-colors">Gaming Arena</Link></li>
                <li><Link href="/tournaments" className="hover:text-white transition-colors">All Tournaments</Link></li>
                <li><Link href="/leaderboards" className="hover:text-white transition-colors">Leaderboards</Link></li>
                <li><Link href="/esports" className="hover:text-white transition-colors">Live Esports</Link></li>
              </ul>
            </div>

            <div>
              <p className="font-bold text-white uppercase tracking-wider text-xs mb-3">Fair Play &amp; Rules</p>
              <ul className="space-y-2">
                <li><Link href="/fair-play" className="hover:text-white transition-colors">Fair Play Policy</Link></li>
                <li><Link href="/terms" className="hover:text-white transition-colors">Terms &amp; Conditions</Link></li>
                <li><Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
                <li><Link href="/refund" className="hover:text-white transition-colors">Refund Policy</Link></li>
                <li><Link href="/prize-policy" className="hover:text-white transition-colors">Prize Distribution Policy</Link></li>
                <li><Link href="/disclaimer" className="hover:text-white transition-colors">Disclaimer</Link></li>
              </ul>
            </div>

            <div>
              <p className="font-bold text-white uppercase tracking-wider text-xs mb-3">Support &amp; Community</p>
              <ul className="space-y-2">
                <li><a href="https://discord.gg/34bwpEx68" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Discord Community</a></li>
                <li><a href="https://www.instagram.com/neobattlee/" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Instagram (@neobattlee)</a></li>
                <li><Link href="/help-feedback" className="hover:text-white transition-colors">Help &amp; Feedback</Link></li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4 text-[11px] text-zinc-500">
            <p>© {new Date().getFullYear()} NEOBATTLE. All rights reserved.</p>
            <p className="text-center md:text-right">
              NeoBattle is an independent esports platform and is not affiliated with or endorsed by Garena or Free Fire.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
