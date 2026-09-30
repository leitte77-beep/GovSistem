"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { ArrowDown, ArrowUp, Info } from "lucide-react";
import { api, RelatorioCatalogo, RelatorioCatalogoDados } from "@/lib/api";

type Opcao = { id: string; nome: string };

const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v: number, casas = 2) => v.toLocaleString("pt-BR", { maximumFractionDigits: casas });

const COR_SITUACAO: Record<string, string> = {
  vencido: "bg-[#FEE4E2] text-[#B42318]",
  atrasada: "bg-[#FEE4E2] text-[#B42318]",
  esgotado: "bg-[#FEE4E2] text-[#B42318]",
  cancelado: "bg-[#FEE4E2] text-[#B42318]",
  "a vencer": "bg-[#FFF4D6] text-[#5C4200]",
  "próxima": "bg-[#FFF4D6] text-[#5C4200]",
  "atenção": "bg-[#FFF4D6] text-[#5C4200]",
  "em dia": "bg-[#E7F8EC] text-[#106D34]",
  "válida": "bg-[#E7F8EC] text-[#106D34]",
  confirmado: "bg-[#E7F8EC] text-[#106D34]",
};

function celula(tipo: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (tipo === "moeda") return reais(Number(v));
  if (tipo === "numero") return num(Number(v));
  if (tipo === "inteiro") return num(Number(v), 0);
  if (tipo === "pct") return `${num(Number(v), 1)}%`;
  if (tipo === "data") return new Date(`${String(v).slice(0, 10)}T12:00`).toLocaleDateString("pt-BR");
  if (tipo === "datahora") {
    const d = new Date(String(v));
    return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  }
  return String(v);
}

const NUMERICOS = new Set(["moeda", "numero", "inteiro", "pct"]);

