'use client';

import Link from 'next/link';
import type { SVGProps } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CircleHelp,
  LogOut,
  Menu,
  Settings,
  Shield,
  UserRound,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

function DiscordIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M19.54 5.47A17.2 17.2 0 0 0 15.3 4.16a12.13 12.13 0 0 0-.54 1.11 15.96 15.96 0 0 0-4.53 0 12.13 12.13 0 0 0-.54-1.11A17.14 17.14 0 0 0 5.45 5.47C2.77 9.49 2.04 13.41 2.4 17.28a17.3 17.3 0 0 0 5.18 2.63c.42-.57.79-1.18 1.1-1.83-.6-.23-1.17-.51-1.72-.84.14-.1.28-.21.41-.32a12.39 12.39 0 0 0 9.27 0c.13.11.27.22.41.32-.55.33-1.13.61-1.72.84.31.65.68 1.26 1.1 1.83a17.24 17.24 0 0 0 5.18-2.63c.42-4.49-.72-8.37-3.13-11.81ZM9.53 14.9c-.9 0-1.64-.84-1.64-1.86 0-1.03.72-1.86 1.64-1.86.92 0 1.66.84 1.64 1.86 0 1.02-.72 1.86-1.64 1.86Zm4.94 0c-.9 0-1.64-.84-1.64-1.86 0-1.03.72-1.86 1.64-1.86.92 0 1.66.84 1.64 1.86 0 1.02-.72 1.86-1.64 1.86Z" />
    </svg>
  );
}

function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true" {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

const socialLinks = [
  {
    href: 'https://discord.com',
    label: 'Discord',
    icon: DiscordIcon,
    className: 'text-indigo-300 hover:bg-indigo-500/12 hover:text-indigo-200',
  },
  {
    href: 'https://instagram.com',
    label: 'Instagram',
    icon: InstagramIcon,
    className: 'text-pink-300 hover:bg-pink-500/12 hover:text-pink-200',
  },
];

export default function GlobalSidebar() {
  const pathname = usePathname();
  const { user, logout, isHost, isSuperAdmin } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isHostOrSuper = user && (user.role === 'HOST' || isSuperAdmin);

  const menuItems = useMemo(
    () => [
      {
        href: '/dashboard',
        label: 'My Profile',
        description: user ? 'Open your player dashboard' : 'Sign in to view your profile',
        icon: UserRound,
      },
      ...(isHostOrSuper
        ? [
            {
              href: user?.role === 'HOST' ? '/host-dashboard' : '/admin',
              label: user?.role === 'HOST' ? 'My Tournaments' : 'Admin Panel',
              description: user?.role === 'HOST' ? 'Create and manage your tournaments' : 'Platform administration',
              icon: Shield,
            },
          ]
        : []),
      ...(user && !isHost
        ? [
            {
              href: '/wallet',
              label: 'Wallet',
              description: 'Manage your funds and view transactions',
              icon: Wallet,
            },
          ]
        : []),
      {
        href: '/settings',
        label: 'Settings',
        description: 'Manage preferences and account options',
        icon: Settings,
      },
      {
        href: '/help-feedback',
        label: 'Help & Feedback',
        description: 'Reach support and share product feedback',
        icon: CircleHelp,
      },
    ],
    [user, isHostOrSuper]
  );

  return (
    <>
      <aside className="fixed left-2 top-20 z-40 flex sm:left-3">
        <div className="flex w-14 flex-col items-center rounded-[1.75rem] border border-white/10 bg-black/25 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:w-16 sm:rounded-[2rem] sm:py-4">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-zinc-100 transition-all hover:border-fire-500/40 hover:bg-fire-500/12 hover:text-fire-200 sm:mb-4 sm:h-11 sm:w-11"
            aria-label="Open quick menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="mb-4 h-px w-8 bg-white/10" />

          <div className="flex flex-col gap-2">
            {socialLinks.map(({ href, label, icon: Icon, className }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer"
                aria-label={label}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.03] transition-all sm:h-10 sm:w-10 ${className}`}
              >
                <Icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>
      </aside>

      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              aria-label="Close menu overlay"
              className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.2 }}
              className="fixed left-4 top-20 z-[60] w-[min(24rem,calc(100vw-2rem))] max-h-[calc(100vh-6rem)] overflow-y-auto rounded-3xl border border-white/10 bg-[#0d0d13]/90 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-2xl"
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-fire-300">Quick Menu</p>
                  <h2 className="mt-2 text-2xl font-display font-bold text-white">
                    {user ? `Hey, ${user.displayName || user.username}` : 'Welcome to NEOBATTLE'}
                  </h2>
                  <p className="mt-2 text-sm text-zinc-400">
                    Jump between account controls, support, and session actions.
                  </p>
                </div>

                <button
                  type="button"
                  aria-label="Close quick menu"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-zinc-300 transition-colors hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-3">
                {menuItems.map((item) => {
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      className="flex items-start gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 transition-all hover:border-fire-500/30 hover:bg-fire-500/10"
                    >
                      <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-fire-500/10 text-fire-300">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="flex-1">
                        <span className="block text-sm font-semibold text-white">{item.label}</span>
                        <span className="mt-1 block text-xs text-zinc-400">{item.description}</span>
                      </span>
                    </Link>
                  );
                })}

                <button
                  type="button"
                  onClick={logout}
                  className="flex w-full items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-left transition-all hover:border-red-400/40 hover:bg-red-500/15"
                >
                  <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-red-500/12 text-red-300">
                    <LogOut className="h-4 w-4" />
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-red-100">Logout</span>
                    <span className="mt-1 block text-xs text-red-200/75">
                      End the current session and return to the sign-in flow.
                    </span>
                  </span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
