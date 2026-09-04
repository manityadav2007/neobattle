'use client';

import { useEffect, useState, useRef } from 'react';
import { Bell, CheckCheck, Loader2, X, Calendar, AlertTriangle, Ban, Trophy } from 'lucide-react';
import { api, isAuthenticated } from '@/lib/api';
import { formatDate } from '@/lib/services';
import { motion, AnimatePresence } from 'framer-motion';

function formatMessageDates(msg: string): string {
  return msg.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, (iso) => {
    try {
      return new Intl.DateTimeFormat('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  });
}

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

const typeIcons: Record<string, any> = {
  MATCH_SCHEDULE: Calendar,
  MATCH_UPDATE: Calendar,
  DEADLINE: AlertTriangle,
  DISQUALIFICATION: Ban,
  PAYOUT_APPROVED: Trophy,
  NEW_TOURNAMENT: Trophy,
};

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    if (!isAuthenticated()) return;
    try {
      const res = await api.get('/notifications', { params: { limit: 10 } });
      setNotifications(res.data.data || []);
      setUnreadCount(res.data.unreadCount || 0);
    } catch {}
  };

  useEffect(() => {
    if (!isAuthenticated()) return;
    fetchNotifications();
    const interval = setInterval(() => {
      if (isAuthenticated()) {
        fetchNotifications();
      }
    }, 45000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const markAllRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {}
  };

  const markRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {}
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-fire-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="absolute right-0 mt-2 w-80 sm:w-96 glass-card rounded-2xl border border-white/10 shadow-xl overflow-hidden z-50"
          >
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Bell className="w-4 h-4 text-fire-400" />
                Notifications
              </h3>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-xs text-fire-400 hover:text-fire-300 flex items-center gap-1"
                >
                  <CheckCheck className="w-3 h-3" /> Mark all read
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-zinc-500 text-sm">No notifications yet</div>
              ) : (
                notifications.map((notif) => {
                  const Icon = typeIcons[notif.type] || Bell;
                  return (
                    <div
                      key={notif.id}
                      className={`p-4 border-b border-white/5 hover:bg-white/3 transition-colors cursor-pointer ${
                        !notif.isRead ? 'bg-fire-500/5 border-l-2 border-l-fire-500' : ''
                      }`}
                      onClick={() => {
                        markRead(notif.id);
                        if (notif.link) window.location.href = notif.link;
                      }}
                    >
                      <div className="flex gap-3">
                        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${
                          notif.type === 'DISQUALIFICATION' ? 'text-red-400' :
                          notif.type === 'DEADLINE' ? 'text-yellow-400' :
                          notif.type === 'PAYOUT_APPROVED' ? 'text-amber-400' :
                          'text-cyan-400'
                        }`} />
                        <div className="min-w-0">
                          <p className={`text-sm ${notif.isRead ? 'text-zinc-300' : 'text-white font-medium'}`}>
                            {notif.title}
                          </p>
                          <p className="text-xs text-zinc-500 mt-0.5 truncate">{formatMessageDates(notif.message)}</p>
                          <p className="text-[10px] text-zinc-600 mt-1">{formatDate(notif.createdAt)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
