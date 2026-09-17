"use client";

/**
 * Busca global (§48, §131).
 *
 * A pesquisa acontece **no servidor**: full-text sobre demandas, tarefas,
 * protocolos, autoridades e comentários, já dentro do escopo de visibilidade de
 * quem pesquisa. A versão anterior desta tela baixava 200 tarefas e os
 * relatórios inteiros para filtrar no navegador — não achava o que estava além
 * do limite e não respeitava sigilo.
 *
 * Os processos da v1 (convênios) continuam aparecendo enquanto a transição
 * durar, por uma consulta própria.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusPill } from "@/components/ui/StatusPill";
import { notify } from "@/components/ui/Toast";
import { formatCurrency, formatDate, CATEGORIA_RECURSO_LABELS, ESFERA_LABELS } from "@/lib/utils";
import type { BuscaGlobal, ConvenioListItem } from "@/types/govtask";
import { Search, FileText, CheckSquare, Landmark, MessageSquare, Stamp, X } from "lucide-react";

const VAZIO: BuscaGlobal = {
  termo: "", demandas: [], tarefas: [], protocolos: [], autoridades: [], comentarios: [],
};

export default function BuscaPage() {
  const [q, setQ] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [buscou, setBuscou] = useState(false);
  const [resultado, setResultado] = useState<BuscaGlobal>(VAZIO);
  const [convenios, setConvenios] = useState<ConvenioListItem[]>([]);

  const limpar = () => { setResultado(VAZIO); setConvenios([]); };

  const buscar = useCallback(async (termo: string) => {
    const t = termo.trim();
    if (t.length < 2) { limpar(); setBuscou(true); return; }
    setBuscando(true);
    try {
      const [global, v1] = await Promise.all([
        api.buscaGlobal(t, 20),
        // Processos da v1 seguem no ar durante a transição.
        api.listConvenios({ search: t, limit: 20 }).catch(() => [] as ConvenioListItem[]),
      ]);
      setResultado(global);
      setConvenios(v1);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível pesquisar");
    } finally {
      setBuscando(false);
      setBuscou(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const inicial = new URLSearchParams(window.location.search).get("q");
    if (inicial) { setQ(inicial); buscar(inicial); }
  }, [buscar]);

  const total =
    resultado.demandas.length + resultado.tarefas.length + resultado.protocolos.length +
    resultado.autoridades.length + resultado.comentarios.length + convenios.length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pesquisa"
        title="Busca global"
        description="Demandas, tarefas, protocolos, autoridades, comentários e processos."
        breadcrumbs={[{ label: "Busca global" }]}
      />

      <form onSubmit={(e) => { e.preventDefault(); buscar(q); }} className="max-w-2xl">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-subtle" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Número, título, objeto, protocolo, parlamentar, órgão…"
            className="w-full rounded-btn border border-surface-border bg-white py-2.5 pl-11 pr-10 text-body-sm text-text-title placeholder:text-text-subtle focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
          />
          {q && (
            <button type="button" onClick={() => { setQ(""); limpar(); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-subtle hover:text-text-body">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="mt-2 text-meta text-text-subtle">
          Aceita a sintaxe de buscador: <code>ambulância -usada</code>, <code>emenda OR convênio</code>.
        </p>
      </form>

      {buscando ? (
        <div className="space-y-4"><Skeleton variant="card" className="h-24" /><Skeleton variant="card" className="h-48" /></div>
      ) : !buscou ? (
        <p className="text-body-sm text-text-subtle">Digite ao menos dois caracteres para pesquisar.</p>
      ) : total === 0 ? (
        <Card padding="p-8">
          <EmptyState icon="search" title="Nenhum resultado" description={`Nada encontrado para "${q}".`} />
        </Card>
      ) : (
        <div className="space-y-6">
          <p className="text-body-sm text-text-body">
            <strong className="text-text-title">{total}</strong> resultado(s) para “
            <strong className="text-text-title">{q}</strong>”
          </p>

          <Secao titulo="Demandas" icone={<FileText className="h-5 w-5 text-[#1D4ED8]" />} quantidade={resultado.demandas.length}>
            {resultado.demandas.map((d) => (
              <Linha key={d.id} href={`/demandas/${d.id}`} titulo={d.titulo} detalhe={
                <>
                  <span className="font-mono">{d.numero}</span>
                  {d.prazo_final && <span>prazo {formatDate(d.prazo_final)}</span>}
                  <span>{d.prioridade}</span>
                  {d.atrasada && <span className="font-bold text-red-700">ATRASADA</span>}
                </>
              } direita={d.status ? <StatusPill status={d.status} /> : null} />
            ))}
          </Secao>

          <Secao titulo="Tarefas" icone={<CheckSquare className="h-5 w-5 text-[#1D4ED8]" />} quantidade={resultado.tarefas.length}>
            {resultado.tarefas.map((t) => (
              <Linha
                key={t.id}
                href={t.demanda_id ? `/demandas/${t.demanda_id}` : `/tarefas/${t.id}`}
                titulo={t.titulo}
                direita={<StatusPill status={t.status} />}
              />
            ))}
          </Secao>

          <Secao titulo="Protocolos" icone={<Stamp className="h-5 w-5 text-[#1D4ED8]" />} quantidade={resultado.protocolos.length}>
            {resultado.protocolos.map((p) => (
              <Linha
                key={p.id}
                href={`/demandas/${p.demanda_id}`}
                titulo={`${p.sistema} nº ${p.numero}`}
                direita={<StatusPill status={p.situacao} />}
              />
            ))}
          </Secao>

          <Secao titulo="Autoridades" icone={<Landmark className="h-5 w-5 text-[#1D4ED8]" />} quantidade={resultado.autoridades.length}>
            {resultado.autoridades.map((a) => (
              <Linha
                key={a.id}
                href={`/autoridades/${a.id}`}
                titulo={a.nome}
                detalhe={<>{a.cargo && <span>{a.cargo}</span>}{a.instituicao && <span>{a.instituicao}</span>}</>}
              />
            ))}
          </Secao>

          <Secao titulo="Comentários" icone={<MessageSquare className="h-5 w-5 text-[#1D4ED8]" />} quantidade={resultado.comentarios.length}>
            {resultado.comentarios.map((c) => (
              <Linha
                key={c.id}
                href={`/demandas/${c.demanda_id}`}
                titulo={c.trecho}
                detalhe={<span>{formatDate(c.criado_em)}</span>}
              />
            ))}
          </Secao>

          <Secao titulo="Processos (versão anterior)" icone={<FileText className="h-5 w-5 text-text-subtle" />} quantidade={convenios.length}>
            {convenios.map((c) => (
              <Linha
                key={c.id}
                href={`/convenios/${c.id}`}
                titulo={c.titulo}
                detalhe={
                  <>
                    {c.categoria && <span>{CATEGORIA_RECURSO_LABELS[c.categoria] || c.categoria}</span>}
                    {c.esfera && <span>{ESFERA_LABELS[c.esfera] || c.esfera}</span>}
                    {c.parlamentar && <span>{c.parlamentar}</span>}
                    <span className="tabular-nums">{formatCurrency(c.valor)}</span>
                  </>
                }
                direita={<StatusPill status={c.status} />}
              />
            ))}
          </Secao>
        </div>
      )}
    </div>
  );
}

function Secao({ titulo, icone, quantidade, children }: {
  titulo: string; icone: React.ReactNode; quantidade: number; children: React.ReactNode;
}) {
  if (!quantidade) return null;
  return (
    <Card padding="p-5">
      <div className="mb-4 flex items-center gap-2">
        {icone}
        <h3 className="text-h3 text-text-title">{titulo} ({quantidade})</h3>
      </div>
      <div className="space-y-2">{children}</div>
    </Card>
  );
}

function Linha({ href, titulo, detalhe, direita }: {
  href: string; titulo: string; detalhe?: React.ReactNode; direita?: React.ReactNode;
}) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 rounded-btn border border-surface-border p-3 transition-colors hover:bg-[#F6F7F9]">
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-sm font-medium text-text-title">{titulo}</p>
        {detalhe && <div className="mt-1 flex flex-wrap items-center gap-2 text-meta text-text-subtle">{detalhe}</div>}
      </div>
      {direita}
    </Link>
  );
}
