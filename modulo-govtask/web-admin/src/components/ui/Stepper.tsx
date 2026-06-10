"use client";

import { Check, Lock, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

type StepperStep = {
  nome: string;
  status: string;
  onClick?: () => void;
};

type StepperProps = {
  steps: StepperStep[];
  currentIndex?: number;
  className?: string;
};

const STEP_COLORS: Record<string, { dot: string; line: string; label: string }> = {
  CONCLUIDA: {
    dot: "bg-[#067647] border-[#067647] text-white",
    line: "bg-[#067647]",
    label: "text-[#067647]",
  },
  EM_ANDAMENTO: {
    dot: "bg-[#1D4ED8] border-[#1D4ED8] text-white",
    line: "bg-[#1D4ED8]",
    label: "text-[#1D4ED8]",
  },
  PENDENTE: {
    dot: "bg-transparent border-[#98A2B3] text-[#98A2B3]",
    line: "bg-[#E4E7EC]",
    label: "text-[#98A2B3]",
  },
  AGUARDANDO_GOVERNO: {
    dot: "bg-[#B54708] border-[#B54708] text-white",
    line: "bg-[#B54708]",
    label: "text-[#B54708]",
  },
  BLOQUEADA: {
    dot: "bg-[#B42318] border-[#B42318] text-white",
    line: "bg-[#B42318]",
    label: "text-[#B42318]",
  },
};

export function Stepper({ steps, currentIndex, className }: StepperProps) {
  if (!steps.length) return null;

  return (
    <div className={cn("flex items-start", className)}>
      {steps.map((step, i) => {
        const colors = STEP_COLORS[step.status] || STEP_COLORS.PENDENTE;
        const isLast = i === steps.length - 1;

        return (
          <div key={i} className="flex-1 flex flex-col items-center">
            <div className="flex items-center w-full">
              <div className="flex flex-col items-center shrink-0">
                <button
                  type="button"
                  onClick={step.onClick}
                  disabled={!step.onClick}
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors",
                    colors.dot,
                    step.onClick && "cursor-pointer hover:ring-2 hover:ring-offset-1"
                  )}
                >
                  {step.status === "CONCLUIDA" ? (
                    <Check className="w-4 h-4" />
                  ) : step.status === "BLOQUEADA" ? (
                    <Lock className="w-3.5 h-3.5" />
                  ) : step.status === "PENDENTE" ? (
                    <Circle className="w-2.5 h-2.5 fill-current" />
                  ) : (
                    <Circle className="w-2.5 h-2.5 fill-current" />
                  )}
                </button>
              </div>

              {!isLast && (
                <div className={cn("flex-1 h-0.5 mx-1", colors.line)} />
              )}
            </div>

            <span
              className={cn(
                "text-meta mt-1.5 text-center px-1 max-w-[120px] truncate",
                colors.label,
                step.status === "EM_ANDAMENTO" && "font-medium"
              )}
              title={step.nome}
            >
              {step.nome}
            </span>
          </div>
        );
      })}
    </div>
  );
}
