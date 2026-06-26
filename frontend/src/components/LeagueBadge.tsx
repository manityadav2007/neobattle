import { Shield, Award, Star, Zap } from 'lucide-react';

const leagues = [
  { name: 'Bronze', color: 'text-amber-600', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: Shield, min: 0 },
  { name: 'Silver', color: 'text-zinc-300', bg: 'bg-zinc-300/10', border: 'border-zinc-300/20', icon: Award, min: 6 },
  { name: 'Gold', color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-500/20', icon: Star, min: 16 },
  { name: 'Diamond/Elite', color: 'text-cyan-400', bg: 'bg-cyan-400/10', border: 'border-cyan-500/20', icon: Zap, min: 30 },
];

export function getLeague(wins: number): string {
  if (wins >= 30) return 'Diamond/Elite';
  if (wins >= 16) return 'Gold';
  if (wins >= 6) return 'Silver';
  return 'Bronze';
}

export function getLeagueBadge(wins: number) {
  const league = leagues.find((l) => wins >= l.min) || leagues[leagues.length - 1];
  return league;
}

export default function LeagueBadge({ wins, size = 'sm' }: { wins: number; size?: 'sm' | 'md' | 'lg' }) {
  const league = getLeagueBadge(wins);
  if (!league) return null;

  const Icon = league.icon;
  const sizeClasses = size === 'sm' ? 'text-xs px-2 py-0.5 gap-1' : size === 'md' ? 'text-sm px-3 py-1 gap-1.5' : 'text-base px-4 py-1.5 gap-2';

  return (
    <span className={`inline-flex items-center rounded-full font-semibold ${sizeClasses} ${league.bg} ${league.color} ${league.border} border`}>
      <Icon className={size === 'sm' ? 'w-3 h-3' : size === 'md' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
      {league.name}
    </span>
  );
}
