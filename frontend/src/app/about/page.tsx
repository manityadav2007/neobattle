'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <Link href="/" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Home
      </Link>
      <h1 className="text-4xl font-display font-bold text-white mb-6">About NEOBATTLE</h1>
      <div className="prose prose-invert max-w-none space-y-4 text-zinc-300">
        <p>
          NEOBATTLE is India&apos;s premier skill-based competitive esports platform. We provide a fair, transparent,
          and performance-driven environment for gamers to compete and win rewards.
        </p>
        <p>
          Our mission is to create a thriving esports ecosystem where players of all skill levels can participate,
          improve, and showcase their talents. We believe in rewarding skill and dedication, not luck.
        </p>
        <h2 className="text-2xl font-bold text-white mt-8">Our Values</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Fair Play:</strong> Zero tolerance for cheating or unfair practices</li>
          <li><strong>Transparency:</strong> All tournaments have clear rules and prize distributions</li>
          <li><strong>Community:</strong> Building a supportive and competitive gaming community</li>
          <li><strong>Innovation:</strong> Continuously improving the platform experience</li>
        </ul>
      </div>
    </div>
  );
}
