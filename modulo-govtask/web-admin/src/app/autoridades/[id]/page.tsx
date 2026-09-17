"use client";

/**
 * Histórico de uma autoridade (§148).
 *
 * Informação administrativa: quais demandas se relacionam a ela e quanto foi
 * indicado, aprovado e efetivamente pago. Sem ranking e sem comparação entre
 * autoridades — isso seria transformar um cadastro de contato em propaganda.
 *
 * Os totais já chegam filtrados pelo servidor: demanda sigilosa que o usuário
 * não pode abrir também não entra na soma.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Phone, Mail, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Autoridade, HistoricoAutoridade } from "@/types/govtask";

export default function AutoridadeDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const [autoridade, setAutoridade] = useState<Autoridade>();
  const [historico, setHistorico] = useState<HistoricoAutoridade>();
  const [erro, setErro] = useState("");

  useEffect(() => {
    Promise.all([api.getAutoridade(id), api.historicoAutoridade(id)])
      .then(([a, h]) => { setAutoridade(a); setHistorico(h); })
      .catch((e) => setErro(e instanceof Error ? e.message : "Não foi possível carregar"));
  }, [id]);

  if (erro) return <div className="rounded-xl bg-red-50 p-5 text-red-800">{erro}</div>;
  if (!autoridade || !historico) {
    return <div className="space-y-4 animate-pulse"><div className="h-32 rounded-2xl bg-slate-200" /><div className="h-64 rounded-xl bg-slate-200" /></div>;
  }

  const valores: [string, number][] = [
    ["Indicado", historico.valor_indicado],
    ["Aprovado", historico.valor_aprovado],
    ["Contratado", historico.valor_contratado],
    ["Pago", historico.valor_pago],
  ];

  return (
    <div className="max-w-6xl space-y-6">
      <Link href="/autoridades" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-blue-700">
        <ArrowLeft className="h-4 w-4" />Voltar para autoridades
      </Link>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{autoridade.nome}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {[autoridade.cargo, autoridade.partido, autoridade.instituicao].filter(Boolean).join(" · ") || "Sem cargo informado"}
        </p>
        <div className="mt-4 flex flex-wrap gap-5 text-sm text-slate-600">
          {autoridade.telefone && <span className="inline-flex items-center gap-1.5"><Phone className="h-4 w-4 text-slate-400" />{autoridade.telefone}</span>}
          {autoridade.email && <span className="inline-flex items-center gap-1.5"><Mail className="h-4 w-4 text-slate-400" />{autoridade.email}</span>}
          {autoridade.assessor_nome && (
            <span className="inline-flex items-center gap-1.5">
              <UserRound className="h-4 w-4 text-slate-400" />
              {autoridade.assessor_nome}{autoridade.assessor_telefone ? ` · ${autoridade.assessor_telefone}` : ""}
            </span>
          )}
        </div>
        {autoridade.contatos.length > 0 && (
          <ul className="mt-4 space-y-1 border-t border-slate-100 pt-4 text-sm text-slate-600">
            {autoridade.contatos.map((c) => (
              <li key={c.id}>
                <span className="font-medium text-slate-800">{c.nome}</span>
                {c.funcao ? ` — ${c.funcao}` : ""}{c.telefone ? ` · ${c.telefone}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <Numero rotulo="Demandas relacionadas" valor={String(historico.total_demandas)} />
        <Numero rotulo="Em andamento" valor={String(historico.em_andamento)} />
        <Numero rotulo="Concluídas" valor={String(historico.concluidas)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {valores.map(([rotulo, valor]) => (
          <div key={rotulo} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">{rotulo}</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{formatCurrency(valor)}</p>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-100 p-5 font-bold text-slate-900">Demandas relacionadas</h2>
        {historico.demandas.length ? (
          <ul className="divide-y divide-slate-100">
            {historico.demandas.map((d) => (
              <li key={d.id}>
                <Link href={`/demandas/${d.id}`} className="flex items-center justify-between gap-4 p-5 hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-slate-500">{d.numero}</p>
                    <p className="mt-0.5 truncate font-medium text-slate-800">{d.titulo}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-semibold text-slate-700">{d.situacao || "Em aberto"}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {d.concluida_em ? `concluída em ${formatDate(d.concluida_em)}` : formatCurrency(d.valor_aprovado)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-10 text-center text-sm text-slate-500">
            Nenhuma demanda visível a você está vinculada a esta autoridade.
          </p>
        )}
      </section>
    </div>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs text-slate-500">{rotulo}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{valor}</p>
    </div>
  );
}
