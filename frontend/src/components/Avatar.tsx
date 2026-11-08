'use client';

import { useState } from 'react';
import { User } from 'lucide-react';

interface AvatarProps {
  src?: string | null;
  alt?: string;
  size?: number;
  className?: string;
  fallbackText?: string;
}

export default function Avatar({ src, alt = '', size = 36, className = '', fallbackText }: AvatarProps) {
  const [hasError, setHasError] = useState(false);

  if (src && !hasError) {
    return (
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        className={`rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
        onError={() => setHasError(true)}
      />
    );
  }

  if (fallbackText) {
    return (
      <div
        className={`rounded-full bg-fire-500/20 flex items-center justify-center text-fire-400 font-bold shrink-0 ${className}`}
        style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) }}
      >
        {(fallbackText[0] || '?').toUpperCase()}
      </div>
    );
  }

  return (
    <div
      className={`rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500 ${className}`}
      style={{ width: size, height: size }}
    >
      <User size={size * 0.5} />
    </div>
  );
}
