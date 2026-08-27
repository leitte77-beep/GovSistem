"use client";
import React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Loader2,
  Lock,
  LayoutGrid,
  FileText,
  Wallet,
  Bot,
  ClipboardCheck,
  SmilePlus,
  HeartHandshake,
  FolderOpen,
  Megaphone,
  Gavel,
  AlertTriangle,
  Sparkles,
} from "lucide-react";

const MODULE_VISUALS: Record<string, { icon: React.ElementType; gradient: string }> = {
  diario: { icon: FileText, gradient: "from-[#001631] to-[#5392ef]" },
  financeiro: { icon: Wallet, gradient: "from-[#006d3d] to-[#73db9a]" },
  chatgov: { icon: Bot, gradient: "from-[#075e54] to-[#25D366]" },
  govtask: { icon: ClipboardCheck, gradient: "from-[#1e3a5f] to-[#60a5fa]" },
  govavalia: { icon: SmilePlus, gradient: "from-[#15524c] to-[#4ecdc4]" },
  govsocial: { icon: HeartHandshake, gradient: "from-[#5b2172] to-[#c77dff]" },
  govdoc: { icon: FolderOpen, gradient: "from-[#312e81] to-[#818cf8]" },
  govouve: { icon: Megaphone, gradient: "from-[#0b3b5c] to-[#38bdf8]" },
  govpro: { icon: Gavel, gradient: "from-[#3f2d13] to-[#f59e0b]" },
};

const NEWS_MODULES = new Set(["chatgov", "govsocial", "diario"]);

interface ModuleCardProps {
  slug: string;
  name: string;
  description?: string | null;
  version: string;
  is_active: boolean;
  authorized?: boolean;
  requires_review?: boolean;
  opening?: boolean;
  disabled?: boolean;
  onOpen?: () => void;
  footer?: React.ReactNode;
}

export function moduleVisual(slug: string) {
  return MODULE_VISUALS[slug] ?? { icon: LayoutGrid, gradient: "from-[#001631] to-[#5392ef]" };
}

export default function ModuleCard({
  slug,
  name,
  description,
  version,
  is_active,
  authorized = true,
  requires_review = false,
  opening = false,
  disabled = false,
  onOpen,
  footer,
}: ModuleCardProps) {
  const visual = moduleVisual(slug);
  const Icon = visual.icon;
  const blocked = disabled || !is_active || !authorized;
  const hasNews = NEWS_MODULES.has(slug);
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => !blocked && onOpen?.()}
      disabled={blocked}
      className={`group text-left bg-surface-container-lowest rounded-xl border border-outline-variant overflow-hidden shadow-sm transition-all duration-200 flex flex-col h-full ${
        blocked ? "opacity-60 cursor-not-allowed" : "hover:shadow-lg hover:-translate-y-0.5 cursor-pointer"
      }`}
    >
      {/* Faixa colorida */}
      <div className={`relative h-24 bg-gradient-to-br ${visual.gradient}`}>
        <div
          className="absolute inset-0 opacity-10"
          style={{ backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)", backgroundSize: "22px 22px" }}
        />
        <div className="absolute -bottom-5 left-5 h-12 w-12 rounded-xl bg-surface-container-lowest border border-outline-variant shadow-sm flex items-center justify-center">
          <span className={`h-9 w-9 rounded-lg bg-gradient-to-br ${visual.gradient} flex items-center justify-center`}>
            <Icon size={18} className="text-white" />
          </span>
        </div>
        {requires_review && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-100 backdrop-blur-sm">
            <AlertTriangle size={10} /> Em revisão
          </span>
        )}
        {hasNews && !requires_review && (
          <span
            role="link"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/novidades/${slug}`);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.stopPropagation();
                router.push(`/novidades/${slug}`);
              }
            }}
            className="absolute right-3 top-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25 transition-colors backdrop-blur-sm"
          >
            <Sparkles size={10} /> Novidades
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5 pt-8">
        <div className="mb-2 flex items-start justify-between gap-2">
          <h3 className="text-base font-bold text-on-surface leading-snug">{name}</h3>
          <span className="shrink-0 rounded-lg bg-surface-container px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
            v{version}
          </span>
        </div>

        <p className="flex-1 text-sm text-on-surface-variant leading-relaxed line-clamp-3">
          {description || "Módulo do sistema de gestão."}
        </p>

        <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-4">
          {footer ?? (
            opening ? (
              <span className="flex items-center gap-2 text-sm font-bold text-primary-700">
                <Loader2 size={16} className="animate-spin" /> Abrindo...
              </span>
            ) : blocked ? (
              <span className="flex items-center gap-2 text-sm font-semibold text-on-surface-variant">
                <Lock size={15} /> {!authorized ? "Sem acesso liberado" : "Indisponível"}
              </span>
            ) : (
              <>
                <span className="text-sm font-bold text-primary-700 group-hover:underline">Acessar módulo</span>
                <ArrowRight size={18} className="text-primary-700 transition-transform group-hover:translate-x-1" />
              </>
            )
          )}
        </div>
      </div>
    </button>
  );
}
