'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function TermsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <Link href="/" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Home
      </Link>
      <h1 className="text-4xl font-display font-bold text-white mb-6">Terms &amp; Conditions</h1>
      <div className="prose prose-invert max-w-none space-y-4 text-zinc-300">
        <p>By accessing or using NEOBATTLE, you agree to be bound by these terms. If you disagree, do not use the platform.</p>
        <h2 className="text-2xl font-bold text-white mt-8">1. Eligibility</h2>
        <p>You must be at least 18 years old to participate in paid tournaments. Free tournaments may have lower age requirements where permitted by law.</p>
        <h2 className="text-2xl font-bold text-white mt-8">2. Account Registration</h2>
        <p>You are responsible for maintaining the confidentiality of your account credentials. All activity under your account is your responsibility.</p>
        <h2 className="text-2xl font-bold text-white mt-8">3. Fair Play</h2>
        <p>Cheating, exploiting bugs, collusion, or any form of unfair advantage is strictly prohibited and may result in account suspension or permanent ban.</p>
        <h2 className="text-2xl font-bold text-white mt-8">4. Payments &amp; Withdrawals</h2>
        <p>All transactions are processed securely. Withdrawals are subject to verification and may take up to 7 business days to process.</p>
        <h2 className="text-2xl font-bold text-white mt-8">5. Termination</h2>
        <p>We reserve the right to suspend or terminate accounts that violate these terms or engage in fraudulent activity.</p>
      </div>
    </div>
  );
}
