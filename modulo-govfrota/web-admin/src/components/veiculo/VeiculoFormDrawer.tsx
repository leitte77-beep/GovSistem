"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Gauge,
  IdCard,
  Bike,
  Bus,
  BusFront,
  Camera,
  Car,
  CarFront,
  Check,
  Construction,
  Fuel,
  Package,
  Tractor,
  Trash2,
  Truck,
  Upload,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
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

const ETAPAS = ["Identificação", "Características", "Uso e combustível", "Lotação e documentos", "Foto e revisão"];

const DESCRICOES_ETAPA = [
  "Documentos e códigos que identificam o veículo.",
  "Tipo, marca, modelo e aparência.",
  "Como o uso é medido e o que ele abastece.",
  "Onde o veículo está lotado e seus vencimentos.",
  "Uma foto para reconhecer o veículo e a conferência final.",
];

const ICONES_ETAPA = [IdCard, Car, Gauge, Building2, Camera];

const ICONES_TIPO: Record<string, LucideIcon> = {
  CARRO: Car,
  CAMINHONETE: CarFront,
  UTILITARIO: Package,
  CAMINHAO: Truck,
  ONIBUS: Bus,
  MICRO_ONIBUS: BusFront,
  VAN: BusFront,
  MOTOCICLETA: Bike,
  TRATOR: Tractor,
  MAQUINA: Construction,
  EQUIPAMENTO: Wrench,
  OUTRO: Package,
};

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
  // Veículo que já usa a placa/RENAVAM/chassi digitado (conferido ao sair do campo).
  const [duplicados, setDuplicados] = useState<Record<string, { id: string; placa: string } | undefined>>({});
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
    simam_informar: v?.simam_informar ?? true,
    simam_cd_modelo_fipe: v?.simam_cd_modelo_fipe ?? "",
    simam_propriedade: v?.simam_propriedade ?? "PROPRIO",
    simam_tipo_medidor: v?.simam_tipo_medidor ? String(v.simam_tipo_medidor) : "",
  });

  const [form, setForm] = useState(() => novoForm(veiculo));
  const [etapa, setEtapa] = useState(0);
  const formInicial = useRef("");
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
      const inicial = novoForm(veiculo);
      setForm(inicial);
      formInicial.current = JSON.stringify(inicial);
      setEtapa(0);
      setJustificativaKm("");
      setFotoUrlAtual(veiculo?.foto_url ?? "");
      setArquivoFoto(null);
      setPreviewFoto(null);
      setErroPlaca(null);
      setErros({});
      setDuplicados({});
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

  // Sugestões da tabela FIPE do TCE (quando importada).
  const [fipe, setFipe] = useState<{ codigo: string; descricao: string }[]>([]);
  const buscaFipe = useRef<ReturnType<typeof setTimeout>>();
  const buscarFipe = (termo: string) => {
    clearTimeout(buscaFipe.current);
    if (termo.trim().length < 3) return;
    buscaFipe.current = setTimeout(() => {
      api.simamReferencias("ModeloVeiculoFIPE", termo).then((r) => setFipe(r.itens)).catch(() => setFipe([]));
    }, 300);
  };

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

  // Erros de cada etapa (índice da etapa → campo → mensagem).
  function errosDaEtapa(i: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (i === 0) {
      if (!placaValida(normalizarPlaca(form.placa))) {
        e.placa = "Placa inválida. Use ABC1234 ou ABC1D23 (Mercosul).";
      }
      if (form.renavam && !renavamValido(form.renavam)) e.renavam = "RENAVAM inválido (confira os 11 dígitos).";
      if (form.chassi && !chassiValido(form.chassi)) e.chassi = "Chassi deve ter 17 caracteres, sem I, O ou Q.";
    }
    if (i === 1) {
      const fab = Number(form.ano_fabricacao || 0);
      const mod = Number(form.ano_modelo || 0);
      if (fab && (fab < 1950 || fab > anoAtual)) e.ano_fabricacao = `Informe um ano entre 1950 e ${anoAtual}.`;
      if (fab && mod && (mod < fab || mod > fab + 1)) {
        e.ano_modelo = "Ano modelo deve ser igual ao de fabricação ou o seguinte.";
      }
    }
    if (i === 2 && kmMudou && justificativaKm.trim().length < 5) {
      e.justificativa_km = "Informe a justificativa da alteração do KM (mínimo 5 caracteres).";
    }
    return e;
  }

  function validarEtapa(i: number): boolean {
    const e = errosDaEtapa(i);
    setErros(e);
    setErroPlaca(e.placa ?? null);
    return Object.keys(e).length === 0;
  }

  async function verificarDuplicado(campo: "placa" | "renavam" | "chassi"): Promise<boolean> {
    const valor = campo === "placa" ? normalizarPlaca(form.placa) : String(form[campo] ?? "");
    if (!valor) {
      setDuplicados((d) => ({ ...d, [campo]: undefined }));
      return false;
    }
    try {
      const res = await api.verificarDuplicidadeVeiculo(campo, valor, veiculo?.id);
      const dup = res.duplicado && res.veiculo_id ? { id: res.veiculo_id, placa: res.placa ?? "" } : undefined;
      setDuplicados((d) => ({ ...d, [campo]: dup }));
      return !!dup;
    } catch {
      // Falha na consulta não trava o usuário; a API confere de novo ao salvar.
      return false;
    }
  }

  async function avancar() {
    if (!validarEtapa(etapa)) return;
    if (etapa === 0) {
      const achados = await Promise.all((["placa", "renavam", "chassi"] as const).map(verificarDuplicado));
      if (achados.some(Boolean)) return;
    }
    setEtapa((n) => Math.min(n + 1, ETAPAS.length - 1));
  }

  function irPara(i: number) {
    // No cadastro só se volta livremente; para frente é preciso validar.
    if (veiculo || i < etapa || validarEtapa(etapa)) {
      setErros({});
      setErroPlaca(null);
      setEtapa(i);
    }
  }

  function fechar() {
    if (JSON.stringify(form) !== formInicial.current || arquivoFoto) {
      if (!window.confirm("Descartar as informações preenchidas?")) return;
    }
    onClose();
  }

  const kmNovo = Number(form.quilometragem_atual || 0);
  const kmMudou = !!veiculo && !form.usa_horimetro && kmNovo !== veiculo.quilometragem_atual;

  async function enviar(e?: React.FormEvent) {
    e?.preventDefault();
    // Valida tudo; em caso de erro, leva o usuário à primeira etapa com problema.
    for (let i = 0; i < ETAPAS.length; i++) {
      if (!validarEtapa(i)) {
        setEtapa(i);
        toast.error("Corrija os campos destacados.");
        return;
      }
    }
    setErros({});
    setErroPlaca(null);
    const placa = normalizarPlaca(form.placa);
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
        simam_cd_modelo_fipe: form.simam_cd_modelo_fipe.trim() || null,
        simam_tipo_medidor: form.simam_tipo_medidor ? Number(form.simam_tipo_medidor) : null,
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
    <div className="fixed inset-0 z-[70] flex items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={fechar} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="veiculo-form-titulo"
        className="relative flex h-full w-full flex-col bg-white shadow-elevated sm:h-auto sm:max-h-[90vh] sm:max-w-3xl sm:rounded-2xl"
      >
        {/* Cabeçalho */}
        <div className="px-6 pb-4 pt-6 sm:px-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#1D4ED8]">
                <Car size={22} />
              </span>
              <div>
                <h2 id="veiculo-form-titulo" className="text-h3 text-text-title">
                  {veiculo ? `Editar veículo ${veiculo.placa}` : "Novo veículo"}
                </h2>
                <p className="text-meta text-text-subtle">
                  {veiculo ? "Escolha a aba com o que deseja alterar." : "Campos com * são obrigatórios."}
                </p>
              </div>
            </div>
            <button
              className="flex h-9 w-9 items-center justify-center rounded-full text-text-subtle transition-colors hover:bg-surface-bg hover:text-text-title"
              onClick={fechar}
              aria-label="Fechar"
            >
              <X size={20} />
            </button>
          </div>
          {veiculo ? (
            <div role="tablist" className="mt-5 flex gap-1 overflow-x-auto rounded-xl bg-[#F1F5F9] p-1">
              {ETAPAS.map((nome, i) => (
                <button
                  key={nome}
                  type="button"
                  role="tab"
                  aria-selected={etapa === i}
                  onClick={() => irPara(i)}
                  className={`flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-body-sm font-medium transition-all ${
                    etapa === i ? "bg-white text-[#1D4ED8] shadow-sm" : "text-text-subtle hover:text-text-title"
                  }`}
                >
                  {i === ETAPAS.length - 1 ? "Foto e observações" : nome}
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-5">
              <div className="flex gap-1.5" aria-hidden>
                {ETAPAS.map((nome, i) => (
                  <button
                    key={nome}
                    type="button"
                    tabIndex={-1}
                    title={nome}
                    onClick={() => irPara(i)}
                    disabled={i > etapa}
                    className={`h-1.5 flex-1 rounded-full transition-colors duration-300 disabled:cursor-default ${
                      i <= etapa ? "bg-[#1D4ED8]" : "bg-[#E2E8F0]"
                    }`}
                  />
                ))}
              </div>
              <p className="mt-2 text-meta text-text-subtle" aria-live="polite">
                Etapa {etapa + 1} de {ETAPAS.length}
                {etapa < ETAPAS.length - 1 && <> · A seguir: {ETAPAS[etapa + 1]}</>}
              </p>
            </div>
          )}
        </div>

        {/* Corpo com scroll */}
        <form
          id="veiculo-form"
          onSubmit={enviar}
          className="flex-1 overflow-y-auto border-t border-[#EEF2F6] px-6 py-6 sm:px-8 [&_.input:focus]:bg-white [&_.input:focus]:ring-4 [&_.input:focus]:ring-[#1D4ED8]/15 [&_.input]:rounded-xl [&_.input]:border-[#E2E8F0] [&_.input]:bg-[#F8FAFC] [&_.input]:py-3 [&_.input]:hover:border-[#CBD5E1]"
        >
          <div key={etapa} className="animate-[fadeIn_.2s_ease-out] space-y-8">
            {(() => {
              const Icone = ICONES_ETAPA[etapa];
              return (
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#F1F5F9] text-text-title">
                    <Icone size={18} />
                  </span>
                  <div>
                    <h3 className="text-body font-semibold text-text-title">{ETAPAS[etapa]}</h3>
                    <p className="text-meta text-text-subtle">{DESCRICOES_ETAPA[etapa]}</p>
                  </div>
                </div>
              );
            })()}
            {etapa === 0 && (<>
            <Secao>
              <div className="grid gap-3 sm:grid-cols-2">
                <Label texto="Placa *">
                  <input
                    {...campo("placa")}
                    placeholder="ABC1D23"
                    autoFocus={!veiculo}
                    maxLength={8}
                    onChange={(e) => {
                      atualizar("placa", e.target.value.toUpperCase());
                      setDuplicados((d) => ({ ...d, placa: undefined }));
                      setErroPlaca(null);
                    }}
                    onBlur={() => placaValida(normalizarPlaca(form.placa)) && verificarDuplicado("placa")}
                    className={`input font-mono text-lg font-semibold uppercase tracking-[0.2em] placeholder:font-normal placeholder:tracking-[0.2em] ${erroPlaca || duplicados.placa ? "input-error" : ""}`}
                  />
                  {erroPlaca && <span className="text-meta text-[#B42318]">{erroPlaca}</span>}
                  <AvisoDuplicado dup={duplicados.placa} />
                </Label>
                <Label texto="Código interno">
                  <input {...campo("codigo_interno")} placeholder="EX.: VH-0001" />
                </Label>
                <Label texto="Patrimônio (cdBem)">
                  <input {...campo("patrimonio")} placeholder="Código patrimonial — até 10 caracteres" />
                </Label>
                <Label texto="RENAVAM" erro={erros.renavam}>
                  <input
                    {...campo("renavam")}
                    inputMode="numeric"
                    maxLength={11}
                    placeholder="11 dígitos"
                    onChange={(e) => {
                      atualizar("renavam", soDigitos(e.target.value).slice(0, 11));
                      setDuplicados((d) => ({ ...d, renavam: undefined }));
                    }}
                    onBlur={() => verificarDuplicado("renavam")}
                    className={`input ${erros.renavam || duplicados.renavam ? "input-error" : ""}`}
                  />
                  <AvisoDuplicado dup={duplicados.renavam} />
                </Label>
                <Label texto="Chassi" classe="sm:col-span-2" erro={erros.chassi}>
                  <input
                    {...campo("chassi")}
                    maxLength={17}
                    placeholder="17 caracteres"
                    onChange={(e) => {
                      atualizar("chassi", normalizarChassi(e.target.value));
                      setDuplicados((d) => ({ ...d, chassi: undefined }));
                    }}
                    onBlur={() => verificarDuplicado("chassi")}
                    className={`input font-mono uppercase placeholder:font-sans placeholder:normal-case ${erros.chassi || duplicados.chassi ? "input-error" : ""}`}
                  />
                  <AvisoDuplicado dup={duplicados.chassi} />
                </Label>
              </div>
            </Secao>

            </>)}
            {etapa === 1 && (<>
            <Secao>
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
                <Label texto="Versão">
                  <input {...campo("versao")} placeholder="Opcional" />
                </Label>
                <div className="sm:col-span-2">
                  <span className="text-meta">Tipo *</span>
                  <div role="radiogroup" className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {TIPOS_VEICULO_LISTA.map(([valor, nome]) => {
                      const Icone = ICONES_TIPO[valor] ?? Package;
                      const ativo = form.tipo === valor;
                      return (
                        <button
                          key={valor}
                          type="button"
                          role="radio"
                          aria-checked={ativo}
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              tipo: valor,
                              // Sugere o modo de controle natural do tipo no cadastro.
                              usa_horimetro: veiculo ? f.usa_horimetro : TIPOS_HORIMETRO.has(valor),
                            }))
                          }
                          className={`flex flex-col items-center gap-1 rounded-btn border px-2 py-3 text-body-sm transition-colors ${
                            ativo
                              ? "border-[#1D4ED8] bg-[#EFF6FF] font-medium text-[#1D4ED8]"
                              : "border-surface-border bg-white text-text-body hover:border-[#93C5FD]"
                          }`}
                        >
                          <Icone size={22} />
                          {nome}
                        </button>
                      );
                    })}
                  </div>
                </div>
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

            </>)}
            {etapa === 2 && (<>
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
                        {erros.justificativa_km && (
                          <span className="mt-1 block text-meta text-[#B42318]">{erros.justificativa_km}</span>
                        )}
                      </span>
                    )}
                  </Label>
                )}
              </div>
            </Secao>

            
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

            </>)}
            {etapa === 3 && (<>
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

            
            <Secao titulo="SIM-AM / TCE-PR">
              <p className="text-meta text-text-subtle">
                Dados do arquivo mensal VeiculoEquipamento. O código patrimonial (cdBem) é o campo Patrimônio;
                o combustível vem do reservatório principal.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Label texto="Código do modelo FIPE">
                  <input {...campo("simam_cd_modelo_fipe")} maxLength={12} placeholder="Ex.: 005123-4" list="simam-fipe"
                    onChange={(e) => { atualizar("simam_cd_modelo_fipe", e.target.value); buscarFipe(e.target.value); }} />
                  <datalist id="simam-fipe">
                    {fipe.map((f) => <option key={f.codigo} value={f.codigo}>{f.descricao}</option>)}
                  </datalist>
                </Label>
                <Label texto="Propriedade">
                  <select {...campo("simam_propriedade")}>
                    <option value="PROPRIO">Próprio</option>
                    <option value="TERCEIRO">De terceiro</option>
                  </select>
                </Label>
                <Label texto="Medidor informado ao TCE">
                  <select {...campo("simam_tipo_medidor")}>
                    <option value="">Automático ({form.usa_horimetro ? "horímetro" : "hodômetro"})</option>
                    <option value="1">Hodômetro</option>
                    <option value="2">Horímetro</option>
                    <option value="3">Não usa hodômetro/horímetro</option>
                  </select>
                </Label>
                <label className="flex items-center gap-2 self-end pb-2 text-body-sm text-text-body">
                  <input type="checkbox" checked={form.simam_informar}
                    onChange={(e) => setForm((f) => ({ ...f, simam_informar: e.target.checked }))} />
                  Informar este veículo ao SIM-AM
                </label>
              </div>
            </Secao>

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

            </>)}
            {etapa === 4 && (<>
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
            {!veiculo && <Revisao form={form} combustiveis={combustiveis} unidades={unidades} rotuloUnidade={rotuloUnidade} irPara={irPara} />}
            </>)}
          </div>
        </form>

        {/* Rodapé fixo */}
        <div className="flex items-center justify-between gap-2 border-t border-[#EEF2F6] bg-[#F8FAFC] px-6 py-4 sm:rounded-b-2xl sm:px-8">
          {veiculo ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={fechar} disabled={salvando}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={() => enviar()} disabled={salvando}>
                {salvando ? "Salvando…" : "Salvar alterações"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => (etapa === 0 ? fechar() : irPara(etapa - 1))}
                disabled={salvando}
              >
                {etapa === 0 ? "Cancelar" : (<><ArrowLeft size={16} /> Voltar</>)}
              </button>
              <div className="flex gap-2">
                {etapa > 0 && etapa < ETAPAS.length - 1 && (
                  <button type="button" className="btn btn-ghost" onClick={() => enviar()} disabled={salvando}>
                    Salvar agora
                  </button>
                )}
                {etapa < ETAPAS.length - 1 ? (
                  <button type="button" className="btn btn-primary" onClick={avancar}>
                    Avançar <ArrowRight size={16} />
                  </button>
                ) : (
                  <button type="button" className="btn btn-primary" onClick={() => enviar()} disabled={salvando}>
                    {salvando ? "Salvando…" : "Cadastrar veículo"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Revisao({
  form,
  combustiveis,
  unidades,
  rotuloUnidade,
  irPara,
}: {
  form: Record<string, unknown>;
  combustiveis: Combustivel[];
  unidades: Unidade[];
  rotuloUnidade: string;
  irPara: (i: number) => void;
}) {
  const v = (k: string) => (form[k] ? String(form[k]) : "—");
  const nomeComb = (id: unknown) => combustiveis.find((c) => c.id === id)?.nome ?? "—";
  const blocos: [number, [string, string][]][] = [
    [0, [["Placa", normalizarPlaca(String(form.placa))], ["Código interno", v("codigo_interno")], ["RENAVAM", v("renavam")], ["Chassi", v("chassi")]]],
    [1, [
      ["Tipo", TIPOS_VEICULO_LISTA.find(([k]) => k === form.tipo)?.[1] ?? "—"],
      ["Marca / modelo", [form.marca, form.modelo, form.versao].filter(Boolean).join(" ") || "—"],
      ["Ano", [form.ano_fabricacao, form.ano_modelo].filter(Boolean).join("/") || "—"],
      ["Cor", v("cor")],
    ]],
    [2, [
      [form.usa_horimetro ? "Horímetro inicial" : "Km inicial", form.usa_horimetro ? `${v("horimetro_atual")} h` : `${Number(form.quilometragem_atual || 0).toLocaleString("pt-BR")} km`],
      ["Combustível", [nomeComb(form.combustivel_principal_id), form.combustivel_secundario_id ? nomeComb(form.combustivel_secundario_id) : ""].filter(Boolean).join(" / ")],
    ]],
    [3, [
      [rotuloUnidade, unidades.find((u) => u.id === form.unidade_id)?.nome ?? "—"],
      ["Situação", SITUACOES_LISTA.find(([k]) => k === form.situacao)?.[1].label ?? "—"],
    ]],
  ];
  return (
    <section className="mt-7">
      <h3 className="mb-3 text-label font-semibold text-text-title">Revisão</h3>
      <div className="divide-y divide-surface-border rounded-btn border border-surface-border">
        {blocos.map(([i, linhas]) => (
          <div key={i} className="flex items-start justify-between gap-4 p-3">
            <dl className="grid flex-1 grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
              {linhas.map(([rotulo, valor]) => (
                <div key={rotulo} className="flex gap-2 text-body-sm">
                  <dt className="text-text-subtle">{rotulo}:</dt>
                  <dd className="font-medium text-text-title">{valor}</dd>
                </div>
              ))}
            </dl>
            <button type="button" className="btn btn-ghost btn-sm text-[#1D4ED8]" onClick={() => irPara(i)}>
              Editar
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function AvisoDuplicado({ dup }: { dup?: { id: string; placa: string } }) {
  if (!dup) return null;
  return (
    <span className="mt-1 block text-meta font-normal text-[#B42318]" role="alert">
      Já cadastrado no veículo{" "}
      <Link href={`/veiculos/${dup.id}`} target="_blank" className="font-semibold underline">
        {dup.placa}
      </Link>
      .
    </span>
  );
}

function Secao({ titulo, children }: { titulo?: string; children: React.ReactNode }) {
  return (
    <section>
      {titulo && (
        <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-text-subtle">{titulo}</h4>
      )}
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
    <label className={`text-meta font-medium text-text-title ${classe ?? ""}`}>
      {texto}
      <span className="mt-1 block">{children}</span>
      {erro ? (
        <span className="mt-1 block text-meta font-normal text-[#B42318]">{erro}</span>
      ) : (
        dica && <span className="mt-1 block text-meta font-normal text-text-subtle">{dica}</span>
      )}
    </label>
  );
}
