"use client";

import clsx from "clsx";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  ChevronDown,
  CornerUpLeft,
  Download,
  FileText,
  Files,
  History,
  Image as ImageIcon,
  Info,
  MessageSquarePlus,
  Paperclip,
  Pencil,
  Ruler,
  Send,
  Trash2,
  UserPlus,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

import { CardConquista } from "@/components/CardConquista";
import { CampoMoeda } from "@/components/CampoMoeda";
import { EditorDetalhes } from "@/components/EditorDetalhes";
import { Markdown } from "@/components/Markdown";
import {
  EtiquetaPrazo,
  EtiquetaSaude,
  EtiquetaSetor,
  EtiquetaSituacao,
  EtiquetaTipo,
} from "@/components/Etiquetas";
import {
  api,
  type Anexo,
  type Encaminhamento,
  type Eu,
  type Pedido,
  type ProximaAcao,
  type UsuarioResumo,
} from "@/lib/api";
import {
  ROTULO_ENCAMINHAMENTO,
  ROTULO_ORIGEM,
  ROTULO_PRIORIDADE,
  data,
  dataHora,
  moeda,
  tamanho,
} from "@/lib/formato";
import { useNomeSetor, useSetores } from "@/lib/setores";

export type Aba = "tramitacao" | "documentos" | "medicoes" | "historico" | "dados";


// ── Abas ─────────────────────────────────────────────────────────────────

export function Abas({
  aba,
  setAba,
  pedido,
  vistoEm,
}: {
  aba: Aba;
  setAba: (a: Aba) => void;
  pedido: Pedido;
  /** Última visita deste usuário ao pedido: o que veio depois ganha "novo". */
  vistoEm?: string | null;
}) {
  const novo = (iso: string) => Boolean(vistoEm && iso > vistoEm);
  const novos: Partial<Record<Aba, number>> = {
    documentos: pedido.anexos.filter((a) => novo(a.created_at)).length,
    tramitacao: pedido.andamentos.filter((a) => a.encaminhamento_id && novo(a.created_at)).length,
    historico: pedido.andamentos.filter((a) => novo(a.created_at)).length,
  };
  const itens: { chave: Aba; rotulo: string; icone: typeof Files; contagem?: number }[] = [
    { chave: "tramitacao", rotulo: "Tramitação", icone: Send },
    { chave: "documentos", rotulo: "Documentos", icone: Files, contagem: pedido.anexos.length },
  ];
  if (pedido.tipo === "OBRA") {
    itens.push({ chave: "medicoes", rotulo: "Medições", icone: Ruler, contagem: pedido.medicoes.length });
  }
  itens.push(
    { chave: "historico", rotulo: "Histórico", icone: History, contagem: pedido.andamentos.length },
    { chave: "dados", rotulo: "Dados", icone: Info }
  );

  return (
    <div className="rolagem-fina flex items-center gap-2 overflow-x-auto border-b border-line" role="tablist" aria-label="Seções do pedido">
      {itens.map(({ chave, rotulo, icone: Icone, contagem }) => {
        const ativo = aba === chave;
        return (
          <button
            key={chave}
            id={`aba-${chave}`}
            role="tab"
            aria-selected={ativo}
            aria-controls="painel-pedido"
            onClick={() => setAba(chave)}
            className={clsx(
              "relative inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm transition-colors",
              ativo
                ? "border-brand font-bold text-brand"
                : "border-transparent text-ink-muted hover:border-line-strong hover:text-ink"
            )}
          >
            <Icone size={17} aria-hidden />
            {rotulo}
            {contagem !== undefined && contagem > 0 && (
              <span
                className={clsx(
                  "rounded-pill px-1.5 text-xs",
                  ativo ? "bg-brand-50 text-brand" : "bg-ink/[.06] text-ink-muted"
                )}
              >
                {contagem}
              </span>
            )}
            {!ativo && (novos[chave] ?? 0) > 0 && (
              <span className="rounded-pill bg-estado-atrasado px-1.5 text-[10px] font-semibold text-white">
                {novos[chave]} novo{(novos[chave] ?? 0) > 1 ? "s" : ""}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

