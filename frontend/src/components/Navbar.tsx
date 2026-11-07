'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  BarChart3,
  ChevronRight,
  CircleHelp,
  Info,
  LogOut,
  Medal,
  Menu,
  Radio,
  Settings,
  Shield,
  ShoppingBag,
  Trophy,
  User,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useIsApp } from '@/hooks/useIsApp';
import LogoAsset from '@/components/LogoAsset';
import Avatar from '@/components/Avatar';
import NotificationBell from '@/components/NotificationBell';
import { formatCurrency, resolveAssetUrl } from '@/lib/services';

const navLinks = [
  { href: '/tournaments', label: 'Tournaments', icon: Trophy },
  { href: '/leaderboards', label: 'Leaderboards', icon: Medal },
  { href: '/esports', label: 'Esports', icon: Radio },
  { href: '/stats', label: 'Stats', icon: BarChart3 },
  { href: '/shop', label: 'Shop', icon: ShoppingBag },
];

const policyLinks = [
  { label: 'Terms & Conditions', href: '/terms' },
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Refund Policy', href: '/refund' },
  { label: 'Fair Play Policy', href: '/fair-play' },
  { label: 'Prize Policy', href: '/prize-policy' },
  { label: 'Disclaimer', href: '/disclaimer' },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const isApp = useIsApp();
  const { user, loading, logout, isAdmin, isSuperAdmin, isHost } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuView, setMenuView] = useState<'main' | 'about'>('main');

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  const handleAdminNav = (e: React.MouseEvent<HTMLAnchorElement>, targetHref: string) => {
    e.preventDefault();
    if (pathname !== targetHref) {
      router.push(targetHref);
    }
  };

  const closeMenu = () => {
    setMobileOpen(false);
    setMenuView('main');
  };

  const displayName = user?.displayName || user?.username || user?.ign || 'Player';
  const walletBalance = user?.wallet?.balance ?? 0;

  return (
    <nav className="site-navbar fixed top-0 left-0 right-0 z-50 glass-card border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo on the left */}
          <Link href="/" className="flex items-center gap-2 group ml-4" onClick={closeMenu}>
            <div className="flex items-center justify-center w-12 h-12">
              <LogoAsset className="w-full h-full object-contain" />
            </div>
            <span className="text-xl font-bold gradient-text tracking-wider">NEOBATTLE</span>
          </Link>

          {/* Desktop website navigation links (hidden in installed app mode) */}
          {!isApp && (
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive(link.href)
                        ? 'text-fire-400 bg-fire-500/10'
                        : 'text-zinc-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {link.label}
                  </Link>
                );
              })}
              {user && (isAdmin || isSuperAdmin || isHost) && (
                <Link
                  href={isHost ? '/host-dashboard' : '/admin'}
                  onClick={(e) => handleAdminNav(e, isHost ? '/host-dashboard' : '/admin')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive(isHost ? '/host-dashboard' : '/admin')
                      ? 'text-fire-400 bg-fire-500/10'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  {isHost ? 'My Tournaments' : 'Admin'}
                </Link>
              )}
            </div>
          )}

          {/* Right cluster — bell + hamburger (in app mode) or auth cluster (in browser) */}
          <div className="flex items-center gap-1 sm:gap-3">
            {loading ? (
              <div className="w-20 h-8 bg-white/5 rounded-lg animate-pulse" />
            ) : user ? (
              <>
                <NotificationBell />
                {/* Desktop browser user pill */}
                {!isApp && (
                  <Link
                    href="/dashboard"
                    className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-fire-500/20 hover:text-fire-400 transition-colors"
                  >
                    <Avatar src={resolveAssetUrl(user.avatarUrl)} alt={displayName} size={28} />
                    {isSuperAdmin ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-fire-500/15 text-fire-300 text-xs font-bold uppercase tracking-wider">
                        <Shield className="w-3 h-3" /> Super Admin
                      </span>
                    ) : (
                      <span className="text-sm font-medium">{displayName}</span>
                    )}
                    {user.isVerified && (
                      <span className="text-xs text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded">✓</span>
                    )}
                  </Link>
                )}
              </>
            ) : (
              !isApp && (
                <div className="hidden md:flex items-center gap-2">
                  <Link href="/login" className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors">
                    Login
                  </Link>
                  <Link href="/register" className="btn-fire px-4 py-2 rounded-lg text-sm font-semibold text-white">
                    Join Arena
                  </Link>
                </div>
              )
            )}

            {/* Hamburger button: always visible in app mode, md:hidden in standard browser */}
            <button
              className={`p-2 -mr-1 text-zinc-400 hover:text-white transition-colors ${
                isApp ? 'flex' : 'md:hidden'
              }`}
              onClick={() => {
                if (mobileOpen) {
                  closeMenu();
                } else {
                  setMobileOpen(true);
                  setMenuView('main');
                }
              }}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Hamburger Menu Content */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.18 }}
            className={`glass-card border-t border-white/5 px-4 py-4 space-y-2 max-h-[calc(100vh-4rem)] overflow-y-auto ${
              isApp ? 'block' : 'md:hidden'
            }`}
          >
            {menuView === 'about' ? (
              /* "About & Policies" Simple List Screen */
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-white/5">
                  <button
                    type="button"
                    onClick={() => setMenuView('main')}
                    className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4 text-fire-400" />
                    Back
                  </button>
                  <h3 className="text-sm font-bold text-white">About &amp; Policies</h3>
                  <button
                    type="button"
                    onClick={closeMenu}
                    aria-label="Close menu"
                    className="p-1 rounded-lg text-zinc-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-1.5 pt-1">
                  {policyLinks.map((policy) => (
                    <Link
                      key={policy.href}
                      href={policy.href}
                      onClick={closeMenu}
                      className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 text-sm font-medium text-zinc-300 transition-colors"
                    >
                      <span>{policy.label}</span>
                      <ChevronRight className="w-4 h-4 text-zinc-500" />
                    </Link>
                  ))}
                </div>

                <div className="mt-4 flex items-center justify-between rounded-xl bg-white/[0.02] border border-white/5 px-4 py-3 text-xs text-zinc-500">
                  <span>NeoBattle for Android</span>
                  <span className="font-semibold text-zinc-400">v1.0.0</span>
                </div>

                <p className="mt-2 text-center text-[11px] leading-relaxed text-zinc-600">
                  NeoBattle is a skill-based esports platform. Play responsibly and follow the fair play policy.
                </p>
              </div>
            ) : (
              /* Single Account/Navigation Menu */
              <div className="space-y-1">
                {/* 1. Profile card at the top */}
                {user ? (
                  <Link
                    href="/dashboard"
                    onClick={closeMenu}
                    className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 mb-2 group transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar
                        src={resolveAssetUrl(user.avatarUrl)}
                        alt={displayName}
                        size={40}
                        className="ring-1 ring-fire-500/30 group-hover:ring-fire-400 transition-all shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate group-hover:text-fire-300 transition-colors">
                          {displayName}
                        </p>
                        <p className="text-xs text-zinc-400 truncate">
                          @{user.username || 'player'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 shrink-0">
                      <Wallet className="w-3.5 h-3.5 text-fire-400" />
                      <span className="text-xs font-bold text-white tabular-nums">
                        {formatCurrency(walletBalance)}
                      </span>
                    </div>
                  </Link>
                ) : (
                  <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 mb-2">
                    <p className="text-sm font-bold text-white mb-1">Welcome to NEOBATTLE</p>
                    <p className="text-xs text-zinc-400 mb-3">
                      Sign in to join tournaments and track your winnings
                    </p>
                    <div className="flex gap-2">
                      <Link
                        href="/login"
                        onClick={closeMenu}
                        className="flex-1 py-2 px-3 text-center rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white transition-colors"
                      >
                        Login
                      </Link>
                      <Link
                        href="/register"
                        onClick={closeMenu}
                        className="flex-1 py-2 px-3 text-center rounded-xl btn-fire text-xs font-bold text-white"
                      >
                        Join Arena
                      </Link>
                    </div>
                  </div>
                )}

                {/* 2. My Profile */}
                <Link
                  href="/dashboard"
                  onClick={closeMenu}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg text-zinc-300 hover:bg-white/5 text-sm font-medium transition-colors"
                >
                  <User className="w-5 h-5 text-fire-400" />
                  My Profile
                </Link>

                {/* 3. My Matches */}
                <Link
                  href="/?tab=mine"
                  onClick={closeMenu}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg text-zinc-300 hover:bg-white/5 text-sm font-medium transition-colors"
                >
                  <Trophy className="w-5 h-5 text-fire-400" />
                  My Matches
                </Link>

                {/* 4. Wallet */}
                <Link
                  href="/wallet"
                  onClick={closeMenu}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg text-zinc-300 hover:bg-white/5 text-sm font-medium transition-colors"
                >
                  <Wallet className="w-5 h-5 text-fire-400" />
                  Wallet
                </Link>

                {/* 5. Admin Panel (admins only) */}
                {user && (isAdmin || isSuperAdmin || isHost) && (
                  <Link
                    href={isHost ? '/host-dashboard' : '/admin'}
                    onClick={(e) => {
                      closeMenu();
                      handleAdminNav(e, isHost ? '/host-dashboard' : '/admin');
                    }}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg text-zinc-300 hover:bg-white/5 text-sm font-medium transition-colors"
                  >
                    <Shield className="w-5 h-5 text-fire-400" />
                    {isHost ? 'My Tournaments' : 'Admin Panel'}
                  </Link>
                )}

                {/* 6. Settings */}
                <Link
                  href="/settings"
                  onClick={closeMenu}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg text-zinc-300 hover:bg-white/5 text-sm font-medium transition-colors"
                >
                  <Settings className="w-5 h-5 text-fire-400" />
                  Settings
                </Link>

                {/* 7. Help & Feedback */}
                <Link
                  href="/help-feedback"
                  onClick={closeMenu}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg text-zinc-300 hover:bg-white/5 text-sm font-medium transition-colors"
                >
                  <CircleHelp className="w-5 h-5 text-fire-400" />
                  Help &amp; Feedback
                </Link>

                {/* 8. About & Policies */}
                <button
                  type="button"
                  onClick={() => setMenuView('about')}
                  className="flex w-full items-center justify-between px-4 py-3 rounded-lg text-zinc-300 hover:bg-white/5 text-left text-sm font-medium transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Info className="w-5 h-5 text-fire-400" />
                    About &amp; Policies
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-500" />
                </button>

                {/* 9. Logout at the bottom in red */}
                {user && (
                  <button
                    type="button"
                    onClick={() => {
                      closeMenu();
                      logout();
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 rounded-lg text-red-400 hover:bg-red-500/10 text-left text-sm font-medium transition-colors mt-2 border-t border-white/5 pt-3"
                  >
                    <LogOut className="w-5 h-5" />
                    Logout
                  </button>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
