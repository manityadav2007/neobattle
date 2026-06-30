'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Footer from '@/components/Footer';

export default function ConditionalFooter() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  if (pathname !== '/') return null;
  return <Footer />;
}
