'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  BarChart3,
  LayoutDashboard,
  LogOut,
  Medal,
  Menu,
  Radio,
  Shield,
  ShoppingBag,
  Trophy,
  User,
  Wallet,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import LogoAsset from '@/components/LogoAsset';
import Avatar from '@/components/Avatar';
import NotificationBell from '@/components/NotificationBell';
import { resolveAssetUrl } from '@/lib/services';

const navLinks = [
  { href: '/tournaments', label: 'Tournaments', icon: Trophy },
  { href: '/leaderboards', label: 'Leaderboards', icon: Medal },
  { href: '/esports', label: 'Esports', icon: Radio },
  { href: '/stats', label: 'Stats', icon: BarChart3 },
  { href: '/shop', label: 'Shop', icon: ShoppingBag },
];

function getAccountLinks(isHost: boolean) {
  const links: { href: string; label: string; icon: any }[] = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  ];
  if (!isHost) links.push({ href: '/wallet', label: 'Wallet', icon: Wallet });
  return links;
}

export default function Navbar() {
  const pathname = usePathname();
  const { user, loading, logout, isSuperAdmin, isHost } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass-card border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2 group ml-4">
            <div className="flex items-center justify-center w-12 h-12">
              <LogoAsset className="w-full h-full object-contain" />
            </div>
            <span className="text-xl font-bold gradient-text tracking-wider">NEOBATTLE</span>
          </Link>

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
            {user && (isSuperAdmin || isHost) && (
              <Link
                href={isHost ? '/host-dashboard' : '/admin'}
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

          <div className="hidden md:flex items-center gap-3">
            {loading ? (
              <div className="w-24 h-8 bg-white/5 rounded-lg animate-pulse" />
            ) : user ? (
              <>
                <NotificationBell />
                  <Link
                    href="/dashboard"
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-fire-500/20 hover:text-fire-400 transition-colors"
                  >
                    <Avatar src={resolveAssetUrl(user.avatarUrl)} alt={user.displayName || user.username} size={28} />
                  {isSuperAdmin ? (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-fire-500/15 text-fire-300 text-xs font-bold uppercase tracking-wider">
                      <Shield className="w-3 h-3" /> Super Admin
                    </span>
                  ) : (
                    <span className="text-sm font-medium">{user.displayName || user.username}</span>
                  )}
                  {user.isVerified && (
                    <span className="text-xs text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded">✓</span>
                  )}
                </Link>

              </>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login" className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors">
                  Login
                </Link>
                <Link href="/register" className="btn-fire px-4 py-2 rounded-lg text-sm font-semibold text-white">
                  Join Arena
                </Link>
              </div>
            )}
          </div>

          <button
            className="md:hidden p-2 text-zinc-400"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="md:hidden glass-card border-t border-white/5 px-4 py-4 space-y-2"
        >
          {navLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-zinc-300 hover:bg-white/5"
              >
                <Icon className="w-5 h-5 text-fire-400" />
                {link.label}
              </Link>
            );
          })}
          {!user && (
            <>
              <Link href="/login" onClick={() => setMobileOpen(false)} className="block px-4 py-3 text-zinc-300">Login</Link>
              <Link href="/register" onClick={() => setMobileOpen(false)} className="block btn-fire px-4 py-3 rounded-lg text-center text-white font-semibold">Join Arena</Link>
            </>
          )}
          {user && (
            <div className="pt-2 border-t border-white/5 space-y-2">
              {/* Mobile: consolidated admin/host entry */}
              {(isSuperAdmin || isHost) && (
                <Link href={isHost ? '/host-dashboard' : '/admin'} onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg text-zinc-300 hover:bg-fire-500/10 hover:text-fire-400"
                >
                  <Shield className="w-5 h-5 text-fire-400" /> {isHost ? 'My Tournaments' : 'Admin Panel'}
                </Link>
              )}
              {getAccountLinks(isHost).map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg text-zinc-300 hover:bg-white/5"
                  >
                    <Icon className="w-5 h-5 text-fire-400" />
                    {link.label}
                  </Link>
                );
              })}
              <button
                type="button"
                onClick={() => { setMobileOpen(false); logout(); }}
                className="flex w-full items-center gap-3 px-4 py-3 rounded-lg text-zinc-300 hover:bg-white/5"
              >
                <LogOut className="w-5 h-5 text-fire-400" />
                Logout
              </button>
            </div>
          )}
        </motion.div>
      )}
    </nav>
  );
}
