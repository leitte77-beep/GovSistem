"use client";
import React, { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type SidebarCtx = { open: boolean; setOpen: (v: boolean) => void; toggle: () => void };

const Ctx = createContext<SidebarCtx>({ open: false, setOpen: () => {}, toggle: () => {} });

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // fecha o menu ao navegar
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // trava o scroll do corpo enquanto o drawer está aberto
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // fecha com Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <Ctx.Provider value={{ open, setOpen, toggle: () => setOpen(!open) }}>{children}</Ctx.Provider>
  );
}

export const useSidebar = () => useContext(Ctx);
