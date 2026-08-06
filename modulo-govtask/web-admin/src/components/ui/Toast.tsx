"use client";

import toast from "react-hot-toast";
import { CheckCircle, XCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

function customToast(
  message: string,
  type: "success" | "error" | "info"
) {
  const Icon = type === "success" ? CheckCircle : type === "error" ? XCircle : Info;
  const bgColors = {
    success: "bg-[#067647]/10 border-[#067647] text-[#067647]",
    error: "bg-[#FEE4E2] border-[#B42318] text-[#B42318]",
    info: "bg-[#1D4ED8]/10 border-[#1D4ED8] text-[#1D4ED8]",
  };

  return toast.custom(
    (t) => (
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-card border shadow-elevated max-w-sm",
          bgColors[type],
          t.visible ? "animate-enter" : "animate-leave"
        )}
      >
        <Icon className="w-5 h-5 shrink-0" />
        <p className="text-body-sm font-medium">{message}</p>
      </div>
    ),
    { duration: type === "error" ? 5000 : 3000 }
  );
}

export const notify = {
  success: (message: string) => customToast(message, "success"),
  error: (message: string) => customToast(message, "error"),
  info: (message: string) => customToast(message, "info"),
};

export { toast };
