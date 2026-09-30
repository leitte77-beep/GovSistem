"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import {
  Archive,
  ArrowLeft,
  Car,
  Copy,
  Fuel,
  Gauge,
  Pencil,
  ShieldCheck,
  Trash2,
  Upload,
  Wrench,
  X,
} from "lucide-react";
import { api, Abastecimento, Combustivel, DocumentoVeiculo, Manutencao, Ocorrencia, Veiculo } from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";
import { useAuth } from "@/lib/auth";
import { StatusBadge } from "@/components/veiculo/StatusBadge";
import { FotoVeiculo } from "@/components/veiculo/FotoVeiculo";
import { VeiculoFormDrawer } from "@/components/veiculo/VeiculoFormDrawer";
import {
  formatarConsumo,
  formatarData,
  formatarHorimetro,
  formatarKm,
  formatarMoeda,
  nomeTipo,
} from "@/lib/veiculos";

type Aba = "resumo" | "abastecimentos" | "manutencoes" | "ocorrencias" | "custos" | "documentos" | "historico";

const STATUS_MANUT_CLASSE: Record<string, string> = {
  ABERTA: "bg-gray-100 text-gray-600",
  AGUARDANDO_ORCAMENTO: "bg-orange-50 text-[#B54708]",
  APROVADA: "bg-blue-50 text-[#1D4ED8]",
  EM_MANUTENCAO: "bg-indigo-50 text-indigo-600",
  CONCLUIDA: "bg-green-50 text-[#067647]",
  CANCELADA: "bg-red-50 text-[#B42318]",
};

const GRAVIDADE_CLASSE: Record<string, string> = {
  BAIXA: "bg-gray-100 text-gray-600",
  MEDIA: "bg-blue-50 text-[#1D4ED8]",
  ALTA: "bg-orange-50 text-[#B54708]",
  CRITICA: "bg-red-50 text-[#B42318]",
};

