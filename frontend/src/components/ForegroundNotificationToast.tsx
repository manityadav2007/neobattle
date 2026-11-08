'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, X } from 'lucide-react';
import { PUSH_RECEIVED_EVENT, PushReceivedEventDetail, isSafeAppPath } from '@/lib/pushNotifications';

export default function ForegroundNotificationToast() {
  const router = useRouter();
  const [notification, setNotification] = useState<PushReceivedEventDetail | null>(null);

  useEffect(() => {
    function handlePush(e: Event) {
      const customEvent = e as CustomEvent<PushReceivedEventDetail>;
      if (customEvent.detail) {
        setNotification(customEvent.detail);
      }
    }

    window.addEventListener(PUSH_RECEIVED_EVENT, handlePush);
    return () => window.removeEventListener(PUSH_RECEIVED_EVENT, handlePush);
  }, []);

  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => {
      setNotification(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [notification]);

  if (!notification) return null;

  const handleClick = () => {
    if (notification.path && isSafeAppPath(notification.path)) {
      router.push(notification.path);
    }
    setNotification(null);
  };

  return (
    <aside
      aria-label="Notification alert"
      className="fixed top-3 inset-x-3 z-50 max-w-md mx-auto animate-in slide-in-from-top-4 duration-200"
    >
      <div
        onClick={handleClick}
        className="cursor-pointer rounded-xl bg-[#13131c]/95 backdrop-blur-md border border-orange-500/40 p-3 shadow-xl shadow-black/60 flex items-start space-x-3 text-white transition hover:border-orange-500/70"
      >
        <div className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-400 flex items-center justify-center shrink-0 mt-0.5">
          <Bell className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0 pr-1">
          <p className="text-xs font-semibold text-white truncate">{notification.title}</p>
          <p className="text-xs text-gray-300 line-clamp-2 mt-0.5">{notification.body}</p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setNotification(null);
          }}
          className="text-gray-400 hover:text-white p-1 transition"
          aria-label="Dismiss notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}
