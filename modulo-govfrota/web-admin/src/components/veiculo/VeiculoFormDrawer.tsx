"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Camera, Fuel, Trash2, Upload, X } from "lucide-react";
import { api, Combustivel, Unidade, Veiculo } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  chassiValido,
  CORES_VEICULO,
  MARCAS_COMUNS,
  normalizarChassi,
  normalizarPlaca,
  renavamValido,
  soDigitos,
  placaValida,
  SITUACOES,
  SITUACOES_LISTA,
  TIPOS_HORIMETRO,
  TIPOS_VEICULO_LISTA,
} from "@/lib/veiculos";

interface VeiculoFormDrawerProps {
  aberto: boolean;
  onClose: () => void;
  veiculo: Veiculo | null;
  combustiveis: Combustivel[];
  tipoOrganizacao: string;
  onSalvo: () => void;
}

const VENDA_CLASSE_IMG = "h-32 w-40 flex-shrink-0 overflow-hidden rounded-btn border border-surface-border bg-surface-bg object-cover";

export function VeiculoFormDrawer({
  aberto,
  onClose,
  veiculo,
  combustiveis,
  tipoOrganizacao,
  onSalvo,
}: VeiculoFormDrawerProps) {
  const { hasPermission } = useAuth();
  const podeCadastrarCombustivel = hasPermission("fuel.manage");

  const [salvando, setSalvando] = useState(false);
  const [arquivoFoto, setArquivoFoto] = useState<File | null>(null);
  const [fotoUrlAtual, setFotoUrlAtual] = useState<string>(veiculo?.foto_url ?? "");
  const [previewFoto, setPreviewFoto] = useState<string | null>(null);
  const [erroPlaca, setErroPlaca] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const inputFotoRef = useRef<HTMLInputElement>(null);

  const novoForm = (v: Veiculo | null) => ({
    placa: v?.placa ?? "",
    codigo_interno: v?.codigo_interno ?? "",
    patrimonio: v?.patrimonio ?? "",
    renavam: v?.renavam ?? "",
    chassi: v?.chassi ?? "",
    marca: v?.marca ?? "",
    modelo: v?.modelo ?? "",
    versao: v?.versao ?? "",
    ano_fabricacao: v?.ano_fabricacao ?? "",
    ano_modelo: v?.ano_modelo ?? "",
    cor: v?.cor ?? "",
    tipo: v?.tipo ?? "CARRO",
    usa_horimetro: v?.usa_horimetro ?? false,
    quilometragem_atual: v?.quilometragem_atual ?? 0,
    horimetro_atual: v?.horimetro_atual ?? "",
    combustivel_principal_id: v?.combustivel_principal_id ?? "",
    combustivel_secundario_id: v?.combustivel_secundario_id ?? "",
    capacidade_tanque_litros: v?.capacidade_tanque_litros ?? "",
    unidade_id: v?.unidade_id ?? "",
    departamento: v?.departamento ?? "",
    vencimento_licenciamento: v?.vencimento_licenciamento ?? "",
    vencimento_seguro: v?.vencimento_seguro ?? "",
    situacao: v?.situacao ?? "DISPONIVEL",
    observacoes: v?.observacoes ?? "",
  });

  const [form, setForm] = useState(() => novoForm(veiculo));
  // KM do veículo só muda por alteração auditada (com justificativa).
  const [justificativaKm, setJustificativaKm] = useState("");
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [possuiAuxiliar, setPossuiAuxiliar] = useState(false);
  const [auxiliares, setAuxiliares] = useState<
    { combustivel_id: string; capacidade: string; identificacao: string }[]
  >([]);

  // Reinicializa o formulário sempre que o drawer abre (permite criar em série
  // e editar sem "vazar" dados de outra abertura).
  useEffect(() => {
    if (aberto) {
      api.listUnidades().then(setUnidades).catch(() => setUnidades([]));
      setForm(novoForm(veiculo));
      setJustificativaKm("");
      setFotoUrlAtual(veiculo?.foto_url ?? "");
      setArquivoFoto(null);
      setPreviewFoto(null);
      setErroPlaca(null);
      setErros({});
      setSalvando(false);
      const aux = (veiculo?.tanques ?? []).filter((t) => t.tank_type === "AUXILIARY");
      setPossuiAuxiliar(aux.length > 0);
      setAuxiliares(
        aux.map((t) => ({
          combustivel_id: t.combustivel_id,
          capacidade: String(t.capacidade),
          identificacao: t.identificacao ?? "",
        }))
      );
    }
  }, [aberto, veiculo]);

  const campo = (k: string) => ({
    value: (form as never)[k] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value })),
    className: "input",
  });

  const publico = tipoOrganizacao !== "PRIVADO";
  const rotuloUnidade = publico ? "Secretaria" : "Centro de custo";

  const anoAtual = new Date().getFullYear();

  const atualizar = (k: string, valor: string) => {
    setForm((f) => ({ ...f, [k]: valor }));
    setErros((e) => (e[k] ? { ...e, [k]: "" } : e));
  };

  const tipoHorimetroPadrao = TIPOS_HORIMETRO.has(form.tipo);

  const escolherFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem.");
      return;
    }
    setArquivoFoto(file);
    setPreviewFoto(URL.createObjectURL(file));
  };

  const removerFoto = () => {
    setArquivoFoto(null);
    setPreviewFoto(null);
    setFotoUrlAtual("");
    if (inputFotoRef.current) inputFotoRef.current.value = "";
  };

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const placa = normalizarPlaca(form.placa);
    if (!placaValida(placa)) {
      setErroPlaca("Placa inválida. Use ABC1234 ou ABC1D23 (Mercosul).");
      return;
    }
    setErroPlaca(null);
    const novosErros: Record<string, string> = {};
    if (form.renavam && !renavamValido(form.renavam)) {
      novosErros.renavam = "RENAVAM inválido (confira os 11 dígitos).";
    }
    if (form.chassi && !chassiValido(form.chassi)) {
      novosErros.chassi = "Chassi deve ter 17 caracteres, sem I, O ou Q.";
    }
    const anoAtual = new Date().getFullYear();
    const fab = Number(form.ano_fabricacao || 0);
    const mod = Number(form.ano_modelo || 0);
    if (fab && (fab < 1950 || fab > anoAtual)) {
      novosErros.ano_fabricacao = `Informe um ano entre 1950 e ${anoAtual}.`;
    }
    if (fab && mod && (mod < fab || mod > fab + 1)) {
      novosErros.ano_modelo = "Ano modelo deve ser igual ao de fabricação ou o seguinte.";
    }
    setErros(novosErros);
    if (Object.keys(novosErros).length) {
      toast.error("Corrija os campos destacados.");
      return;
    }
    const kmNovo = Number(form.quilometragem_atual || 0);
    const kmMudou = !!veiculo && !form.usa_horimetro && kmNovo !== veiculo.quilometragem_atual;
    if (kmMudou && justificativaKm.trim().length < 5) {
      toast.error("Informe a justificativa da alteração do KM (mínimo 5 caracteres).");
      return;
    }
    setSalvando(true);
    try {
      let foto_url: string | undefined = fotoUrlAtual || undefined;
      if (arquivoFoto) {
        const up = await api.upload(arquivoFoto);
        foto_url = up.url;
      }
      const payload: Record<string, unknown> = {
        ...form,
        placa,
        foto_url,
        renavam: form.renavam ? soDigitos(form.renavam) : undefined,
        chassi: form.chassi || undefined,
        ano_fabricacao: form.ano_fabricacao ? Number(form.ano_fabricacao) : undefined,
        ano_modelo: form.ano_modelo ? Number(form.ano_modelo) : undefined,
        quilometragem_atual: form.usa_horimetro ? 0 : Number(form.quilometragem_atual || 0),
        horimetro_atual: form.usa_horimetro ? form.horimetro_atual || undefined : undefined,
        combustivel_principal_id: form.combustivel_principal_id || undefined,
        // null limpa o flex na edição (vazio = não aceita outro combustível).
        combustivel_secundario_id: form.combustivel_secundario_id || null,
        capacidade_tanque_litros: form.capacidade_tanque_litros || undefined,
        tanques_auxiliares: possuiAuxiliar
          ? auxiliares
              .filter((a) => a.combustivel_id && a.capacidade)
              .map((a) => ({
                combustivel_id: a.combustivel_id,
                capacidade: Number(a.capacidade),
                identificacao: a.identificacao || undefined,
              }))
          : [],
        vencimento_licenciamento: form.vencimento_licenciamento || undefined,
        vencimento_seguro: form.vencimento_seguro || undefined,
        unidade_id: form.unidade_id || null,
        departamento: form.departamento || undefined,
        observacoes: form.observacoes || undefined,
      };
      if (veiculo) {
        // A edição não altera KM; a mudança vai pela rota auditada.
        delete payload.quilometragem_atual;
        if (kmMudou) await api.alterarKm(veiculo.id, kmNovo, justificativaKm.trim());
        await api.updateVeiculo(veiculo.id, payload);
        toast.success("Veículo atualizado.");
      } else {
        await api.createVeiculo(payload);
        toast.success("Veículo cadastrado.");
      }
      onSalvo();
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto) return null;

  const imgPreview = previewFoto ?? fotoUrlAtual;

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-2xl flex-col bg-white shadow-elevated">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-surface-border px-6 py-4">
          <div>
            <h2 className="text-h3 text-text-title">{veiculo ? "Editar veículo" : "Novo veículo"}</h2>
            <p className="text-meta text-text-subtle">Campos com * são obrigatórios.</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        {/* Corpo com scroll */}
        <form id="veiculo-form" onSubmit={enviar} className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-7">
            {/* Identificação */}
            <Secao titulo="Identificação">
              <div className="grid gap-3 sm:grid-cols-2">
                <Label texto="Placa *">
                  <input
                    {...campo("placa")}
                    placeholder="ABC1D23"
                    maxLength={8}
                    onChange={(e) => {
                      atualizar("placa", e.target.value.toUpperCase());
                      setErroPlaca(null);
                    }}
                    className={`input ${erroPlaca ? "input-error" : ""}`}
                  />
                  {erroPlaca && <span className="text-meta text-[#B42318]">{erroPlaca}</span>}
                </Label>
                <Label texto="Código interno">
                  <input {...campo("codigo_interno")} placeholder="EX.: VH-0001" />
                </Label>
                <Label texto="Patrimônio" dica="Quando aplicável.">
                  <input {...campo("patrimonio")} />
                </Label>
                <Label texto="RENAVAM" erro={erros.renavam}>
                  <input
                    {...campo("renavam")}
                    inputMode="numeric"
                    maxLength={11}
                    placeholder="11 dígitos"
                    onChange={(e) => atualizar("renavam", soDigitos(e.target.value).slice(0, 11))}
                    className={`input ${erros.renavam ? "input-error" : ""}`}
                  />
                </Label>
                <Label texto="Chassi" classe="sm:col-span-2" erro={erros.chassi}>
                  <input
                    {...campo("chassi")}
                    maxLength={17}
                    placeholder="17 caracteres"
                    onChange={(e) => atualizar("chassi", normalizarChassi(e.target.value))}
                    className={`input font-mono uppercase ${erros.chassi ? "input-error" : ""}`}
                  />
                </Label>
              </div>
            </Secao>

            {/* Características */}
            <Secao titulo="Características">
              <div className="grid gap-3 sm:grid-cols-2">
                <Label texto="Marca">
                  <input {...campo("marca")} list="marcas-veiculo" placeholder="Ex.: Toyota" />
                  <datalist id="marcas-veiculo">
                    {MARCAS_COMUNS.map((m) => <option key={m} value={m} />)}
                  </datalist>
                </Label>
                <Label texto="Modelo">
                  <input {...campo("modelo")} placeholder="Ex.: Hilux" />
                </Label>
                <Label texto="Versão" dica="Opcional.">
                  <input {...campo("versao")} />
                </Label>
                <Label texto="Tipo *">
                  <select {...campo("tipo")}>
                    {TIPOS_VEICULO_LISTA.map(([valor, nome]) => (
                      <option key={valor} value={valor}>{nome}</option>
                    ))}
                  </select>
                </Label>
                <Label texto="Ano fabricação" erro={erros.ano_fabricacao}>
                  <input
                    type="number"
                    min={1950}
                    max={anoAtual}
                    placeholder={String(anoAtual)}
                    {...campo("ano_fabricacao")}
                    className={`input ${erros.ano_fabricacao ? "input-error" : ""}`}
                  />
                </Label>
                <Label texto="Ano modelo" erro={erros.ano_modelo}>
                  <input
                    type="number"
                    min={1950}
                    max={anoAtual + 1}
                    placeholder={String(anoAtual)}
                    {...campo("ano_modelo")}
                    className={`input ${erros.ano_modelo ? "input-error" : ""}`}
                  />
                </Label>
                <Label texto="Cor">
                  <select {...campo("cor")}>
                    <option value="">—</option>
                    {/* Mantém cor legada digitada à mão, fora da lista. */}
                    {form.cor && !CORES_VEICULO.includes(form.cor) && (
                      <option value={form.cor}>{form.cor}</option>
                    )}
                    {CORES_VEICULO.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </Label>
              </div>
            </Secao>

            {/* Controle */}
            <Secao titulo="Controle">
              <div className="space-y-5">
                <div>
                  <span className="text-meta">Modo de controle</span>
                  <div className="mt-1.5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, usa_horimetro: false }))}
                      className={`rounded-btn border px-4 py-2 text-body-sm font-medium ${
                        !form.usa_horimetro
                          ? "border-[#1D4ED8] bg-[#EFF6FF] text-[#1D4ED8]"
                          : "border-surface-border bg-white text-text-body"
                      }`}
                    >
                      Quilometragem (km)
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, usa_horimetro: true }))}
                      className={`rounded-btn border px-4 py-2 text-body-sm font-medium ${
                        form.usa_horimetro
                          ? "border-[#1D4ED8] bg-[#EFF6FF] text-[#1D4ED8]"
                          : "border-surface-border bg-white text-text-body"
                      }`}
                    >
                      Horímetro (h)
                    </button>
                  </div>
                  {tipoHorimetroPadrao && !form.usa_horimetro && (
                    <p className="mt-1 text-meta text-text-subtle">
                      Este tipo costuma usar horímetro. Você pode mudar acima se preferir.
                    </p>
                  )}
                </div>
                {form.usa_horimetro ? (
                  <Label texto="Horímetro inicial (h)">
                    <input type="number" step="0.1" min={0} {...campo("horimetro_atual")} placeholder="Ex.: 2480,5" />
                  </Label>
                ) : (
                  <Label texto={veiculo ? "Quilometragem atual (km)" : "Quilometragem inicial (km)"}>
                    <input type="number" min={0} {...campo("quilometragem_atual")} placeholder="Ex.: 50350" />
                    {veiculo && Number(form.quilometragem_atual || 0) !== veiculo.quilometragem_atual && (
                      <span className="mt-2 block">
                        <span className="block text-meta text-warning-vibrant">
                          O KM era {veiculo.quilometragem_atual.toLocaleString("pt-BR")} km. A alteração fica registrada na auditoria.
                        </span>
                        <input
                          className="input mt-1"
                          placeholder="Justificativa da alteração do KM *"
                          value={justificativaKm}
                          onChange={(e) => setJustificativaKm(e.target.value)}
                          maxLength={2000}
                        />
                      </span>
                    )}
                  </Label>
                )}
              </div>
            </Secao>

            {/* Combustível */}
            <Secao titulo="Combustível">
              {combustiveis.length === 0 ? (
                <div className="rounded-btn border border-surface-border bg-surface-bg p-4 text-center">
                  <Fuel size={18} className="mx-auto mb-1 text-text-subtle" />
                  <p className="text-body-sm text-text-subtle">Nenhum combustível cadastrado.</p>
                  {podeCadastrarCombustivel && (
                    <Link href="/configuracoes" className="mt-1 inline-block text-body-sm font-medium text-[#1D4ED8] hover:underline">
                      Cadastrar combustível
                    </Link>
                  )}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Label texto="Combustível principal">
                    <select {...campo("combustivel_principal_id")}>
                      <option value="">—</option>
                      {combustiveis.map((c) => (
                        <option key={c.id} value={c.id}>{c.nome}</option>
                      ))}
                    </select>
                  </Label>
                  <Label texto="Também aceita (flex)">
                    <select {...campo("combustivel_secundario_id")}>
                      <option value="">—</option>
                      {combustiveis.map((c) => (
                        <option key={c.id} value={c.id}>{c.nome}</option>
                      ))}
                    </select>
                  </Label>
                  <Label texto="Capacidade do tanque (L)">
                    <input type="number" step="0.01" min={0} {...campo("capacidade_tanque_litros")} />
                  </Label>
                </div>
              )}
              {/* Reservatório auxiliar (ex.: ARLA 32) */}
              <div className="mt-3 rounded-btn border border-surface-border bg-surface-bg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-body-sm font-medium text-text-title">Possui tanque auxiliar?</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setPossuiAuxiliar(false); setAuxiliares([]); }}
                      className={`rounded-pill px-3 py-1 text-meta ${!possuiAuxiliar ? "bg-[#1D4ED8] text-white" : "bg-surface-bg text-text-subtle border border-surface-border"}`}
                    >
                      Não
                    </button>
                    <button
                      type="button"
                      onClick={() => setPossuiAuxiliar(true)}
                      className={`rounded-pill px-3 py-1 text-meta ${possuiAuxiliar ? "bg-[#1D4ED8] text-white" : "bg-surface-bg text-text-subtle border border-surface-border"}`}
                    >
                      Sim
                    </button>
                  </div>
                </div>
                {possuiAuxiliar && (
                  <div className="mt-3 space-y-3">
                    {auxiliares.map((aux, i) => (
                      <div key={i} className="grid gap-2 rounded-btn border border-surface-border bg-white p-3 sm:grid-cols-2">
                        <Label texto="Produto / Fluido">
                          <select
                            value={aux.combustivel_id}
                            onChange={(e) =>
                              setAuxiliares((list) => list.map((a, j) => (j === i ? { ...a, combustivel_id: e.target.value } : a)))
                            }
                          >
                            <option value="">—</option>
                            {combustiveis.map((c) => (
                              <option key={c.id} value={c.id}>{c.nome}</option>
                            ))}
                          </select>
                        </Label>
                        <Label texto="Capacidade (L)">
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            value={aux.capacidade}
                            onChange={(e) =>
                              setAuxiliares((list) => list.map((a, j) => (j === i ? { ...a, capacidade: e.target.value } : a)))
                            }
                          />
                        </Label>
                        <Label texto="Identificação (opcional)">
                          <input
                            value={aux.identificacao}
                            placeholder="ex.: Tanque ARLA"
                            onChange={(e) =>
                              setAuxiliares((list) => list.map((a, j) => (j === i ? { ...a, identificacao: e.target.value } : a)))
                            }
                          />
                        </Label>
                        <div className="flex items-end">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm text-[#BA1A1A]"
                            onClick={() => setAuxiliares((list) => list.filter((_, j) => j !== i))}
                          >
                            <Trash2 size={14} /> Remover
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm w-full"
                      onClick={() => setAuxiliares((list) => [...list, { combustivel_id: "", capacidade: "", identificacao: "" }])}
                    >
                      + Adicionar reservatório auxiliar
                    </button>
                  </div>
                )}
              </div>
            </Secao>

            {/* Lotação */}
            <Secao titulo="Lotação">
              <div className="grid gap-3 sm:grid-cols-2">
                <Label texto={rotuloUnidade}>
                  <select {...campo("unidade_id")}>
                    <option value="">— sem {rotuloUnidade.toLowerCase()} —</option>
                    {unidades
                      .filter((u) => u.ativo || u.id === form.unidade_id)
                      .map((u) => (
                        <option key={u.id} value={u.id}>{u.nome}{u.sigla ? ` (${u.sigla})` : ""}</option>
                      ))}
                  </select>
                  {unidades.length === 0 && (
                    <span className="text-meta text-text-subtle">
                      Cadastre as {publico ? "secretarias" : "centros de custo"} em{" "}
                      <Link href="/configuracoes" className="text-[#1D4ED8] hover:underline">Configurações</Link>.
                    </span>
                  )}
                </Label>
                <Label texto="Departamento / setor (opcional)">
                  <input {...campo("departamento")} />
                </Label>
              </div>
            </Secao>

            {/* Documentação */}
            <Secao titulo="Documentação">
              <p className="text-meta text-text-subtle">
                Opcional — vencimentos iniciais. Documentos completos podem ser adicionados na ficha do veículo.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Label texto="Vencimento do licenciamento">
                  <input type="date" {...campo("vencimento_licenciamento")} />
                </Label>
                <Label texto="Vencimento do seguro">
                  <input type="date" {...campo("vencimento_seguro")} />
                </Label>
              </div>
            </Secao>

            {/* Situação */}
            <Secao titulo="Situação">
              <div className="grid gap-3 sm:grid-cols-2">
                <Label texto="Situação">
                  <select {...campo("situacao")}>
                    {SITUACOES_LISTA.map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </Label>
              </div>
            </Secao>

            {/* Foto e observações */}
            <Secao titulo="Foto e observações">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                {imgPreview ? (
                  <div className={VENDA_CLASSE_IMG}>
                    <img src={imgPreview} alt="Foto do veículo" className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <div className="flex h-32 w-40 flex-shrink-0 items-center justify-center rounded-btn border border-dashed border-surface-border bg-surface-bg text-text-subtle">
                    <Camera size={24} />
                  </div>
                )}
                <div className="space-y-2">
                  <input
                    ref={inputFotoRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={escolherFoto}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => inputFotoRef.current?.click()}
                  >
                    <Upload size={14} /> {imgPreview ? "Substituir foto" : "Selecionar foto"}
                  </button>
                  {imgPreview && (
                    <button type="button" className="btn btn-ghost btn-sm text-[#B42318]" onClick={removerFoto}>
                      <Trash2 size={14} /> Remover foto
                    </button>
                  )}
                  <p className="text-meta text-text-subtle">Opcional. Usada também na tela do motorista.</p>
                </div>
              </div>
              <div className="mt-4">
                <Label texto="Observações">
                  <textarea rows={3} {...campo("observacoes")} />
                </Label>
              </div>
            </Secao>
          </div>
        </form>

        {/* Rodapé fixo */}
        <div className="flex items-center justify-end gap-2 border-t border-surface-border px-6 py-4">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" form="veiculo-form" className="btn btn-primary" disabled={salvando}>
            {salvando ? "Salvando…" : veiculo ? "Salvar alterações" : "Cadastrar veículo"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-label font-semibold text-text-title">{titulo}</h3>
      {children}
    </section>
  );
}

function Label({
  texto,
  children,
  classe,
  dica,
  erro,
}: {
  texto: string;
  children: React.ReactNode;
  classe?: string;
  dica?: string;
  erro?: string;
}) {
  return (
    <label className={`text-meta ${classe ?? ""}`}>
      {texto}
      <span className="mt-1 block">{children}</span>
      {erro ? (
        <span className="mt-1 block text-meta text-[#B42318]">{erro}</span>
      ) : (
        dica && <span className="mt-1 block text-meta text-text-subtle">{dica}</span>
      )}
    </label>
  );
}
