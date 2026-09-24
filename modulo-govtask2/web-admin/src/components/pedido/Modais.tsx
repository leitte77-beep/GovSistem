"use client";

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
import { createPortal } from "react-dom";
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

type Aba = "tramitacao" | "documentos" | "medicoes" | "historico" | "dados";


// ── Modais ───────────────────────────────────────────────────────────────

export function BaseModal({
  titulo,
  children,
  aoFechar,
  aoConfirmar,
  confirmar,
  ocupado,
  desabilitado,
  subtitulo,
  rodape,
  largo,
}: {
  titulo: string;
  children: React.ReactNode;
  aoFechar: () => void;
  aoConfirmar: () => void;
  confirmar: string;
  ocupado?: boolean;
  desabilitado?: boolean;
  /** Linha discreta abaixo do título (ex.: o pedido em questão). */
  subtitulo?: string;
  /** Conteúdo à esquerda do rodapé (ex.: resumo do que vai acontecer). */
  rodape?: React.ReactNode;
  /** Modal mais largo; no celular ocupa a tela inteira. */
  largo?: boolean;
}) {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  const painelRef = useRef<HTMLDivElement>(null);
  const fecharRef = useRef(aoFechar);
  fecharRef.current = aoFechar;

  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") fecharRef.current();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflow;
    };
  }, []);

  if (!montado) return null;
  // Portal no <body>: um ancestral com transform (a animação de entrada da
  // página) prenderia o `fixed` dentro da coluna de conteúdo.
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-brand-900/50 backdrop-blur-sm"
        aria-label="Fechar"
        onClick={() => fecharRef.current()}
      />
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        className={
          largo
            ? "relative flex h-[100dvh] w-full animate-entrar-baixo flex-col overflow-hidden bg-paper shadow-pop sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-card"
            : "relative flex max-h-[92vh] w-full animate-entrar-baixo flex-col overflow-hidden rounded-t-card bg-paper shadow-pop sm:max-w-lg sm:rounded-card"
        }
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-medium text-ink">{titulo}</h2>
            {subtitulo && <p className="mt-0.5 truncate text-xs text-ink-muted">{subtitulo}</p>}
          </div>
          <button
            className="rounded p-1 text-ink-muted hover:bg-canvas"
            onClick={() => fecharRef.current()}
            aria-label="Fechar"
          >
            <X size={18} aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>
        <footer className="pb-seguro flex flex-wrap items-center justify-end gap-2 border-t border-line bg-canvas/60 px-5 pt-4 sm:pb-4">
          {rodape && <div className="mr-auto min-w-0 flex-1 basis-full sm:basis-0">{rodape}</div>}
          <button className="botao-fantasma" onClick={() => fecharRef.current()} disabled={ocupado}>
            Cancelar
          </button>
          <button
            className="botao-primario"
            onClick={aoConfirmar}
            disabled={ocupado || desabilitado}
          >
            {ocupado ? "Enviando…" : confirmar}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}

export function ModalTexto({
  titulo,
  rotulo,
  placeholder,
  confirmar,
  aoFechar,
  aoConfirmar,
  editor = false,
}: {
  titulo: string;
  rotulo: string;
  placeholder: string;
  confirmar: string;
  aoFechar: () => void;
  aoConfirmar: (texto: string) => Promise<void>;
  editor?: boolean;
}) {
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);

  return (
    <BaseModal
      titulo={titulo}
      aoFechar={aoFechar}
      aoConfirmar={async () => {
        setOcupado(true);
        try {
          await aoConfirmar(texto.trim());
          aoFechar();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Não foi possível concluir.");
          setOcupado(false);
        }
      }}
      confirmar={confirmar}
      ocupado={ocupado}
      desabilitado={texto.trim().length < 3}
    >
      <label className="rotulo" htmlFor="modal-texto">
        {rotulo}
      </label>
      {editor ? (
        <EditorDetalhes
          id="modal-texto"
          valor={texto}
          aoMudar={setTexto}
          maxLength={8000}
          placeholder={placeholder}
        />
      ) : (
        <textarea
          id="modal-texto"
          className="campo min-h-[5rem]"
          placeholder={placeholder}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          autoFocus
        />
      )}
    </BaseModal>
  );
}

export function ModalPrazo({
  pedido,
  enc,
  aoFechar,
  aoAtualizar,
}: {
  pedido: Pedido;
  enc: Encaminhamento;
  aoFechar: () => void;
  aoAtualizar: (p: Pedido) => void;
}) {
  const [prazo, setPrazo] = useState(enc.prazo ?? "");
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);

  return (
    <BaseModal
      titulo="Alterar prazo"
      aoFechar={aoFechar}
      aoConfirmar={async () => {
        setOcupado(true);
        try {
          aoAtualizar(await api.negociarPrazo(pedido.id, enc.id, prazo, motivo || undefined));
          toast.success("Prazo alterado. O Assessor foi avisado.");
          aoFechar();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Erro ao alterar prazo.");
          setOcupado(false);
        }
      }}
      confirmar="Salvar prazo"
      ocupado={ocupado}
      desabilitado={!prazo}
    >
      <div>
        <label className="rotulo" htmlFor="prazo-novo">
          Novo prazo
        </label>
        <input
          id="prazo-novo"
          type="date"
          className="campo"
          value={prazo}
          onChange={(e) => setPrazo(e.target.value)}
        />
      </div>
      <div>
        <label className="rotulo" htmlFor="prazo-motivo">
          Motivo (opcional)
        </label>
        <textarea
          id="prazo-motivo"
          className="campo min-h-[3.5rem]"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
      </div>
    </BaseModal>
  );
}

export function ModalPessoa({
  titulo,
  rotulo,
  usuarios,
  aoFechar,
  aoConfirmar,
}: {
  titulo: string;
  rotulo: string;
  pedido: Pedido;
  usuarios: UsuarioResumo[];
  aoFechar: () => void;
  aoConfirmar: (usuarioId: string) => Promise<void>;
}) {
  const [usuarioId, setUsuarioId] = useState("");
  const [ocupado, setOcupado] = useState(false);

  return (
    <BaseModal
      titulo={titulo}
      aoFechar={aoFechar}
      aoConfirmar={async () => {
        setOcupado(true);
        try {
          await aoConfirmar(usuarioId);
          aoFechar();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Não foi possível concluir.");
          setOcupado(false);
        }
      }}
      confirmar="Confirmar"
      ocupado={ocupado}
      desabilitado={!usuarioId}
    >
      <label className="rotulo" htmlFor="pessoa-sel">
        {rotulo}
      </label>
      <select
        id="pessoa-sel"
        className="campo"
        value={usuarioId}
        onChange={(e) => setUsuarioId(e.target.value)}
      >
        <option value="">Escolha…</option>
        {usuarios.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      {usuarios.length === 0 && (
        <p className="legenda">Ninguém disponível neste setor.</p>
      )}
    </BaseModal>
  );
}


