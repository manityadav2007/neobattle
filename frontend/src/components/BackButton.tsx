import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function BackButton({ href }: { href?: string }) {
  if (href) {
    return (
      <Link href={href} className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={() => window.history.back()}
      className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6 transition-colors"
    >
      <ArrowLeft className="w-4 h-4" /> Back
    </button>
  );
}
