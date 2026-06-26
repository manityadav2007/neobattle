'use client';

import { useState } from 'react';
import { Bug, LifeBuoy, MessageSquareMore, X, Send, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/api';

export default function HelpFeedbackPage() {
  const [modal, setModal] = useState<'bug' | 'feedback' | null>(null);
  const [form, setForm] = useState({ subject: '', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post('/support', {
        type: modal === 'bug' ? 'BUG' : 'FEEDBACK',
        subject: form.subject,
        description: form.description,
      });
      setSubmitted(true);
      setTimeout(() => {
        setModal(null);
        setSubmitted(false);
        setForm({ subject: '', description: '' });
      }, 1800);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative">
      <section className="relative z-10 min-h-[calc(100vh-4rem)] px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl"
          >
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-fire-300">Support Center</p>
            <h1 className="mt-5 text-4xl font-display font-black text-white sm:text-6xl">
              <span className="gradient-text">Help & Feedback</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-400">
              Give players a calm, focused place to get support, report issues, and share feedback without breaking the competitive mood of the product.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/settings"
                className="btn-fire inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white"
              >
                Review Settings
                <Send className="h-4 w-4" />
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-6 py-3 text-sm font-semibold text-zinc-300 transition-all hover:border-fire-500/40 hover:text-white"
              >
                Return to Dashboard
              </Link>
            </div>
          </motion.div>

          <div className="mt-14 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {/* Support Requests */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0 }}
              className="glass-card rounded-3xl p-6"
            >
              <div className="mb-4 inline-flex rounded-2xl bg-fire-500/12 p-3 text-fire-300">
                <LifeBuoy className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-semibold text-white">Support Requests</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Need help with login, wallet, tournaments, or account verification? Email us directly and we will get back to you.
              </p>
              <a
                href="mailto:neobattle8@gmail.com"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors"
              >
                neobattle8@gmail.com
                <Send className="h-3.5 w-3.5" />
              </a>
            </motion.div>

            {/* Bug Reports */}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.08 }}
              onClick={() => setModal('bug')}
              className="glass-card rounded-3xl p-6 text-left transition-all hover:border-fire-500/40 hover:shadow-lg cursor-pointer w-full"
            >
              <div className="mb-4 inline-flex rounded-2xl bg-fire-500/12 p-3 text-fire-300">
                <Bug className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-semibold text-white">Bug Reports</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Create a clear destination for UI issues, broken flows, and gameplay-related platform feedback.
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-fire-400">
                Report a bug
                <Send className="h-3.5 w-3.5" />
              </span>
            </motion.button>

            {/* Product Feedback */}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.16 }}
              onClick={() => setModal('feedback')}
              className="glass-card rounded-3xl p-6 text-left transition-all hover:border-fire-500/40 hover:shadow-lg cursor-pointer w-full"
            >
              <div className="mb-4 inline-flex rounded-2xl bg-fire-500/12 p-3 text-fire-300">
                <MessageSquareMore className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-semibold text-white">Product Feedback</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Capture ideas from the community while keeping the experience polished and easy to scan.
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-fire-400">
                Share feedback
                <Send className="h-3.5 w-3.5" />
              </span>
            </motion.button>
          </div>
        </div>
      </section>

      <AnimatePresence>
        {modal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-[#0d0d16] p-6 shadow-2xl"
            >
              <button
                onClick={() => { setModal(null); setSubmitted(false); setForm({ subject: '', description: '' }); setError(''); }}
                className="absolute right-5 top-5 rounded-xl p-1.5 text-zinc-500 hover:bg-white/5 hover:text-zinc-300 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>

              {submitted ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="mb-4 inline-flex rounded-full bg-green-500/15 p-4 text-green-400">
                    <CheckCircle className="h-6 w-6" />
                  </div>
                  <p className="text-lg font-semibold text-white">Submitted!</p>
                  <p className="mt-1 text-sm text-zinc-400">Thank you for your {modal === 'bug' ? 'report' : 'feedback'}.</p>
                </div>
              ) : (
                <>
                  <div className="mb-6 inline-flex rounded-2xl bg-fire-500/12 p-3 text-fire-300">
                    {modal === 'bug' ? <Bug className="h-5 w-5" /> : <MessageSquareMore className="h-5 w-5" />}
                  </div>
                  <h2 className="text-xl font-bold text-white">
                    {modal === 'bug' ? 'Report a Bug' : 'Share Feedback'}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    {modal === 'bug'
                      ? 'Describe the issue you encountered so we can fix it.'
                      : 'Tell us what you love or what we can improve.'}
                  </p>

                  <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-1.5">Subject</label>
                      <input
                        type="text"
                        required
                        placeholder={modal === 'bug' ? 'e.g. Tournament join button not working' : 'e.g. Great platform, would love dark mode'}
                        value={form.subject}
                        onChange={(e) => setForm({ ...form, subject: e.target.value })}
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none transition-all focus:border-fire-500/40 focus:ring-1 focus:ring-fire-500/20"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-1.5">Description</label>
                      <textarea
                        required
                        rows={5}
                        placeholder="Provide as much detail as possible..."
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none transition-all focus:border-fire-500/40 focus:ring-1 focus:ring-fire-500/20"
                      />
                    </div>

                    {error && (
                      <p className="text-sm text-red-400">{error}</p>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="btn-fire inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white transition-all disabled:opacity-50"
                    >
                      {submitting ? 'Submitting...' : `Submit ${modal === 'bug' ? 'Report' : 'Feedback'}`}
                      <Send className="h-4 w-4" />
                    </button>
                  </form>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
