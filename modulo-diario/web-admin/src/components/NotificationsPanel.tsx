"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { notifyError } from "@/lib/error-handler";

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
        .catch((err) => notifyError("NotificationsPanel", err));
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
        aria-expanded={open}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
        aria-label="Notificações"
      >
        <span className="material-symbols-outlined" aria-hidden="true">notifications</span>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold leading-none text-on-error">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="fixed right-4 top-20 z-50 flex max-h-[calc(100vh-8rem)] w-96 flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-pop">
            <div className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
              <h3 className="text-headline-sm text-primary">Notificações</h3>
              <button onClick={() => setOpen(false)} className="rounded-full p-1 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary" aria-label="Fechar notificações">
                <span className="material-symbols-outlined" aria-hidden="true">close</span>
              </button>
            </div>
            <div className="flex-1 divide-y divide-outline-variant/60 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-5 py-12 text-center text-on-surface-variant">
                  <span className="material-symbols-outlined mb-2 block text-4xl text-outline" aria-hidden="true">notifications_off</span>
                  <p className="text-body-sm">Nenhuma notificação</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`flex gap-3 px-5 py-4 transition-colors ${
                      n.read
                        ? "hover:bg-surface-container-low"
                        : "bg-primary-fixed/40 hover:bg-primary-fixed/60"
                    }`}
                  >
                    <span className={`material-symbols-outlined mt-0.5 ${n.color}`} aria-hidden="true">{n.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-body-sm text-on-surface ${!n.read ? "font-bold" : "font-semibold"}`}>
                        {n.title}
                        {!n.read && <span className="ml-2 inline-block h-2 w-2 rounded-full bg-primary align-middle" />}
                      </p>
                      <p className="text-body-sm text-on-surface-variant">{n.desc}</p>
                      <p className="mt-0.5 text-body-sm text-outline">{n.time}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            {unreadCount > 0 && (
              <div className="border-t border-outline-variant px-5 py-3 text-center">
                <button
                  onClick={markAllAsRead}
                  className="text-body-sm font-medium text-primary hover:underline"
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
