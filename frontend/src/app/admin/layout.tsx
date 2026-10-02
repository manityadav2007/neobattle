'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading, isSuperAdmin, isAdmin } = useAuth();
  const hasAccess = isSuperAdmin || isAdmin;

  useEffect(() => {
    if (!loading && (!user || !hasAccess)) {
      router.push(user ? '/dashboard' : '/login');
    }
  }, [user, loading, hasAccess, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-fire-400 animate-spin" />
      </div>
    );
  }

  if (!user || !hasAccess) return null;

  return <>{children}</>;
}
