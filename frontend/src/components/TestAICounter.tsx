'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  Sparkles,
  FileVideo,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Copy,
  Check,
  RotateCcw,
  Crosshair,
  Clock,
  Swords,
  ShieldAlert,
  Code2,
  LayoutList,
  Trash2,
} from 'lucide-react';
import { testAiCounterApi, TestAiDetectedKill, TestAiFeedResponse } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';

export default function TestAICounter() {
  const [file, setFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number>(0);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [error, setError] = useState<string>('');
  const [response, setResponse] = useState<TestAiFeedResponse | null>(null);
  const [viewMode, setViewMode] = useState<'structured' | 'json'>('structured');
  const [copiedJson, setCopiedJson] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up object URL on unmount or file change
  useEffect(() => {
    return () => {
      if (videoPreviewUrl) {
        URL.revokeObjectURL(videoPreviewUrl);
      }
    };
  }, [videoPreviewUrl]);

  // Elapsed time tracker during analysis
  useEffect(() => {
    if (isAnalyzing) {
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isAnalyzing]);

  const handleSelectFile = (selectedFile: File) => {
    setError('');
    setResponse(null);

    const allowed = /\.(mp4|mkv|mov|webm|avi)$/i;
    if (!allowed.test(selectedFile.name) && !selectedFile.type.startsWith('video/')) {
      setError('Please select a valid video file (.mp4, .mkv, .mov, .webm, .avi)');
      return;
    }

    if (selectedFile.size > 250 * 1024 * 1024) {
      setError('Video file exceeds the 250 MB limit. Please choose a shorter clip.');
      return;
    }

    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
    }

    setFile(selectedFile);
    try {
      const url = URL.createObjectURL(selectedFile);
      setVideoPreviewUrl(url);
    } catch {
      setVideoPreviewUrl(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleSelectFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleClearFile = () => {
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
    }
    setFile(null);
    setVideoPreviewUrl(null);
    setResponse(null);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRunAiTest = async () => {
    if (!file) {
      setError('Please select or drop a video file first.');
      return;
    }

    setIsAnalyzing(true);
    setError('');
    setResponse(null);
    setUploadPercent(0);

    try {
      const data = await testAiCounterApi.testFeed(file, (percent) => {
        setUploadPercent(percent);
      });
      setResponse(data);
    } catch (err: any) {
      console.error('[TestAICounter] Error running AI test:', err);
      setError(getErrorMessage(err) || 'Failed to analyze video feed. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCopyJson = () => {
    if (!response) return;
    navigator.clipboard.writeText(JSON.stringify(response, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const kills: TestAiDetectedKill[] = response?.kills || response?.data?.kills || [];
  const totalKillsCount = response?.totalKillsFound ?? response?.data?.totalKillsFound ?? kills.length;

  // Stats calculation
  const uniqueKillers = Array.from(new Set(kills.map((k) => k.killer.toLowerCase()))).length;
  const uniqueVictims = Array.from(new Set(kills.map((k) => k.victim.toLowerCase()))).length;

  return (
    <div className="space-y-6">
      {/* Informative Header / Callout */}
      <div className="glass-card rounded-2xl p-6 border border-white/10 bg-gradient-to-r from-violet-500/10 via-purple-500/5 to-transparent relative overflow-hidden shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-400 shrink-0 shadow-inner">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white font-display">AI Kill Counter Playground</h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  Sandbox
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1 max-w-2xl leading-relaxed">
                Test the Gemini AI multimodal kill feed detection engine on <strong>any random gameplay video</strong> (e.g. YouTube clips or screen captures).
                All tournament restrictions, player database lookups, and roster checks are bypassed.
              </p>
            </div>
          </div>
          {response && (
            <button
              onClick={handleClearFile}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-zinc-300 transition-colors border border-white/10 shrink-0 self-start sm:self-center"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Test Another Video
            </button>
          )}
        </div>
      </div>

      {/* Upload Zone Card */}
      <div className="glass-card rounded-2xl p-6 border border-white/10 shadow-xl space-y-6">
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <FileVideo className="w-4 h-4 text-violet-400" />
              Upload Gameplay Video Clip
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Supports MP4, MKV, MOV, WebM, AVI (up to 250 MB). 30s to 3-minute clips work best for quick analysis.
            </p>
          </div>
        </div>

        {/* Drag & Drop Box */}
        {!file ? (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 sm:p-12 text-center transition-all duration-200 flex flex-col items-center justify-center gap-3 ${
              isDragging
                ? 'border-violet-400 bg-violet-500/10 scale-[1.01]'
                : 'border-white/15 bg-white/[0.02] hover:border-violet-500/40 hover:bg-white/[0.04]'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleSelectFile(e.target.files[0]);
                }
              }}
              accept="video/mp4,video/x-matroska,video/quicktime,video/webm,video/avi,.mp4,.mkv,.mov,.webm,.avi"
              className="hidden"
            />
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-violet-600/20 to-indigo-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400 shadow-md">
              <Upload className="w-7 h-7 animate-pulse" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">
                Drag &amp; drop your Free Fire gameplay clip here
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                or <span className="text-violet-400 underline underline-offset-2">browse files</span> from your computer
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <span className="text-[11px] px-2.5 py-1 rounded-lg bg-white/5 border border-white/5 text-zinc-400 font-mono">
                .MP4
              </span>
              <span className="text-[11px] px-2.5 py-1 rounded-lg bg-white/5 border border-white/5 text-zinc-400 font-mono">
                .MKV
              </span>
              <span className="text-[11px] px-2.5 py-1 rounded-lg bg-white/5 border border-white/5 text-zinc-400 font-mono">
                .MOV
              </span>
              <span className="text-[11px] px-2.5 py-1 rounded-lg bg-white/5 border border-white/5 text-zinc-400 font-mono">
                .WEBM
              </span>
            </div>
          </div>
        ) : (
          /* Selected File Preview Card */
          <div className="rounded-2xl bg-white/[0.02] border border-white/10 p-4 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-400 shrink-0">
                  <FileVideo className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate max-w-md">{file.name}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB • {file.type || 'video'}
                  </p>
                </div>
              </div>
              {!isAnalyzing && (
                <button
                  type="button"
                  onClick={handleClearFile}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold border border-red-500/20 transition-colors self-start sm:self-auto"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </button>
              )}
            </div>

            {/* Video Player Preview if Available */}
            {videoPreviewUrl && (
              <div className="rounded-xl overflow-hidden bg-black/60 border border-white/10 max-w-lg mx-auto">
                <video
                  src={videoPreviewUrl}
                  controls
                  className="w-full max-h-56 object-contain"
                />
              </div>
            )}

            {/* Run Action Button & Progress */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-zinc-400">
                {isAnalyzing ? (
                  <span className="flex items-center gap-2 text-violet-300 font-medium">
                    <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                    {uploadPercent < 100
                      ? `Uploading clip (${uploadPercent}%)...`
                      : `Extracting frames & running Gemini AI vision... (${elapsedSeconds}s elapsed)`}
                  </span>
                ) : (
                  <span>Ready to sample frames and parse kill-feed notifications.</span>
                )}
              </div>

              <button
                type="button"
                onClick={handleRunAiTest}
                disabled={isAnalyzing}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-xs sm:text-sm transition-all shadow-lg shadow-violet-600/20 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing Video... ({elapsedSeconds}s)
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-violet-200" />
                    Run AI Test
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="flex items-center gap-2 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs sm:text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Analysis Results Section */}
      <AnimatePresence>
        {response && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="space-y-6"
          >
            {/* Top Metric Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="glass-card rounded-2xl p-4 border border-white/10 bg-gradient-to-br from-violet-500/5 to-transparent">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-400">Total Kills</span>
                  <Crosshair className="w-4 h-4 text-violet-400" />
                </div>
                <p className="text-2xl font-bold font-display text-white mt-2">{totalKillsCount}</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">Detected in feed</p>
              </div>

              <div className="glass-card rounded-2xl p-4 border border-white/10 bg-gradient-to-br from-emerald-500/5 to-transparent">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-400">Unique Killers</span>
                  <Swords className="w-4 h-4 text-emerald-400" />
                </div>
                <p className="text-2xl font-bold font-display text-emerald-400 mt-2">{uniqueKillers}</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">Distinct players</p>
              </div>

              <div className="glass-card rounded-2xl p-4 border border-white/10 bg-gradient-to-br from-rose-500/5 to-transparent">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-400">Victims</span>
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                </div>
                <p className="text-2xl font-bold font-display text-rose-400 mt-2">{uniqueVictims}</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">Eliminated</p>
              </div>

              <div className="glass-card rounded-2xl p-4 border border-white/10 bg-gradient-to-br from-blue-500/5 to-transparent">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-400">Processing Time</span>
                  <Clock className="w-4 h-4 text-blue-400" />
                </div>
                <p className="text-2xl font-bold font-display text-blue-400 mt-2">
                  {response.data?.videoDetails?.durationSeconds ?? elapsedSeconds}s
                </p>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  {response.data?.videoDetails?.framesAnalyzed ?? 0} frames sampled
                </p>
              </div>
            </div>

            {/* Results Details Card */}
            <div className="glass-card rounded-2xl p-6 border border-white/10 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    Detection Results ({totalKillsCount} Kills)
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Chronologically sampled and deduplicated within 10-second windows.
                  </p>
                </div>

                {/* View Switcher & Copy Button */}
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <div className="flex items-center bg-black/40 p-1 rounded-xl border border-white/10">
                    <button
                      type="button"
                      onClick={() => setViewMode('structured')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        viewMode === 'structured'
                          ? 'bg-violet-600 text-white shadow-sm'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      <LayoutList className="w-3.5 h-3.5" /> Structured List
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('json')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        viewMode === 'json'
                          ? 'bg-violet-600 text-white shadow-sm'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      <Code2 className="w-3.5 h-3.5" /> Raw JSON
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyJson}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-zinc-300 border border-white/10 transition-colors"
                    title="Copy full JSON output"
                  >
                    {copiedJson ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copy JSON
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* View 1: Structured List */}
              {viewMode === 'structured' ? (
                kills.length === 0 ? (
                  <div className="text-center py-12 space-y-2">
                    <AlertCircle className="w-10 h-10 text-zinc-600 mx-auto" />
                    <p className="text-sm font-semibold text-zinc-300">No kills detected in this video</p>
                    <p className="text-xs text-zinc-500 max-w-md mx-auto">
                      Ensure the video contains clearly visible Free Fire kill feed notifications near the upper section of the screen.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="text-zinc-400 border-b border-white/5 text-xs uppercase tracking-wider">
                          <th className="py-3 px-3 font-semibold w-14">#</th>
                          <th className="py-3 px-4 font-semibold">Timestamp</th>
                          <th className="py-3 px-4 font-semibold">Killer</th>
                          <th className="py-3 px-4 font-semibold text-center">Weapon</th>
                          <th className="py-3 px-4 font-semibold">Victim</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {kills.map((k, index) => (
                          <tr key={`${k.killer}_${k.victim}_${k.timestamp}_${index}`} className="hover:bg-white/[0.02] transition-colors">
                            <td className="py-3 px-3 font-mono text-xs text-zinc-500">
                              {index + 1}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1 font-mono text-xs px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-zinc-300">
                                <Clock className="w-3 h-3 text-violet-400" />
                                {k.formattedTime || `${k.timestamp}s`}
                              </span>
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                                {k.killer}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center whitespace-nowrap">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-violet-500/15 border border-violet-500/30 text-violet-300">
                                <Crosshair className="w-3 h-3" />
                                {k.weapon || 'Unknown'}
                              </span>
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span className="font-semibold text-rose-400 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                                {k.victim}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                /* View 2: Raw JSON Response */
                <div className="rounded-xl bg-black/60 border border-white/10 p-4 font-mono text-xs text-zinc-300 overflow-x-auto max-h-96">
                  <pre>{JSON.stringify(response, null, 2)}</pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