export default function DetalheVeiculoPage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const [veiculo, setVeiculo] = useState<Veiculo | null>(null);
  const [abastecimentos, setAbastecimentos] = useState<Abastecimento[]>([]);
  const [manutencoes, setManutencoes] = useState<Manutencao[]>([]);
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([]);
  const [documentos, setDocumentos] = useState<DocumentoVeiculo[]>([]);
  const [combustiveis, setCombustiveis] = useState<Combustivel[]>([]);
  const [tipoOrganizacao, setTipoOrganizacao] = useState("PUBLICO");
  const [aba, setAba] = useState<Aba>("resumo");
  const [editando, setEditando] = useState(false);
  const [modalKm, setModalKm] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setVeiculo(await api.getVeiculo(id));
      setAbastecimentos((await api.listAbastecimentos({ veiculo_id: id })).itens);
      setManutencoes(await api.listManutencoes({ veiculo_id: id }));
      setOcorrencias((await api.listOcorrencias({ veiculo_id: id })).itens);
      setDocumentos(await api.listDocumentos(id));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    carregar();
    api.listCombustiveis(true).then(setCombustiveis).catch(() => {});
    api.getConfiguracoes().then((c) => setTipoOrganizacao(c.tipo_organizacao || "PUBLICO")).catch(() => {});
    // Abre a edição quando chega com ?editar=1 (vindo do menu da listagem).
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("editar")) {
      setEditando(true);
    }
  }, [carregar]);

  if (!veiculo) return <p className="animate-pulse text-text-subtle">Carregando…</p>;

  const confirmados = abastecimentos.filter((a) => a.status === "CONFIRMADO");
  const litrosTotal = confirmados.reduce((s, a) => s + Number(a.quantidade_litros), 0);
  const gastoCombustivel = confirmados.reduce((s, a) => s + Number(a.custo_total ?? 0), 0);
  const custoManutencao = manutencoes
    .filter((m) => m.status === "CONCLUIDA" || m.status === "EM_MANUTENCAO")
    .reduce((s, m) => s + Number(m.valor_total), 0);
  const consumoMedio = litrosTotal > 0 ? veiculo.quilometragem_atual / litrosTotal : null;

  // Consumo separado por produto (ex.: Diesel vs ARLA) — não mistura estoques.
  const porProduto = new Map<string, { litros: number; gasto: number }>();
  confirmados.forEach((a) => {
    const atual = porProduto.get(a.combustivel_id) ?? { litros: 0, gasto: 0 };
    porProduto.set(a.combustivel_id, {
      litros: atual.litros + Number(a.quantidade_litros),
      gasto: atual.gasto + Number(a.custo_total ?? 0),
    });
  });
  const nomeCombustivel = (id: string | null) =>
    combustiveis.find((c) => c.id === id)?.nome ?? "—";
  const reservatorios = veiculo.tanques ?? [];
  const combustivelPrincipal = combustiveis.find((c) => c.id === veiculo.combustivel_principal_id);
  const medicaoAtual = veiculo.usa_horimetro ? formatarHorimetro(veiculo.horimetro_atual) : formatarKm(veiculo.quilometragem_atual);
  const identificador = veiculo.codigo_interno || veiculo.patrimonio || veiculo.id.slice(0, 8).toUpperCase();

  const abas: { chave: Aba; label: string; count?: number }[] = [
    { chave: "resumo", label: "Resumo" },
    { chave: "abastecimentos", label: "Abastecimentos", count: abastecimentos.length },
    { chave: "manutencoes", label: "Manutenções", count: manutencoes.length },
    { chave: "ocorrencias", label: "Ocorrências", count: ocorrencias.length },
    { chave: "custos", label: "Custos" },
    { chave: "documentos", label: "Documentos", count: documentos.length },
    { chave: "historico", label: "Histórico" },
  ];

  async function baixarVeiculo() {
    if (!confirm("Baixar este veículo? Ele permanecerá no histórico, mas deixará de estar ativo na frota.")) return;
    try {
      await api.updateVeiculo(id, { situacao: "BAIXADO" });
      toast.success("Veículo baixado.");
      carregar();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function adicionarDocumento() {
    const descricao = window.prompt("Descrição do documento (ex.: CRLV, seguro):");
    if (!descricao) return;
    const vencimento = window.prompt("Vencimento (AAAA-MM-DD) — opcional:");
    try {
      await api.criarDocumento(id, { descricao, vencimento: vencimento || undefined });
      toast.success("Documento anexado.");
      carregar();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function copiarRenavam() {
    if (!veiculo?.renavam) return;
    navigator.clipboard?.writeText(veiculo.renavam).then(
      () => toast.success("RENAVAM copiado."),
      () => toast.error("Não foi possível copiar.")
    );
  }

  const custoTotal = gastoCombustivel + custoManutencao;
  const custoPorKm = veiculo.quilometragem_atual > 0 ? custoTotal / Math.max(veiculo.quilometragem_atual, 1) : null;
  const volumeRecente = confirmados.length ? Number(confirmados[0].quantidade_litros) : 0;
  const reservatorioPrincipal = reservatorios.find((t) => t.tank_type === "PRIMARY") ?? reservatorios[0];
  const capacidadePrincipal = reservatorioPrincipal ? Number(reservatorioPrincipal.capacidade) : 0;
  const pctReservatorio = capacidadePrincipal > 0 ? Math.min(100, Math.round((volumeRecente / capacidadePrincipal) * 100)) : 0;

  const historico = [
    ...abastecimentos.map((a) => ({
      data: a.data_abastecimento,
      tipo: "abastecimento",
      texto: `Abastecimento ${Number(a.quantidade_litros).toLocaleString("pt-BR")} L · KM ${a.quilometragem.toLocaleString("pt-BR")}${a.combustivel_nome ? ` · ${a.combustivel_nome}` : ""}${a.motorista_nome ? ` · ${a.motorista_nome}` : ""}`,
      extra: a.status === "CONFIRMADO" ? "Confirmado" : "Cancelado",
    })),
    ...manutencoes.map((m) => ({
      data: m.data_solicitacao + "T12:00",
      tipo: "manutencao",
      texto: `Manutenção ${m.tipo.replace("_", " ")}${m.descricao_problema ? ` — ${m.descricao_problema.slice(0, 60)}` : ""}`,
      extra: m.status,
    })),
    ...ocorrencias.map((o) => ({
      data: o.data_ocorrencia + "T12:00",
      tipo: "ocorrencia",
      texto: `Ocorrência ${o.categoria} — ${o.descricao.slice(0, 60)}`,
      extra: o.gravidade,
    })),
  ].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

  return (
    <RequirePermission perms="vehicle.view">
      <VeiculoFormDrawer
        aberto={editando}
        onClose={() => setEditando(false)}
        veiculo={veiculo}
        combustiveis={combustiveis}
        tipoOrganizacao={tipoOrganizacao}
        onSalvo={carregar}
      />

      <div className="space-y-5">
        {/* Breadcrumb + identificação */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/veiculos" className="group inline-flex items-center gap-1.5 text-body-sm font-medium text-text-subtle transition-colors hover:text-primary">
            <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-0.5" />
            Voltar para Veículos
          </Link>
          <div className="flex flex-wrap items-center gap-2 text-meta text-text-subtle">
            <span className="rounded bg-[#F3F4F6] px-2 py-0.5 font-mono font-medium text-text-body ring-1 ring-inset ring-outline-variant/40">ID: {identificador}</span>
            <StatusBadge situacao={veiculo.situacao} />
            <span className="inline-flex items-center gap-1 rounded-pill bg-[#ECFDF5] px-2 py-0.5 font-medium text-[#047857] ring-1 ring-inset ring-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Registro ativo
            </span>
          </div>
        </div>

        {/* Hero do veículo */}
        <section className="relative overflow-hidden rounded-2xl border border-outline-variant/50 bg-surface-card p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-6 xl:flex-row xl:items-center">
            <div className="flex items-start gap-5 sm:items-center">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border border-outline-variant/50 bg-gradient-to-b from-surface-bg to-[#EFF4FF] p-2 shadow-inner">
                <FotoVeiculo src={veiculo.foto_url} className="h-full w-full rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="mercosul-plate rounded-lg px-3 py-0.5 font-mono text-2xl font-bold tracking-wider text-[#0F172A]">
                    {veiculo.placa}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-pill border border-outline-variant/50 bg-[#F3F4F6] px-2.5 py-0.5 text-meta font-semibold text-text-body">
                    <Car size={13} className="text-text-subtle" /> {nomeTipo(veiculo.tipo)}
                  </span>
                </div>
                <h1 className="text-h2 font-black tracking-tight text-text-title">
                  {[veiculo.marca, veiculo.modelo, veiculo.versao].filter(Boolean).join(" ") || "—"}
                </h1>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm font-medium text-text-subtle">
                  <span className="inline-flex items-center gap-1.5 font-mono text-text-body"><Gauge size={15} className="text-text-subtle" /> {medicaoAtual}</span>
                  <span className="text-outline-variant">•</span>
                  <span className="inline-flex items-center gap-1.5"><Fuel size={15} className="text-[#F59E0B]" /> {combustivelPrincipal?.nome ?? "—"}</span>
                  {veiculo.unidade_nome && (
                    <>
                      <span className="text-outline-variant">•</span>
                      <span className="rounded bg-[#F3F4F6] px-2 py-0.5 text-meta text-text-body">{veiculo.unidade_nome}</span>
                    </>
                  )}
                  {veiculo.departamento && (
                    <span className="rounded bg-[#FFFBEB] px-2 py-0.5 text-meta font-semibold text-[#B45309] ring-1 ring-inset ring-amber-200">{veiculo.departamento}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {hasPermission("vehicle.manage") && (
                <>
                  <button className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant bg-surface-card px-3.5 py-2 text-body-sm font-semibold text-text-body shadow-sm transition-colors hover:bg-surface-container-low hover:text-primary" onClick={() => setEditando(true)}>
                    <Pencil size={14} className="text-text-subtle" /> Editar
                  </button>
                  <button className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant bg-surface-card px-3.5 py-2 text-body-sm font-semibold text-text-body shadow-sm transition-colors hover:bg-surface-container-low hover:text-primary" onClick={() => setModalKm(true)}>
                    <Gauge size={14} className="text-primary" /> Corrigir {veiculo.usa_horimetro ? "horímetro" : "KM"}
                  </button>
                </>
              )}
              {hasPermission("refueling.view") && (
                <Link href="/abastecimentos" className="inline-flex items-center gap-1.5 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-3.5 py-2 text-body-sm font-semibold text-primary transition-colors hover:bg-[#DBEAFE]">
                  <Fuel size={14} /> Abastecimento
                </Link>
              )}
              {hasPermission("maintenance.view") && (
                <Link href="/manutencoes" className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant bg-surface-card px-3.5 py-2 text-body-sm font-semibold text-text-body shadow-sm transition-colors hover:bg-surface-container-low hover:text-primary">
                  <Wrench size={14} className="text-text-subtle" /> Manutenção
                </Link>
              )}
              {hasPermission("vehicle.manage") && veiculo.situacao !== "BAIXADO" && (
                <button className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-body-sm font-semibold text-[#B42318] transition-colors hover:bg-rose-100" onClick={baixarVeiculo}>
                  <Archive size={14} /> Baixar
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Abas */}
        <nav className="flex gap-4 overflow-x-auto border-b border-outline-variant/50 text-body-sm" aria-label="Abas da ficha do veículo">
          {abas.map((a) => {
            const ativa = aba === a.chave;
            return (
              <button
                key={a.chave}
                onClick={() => setAba(a.chave)}
                className={`-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 pb-3 font-medium transition-colors ${
                  ativa ? "border-primary font-bold text-primary" : "border-transparent text-text-subtle hover:text-text-title"
                }`}
              >
                {a.label}
                {a.count != null && (
                  <span className={`rounded-pill px-2 py-0.5 text-[11px] font-semibold ${ativa ? "bg-[#EFF6FF] text-primary" : "bg-[#F3F4F6] text-text-subtle"}`}>
                    {a.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {aba === "resumo" && (
          <>
            {/* KPIs do veículo */}
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Info titulo={veiculo.usa_horimetro ? "Horímetro atual" : "KM atual"} valor={medicaoAtual} />
              <Info titulo="Consumo médio" valor={formatarConsumo(consumoMedio)} />
              <Info titulo="Litros abastecidos" valor={`${litrosTotal.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L`} />
              <Info titulo="Gasto com combustível" valor={formatarMoeda(gastoCombustivel)} tom="emerald" />
              <Info titulo="Custo de manutenção" valor={formatarMoeda(custoManutencao)} />
              <Info titulo="Custo por km" valor={custoPorKm != null ? `R$ ${custoPorKm.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}` : "—"} />
              <Info titulo="Tipo" valor={nomeTipo(veiculo.tipo)} />
              <Info titulo="Combustível" valor={combustivelPrincipal?.nome ?? "—"} />
              {veiculo.ano_fabricacao && <Info titulo="Ano fab./modelo" valor={[veiculo.ano_fabricacao, veiculo.ano_modelo].filter(Boolean).join(" / ") || "—"} />}
              {veiculo.cor && <Info titulo="Cor" valor={veiculo.cor} />}
              {veiculo.patrimonio && <Info titulo="Patrimônio" valor={veiculo.patrimonio} />}
              {veiculo.renavam && (
                <div className="rounded-xl border border-outline-variant/50 bg-surface-card p-5 shadow-sm sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <p className="text-meta font-medium uppercase tracking-wider text-text-subtle">RENAVAM</p>
                    <button onClick={copiarRenavam} className="inline-flex items-center gap-1 rounded-lg bg-[#EFF6FF] px-2.5 py-1 text-meta font-medium text-primary transition-colors hover:bg-[#DBEAFE]">
                      <Copy size={13} /> Copiar
                    </button>
                  </div>
                  <p className="mt-2 font-mono text-2xl font-black tracking-wide text-text-title">{veiculo.renavam}</p>
                </div>
              )}
              {veiculo.observacoes && <Info titulo="Observações" valor={veiculo.observacoes} />}
            </section>

            {/* Reservatórios */}
            <section className="overflow-hidden rounded-2xl border border-outline-variant/50 bg-surface-card shadow-sm">
              <div className="flex items-center justify-between border-b border-outline-variant/30 bg-[#F9FAFB] px-6 py-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EFF6FF] text-primary"><Fuel size={15} /></span>
                  <h2 className="text-body-sm font-bold uppercase tracking-wider text-text-title">Abastecimento / Reservatórios</h2>
                </div>
                <span className="text-meta font-medium text-text-subtle">{reservatorios.length} tanque(s) cadastrado(s)</span>
              </div>
              <div className="space-y-3 p-6">
                {reservatorios.map((t) => {
                  const principal = t.tank_type === "PRIMARY";
                  return (
                    <div key={t.id} className="rounded-xl border border-outline-variant/50 bg-gradient-to-r from-surface-bg via-surface-card to-surface-card p-5">
                      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-body text-text-title">{principal ? "Tanque principal" : (t.identificacao || "Tanque auxiliar")}</span>
                            <span className="rounded bg-[#FFF4D6] px-2 py-0.5 text-[11px] font-bold text-[#805600] ring-1 ring-inset ring-amber-200">{principal ? "Primário" : "Auxiliar"}</span>
                          </div>
                          <p className="mt-0.5 text-meta font-semibold uppercase tracking-wider text-text-subtle">{t.combustivel_nome ?? nomeCombustivel(t.combustivel_id)}</p>
                        </div>
                        <div className="text-left sm:text-right">
                          <span className="font-mono text-3xl font-black tracking-tight text-text-title">{Number(t.capacidade).toLocaleString("pt-BR")} L</span>
                          <p className="text-meta font-medium text-text-subtle">Capacidade total nominal</p>
                        </div>
                      </div>
                      {principal && capacidadePrincipal > 0 && (
                        <div className="mt-4">
                          <div className="mb-1.5 flex justify-between text-meta font-medium text-text-subtle">
                            <span>Volume recente abastecido: <strong className="text-primary">{volumeRecente.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L</strong></span>
                            <span>{pctReservatorio}% da capacidade de um ciclo</span>
                          </div>
                          <div className="h-3 w-full overflow-hidden rounded-pill bg-[#E4E7EC] p-0.5">
                            <div className="h-2 rounded-pill bg-gradient-to-r from-primary to-[#4F46E5] transition-all duration-500" style={{ width: `${pctReservatorio}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {reservatorios.length === 0 && (
                  <p className="py-6 text-center text-body-sm text-text-subtle">Nenhum reservatório cadastrado.</p>
                )}
              </div>
            </section>

            {/* Consumo por produto */}
            {porProduto.size > 0 && (
              <section className="overflow-hidden rounded-2xl border border-outline-variant/50 bg-surface-card shadow-sm">
                <div className="flex items-center justify-between border-b border-outline-variant/30 bg-[#F9FAFB] px-6 py-4">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#E7F8EC] text-[#106D34]"><Gauge size={15} /></span>
                    <h2 className="text-body-sm font-bold uppercase tracking-wider text-text-title">Consumo por produto</h2>
                  </div>
                  <span className="text-meta font-medium text-text-subtle">Acumulado do veículo</span>
                </div>
                <div className="grid gap-4 p-6 md:grid-cols-2">
                  {Array.from(porProduto.entries()).map(([cid, d]) => (
                    <div key={cid} className="flex flex-col justify-between gap-4 rounded-xl border border-outline-variant/50 bg-surface-card p-5 shadow-sm transition-all hover:border-primary/30 md:flex-row md:items-center">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-body-sm font-bold uppercase tracking-wide text-text-body">{nomeCombustivel(cid)}</h3>
                          <span className="h-2 w-2 rounded-full bg-primary" />
                        </div>
                        <p className="text-3xl font-black tracking-tight text-primary">{d.litros.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L</p>
                        <p className="text-meta font-semibold text-text-subtle">
                          Taxa apurada: <span className="font-mono text-text-body">{veiculo.quilometragem_atual > 0 ? `${(d.litros / veiculo.quilometragem_atual).toLocaleString("pt-BR", { maximumFractionDigits: 4 })} L/km` : "—"}</span>
                        </p>
                      </div>
                      {d.gasto > 0 && (
                        <div className="border-t border-outline-variant/30 pt-4 md:border-l md:border-t-0 md:pl-8 md:pt-0 md:text-right">
                          <span className="text-meta font-semibold uppercase tracking-wider text-text-subtle">Despesa consolidada</span>
                          <p className="mt-0.5 text-2xl font-black tracking-tight text-text-title">{formatarMoeda(d.gasto)}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Banner de conformidade */}
            <div className="flex flex-col items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-[#0E1B2E] to-[#1E3A8A] p-5 text-white shadow-md sm:flex-row">
              <div className="flex items-center gap-4 text-center sm:text-left">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10">
                  <ShieldCheck size={24} className="text-[#86EFAC]" />
                </div>
                <div>
                  <h4 className="text-body-sm font-bold tracking-wide">Auditoria &amp; Prestação de Contas</h4>
                  <p className="mt-0.5 text-meta text-[#BFDBFE]">Os registros deste veículo possuem trilha de auditoria rastreável e consultável.</p>
                </div>
              </div>
              {hasPermission("audit.view") && (
                <Link href="/auditoria" className="shrink-0 rounded-xl bg-white px-4 py-2 text-meta font-semibold text-[#0E1B2E] shadow-sm transition-colors hover:bg-blue-50">
                  Ver auditoria
                </Link>
              )}
            </div>
          </>
        )}

        {aba === "abastecimentos" && (
          <Tabela>
            <thead>
              <tr className="border-b border-outline-variant/40 bg-[#F3F4F6] text-left text-meta text-text-subtle">
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Motorista</th>
                <th className="px-4 py-3">Combustível</th>
                <th className="px-4 py-3">Litros</th>
                <th className="px-4 py-3">KM</th>
                <th className="px-4 py-3">Consumo</th>
                <th className="px-4 py-3">Valor</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {abastecimentos.length === 0 && <Vazio colSpan={8} texto="Sem abastecimentos." />}
              {abastecimentos.map((a) => (
                <tr key={a.id} className="border-b border-outline-variant/20 last:border-0 hover:bg-[#EFF4FF]/40">
                  <td className="px-4 py-3">{formatarData(a.data_abastecimento)}</td>
                  <td className="px-4 py-3">{a.motorista_nome ?? "—"}</td>
                  <td className="px-4 py-3">{a.combustivel_nome ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{Number(a.quantidade_litros).toLocaleString("pt-BR")} L</td>
                  <td className="px-4 py-3 tabular-nums">{a.quilometragem.toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-3 tabular-nums">{a.consumo_km_l ? formatarConsumo(a.consumo_km_l) : "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{a.custo_total ? formatarMoeda(a.custo_total) : "—"}</td>
                  <td className="px-4 py-3">{a.status === "CONFIRMADO" ? "Confirmado" : "Cancelado"}</td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}

        {aba === "manutencoes" && (
          <Tabela>
            <thead>
              <tr className="border-b border-outline-variant/40 bg-[#F3F4F6] text-left text-meta text-text-subtle">
                <th className="px-4 py-3">Solicitação</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Descrição</th>
                <th className="px-4 py-3">Valor</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {manutencoes.length === 0 && <Vazio colSpan={5} texto="Sem manutenções." />}
              {manutencoes.map((m) => (
                <tr key={m.id} className="border-b border-outline-variant/20 last:border-0 hover:bg-[#EFF4FF]/40">
                  <td className="px-4 py-3">{formatarData(m.data_solicitacao)}</td>
                  <td className="px-4 py-3 capitalize">{m.tipo.replace("_", " ")}</td>
                  <td className="px-4 py-3 text-text-subtle">{m.descricao_problema ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{formatarMoeda(m.valor_total)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-pill px-2 py-0.5 text-meta ${STATUS_MANUT_CLASSE[m.status] ?? ""}`}>{m.status.replace("_", " ")}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}

        {aba === "ocorrencias" && (
          <div className="rounded-2xl border border-outline-variant/50 bg-surface-card shadow-sm">
            <ul className="divide-y divide-outline-variant/20">
              {ocorrencias.length === 0 && <li className="px-4 py-8 text-center text-text-subtle">Sem ocorrências.</li>}
              {ocorrencias.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div>
                    <span className="text-body-sm font-medium">{o.categoria}</span>
                    <span className={`ml-2 rounded-pill px-2 py-0.5 text-meta ${GRAVIDADE_CLASSE[o.gravidade] ?? ""}`}>{o.gravidade}</span>
                    <span className="ml-2 text-meta text-text-subtle">{o.status.replace("_", " ")}</span>
                    <p className="text-meta text-text-subtle">{o.descricao}</p>
                  </div>
                  <span className="text-meta text-text-subtle">{formatarData(o.data_ocorrencia)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {aba === "custos" && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Info titulo="Combustível" valor={formatarMoeda(gastoCombustivel)} />
            <Info titulo="Manutenção" valor={formatarMoeda(custoManutencao)} />
            <Info titulo="Custo total" valor={formatarMoeda(custoTotal)} />
            <Info titulo="Custo por km" valor={custoPorKm != null ? `R$ ${custoPorKm.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}` : "—"} />
            <Info titulo="Consumo médio" valor={formatarConsumo(consumoMedio)} />
            <Info titulo="Custo combustível por km" valor={veiculo.quilometragem_atual > 0 ? formatarMoeda(gastoCombustivel / Math.max(veiculo.quilometragem_atual, 1)) : "—"} />
          </div>
        )}

        {aba === "documentos" && (
          <div className="rounded-2xl border border-outline-variant/50 bg-surface-card p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-body-sm font-semibold text-text-title">Documentos do veículo</h3>
              {hasPermission("vehicle.manage") && (
                <button className="btn btn-secondary btn-sm" onClick={adicionarDocumento}>
                  <Upload size={14} /> Adicionar documento
                </button>
              )}
            </div>
            <ul className="divide-y divide-outline-variant/20">
              {documentos.length === 0 && <li className="py-4 text-text-subtle">Nenhum documento anexado.</li>}
              {documentos.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-3">
                  <div>
                    <span className="text-body-sm">{d.descricao}</span>
                    {d.vencimento && (
                      <span className={`ml-2 text-meta ${new Date(d.vencimento + "T12:00") < new Date() ? "text-[#BA1A1A]" : "text-text-subtle"}`}>
                        {new Date(d.vencimento + "T12:00") < new Date() ? "Vencido" : `Vence em ${formatarData(d.vencimento)}`}
                      </span>
                    )}
                  </div>
                  {hasPermission("vehicle.manage") && (
                    <button
                      className="text-[#BA1A1A] hover:underline"
                      onClick={async () => {
                        try {
                          await api.excluirDocumento(id, d.id);
                          toast.success("Documento removido.");
                          carregar();
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {aba === "historico" && (
          <div className="rounded-2xl border border-outline-variant/50 bg-surface-card shadow-sm">
            <ul className="divide-y divide-outline-variant/20">
              {historico.length === 0 && <li className="px-4 py-8 text-center text-text-subtle">Nenhum registro histórico.</li>}
              {historico.map((h, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-body-sm">
                  <div className="min-w-0">
                    <span className={`rounded-pill px-2 py-0.5 text-meta ${h.tipo === "abastecimento" ? "bg-blue-50 text-[#1D4ED8]" : h.tipo === "manutencao" ? "bg-orange-50 text-[#B54708]" : "bg-red-50 text-[#B42318]"}`}>
                      {h.tipo}
                    </span>{" "}
                    <span className="text-text-body">{h.texto}</span>
                  </div>
                  <span className="text-meta text-text-subtle">{formatarData(h.data)} · {h.extra}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Modal de correção de KM/Horímetro */}
      {modalKm && (
        <ModalKm
          veiculo={veiculo}
          onClose={() => setModalKm(false)}
          onSalvo={() => {
            setModalKm(false);
            carregar();
          }}
        />
      )}
    </RequirePermission>
  );
}

function ModalKm({ veiculo, onClose, onSalvo }: { veiculo: Veiculo; onClose: () => void; onSalvo: () => void }) {
  const [salvando, setSalvando] = useState(false);
  const ehHorimetro = veiculo.usa_horimetro;
  const [valor, setValor] = useState(ehHorimetro ? String(veiculo.horimetro_atual ?? "") : String(veiculo.quilometragem_atual));
  const [justificativa, setJustificativa] = useState("");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (justificativa.length < 5) {
      toast.error("Informe uma justificativa (mínimo 5 caracteres).");
      return;
    }
    setSalvando(true);
    try {
      await api.alterarKm(veiculo.id, Number(valor), justificativa);
      toast.success(ehHorimetro ? "Horímetro ajustado." : "Quilometragem ajustada.");
      onSalvo();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <form onSubmit={enviar} className="relative w-full max-w-md rounded-2xl border border-outline-variant/50 bg-surface-card p-5 shadow-elevated">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-h3 text-text-title">Corrigir {ehHorimetro ? "horímetro" : "quilometragem"}</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}><X size={18} /></button>
        </div>
        <p className="mb-4 text-body-sm text-text-subtle">
          A correção é auditada e exige justificativa. {ehHorimetro ? "O valor do horímetro" : "A quilometragem"} atual é{" "}
          <strong className="tabular-nums">{ehHorimetro ? formatarHorimetro(veiculo.horimetro_atual) : formatarKm(veiculo.quilometragem_atual)}</strong>.
        </p>
        <label className="text-meta">
          Novo valor {ehHorimetro ? "(h)" : "(km)"}
          <input type="number" step={ehHorimetro ? "0.1" : "1"} min={0} value={valor} onChange={(e) => setValor(e.target.value)} className="input mt-1" required />
        </label>
        <label className="mt-3 block text-meta">
          Justificativa *
          <textarea rows={3} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} className="input mt-1" placeholder="Motivo da correção" required />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={salvando}>{salvando ? "Salvando…" : "Confirmar correção"}</button>
        </div>
      </form>
    </div>
  );
}

function Tabela({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-outline-variant/50 bg-surface-card shadow-sm">
      <table className="w-full min-w-[900px] text-body-sm">{children}</table>
    </div>
  );
}

function Vazio({ colSpan, texto }: { colSpan: number; texto: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-text-subtle">{texto}</td>
    </tr>
  );
}

function Info({ titulo, valor, tom = "default" }: { titulo: string; valor: React.ReactNode; tom?: "default" | "emerald" }) {
  return (
    <div className="rounded-xl border border-outline-variant/50 bg-surface-card p-5 shadow-sm transition-all hover:border-primary/30">
      <p className="text-meta font-medium uppercase tracking-wider text-text-subtle">{titulo}</p>
      <div className={`mt-2 text-2xl font-black tracking-tight ${tom === "emerald" ? "text-[#106D34]" : "text-text-title"}`}>{valor}</div>
    </div>
  );
}
