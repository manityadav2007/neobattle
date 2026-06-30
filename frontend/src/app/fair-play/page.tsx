'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function FairPlayPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <Link href="/" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Home
      </Link>
      <h1 className="text-4xl font-display font-bold text-white mb-6">Fair Play Policy</h1>
      <div className="prose prose-invert max-w-none space-y-4 text-zinc-300">
        <p>NEOBATTLE is committed to maintaining a fair and competitive environment for all players.</p>
        <h2 className="text-2xl font-bold text-white mt-8">Prohibited Activities</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Using cheats, hacks, or third-party tools that provide unfair advantage</li>
          <li>Collusion between players or teams to manipulate outcomes</li>
          <li>Account sharing or using another player&apos;s account</li>
          <li>Exploiting bugs or glitches in the game or platform</li>
          <li>Harassment, abuse, or toxic behavior toward other players</li>
        </ul>
        <h2 className="text-2xl font-bold text-white mt-8">Enforcement</h2>
        <p>Violations of the Fair Play Policy may result in warning, suspension, permanent ban, or forfeiture of winnings.</p>
        <h2 className="text-2xl font-bold text-white mt-8">Reporting</h2>
        <p>If you suspect a violation, report it via the Help &amp; Feedback page or email neobattle8@gmail.com.</p>
      </div>
    </div>
  );
}
