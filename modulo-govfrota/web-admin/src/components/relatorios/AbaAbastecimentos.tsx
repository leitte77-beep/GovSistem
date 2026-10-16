"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  BarChart3, Car, Droplet, FileWarning, Fuel, Landmark, Layers, ListOrdered, PieChart, Receipt, Store, Tag, User, Wallet,
} from "lucide-react";
import { api, RelatorioAbastecimentos } from "@/lib/api";
import {
  BarraPct, Cartao, Esqueleto, FiltroSelect, GradeKpi, Kpi, num, Opcao, PainelFiltros, periodoAnterior, reais,
  Tabela, TD, TDN, TF, TFN, TH, THN, variacao, Vazio,
} from "./ui";
import { Colunas, Rosca } from "./graficos";

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

const SITUACOES_NOTA: Opcao[] = [
  { id: "COM_NOTA", nome: "Com nota" },
  { id: "SEM_NOTA", nome: "Sem nota (posto)" },
  { id: "SUBSTITUIDA", nome: "Substituídas" },
];

const LIMITE_TELA = 500;

type Item = RelatorioAbastecimentos["itens"][number];

const SITUACAO_NOTA: Record<string, { rotulo: string; classe: string }> = {
  ENVIADA: { rotulo: "Enviada", classe: "bg-[#E7F8EC] text-[#106D34]" },
  SO_PDF: { rotulo: "Enviada", classe: "bg-[#E7F8EC] text-[#106D34]" },
  SUBSTITUIDA: { rotulo: "Substituída", classe: "bg-[#FFF4D6] text-[#5C4200]" },
  PENDENTE: { rotulo: "Pendente", classe: "bg-[#FEE4E2] text-[#B42318]" },
};

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Gasto ao longo do período: por dia até ~2 meses, por mês acima disso. */
function serieTemporal(itens: Item[], inicio: string, fim: string) {
  const di = new Date(`${inicio}T12:00`), df = new Date(`${fim}T12:00`);
  const dias = Math.round((df.getTime() - di.getTime()) / 86_400_000) + 1;
  const porMes = dias > 62;
  const mapa = new Map<string, { gasto: number; litros: number }>();
  if (porMes) {
    for (let d = new Date(di.getFullYear(), di.getMonth(), 1); d <= df; d.setMonth(d.getMonth() + 1)) mapa.set(iso(d).slice(0, 7), { gasto: 0, litros: 0 });
  } else {
    for (let d = new Date(di); d <= df; d.setDate(d.getDate() + 1)) mapa.set(iso(d), { gasto: 0, litros: 0 });
  }
  for (const i of itens) {
    const k = porMes ? iso(new Date(i.data)).slice(0, 7) : iso(new Date(i.data));
    const v = mapa.get(k);
    if (v) { v.gasto += i.custo_total ?? 0; v.litros += i.litros; }
  }
  return {
    porMes,
    dados: Array.from(mapa.entries()).map(([k, v]) => ({
      rotulo: porMes
        ? new Date(`${k}-01T12:00`).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(". de", "/").replace(".", "")
        : `${k.slice(8, 10)}/${k.slice(5, 7)}`,
      gasto: Math.round(v.gasto * 100) / 100,
      litros: Math.round(v.litros * 1000) / 1000,
    })),
  };
}

