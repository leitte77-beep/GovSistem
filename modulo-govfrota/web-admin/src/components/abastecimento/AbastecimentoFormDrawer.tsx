"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import {
  api,
  Combustivel,
  Configuracoes,
  Fornecedor,
  MotoristaListItem,
  Tanque,
  Veiculo,
  VeiculoListItem,
} from "@/lib/api";
import { Drawer, Label } from "@/components/tanque/Drawer";
import { UploadImagem } from "@/components/tanque/UploadImagem";
import { AvatarMotorista } from "@/components/motorista/AvatarMotorista";
import { FotoVeiculo } from "@/components/veiculo/FotoVeiculo";
import {
  formatarKm,
  novaIdempotencyKey,
} from "@/lib/abastecimentos";

interface Props {
  aberto: boolean;
  onClose: () => void;
  onSalvo: () => void;
  veiculoPreselecionadoId?: string | null;
}

function agoraLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function AbastecimentoFormDrawer({ aberto, onClose, onSalvo, veiculoPreselecionadoId }: Props) {
  const [salvando, setSalvando] = useState(false);
  const [config, setConfig] = useState<Configuracoes | null>(null);

  const [veiculos, setVeiculos] = useState<VeiculoListItem[]>([]);
  const [veiculo, setVeiculo] = useState<Veiculo | null>(null);
  const [buscaVeiculo, setBuscaVeiculo] = useState("");
  const [veiculoMenu, setVeiculoMenu] = useState(false);

  const [motoristas, setMotoristas] = useState<MotoristaListItem[]>([]);
  const [combustiveis, setCombustiveis] = useState<Combustivel[]>([]);
  const [tanques, setTanques] = useState<Tanque[]>([]);
  const [postos, setPostos] = useState<Fornecedor[]>([]);

  const [motoristaId, setMotoristaId] = useState("");
  const [combustivelId, setCombustivelId] = useState("");
  const [tanqueId, setTanqueId] = useState("");
  const [modalidade, setModalidade] = useState<"TANQUE_PROPRIO" | "POSTO_CREDENCIADO">("TANQUE_PROPRIO");
  const [postoId, setPostoId] = useState("");
  const [numeroNf, setNumeroNf] = useState("");
  const [chaveNfe, setChaveNfe] = useState("");
  const [litros, setLitros] = useState("");
  const [km, setKm] = useState("");
  const [completouTanque, setCompletouTanque] = useState<boolean | null>(null);
  const [dataHora, setDataHora] = useState(agoraLocal());
  const [fotoBomba, setFotoBomba] = useState<File | null>(null);
  const [fotoPainel, setFotoPainel] = useState<File | null>(null);
  const [observacoes, setObservacoes] = useState("");
  const idempotencyRef = useRef(novaIdempotencyKey());

  // Reset ao abrir
  useEffect(() => {
    if (aberto) {
      setVeiculo(null);
      setVeiculoPresel(veiculoPreselecionadoId);
      setMotoristaId("");
      setCombustivelId("");
      setTanqueId("");
      setPostoId("");
      setNumeroNf("");
      setChaveNfe("");
      setLitros("");
      setKm("");
      setCompletouTanque(null);
      setDataHora(agoraLocal());
      setFotoBomba(null);
      setFotoPainel(null);
      setObservacoes("");
      setBuscaVeiculo("");
      idempotencyRef.current = novaIdempotencyKey();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  function setVeiculoPresel(id?: string | null) {
    if (!id) return;
    const v = veiculos.find((x) => x.id === id);
    if (v) carregarVeiculo(id);
  }

  useEffect(() => {
    if (!aberto) return;
    api.getConfiguracoes().then(setConfig).catch(() => {});
    api.listVeiculos({ limit: 300, sort_by: "placa", order: "asc" }).then((d) => setVeiculos(d.itens)).catch(() => {});
    api.listMotoristas({ limit: 300, ativo: true, sort_by: "nome", order: "asc" }).then((d) => setMotoristas(d.itens)).catch(() => {});
    api.listCombustiveis(true).then(setCombustiveis).catch(() => {});
    api.listTanques().then(setTanques).catch(() => {});
    api
      .listFornecedores({ posto_credenciado: true, ativo: true, limit: 200 })
      .then((r) => setPostos(r.itens))
      .catch(() => {});
  }, [aberto]);

  // Sem tanque próprio ativo e com posto credenciado → começa no posto.
  useEffect(() => {
    if (!aberto) return;
    const temTanque = tanques.some((t) => t.ativo);
    setModalidade(!temTanque && postos.length > 0 ? "POSTO_CREDENCIADO" : "TANQUE_PROPRIO");
  }, [aberto, tanques, postos]);

  useEffect(() => {
    if (postos.length === 1) setPostoId(postos[0].id);
  }, [postos]);

  const veiculosFiltrados = useMemo(() => {
    const q = buscaVeiculo.trim().toLowerCase();
    if (!q) return veiculos;
    return veiculos.filter((v) =>
      [v.placa, v.marca, v.modelo].filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }, [veiculos, buscaVeiculo]);

  // Combustíveis compatíveis: os aceitos por algum reservatório do veículo
  // (principal, flex e auxiliares como ARLA).
  const idsAceitos = (v: Veiculo | null): Set<string> =>
    new Set(
      (v?.tanques ?? [])
        .filter((t) => t.ativo)
        .flatMap((t) => [t.combustivel_id, t.combustivel_alternativo_id])
        .filter(Boolean) as string[]
    );
  const compativeis = useMemo(() => {
    if (!veiculo) return [];
    const ids = idsAceitos(veiculo);
    return combustiveis.filter((c) => ids.size === 0 || ids.has(c.id));
  }, [veiculo, combustiveis]);

  const tanquesFiltrados = useMemo(() => {
    if (!combustivelId) return [];
    return tanques.filter((t) => t.combustivel_id === combustivelId && t.ativo);
  }, [tanques, combustivelId]);

  async function carregarVeiculo(id: string) {
    try {
      const v = await api.getVeiculo(id);
      setVeiculo(v);
      // Seleciona combustível automaticamente quando há apenas um compatível
      const aceitos = idsAceitos(v);
      const comp = combustiveis.filter((c) => aceitos.has(c.id));
      if (comp.length === 1) setCombustivelId(comp[0].id);
      else setCombustivelId("");
      setTanqueId("");
      setKm(v.usa_horimetro ? String(v.horimetro_atual ?? "") : String(v.quilometragem_atual ?? ""));
    } catch {
      toast.error("Falha ao carregar veículo.");
    }
  }

  function selecionarVeiculo(v: VeiculoListItem) {
    setBuscaVeiculo(`${v.placa}${v.modelo ? ` — ${[v.marca, v.modelo].filter(Boolean).join(" ")}` : ""}`);
    setVeiculoMenu(false);
    carregarVeiculo(v.id);
  }

  // Auto-seleção de tanque quando há apenas um compatível
  useEffect(() => {
    if (tanquesFiltrados.length === 1 && tanqueId !== tanquesFiltrados[0].id) {
      setTanqueId(tanquesFiltrados[0].id);
    } else if (tanquesFiltrados.length !== 1 && !tanquesFiltrados.some((t) => t.id === tanqueId)) {
      setTanqueId("");
    }
  }, [tanquesFiltrados, tanqueId]);

  const tanqueSelecionado = tanques.find((t) => t.id === tanqueId);

  function isKmValida(): boolean {
    const kmNum = Number(km);
    if (veiculo?.usa_horimetro) {
      if (veiculo.horimetro_atual && kmNum < Number(veiculo.horimetro_atual)) {
        toast.error(`Horímetro informado (${kmNum}) é inferior ao último registrado (${veiculo.horimetro_atual}).`);
        return false;
      }
      return true;
    }
    if (veiculo?.quilometragem_atual && kmNum < veiculo.quilometragem_atual) {
      toast.error(`KM informada (${kmNum}) é inferior à última registrada (${veiculo.quilometragem_atual}).`);
      return false;
    }
    return true;
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!veiculo) return toast.error("Selecione um veículo.");
    if (!combustivelId) return toast.error("Selecione o combustível.");
    if (modalidade === "TANQUE_PROPRIO" && !tanqueId) return toast.error("Selecione o tanque.");
    if (modalidade === "POSTO_CREDENCIADO" && !postoId) return toast.error("Selecione o posto.");
    if (config?.exigir_tanque_cheio && completouTanque === null) return toast.error("Informe se completou o tanque.");
    const litrosNum = Number(litros);
    if (!litrosNum || litrosNum <= 0) return toast.error("Informe os litros abastecidos.");
    if (km === "" || Number(km) < 0) return toast.error("Informe o KM/horímetro.");
    if (!isKmValida()) return;
    if (dataHora && config && !config.permitir_retroativo) {
      const escolhido = new Date(dataHora);
      const limite = new Date(Date.now() - 60 * 60 * 1000);
      if (escolhido < limite) {
        return toast.error("Lançamento retroativo desabilitado na organização.");
      }
    }
    if (config?.foto_bomba_obrigatoria && !fotoBomba) return toast.error("Foto da bomba é obrigatória.");
    if (config?.foto_km_obrigatoria && !fotoPainel) return toast.error("Foto do painel/KM é obrigatória.");

    setSalvando(true);
    try {
      const [bombaUrl, painelUrl] = await Promise.all([
        fotoBomba ? api.upload(fotoBomba).then((r) => r.url) : Promise.resolve(null),
        fotoPainel ? api.upload(fotoPainel).then((r) => r.url) : Promise.resolve(null),
      ]);
      await api.createAbastecimento({
        veiculo_id: veiculo.id,
        motorista_id: motoristaId || undefined,
        modalidade,
        ...(modalidade === "TANQUE_PROPRIO"
          ? { tanque_id: tanqueId }
          : {
              fornecedor_id: postoId,
              numero_nf: numeroNf || undefined,
              chave_nfe: chaveNfe.replace(/\D/g, "") || undefined,
            }),
        combustivel_id: combustivelId,
        quantidade_litros: litros,
        // Máquinas: a medição vai no horímetro; km fica como está no veículo.
        quilometragem: veiculo.usa_horimetro ? 0 : Number(km),
        horimetro: veiculo.usa_horimetro ? km : undefined,
        completou_tanque: completouTanque,
        data_abastecimento: new Date(dataHora).toISOString(),
        observacoes: observacoes || undefined,
        foto_bomba_url: bombaUrl,
        foto_painel_url: painelUrl,
        idempotency_key: idempotencyRef.current,
      });
      toast.success("Abastecimento registrado.");
      onSalvo();
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Drawer
      aberto={aberto}
      onClose={onClose}
      titulo="Novo abastecimento administrativo"
      largura="max-w-3xl"
      rodape={
        <button
          type="submit"
          form="form-abastecimento"
          className="btn btn-primary"
          disabled={salvando}
        >
          {salvando ? <><Loader2 size={16} className="animate-spin" /> Registrando abastecimento…</> : "Registrar abastecimento"}
        </button>
      }
    >
      <form id="form-abastecimento" className="space-y-6" onSubmit={enviar}>
        {/* Veículo */}
        <section className="space-y-3">
          <h3 className="text-label font-semibold text-text-title">Veículo *</h3>
          <div className="relative">
            <input
              value={buscaVeiculo}
              onChange={(e) => { setBuscaVeiculo(e.target.value); setVeiculoMenu(true); }}
              onFocus={() => setVeiculoMenu(true)}
              onBlur={() => setTimeout(() => setVeiculoMenu(false), 150)}
              placeholder="Buscar por placa, marca ou modelo…"
              className="input"
              autoComplete="off"
            />
            {veiculoMenu && veiculosFiltrados.length > 0 && (
              <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-card border border-surface-border bg-white shadow-elevated">
                {veiculosFiltrados.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onMouseDown={() => selecionarVeiculo(v)}
                    className="flex w-full items-center gap-3 border-b border-surface-border px-3 py-2 text-left last:border-0 hover:bg-surface-bg"
                  >
                    <FotoVeiculo src={v.foto_url} className="h-9 w-12 flex-shrink-0 rounded-btn" />
                    <div className="min-w-0 flex-1">
                      <div className="text-body-sm font-medium text-text-title">{v.placa}</div>
                      <div className="truncate text-meta text-text-subtle">
                        {[v.marca, v.modelo].filter(Boolean).join(" ") || "—"}
                      </div>
                    </div>
                    <div className="text-right text-meta text-text-subtle">
                      <div>{v.usa_horimetro ? "Horímetro" : "KM"}: {v.usa_horimetro ? formatarKm(v.horimetro_atual, true) : formatarKm(v.quilometragem_atual)}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {veiculo && (
            <div className="rounded-card border border-[#1D4ED8]/20 bg-[#EFF4FF] p-3">
              <div className="flex items-center gap-3">
                <FotoVeiculo src={veiculo.foto_url} className="h-12 w-16 rounded-btn" />
                <div className="min-w-0">
                  <div className="text-body font-semibold text-text-title">{veiculo.placa}</div>
                  <div className="text-body-sm text-text-body">{veiculo.marca} {veiculo.modelo}</div>
                  <div className="mt-1 flex flex-wrap gap-x-4 text-meta text-text-subtle">
                    <span>Último {veiculo.usa_horimetro ? "horímetro" : "KM"}: <strong className="tabular-nums">{veiculo.usa_horimetro ? formatarKm(veiculo.horimetro_atual, true) : formatarKm(veiculo.quilometragem_atual)}</strong></span>
                    {compativeis.length > 0 && (
                      <span>Combustível: <strong>{compativeis.map((c) => c.nome).join(" · ")}</strong></span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Motorista */}
        <section className="space-y-3">
          <h3 className="text-label font-semibold text-text-title">Motorista <span className="font-normal text-text-subtle">(opcional)</span></h3>
          <select className="input" value={motoristaId} onChange={(e) => setMotoristaId(e.target.value)}>
            <option value="">Sem motorista associado</option>
            {motoristas.map((m) => (
              <option key={m.id} value={m.id}>{m.nome}</option>
            ))}
          </select>
          {motoristaId && <AvatarMotorista nome={motoristas.find((m) => m.id === motoristaId)?.nome || ""} src={null} className="h-8 w-8 text-xs" />}
        </section>

        {/* Onde abasteceu */}
        <section className="space-y-2">
          <h3 className="text-label font-semibold text-text-title">Onde abasteceu *</h3>
          <div className="grid grid-cols-2 gap-2">
            {([
              ["TANQUE_PROPRIO", "Tanque próprio", "Sai do estoque da organização"],
              ["POSTO_CREDENCIADO", "Posto credenciado", "Posto externo (ex.: licitação)"],
            ] as const).map(([valor, titulo, ajuda]) => (
              <button
                key={valor}
                type="button"
                onClick={() => setModalidade(valor)}
                className={`rounded-btn border px-3 py-2 text-left transition-colors ${modalidade === valor ? "border-[#1D4ED8] bg-[#EFF4FF]" : "border-surface-border"}`}
              >
                <span className={`block text-body-sm font-medium ${modalidade === valor ? "text-[#1D4ED8]" : "text-text-title"}`}>{titulo}</span>
                <span className="block text-meta text-text-subtle">{ajuda}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Combustível e Tanque/Posto */}
        <section className="grid gap-4 sm:grid-cols-2">
          <Label texto="Combustível *">
            <select className="input" value={combustivelId} onChange={(e) => setCombustivelId(e.target.value)} disabled={!veiculo}>
              <option value="">{veiculo ? "Selecione…" : "Selecione o veículo primeiro"}</option>
              {compativeis.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Label>
          {modalidade === "POSTO_CREDENCIADO" ? (
            <Label texto="Posto *">
              <select className="input" value={postoId} onChange={(e) => setPostoId(e.target.value)}>
                <option value="">{postos.length ? "Selecione…" : "Nenhum posto credenciado cadastrado"}</option>
                {postos.map((p) => <option key={p.id} value={p.id}>{p.nome_fantasia || p.razao_social}</option>)}
              </select>
            </Label>
          ) : (
          <Label texto="Tanque *">
            <select className="input" value={tanqueId} onChange={(e) => setTanqueId(e.target.value)} disabled={!combustivelId}>
              <option value="">{combustivelId ? "Selecione…" : "Selecione o combustível primeiro"}</option>
              {tanquesFiltrados.map((t) => (
                <option key={t.id} value={t.id}>{t.nome} · estoque {Number(t.estoque_atual).toLocaleString("pt-BR")} L</option>
              ))}
            </select>
          </Label>
          )}
        </section>

        {modalidade === "POSTO_CREDENCIADO" && (
          <section className="grid gap-4 sm:grid-cols-2">
            <p className="text-meta text-text-subtle sm:col-span-2">
              O valor é calculado pelo preço do contrato com o posto — informe só a quantidade.
            </p>
            <Label texto="Nº da nota fiscal">
              <input value={numeroNf} onChange={(e) => setNumeroNf(e.target.value)} className="input" maxLength={50} />
            </Label>
            <Label texto="Chave de acesso da NF-e">
              <input value={chaveNfe} onChange={(e) => setChaveNfe(e.target.value)} className="input" maxLength={60} placeholder="44 dígitos" />
            </Label>
          </section>
        )}

        {modalidade === "TANQUE_PROPRIO" && tanqueSelecionado && (
          <div className="rounded-card border border-surface-border bg-surface-bg p-3">
            <div className="text-body-sm font-medium text-text-title">{tanqueSelecionado.nome}</div>
            <div className="text-meta text-text-subtle">{tanqueSelecionado.combustivel_nome}</div>
            <div className="mt-1 text-meta text-text-subtle">
              Estoque disponível: <strong className="tabular-nums text-text-body">{Number(tanqueSelecionado.estoque_atual).toLocaleString("pt-BR")} L</strong>
            </div>
          </div>
        )}

        {/* Quantidade e KM */}
        <section className="grid gap-4 sm:grid-cols-2">
          <Label texto="Litros abastecidos *">
            <input type="number" step="0.01" min="0.01" value={litros} onChange={(e) => setLitros(e.target.value)} className="input" placeholder="0,00" />
          </Label>
          <Label texto={veiculo?.usa_horimetro ? "Horímetro atual *" : "KM atual *"}>
            <input type="number" step={veiculo?.usa_horimetro ? "0.1" : "1"} min="0" value={km} onChange={(e) => setKm(e.target.value)} className="input" placeholder={veiculo?.usa_horimetro ? "0,0" : "0"} disabled={!veiculo} />
            {veiculo && (
              <span className="text-meta text-text-subtle">
                Último registro: <strong className="tabular-nums">{veiculo.usa_horimetro ? formatarKm(veiculo.horimetro_atual, true) : formatarKm(veiculo.quilometragem_atual)}</strong>
              </span>
            )}
          </Label>
        </section>

        {/* Data/hora e tanque cheio */}
        <section className="grid gap-4 sm:grid-cols-2">
          <Label texto="Data / hora do abastecimento *">
            <input type="datetime-local" value={dataHora} max={config?.permitir_retroativo ? undefined : agoraLocal()} onChange={(e) => setDataHora(e.target.value)} className="input" />
            {config && !config.permitir_retroativo && (
              <span className="text-meta text-warning-vibrant">Retroativo desabilitado — apenas registros recentes.</span>
            )}
          </Label>
          <Label texto={config?.exigir_tanque_cheio ? "Completou o tanque? *" : "Completou o tanque?"}>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setCompletouTanque(true)} className={`rounded-btn border px-3 py-2 text-body-sm transition-colors ${completouTanque === true ? "border-[#1D4ED8] bg-[#EFF4FF] font-medium text-[#1D4ED8]" : "border-surface-border text-text-body"}`}>Sim</button>
              <button type="button" onClick={() => setCompletouTanque(false)} className={`rounded-btn border px-3 py-2 text-body-sm transition-colors ${completouTanque === false ? "border-[#1D4ED8] bg-[#EFF4FF] font-medium text-[#1D4ED8]" : "border-surface-border text-text-body"}`}>Não</button>
            </div>
          </Label>
        </section>

        {/* Fotos */}
        <section className="space-y-3">
          <h3 className="text-label font-semibold text-text-title">Fotos <span className="font-normal text-text-subtle">(opcional)</span></h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <UploadImagem onMudar={(file) => setFotoBomba(file)} alt="Foto da bomba" nomeArquivo="Foto da bomba" />
            <UploadImagem onMudar={(file) => setFotoPainel(file)} alt="Foto do painel/KM" nomeArquivo="Foto do painel/KM" />
          </div>
        </section>

        {/* Observações */}
        <Label texto="Observações">
          <textarea rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} className="input" placeholder="Opcional" />
        </Label>

        {/* Resumo */}
        {veiculo && litros && (
          <section className="rounded-card border border-[#1D4ED8]/20 bg-[#F8FBFF] p-4">
            <h3 className="mb-3 text-label font-semibold text-text-title">Resumo</h3>
            <dl className="grid gap-x-6 gap-y-1 text-body-sm sm:grid-cols-2">
              <ResumoItem rotulo="Veículo" valor={`${veiculo.placa} • ${[veiculo.marca, veiculo.modelo].filter(Boolean).join(" ")}`} />
              <ResumoItem rotulo="Motorista" valor={motoristaId ? motoristas.find((m) => m.id === motoristaId)?.nome || "—" : "—"} />
              <ResumoItem rotulo="Combustível" valor={combustiveis.find((c) => c.id === combustivelId)?.nome || "—"} />
              <ResumoItem
                rotulo={modalidade === "POSTO_CREDENCIADO" ? "Posto" : "Tanque"}
                valor={
                  modalidade === "POSTO_CREDENCIADO"
                    ? (() => { const p = postos.find((x) => x.id === postoId); return p ? p.nome_fantasia || p.razao_social : "—"; })()
                    : tanqueSelecionado?.nome || "—"
                }
              />
              <ResumoItem rotulo="Quantidade" valor={`${Number(litros).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} L`} />
              <ResumoItem rotulo={veiculo.usa_horimetro ? "Horímetro" : "KM"} valor={`${Number(km).toLocaleString("pt-BR")} ${veiculo.usa_horimetro ? "h" : "km"}`} />
              <ResumoItem rotulo="Data" valor={dataHora ? new Date(dataHora).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—"} />
              <ResumoItem rotulo="Tanque cheio" valor={completouTanque === null ? "—" : completouTanque ? "Sim" : "Não"} />
            </dl>
          </section>
        )}
      </form>
    </Drawer>
  );
}

function ResumoItem({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-surface-border/60 py-1 last:border-0">
      <dt className="text-text-subtle">{rotulo}</dt>
      <dd className="text-right font-medium text-text-title">{valor}</dd>
    </div>
  );
}
