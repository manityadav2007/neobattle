import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function BackButton({ href, label = 'Back' }: { href?: string; label?: string }) {
  const target = href || '/';
  return (
    <Link href={target} className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6 transition-colors">
      <ArrowLeft className="w-4 h-4" /> {label}
    </Link>
  );
}
