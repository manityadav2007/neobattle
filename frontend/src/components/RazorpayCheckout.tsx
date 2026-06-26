'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';

interface RazorpayCheckoutProps {
  amount: number;
  onSuccess: () => void;
}

declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function RazorpayCheckout({ amount, onSuccess }: RazorpayCheckoutProps) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const handlePayment = async () => {
    setLoading(true);
    setErr('');
    setMsg('');

    try {
      const orderRes = await api.post('/payment/create-order', { amount });
      const { orderId } = orderRes.data.data;

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '',
        amount: orderRes.data.data.amount,
        currency: orderRes.data.data.currency || 'INR',
        name: 'NEOBATTLE',
        description: `Wallet deposit of ₹${amount}`,
        order_id: orderId,
        handler: async function (response: any) {
          try {
            const verifyRes = await api.post('/payment/verify', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            setMsg(verifyRes.data.message || 'Payment successful!');
            onSuccess();
          } catch {
            setErr('Payment verification failed. Contact support.');
          }
        },
        modal: {
          ondismiss: () => setLoading(false),
        },
        prefill: {
          contact: '',
          email: '',
        },
        theme: { color: '#f97316' },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function () {
        setErr('Payment failed. Please try again.');
        setLoading(false);
      });
      rzp.open();
    } catch {
      setErr('Failed to initiate payment. Try again.');
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={handlePayment}
        disabled={loading}
        className="btn-fire w-full py-3 rounded-xl font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {loading ? 'Opening Razorpay...' : `Pay ₹${amount} via Razorpay`}
      </button>
      {err && (
        <div className="flex items-center gap-2 mt-3 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" /> {err}
        </div>
      )}
      {msg && (
        <div className="flex items-center gap-2 mt-3 p-3 rounded-lg bg-green-500/10 text-green-400 text-sm">
          <CheckCircle className="w-4 h-4 shrink-0" /> {msg}
        </div>
      )}
    </div>
  );
}
