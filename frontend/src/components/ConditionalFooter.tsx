'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Footer from '@/components/Footer';
import { useIsApp } from '@/hooks/useIsApp';

export default function ConditionalFooter() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const isApp = useIsApp();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  if (isApp) return null;
  if (pathname !== '/') return null;
  return <Footer />;
}
