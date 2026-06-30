'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <Link href="/" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Home
      </Link>
      <h1 className="text-4xl font-display font-bold text-white mb-6">Privacy Policy</h1>
      <div className="prose prose-invert max-w-none space-y-4 text-zinc-300">
        <p>Your privacy matters to us. This policy outlines how we collect, use, and protect your personal information.</p>
        <h2 className="text-2xl font-bold text-white mt-8">Information We Collect</h2>
        <p>We collect information you provide during registration (email, username) and gameplay data (tournament participation, scores, rankings).</p>
        <h2 className="text-2xl font-bold text-white mt-8">How We Use Your Data</h2>
        <p>Your data is used to operate the platform, process transactions, send notifications, and improve our services.</p>
        <h2 className="text-2xl font-bold text-white mt-8">Data Protection</h2>
        <p>We implement industry-standard security measures to protect your personal information. We do not sell your data to third parties.</p>
        <h2 className="text-2xl font-bold text-white mt-8">Contact</h2>
        <p>For privacy-related concerns, contact us at neobattle8@gmail.com.</p>
      </div>
    </div>
  );
}
