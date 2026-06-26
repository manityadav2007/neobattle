'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ChevronRight, type LucideIcon } from 'lucide-react';

interface InfoCard {
  title: string;
  description: string;
  icon: LucideIcon;
}

interface InfoPageShellProps {
  eyebrow: string;
  title: string;
  description: string;
  primaryCta: {
    href: string;
    label: string;
  };
  secondaryCta?: {
    href: string;
    label: string;
  };
  cards: InfoCard[];
}

export default function InfoPageShell({
  eyebrow,
  title,
  description,
  primaryCta,
  secondaryCta,
  cards,
}: InfoPageShellProps) {
  return (
    <div className="relative">
      <section className="relative z-10 min-h-[calc(100vh-4rem)] px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl"
          >
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-fire-300">{eyebrow}</p>
            <h1 className="mt-5 text-4xl font-display font-black text-white sm:text-6xl">
              <span className="gradient-text">{title}</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-400">{description}</p>

            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href={primaryCta.href}
                className="btn-fire inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white"
              >
                {primaryCta.label}
                <ChevronRight className="h-4 w-4" />
              </Link>

              {secondaryCta && (
                <Link
                  href={secondaryCta.href}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-6 py-3 text-sm font-semibold text-zinc-300 transition-all hover:border-fire-500/40 hover:text-white"
                >
                  {secondaryCta.label}
                </Link>
              )}
            </div>
          </motion.div>

          <div className="mt-14 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {cards.map((card, index) => {
              const Icon = card.icon;

              return (
                <motion.div
                  key={card.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.08 }}
                  className="glass-card rounded-3xl p-6"
                >
                  <div className="mb-4 inline-flex rounded-2xl bg-fire-500/12 p-3 text-fire-300">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h2 className="text-lg font-semibold text-white">{card.title}</h2>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">{card.description}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
