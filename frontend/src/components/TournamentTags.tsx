'use client';

import { Shield, Trophy, Smartphone, Gamepad2 } from 'lucide-react';

interface TagItem {
  label: string;
  color: string;
  icon: typeof Shield;
}

interface TournamentTagsProps {
  items: TagItem[];
  className?: string;
}

export default function TournamentTags({ items, className = '' }: TournamentTagsProps) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {items.map((item) => (
        <span
          key={item.label}
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${item.color}`}
        >
          <item.icon className="w-3.5 h-3.5" />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export const tagColorMap = {
  status: {
    REGISTRATION: 'bg-green-500/20 text-green-400',
    ACTIVE: 'bg-fire-500/20 text-fire-400',
    COMPLETED: 'bg-blue-500/20 text-blue-400',
    CANCELLED: 'bg-red-500/20 text-red-400',
    DRAFT: 'bg-zinc-500/20 text-zinc-400',
  },
  format: {
    SOLO: 'bg-blue-500/20 text-blue-400',
    DUO: 'bg-blue-500/20 text-blue-400',
    SQUAD: 'bg-blue-500/20 text-blue-400',
  },
  platform: {
    MOBILE: 'bg-purple-500/20 text-purple-400',
    PC: 'bg-purple-500/20 text-purple-400',
  },
  gameMode: {
    FULL_MAP: 'bg-amber-500/20 text-amber-400',
    CLASH_SQUAD: 'bg-amber-500/20 text-amber-400',
  },
};

export const tagIcons = {
  status: Shield,
  format: Trophy,
  platform: Smartphone,
  gameMode: Gamepad2,
};
