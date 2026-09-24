"use client";

/**
 * Dados: a ficha completa do pedido, editável no próprio campo.
 *
 *   Origem       quem trouxe, partido, emenda — e o que mais esse parlamentar trouxe
 *   Objeto       o que é, onde fica (com mapa), prioridade
 *   Protocolo    número, órgão, sistema, data e o que o governo respondeu
 *   Financeiro   previsto → empenhado → liberado → pago
 *   Tempo        onde o tempo do pedido foi gasto
 *   Pessoas      quem participou
 *
 * Cada alteração vai para o histórico com o antes e o depois.
 */

import clsx from "clsx";
import {
  Building2,
  Check,
  Clock,
  Crosshair,
  ExternalLink,
  FileText,
  Landmark,
  MapPin,
  Pencil,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import toast from "react-hot-toast";

import { CampoMoeda } from "@/components/CampoMoeda";
import { EditorDetalhes } from "@/components/EditorDetalhes";
import { Markdown } from "@/components/Markdown";
import { api, type Eu, type Pedido } from "@/lib/api";
import { ROTULO_ORIGEM, ROTULO_PRIORIDADE, data, dataHora, duracao, moeda } from "@/lib/formato";
import { useNomeSetor } from "@/lib/setores";

type Tipo = "texto" | "moeda" | "data" | "select" | "longo";

export function AbaDados({
  pedido,
  eu,
  aoAtualizar,
}: {
  pedido: Pedido;
  eu: Eu | null;
  aoAtualizar: (p: Pedido) => void;
}) {
  const encerrado = pedido.situacao === "CONCLUIDO" || pedido.situacao === "CANCELADO";
  const pode = Boolean(eu?.pode_encaminhar) && !encerrado;
  const campo = (props: Omit<PropsCampo, "pedido" | "pode" | "aoAtualizar">) => (
    <Campo pedido={pedido} pode={pode} aoAtualizar={aoAtualizar} {...props} />
  );
  const parlamentar = ["DEPUTADO", "VEREADOR"].includes(pedido.origem);

  return (
    <section className="grid gap-5 pb-24 lg:grid-cols-2">
      <Bloco titulo="Origem" icone={Landmark}>
        {campo({ nome: "origem", rotulo: "Origem", tipo: "select", opcoes: ROTULO_ORIGEM, valor: pedido.origem })}
        {campo({ nome: "origem_nome", rotulo: parlamentar ? "Parlamentar" : "Quem conseguiu", valor: pedido.origem_nome })}
        {parlamentar && campo({ nome: "partido", rotulo: "Partido", valor: pedido.partido })}
        {campo({ nome: "emenda", rotulo: "Emenda", valor: pedido.emenda })}
        {pedido.origem_nome && (
          <Link
            href={`/pedidos?parlamentar=${encodeURIComponent(pedido.origem_nome)}`}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
          >
            Outros pedidos de {pedido.origem_nome} <ExternalLink size={11} />
          </Link>
        )}
      </Bloco>

      <Bloco titulo="Objeto" icone={FileText}>
        {campo({ nome: "titulo", rotulo: "Título", valor: pedido.titulo })}
        {campo({ nome: "prioridade", rotulo: "Prioridade", tipo: "select", opcoes: ROTULO_PRIORIDADE, valor: pedido.prioridade })}
        {campo({ nome: "descricao", rotulo: "Descrição", tipo: "longo", valor: pedido.descricao })}
        {campo({ nome: "endereco", rotulo: "Endereço", valor: pedido.endereco })}
        <Mapa pedido={pedido} pode={pode} aoAtualizar={aoAtualizar} />
      </Bloco>

      <Bloco titulo="Protocolo no governo" icone={Building2}>
        {campo({ nome: "protocolo_externo", rotulo: "Número", valor: pedido.protocolo_externo })}
        {campo({ nome: "protocolo_orgao", rotulo: "Órgão", valor: pedido.protocolo_orgao })}
        {campo({ nome: "protocolo_sistema", rotulo: "Sistema", valor: pedido.protocolo_sistema })}
        {campo({ nome: "protocolo_data", rotulo: "Protocolado em", tipo: "data", valor: pedido.protocolo_data })}
        {campo({ nome: "protocolo_situacao", rotulo: "Última resposta do governo", valor: pedido.protocolo_situacao })}
      </Bloco>

      <Financeiro pedido={pedido} campo={campo} />

      <Tempo pedido={pedido} />

      <Bloco titulo="Pessoas" icone={Users}>
        <Linha rotulo="Aberto por" valor={pedido.criado_por?.name ?? "—"} />
        <Linha rotulo="Aberto em" valor={dataHora(pedido.created_at)} />
        {pedido.concluido_em && <Linha rotulo="Concluído em" valor={dataHora(pedido.concluido_em)} />}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(pedido.indicadores?.pessoas ?? []).map((n) => (
            <span key={n} className="etiqueta bg-ink/[.05] text-ink-soft">
              {n}
            </span>
          ))}
        </div>
      </Bloco>
    </section>
  );
}

