'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Shield, AlertCircle, CheckCircle, Loader2, ArrowLeft, Gamepad2, Upload, X, Eye } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { verificationApi, uploadApi } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';
import Image from 'next/image';

type VerifyStatus = 'none' | 'pending' | 'verified' | 'rejected';

export default function VerifyPage() {
  const router = useRouter();
  const { user, loading, refetch, refreshUser } = useAuth();
  const [freeFireId, setFreeFireId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [verifStatus, setVerifStatus] = useState<VerifyStatus>('none');
  const [isLoading, setIsLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState('');

  useEffect(() => {
    if (!user) return;
    (async () => {
      setIsLoading(true);
      setFetchErr('');
      try {
        const res = await verificationApi.my();
        const requests = res.data || [];
        if (requests.length > 0) {
          const latest = requests[0];
          if (latest.status === 'PENDING') setVerifStatus('pending');
          else if (latest.status === 'APPROVED') setVerifStatus('verified');
          else if (latest.status === 'REJECTED') setVerifStatus('rejected');
        } else {
          setVerifStatus(user.isVerified ? 'verified' : 'none');
        }
      } catch (err) {
        setFetchErr(getErrorMessage(err));
        setVerifStatus(user.isVerified ? 'verified' : 'none');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [user]);

  if (loading || isLoading) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 flex justify-center">
        <Loader2 className="w-8 h-8 text-fire-400 animate-spin" />
      </div>
    );
  }
  if (!user) { router.push('/login'); return null; }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (!['image/jpeg', 'image/png', 'image/jpg'].includes(selected.type)) {
      setError('Only JPG and PNG images are allowed');
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      setError('File size must be under 10MB');
      return;
    }
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!freeFireId.trim() || freeFireId.trim().length < 5) {
      setError('Please enter a valid Free Fire UID (minimum 5 characters)');
      return;
    }
    if (!file) {
      setError('Please upload your Free Fire profile screenshot');
      return;
    }

    setSubmitting(true);
    try {
      const uploadRes = await uploadApi.verificationScreenshot(file);
      const screenshotUrl = uploadRes.data.screenshotUrl;
      const res = await verificationApi.submit({ freeFireId: freeFireId.trim(), screenshotUrl });
      setSuccess(res.message || 'Verification submitted!');
      setVerifStatus('pending');
      setFreeFireId('');
      setFile(null);
      setPreview(null);
      await refetch();
      refreshUser();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const latestRequest = user.verificationScreenshotUrl;

  const showForm = verifStatus === 'none' || verifStatus === 'rejected';

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>

        <div className="text-center mb-8">
          <Shield className="w-10 h-10 text-fire-400 mx-auto mb-4" />
          <h1 className="text-2xl font-display font-bold text-white">Verify Free Fire ID</h1>
          <p className="text-zinc-400 mt-2">Upload a screenshot of your Free Fire profile showing your UID</p>
        </div>

        {fetchErr && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm mb-6">
            <AlertCircle className="w-4 h-4" /> {fetchErr}
          </div>
        )}

        {verifStatus === 'pending' && (
          <div className="glass-card rounded-2xl p-8 text-center mb-6">
            <Loader2 className="w-10 h-10 text-yellow-400 animate-spin mx-auto mb-4" />
            <h2 className="text-lg font-bold text-white mb-2">Verification under review</h2>
            <p className="text-zinc-400 text-sm">Your submission is being reviewed by the admin team.</p>
          </div>
        )}

        {verifStatus === 'verified' && (
          <div className="glass-card rounded-2xl p-8 text-center mb-6">
            <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-white mb-2">Verified: Your account is fully verified</h2>
            {user.freeFireId && (
              <p className="text-zinc-400 text-sm">
                Free Fire ID: <span className="text-fire-400 font-mono">{user.freeFireId}</span>
              </p>
            )}
          </div>
        )}

        {verifStatus === 'rejected' && (
          <div className="glass-card rounded-2xl p-8 text-center mb-6 border border-red-500/20">
            <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-white mb-2">Verification Rejected: Please re-upload your screenshot</h2>
            <p className="text-zinc-400 text-sm">Your previous submission did not meet the requirements.</p>
          </div>
        )}

        {latestRequest && (
          <div className="glass-card rounded-2xl p-6 mb-6">
            <h3 className="text-sm font-semibold text-zinc-300 mb-3">Current Submission</h3>
            <div className="flex items-center gap-3 text-sm text-zinc-400 mb-3">
              <Gamepad2 className="w-4 h-4 text-fire-400" />
              UID: <span className="font-mono text-white">{user.freeFireId}</span>
            </div>
            <a
              href={latestRequest}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-fire-400 hover:text-fire-300"
            >
              <Eye className="w-4 h-4" /> View Screenshot
            </a>
          </div>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-8 space-y-5">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" /> {error}
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-400 text-sm">
                <CheckCircle className="w-4 h-4" /> {success}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">Free Fire UID</label>
              <div className="relative">
                <Gamepad2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  value={freeFireId}
                  onChange={(e) => setFreeFireId(e.target.value)}
                  className="input-field w-full pl-10 pr-4 py-3 rounded-lg text-white font-mono"
                  placeholder="Enter your UID"
                  required
                />
              </div>
              <p className="text-xs text-zinc-500 mt-1">Your unique Free Fire player ID</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">
                Upload your Free Fire Profile Screenshot
              </label>
              <div className="border-2 border-dashed border-white/10 rounded-lg p-6 text-center hover:border-yellow-500/30 transition-colors">
                {preview ? (
                  <div className="relative inline-block">
                    <Image
                      src={preview}
                      alt="Screenshot preview"
                      width={320}
                      height={180}
                      className="rounded-lg object-cover max-h-48"
                    />
                    <button
                      type="button"
                      onClick={() => { setFile(null); setPreview(null); }}
                      className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center gap-2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    <Upload className="w-8 h-8" />
                    <span className="text-sm">Click to upload</span>
                    <span className="text-xs">JPG or PNG, max 10MB</span>
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || !freeFireId.trim() || !file}
              className="btn-fire w-full py-3 rounded-lg font-semibold text-white disabled:opacity-50"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Submitting...
                </span>
              ) : (
                'Submit Verification'
              )}
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
