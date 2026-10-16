"use client";

/** Relatórios com tela própria: secretarias, consumo, estoque, manutenções, CNH e prévia da prestação de contas. */

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  AlertOctagon, AlertTriangle, BadgeCheck, BarChart3, Car, CheckCircle2, Clock, Container, Droplet, FileSignature, Fuel,
  Gauge, IdCard, Landmark, ListOrdered, PieChart, Route, Trophy, Wallet, Warehouse, Wrench,
} from "lucide-react";
import {
  api, CNHItem, PreviaPrestacao, RelatorioConsumo, RelatorioEstoque, RelatorioManutencoes, RelatorioSecretarias,
} from "@/lib/api";
import {
  BarraPct, Cartao, Delta, Esqueleto, FiltroSelect, GradeKpi, Kpi, num, Opcao, periodoAnterior, reais, Tabela, TD, TDN,
  TF, TFN, TH, THN, variacao, Vazio,
} from "./ui";
import { Colunas, Ranking, Rosca } from "./graficos";

type Props = { dataInicio: string; dataFim: string; publico: boolean; onTotal?: (n: number | null) => void };
const per = (i: string, f: string) => ({ data_inicio: i || undefined, data_fim: f || undefined });

function useRelatorio<T>(buscar: () => Promise<T>, deps: unknown[]) {
  const [dados, setDados] = useState<T | null>(null);
  const [carregando, setCarregando] = useState(true);
  useEffect(() => {
    setCarregando(true);
    buscar().then(setDados).catch((e) => toast.error((e as Error).message)).finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { dados, carregando };
}

/* ───────────────────────── Gasto por secretaria ───────────────────────── */

export function RelSecretarias({ dataInicio, dataFim, publico, onTotal }: Props) {
  const { dados: r, carregando } = useRelatorio<RelatorioSecretarias>(() => api.relatorioSecretarias(per(dataInicio, dataFim)), [dataInicio, dataFim]);
  const [ant, setAnt] = useState<RelatorioSecretarias | null>(null);
  useEffect(() => {
    const p = periodoAnterior(dataInicio, dataFim);
    if (p) api.relatorioSecretarias(per(p[0], p[1])).then(setAnt).catch(() => setAnt(null));
  }, [dataInicio, dataFim]);
  useEffect(() => { onTotal?.(r ? r.itens.length : null); }, [r, onTotal]);
  const unidade = publico ? "Secretaria" : "Centro de custo";

  const soma = (x: RelatorioSecretarias | null, k: "combustivel_total" | "manutencao" | "litros") => x?.itens.reduce((s, i) => s + i[k], 0) ?? null;
  if (carregando && !r) return <Esqueleto />;
  if (!r) return null;

  return (
    <div className={`space-y-5 transition-opacity ${carregando ? "opacity-60" : ""}`}>
      <GradeKpi>
        <Kpi rotulo="Gasto total" valor={reais(r.total)} Icone={Wallet} destaque delta={ant ? variacao(r.total, ant.total) : undefined} />
        <Kpi rotulo="Combustível" valor={reais(soma(r, "combustivel_total"))} Icone={Fuel} tom="verde" delta={ant ? variacao(soma(r, "combustivel_total"), soma(ant, "combustivel_total")) : undefined} />
        <Kpi rotulo="Manutenção" valor={reais(soma(r, "manutencao"))} Icone={Wrench} tom="ambar" delta={ant ? variacao(soma(r, "manutencao"), soma(ant, "manutencao")) : undefined} />
        <Kpi rotulo="Litros" valor={`${num(soma(r, "litros"), 3)} L`} Icone={Droplet} tom="roxo" detalhe={`${r.itens.length} ${unidade.toLowerCase()}(s)`} />
      </GradeKpi>

      {r.itens.length === 0 ? <Cartao><Vazio titulo="Sem gastos no período" /></Cartao> : (
        <>
          <Cartao titulo={`Gasto por ${unidade.toLowerCase()}`} Icone={BarChart3}>
            <Ranking
              dados={r.itens.map((i) => ({ nome: i.unidade, tanque: i.combustivel_tanque, posto: i.combustivel_posto, manutencao: i.manutencao }))}
              rotulo="nome" empilhar
              series={[{ chave: "posto", nome: "Combustível (posto)" }, { chave: "tanque", nome: "Combustível (tanque)", cor: "#0891B2" }, { chave: "manutencao", nome: "Manutenção", cor: "#F59E0B" }]}
            />
          </Cartao>
          <Cartao titulo="Detalhamento" Icone={ListOrdered} semPadding>
            <Tabela minW={900}>
              <thead>
                <tr>
                  <th className={TH}>{unidade}</th><th className={THN}>Veículos</th><th className={THN}>Litros</th><th className={THN}>Comb. tanque</th>
                  <th className={THN}>Comb. posto</th><th className={THN}>Manutenção</th><th className={THN}>Total</th><th className={TH}>Participação</th>
                </tr>
              </thead>
              <tbody>
                {r.itens.map((i) => (
                  <tr key={i.unidade_id ?? "sem"}>
                    <td className={`${TD} font-medium ${i.unidade_id ? "text-text-title" : "italic text-text-subtle"}`}>{i.unidade}</td>
                    <td className={TDN}>{i.veiculos}</td>
                    <td className={TDN}>{num(i.litros, 3)}</td>
                    <td className={TDN}>{reais(i.combustivel_tanque)}</td>
                    <td className={TDN}>{reais(i.combustivel_posto)}</td>
                    <td className={TDN}>{reais(i.manutencao)}</td>
                    <td className={`${TDN} font-semibold text-text-title`}>{reais(i.total)}</td>
                    <td className={TD}><BarraPct pct={i.participacao_pct} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className={TF}>Total</td>
                  <td className={TFN}>{r.itens.reduce((s, i) => s + i.veiculos, 0)}</td>
                  <td className={TFN}>{num(soma(r, "litros"), 3)}</td>
                  <td className={TFN}>{reais(r.itens.reduce((s, i) => s + i.combustivel_tanque, 0))}</td>
                  <td className={TFN}>{reais(r.itens.reduce((s, i) => s + i.combustivel_posto, 0))}</td>
                  <td className={TFN}>{reais(soma(r, "manutencao"))}</td>
                  <td className={TFN}>{reais(r.total)}</td>
                  <td className={TF} />
                </tr>
              </tfoot>
            </Tabela>
          </Cartao>
        </>
      )}
    </div>
  );
}

/* ───────────────────────── Consumo por veículo ───────────────────────── */

export function RelConsumo({ dataInicio, dataFim, onTotal }: Props) {
  const { dados: r, carregando } = useRelatorio<RelatorioConsumo>(() => api.relatorioConsumoVeiculos(per(dataInicio, dataFim)), [dataInicio, dataFim]);
  useEffect(() => { onTotal?.(r ? r.itens.length : null); }, [r, onTotal]);
  const t = useMemo(() => {
    const it = r?.itens ?? [];
    const km = it.reduce((s, i) => s + (i.usa_horimetro ? 0 : i.km_rodados), 0);
    const custo = it.reduce((s, i) => s + i.custo_total, 0);
    const kmCusto = it.filter((i) => !i.usa_horimetro).reduce((s, i) => s + i.custo_total, 0);
    return {
      km, custo,
      litros: it.reduce((s, i) => s + i.litros, 0),
      comb: it.reduce((s, i) => s + i.valor_combustivel, 0),
      manut: it.reduce((s, i) => s + i.valor_manutencao, 0),
      custoKm: km ? kmCusto / km : null,
      topCusto: [...it].sort((a, b) => b.custo_total - a.custo_total).slice(0, 10),
      topConsumo: it.filter((i) => i.consumo_medio).sort((a, b) => (b.consumo_medio ?? 0) - (a.consumo_medio ?? 0)).slice(0, 10),
    };
  }, [r]);
  if (carregando && !r) return <Esqueleto />;
  if (!r) return null;

  return (
    <div className={`space-y-5 transition-opacity ${carregando ? "opacity-60" : ""}`}>
      <GradeKpi>
        <Kpi rotulo="Custo total" valor={reais(t.custo)} Icone={Wallet} destaque detalhe={`${r.itens.length} veículo(s)`} />
        <Kpi rotulo="Km rodados" valor={`${num(t.km, 0)} km`} Icone={Route} tom="verde" />
        <Kpi rotulo="Litros" valor={`${num(t.litros, 3)} L`} Icone={Droplet} tom="roxo" />
        <Kpi rotulo="Custo médio / km" valor={t.custoKm != null ? t.custoKm.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 3 }) : "—"} Icone={Gauge} tom="ambar" />
      </GradeKpi>

      {r.itens.length === 0 ? <Cartao><Vazio titulo="Nenhum veículo rodou no período" /></Cartao> : (
        <>
          <div className="grid gap-5 xl:grid-cols-2">
            <Cartao titulo="Maiores custos" Icone={Trophy}>
              <Ranking dados={t.topCusto.map((i) => ({ nome: i.placa, combustivel: i.valor_combustivel, manutencao: i.valor_manutencao }))} rotulo="nome" empilhar
                series={[{ chave: "combustivel", nome: "Combustível" }, { chave: "manutencao", nome: "Manutenção", cor: "#F59E0B" }]} />
            </Cartao>
            <Cartao titulo="Melhor consumo (km/L)" Icone={Gauge}>
              {t.topConsumo.length ? (
                <Ranking dados={t.topConsumo.map((i) => ({ nome: i.placa, consumo: i.consumo_medio ?? 0 }))} rotulo="nome" formato="numero"
                  series={[{ chave: "consumo", nome: "km/L", cor: "#16A34A" }]} />
              ) : <Vazio titulo="Sem consumo calculado" texto="O consumo aparece depois de dois abastecimentos com tanque cheio." />}
            </Cartao>
          </div>
          <Cartao titulo="Detalhamento por veículo" Icone={ListOrdered} semPadding>
            <Tabela minW={1000}>
              <thead>
                <tr>
                  <th className={TH}>Veículo</th><th className={THN}>KM / horas</th><th className={THN}>Litros</th><th className={THN}>Consumo médio</th>
                  <th className={THN}>Combustível</th><th className={THN}>Manutenção</th><th className={THN}>Total</th><th className={THN}>Custo/km</th>
                </tr>
              </thead>
              <tbody>
                {r.itens.map((i) => (
                  <tr key={i.placa}>
                    <td className={TD}>
                      <span className="rounded bg-navy px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-wider text-white">{i.placa}</span>
                      {i.modelo && <span className="mt-0.5 block text-meta text-text-subtle">{i.modelo}</span>}
                    </td>
                    <td className={TDN}>{i.usa_horimetro ? `${num(i.horas_trabalhadas ?? 0, 1)} h` : `${num(i.km_rodados, 0)} km`}</td>
                    <td className={TDN}>{num(i.litros, 3)}</td>
                    <td className={TDN}>{i.consumo_l_h ? `${num(i.consumo_l_h)} L/h` : i.consumo_medio ? `${num(i.consumo_medio)} km/L` : "—"}</td>
                    <td className={TDN}>{reais(i.valor_combustivel)}</td>
                    <td className={TDN}>{reais(i.valor_manutencao)}</td>
                    <td className={`${TDN} font-semibold text-text-title`}>{reais(i.custo_total)}</td>
                    <td className={TDN}>{i.custo_por_km ? i.custo_por_km.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 3 }) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className={TF}>Total</td>
                  <td className={TFN}>{num(t.km, 0)} km</td>
                  <td className={TFN}>{num(t.litros, 3)}</td>
                  <td className={TF} />
                  <td className={TFN}>{reais(t.comb)}</td>
                  <td className={TFN}>{reais(t.manut)}</td>
                  <td className={TFN}>{reais(t.custo)}</td>
                  <td className={TF} />
                </tr>
              </tfoot>
            </Tabela>
          </Cartao>
        </>
      )}
    </div>
  );
}

/* ───────────────────────── Estoque dos tanques ───────────────────────── */

export function RelEstoque({ onTotal }: Props) {
  const { dados: r, carregando } = useRelatorio<RelatorioEstoque>(() => api.relatorioEstoque(), []);
  useEffect(() => { onTotal?.(r ? r.tanques.length : null); }, [r, onTotal]);
  if (carregando && !r) return <Esqueleto />;
  if (!r) return null;
  const cap = r.tanques.reduce((s, t) => s + t.capacidade, 0);
  const atual = r.tanques.reduce((s, t) => s + t.estoque_atual, 0);
  const baixos = r.tanques.filter((t) => t.estoque_atual <= t.estoque_minimo).length;
  const entradas = Object.values(r.entradas_30d).reduce((s, e) => ({ litros: s.litros + e.litros, valor: s.valor + e.valor }), { litros: 0, valor: 0 });

  return (
    <div className="space-y-5">
      <GradeKpi>
        <Kpi rotulo="Estoque atual" valor={`${num(atual, 0)} L`} Icone={Droplet} destaque detalhe={`de ${num(cap, 0)} L`} />
        <Kpi rotulo="Ocupação" valor={`${cap ? Math.round((atual / cap) * 100) : 0}%`} Icone={Gauge} tom="verde" detalhe={`${r.tanques.length} tanque(s)`} />
        <Kpi rotulo="Abaixo do mínimo" valor={num(baixos, 0)} Icone={AlertTriangle} tom={baixos ? "vermelho" : "cinza"} />
        <Kpi rotulo="Entradas 30 dias" valor={`${num(entradas.litros, 0)} L`} Icone={Warehouse} tom="roxo" detalhe={reais(entradas.valor)} />
      </GradeKpi>
      {r.tanques.length === 0 ? <Cartao><Vazio titulo="Nenhum tanque próprio cadastrado" texto="Cadastre os tanques em Combustíveis para acompanhar o estoque." /></Cartao> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {r.tanques.map((t) => {
            const pct = t.capacidade > 0 ? (t.estoque_atual / t.capacidade) * 100 : 0;
            const baixo = t.estoque_atual <= t.estoque_minimo;
            const cor = baixo ? "from-[#B42318] to-[#F04438]" : pct <= 30 ? "from-[#B54708] to-[#F59E0B]" : "from-[#106D34] to-[#22C55E]";
            const ent = r.entradas_30d[t.id];
            return (
              <div key={t.id} className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-surface-border">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#EFF4FF] text-primary"><Container size={20} /></span>
                    <div>
                      <p className="font-semibold text-text-title">{t.nome}</p>
                      <p className="text-meta text-text-subtle">{t.combustivel ?? "—"}</p>
                    </div>
                  </div>
                  {baixo && <span className="rounded-pill bg-[#FEE4E2] px-2 py-0.5 text-meta font-semibold text-[#B42318]">Abaixo do mínimo</span>}
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <span className="text-2xl font-bold tabular-nums text-text-title">{num(t.estoque_atual, 0)} <span className="text-body-sm font-medium text-text-subtle">L</span></span>
                  <span className="text-h3 font-bold tabular-nums text-text-title">{pct.toFixed(0)}%</span>
                </div>
                <div className="relative mt-2 h-3 overflow-hidden rounded-full bg-[#EEF1F6]">
                  <div className={`h-full rounded-full bg-gradient-to-r ${cor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  {t.capacidade > 0 && <div className="absolute inset-y-0 w-0.5 bg-[#B42318]/70" style={{ left: `${Math.min((t.estoque_minimo / t.capacidade) * 100, 100)}%` }} title="Mínimo" />}
                </div>
                <div className="mt-2 flex justify-between text-meta text-text-subtle">
                  <span>Capacidade {num(t.capacidade, 0)} L</span>
                  <span>Mínimo {num(t.estoque_minimo, 0)} L</span>
                </div>
                <p className="mt-3 border-t border-surface-border pt-3 text-meta text-text-body">
                  {ent ? <>Entradas 30 dias: <b>+{num(ent.litros, 0)} L</b> ({reais(ent.valor)})</> : "Sem entradas nos últimos 30 dias"}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Manutenções ───────────────────────── */

const STATUS_MANUT: Record<string, { rotulo: string; classe: string }> = {
  ABERTA: { rotulo: "Aberta", classe: "bg-[#EFF4FF] text-[#1D4ED8]" },
  AGUARDANDO_ORCAMENTO: { rotulo: "Aguardando orçamento", classe: "bg-[#FFF4D6] text-[#5C4200]" },
  APROVADA: { rotulo: "Aprovada", classe: "bg-[#F4F3FF] text-[#5925DC]" },
  EM_MANUTENCAO: { rotulo: "Em manutenção", classe: "bg-[#FFF4D6] text-[#B54708]" },
  CONCLUIDA: { rotulo: "Concluída", classe: "bg-[#E7F8EC] text-[#106D34]" },
  CANCELADA: { rotulo: "Cancelada", classe: "bg-[#FEE4E2] text-[#B42318]" },
};
const statusManut = (s: string) => STATUS_MANUT[s] ?? { rotulo: s.replace(/_/g, " ").toLowerCase(), classe: "bg-[#F2F4F7] text-[#475467]" };

export function RelManutencoes({ dataInicio, dataFim, onTotal }: Props) {
  const { dados: r, carregando } = useRelatorio<RelatorioManutencoes>(() => api.relatorioManutencoes(per(dataInicio, dataFim)), [dataInicio, dataFim]);
  const [ant, setAnt] = useState<RelatorioManutencoes | null>(null);
  useEffect(() => {
    const p = periodoAnterior(dataInicio, dataFim);
    if (p) api.relatorioManutencoes(per(p[0], p[1])).then(setAnt).catch(() => setAnt(null));
  }, [dataInicio, dataFim]);
  useEffect(() => { onTotal?.(r ? r.total_registros : null); }, [r, onTotal]);
  const g = useMemo(() => {
    const it = r?.itens ?? [];
    const st = new Map<string, number>(), of = new Map<string, number>();
    for (const m of it) {
      st.set(m.status, (st.get(m.status) ?? 0) + 1);
      of.set(m.oficina ?? "Sem oficina", (of.get(m.oficina ?? "Sem oficina") ?? 0) + m.valor_total);
    }
    return {
      status: Array.from(st.entries()).map(([k, v]) => ({ nome: statusManut(k).rotulo, valor: v })).sort((a, b) => b.valor - a.valor),
      oficinas: Array.from(of.entries()).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor).slice(0, 8),
      abertas: it.filter((m) => !["CONCLUIDA", "CANCELADA"].includes(m.status)).length,
    };
  }, [r]);
  if (carregando && !r) return <Esqueleto />;
  if (!r) return null;

  return (
    <div className={`space-y-5 transition-opacity ${carregando ? "opacity-60" : ""}`}>
      <GradeKpi>
        <Kpi rotulo="Valor total" valor={reais(r.valor_total)} Icone={Wallet} destaque delta={ant ? variacao(r.valor_total, ant.valor_total) : undefined} />
        <Kpi rotulo="Manutenções" valor={num(r.total_registros, 0)} Icone={Wrench} tom="ambar" delta={ant ? variacao(r.total_registros, ant.total_registros) : undefined} />
        <Kpi rotulo="Valor médio" valor={reais(r.total_registros ? r.valor_total / r.total_registros : null)} Icone={BarChart3} tom="roxo" />
        <Kpi rotulo="Em aberto" valor={num(g.abertas, 0)} Icone={Clock} tom={g.abertas ? "vermelho" : "cinza"} />
      </GradeKpi>

      {r.itens.length === 0 ? <Cartao><Vazio titulo="Nenhuma manutenção no período" /></Cartao> : (
        <>
          <div className="grid gap-5 xl:grid-cols-5">
            <div className="xl:col-span-2">
              <Cartao titulo="Por situação" Icone={PieChart}><Rosca dados={g.status} formato="numero" rotuloTotal="Manutenções" /></Cartao>
            </div>
            <div className="xl:col-span-3">
              <Cartao titulo="Valor por oficina" Icone={BarChart3}>
                <Ranking dados={g.oficinas} rotulo="nome" series={[{ chave: "valor", nome: "Valor", cor: "#F59E0B" }]} />
              </Cartao>
            </div>
          </div>
          <Cartao titulo="Manutenções do período" Icone={ListOrdered} semPadding>
            <Tabela minW={800}>
              <thead>
                <tr><th className={TH}>Veículo</th><th className={TH}>Tipo</th><th className={TH}>Situação</th><th className={TH}>Oficina</th><th className={TH}>Solicitação</th><th className={THN}>Valor</th></tr>
              </thead>
              <tbody>
                {r.itens.map((m, i) => {
                  const s = statusManut(m.status);
                  return (
                    <tr key={i}>
                      <td className={TD}><span className="rounded bg-navy px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-wider text-white">{m.placa}</span></td>
                      <td className={`${TD} capitalize`}>{m.tipo.replace(/_/g, " ").toLowerCase()}</td>
                      <td className={TD}><span className={`whitespace-nowrap rounded-pill px-2 py-0.5 text-meta font-medium capitalize ${s.classe}`}>{s.rotulo}</span></td>
                      <td className={TD}>{m.oficina ?? "—"}</td>
                      <td className={`${TD} tabular-nums`}>{new Date(m.data_solicitacao + "T12:00").toLocaleDateString("pt-BR")}</td>
                      <td className={`${TDN} font-semibold text-text-title`}>{reais(m.valor_total)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr><td className={TF} colSpan={5}>Total ({num(r.total_registros, 0)} manutenções)</td><td className={TFN}>{reais(r.valor_total)}</td></tr>
              </tfoot>
            </Tabela>
          </Cartao>
        </>
      )}
    </div>
  );
}

/* ───────────────────────── Validade das CNHs ───────────────────────── */

const SIT_CNH: Record<string, { rotulo: string; classe: string; ordem: number }> = {
  VENCIDA: { rotulo: "Vencida", classe: "bg-[#FEE4E2] text-[#B42318]", ordem: 0 },
  CRITICA: { rotulo: "Vence em até 7 dias", classe: "bg-[#FFE6D5] text-[#C4320A]", ordem: 1 },
  ATENCAO: { rotulo: "Vence em até 30 dias", classe: "bg-[#FFF4D6] text-[#B54708]", ordem: 2 },
  OK: { rotulo: "Em dia", classe: "bg-[#E7F8EC] text-[#106D34]", ordem: 3 },
};

export function RelCNH({ onTotal }: Props) {
  const { dados: r, carregando } = useRelatorio<{ itens: CNHItem[] }>(() => api.relatorioCNH(), []);
  const [filtro, setFiltro] = useState("");
  useEffect(() => { onTotal?.(r ? r.itens.length : null); }, [r, onTotal]);
  if (carregando && !r) return <Esqueleto />;
  if (!r) return null;
  const conta = (s: string) => r.itens.filter((c) => (c.situacao ?? "OK") === s).length;
  const itens = r.itens
    .filter((c) => !filtro || (c.situacao ?? "OK") === filtro)
    .sort((a, b) => (SIT_CNH[a.situacao ?? "OK"]?.ordem ?? 9) - (SIT_CNH[b.situacao ?? "OK"]?.ordem ?? 9) || a.dias_restantes - b.dias_restantes);
  const opcoes: Opcao[] = Object.entries(SIT_CNH).map(([id, v]) => ({ id, nome: v.rotulo }));
  const validade = (c: CNHItem) => (c.validade ?? c.cnh_validade ?? "").slice(0, 10).split("-").reverse().join("/");

  return (
    <div className="space-y-5">
      <GradeKpi>
        <Kpi rotulo="Vencidas" valor={conta("VENCIDA")} Icone={AlertOctagon} tom={conta("VENCIDA") ? "vermelho" : "cinza"} destaque={conta("VENCIDA") > 0} />
        <Kpi rotulo="Até 7 dias" valor={conta("CRITICA")} Icone={AlertTriangle} tom={conta("CRITICA") ? "ambar" : "cinza"} />
        <Kpi rotulo="Até 30 dias" valor={conta("ATENCAO")} Icone={Clock} tom="ambar" />
        <Kpi rotulo="Em dia" valor={conta("OK")} Icone={BadgeCheck} tom="verde" detalhe={`de ${r.itens.length} motorista(s)`} />
      </GradeKpi>
      <Cartao titulo="Motoristas" Icone={IdCard} semPadding acao={
        <div className="w-56"><FiltroSelect rotulo="Situação" Icone={CheckCircle2} valor={filtro} onChange={setFiltro} opcoes={opcoes} todos="Todas" /></div>
      }>
        {itens.length === 0 ? <Vazio titulo="Nenhum motorista nesta situação" texto="Escolha outra situação no filtro." /> : (
          <Tabela minW={600}>
            <thead><tr><th className={TH}>Motorista</th><th className={TH}>Validade</th><th className={THN}>Dias restantes</th><th className={TH}>Situação</th></tr></thead>
            <tbody>
              {itens.map((c) => {
                const s = SIT_CNH[c.situacao ?? "OK"] ?? SIT_CNH.OK;
                return (
                  <tr key={c.id}>
                    <td className={`${TD} font-medium text-text-title`}>{c.nome}</td>
                    <td className={`${TD} tabular-nums`}>{validade(c) || "—"}</td>
                    <td className={TDN}>{c.dias_restantes < 0 ? `${Math.abs(c.dias_restantes)} dias atrás` : `${c.dias_restantes} dias`}</td>
                    <td className={TD}><span className={`whitespace-nowrap rounded-pill px-2 py-0.5 text-meta font-medium ${s.classe}`}>{s.rotulo}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </Tabela>
        )}
      </Cartao>
    </div>
  );
}

/* ───────────────────────── Prestação de contas (prévia) ───────────────────────── */

const MOEDA = new Set(["Gasto total (R$)", "Combustível (R$)", "Manutenção (R$)", "Custo por km (R$)"]);

export function RelPrestacao({ dataInicio, dataFim, unidade, setUnidade, publico }: Props & { unidade: string; setUnidade: (v: string) => void }) {
  const [p, setP] = useState<PreviaPrestacao | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [unidades, setUnidades] = useState<Opcao[]>([]);
  useEffect(() => { api.listUnidades(true).then((u) => setUnidades(u.map((x) => ({ id: x.id, nome: x.nome })))).catch(() => setUnidades([])); }, []);
  useEffect(() => {
    setCarregando(true);
    api.previaPrestacao({ inicio: dataInicio, fim: dataFim, unidade_id: unidade || undefined })
      .then(setP)
      .catch((e) => { setP(null); toast.error((e as Error).message); })
      .finally(() => setCarregando(false));
  }, [dataInicio, dataFim, unidade]);

  const fmt = (k: string, v: number | null) =>
    v == null ? "—" : MOEDA.has(k) ? reais(v) : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const comp = (k: string) => p?.comparativo.find((c) => c.indicador === k);
  const pend = p?.pendencias;
  const totalPend = pend ? pend.sem_nota + pend.divergentes + pend.com_alerta : 0;
  const KPIS: [string, typeof Wallet, "azul" | "verde" | "ambar" | "roxo"][] = [
    ["Gasto total (R$)", Wallet, "azul"], ["Combustível (R$)", Fuel, "verde"], ["Manutenção (R$)", Wrench, "ambar"], ["Litros", Droplet, "roxo"],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl bg-white p-5 shadow-card ring-1 ring-surface-border">
        <div className="w-full sm:w-72">
          <FiltroSelect rotulo={publico ? "Secretaria" : "Centro de custo"} Icone={Landmark} valor={unidade} onChange={setUnidade} opcoes={unidades} todos="Todas (consolidado)" />
        </div>
        <p className="flex max-w-md items-start gap-2 text-meta text-text-subtle">
          <FileSignature size={16} className="mt-0.5 shrink-0 text-primary" />
          Confira a prévia e use <b className="mx-0.5">Exportar</b> para baixar o PDF (com gráficos, assinaturas e QR code de verificação) ou o Excel.
        </p>
      </div>

      {carregando && !p && <Esqueleto />}
      {p && (
        <div className={`space-y-5 transition-opacity ${carregando ? "opacity-60" : ""}`}>
          <GradeKpi>
            {KPIS.map(([k, Icone, tom], i) => (
              <Kpi key={k} rotulo={k.replace(" (R$)", "")} valor={fmt(k, p.indicadores[k])} Icone={Icone} tom={tom} destaque={i === 0}
                delta={comp(k)?.var_anterior ?? null} />
            ))}
          </GradeKpi>

          <div className={`flex items-start gap-3 rounded-2xl border p-4 ${totalPend ? "border-[#FEC84B] bg-[#FFFAEB]" : "border-[#ABEFC6] bg-[#ECFDF3]"}`}>
            {totalPend ? <AlertTriangle size={20} className="mt-0.5 shrink-0 text-[#B54708]" /> : <BadgeCheck size={20} className="mt-0.5 shrink-0 text-[#067647]" />}
            <div>
              <p className={`text-body-sm font-semibold ${totalPend ? "text-[#B54708]" : "text-[#067647]"}`}>
                {totalPend ? `${totalPend} pendência(s) a conferir antes de assinar` : "Nenhuma pendência no período — pronto para assinar"}
              </p>
              {pend && totalPend > 0 && (
                <ul className="mt-1 space-y-0.5 text-body-sm text-text-body">
                  {pend.sem_nota > 0 && <li>• {pend.sem_nota} abastecimento(s) em posto sem nota fiscal ({reais(pend.sem_nota_valor)})</li>}
                  {pend.divergentes > 0 && <li>• {pend.divergentes} nota(s) com valor diferente do abastecido</li>}
                  {pend.com_alerta > 0 && <li>• {pend.com_alerta} abastecimento(s) com alerta de conferência</li>}
                </ul>
              )}
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-5">
            <div className="xl:col-span-3">
              <Cartao titulo="Período × anterior × ano anterior" Icone={BarChart3}>
                <Colunas
                  dados={["Combustível (R$)", "Manutenção (R$)"].map((k) => ({
                    nome: k.replace(" (R$)", ""), atual: comp(k)?.atual ?? 0, anterior: comp(k)?.anterior ?? 0, ano: comp(k)?.ano_anterior ?? 0,
                  }))}
                  x="nome"
                  series={[{ chave: "ano", nome: "Ano anterior", cor: "#98A2B3" }, { chave: "anterior", nome: "Período anterior", cor: "#93C5FD" }, { chave: "atual", nome: "Período", cor: "#1D4ED8" }]}
                />
              </Cartao>
            </div>
            <div className="xl:col-span-2">
              <Cartao titulo="Síntese (sai na 1ª página)" Icone={FileSignature}>
                <p className="text-body-sm leading-relaxed text-text-body">{p.sintese}</p>
              </Cartao>
            </div>
          </div>

          <Cartao titulo="Comparativo" Icone={Car} semPadding>
            <Tabela minW={720} altura="">
              <thead>
                <tr>
                  <th className={TH}>Indicador</th><th className={THN}>Período</th><th className={THN}>Anterior</th><th className={THN}>Variação</th>
                  <th className={THN}>Ano anterior</th><th className={THN}>Variação</th>
                </tr>
              </thead>
              <tbody>
                {p.comparativo.map((c) => {
                  const melhorMaior = c.indicador.startsWith("Consumo") || c.indicador.startsWith("Km");
                  return (
                    <tr key={c.indicador}>
                      <td className={`${TD} font-medium text-text-title`}>{c.indicador}</td>
                      <td className={`${TDN} font-semibold text-text-title`}>{fmt(c.indicador, c.atual)}</td>
                      <td className={`${TDN} text-text-subtle`}>{fmt(c.indicador, c.anterior)}</td>
                      <td className={TDN}><Delta v={c.var_anterior} menorMelhor={!melhorMaior} compacto /></td>
                      <td className={`${TDN} text-text-subtle`}>{fmt(c.indicador, c.ano_anterior)}</td>
                      <td className={TDN}><Delta v={c.var_ano_anterior} menorMelhor={!melhorMaior} compacto /></td>
                    </tr>
                  );
                })}
              </tbody>
            </Tabela>
          </Cartao>
        </div>
      )}
    </div>
  );
}
