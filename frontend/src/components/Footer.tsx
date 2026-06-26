'use client';

import Link from 'next/link';
import LogoAsset from '@/components/LogoAsset';

const socialLinks = [
  {
    label: 'YouTube',
    href: 'https://youtube.com',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path d="M23.5 6.2c-.3-1.1-1.1-1.9-2.2-2.2C19.4 3.5 12 3.5 12 3.5s-7.4 0-9.3.5c-1.1.3-1.9 1.1-2.2 2.2C0 8.1 0 12 0 12s0 3.9.5 5.8c.3 1.1 1.1 1.9 2.2 2.2 1.9.5 9.3.5 9.3.5s7.4 0 9.3-.5c1.1-.3 1.9-1.1 2.2-2.2.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.5 15.5V8.5l6.2 3.5-6.2 3.5z" />
      </svg>
    ),
  },
  {
    label: 'Instagram',
    href: 'https://instagram.com',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    label: 'Twitter / X',
    href: 'https://x.com',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    label: 'Discord',
    href: 'https://discord.com',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path d="M19.54 5.47A17.2 17.2 0 0 0 15.3 4.16a12.13 12.13 0 0 0-.54 1.11 15.96 15.96 0 0 0-4.53 0 12.13 12.13 0 0 0-.54-1.11A17.14 17.14 0 0 0 5.45 5.47C2.77 9.49 2.04 13.41 2.4 17.28a17.3 17.3 0 0 0 5.18 2.63c.42-.57.79-1.18 1.1-1.83-.6-.23-1.17-.51-1.72-.84.14-.1.28-.21.41-.32a12.39 12.39 0 0 0 9.27 0c.13.11.27.22.41.32-.55.33-1.13.61-1.72.84.31.65.68 1.26 1.1 1.83a17.24 17.24 0 0 0 5.18-2.63c.42-4.49-.72-8.37-3.13-11.81ZM9.53 14.9c-.9 0-1.64-.84-1.64-1.86 0-1.03.72-1.86 1.64-1.86.92 0 1.66.84 1.64 1.86 0 1.02-.72 1.86-1.64 1.86Zm4.94 0c-.9 0-1.64-.84-1.64-1.86 0-1.03.72-1.86 1.64-1.86.92 0 1.66.84 1.64 1.86 0 1.02-.72 1.86-1.64 1.86Z" />
      </svg>
    ),
  },
];

const arenaLinks = [
  { label: 'Home', href: '/' },
  { label: 'About Us', href: '/about' },
  { label: 'Upcoming Tournaments', href: '/tournaments?status=REGISTRATION' },
];

const legalLinks = [
  { label: 'Terms & Conditions', href: '/terms' },
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Refund Policy', href: '/refund' },
  { label: 'Fair Play Policy', href: '/fair-play' },
  { label: 'Prize Policy', href: '/prize-policy' },
  { label: 'Disclaimer', href: '/disclaimer' },
];

export default function Footer() {
  return (
    <footer className="bg-[#0a0a0e] border-t border-white/5 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Brand & Identity */}
          <div className="lg:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <LogoAsset className="h-8 w-auto" />
              <span className="text-lg font-bold gradient-text tracking-wider">NEOBATTLE</span>
            </Link>
            <p className="text-sm text-zinc-400 leading-relaxed mb-5">
              NEOBATTLE is India&apos;s premier skill-based competitive esports platform. We provide a fair, transparent, and performance-driven environment for gamers to compete and win rewards.
            </p>

            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 text-xs font-bold uppercase tracking-wider mb-6">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              100% Skill-Based Gaming
            </div>

            {/* Social Icons */}
            <div className="flex items-center gap-3">
              {socialLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={link.label}
                  className="flex items-center justify-center w-10 h-10 rounded-xl border border-white/10 text-zinc-400 hover:text-white hover:border-blue-500/40 hover:bg-blue-500/10 transition-all"
                >
                  {link.icon}
                </a>
              ))}
            </div>
          </div>

          {/* Arena */}
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-5">ARENA</h3>
            <ul className="space-y-3">
              {arenaLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-zinc-400 hover:text-blue-400 transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-5">LEGAL</h3>
            <ul className="space-y-3">
              {legalLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-zinc-400 hover:text-blue-400 transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-5">SUPPORT</h3>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-zinc-500 mb-1">Email</p>
                <Link
                  href="/help-feedback"
                  className="text-sm text-zinc-300 hover:text-blue-400 transition-colors"
                >
                  neobattle8@gmail.com
                </Link>
              </div>
              <Link
                href="/help-feedback"
                className="inline-flex items-center justify-center w-full px-5 py-3 rounded-xl text-sm font-bold text-white btn-fire transition-all"
              >
                GET HELP
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Compliance Bar */}
      <div className="border-t border-white/5 bg-[#07070a]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-600">
            <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-3">
              <span className="text-zinc-500 font-semibold">&copy; 2026 NEOBATTLE Private Limited</span>
              <span className="hidden sm:inline text-zinc-700">|</span>
              <span>CIN: U92490KA2026PLC123456</span>
            </div>
            <div className="flex items-center gap-1 text-zinc-600">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span>Legal &amp; Compliance</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
