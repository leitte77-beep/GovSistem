"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { FilterX } from "lucide-react";
import { api, RelatorioAbastecimentos } from "@/lib/api";

export type FiltrosAbastecimento = {
  unidade_id: string;
  veiculo_id: string;
  motorista_id: string;
  fornecedor_id: string;
  combustivel_id: string;
  situacao_nota: string;
  agrupar_por: string;
};

export const FILTROS_VAZIOS: FiltrosAbastecimento = {
  unidade_id: "",
  veiculo_id: "",
  motorista_id: "",
  fornecedor_id: "",
  combustivel_id: "",
  situacao_nota: "",
  agrupar_por: "",
};

const AGRUPAR: Opcao[] = [
  { id: "secretaria", nome: "Secretaria" },
  { id: "veiculo", nome: "Veículo" },
  { id: "motorista", nome: "Motorista" },
  { id: "posto", nome: "Posto / tanque" },
  { id: "combustivel", nome: "Combustível" },
  { id: "dia", nome: "Dia" },
];

const LIMITE_TELA = 500;

type Opcao = { id: string; nome: string };
type Item = RelatorioAbastecimentos["itens"][number];

const reais = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v: number, casas = 2) => v.toLocaleString("pt-BR", { maximumFractionDigits: casas });

const SITUACAO_NOTA: Record<string, { rotulo: string; classe: string }> = {
  ENVIADA: { rotulo: "Enviada", classe: "bg-[#E7F8EC] text-[#106D34]" },
  SO_PDF: { rotulo: "Só PDF", classe: "bg-[#E5EEFF] text-[#1D4ED8]" },
  SUBSTITUIDA: { rotulo: "Substituída", classe: "bg-[#FFF4D6] text-[#5C4200]" },
  PENDENTE: { rotulo: "Pendente", classe: "bg-[#FEE4E2] text-[#B42318]" },
};

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

