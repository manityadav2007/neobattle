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
import { testAiCounterApi, TestAiDetectedKill, TestAiFeedResponse, CropRegion } from '@/lib/services';
import { ScreenRegionCropper, DEFAULT_KILL_FEED_CROP } from './ScreenRegionCropper';
import { getErrorMessage } from '@/lib/api';
import { sanitizeMediaUrl } from '@/utils/sanitizeUrl';

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

  const [estimatedApiCalls, setEstimatedApiCalls] = useState<number | null>(null);
  const [quotaWarning, setQuotaWarning] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [firstFrameDataUrl, setFirstFrameDataUrl] = useState<string | null>(null);
  const [cropRegion, setCropRegion] = useState<CropRegion | null>(DEFAULT_KILL_FEED_CROP);
  const [isCropping, setIsCropping] = useState<boolean>(true);
  const [croppedSliceDataUrl, setCroppedSliceDataUrl] = useState<string | null>(null);
  const [cropPixelDimensions, setCropPixelDimensions] = useState<{
    sourceWidth: number;
    sourceHeight: number;
    pixelLeft: number;
    pixelTop: number;
    pixelWidth: number;
    pixelHeight: number;
    areaPercent: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoPlayerRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Compute exact pixel dimensions and generate live cropped slice preview
  useEffect(() => {
    if (!firstFrameDataUrl) {
      setCroppedSliceDataUrl(null);
      setCropPixelDimensions(null);
      return;
    }

    const img = new window.Image();
    img.onload = () => {
      const srcW = img.naturalWidth || img.width;
      const srcH = img.naturalHeight || img.height;
      if (!srcW || !srcH) return;

      const current = cropRegion || { x: 0, y: 0, width: 100, height: 100, unit: 'percent' };
      const pLeft = Math.round((Math.max(0, current.x) / 100) * srcW);
      const pTop = Math.round((Math.max(0, current.y) / 100) * srcH);
      const pWidth = Math.round((Math.min(100 - current.x, current.width) / 100) * srcW);
      const pHeight = Math.round((Math.min(100 - current.y, current.height) / 100) * srcH);
      const areaPct = Number((((pWidth * pHeight) / (srcW * srcH)) * 100).toFixed(1));

      setCropPixelDimensions({
        sourceWidth: srcW,
        sourceHeight: srcH,
        pixelLeft: pLeft,
        pixelTop: pTop,
        pixelWidth: pWidth,
        pixelHeight: pHeight,
        areaPercent: areaPct,
      });

      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, pWidth);
        canvas.height = Math.max(1, pHeight);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, pLeft, pTop, pWidth, pHeight, 0, 0, pWidth, pHeight);
          setCroppedSliceDataUrl(canvas.toDataURL('image/jpeg', 0.9));
        }
      } catch (err) {
        console.warn('[TestAICounter] Failed to slice crop preview:', err);
      }
    };
    img.src = firstFrameDataUrl;
  }, [firstFrameDataUrl, cropRegion]);

  // Immediately auto-play video as soon as crop area is confirmed
  useEffect(() => {
    if (!isCropping && videoPreviewUrl && videoPlayerRef.current) {
      const vid = videoPlayerRef.current;
      const playVideo = () => {
        const playPromise = vid.play();
        if (playPromise !== undefined) {
          playPromise.catch((err: any) => {
            console.warn('[TestAICounter] Sound autoplay blocked, attempting muted autoplay:', err);
            vid.muted = true;
            vid.play().catch(() => {});
          });
        }
      };

      if (vid.readyState >= 2) {
        playVideo();
      } else {
        vid.onloadeddata = () => {
          playVideo();
        };
      }
    }
  }, [isCropping, videoPreviewUrl]);

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
    setEstimatedApiCalls(null);
    setQuotaWarning(null);
    setVideoDuration(null);

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
    setIsCropping(true);
    try {
      const url = encodeURI(URL.createObjectURL(selectedFile));
      setVideoPreviewUrl(url);

      const tempVideo = document.createElement('video');
      tempVideo.preload = 'auto';
      tempVideo.muted = true;
      tempVideo.playsInline = true;

      const captureFrame = () => {
        const w = tempVideo.videoWidth;
        const h = tempVideo.videoHeight;
        if (!w || !h) return;
        try {
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(tempVideo, 0, 0, w, h);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
            setFirstFrameDataUrl(dataUrl);
          }
        } catch (captureErr) {
          console.warn('[TestAICounter] Failed to capture first frame for crop preview:', captureErr);
        }
      };

      tempVideo.onloadedmetadata = () => {
        const dur = tempVideo.duration;
        if (dur && !isNaN(dur)) {
          setVideoDuration(dur);
          const estFrames = Math.ceil(dur / 1.0);
          const estCalls = Math.ceil(estFrames / 30);
          setEstimatedApiCalls(estCalls);
        }
        // Seek slightly forward to grab a clear first frame (skips initial black frames)
        tempVideo.currentTime = Math.min(1.0, Math.max(0.1, (tempVideo.duration || 1) * 0.02));
      };

      tempVideo.onseeked = () => {
        captureFrame();
      };
      tempVideo.onloadeddata = () => {
        captureFrame();
      };

      tempVideo.src = encodeURI(sanitizeMediaUrl(url));
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
    setFirstFrameDataUrl(null);
    setCropRegion(DEFAULT_KILL_FEED_CROP);
    setIsCropping(true);
    setCroppedSliceDataUrl(null);
    setCropPixelDimensions(null);
    setResponse(null);
    setError('');
    setEstimatedApiCalls(null);
    setQuotaWarning(null);
    setVideoDuration(null);
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
      const data = await testAiCounterApi.testFeed(file, cropRegion || undefined, (percent) => {
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
              <h2 className="text-xl font-bold text-white font-display">AI Kill Counter Playground</h2>
              <p className="text-xs text-zinc-400 mt-1">
                Test video kill feed detection on any gameplay clip without tournament restrictions
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

            {/* Interactive Screen Region Cropper OR Full Playable Video View */}
            {firstFrameDataUrl && isCropping ? (
              <ScreenRegionCropper
                imageUrl={firstFrameDataUrl}
                crop={cropRegion}
                onChange={setCropRegion}
                onConfirm={() => setIsCropping(false)}
                disabled={isAnalyzing}
              />
            ) : videoPreviewUrl ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1 flex-wrap gap-2">
                  <span className="text-xs text-zinc-300 flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    {cropRegion ? 'Kill-feed crop area confirmed' : 'Full-frame scan selected'}
                  </span>
                  {firstFrameDataUrl && (
                    <button
                      type="button"
                      onClick={() => setIsCropping(true)}
                      disabled={isAnalyzing}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 border border-violet-500/30 transition-all cursor-pointer"
                    >
                      <Crosshair className="w-3.5 h-3.5" /> Adjust Crop Area
                    </button>
                  )}
                </div>

                {/* Isolated Cropped Kill-Feed Area Preview Banner */}
                {cropRegion && croppedSliceDataUrl && cropPixelDimensions && (
                  <div className="p-3 rounded-xl bg-slate-950/90 border border-amber-500/40 space-y-2 shadow-inner">
                    <div className="flex items-center justify-between text-xs flex-wrap gap-1">
                      <span className="font-semibold text-amber-300 flex items-center gap-1.5">
                        <Crosshair className="w-3.5 h-3.5 text-amber-400" />
                        Isolated Kill-Feed Crop Slice (Only this region is sent to AI)
                      </span>
                      <span className="text-[11px] font-mono text-emerald-400 font-semibold px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                        {cropPixelDimensions.areaPercent}% of full frame
                      </span>
                    </div>

                    {/* Visual Cropped Slice */}
                    <div className="w-full flex justify-center bg-black/90 rounded-lg p-2 border border-slate-800 overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={croppedSliceDataUrl}
                        alt="Cropped Kill Feed Region"
                        className="max-h-24 object-contain rounded border border-amber-400/50 shadow-md"
                      />
                    </div>

                    {/* Exact Pixel Resolution Readout */}
                    <div className="flex flex-wrap items-center justify-between text-[11px] font-mono text-zinc-300 pt-1 border-t border-slate-800/80 gap-2">
                      <span>
                        Crop Size: <strong className="text-amber-300">{cropPixelDimensions.pixelWidth} × {cropPixelDimensions.pixelHeight} px</strong>
                      </span>
                      <span>
                        Offset: <strong className="text-white">X={cropPixelDimensions.pixelLeft}px, Y={cropPixelDimensions.pixelTop}px</strong>
                      </span>
                      <span>
                        Source: <strong className="text-zinc-400">{cropPixelDimensions.sourceWidth} × {cropPixelDimensions.sourceHeight} px</strong>
                      </span>
                    </div>
                  </div>
                )}

                {/* Auto-Playing Native Video Player */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-medium text-zinc-400 flex items-center gap-1 px-1">
                    <FileVideo className="w-3 h-3 text-zinc-500" />
                    Full Video Playback (Playing automatically)
                  </div>
                  <div className="rounded-xl overflow-hidden bg-black border border-white/10 max-w-xl mx-auto shadow-lg">
                    <video
                      ref={videoPlayerRef}
                      src={videoPreviewUrl ? encodeURI(sanitizeMediaUrl(videoPreviewUrl)) : undefined}
                      controls
                      autoPlay
                      playsInline
                      className="w-full max-h-72 object-contain"
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {/* Pre-Processing Estimation */}
            {estimatedApiCalls !== null && (
              <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-zinc-400 bg-white/[0.02] p-2.5 rounded-xl border border-white/5">
                <span>
                  This video is approximately <strong className="text-white font-mono">{videoDuration ? (videoDuration / 60).toFixed(1) : 0} minutes</strong> long and will use approximately <strong className="text-violet-400 font-mono">{estimatedApiCalls}</strong> API request{estimatedApiCalls === 1 ? '' : 's'}.
                </span>
                <span className="text-[11px] text-zinc-500 font-mono">1 frame / 1.0s • 30 frames / batch</span>
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

            {/* Backend-Confirmed Crop Coordinates Readout */}
            {(response.cropDetails || response.data?.cropDetails) && (
              <div className="flex flex-wrap items-center justify-between text-xs px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 gap-2 shadow-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <Crosshair className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="font-semibold">AI Vision Screen Crop Applied:</span>
                  <span className="font-mono text-white">
                    {(response.cropDetails || response.data?.cropDetails)?.pixelWidth} × {(response.cropDetails || response.data?.cropDetails)?.pixelHeight} px
                  </span>
                  <span className="text-zinc-400">
                    (Offset: X={(response.cropDetails || response.data?.cropDetails)?.pixelLeft}px, Y={(response.cropDetails || response.data?.cropDetails)?.pixelTop}px)
                  </span>
                </div>
                <div className="font-mono text-emerald-400 text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                  {(response.cropDetails || response.data?.cropDetails)?.areaPercent}% of { (response.cropDetails || response.data?.cropDetails)?.sourceWidth}×{(response.cropDetails || response.data?.cropDetails)?.sourceHeight}px frame
                </div>
              </div>
            )}

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
