"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: "md" | "lg";
  className?: string;
};

const WIDTH_MAP = { md: "400px", lg: "600px" };

export function Drawer({ open, onClose, title, children, width = "md", className }: DrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <div
        ref={drawerRef}
        className={cn(
          "relative bg-surface-card shadow-elevated h-full overflow-y-auto animate-slide-in-right",
          className
        )}
        style={{ width: WIDTH_MAP[width], animation: "slideInRight 0.2s ease-out" }}
      >
        <div className="sticky top-0 bg-surface-card border-b border-surface-border px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-h3 text-text-title">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-btn text-text-subtle hover:bg-surface-bg hover:text-text-body transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">{children}</div>
      </div>

      <style jsx>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
