"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { ArrowDown, ArrowUp, ArrowUpDown, BarChart3, Car, Gauge, Hash, Info, Landmark, ListOrdered, Store, User, Wallet } from "lucide-react";
import { api, RelatorioCatalogo, RelatorioCatalogoDados } from "@/lib/api";
import { Cartao, Esqueleto, FiltroSelect, Kpi, PainelFiltros, Tabela, TF, TFN, Vazio, type Tom } from "./ui";

const ICONES_KPI = [Wallet, BarChart3, Gauge, Hash, ListOrdered];
const TONS_KPI: Tom[] = ["azul", "verde", "roxo", "ambar", "cinza"];

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

export type FiltrosGenericos = { unidade_id: string; veiculo_id: string; motorista_id: string; fornecedor_id: string };
export const FILTROS_GENERICOS_VAZIOS: FiltrosGenericos = { unidade_id: "", veiculo_id: "", motorista_id: "", fornecedor_id: "" };

export function RelatorioGenerico({ def, dataInicio, dataFim, filtros, setFiltros, publico, onTotal }: {
  onTotal?: (n: number | null) => void;
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

  useEffect(() => { onTotal?.(dados ? dados.linhas.length : null); }, [dados, onTotal]);

  const muda = (campo: keyof FiltrosGenericos) => (v: string) => setFiltros({ ...filtros, [campo]: v });
  const temFiltros = usa("unidade") || usa("veiculo") || usa("motorista") || usa("posto");
  const cols = dados?.colunas ?? [];
  const primeiroTotal = cols.findIndex((c) => c.total);

  const href = (l: Record<string, unknown>) =>
    !l.id ? null : dados?.link === "abastecimento" ? `/abastecimentos/${l.id}` : dados?.link === "veiculo" ? `/veiculos/${l.id}` : null;

  const nomeDe = (lista: Opcao[], id: string) => lista.find((o) => o.id === id)?.nome ?? "…";
  const ativos = ([
    ["unidade_id", opcoes.unidades], ["veiculo_id", opcoes.veiculos], ["motorista_id", opcoes.motoristas], ["fornecedor_id", opcoes.postos],
  ] as [keyof FiltrosGenericos, Opcao[]][])
    .filter(([k]) => filtros[k])
    .map(([k, lista]) => ({ chave: k, rotulo: nomeDe(lista, filtros[k]), onRemover: () => muda(k)("") }));

  return (
    <div className="space-y-5">
      {temFiltros && (
        <PainelFiltros ativos={ativos} onLimpar={() => setFiltros(FILTROS_GENERICOS_VAZIOS)}>
          {usa("unidade") && (
            <FiltroSelect rotulo={publico ? "Secretaria" : "Centro de custo"} Icone={Landmark} valor={filtros.unidade_id} onChange={muda("unidade_id")} opcoes={opcoes.unidades} todos="Todas" />
          )}
          {usa("veiculo") && (
            <FiltroSelect rotulo={def.exige.includes("veiculo") ? "Veículo (obrigatório)" : "Veículo"} Icone={Car} valor={filtros.veiculo_id}
              onChange={muda("veiculo_id")} opcoes={opcoes.veiculos} todos={def.exige.includes("veiculo") ? "Escolha…" : "Todos"} />
          )}
          {usa("motorista") && <FiltroSelect rotulo="Motorista" Icone={User} valor={filtros.motorista_id} onChange={muda("motorista_id")} opcoes={opcoes.motoristas} />}
          {usa("posto") && <FiltroSelect rotulo="Posto / fornecedor" Icone={Store} valor={filtros.fornecedor_id} onChange={muda("fornecedor_id")} opcoes={opcoes.postos} />}
        </PainelFiltros>
      )}

      {faltaVeiculo && (
        <Cartao><Vazio titulo="Escolha um veículo" texto="Este relatório é o extrato de um veículo. Selecione-o no filtro acima." /></Cartao>
      )}

      {!faltaVeiculo && carregando && !dados && <Esqueleto />}

      {dados && dados.resumo.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {dados.resumo.map((r, i) => (
            <Kpi key={r.rotulo} rotulo={r.rotulo} valor={<span title={r.valor}>{r.valor}</span>} Icone={ICONES_KPI[i % ICONES_KPI.length]}
              tom={TONS_KPI[i % TONS_KPI.length]} destaque={i === 0} />
          ))}
        </div>
      )}

      {dados?.aviso && (
        <p className="flex items-start gap-2 rounded-xl bg-[#F5F8FF] px-4 py-3 text-meta text-text-body ring-1 ring-[#D9E2FF]"><Info size={14} className="mt-0.5 shrink-0 text-primary" />{dados.aviso}</p>
      )}

      {!faltaVeiculo && dados && (
        <Cartao
          titulo="Resultado"
          Icone={ListOrdered}
          semPadding
          acao={<span className="text-meta text-text-subtle">{linhas.length > 1000 ? `Mostrando 1.000 de ${num(linhas.length, 0)} — exporte para ver tudo` : `${num(linhas.length, 0)} linha(s)`}</span>}
        >
          {linhas.length === 0 ? (
            <Vazio />
          ) : (
            <Tabela minW={900}>
              <thead>
                <tr>
                  {cols.map((c) => (
                    <th key={c.chave} className={`px-4 py-3 text-meta font-semibold uppercase tracking-wider text-text-subtle ${NUMERICOS.has(c.tipo) ? "text-right" : "text-left"}`}>
                      <button
                        className={`inline-flex items-center gap-1 uppercase hover:text-text-title ${ordem?.chave === c.chave ? "text-primary" : ""}`}
                        onClick={() => setOrdem(ordem?.chave === c.chave ? { chave: c.chave, desc: !ordem.desc } : { chave: c.chave, desc: NUMERICOS.has(c.tipo) })}
                      >
                        {c.rotulo}
                        {ordem?.chave === c.chave ? (ordem.desc ? <ArrowDown size={12} /> : <ArrowUp size={12} />) : <ArrowUpDown size={11} className="opacity-40" />}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.slice(0, 1000).map((l, i) => {
                  const link = href(l);
                  return (
                    <tr key={i}>
                      {cols.map((c, j) => {
                        const texto = celula(c.tipo, l[c.chave]);
                        const cor = c.tipo === "situacao" ? COR_SITUACAO[texto.toLowerCase().split(":")[0]] : null;
                        return (
                          <td key={c.chave} className={`px-4 py-2.5 align-top ${NUMERICOS.has(c.tipo) ? "whitespace-nowrap text-right tabular-nums" : ""} ${j === 0 ? "font-medium text-text-title" : ""}`}>
                            {j === 0 && link ? (
                              <Link href={link} className="font-semibold text-primary hover:underline">{texto}</Link>
                            ) : cor ? (
                              <span className={`inline-block whitespace-nowrap rounded-pill px-2 py-0.5 text-meta font-medium ${cor}`}>{texto}</span>
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
              {primeiroTotal >= 0 && (
                <tfoot>
                  <tr>
                    {cols.map((c, j) => (
                      <td key={c.chave} className={NUMERICOS.has(c.tipo) ? TFN : TF}>
                        {j === 0 ? "Total" : c.total ? celula(c.tipo, dados.totais[c.chave]) : ""}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </Tabela>
          )}
        </Cartao>
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
