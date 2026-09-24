"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Notification {
  id: string;
  icon: string;
  color: string;
  title: string;
  desc: string;
  time: string;
  read: boolean;
}

export default function NotificationsPanel() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    if (open) {
      api.getRaw<Notification[]>("/operations/notifications")
        .then(setNotifications)
        .catch(() => {});
    }
  }, [open]);

  async function markAllAsRead() {
    try {
      await api.patch("/operations/notifications/read-all");
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // Silently fail
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-high transition-colors relative"
        aria-label="Notificações"
      >
        <span className="material-symbols-outlined">notifications</span>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-error text-on-error rounded-full text-[10px] font-bold leading-none px-1">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed right-4 top-20 z-50 w-96 max-h-[calc(100vh-8rem)] bg-surface-container-lowest border border-outline-variant rounded-xl shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant">
              <h3 className="text-headline-sm font-headline-sm text-primary">Notificações</h3>
              <button onClick={() => setOpen(false)} className="p-1 text-on-surface-variant hover:text-primary rounded-full">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-outline-variant/30">
              {notifications.length === 0 ? (
                <div className="px-5 py-12 text-center text-on-surface-variant">
                  <span className="material-symbols-outlined text-4xl mb-2 block text-outline">notifications_off</span>
                  <p className="text-body-sm">Nenhuma notificação</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`flex gap-3 px-5 py-4 transition-colors cursor-pointer ${
                      n.read
                        ? "hover:bg-surface-container-low/50"
                        : "bg-primary-container/15 hover:bg-primary-container/30"
                    }`}
                  >
                    <span className={`material-symbols-outlined mt-0.5 ${n.color}`}>{n.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-body-sm text-on-surface ${!n.read ? "font-bold" : "font-semibold"}`}>
                        {n.title}
                        {!n.read && <span className="inline-block w-2 h-2 bg-primary rounded-full ml-2 align-middle" />}
                      </p>
                      <p className="text-body-sm text-on-surface-variant">{n.desc}</p>
                      <p className="text-label-md text-outline mt-0.5">{n.time}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            {unreadCount > 0 && (
              <div className="px-5 py-3 border-t border-outline-variant text-center">
                <button
                  onClick={markAllAsRead}
                  className="text-label-md text-primary hover:underline"
                >
                  Marcar todas como lidas
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
