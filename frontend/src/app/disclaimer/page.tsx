'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function DisclaimerPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <Link href="/" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Home
      </Link>
      <h1 className="text-4xl font-display font-bold text-white mb-6">Disclaimer</h1>
      <div className="prose prose-invert max-w-none space-y-4 text-zinc-300">
        <h2 className="text-2xl font-bold text-white mt-8">General Information</h2>
        <p>NEOBATTLE is a skill-based gaming platform. The outcomes of tournaments are determined by player skill and performance. We do not guarantee any specific results or winnings.</p>
        <h2 className="text-2xl font-bold text-white mt-8">No Gambling</h2>
        <p>NEOBATTLE is not a gambling platform. Entry fees are for tournament participation and prize pools are awarded based on skill and performance, not chance.</p>
        <h2 className="text-2xl font-bold text-white mt-8">Limitation of Liability</h2>
        <p>NEOBATTLE is not liable for any indirect, incidental, or consequential damages arising from your use of the platform.</p>
        <h2 className="text-2xl font-bold text-white mt-8">Third-Party Links</h2>
        <p>Our platform may contain links to third-party websites. We are not responsible for their content or practices.</p>
        <h2 className="text-2xl font-bold text-white mt-8">Contact</h2>
        <p>For questions about this disclaimer, contact us at neobattle8@gmail.com.</p>
      </div>
    </div>
  );
}
