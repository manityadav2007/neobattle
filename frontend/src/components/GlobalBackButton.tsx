'use client';

import { usePathname } from 'next/navigation';
import BackButton from './BackButton';

export default function GlobalBackButton() {
  const pathname = usePathname();

  const excludePaths = ['/', '/dashboard'];
  if (excludePaths.includes(pathname)) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
      <BackButton />
    </div>
  );
}