function Bloco({ titulo, icone: Icone, children }: { titulo: string; icone: LucideIcon; children: React.ReactNode }) {
  return (
    <section className="cartao p-5">
      <h2 className="mb-3 flex items-center gap-2 font-display text-[17px] font-medium text-ink">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 text-brand">
          <Icone size={16} />
        </span>
        {titulo}
      </h2>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-sm">
      <span className="text-ink-muted">{rotulo}</span>
      <span className="text-right font-medium text-ink">{valor}</span>
    </div>
  );
}

// ── Campo editável no lugar ─────────────────────────────────────────────

interface PropsCampo {
  pedido: Pedido;
  pode: boolean;
  aoAtualizar: (p: Pedido) => void;
  nome: string;
  rotulo: string;
  valor: string | null | undefined;
  tipo?: Tipo;
  opcoes?: Record<string, string>;
}

function Campo({ pedido, pode, aoAtualizar, nome, rotulo, valor, tipo = "texto", opcoes }: PropsCampo) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(valor ?? "");
  const [salvando, setSalvando] = useState(false);

  const exibido =
    tipo === "moeda"
      ? valor
        ? moeda(valor)
        : "—"
      : tipo === "data"
        ? data(valor)
        : tipo === "select"
          ? opcoes?.[valor ?? ""] ?? valor ?? "—"
          : valor || "—";

  async function salvar() {
    setSalvando(true);
    try {
      const v = rascunho.trim();
      aoAtualizar(await api.editar(pedido.id, { [nome]: v === "" ? null : v }));
      setEditando(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  if (!editando) {
    return (
      <div
        className={clsx(
          "group -mx-2 rounded-btn px-2 py-1.5",
          tipo !== "longo" && "flex items-start justify-between gap-3",
          pode && "hover:bg-canvas"
        )}
      >
        <span className="shrink-0 text-sm text-ink-muted">{rotulo}</span>
        <span className={clsx("flex min-w-0 items-start gap-1.5", tipo === "longo" ? "mt-1" : "justify-end text-right")}>
          {tipo === "longo" && valor ? (
            <Markdown texto={valor} className="space-y-1.5 text-sm text-ink-soft" />
          ) : (
            <span className={clsx("text-sm", valor ? "font-medium text-ink" : "text-ink-faint")}>{exibido}</span>
          )}
          {pode && (
            <button
              onClick={() => {
                setRascunho(valor ?? "");
                setEditando(true);
              }}
              className="shrink-0 rounded p-0.5 text-ink-faint opacity-60 hover:text-brand group-hover:opacity-100"
              aria-label={`Editar ${rotulo}`}
            >
              <Pencil size={13} />
            </button>
          )}
        </span>
      </div>
    );
  }

  return (
    <div className="-mx-2 rounded-btn bg-brand-50/50 px-2 py-2">
      <p className="mb-1 text-xs font-medium text-ink-muted">{rotulo}</p>
      {tipo === "select" ? (
        <select className="campo" value={rascunho} onChange={(e) => setRascunho(e.target.value)} autoFocus>
          {Object.entries(opcoes ?? {}).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      ) : tipo === "moeda" ? (
        <CampoMoeda valor={rascunho} aoMudar={setRascunho} autoFocus />
      ) : tipo === "data" ? (
        <input type="date" className="campo" value={rascunho.slice(0, 10)} onChange={(e) => setRascunho(e.target.value)} autoFocus />
      ) : tipo === "longo" ? (
        <EditorDetalhes id={`campo-${nome}`} valor={rascunho} aoMudar={setRascunho} maxLength={8000} />
      ) : (
        <input
          className="campo"
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") salvar();
            if (e.key === "Escape") setEditando(false);
          }}
          autoFocus
        />
      )}
      <div className="mt-2 flex justify-end gap-1.5">
        <button className="botao-fantasma px-2.5 py-1 text-xs" onClick={() => setEditando(false)} disabled={salvando}>
          <X size={13} /> Cancelar
        </button>
        <button className="botao-primario px-2.5 py-1 text-xs" onClick={salvar} disabled={salvando}>
          <Check size={13} /> {salvando ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </div>
  );
}

// ── Mapa ────────────────────────────────────────────────────────────────

function Mapa({ pedido, pode, aoAtualizar }: { pedido: Pedido; pode: boolean; aoAtualizar: (p: Pedido) => void }) {
  const lat = pedido.latitude ? Number(pedido.latitude) : null;
  const lng = pedido.longitude ? Number(pedido.longitude) : null;
  const [buscando, setBuscando] = useState(false);

  function usarLocalizacao() {
    if (!navigator.geolocation) {
      toast.error("Este aparelho não informa a localização.");
      return;
    }
    setBuscando(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          aoAtualizar(
            await api.editar(pedido.id, {
              latitude: pos.coords.latitude.toFixed(6),
              longitude: pos.coords.longitude.toFixed(6),
            })
          );
          toast.success("Local registrado.");
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBuscando(false);
        }
      },
      () => {
        setBuscando(false);
        toast.error("Não foi possível obter a localização.");
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  if (lat === null || lng === null) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-btn border border-dashed border-line px-3 py-3 text-sm text-ink-muted">
        <MapPin size={15} />
        {pedido.endereco ? (
          <a
            className="text-brand hover:underline"
            target="_blank"
            rel="noreferrer"
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pedido.endereco)}`}
          >
            Ver endereço no mapa
          </a>
        ) : (
          "Sem localização"
        )}
        {pode && (
          <button onClick={usarLocalizacao} disabled={buscando} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
            <Crosshair size={13} /> {buscando ? "Localizando…" : "Usar minha localização (no local)"}
          </button>
        )}
      </div>
    );
  }
  const d = 0.004;
  return (
    <div className="mt-2 overflow-hidden rounded-btn border border-line">
      <iframe
        title="Localização"
        className="h-48 w-full border-0"
        loading="lazy"
        src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng - d},${lat - d},${lng + d},${lat + d}&layer=mapnik&marker=${lat},${lng}`}
      />
      <div className="flex items-center justify-between px-3 py-2 text-xs">
        <span className="text-ink-faint">
          {lat.toFixed(5)}, {lng.toFixed(5)}
        </span>
        <a className="font-medium text-brand hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${lat},${lng}`}>
          Abrir no Google Maps
        </a>
      </div>
    </div>
  );
}

// ── Financeiro ──────────────────────────────────────────────────────────

function Financeiro({
  pedido,
  campo,
}: {
  pedido: Pedido;
  campo: (p: Omit<PropsCampo, "pedido" | "pode" | "aoAtualizar">) => React.ReactNode;
}) {
  const etapas = [
    { nome: "valor_previsto", rotulo: "Previsto", valor: pedido.valor_previsto, cor: "bg-ink/20" },
    { nome: "valor_empenhado", rotulo: "Empenhado", valor: pedido.valor_empenhado, cor: "bg-brass" },
    { nome: "valor_liberado", rotulo: "Liberado", valor: pedido.valor_liberado, cor: "bg-brand" },
    { nome: "valor_pago", rotulo: "Pago", valor: pedido.valor_pago, cor: "bg-estado-concluido" },
  ];
  const base = Number(pedido.valor_previsto || 0) || Math.max(...etapas.map((e) => Number(e.valor || 0)), 1);
  return (
    <Bloco titulo="Financeiro" icone={Wallet}>
      <div className="mb-3 space-y-2">
        {etapas.map((e) => {
          const v = Number(e.valor || 0);
          return (
            <div key={e.nome} className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-xs text-ink-muted">{e.rotulo}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-pill bg-ink/[.05]">
                <div className={clsx("h-full rounded-pill transition-[width] duration-700", e.cor)} style={{ width: `${Math.min(100, (v / base) * 100)}%` }} />
              </div>
              <span className="w-10 shrink-0 text-right text-xs tabular-nums text-ink-muted">{v ? `${Math.round((v / base) * 100)}%` : "—"}</span>
            </div>
          );
        })}
      </div>
      {etapas.map((e) => (
        <div key={e.nome}>{campo({ nome: e.nome, rotulo: e.rotulo, tipo: "moeda", valor: e.valor })}</div>
      ))}
    </Bloco>
  );
}

// ── Onde o tempo foi gasto ──────────────────────────────────────────────

function Tempo({ pedido }: { pedido: Pedido }) {
  const nomeSetor = useNomeSetor();
  const ind = pedido.indicadores;
  if (!ind) return null;
  const partes = [
    { rotulo: "Com o Assessor", horas: ind.horas_com_assessor, cor: "bg-brand" },
    { rotulo: "Nos setores", horas: ind.horas_nos_setores, cor: "bg-brass" },
    { rotulo: "No governo", horas: ind.horas_aguardando_governo, cor: "bg-estado-externo" },
  ];
  const total = Math.max(ind.horas_total, 0.01);
  return (
    <Bloco titulo="Onde o tempo foi gasto" icone={Clock}>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-ink-muted">Tempo total</span>
        <span className="font-display text-2xl text-ink">{duracao(ind.horas_total)}</span>
      </div>
      <div className="my-3 flex h-3 overflow-hidden rounded-pill bg-ink/[.05]">
        {partes.map((p) => (
          <div key={p.rotulo} className={p.cor} style={{ width: `${(p.horas / total) * 100}%` }} title={`${p.rotulo}: ${duracao(p.horas)}`} />
        ))}
      </div>
      <ul className="space-y-1 text-sm">
        {partes.map((p) => (
          <li key={p.rotulo} className="flex items-center gap-2">
            <span className={clsx("h-2.5 w-2.5 rounded-full", p.cor)} />
            <span className="text-ink-muted">{p.rotulo}</span>
            <span className="ml-auto tabular-nums text-ink">{duracao(p.horas)}</span>
          </li>
        ))}
      </ul>
      {Object.keys(ind.por_setor).length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="sobretitulo mb-1.5">Por setor · {ind.idas_e_vindas} ida(s) e volta(s)</p>
          <ul className="space-y-1 text-sm">
            {Object.entries(ind.por_setor)
              .sort((a, b) => b[1] - a[1])
              .map(([setor, horas]) => (
                <li key={setor} className="flex justify-between">
                  <span className="text-ink-soft">{nomeSetor(setor)}</span>
                  <span className="tabular-nums text-ink">{duracao(horas)}</span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </Bloco>
  );
}
