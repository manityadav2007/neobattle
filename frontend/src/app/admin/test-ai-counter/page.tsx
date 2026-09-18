'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import TestAICounter from '@/components/TestAICounter';

export default function AdminTestAICounterPage() {
  const router = useRouter();
  const { user, loading: authLoading, isAdmin, isSuperAdmin } = useAuth();

  useEffect(() => {
    if (!authLoading && (!user || (!isAdmin && !isSuperAdmin))) {
      router.push(user ? '/dashboard' : '/login');
    }
  }, [user, authLoading, isAdmin, isSuperAdmin, router]);

  if (authLoading || (!isAdmin && !isSuperAdmin)) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <TestAICounter />
    </div>
  );
}