export function AbaAbastecimentos({ dataInicio, dataFim, filtros, setFiltros, publico, onTotal }: {
  onTotal?: (n: number | null) => void;
  dataInicio: string;
  dataFim: string;
  filtros: FiltrosAbastecimento;
  setFiltros: (f: FiltrosAbastecimento) => void;
  publico: boolean;
}) {
  const [rel, setRel] = useState<RelatorioAbastecimentos | null>(null);
  const [anterior, setAnterior] = useState<RelatorioAbastecimentos | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [opcoes, setOpcoes] = useState<Record<"unidades" | "veiculos" | "motoristas" | "postos" | "combustiveis", Opcao[]>>({
    unidades: [], veiculos: [], motoristas: [], postos: [], combustiveis: [],
  });
  const rotuloUnidade = publico ? "Secretaria" : "Centro de custo";

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
    Object.entries(filtros).forEach(([k, v]) => v && (params[k] = v));
    if (dataInicio) params.data_inicio = dataInicio;
    if (dataFim) params.data_fim = dataFim;
    api.relatorioAbastecimentos(params)
      .then(setRel)
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setCarregando(false));
    // Mesmo filtro no período anterior, para a comparação dos indicadores.
    const ant = periodoAnterior(dataInicio, dataFim);
    if (ant) {
      const { agrupar_por: _a, ...resto } = params;
      void _a;
      api.relatorioAbastecimentos({ ...resto, data_inicio: ant[0], data_fim: ant[1] }).then(setAnterior).catch(() => setAnterior(null));
    } else setAnterior(null);
  }, [dataInicio, dataFim, filtros]);

  useEffect(() => { onTotal?.(rel ? rel.total_registros : null); }, [rel, onTotal]);

  const resumo = useMemo(() => {
    const calc = (r: RelatorioAbastecimentos | null) => {
      const itens = r?.itens ?? [];
      const comPreco = itens.filter((i) => i.custo_total != null);
      const litrosComPreco = comPreco.reduce((s, i) => s + i.litros, 0);
      return {
        precoMedio: litrosComPreco ? comPreco.reduce((s, i) => s + (i.custo_total ?? 0), 0) / litrosComPreco : null,
        veiculos: new Set(itens.map((i) => i.placa)).size,
        semNota: itens.filter((i) => i.situacao_nota === "PENDENTE").length,
      };
    };
    return { atual: calc(rel), ant: calc(anterior) };
  }, [rel, anterior]);

  const graficos = useMemo(() => {
    const itens = rel?.itens ?? [];
    const porComb = new Map<string, number>();
    for (const i of itens) porComb.set(i.combustivel, (porComb.get(i.combustivel) ?? 0) + (i.custo_total ?? 0));
    return {
      tempo: dataInicio && dataFim ? serieTemporal(itens, dataInicio, dataFim) : null,
      combustivel: Array.from(porComb.entries()).map(([nome, valor]) => ({ nome, valor: Math.round(valor * 100) / 100 })).sort((a, b) => b.valor - a.valor),
    };
  }, [rel, dataInicio, dataFim]);

  const muda = (campo: keyof FiltrosAbastecimento) => (v: string) => setFiltros({ ...filtros, [campo]: v });
  const nomeDe = (lista: Opcao[], id: string) => lista.find((o) => o.id === id)?.nome ?? "…";
  const ativos = [
    filtros.unidade_id && { chave: "unidade_id", rotulo: nomeDe(opcoes.unidades, filtros.unidade_id) },
    filtros.veiculo_id && { chave: "veiculo_id", rotulo: nomeDe(opcoes.veiculos, filtros.veiculo_id) },
    filtros.motorista_id && { chave: "motorista_id", rotulo: nomeDe(opcoes.motoristas, filtros.motorista_id) },
    filtros.fornecedor_id && { chave: "fornecedor_id", rotulo: nomeDe(opcoes.postos, filtros.fornecedor_id) },
    filtros.combustivel_id && { chave: "combustivel_id", rotulo: nomeDe(opcoes.combustiveis, filtros.combustivel_id) },
    filtros.situacao_nota && { chave: "situacao_nota", rotulo: nomeDe(SITUACOES_NOTA, filtros.situacao_nota) },
  ].filter(Boolean) as { chave: keyof FiltrosAbastecimento; rotulo: string }[];
  const itens: Item[] = (rel?.itens ?? []).slice(0, LIMITE_TELA);
  const agrupar = AGRUPAR.map((o) => (o.id === "secretaria" ? { ...o, nome: rotuloUnidade } : o));

  return (
    <div className="space-y-5">
      <PainelFiltros
        ativos={ativos.map((a) => ({ ...a, onRemover: () => muda(a.chave)("") }))}
        onLimpar={() => setFiltros({ ...FILTROS_VAZIOS, agrupar_por: filtros.agrupar_por })}
      >
        <FiltroSelect rotulo={rotuloUnidade} Icone={Landmark} valor={filtros.unidade_id} onChange={muda("unidade_id")} opcoes={opcoes.unidades} todos="Todas" />
        <FiltroSelect rotulo="Veículo" Icone={Car} valor={filtros.veiculo_id} onChange={muda("veiculo_id")} opcoes={opcoes.veiculos} />
        <FiltroSelect rotulo="Motorista" Icone={User} valor={filtros.motorista_id} onChange={muda("motorista_id")} opcoes={opcoes.motoristas} />
        <FiltroSelect rotulo="Posto" Icone={Store} valor={filtros.fornecedor_id} onChange={muda("fornecedor_id")} opcoes={opcoes.postos} />
        <FiltroSelect rotulo="Combustível" Icone={Fuel} valor={filtros.combustivel_id} onChange={muda("combustivel_id")} opcoes={opcoes.combustiveis} />
        <FiltroSelect rotulo="Nota fiscal" Icone={Receipt} valor={filtros.situacao_nota} onChange={muda("situacao_nota")} opcoes={SITUACOES_NOTA} todos="Todas" />
        <FiltroSelect rotulo="Agrupar por" Icone={Layers} valor={filtros.agrupar_por} onChange={muda("agrupar_por")} opcoes={agrupar} todos="Sem agrupamento" />
      </PainelFiltros>

      {carregando && !rel && <Esqueleto />}

      {rel && (
        <div className={`space-y-5 transition-opacity ${carregando ? "opacity-60" : ""}`}>
          <GradeKpi>
            <Kpi rotulo="Total gasto" valor={reais(rel.total_gasto)} Icone={Wallet} tom="azul" destaque
              delta={anterior ? variacao(rel.total_gasto, anterior.total_gasto) : undefined} />
            <Kpi rotulo="Litros" valor={`${num(rel.total_litros, 3)} L`} Icone={Droplet} tom="verde"
              delta={anterior ? variacao(rel.total_litros, anterior.total_litros) : undefined} />
            <Kpi rotulo="Preço médio / L" valor={reais(resumo.atual.precoMedio)} Icone={Tag} tom="roxo"
              delta={anterior ? variacao(resumo.atual.precoMedio, resumo.ant.precoMedio) : undefined} />
            <Kpi rotulo="Abastecimentos" valor={num(rel.total_registros, 0)} Icone={Fuel} tom="cinza"
              detalhe={`${num(resumo.atual.veiculos, 0)} veículo(s)`} />
          </GradeKpi>

          {resumo.atual.semNota > 0 && (
            <div className="flex items-start gap-3 rounded-2xl border border-[#FEC84B] bg-[#FFFAEB] p-4 text-body-sm text-[#93370D]">
              <FileWarning size={18} className="mt-0.5 shrink-0" />
              <span><b>{resumo.atual.semNota}</b> abastecimento(s) em posto ainda sem nota fiscal no período.</span>
            </div>
          )}

          {rel.itens.length === 0 ? (
            <Cartao><Vazio titulo="Nenhum abastecimento" texto="Não há abastecimentos no período e filtros escolhidos. Amplie o período ou limpe os filtros." /></Cartao>
          ) : (
            <>
              <div className="grid gap-5 xl:grid-cols-5">
                <div className="xl:col-span-3">
                  <Cartao titulo={graficos.tempo?.porMes ? "Gasto por mês" : "Gasto por dia"} Icone={BarChart3}>
                    {graficos.tempo && <Colunas dados={graficos.tempo.dados} x="rotulo" series={[{ chave: "gasto", nome: "Gasto" }]} />}
                  </Cartao>
                </div>
                <div className="xl:col-span-2">
                  <Cartao titulo="Gasto por combustível" Icone={PieChart}>
                    <Rosca dados={graficos.combustivel} />
                  </Cartao>
                </div>
              </div>

              {rel.grupos && rel.grupos.length > 0 && (
                <Cartao titulo={`Por ${agrupar.find((a) => a.id === filtros.agrupar_por)?.nome.toLowerCase()}`} Icone={Layers} semPadding>
                  <Tabela minW={800} altura="max-h-[60vh]">
                    <thead>
                      <tr>
                        <th className={TH}>{agrupar.find((a) => a.id === filtros.agrupar_por)?.nome}</th>
                        <th className={THN}>Abastecimentos</th>
                        <th className={THN}>Veículos</th>
                        <th className={THN}>Litros</th>
                        <th className={THN}>Preço médio/L</th>
                        <th className={THN}>Total</th>
                        <th className={TH}>Participação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rel.grupos.map((g) => (
                        <tr key={g.nome}>
                          <td className={`${TD} font-medium text-text-title`}>{g.nome}</td>
                          <td className={TDN}>{num(g.abastecimentos, 0)}</td>
                          <td className={TDN}>{num(g.veiculos, 0)}</td>
                          <td className={TDN}>{num(g.litros, 3)}</td>
                          <td className={TDN}>{reais(g.preco_medio)}</td>
                          <td className={`${TDN} font-semibold text-text-title`}>{reais(g.total)}</td>
                          <td className={TD}><BarraPct pct={g.participacao_pct} /></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td className={TF}>Total</td>
                        <td className={TFN}>{num(rel.total_registros, 0)}</td>
                        <td className={TFN}>{num(resumo.atual.veiculos, 0)}</td>
                        <td className={TFN}>{num(rel.total_litros, 3)}</td>
                        <td className={TFN}>{reais(rel.preco_medio ?? resumo.atual.precoMedio)}</td>
                        <td className={TFN}>{reais(rel.total_gasto)}</td>
                        <td className={TF} />
                      </tr>
                    </tfoot>
                  </Tabela>
                </Cartao>
              )}

              <Cartao
                titulo="Abastecimentos"
                Icone={ListOrdered}
                semPadding
                acao={rel.itens.length > itens.length
                  ? <span className="text-meta text-text-subtle">Mostrando {itens.length} de {num(rel.itens.length, 0)} — exporte para ver todos</span>
                  : <span className="text-meta text-text-subtle">{num(rel.itens.length, 0)} registro(s)</span>}
              >
                <Tabela minW={1100}>
                  <thead>
                    <tr>
                      <th className={TH}>Número</th>
                      <th className={TH}>Data</th>
                      <th className={TH}>Veículo</th>
                      <th className={TH}>{rotuloUnidade}</th>
                      <th className={TH}>Motorista</th>
                      <th className={TH}>Combustível / local</th>
                      <th className={THN}>Litros</th>
                      <th className={THN}>KM / horas</th>
                      <th className={THN}>Preço/L</th>
                      <th className={TH}>Nota fiscal</th>
                      <th className={THN}>Custo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((i) => {
                      const d = new Date(i.data);
                      const sit = i.situacao_nota ? SITUACAO_NOTA[i.situacao_nota] : null;
                      return (
                        <tr key={i.id}>
                          <td className={`${TD} whitespace-nowrap`}>
                            <Link href={`/abastecimentos/${i.id}`} className="font-mono text-meta font-semibold text-primary hover:underline">{i.numero ?? "—"}</Link>
                          </td>
                          <td className={`${TD} whitespace-nowrap tabular-nums`}>
                            {d.toLocaleDateString("pt-BR")}
                            <span className="block text-meta text-text-subtle">{d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                          </td>
                          <td className={TD}>
                            <span className="rounded bg-navy px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-wider text-white">{i.placa}</span>
                            {i.veiculo && <span className="mt-0.5 block text-meta text-text-subtle">{i.veiculo}</span>}
                          </td>
                          <td className={TD}>{i.unidade ?? "—"}</td>
                          <td className={TD}>{i.motorista ?? "—"}</td>
                          <td className={TD}>
                            {i.combustivel}
                            <span className="block text-meta text-text-subtle">{i.local ?? "—"}</span>
                          </td>
                          <td className={TDN}>{num(i.litros, 3)}</td>
                          <td className={TDN}>{i.horimetro != null ? `${num(i.horimetro, 1)} h` : `${num(i.km, 0)} km`}</td>
                          <td className={TDN}>{reais(i.preco_litro)}</td>
                          <td className={TD}>
                            {sit ? (
                              <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-pill px-2 py-0.5 text-meta font-medium ${sit.classe}`}>
                                {sit.rotulo}{i.numero_nf && i.numero_nf !== "PDF" ? ` · NF ${i.numero_nf}` : ""}
                              </span>
                            ) : (
                              <span className="text-text-subtle">{i.numero_nf ? `NF ${i.numero_nf}` : "—"}</span>
                            )}
                          </td>
                          <td className={`${TDN} font-semibold text-text-title`}>{reais(i.custo_total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className={TF} colSpan={6}>Total ({num(rel.total_registros, 0)} abastecimentos)</td>
                      <td className={TFN}>{num(rel.total_litros, 3)}</td>
                      <td className={TF} colSpan={3} />
                      <td className={TFN}>{reais(rel.total_gasto)}</td>
                    </tr>
                  </tfoot>
                </Tabela>
              </Cartao>
            </>
          )}
        </div>
      )}
    </div>
  );
}
