'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function RefundPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <Link href="/" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Home
      </Link>
      <h1 className="text-4xl font-display font-bold text-white mb-6">Refund Policy</h1>
      <div className="prose prose-invert max-w-none space-y-4 text-zinc-300">
        <h2 className="text-2xl font-bold text-white mt-8">Tournament Entry Fees</h2>
        <p>Entry fees for tournaments are non-refundable once the tournament has started. If a tournament is cancelled by the admin before it begins, the entry fee will be refunded to your wallet.</p>
        <h2 className="text-2xl font-bold text-white mt-8">Deposits</h2>
        <p>All deposit requests are reviewed manually. Approved deposits are credited to your wallet and are non-reversible. If a deposit is rejected, no amount is deducted.</p>
        <h2 className="text-2xl font-bold text-white mt-8">Withdrawals</h2>
        <p>Withdrawal requests are processed after admin approval. Once approved, funds cannot be reversed. Rejected withdrawals are returned to your wallet.</p>
        <h2 className="text-2xl font-bold text-white mt-8">Disputes</h2>
        <p>If you believe a refund is warranted due to a platform error, contact support at neobattle8@gmail.com within 7 days of the transaction.</p>
      </div>
    </div>
  );
}
