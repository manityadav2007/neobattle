'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading, isSuperAdmin } = useAuth();

  useEffect(() => {
    if (!loading && (!user || !isSuperAdmin)) {
      router.push(user ? '/dashboard' : '/login');
    }
  }, [user, loading, isSuperAdmin, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-fire-400 animate-spin" />
      </div>
    );
  }

  if (!user || !isSuperAdmin) return null;

  return <>{children}</>;
}
