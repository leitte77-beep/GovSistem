"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { AlertTriangle, Download, Info } from "lucide-react";
import { api, PainelSecretaria } from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";

type Preset = "mes" | "anterior" | "ano" | "personalizado";

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function periodoDo(preset: Preset): { inicio: string; fim: string } {
  const hoje = new Date();
  if (preset === "anterior") {
    const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
    return { inicio: iso(ini), fim: iso(fim) };
  }
  if (preset === "ano") return { inicio: iso(new Date(hoje.getFullYear(), 0, 1)), fim: iso(hoje) };
  return { inicio: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), fim: iso(hoje) };
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v: number, casas = 0) => v.toLocaleString("pt-BR", { maximumFractionDigits: casas });
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;

export default function MinhaSecretariaPage() {
  const [preset, setPreset] = useState<Preset>("mes");
  const [periodo, setPeriodo] = useState(periodoDo("mes"));
  const [unidadeId, setUnidadeId] = useState("");
  const [dados, setDados] = useState<PainelSecretaria | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setDados(await api.painelSecretaria({ ...periodo, unidade_id: unidadeId || undefined }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [periodo, unidadeId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const escolherPreset = (p: Preset) => {
    setPreset(p);
    if (p !== "personalizado") setPeriodo(periodoDo(p));
  };

  const titulo = useMemo(() => {
    if (!dados) return "Minha Secretaria";
    const sel = dados.secretarias.find((s) => s.id === unidadeId);
    if (sel) return sel.nome;
    if (dados.restrito && dados.secretarias.length === 1) return dados.secretarias[0].nome;
    return dados.restrito ? "Minhas secretarias" : "Todas as secretarias";
  }, [dados, unidadeId]);

  return (
    <RequirePermission perms="refueling.view">
      <div className="space-y-5">
        <div>
          <h1 className="text-h1 text-text-title">{titulo}</h1>
          <p className="text-body-sm text-text-subtle">Consumo, gastos e alertas dos veículos da secretaria.</p>
        </div>

        {/* Filtros — uma linha acima de tudo */}
        <div className="flex flex-wrap items-end gap-3 rounded-card border border-surface-border bg-white p-3 shadow-card">
          <div role="group" aria-label="Período" className="flex flex-wrap gap-1">
            {(
              [
                ["mes", "Mês atual"],
                ["anterior", "Mês anterior"],
                ["ano", "Ano atual"],
                ["personalizado", "Personalizado"],
              ] as [Preset, string][]
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                aria-pressed={preset === k}
                onClick={() => escolherPreset(k)}
                className={`btn btn-sm ${preset === k ? "btn-primary" : "btn-secondary"}`}
              >
                {l}
              </button>
            ))}
          </div>
          {preset === "personalizado" && (
            <>
              <label className="text-meta">
                De
                <input type="date" className="input mt-1" value={periodo.inicio}
                  onChange={(e) => e.target.value && setPeriodo((p) => ({ ...p, inicio: e.target.value }))} />
              </label>
              <label className="text-meta">
                Até
                <input type="date" className="input mt-1" value={periodo.fim}
                  onChange={(e) => e.target.value && setPeriodo((p) => ({ ...p, fim: e.target.value }))} />
              </label>
            </>
          )}
          {dados && dados.secretarias.length > 0 && (
            <div className="flex gap-2 sm:order-last">
              {(["pdf", "xlsx"] as const).map((fmt) => (
                <button key={fmt} type="button" className="btn btn-secondary btn-sm"
                  onClick={() => {
                    const q = new URLSearchParams({ formato: fmt, inicio: periodo.inicio, fim: periodo.fim, ...(unidadeId ? { unidade_id: unidadeId } : {}) });
                    api.baixarAnexo({ url: `/api/govfrota/secretaria/prestacao-contas?${q}`, nome: `prestacao-contas.${fmt}` })
                      .catch((e) => toast.error((e as Error).message));
                  }}>
                  <Download size={15} /> Prestação de contas ({fmt.toUpperCase()})
                </button>
              ))}
            </div>
          )}
          {dados && dados.secretarias.length > 1 && (
            <label className="ml-auto text-meta">
              Secretaria
              <select className="input mt-1" value={unidadeId} onChange={(e) => setUnidadeId(e.target.value)}>
                <option value="">{dados.restrito ? "Todas as minhas" : "Todas"}</option>
                {dados.secretarias.map((s) => (
                  <option key={s.id} value={s.id}>{s.nome}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        {carregando && !dados ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-card bg-surface-bg" />
            ))}
          </div>
        ) : dados && dados.secretarias.length === 0 ? (
          <div className="rounded-card border border-surface-border bg-white p-8 text-center text-body-sm text-text-subtle shadow-card">
            {dados.restrito
              ? "Seu usuário ainda não está vinculado a nenhuma secretaria. Peça ao administrador da frota."
              : "Nenhuma secretaria cadastrada. Cadastre em Configurações e associe os veículos a elas."}
          </div>
        ) : dados ? (
          <Conteudo dados={dados} />
        ) : null}
      </div>
    </RequirePermission>
  );
}

function Conteudo({ dados }: { dados: PainelSecretaria }) {
  const i = dados.indicadores;
  const tiles: { rotulo: string; valor: string; nota?: string; href?: string; alerta?: boolean }[] = [
    { rotulo: "Gasto no período", valor: brl(i.gasto) },
    { rotulo: "Litros consumidos", valor: `${num(i.litros, 1)} L` },
    { rotulo: "Abastecimentos", valor: num(i.abastecimentos), href: "/abastecimentos" },
    { rotulo: "Veículos ativos", valor: num(i.veiculos_ativos), href: "/veiculos" },
    { rotulo: "Km percorridos", valor: `${num(i.km_percorridos)} km` },
    { rotulo: "Custo por km", valor: i.custo_por_km != null ? brl(i.custo_por_km) : "—" },
    { rotulo: "Consumo médio", valor: i.consumo_km_l != null ? `${num(i.consumo_km_l, 2)} km/L` : "—" },
    {
      rotulo: "Com alerta para conferir",
      valor: num(i.com_alerta),
      alerta: i.com_alerta > 0,
      href: "/abastecimentos?com_alerta=sim",
    },
    // Abastecimentos em posto no período, pela nota fiscal enviada pelo posto.
    { rotulo: "Em posto, com nota fiscal", valor: brl(i.valor_com_nota ?? 0), href: "/notas-fiscais" },
    { rotulo: "Em posto, sem nota fiscal", valor: brl(i.valor_sem_nota ?? 0), href: "/notas-fiscais" },
  ];

  return (
    <>
      <section aria-label="Indicadores" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6">
        {tiles.map((t) => {
          const corpo = (
            <>
              <div className="flex items-center gap-1 text-meta text-text-subtle">
                {t.alerta && <AlertTriangle size={14} className="text-[#B54708]" aria-hidden />}
                {t.rotulo}
              </div>
              <div className="mt-1 text-h2 text-text-title tabular-nums">{t.valor}</div>
            </>
          );
          const classe = "block rounded-card border border-surface-border bg-white p-4 shadow-card";
          return t.href ? (
            <Link key={t.rotulo} href={t.href} className={`${classe} ring-focus hover:shadow-elevated`}>
              {corpo}
            </Link>
          ) : (
            <div key={t.rotulo} className={classe}>
              {corpo}
            </div>
          );
        })}
      </section>

      <p className="flex items-start gap-2 text-meta text-text-subtle">
        <Info size={14} className="mt-0.5 flex-shrink-0" aria-hidden />
        {dados.aviso} Faturamento considera só abastecimentos em posto credenciado.
      </p>

      <div className="grid gap-4 xl:grid-cols-2">
        <Bloco titulo="Gasto mensal" descricao="Últimos 12 meses">
          <Colunas
            itens={dados.mensal.map((m) => ({ chave: m.mes, rotulo: rotuloMes(m.mes), valor: m.gasto, texto: brl(m.gasto),
              detalhe: `${num(m.litros, 1)} L · ${m.abastecimentos} abastecimento(s)` }))}
          />
        </Bloco>
        <Bloco titulo="Litros por mês" descricao="Últimos 12 meses">
          <Colunas
            itens={dados.mensal.map((m) => ({ chave: m.mes, rotulo: rotuloMes(m.mes), valor: m.litros, texto: `${num(m.litros, 1)} L`,
              detalhe: m.custo_por_km != null ? `${brl(m.custo_por_km)} por km` : "Sem km registrado" }))}
          />
        </Bloco>
        <Bloco titulo="Gasto por veículo" descricao="No período">
          <Barras itens={[...dados.veiculos].filter((v) => v.gasto > 0).sort((a, b) => b.gasto - a.gasto).slice(0, 10)
            .map((v) => ({ chave: v.veiculo_id, rotulo: v.placa, valor: v.gasto, texto: brl(v.gasto) }))} vazio="Sem abastecimentos no período." />
        </Bloco>
        <Bloco titulo="Combustível por tipo" descricao="Litros no período">
          <Barras itens={dados.por_combustivel.map((c) => ({ chave: c.combustivel, rotulo: c.combustivel, valor: c.litros,
            texto: `${num(c.litros, 1)} L · ${brl(c.gasto)}` }))} vazio="Sem abastecimentos no período." />
        </Bloco>
      </div>

      <Bloco titulo="Veículos da secretaria" descricao="Consumo e custo no período">
        <TabelaVeiculos veiculos={dados.veiculos} />
      </Bloco>

      <Bloco titulo="Motoristas" descricao="Quem abasteceu os veículos da secretaria no período">
        <TabelaMotoristas motoristas={dados.motoristas} />
      </Bloco>

      <Bloco titulo="Alertas para fiscalização" descricao="Indicadores para conferência — não são decisões automáticas">
        {dados.alertas.length === 0 ? (
          <p className="py-6 text-center text-body-sm text-text-subtle">Nenhum alerta no período.</p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              {dados.alertas_por_tipo.map((a) => (
                <span key={a.codigo} className="rounded-pill bg-[#FFF4D6] px-2.5 py-1 text-meta font-medium text-[#805600]">
                  {a.descricao}: {a.quantidade}
                </span>
              ))}
            </div>
            <ul className="divide-y divide-surface-border">
              {dados.alertas.map((a) => (
                <li key={a.abastecimento_id} className="py-2 text-body-sm">
                  <Link href={`/abastecimentos/${a.abastecimento_id}`} className="block hover:text-[#1D4ED8]">
                    <span className="font-medium text-text-title">
                      {new Date(a.data).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · {a.placa ?? "—"}
                    </span>
                    <span className="text-text-subtle">
                      {" "}· {num(a.litros, 1)} L · {a.local ?? "—"}
                      {a.motorista ? ` · ${a.motorista}` : ""}
                    </span>
                    <span className="block text-meta text-[#805600]">{a.alertas.map((x) => x.descricao).join(" · ")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Bloco>
    </>
  );
}

function Bloco({ titulo, descricao, children }: { titulo: string; descricao?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-surface-border bg-white p-4 shadow-card">
      <h2 className="text-label font-semibold text-text-title">{titulo}</h2>
      {descricao && <p className="mb-3 text-meta text-text-subtle">{descricao}</p>}
      {children}
    </section>
  );
}

type Item = { chave: string; rotulo: string; valor: number; texto: string; detalhe?: string };

/** Colunas de uma série só (uma cor); valor exato no hover/foco e na tabela. */
function Colunas({ itens }: { itens: Item[] }) {
  const max = Math.max(...itens.map((i) => i.valor), 0);
  if (max === 0) return <p className="py-10 text-center text-body-sm text-text-subtle">Sem dados nos últimos 12 meses.</p>;
  return (
    <div className="flex h-56 items-end gap-[2px]" role="list">
      {itens.map((i) => (
        <div key={i.chave} role="listitem" tabIndex={0} aria-label={`${i.rotulo}: ${i.texto}`}
          className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 outline-none">
          <div className="w-full max-w-[28px] rounded-t-[4px] bg-[#1D5BD6] transition-colors group-hover:bg-[#1E40AF] group-focus:bg-[#1E40AF]"
            style={{ height: `${Math.max((i.valor / max) * 180, i.valor > 0 ? 3 : 1)}px` }} />
          <span className="max-w-full truncate text-[11px] text-text-subtle">{i.rotulo}</span>
          <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden w-max -translate-x-1/2 rounded-btn bg-[#101828] px-3 py-2 text-meta text-white shadow-elevated group-hover:block group-focus:block">
            <span className="block font-medium">{i.rotulo}</span>
            <span className="block">{i.texto}</span>
            {i.detalhe && <span className="block text-white/70">{i.detalhe}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Barras horizontais com rótulo e valor em texto (legíveis sem cor). */
function Barras({ itens, vazio }: { itens: Item[]; vazio: string }) {
  const max = Math.max(...itens.map((i) => i.valor), 0);
  if (max === 0) return <p className="py-10 text-center text-body-sm text-text-subtle">{vazio}</p>;
  return (
    <ul className="space-y-2">
      {itens.map((i) => (
        <li key={i.chave} className="text-body-sm">
          <div className="flex justify-between gap-2">
            <span className="truncate font-medium text-text-title">{i.rotulo}</span>
            <span className="flex-shrink-0 tabular-nums text-text-body">{i.texto}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-surface-bg" aria-hidden>
            <div className="h-full rounded-full bg-[#1D5BD6]" style={{ width: `${Math.max((i.valor / max) * 100, 1)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function TabelaVeiculos({ veiculos }: { veiculos: PainelSecretaria["veiculos"] }) {
  if (veiculos.length === 0) {
    return <p className="py-6 text-center text-body-sm text-text-subtle">Nenhum veículo vinculado a esta secretaria.</p>;
  }
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[900px] text-body-sm">
        <thead>
          <tr className="border-b border-surface-border text-left text-meta uppercase tracking-wide text-text-subtle">
            <th className="pb-2 font-medium">Veículo</th>
            <th className="pb-2 font-medium">Secretaria</th>
            <th className="pb-2 font-medium">Combustível</th>
            <th className="pb-2 text-right font-medium">Hodômetro</th>
            <th className="pb-2 text-right font-medium">Abast.</th>
            <th className="pb-2 text-right font-medium">Litros</th>
            <th className="pb-2 text-right font-medium">Gasto</th>
            <th className="pb-2 text-right font-medium">Km</th>
            <th className="pb-2 text-right font-medium">km/L</th>
            <th className="pb-2 text-right font-medium">R$/km</th>
          </tr>
        </thead>
        <tbody>
          {veiculos.map((v) => (
            <tr key={v.veiculo_id} className="border-b border-surface-border last:border-0">
              <td className="py-2">
                <Link href={`/veiculos/${v.veiculo_id}`} className="font-medium text-text-title hover:text-[#1D4ED8]">
                  {v.placa}
                </Link>
                <span className="block text-meta text-text-subtle">
                  {v.modelo ?? "—"}
                  {v.patrimonio ? ` · Pat. ${v.patrimonio}` : ""}
                </span>
              </td>
              <td className="py-2">{v.secretaria ?? "—"}</td>
              <td className="py-2">{v.combustiveis.join(", ") || "—"}</td>
              <td className="py-2 text-right tabular-nums">
                {num(v.hodometro)} {v.usa_horimetro ? "h" : "km"}
              </td>
              <td className="py-2 text-right tabular-nums">{v.abastecimentos}</td>
              <td className="py-2 text-right tabular-nums">{num(v.litros, 1)}</td>
              <td className="py-2 text-right tabular-nums">{brl(v.gasto)}</td>
              <td className="py-2 text-right tabular-nums">{v.km_percorridos ? num(v.km_percorridos) : "—"}</td>
              <td className="py-2 text-right tabular-nums">{v.consumo_km_l != null ? num(v.consumo_km_l, 2) : "—"}</td>
              <td className="py-2 text-right tabular-nums">{v.custo_por_km != null ? brl(v.custo_por_km) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TabelaMotoristas({ motoristas }: { motoristas: PainelSecretaria["motoristas"] }) {
  if (motoristas.length === 0) {
    return <p className="py-6 text-center text-body-sm text-text-subtle">Nenhum abastecimento com motorista identificado no período.</p>;
  }
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[760px] text-body-sm">
        <thead>
          <tr className="border-b border-surface-border text-left text-meta uppercase tracking-wide text-text-subtle">
            <th className="pb-2 font-medium">Motorista</th>
            <th className="pb-2 font-medium">CNH</th>
            <th className="pb-2 font-medium">Veículos</th>
            <th className="pb-2 text-right font-medium">Abast.</th>
            <th className="pb-2 text-right font-medium">Litros</th>
            <th className="pb-2 text-right font-medium">Gasto</th>
            <th className="pb-2 font-medium">Último</th>
          </tr>
        </thead>
        <tbody>
          {motoristas.map((m) => (
            <tr key={m.motorista_id} className="border-b border-surface-border last:border-0">
              <td className="py-2">
                <span className="font-medium text-text-title">{m.nome}</span>
                {m.matricula && <span className="block text-meta text-text-subtle">Mat. {m.matricula}</span>}
                {!m.ativo && <span className="block text-meta text-text-subtle">Inativo</span>}
              </td>
              <td className="py-2">
                {m.cnh_categoria ?? "—"}
                {m.cnh_validade && (
                  <span className={`block text-meta ${m.cnh_vencida ? "font-medium text-[#BA1A1A]" : "text-text-subtle"}`}>
                    {m.cnh_vencida ? "Vencida em " : "Válida até "}{new Date(m.cnh_validade + "T12:00").toLocaleDateString("pt-BR")}
                  </span>
                )}
              </td>
              <td className="py-2">{m.veiculos.join(", ")}</td>
              <td className="py-2 text-right tabular-nums">{m.abastecimentos}</td>
              <td className="py-2 text-right tabular-nums">{num(m.litros, 1)}</td>
              <td className="py-2 text-right tabular-nums">{brl(m.gasto)}</td>
              <td className="py-2">{m.ultimo_abastecimento ? new Date(m.ultimo_abastecimento).toLocaleDateString("pt-BR") : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
