"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import { Pencil, Upload, Trash2, Gauge } from "lucide-react";
import { api, Abastecimento, Combustivel, DocumentoVeiculo, Manutencao, Ocorrencia, Veiculo } from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";
import { useAuth } from "@/lib/auth";

type Aba = "resumo" | "abastecimentos" | "manutencoes" | "ocorrencias" | "documentos" | "custos" | "historico";

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
  const [aba, setAba] = useState<Aba>("resumo");
  const [editando, setEditando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setVeiculo(await api.getVeiculo(id));
      setAbastecimentos(await api.listAbastecimentos({ veiculo_id: id }));
      setManutencoes(await api.listManutencoes({ veiculo_id: id }));
      setOcorrencias(await api.listOcorrencias({ veiculo_id: id }));
      setDocumentos(await api.listDocumentos(id));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    carregar();
    api.listCombustiveis(true).then(setCombustiveis).catch(() => {});
  }, [carregar]);

  if (!veiculo) return <p className="animate-pulse text-text-subtle">Carregando…</p>;

  const confirmados = abastecimentos.filter((a) => a.status === "CONFIRMADO");
  const litrosTotal = confirmados.reduce((s, a) => s + Number(a.quantidade_litros), 0);
  const gastoCombustivel = confirmados.reduce((s, a) => s + Number(a.custo_total ?? 0), 0);
  const custoManutencao = manutencoes
    .filter((m) => m.status === "CONCLUIDA" || m.status === "EM_MANUTENCAO")
    .reduce((s, m) => s + Number(m.valor_total), 0);
  const consumoMedio = litrosTotal > 0 ? veiculo.quilometragem_atual / litrosTotal : null;

  const abas: { chave: Aba; label: string }[] = [
    { chave: "resumo", label: "Resumo" },
    { chave: "abastecimentos", label: `Abastecimentos (${abastecimentos.length})` },
    { chave: "manutencoes", label: `Manutenções (${manutencoes.length})` },
    { chave: "ocorrencias", label: `Ocorrências (${ocorrencias.length})` },
    { chave: "documentos", label: `Documentos (${documentos.length})` },
    { chave: "custos", label: "Custos" },
    { chave: "historico", label: "Histórico" },
  ];

  async function ajustarKm() {
    if (!veiculo) return;
    const km = window.prompt("Nova quilometragem atual:", String(veiculo.quilometragem_atual));
    if (!km || isNaN(Number(km))) return;
    const justificativa = window.prompt("Justificativa da alteração:");
    if (!justificativa || justificativa.length < 5) return;
    try {
      await api.alterarKm(id, Number(km), justificativa);
      toast.success("Quilometragem ajustada.");
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
      await api.criarDocumento(id, {
        descricao,
        vencimento: vencimento || undefined,
      });
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
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-h2 text-text-title">{[veiculo.marca, veiculo.modelo].filter(Boolean).join(" ")}</h1>
            <p className="text-body-sm text-text-subtle">
              Placa <strong>{veiculo.placa}</strong> · {veiculo.quilometragem_atual.toLocaleString("pt-BR")} km ·{" "}
              {veiculo.situacao.replace("_", " ")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {hasPermission("vehicle.manage") && (
              <>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditando(!editando)}>
                  <Pencil size={14} /> Editar
                </button>
                <button className="btn btn-secondary btn-sm" onClick={ajustarKm}>
                  <Gauge size={14} /> Ajustar KM
                </button>
              </>
            )}
            {hasPermission("vehicle.manage") && (
              <button className="btn btn-secondary btn-sm" onClick={adicionarDocumento}>
                <Upload size={14} /> Documento
              </button>
            )}
          </div>
        </div>

        {editando && hasPermission("vehicle.manage") && (
          <FormEditarVeiculo
            veiculo={veiculo}
            combustiveis={combustiveis}
            onSalvo={() => {
              setEditando(false);
              carregar();
            }}
          />
        )}

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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Info titulo="Situação" valor={veiculo.situacao.replace("_", " ")} />
            <Info titulo="KM atual" valor={`${veiculo.quilometragem_atual.toLocaleString("pt-BR")} km`} />
            <Info titulo="Litros abastecidos" valor={litrosTotal.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} />
            <Info titulo="Gasto com combustível" valor={`R$ ${gastoCombustivel.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
            <Info titulo="Consumo médio" valor={consumoMedio != null ? `${consumoMedio.toFixed(2)} km/L` : "—"} />
            <Info titulo="Tipo" valor={veiculo.tipo.replace("_", " ")} />
            {veiculo.unidade && <Info titulo="Unidade" valor={veiculo.unidade} />}
            {veiculo.centro_custo && <Info titulo="Centro de custo" valor={veiculo.centro_custo} />}
            {veiculo.patrimonio && <Info titulo="Patrimônio" valor={veiculo.patrimonio} />}
          </div>
        )}

        {aba === "abastecimentos" && (
          <div className="overflow-x-auto rounded-card border border-surface-border bg-white shadow-card">
            <table className="w-full min-w-160 text-body-sm">
              <thead>
                <tr className="border-b border-surface-border bg-surface-bg text-left text-meta text-text-subtle">
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Litros</th>
                  <th className="px-4 py-3">KM</th>
                  <th className="px-4 py-3">Custo</th>
                  <th className="px-4 py-3">Origem</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {abastecimentos.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-text-subtle">Sem abastecimentos.</td></tr>
                )}
                {abastecimentos.map((a) => (
                  <tr key={a.id} className="border-b border-surface-border last:border-0">
                    <td className="px-4 py-3">{new Date(a.data_abastecimento).toLocaleDateString("pt-BR")}</td>
                    <td className="px-4 py-3">{Number(a.quantidade_litros).toLocaleString("pt-BR")} L</td>
                    <td className="px-4 py-3">{a.quilometragem.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-3">{a.custo_total ? `R$ ${Number(a.custo_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}</td>
                    <td className="px-4 py-3">{a.origem === "APP_MOTORISTA" ? "Motorista" : "Admin"}</td>
                    <td className="px-4 py-3">{a.status === "CONFIRMADO" ? "Confirmado" : "Cancelado"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {aba === "manutencoes" && (
          <div className="overflow-x-auto rounded-card border border-surface-border bg-white shadow-card">
            <table className="w-full min-w-160 text-body-sm">
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
                {manutencoes.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-text-subtle">Sem manutenções.</td></tr>
                )}
                {manutencoes.map((m) => (
                  <tr key={m.id} className="border-b border-surface-border last:border-0">
                    <td className="px-4 py-3">{new Date(m.data_solicitacao + "T12:00").toLocaleDateString("pt-BR")}</td>
                    <td className="px-4 py-3">{m.tipo.replace("_", " ")}</td>
                    <td className="px-4 py-3 text-text-subtle">{m.descricao_problema ?? "—"}</td>
                    <td className="px-4 py-3">R$ {Number(m.valor_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-pill px-2 py-0.5 text-meta ${STATUS_MANUT_CLASSE[m.status] ?? ""}`}>{m.status.replace("_", " ")}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                  <span className="text-meta text-text-subtle">{new Date(o.data_ocorrencia + "T12:00").toLocaleDateString("pt-BR")}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {aba === "documentos" && (
          <div className="rounded-card border border-surface-border bg-white p-4 shadow-card">
            <ul className="divide-y divide-surface-border">
              {documentos.length === 0 && <li className="py-4 text-text-subtle">Nenhum documento anexado.</li>}
              {documentos.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-3">
                  <div>
                    <span className="text-body-sm">{d.descricao}</span>
                    {d.vencimento && (
                      <span className={`ml-2 text-meta ${new Date(d.vencimento + "T12:00") < new Date() ? "text-[#B42318]" : "text-text-subtle"}`}>
                        {new Date(d.vencimento + "T12:00") < new Date() ? "Vencido" : `Vence em ${new Date(d.vencimento + "T12:00").toLocaleDateString("pt-BR")}`}
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

        {aba === "custos" && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Info titulo="Combustível" valor={`R$ ${gastoCombustivel.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
            <Info titulo="Manutenção" valor={`R$ ${custoManutencao.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
            <Info titulo="Custo total" valor={`R$ ${(gastoCombustivel + custoManutencao).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
            <Info titulo="Custo por km" valor={veiculo.quilometragem_atual > 0 ? `R$ ${((gastoCombustivel + custoManutencao) / Math.max(veiculo.quilometragem_atual, 1)).toFixed(3)}` : "—"} />
            <Info titulo="Consumo médio" valor={consumoMedio != null ? `${consumoMedio.toFixed(2)} km/L` : "—"} />
            <Info titulo="Custo combustível por km" valor={veiculo.quilometragem_atual > 0 ? `R$ ${(gastoCombustivel / Math.max(veiculo.quilometragem_atual, 1)).toFixed(3)}` : "—"} />
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
                  <span className="text-meta text-text-subtle">
                    {new Date(h.data).toLocaleDateString("pt-BR")} · {h.extra}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </RequirePermission>
  );
}

function FormEditarVeiculo({ veiculo, combustiveis, onSalvo }: { veiculo: Veiculo; combustiveis: Combustivel[]; onSalvo: () => void }) {
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({
    marca: veiculo.marca ?? "",
    modelo: veiculo.modelo ?? "",
    tipo: veiculo.tipo,
    cor: veiculo.cor ?? "",
    ano_fabricacao: veiculo.ano_fabricacao ?? "",
    combustivel_principal_id: veiculo.combustivel_principal_id ?? "",
    capacidade_tanque_litros: veiculo.capacidade_tanque_litros ?? "",
    unidade: veiculo.unidade ?? "",
    departamento: veiculo.departamento ?? "",
    filial: veiculo.filial ?? "",
    centro_custo: veiculo.centro_custo ?? "",
    patrimonio: veiculo.patrimonio ?? "",
    situacao: veiculo.situacao,
  });

  const campo = (k: string) => ({
    value: (form as never)[k] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value })),
    className:
      "w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm focus:border-[#1D4ED8] focus:outline-none",
  });

  return (
    <form
      className="grid gap-3 rounded-card border border-surface-border bg-white p-4 shadow-card sm:grid-cols-3 lg:grid-cols-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSalvando(true);
        try {
          await api.updateVeiculo(veiculo.id, {
            ...form,
            ano_fabricacao: form.ano_fabricacao ? Number(form.ano_fabricacao) : undefined,
            capacidade_tanque_litros: form.capacidade_tanque_litros || undefined,
            combustivel_principal_id: form.combustivel_principal_id || undefined,
          });
          toast.success("Veículo atualizado.");
          onSalvo();
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setSalvando(false);
        }
      }}
    >
      <label className="text-meta">Marca<input {...campo("marca")} /></label>
      <label className="text-meta">Modelo<input {...campo("modelo")} /></label>
      <label className="text-meta">Tipo
        <select {...campo("tipo")}>
          {["CARRO", "UTILITARIO", "CAMINHONETE", "CAMINHAO", "ONIBUS", "MICRO_ONIBUS", "VAN", "MOTOCICLETA", "MAQUINA", "TRATOR", "EQUIPAMENTO", "OUTRO"].map((t) => (
            <option key={t} value={t}>{t.replace("_", "-")}</option>
          ))}
        </select>
      </label>
      <label className="text-meta">Situação
        <select {...campo("situacao")}>
          {["DISPONIVEL", "EM_USO", "EM_MANUTENCAO", "INDISPONIVEL", "BAIXADO"].map((s) => (
            <option key={s} value={s}>{s.replace("_", " ")}</option>
          ))}
        </select>
      </label>
      <label className="text-meta">Cor<input {...campo("cor")} /></label>
      <label className="text-meta">Ano fabricação<input type="number" {...campo("ano_fabricacao")} /></label>
      <label className="text-meta">Combustível principal
        <select {...campo("combustivel_principal_id")}>
          <option value="">—</option>
          {combustiveis.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
      </label>
      <label className="text-meta">Capacidade tanque (L)<input type="number" step="0.01" {...campo("capacidade_tanque_litros")} /></label>
      <label className="text-meta">Unidade<input {...campo("unidade")} /></label>
      <label className="text-meta">Departamento<input {...campo("departamento")} /></label>
      <label className="text-meta">Filial<input {...campo("filial")} /></label>
      <label className="text-meta">Centro de custo<input {...campo("centro_custo")} /></label>
      <label className="text-meta">Patrimônio<input {...campo("patrimonio")} /></label>
      <div className="sm:col-span-2 lg:col-span-4 flex justify-end gap-2">
        <button type="button" onClick={onSalvo} className="btn btn-secondary btn-sm">Cancelar</button>
        <button disabled={salvando} className="btn btn-primary btn-sm">{salvando ? "Salvando…" : "Salvar alterações"}</button>
      </div>
    </form>
  );
}

function Info({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-card border border-surface-border bg-white p-4 shadow-card">
      <div className="text-meta text-text-subtle">{titulo}</div>
      <div className="text-h3 capitalize text-text-title">{valor}</div>
    </div>
  );
}
