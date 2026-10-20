'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function AdminDepositsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/payments');
  }, [router]);

  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center">
      <Loader2 className="w-8 h-8 animate-spin text-teal-400 mb-3" />
      <p className="text-sm text-zinc-400">Redirecting to UPI Payments &amp; Deposits...</p>
    </div>
  );
}
