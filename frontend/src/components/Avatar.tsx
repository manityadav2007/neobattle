'use client';

import { User } from 'lucide-react';

interface AvatarProps {
  src?: string | null;
  alt?: string;
  size?: number;
  className?: string;
}

export default function Avatar({ src, alt = '', size = 36, className = '' }: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        className={`rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
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
