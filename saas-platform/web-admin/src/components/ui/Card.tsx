import React from "react";
import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  action?: React.ReactNode;
  padding?: boolean;
}

export default function Card({ children, className, title, action, padding = true }: CardProps) {
  return (
    <div className={cn("bg-white rounded-xl shadow-sm border border-gray-200", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          {title && <h3 className="text-lg font-semibold text-gray-900">{title}</h3>}
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={padding ? "p-6" : ""}>{children}</div>
    </div>
  );
}
