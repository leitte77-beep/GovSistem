"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import {
  Archive,
  ArrowLeft,
  Fuel,
  Gauge,
  Pencil,
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

  const abas: { chave: Aba; label: string }[] = [
    { chave: "resumo", label: "Resumo" },
    { chave: "abastecimentos", label: `Abastecimentos (${abastecimentos.length})` },
    { chave: "manutencoes", label: `Manutenções (${manutencoes.length})` },
    { chave: "ocorrencias", label: `Ocorrências (${ocorrencias.length})` },
    { chave: "custos", label: "Custos" },
    { chave: "documentos", label: `Documentos (${documentos.length})` },
    { chave: "historico", label: "Histórico" },
  ];

  const combustivelPrincipal = combustiveis.find((c) => c.id === veiculo.combustivel_principal_id);

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

      <div className="space-y-4">
        <Link href="/veiculos" className="inline-flex items-center gap-1 text-body-sm text-text-subtle hover:text-[#1D4ED8]">
          <ArrowLeft size={15} /> Veículos
        </Link>

        {/* Cabeçalho da ficha */}
        <div className="flex flex-col gap-4 rounded-card border border-surface-border bg-white p-5 shadow-card md:flex-row md:items-center">
          <FotoVeiculo src={veiculo.foto_url} className="h-24 w-32 rounded-btn border border-surface-border" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-h2 text-text-title">{veiculo.placa}</h1>
              <StatusBadge situacao={veiculo.situacao} />
            </div>
            <p className="text-body text-text-body">
              {[veiculo.marca, veiculo.modelo, veiculo.versao].filter(Boolean).join(" ") || "—"}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-body-sm tabular-nums text-text-subtle">
              <span>{veiculo.usa_horimetro ? formatarHorimetro(veiculo.horimetro_atual) : formatarKm(veiculo.quilometragem_atual)}</span>
              <span className="inline-flex items-center gap-1"><Fuel size={14} /> {combustivelPrincipal?.nome ?? "—"}</span>
              {veiculo.unidade && <span>{veiculo.unidade}</span>}
              {veiculo.departamento && <span>{veiculo.departamento}</span>}
              {veiculo.centro_custo && <span>CC: {veiculo.centro_custo}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {hasPermission("vehicle.manage") && (
              <>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditando(true)}>
                  <Pencil size={14} /> Editar
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setModalKm(true)}>
                  <Gauge size={14} /> Corrigir {veiculo.usa_horimetro ? "horímetro" : "KM"}
                </button>
              </>
            )}
            {hasPermission("refueling.view") && (
              <Link href="/abastecimentos" className="btn btn-secondary btn-sm">
                <Fuel size={14} /> Abastecimento
              </Link>
            )}
            {hasPermission("maintenance.view") && (
              <Link href="/manutencoes" className="btn btn-secondary btn-sm">
                <Wrench size={14} /> Manutenção
              </Link>
            )}
            {hasPermission("vehicle.manage") && veiculo.situacao !== "BAIXADO" && (
              <button className="btn btn-secondary btn-sm text-[#B42318]" onClick={baixarVeiculo}>
                <Archive size={14} /> Baixar
              </button>
            )}
          </div>
        </div>

        {/* Abas */}
        <div className="flex gap-1 overflow-x-auto border-b border-surface-border">
          {abas.map((a) => (
            <button
              key={a.chave}
              onClick={() => setAba(a.chave)}
              className={`whitespace-nowrap px-4 py-2 text-body-sm ${
                aba === a.chave ? "border-b-2 border-[#1D4ED8] font-medium text-[#1D4ED8]" : "text-text-body"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>

        {aba === "resumo" && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Info titulo={veiculo.usa_horimetro ? "Horímetro atual" : "KM atual"} valor={veiculo.usa_horimetro ? formatarHorimetro(veiculo.horimetro_atual) : formatarKm(veiculo.quilometragem_atual)} />
              <Info titulo="Consumo médio" valor={formatarConsumo(consumoMedio)} />
              <Info titulo="Litros no mês" valor={`${litrosTotal.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L`} />
              <Info titulo="Gasto com combustível" valor={formatarMoeda(gastoCombustivel)} />
              <Info titulo="Custo de manutenção" valor={formatarMoeda(custoManutencao)} />
              <Info titulo="Custo por km" valor={veiculo.quilometragem_atual > 0 ? formatarMoeda((gastoCombustivel + custoManutencao) / Math.max(veiculo.quilometragem_atual, 1)) : "—"} />
              <Info titulo="Tipo" valor={nomeTipo(veiculo.tipo)} />
              <Info titulo="Combustível" valor={combustivelPrincipal?.nome ?? "—"} />
              {veiculo.ano_fabricacao && <Info titulo="Ano fab./modelo" valor={[veiculo.ano_fabricacao, veiculo.ano_modelo].filter(Boolean).join(" / ") || "—"} />}
              {veiculo.cor && <Info titulo="Cor" valor={veiculo.cor} />}
              {veiculo.renavam && <Info titulo="RENAVAM" valor={veiculo.renavam} />}
              {veiculo.patrimonio && <Info titulo="Patrimônio" valor={veiculo.patrimonio} />}
              {veiculo.observacoes && <Info titulo="Observações" valor={veiculo.observacoes} />}
            </div>

            {/* Reservatórios (principal + auxiliares) */}
            <div className="rounded-card border border-surface-border bg-white p-5 shadow-card">
              <h3 className="text-label font-semibold text-text-title">Abastecimento / Reservatórios</h3>
              <div className="mt-3 space-y-2">
                {reservatorios.map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-btn border border-surface-border bg-surface-bg px-4 py-3">
                    <div>
                      <div className="font-medium text-text-title">
                        {t.tank_type === "PRIMARY" ? "Tanque principal" : (t.identificacao || "Tanque auxiliar")}
                      </div>
                      <div className="text-body-sm text-text-subtle">{t.combustivel_nome ?? nomeCombustivel(t.combustivel_id)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-text-title">{Number(t.capacidade).toLocaleString("pt-BR")} L</div>
                      <div className="text-meta text-text-subtle">{t.tank_type === "PRIMARY" ? "Capacidade" : "Capacidade auxiliar"}</div>
                    </div>
                  </div>
                ))}
                {reservatorios.length === 0 && (
                  <p className="py-4 text-center text-body-sm text-text-subtle">Nenhum reservatório cadastrado.</p>
                )}
              </div>
            </div>

            {/* Consumo por produto */}
            {porProduto.size > 0 && (
              <div className="rounded-card border border-surface-border bg-white p-5 shadow-card">
                <h3 className="text-label font-semibold text-text-title">Consumo por produto</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {Array.from(porProduto.entries()).map(([cid, d]) => (
                    <div key={cid} className="rounded-btn border border-surface-border bg-surface-bg p-4">
                      <div className="font-medium text-text-title">{nomeCombustivel(cid)}</div>
                      <div className="mt-1 flex items-end justify-between">
                        <div>
                          <div className="text-2xl font-bold text-[#1D4ED8]">
                            {d.litros.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L
                          </div>
                          <div className="text-meta text-text-subtle">
                            {veiculo.quilometragem_atual > 0
                              ? `${(d.litros / veiculo.quilometragem_atual).toLocaleString("pt-BR", { maximumFractionDigits: 4 })} L/km`
                              : "—"}
                          </div>
                        </div>
                        {d.gasto > 0 && <div className="text-body-sm font-medium text-text-title">{formatarMoeda(d.gasto)}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {aba === "abastecimentos" && (
          <Tabela>
            <thead>
              <tr className="border-b border-surface-border bg-surface-bg text-left text-meta text-text-subtle">
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
                <tr key={a.id} className="border-b border-surface-border last:border-0">
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
              <tr className="border-b border-surface-border bg-surface-bg text-left text-meta text-text-subtle">
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
                <tr key={m.id} className="border-b border-surface-border last:border-0">
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
          <div className="rounded-card border border-surface-border bg-white shadow-card">
            <ul className="divide-y divide-surface-border">
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
          <div className="grid gap-3 sm:grid-cols-3">
            <Info titulo="Combustível" valor={formatarMoeda(gastoCombustivel)} />
            <Info titulo="Manutenção" valor={formatarMoeda(custoManutencao)} />
            <Info titulo="Custo total" valor={formatarMoeda(gastoCombustivel + custoManutencao)} />
            <Info titulo="Custo por km" valor={veiculo.quilometragem_atual > 0 ? formatarMoeda((gastoCombustivel + custoManutencao) / Math.max(veiculo.quilometragem_atual, 1)) : "—"} />
            <Info titulo="Consumo médio" valor={formatarConsumo(consumoMedio)} />
            <Info titulo="Custo combustível por km" valor={veiculo.quilometragem_atual > 0 ? formatarMoeda(gastoCombustivel / Math.max(veiculo.quilometragem_atual, 1)) : "—"} />
          </div>
        )}

        {aba === "documentos" && (
          <div className="rounded-card border border-surface-border bg-white p-4 shadow-card">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-label font-semibold text-text-title">Documentos do veículo</h3>
              {hasPermission("vehicle.manage") && (
                <button className="btn btn-secondary btn-sm" onClick={adicionarDocumento}>
                  <Upload size={14} /> Adicionar documento
                </button>
              )}
            </div>
            <ul className="divide-y divide-surface-border">
              {documentos.length === 0 && <li className="py-4 text-text-subtle">Nenhum documento anexado.</li>}
              {documentos.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-3">
                  <div>
                    <span className="text-body-sm">{d.descricao}</span>
                    {d.vencimento && (
                      <span className={`ml-2 text-meta ${new Date(d.vencimento + "T12:00") < new Date() ? "text-[#B42318]" : "text-text-subtle"}`}>
                        {new Date(d.vencimento + "T12:00") < new Date() ? "Vencido" : `Vence em ${formatarData(d.vencimento)}`}
                      </span>
                    )}
                  </div>
                  {hasPermission("vehicle.manage") && (
                    <button
                      className="text-[#B42318] hover:underline"
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
          <div className="rounded-card border border-surface-border bg-white shadow-card">
            <ul className="divide-y divide-surface-border">
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
      <form onSubmit={enviar} className="relative w-full max-w-md rounded-card border border-surface-border bg-white p-5 shadow-elevated">
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
    <div className="overflow-x-auto rounded-card border border-surface-border bg-white shadow-card">
      <table className="w-full min-w-160 text-body-sm">{children}</table>
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

function Info({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-card border border-surface-border bg-white p-4 shadow-card">
      <div className="text-meta text-text-subtle">{titulo}</div>
      <div className="text-h3 text-text-title">{valor}</div>
    </div>
  );
}
