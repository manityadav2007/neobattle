'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';

interface UpiPaymentProps {
  amount: number;
  tournamentId?: string;
  onSuccess: () => void;
}

export default function UpiPayment({ amount, tournamentId, onSuccess }: UpiPaymentProps) {
  const [utrNumber, setUtrNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const handleSubmit = async () => {
    if (!utrNumber.trim() || utrNumber.trim().length < 4) {
      setErr('Please enter a valid UTR/Transaction ID');
      return;
    }
    setLoading(true);
    setErr('');
    setMsg('');
    try {
      const res = await api.post('/payment/upi/create', {
        amount,
        tournamentId: tournamentId || undefined,
        utrNumber: utrNumber.trim(),
      });
      setMsg(res.data.message || 'Payment submitted!');
      setUtrNumber('');
      onSuccess();
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Unknown error';
      setErr(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-6 rounded-xl bg-white/5 border border-white/10 space-y-4">
        <div className="flex justify-center">
          <div className="p-3 bg-white rounded-2xl border-2 border-zinc-200 shadow-xl">
            <img
              src="/my_qr.png"
              alt="UPI QR Code"
              className="w-48 h-48 object-contain"
            />
          </div>
        </div>
        <p className="text-center text-sm text-white font-semibold">Amount: ₹{amount}</p>
      </div>

      <input
        type="text"
        value={utrNumber}
        onChange={(e) => setUtrNumber(e.target.value)}
        placeholder="Enter UTR / Transaction ID"
        className="input-field w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
      />

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="btn-fire w-full py-3 rounded-xl font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {loading ? 'Submitting...' : 'Submit Payment'}
      </button>

      {err && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" /> {err}
        </div>
      )}
      {msg && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-400 text-sm">
          <CheckCircle className="w-4 h-4 shrink-0" /> {msg}
        </div>
      )}
    </div>
  );
}