export function AbaAbastecimentos({ dataInicio, dataFim, filtros, setFiltros, publico }: {
  dataInicio: string;
  dataFim: string;
  filtros: FiltrosAbastecimento;
  setFiltros: (f: FiltrosAbastecimento) => void;
  publico: boolean;
}) {
  const [rel, setRel] = useState<RelatorioAbastecimentos | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [opcoes, setOpcoes] = useState<Record<"unidades" | "veiculos" | "motoristas" | "postos" | "combustiveis", Opcao[]>>({
    unidades: [], veiculos: [], motoristas: [], postos: [], combustiveis: [],
  });

  useEffect(() => {
    Promise.allSettled([
      api.listUnidades(true),
      api.listVeiculos({ limit: 200, sort_by: "placa", order: "asc" }),
      api.listMotoristas({ limit: 200, sort_by: "nome", order: "asc" }),
      api.listFornecedores({ posto_credenciado: true, limit: 200 }),
      api.listCombustiveis(true),
    ]).then(([u, v, m, p, c]) =>
      setOpcoes({
        unidades: u.status === "fulfilled" ? u.value.map((x) => ({ id: x.id, nome: x.nome })) : [],
        veiculos: v.status === "fulfilled" ? v.value.itens.map((x) => ({ id: x.id, nome: [x.placa, x.modelo].filter(Boolean).join(" · ") })) : [],
        motoristas: m.status === "fulfilled" ? m.value.itens.map((x) => ({ id: x.id, nome: x.nome })) : [],
        postos: p.status === "fulfilled" ? p.value.itens.map((x) => ({ id: x.id, nome: x.nome_fantasia || x.razao_social })) : [],
        combustiveis: c.status === "fulfilled" ? c.value.map((x) => ({ id: x.id, nome: x.nome })) : [],
      }),
    );
  }, []);

  useEffect(() => {
    setCarregando(true);
    const params: Record<string, string> = {};
    if (dataInicio) params.data_inicio = dataInicio;
    if (dataFim) params.data_fim = dataFim;
    Object.entries(filtros).forEach(([k, v]) => v && (params[k] = v));
    api.relatorioAbastecimentos(params)
      .then(setRel)
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setCarregando(false));
  }, [dataInicio, dataFim, filtros]);

  const resumo = useMemo(() => {
    const itens = rel?.itens ?? [];
    const comPreco = itens.filter((i) => i.custo_total != null);
    const litrosComPreco = comPreco.reduce((s, i) => s + i.litros, 0);
    return {
      precoMedio: litrosComPreco ? comPreco.reduce((s, i) => s + (i.custo_total ?? 0), 0) / litrosComPreco : null,
      veiculos: new Set(itens.map((i) => i.placa)).size,
      semNota: itens.filter((i) => i.situacao_nota === "PENDENTE").length,
    };
  }, [rel]);

  const muda = (campo: keyof FiltrosAbastecimento) => (v: string) => setFiltros({ ...filtros, [campo]: v });
  const algumFiltro = Object.entries(filtros).some(([k, v]) => k !== "agrupar_por" && v);
  const itens: Item[] = (rel?.itens ?? []).slice(0, LIMITE_TELA);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 rounded-card border border-surface-border bg-white p-4 shadow-card md:grid-cols-4 xl:grid-cols-7">
        <Filtro rotulo={publico ? "Secretaria" : "Centro de custo"} valor={filtros.unidade_id} onChange={muda("unidade_id")} opcoes={opcoes.unidades} todos="Todas" />
        <Filtro rotulo="Veículo" valor={filtros.veiculo_id} onChange={muda("veiculo_id")} opcoes={opcoes.veiculos} />
        <Filtro rotulo="Motorista" valor={filtros.motorista_id} onChange={muda("motorista_id")} opcoes={opcoes.motoristas} />
        <Filtro rotulo="Posto" valor={filtros.fornecedor_id} onChange={muda("fornecedor_id")} opcoes={opcoes.postos} />
        <Filtro rotulo="Combustível" valor={filtros.combustivel_id} onChange={muda("combustivel_id")} opcoes={opcoes.combustiveis} />
        <Filtro
          rotulo="Nota fiscal"
          valor={filtros.situacao_nota}
          onChange={muda("situacao_nota")}
          todos="Todas"
          opcoes={[
            { id: "COM_NOTA", nome: "Com nota" },
            { id: "SEM_NOTA", nome: "Sem nota (posto)" },
            { id: "SUBSTITUIDA", nome: "Substituídas" },
          ]}
        />
        <Filtro
          rotulo="Agrupar por"
          valor={filtros.agrupar_por}
          onChange={muda("agrupar_por")}
          todos="Sem agrupamento"
          opcoes={AGRUPAR.map((o) => (o.id === "secretaria" && !publico ? { ...o, nome: "Centro de custo" } : o))}
        />
        {algumFiltro && (
          <button className="btn btn-ghost btn-sm col-span-full justify-self-start" onClick={() => setFiltros({ ...FILTROS_VAZIOS, agrupar_por: filtros.agrupar_por })}>
            <FilterX size={14} /> Limpar filtros
          </button>
        )}
      </div>

      {rel && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {[
            ["Total gasto", reais(rel.total_gasto)],
            ["Litros", `${num(rel.total_litros)} L`],
            ["Preço médio/L", resumo.precoMedio != null ? reais(resumo.precoMedio) : "—"],
            ["Abastecimentos", num(rel.total_registros, 0)],
            ["Veículos", num(resumo.veiculos, 0)],
            ["Sem nota (posto)", num(resumo.semNota, 0)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-card border border-surface-border bg-white px-4 py-3 shadow-card">
              <p className="text-meta text-text-subtle">{k}</p>
              <p className="text-lg font-semibold tabular-nums text-text-title">{v}</p>
            </div>
          ))}
        </div>
      )}

      {rel?.grupos && rel.grupos.length > 0 && (
        <div className="overflow-x-auto rounded-card border border-surface-border bg-white shadow-card">
          <table className="w-full min-w-[800px] text-body-sm">
            <thead>
              <tr className="border-b border-surface-border bg-surface-bg text-left text-meta text-text-subtle">
                <th className="px-4 py-3">{AGRUPAR.find((a) => a.id === filtros.agrupar_por)?.nome}</th>
                <th className="px-4 py-3 text-right">Abastecimentos</th>
                <th className="px-4 py-3 text-right">Veículos</th>
                <th className="px-4 py-3 text-right">Litros</th>
                <th className="px-4 py-3 text-right">Preço médio/L</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Participação</th>
              </tr>
            </thead>
            <tbody>
              {rel.grupos.map((g) => (
                <tr key={g.nome} className="border-b border-surface-border last:border-0">
                  <td className="px-4 py-2 font-medium">{g.nome}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{num(g.abastecimentos, 0)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{num(g.veiculos, 0)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{num(g.litros)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{reais(g.preco_medio)}</td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums">{reais(g.total)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-surface-bg">
                        <div className="h-full bg-[#1D4ED8]" style={{ width: `${Math.min(g.participacao_pct, 100)}%` }} />
                      </div>
                      <span className="text-meta tabular-nums text-text-subtle">{num(g.participacao_pct, 1)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-surface-border bg-surface-bg font-semibold">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right tabular-nums">{num(rel.total_registros, 0)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{num(resumo.veiculos, 0)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{num(rel.total_litros)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{reais(rel.preco_medio ?? resumo.precoMedio)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{reais(rel.total_gasto)}</td>
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {rel && rel.itens.length > itens.length && (
        <p className="text-meta text-text-subtle">Mostrando os {itens.length} mais recentes; os totais consideram todos. Use os filtros ou exporte para ver a lista completa.</p>
      )}

      <div className="overflow-x-auto rounded-card border border-surface-border bg-white shadow-card">
        <table className="w-full min-w-[1100px] text-body-sm">
          <thead>
            <tr className="border-b border-surface-border bg-surface-bg text-left text-meta text-text-subtle">
              <th className="px-4 py-3">Número</th>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Veículo</th>
              <th className="px-4 py-3">{publico ? "Secretaria" : "Centro de custo"}</th>
              <th className="px-4 py-3">Motorista</th>
              <th className="px-4 py-3">Combustível / local</th>
              <th className="px-4 py-3 text-right">Litros</th>
              <th className="px-4 py-3 text-right">KM / horas</th>
              <th className="px-4 py-3 text-right">Preço/L</th>
              <th className="px-4 py-3">Nota fiscal</th>
              <th className="px-4 py-3 text-right">Custo</th>
            </tr>
          </thead>
          <tbody>
            {carregando && !rel && (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-text-subtle">Carregando…</td></tr>
            )}
            {rel && itens.length === 0 && (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-text-subtle">Nenhum abastecimento no período e filtros escolhidos.</td></tr>
            )}
            {itens.map((i) => {
              const d = new Date(i.data);
              const sit = i.situacao_nota ? SITUACAO_NOTA[i.situacao_nota] : null;
              return (
                <tr key={i.id} className="border-b border-surface-border last:border-0 hover:bg-[#EFF4FF]/50">
                  <td className="whitespace-nowrap px-4 py-2">
                    <Link href={`/abastecimentos/${i.id}`} className="font-mono text-meta text-[#1D4ED8] hover:underline">{i.numero ?? "—"}</Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums">
                    {d.toLocaleDateString("pt-BR")}
                    <span className="block text-meta text-text-subtle">{d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                  </td>
                  <td className="px-4 py-2">
                    <span className="font-medium">{i.placa}</span>
                    {i.veiculo && <span className="block text-meta text-text-subtle">{i.veiculo}</span>}
                  </td>
                  <td className="px-4 py-2">{i.unidade ?? "—"}</td>
                  <td className="px-4 py-2">{i.motorista ?? "—"}</td>
                  <td className="px-4 py-2">
                    {i.combustivel}
                    <span className="block text-meta text-text-subtle">{i.local ?? "—"}</span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{num(i.litros)}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">
                    {i.horimetro != null ? `${num(i.horimetro, 1)} h` : `${num(i.km, 0)} km`}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{reais(i.preco_litro)}</td>
                  <td className="px-4 py-2">
                    {sit ? (
                      <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-meta font-medium ${sit.classe}`}>
                        {sit.rotulo}{i.numero_nf && i.numero_nf !== "PDF" ? ` · NF ${i.numero_nf}` : ""}
                      </span>
                    ) : (
                      <span className="text-text-subtle">{i.numero_nf ? `NF ${i.numero_nf}` : "—"}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums">{reais(i.custo_total)}</td>
                </tr>
              );
            })}
          </tbody>
          {rel && itens.length > 0 && (
            <tfoot>
              <tr className="border-t border-surface-border bg-surface-bg font-semibold">
                <td className="px-4 py-3" colSpan={6}>Total ({num(rel.total_registros, 0)} abastecimentos)</td>
                <td className="px-4 py-3 text-right tabular-nums">{num(rel.total_litros)}</td>
                <td colSpan={3} />
                <td className="px-4 py-3 text-right tabular-nums">{reais(rel.total_gasto)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
