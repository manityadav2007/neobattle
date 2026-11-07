'use client';

import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Info, Settings, UserRound, Wallet, X } from 'lucide-react';

interface SettingsAboutSheetProps {
  open: boolean;
  onClose: () => void;
}

const legalLinks = [
  { label: 'Terms & Conditions', href: '/terms' },
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Refund Policy', href: '/refund' },
  { label: 'Fair Play Policy', href: '/fair-play' },
  { label: 'Prize Policy', href: '/prize-policy' },
  { label: 'Disclaimer', href: '/disclaimer' },
];

const sheetLinks = [
  { label: 'My Profile', href: '/dashboard', icon: UserRound },
  { label: 'Wallet', href: '/wallet', icon: Wallet },
  { label: 'Settings', href: '/settings', icon: Settings },
  { label: 'Help & Feedback', href: '/help-feedback', icon: Info },
];

export default function SettingsAboutSheet({ open, onClose }: SettingsAboutSheetProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center select-none">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Settings and About"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className="relative max-h-[86vh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-3xl border-t border-white/10 bg-[#111116] px-4 pt-3 shadow-[0_-20px_60px_rgba(0,0,0,0.6)] z-10"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-fire-400">
                  NeoBattle App
                </p>
                <h2 className="text-lg font-bold text-white">Settings & About</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close settings"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-zinc-300 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {sheetLinks.map(({ label, href, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={onClose}
                  className="flex min-h-[52px] items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] px-3 text-sm font-medium text-zinc-200 transition-colors active:bg-white/[0.08]"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-fire-500/10 text-fire-300">
                    <Icon className="h-4 w-4" />
                  </span>
                  {label}
                </Link>
              ))}
            </div>

            <div className="mt-5">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                Legal &amp; Policies
              </p>
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
                {legalLinks.map((link, index) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={onClose}
                    className={`flex min-h-[48px] items-center justify-between px-4 text-sm text-zinc-300 transition-colors active:bg-white/[0.06] ${
                      index > 0 ? 'border-t border-white/5' : ''
                    }`}
                  >
                    {link.label}
                    <ChevronRight className="h-4 w-4 text-zinc-600" />
                  </Link>
                ))}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-xs text-zinc-500">
              <span>NeoBattle for Android</span>
              <span className="font-semibold text-zinc-400">v1.0.0</span>
            </div>

            <p className="mt-4 text-center text-[11px] leading-relaxed text-zinc-600">
              NeoBattle is a skill-based esports platform. Play responsibly and follow the fair play policy.
            </p>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
