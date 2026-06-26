'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Mail, Lock, User, AlertCircle, Search, CheckCircle, Loader2 } from 'lucide-react';
import LogoAsset from '@/components/LogoAsset';
import AuthSocialButtons from '@/components/AuthSocialButtons';
import { authApi, gameApi, GameProfile } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', username: '', password: '', displayName: '' });
  const [freeFireId, setFreeFireId] = useState('');
  const [fetchedIgn, setFetchedIgn] = useState<string | null>(null);
  const [profile, setProfile] = useState<GameProfile | null>(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFetchIgn = async () => {
    if (!freeFireId || freeFireId.length < 5) return;
    setFetching(true);
    setError('');
    try {
      const res = await gameApi.fetchProfile(freeFireId);
      if (res.data) {
        setProfile(res.data);
        setFetchedIgn(res.data.ign);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setFetching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fetchedIgn) {
      setError('Please fetch and confirm your IGN first.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      await authApi.register({ ...form, freeFireId } as any);
      router.push('/dashboard');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <LogoAsset className="h-10 w-auto mx-auto mb-4" />
          <h1 className="text-2xl font-display font-bold text-white">Join the Arena</h1>
          <p className="text-zinc-400 mt-2">Create your NEOBATTLE warrior account</p>
        </div>

        <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-8 space-y-5">
          <AuthSocialButtons />

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-white/8" />
            <span className="text-xs font-medium uppercase tracking-[0.3em] text-zinc-500">Or</span>
            <div className="h-px flex-1 bg-white/8" />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">Display Name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                className="input-field w-full pl-10 pr-4 py-3 rounded-lg text-white"
                placeholder="Your gamer tag"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">Username</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="input-field w-full pl-10 pr-4 py-3 rounded-lg text-white"
                placeholder="unique_username"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="input-field w-full pl-10 pr-4 py-3 rounded-lg text-white"
                placeholder="you@example.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">Free Fire UID</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={freeFireId}
                onChange={(e) => setFreeFireId(e.target.value)}
                className="input-field flex-1 px-4 py-3 rounded-lg text-white font-mono"
                placeholder="Enter your UID"
                required
              />
              <button
                type="button"
                onClick={handleFetchIgn}
                disabled={fetching || freeFireId.length < 5}
                className="px-4 py-3 rounded-lg bg-fire-500/10 text-fire-400 hover:bg-fire-500/20 transition-colors disabled:opacity-50"
              >
                {fetching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
              </button>
            </div>
            {profile && (
              <div className="mt-2 p-3 rounded-lg bg-green-500/10 text-green-400 text-sm flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0" />
                IGN: <span className="font-bold font-mono">{profile.ign}</span> (Lv.{profile.level} — {profile.region})
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="input-field w-full pl-10 pr-4 py-3 rounded-lg text-white"
                placeholder="Min 8 chars, upper, lower, number"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !fetchedIgn}
            className="btn-fire w-full py-3 rounded-lg font-semibold text-white disabled:opacity-50"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>

          <p className="text-center text-sm text-zinc-400">
            Already have an account?{' '}
            <Link href="/login" className="text-fire-400 hover:text-fire-300 font-medium">
              Sign in
            </Link>
          </p>
        </form>
      </motion.div>
    </div>
  );
}