function Filtro({ rotulo, valor, onChange, opcoes, todos = "Todos" }: {
  rotulo: string; valor: string; onChange: (v: string) => void; opcoes: Opcao[]; todos?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-meta text-text-subtle">
      {rotulo}
      <select className="input !py-1.5 text-body-sm" value={valor} onChange={(e) => onChange(e.target.value)}>
        <option value="">{todos}</option>
        {opcoes.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
      </select>
    </label>
  );
}

export type FiltrosGenericos = { unidade_id: string; veiculo_id: string; motorista_id: string; fornecedor_id: string };
export const FILTROS_GENERICOS_VAZIOS: FiltrosGenericos = { unidade_id: "", veiculo_id: "", motorista_id: "", fornecedor_id: "" };

export function RelatorioGenerico({ def, dataInicio, dataFim, filtros, setFiltros, publico }: {
  def: RelatorioCatalogo;
  dataInicio: string;
  dataFim: string;
  filtros: FiltrosGenericos;
  setFiltros: (f: FiltrosGenericos) => void;
  publico: boolean;
}) {
  const [dados, setDados] = useState<RelatorioCatalogoDados | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [ordem, setOrdem] = useState<{ chave: string; desc: boolean } | null>(null);
  const [opcoes, setOpcoes] = useState<Record<"unidades" | "veiculos" | "motoristas" | "postos", Opcao[]>>({
    unidades: [], veiculos: [], motoristas: [], postos: [],
  });
  const usa = (f: string) => def.filtros.includes(f);
  const faltaVeiculo = def.exige.includes("veiculo") && !filtros.veiculo_id;

  useEffect(() => {
    Promise.allSettled([
      api.listUnidades(true),
      api.listVeiculos({ limit: 200, sort_by: "placa", order: "asc" }),
      api.listMotoristas({ limit: 200, sort_by: "nome", order: "asc" }),
      api.listFornecedores({ posto_credenciado: true, limit: 200 }),
    ]).then(([u, v, m, p]) =>
      setOpcoes({
        unidades: u.status === "fulfilled" ? u.value.map((x) => ({ id: x.id, nome: x.nome })) : [],
        veiculos: v.status === "fulfilled" ? v.value.itens.map((x) => ({ id: x.id, nome: [x.placa, x.modelo].filter(Boolean).join(" · ") })) : [],
        motoristas: m.status === "fulfilled" ? m.value.itens.map((x) => ({ id: x.id, nome: x.nome })) : [],
        postos: p.status === "fulfilled" ? p.value.itens.map((x) => ({ id: x.id, nome: x.nome_fantasia || x.razao_social })) : [],
      }),
    );
  }, []);

  useEffect(() => {
    setOrdem(null);
    if (faltaVeiculo) {
      setDados(null);
      return;
    }
    setCarregando(true);
    api.relatorioCatalogo(def.chave, parametros(def, dataInicio, dataFim, filtros))
      .then(setDados)
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setCarregando(false));
  }, [def, dataInicio, dataFim, filtros, faltaVeiculo]);

  const linhas = useMemo(() => {
    const l = dados?.linhas ?? [];
    if (!ordem) return l;
    return [...l].sort((a, b) => {
      const x = a[ordem.chave], y = b[ordem.chave];
      if (x == null) return 1;
      if (y == null) return -1;
      const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR");
      return ordem.desc ? -r : r;
    });
  }, [dados, ordem]);

  const muda = (campo: keyof FiltrosGenericos) => (v: string) => setFiltros({ ...filtros, [campo]: v });
  const temFiltros = usa("unidade") || usa("veiculo") || usa("motorista") || usa("posto");
  const cols = dados?.colunas ?? [];
  const primeiroTotal = cols.findIndex((c) => c.total);

  const href = (l: Record<string, unknown>) =>
    !l.id ? null : dados?.link === "abastecimento" ? `/abastecimentos/${l.id}` : dados?.link === "veiculo" ? `/veiculos/${l.id}` : null;

  return (
    <div className="space-y-4">
      <p className="text-body-sm text-text-subtle">{def.descricao}</p>

      {temFiltros && (
        <div className="grid grid-cols-2 gap-3 rounded-card border border-surface-border bg-white p-4 shadow-card md:grid-cols-4">
          {usa("unidade") && (
            <Filtro rotulo={publico ? "Secretaria" : "Centro de custo"} valor={filtros.unidade_id} onChange={muda("unidade_id")} opcoes={opcoes.unidades} todos="Todas" />
          )}
          {usa("veiculo") && (
            <Filtro rotulo={def.exige.includes("veiculo") ? "Veículo (obrigatório)" : "Veículo"} valor={filtros.veiculo_id}
              onChange={muda("veiculo_id")} opcoes={opcoes.veiculos} todos={def.exige.includes("veiculo") ? "Escolha…" : "Todos"} />
          )}
          {usa("motorista") && <Filtro rotulo="Motorista" valor={filtros.motorista_id} onChange={muda("motorista_id")} opcoes={opcoes.motoristas} />}
          {usa("posto") && <Filtro rotulo="Posto / fornecedor" valor={filtros.fornecedor_id} onChange={muda("fornecedor_id")} opcoes={opcoes.postos} />}
        </div>
      )}

      {faltaVeiculo && (
        <p className="rounded-card border border-surface-border bg-white px-4 py-8 text-center text-body-sm text-text-subtle">
          Escolha o veículo para ver o extrato.
        </p>
      )}

      {dados && dados.resumo.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {dados.resumo.map((r) => (
            <div key={r.rotulo} className="rounded-card border border-surface-border bg-white px-4 py-3 shadow-card">
              <p className="text-meta text-text-subtle">{r.rotulo}</p>
              <p className="truncate text-lg font-semibold tabular-nums text-text-title" title={r.valor}>{r.valor}</p>
            </div>
          ))}
        </div>
      )}

      {dados?.aviso && (
        <p className="flex items-start gap-2 text-meta text-text-subtle"><Info size={14} className="mt-0.5 shrink-0" />{dados.aviso}</p>
      )}

      {!faltaVeiculo && (
        <div className="overflow-x-auto rounded-card border border-surface-border bg-white shadow-card">
          <table className="w-full min-w-[900px] text-body-sm">
            <thead>
              <tr className="border-b border-surface-border bg-surface-bg text-left text-meta text-text-subtle">
                {cols.map((c) => (
                  <th key={c.chave} className={`px-4 py-3 ${NUMERICOS.has(c.tipo) ? "text-right" : ""}`}>
                    <button
                      className="inline-flex items-center gap-1 hover:text-text-title"
                      onClick={() => setOrdem(ordem?.chave === c.chave ? { chave: c.chave, desc: !ordem.desc } : { chave: c.chave, desc: NUMERICOS.has(c.tipo) })}
                    >
                      {c.rotulo}
                      {ordem?.chave === c.chave && (ordem.desc ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {carregando && !dados && (
                <tr><td colSpan={Math.max(cols.length, 1)} className="px-4 py-8 text-center text-text-subtle">Carregando…</td></tr>
              )}
              {dados && linhas.length === 0 && (
                <tr><td colSpan={cols.length} className="px-4 py-8 text-center text-text-subtle">Nada a mostrar no período e filtros escolhidos.</td></tr>
              )}
              {linhas.slice(0, 1000).map((l, i) => {
                const link = href(l);
                return (
                  <tr key={i} className="border-b border-surface-border last:border-0 hover:bg-[#EFF4FF]/50">
                    {cols.map((c, j) => {
                      const texto = celula(c.tipo, l[c.chave]);
                      const cor = c.tipo === "situacao" ? COR_SITUACAO[texto.toLowerCase().split(":")[0]] : null;
                      return (
                        <td key={c.chave} className={`px-4 py-2 align-top ${NUMERICOS.has(c.tipo) ? "whitespace-nowrap text-right tabular-nums" : ""}`}>
                          {j === 0 && link ? (
                            <Link href={link} className="font-medium text-[#1D4ED8] hover:underline">{texto}</Link>
                          ) : cor ? (
                            <span className={`inline-block rounded px-2 py-0.5 text-meta font-medium ${cor}`}>{texto}</span>
                          ) : (
                            texto
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            {dados && linhas.length > 0 && primeiroTotal >= 0 && (
              <tfoot>
                <tr className="border-t border-surface-border bg-surface-bg font-semibold">
                  {cols.map((c, j) => (
                    <td key={c.chave} className={`px-4 py-3 ${NUMERICOS.has(c.tipo) ? "whitespace-nowrap text-right tabular-nums" : ""}`}>
                      {j === 0 ? "Total" : c.total ? celula(c.tipo, dados.totais[c.chave]) : ""}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      {linhas.length > 1000 && (
        <p className="text-meta text-text-subtle">Mostrando 1.000 de {num(linhas.length, 0)} linhas. Exporte para ver tudo.</p>
      )}
    </div>
  );
}

/** Parâmetros da consulta/exportação conforme os filtros que o relatório aceita. */
export function parametros(def: RelatorioCatalogo, dataInicio: string, dataFim: string, f: FiltrosGenericos): Record<string, string> {
  const p: Record<string, string> = {};
  if (def.filtros.includes("periodo") && dataInicio) p.data_inicio = dataInicio;
  if ((def.filtros.includes("periodo") || def.filtros.includes("fim")) && dataFim) p.data_fim = dataFim;
  const mapa: [string, keyof FiltrosGenericos][] = [["unidade", "unidade_id"], ["veiculo", "veiculo_id"], ["motorista", "motorista_id"], ["posto", "fornecedor_id"]];
  for (const [filtro, campo] of mapa) if (def.filtros.includes(filtro) && f[campo]) p[campo] = f[campo];
  return p;
}
