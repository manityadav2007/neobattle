'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function PrizePolicyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <Link href="/" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Home
      </Link>
      <h1 className="text-4xl font-display font-bold text-white mb-6">Prize Policy</h1>
      <div className="prose prose-invert max-w-none space-y-4 text-zinc-300">
        <h2 className="text-2xl font-bold text-white mt-8">Prize Distribution</h2>
        <p>Tournament prizes are distributed based on the prize breakdown specified at the time of tournament creation. Prizes are credited to the winner&apos;s wallet within 7 business days after tournament completion.</p>
        <h2 className="text-2xl font-bold text-white mt-8">Platform Commission</h2>
        <p>A 28% platform commission is deducted from the total entry fee collection. 20% goes to the host, and the remaining 52% forms the prize pool.</p>
        <h2 className="text-2xl font-bold text-white mt-8">Taxes</h2>
        <p>Winners are responsible for any applicable taxes on their winnings as per local laws. NEOBATTLE may issue tax forms where required.</p>
        <h2 className="text-2xl font-bold text-white mt-8">Disputes</h2>
        <p>Prize-related disputes must be raised within 7 days of tournament completion. Contact support at neobattle8@gmail.com.</p>
      </div>
    </div>
  );
}
