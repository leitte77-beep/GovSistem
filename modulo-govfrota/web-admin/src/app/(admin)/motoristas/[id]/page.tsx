"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Car,
  CheckCircle2,
  ClipboardList,
  Copy,
  CreditCard,
  Droplets,
  Eye,
  EyeOff,
  ExternalLink,
  Fuel,
  KeyRound,
  Lock,
  LockOpen,
  Pencil,
  Receipt,
  RefreshCw,
  Save,
  ShieldCheck,
  Truck,
  UserCog,
  X,
} from "lucide-react";
import { api, AcessoAlterado, Abastecimento, AcessoInfo, Motorista, Ocorrencia } from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";
import { useAuth } from "@/lib/auth";
import { AvatarMotorista } from "@/components/motorista/AvatarMotorista";
import { MotoristaFormDrawer } from "@/components/motorista/MotoristaFormDrawer";
import {
  diasRestantesCnh,
  formatarCpf,
  mascararCpf,
  situacaoCnh,
  situacaoCnhInfo,
} from "@/lib/motoristas";
import { formatarMoeda } from "@/lib/veiculos";

type Aba = "resumo" | "abastecimentos" | "veiculos" | "ocorrencias" | "acesso" | "historico";

const GRAVIDADE_CLASSE: Record<string, string> = {
  BAIXA: "bg-gray-100 text-gray-600",
  MEDIA: "bg-[#D9E2FF] text-[#1D5BD6]",
  ALTA: "bg-[#FFDD9A] text-[#805600]",
  CRITICA: "bg-[#FFDAD6] text-[#BA1A1A]",
};

const URL_ACESSO = "frota.govsistem.com.br/motorista";

interface ResultadoCredencial {
  dados: AcessoAlterado;
  tipo: "criar" | "redefinir";
}

function validarPin(pin: string): string | null {
  if (!pin) return "Informe o PIN.";
  if (!/^\d{6,12}$/.test(pin)) return "O PIN deve conter de 6 a 12 dígitos numéricos.";
  return null;
}

function copiar(texto: string) {
  navigator.clipboard?.writeText(texto).then(() => toast.success("Copiado."));
}

export default function DetalheMotoristaPage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const podeGerir = hasPermission("driver.manage");
  const [motorista, setMotorista] = useState<Motorista | null>(null);
  const [acesso, setAcesso] = useState<AcessoInfo | null>(null);
  const [abastecimentos, setAbastecimentos] = useState<Abastecimento[]>([]);
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([]);
  const [historico, setHistorico] = useState<{ data: string; texto: string; tipo: string }[]>([]);
  const [aba, setAba] = useState<Aba>("resumo");
  const [editando, setEditando] = useState(false);

  // Modais de gerenciamento de acesso
  const [modalCriar, setModalCriar] = useState(false);
  const [modalEditar, setModalEditar] = useState(false);
  const [modalRedefinir, setModalRedefinir] = useState(false);
  const [resultado, setResultado] = useState<ResultadoCredencial | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [gerando, setGerando] = useState(false);

  // Formulários
  const [formLogin, setFormLogin] = useState("");
  const [formPin, setFormPin] = useState("");
  const [formConfirm, setFormConfirm] = useState("");
  const [formLoginNovo, setFormLoginNovo] = useState("");

  const recarregarAcesso = useCallback(
    async () => setAcesso(await api.getAcesso(id)),
    [id]
  );

  const carregar = useCallback(async () => {
    try {
      const m = await api.getMotorista(id);
      setMotorista(m);
      setAcesso(await api.getAcesso(id));
      const [abast, ocorr] = await Promise.all([
        api.listAbastecimentos({ motorista_id: id }).catch(() => ({ itens: [] as Abastecimento[], total: 0 })),
        api.listOcorrencias({ motorista_id: id }).catch(() => ({ itens: [] as Ocorrencia[], total: 0 })),
      ]);
      setAbastecimentos(abast.itens);
      setOcorrencias(ocorr.itens);

      const eventos: { data: string; texto: string; tipo: string }[] = [
        ...abast.itens.map((a) => ({
          data: a.data_abastecimento,
          texto: `Abastecimento registrado · ${Number(a.quantidade_litros).toLocaleString("pt-BR")} L${a.veiculo_placa ? ` · ${a.veiculo_placa}` : ""}`,
          tipo: "abastecimento",
        })),
        ...ocorr.itens.map((o) => ({
          data: o.data_ocorrencia + "T12:00",
          texto: `Ocorrência ${o.categoria} — ${o.descricao.slice(0, 60)}`,
          tipo: "ocorrencia",
        })),
      ];
      setHistorico(eventos.sort((x, y) => new Date(y.data).getTime() - new Date(x.data).getTime()));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    carregar();
    if (typeof window !== "undefined") {
      const q = new URLSearchParams(window.location.search);
      if (q.get("editar")) setEditando(true);
      if (q.get("acesso")) setAba("acesso");
    }
  }, [carregar]);

  function fecharModais() {
    setModalCriar(false);
    setModalEditar(false);
    setModalRedefinir(false);
    setFormPin("");
    setFormConfirm("");
  }

  // Criar acesso manual (login + PIN)
  async function salvarCriar() {
    if (!formLogin.trim()) return toast.error("Informe o usuário.");
    const err = validarPin(formPin);
    if (err) return toast.error(err);
    if (formPin !== formConfirm) return toast.error("Os PINs informados não coincidem.");
    setEnviando(true);
    try {
      const dados = await api.criarAcesso(id, { login: formLogin, pin: formPin, confirm_pin: formConfirm });
      fecharModais();
      await recarregarAcesso();
      setResultado({ dados, tipo: "criar" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  // Editar usuário (e opcionalmente redefinir PIN juntos)
  async function salvarEditar() {
    if (!formLoginNovo.trim()) return toast.error("Informe o novo usuário.");
    const data: { login: string; pin?: string; confirm_pin?: string } = { login: formLoginNovo };
    let pinAlterado = false;
    if (formPin) {
      const err = validarPin(formPin);
      if (err) return toast.error(err);
      if (formPin !== formConfirm) return toast.error("Os PINs informados não coincidem.");
      data.pin = formPin;
      data.confirm_pin = formConfirm;
      pinAlterado = true;
    }
    setEnviando(true);
    try {
      const dados = await api.atualizarCredencial(id, data);
      fecharModais();
      await recarregarAcesso();
      if (pinAlterado) setResultado({ dados, tipo: "redefinir" });
      else toast.success("Usuário atualizado.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  // Redefinir PIN manual
  async function salvarRedefinir() {
    const err = validarPin(formPin);
    if (err) return toast.error(err);
    if (formPin !== formConfirm) return toast.error("Os PINs informados não coincidem.");
    setEnviando(true);
    try {
      const dados = await api.redefinirPin(id, { pin: formPin, confirm_pin: formConfirm });
      fecharModais();
      await recarregarAcesso();
      setResultado({ dados, tipo: "redefinir" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  // Gerar PIN automaticamente (criptograficamente seguro no backend)
  async function gerarPinAuto() {
    if (!motorista) return;
    setGerando(true);
    try {
      const dados = await api.gerarPinAcesso(motorista.id);
      fecharModais();
      await recarregarAcesso();
      setResultado({ dados, tipo: acesso?.login ? "redefinir" : "criar" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGerando(false);
    }
  }

  async function alternarBloqueio() {
    if (!acesso?.login) return;
    if (!confirm(acesso.bloqueado ? "Desbloquear o acesso deste motorista?" : "Bloquear o acesso deste motorista?")) return;
    try {
      if (acesso.bloqueado) await api.desbloquearAcesso(id);
      else await api.bloquearAcesso(id);
      await recarregarAcesso();
      toast.success(acesso.bloqueado ? "Acesso desbloqueado." : "Acesso bloqueado.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!motorista) return <p className="animate-pulse text-[#737781]">Carregando…</p>;

  const sitCnh = situacaoCnh(motorista.cnh_validade);
  const sitCnhInfo = situacaoCnhInfo(sitCnh);
  const dias = diasRestantesCnh(motorista.cnh_validade);
  const litrosTotal = abastecimentos
    .filter((a) => a.status === "CONFIRMADO")
    .reduce((s, a) => s + Number(a.quantidade_litros), 0);
  const veiculosUsados = new Map<string, { placa: string | null; ultimo: string }>();
  abastecimentos.forEach((a) => {
    const existente = veiculosUsados.get(a.veiculo_id);
    if (!existente || new Date(a.data_abastecimento) > new Date(existente.ultimo)) {
      veiculosUsados.set(a.veiculo_id, { placa: a.veiculo_placa ?? null, ultimo: a.data_abastecimento });
    }
  });
  const ocorrenciasAbertas = ocorrencias.filter((o) => o.status === "ABERTA" || o.status === "EM_ANALISE").length;
  const identificador = motorista.id.slice(0, 8).toUpperCase();
  const veiculoHabitual =
    Array.from(veiculosUsados.entries()).sort((x, y) => new Date(y[1].ultimo).getTime() - new Date(x[1].ultimo).getTime())[0] ?? null;
  const ultimoAbasto =
    abastecimentos
      .filter((a) => a.status === "CONFIRMADO")
      .sort((x, y) => new Date(y.data_abastecimento).getTime() - new Date(x.data_abastecimento).getTime())[0] ?? null;
  const litrosConf = abastecimentos.filter((a) => a.status === "CONFIRMADO");

  const abas: { chave: Aba; label: string }[] = [
    { chave: "resumo", label: "Resumo" },
    { chave: "abastecimentos", label: `Abastecimentos (${abastecimentos.length})` },
    { chave: "veiculos", label: `Veículos (${veiculosUsados.size})` },
    { chave: "ocorrencias", label: `Ocorrências (${ocorrencias.length})` },
    { chave: "acesso", label: "Acesso" },
    { chave: "historico", label: "Histórico" },
  ];

  return (
    <RequirePermission perms={["driver.manage", "vehicle.view"]}>
      <MotoristaFormDrawer
        aberto={editando}
        onClose={() => setEditando(false)}
        motorista={motorista}
        onSalvo={carregar}
      />

      {/* Modal Criar acesso */}
      {modalCriar && (
        <Modal titulo="Criar acesso" onClose={() => setModalCriar(false)} icon={<ShieldCheck size={20} className="text-[#1D5BD6]" />}>
          <div className="space-y-3">
            <Campo
              label="Usuário"
              value={formLogin}
              onChange={setFormLogin}
              placeholder="ex.: alisson.klein"
              autoComplete="off"
            />
            <PinField label="PIN" value={formPin} onChange={setFormPin} placeholder="••••••" />
            <PinField label="Confirmar PIN" value={formConfirm} onChange={setFormConfirm} placeholder="••••••" />
            <button type="button" className="btn btn-secondary btn-sm w-full" onClick={gerarPinAuto} disabled={gerando}>
              <RefreshCw size={14} /> {gerando ? "Gerando…" : "Gerar PIN automaticamente"}
            </button>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button className="btn btn-secondary btn-sm" onClick={() => setModalCriar(false)}>Cancelar</button>
            <button className="btn btn-primary btn-sm" onClick={salvarCriar} disabled={enviando}>
              <Save size={14} /> {enviando ? "Salvando…" : "Criar acesso"}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal Editar usuário */}
      {modalEditar && (
        <Modal titulo="Editar usuário" onClose={() => setModalEditar(false)} icon={<UserCog size={20} className="text-[#1D5BD6]" />}>
          <div className="space-y-3">
            <div className="rounded-lg bg-[#F4F6FA] px-3 py-2">
              <div className="text-meta text-[#737781]">Usuário atual</div>
              <div className="font-medium text-[#181C22]">{acesso?.login ?? "—"}</div>
            </div>
            <Campo label="Novo usuário" value={formLoginNovo} onChange={setFormLoginNovo} placeholder="ex.: alisson.klein" autoComplete="off" />
            <div className="rounded-lg border border-dashed border-[#C3C6D1] p-3">
              <div className="mb-2 flex items-center gap-2 text-meta font-medium text-[#737781]">
                <KeyRound size={14} /> Segurança
              </div>
              <div className="space-y-3">
                <PinField label="Novo PIN (opcional)" value={formPin} onChange={setFormPin} placeholder="••••••" />
                <PinField label="Confirmar novo PIN" value={formConfirm} onChange={setFormConfirm} placeholder="••••••" />
              </div>
              <p className="mt-2 text-meta text-[#737781]">Deixe o PIN vazio para manter o atual.</p>
            </div>
            <button type="button" className="btn btn-secondary btn-sm w-full" onClick={gerarPinAuto} disabled={gerando}>
              <RefreshCw size={14} /> {gerando ? "Gerando…" : "Gerar PIN"}
            </button>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button className="btn btn-secondary btn-sm" onClick={() => setModalEditar(false)}>Cancelar</button>
            <button className="btn btn-primary btn-sm" onClick={salvarEditar} disabled={enviando}>
              <Save size={14} /> {enviando ? "Salvando…" : "Salvar alterações"}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal Redefinir PIN */}
      {modalRedefinir && (
        <Modal titulo="Redefinir PIN" onClose={() => setModalRedefinir(false)} icon={<KeyRound size={20} className="text-[#1D5BD6]" />}>
          <p className="mb-3 text-body-sm text-[#737781]">
            O PIN atual não é necessário. Defina um novo PIN para o motorista.
          </p>
          <div className="space-y-3">
            <PinField label="Novo PIN" value={formPin} onChange={setFormPin} placeholder="••••••" />
            <PinField label="Confirmar novo PIN" value={formConfirm} onChange={setFormConfirm} placeholder="••••••" />
            <button type="button" className="btn btn-secondary btn-sm w-full" onClick={gerarPinAuto} disabled={gerando}>
              <RefreshCw size={14} /> {gerando ? "Gerando…" : "Gerar PIN automaticamente"}
            </button>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button className="btn btn-secondary btn-sm" onClick={() => setModalRedefinir(false)}>Cancelar</button>
            <button className="btn btn-primary btn-sm" onClick={salvarRedefinir} disabled={enviando}>
              <KeyRound size={14} /> {enviando ? "Salvando…" : "Redefinir PIN"}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal de resultado (PIN exibido uma única vez) */}
      {resultado && (
        <Modal titulo={resultado.tipo === "criar" ? "Acesso criado com sucesso" : "PIN redefinido com sucesso"} onClose={() => setResultado(null)} icon={<ShieldCheck size={20} className="text-[#1D5BD6]" />}>
          <div className="space-y-3 text-body-sm text-[#424750]">
            <div>
              <div className="text-meta text-[#737781]">Motorista</div>
              <div className="font-medium text-[#181C22]">{motorista.nome}</div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-meta text-[#737781]">Usuário</div>
                <div className="font-medium text-[#181C22]">{resultado.dados.login}</div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => copiar(resultado.dados.login ?? "")}>Copiar usuário</button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-meta text-[#737781]">Novo PIN</div>
                <div className="font-mono text-2xl font-bold tracking-widest text-[#1D5BD6]">{resultado.dados.pin_provisorio}</div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => copiar(resultado.dados.pin_provisorio ?? "")}>Copiar PIN</button>
            </div>
            <div>
              <div className="text-meta text-[#737781]">Acesso</div>
              <div className="font-medium text-[#181C22]">{URL_ACESSO}</div>
            </div>
            <button
              className="btn btn-primary btn-sm w-full"
              onClick={() =>
                copiar(
                  `Usuário: ${resultado.dados.login}\nPIN: ${resultado.dados.pin_provisorio}\nAcesso: ${URL_ACESSO}`
                )
              }
            >
              <Copy size={14} /> Copiar dados de acesso
            </button>
            <p className="rounded-lg bg-[#FFDD9A] px-3 py-2 text-meta font-medium text-[#805600]">
              Guarde estes dados agora. Por segurança, o PIN não poderá ser visualizado novamente.
            </p>
          </div>
          <div className="mt-4 flex justify-end">
            <button className="btn btn-primary btn-sm" onClick={() => setResultado(null)}>Entendi</button>
          </div>
        </Modal>
      )}

      <div className="space-y-5">
        {/* Navegação superior */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/motoristas" className="group inline-flex items-center gap-1.5 text-body-sm font-medium text-text-subtle transition-colors hover:text-primary">
            <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-0.5" /> Voltar para Motoristas
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-[#F3F4F6] px-2.5 py-1 font-mono text-meta font-semibold text-text-body ring-1 ring-inset ring-outline-variant/40">#{identificador}</span>
            <span className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-meta font-semibold ${motorista.ativo ? "bg-[#E7F8EC] text-[#106D34]" : "bg-[#F3F4F6] text-text-subtle"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${motorista.ativo ? "bg-emerald-500" : "bg-gray-400"}`} />
              {motorista.ativo ? "Ativo" : "Inativo"}
            </span>
          </div>
        </div>

        {/* Hero do condutor */}
        <section className="relative overflow-hidden rounded-2xl border border-outline-variant/50 bg-surface-card p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
            <div className="flex items-start gap-5 sm:items-center">
              <div className="relative shrink-0">
                <AvatarMotorista src={motorista.foto_url} nome={motorista.nome} className="h-20 w-20 text-2xl ring-4 ring-[#EFF6FF]" />
                <span className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-white ${motorista.ativo ? "bg-emerald-500" : "bg-gray-400"}`} />
              </div>
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-2xl font-bold tracking-tight text-text-title sm:text-3xl">{motorista.nome}</h1>
                  <span className="rounded-md bg-[#F3F4F6] px-2.5 py-0.5 text-meta font-medium text-text-body ring-1 ring-inset ring-outline-variant/50">Condutor</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-text-subtle">
                  <span>CPF <strong className="font-mono font-semibold text-text-body">{podeGerir ? formatarCpf(motorista.cpf) : mascararCpf(motorista.cpf)}</strong></span>
                  {motorista.matricula && (
                    <>
                      <span className="text-outline-variant">•</span>
                      <span>Matrícula <strong className="font-mono font-semibold text-text-body">{motorista.matricula}</strong></span>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {motorista.cnh_categoria && (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-outline-variant/50 bg-[#F9FAFB] px-2.5 py-1 text-meta text-text-body">
                      <CreditCard size={13} className="text-primary" /> CNH Cat. <strong className="text-text-title">{motorista.cnh_categoria}</strong>
                    </span>
                  )}
                  {motorista.cnh_validade && (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-outline-variant/50 bg-[#F9FAFB] px-2.5 py-1 text-meta text-text-body">
                      <Calendar size={13} className="text-text-subtle" /> Válida até <strong className="text-text-title">{new Date(motorista.cnh_validade + "T12:00").toLocaleDateString("pt-BR")}</strong>
                    </span>
                  )}
                  {motorista.cnh_validade && <BadgeCnhBadge sit={sitCnhInfo.rotulo} classe={sitCnhInfo.classe} />}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              {podeGerir && (
                <>
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditando(true)}>
                    <Pencil size={14} /> Editar
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setAba("acesso")}>
                    <KeyRound size={14} /> Gerenciar acesso
                  </button>
                </>
              )}
            </div>
          </div>
        </section>

        {sitCnh === "VENCIDA" && (
          <div className="flex items-start gap-2 rounded-2xl border border-[#F5C451] bg-[#FFF8E6] p-4 text-body-sm text-[#5C4200]">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>CNH vencida. O acesso operacional pode estar bloqueado pela política da organização.</span>
          </div>
        )}

        {/* Abas */}
        <nav className="flex gap-4 overflow-x-auto border-b border-outline-variant/50 text-body-sm" aria-label="Abas da ficha do condutor">
          {abas.map((a) => {
            const [rotulo, contagem] = a.label.includes(" (")
              ? [a.label.slice(0, a.label.indexOf(" (")), a.label.slice(a.label.indexOf(" (") + 2, -1)]
              : [a.label, null];
            const ativa = aba === a.chave;
            return (
              <button
                key={a.chave}
                onClick={() => setAba(a.chave)}
                className={`-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 pb-3 font-medium transition-colors ${
                  ativa ? "border-primary font-bold text-primary" : "border-transparent text-text-subtle hover:text-text-title"
                }`}
              >
                {rotulo}
                {contagem !== null && (
                  <span className={`rounded-pill px-2 py-0.5 text-[11px] font-semibold ${ativa ? "bg-[#EFF6FF] text-primary" : "bg-[#F3F4F6] text-text-subtle"}`}>
                    {contagem}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Resumo */}
        {aba === "resumo" && (
          <>
            {/* Indicadores */}
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi
                titulo="Total de abastecimentos"
                valor={litrosConf.length}
                sub="registro(s) homologado(s)"
                rodape={ultimoAbasto ? `Último em ${new Date(ultimoAbasto.data_abastecimento).toLocaleDateString("pt-BR")}` : "Sem registros"}
                icone={<Fuel size={16} />}
                tom="blue"
              />
              <Kpi
                titulo="Litros abastecidos"
                valor={`${litrosTotal.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L`}
                sub="Combustível acumulado"
                rodape={ultimoAbasto?.combustivel_nome ?? "—"}
                icone={<Droplets size={16} />}
                tom="indigo"
              />
              <Kpi
                titulo="Veículos utilizados"
                valor={veiculosUsados.size}
                sub="veículo(s) vinculado(s)"
                rodape={veiculoHabitual ? `Habitual: ${veiculoHabitual[1].placa ?? "—"}` : "—"}
                icone={<Truck size={16} />}
                tom="amber"
              />
              <Kpi
                titulo="Ocorrências abertas"
                valor={ocorrenciasAbertas}
                sub={ocorrenciasAbertas ? "Requer acompanhamento" : "Sem pendências"}
                rodape="Conformidade disciplinar"
                icone={<CheckCircle2 size={16} />}
                tom={ocorrenciasAbertas ? "amber" : "emerald"}
              />
            </section>

            {/* Informações cadastrais */}
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-body font-bold text-text-title">
                <ClipboardList size={16} className="text-primary" /> Informações Cadastrais e Documentais
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Info titulo="Telefone" valor={motorista.telefone || "—"} />
                <Info titulo="E-mail" valor={motorista.email || "—"} />
                <Info titulo="Situação CNH" valor={sitCnhInfo.rotulo} />
                <Info titulo="Dias para vencimento CNH" valor={dias !== null ? (dias < 0 ? `${Math.abs(dias)} dia(s) vencida` : `${dias} dia(s)`) : "—"} />
                <Info titulo="Matrícula" valor={motorista.matricula || "—"} />
                <Info titulo="Categoria CNH" valor={motorista.cnh_categoria || "—"} />
                {motorista.observacoes && (
                  <div className="md:col-span-2 lg:col-span-3">
                    <Info titulo="Observações" valor={motorista.observacoes} />
                  </div>
                )}
              </div>
            </section>

            {/* Contexto operacional */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <section className="flex flex-col justify-between rounded-2xl border border-outline-variant/50 bg-surface-card p-5 shadow-sm">
                <div>
                  <div className="flex items-center justify-between border-b border-outline-variant/30 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EFF6FF] text-primary"><Truck size={15} /></span>
                      <h3 className="text-body-sm font-bold text-text-title">Veículo Habitual</h3>
                    </div>
                  </div>
                  {veiculoHabitual ? (
                    <div className="mt-4 flex items-center gap-4">
                      <span className="flex h-14 w-14 items-center justify-center rounded-xl border border-outline-variant/50 bg-surface-bg text-text-subtle"><Car size={28} /></span>
                      <div className="min-w-0">
                        <span className="mercosul-plate inline-block rounded px-2 py-0.5 font-mono text-[12px] font-extrabold tracking-wider text-[#0F172A]">{veiculoHabitual[1].placa ?? "—"}</span>
                        <p className="mt-1 text-meta text-text-subtle">Último uso: {new Date(veiculoHabitual[1].ultimo).toLocaleDateString("pt-BR")}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="py-6 text-center text-body-sm text-text-subtle">Nenhum veículo utilizado.</p>
                  )}
                </div>
                {veiculoHabitual && (
                  <div className="mt-4 border-t border-outline-variant/30 pt-3 text-right">
                    <Link href={`/veiculos/${veiculoHabitual[0]}`} className="inline-flex items-center gap-1 text-meta font-semibold text-primary hover:underline">
                      Ver detalhes do veículo <ExternalLink size={13} />
                    </Link>
                  </div>
                )}
              </section>

              <section className="flex flex-col justify-between rounded-2xl border border-outline-variant/50 bg-surface-card p-5 shadow-sm">
                <div>
                  <div className="flex items-center justify-between border-b border-outline-variant/30 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FFF4D6] text-[#805600]"><Receipt size={15} /></span>
                      <h3 className="text-body-sm font-bold text-text-title">Último Abastecimento</h3>
                    </div>
                  </div>
                  {ultimoAbasto ? (
                    <div className="mt-4 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-body-sm font-bold text-text-title">{ultimoAbasto.fornecedor_nome ?? ultimoAbasto.tanque_nome ?? "—"}</h4>
                          <p className="text-meta text-text-subtle">{new Date(ultimoAbasto.data_abastecimento).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</p>
                        </div>
                        <span className="font-mono text-body font-extrabold text-text-title">{formatarMoeda(ultimoAbasto.custo_total)}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 rounded-lg border border-outline-variant/30 bg-[#F9FAFB] p-2.5 text-meta">
                        <div>
                          <span className="block text-[10px] font-bold uppercase text-text-subtle">Volume</span>
                          <span className="font-mono font-bold text-text-body">{Number(ultimoAbasto.quantidade_litros).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} L</span>
                        </div>
                        <div>
                          <span className="block text-[10px] font-bold uppercase text-text-subtle">Produto</span>
                          <span className="font-semibold text-text-body">{ultimoAbasto.combustivel_nome ?? "—"}</span>
                        </div>
                        <div>
                          <span className="block text-[10px] font-bold uppercase text-text-subtle">Odômetro</span>
                          <span className="font-mono font-bold text-text-body">{ultimoAbasto.quilometragem.toLocaleString("pt-BR")} km</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="py-6 text-center text-body-sm text-text-subtle">Nenhum abastecimento.</p>
                  )}
                </div>
                {ultimoAbasto && (
                  <div className="mt-4 flex items-center justify-between border-t border-outline-variant/30 pt-3">
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#106D34]"><CheckCircle2 size={13} /> Registro homologado</span>
                    <Link href={`/abastecimentos/${ultimoAbasto.id}`} className="inline-flex items-center gap-1 text-meta font-semibold text-primary hover:underline">
                      Ver comprovante <ExternalLink size={13} />
                    </Link>
                  </div>
                )}
              </section>
            </div>

            {/* Banner de conformidade */}
            <div className="flex flex-col items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-[#0E1B2E] to-[#1E3A8A] p-5 text-white shadow-md sm:flex-row">
              <div className="flex items-center gap-4 text-center sm:text-left">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10">
                  <ShieldCheck size={24} className="text-[#86EFAC]" />
                </div>
                <div>
                  <h3 className="text-body-sm font-bold">Conformidade &amp; Prestação de Contas</h3>
                  <p className="mt-0.5 max-w-2xl text-meta leading-relaxed text-[#BFDBFE]">
                    Os dados de habilitação e os registros deste condutor são auditados e rastreáveis para conferência e prestação de contas.
                  </p>
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

        {/* Abastecimentos */}
        {aba === "abastecimentos" && (
          <Tabela>
            <thead>
              <tr className="border-b border-[#E4E7EC] bg-[#EFF4FF] text-left text-meta text-[#737781]">
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Veículo</th>
                <th className="px-4 py-3">Combustível</th>
                <th className="px-4 py-3">Litros</th>
                <th className="px-4 py-3">KM</th>
                <th className="px-4 py-3">Tanque</th>
              </tr>
            </thead>
            <tbody>
              {abastecimentos.length === 0 && <Vazio colSpan={6} texto="Nenhum abastecimento." />}
              {abastecimentos.map((a) => (
                <tr key={a.id} className="border-b border-[#E4E7EC] last:border-0">
                  <td className="px-4 py-3 tabular-nums">{new Date(a.data_abastecimento).toLocaleDateString("pt-BR")}</td>
                  <td className="px-4 py-3">
                    <Link href={`/veiculos/${a.veiculo_id}`} className="font-medium text-[#1D5BD6] hover:underline">{a.veiculo_placa ?? "—"}</Link>
                  </td>
                  <td className="px-4 py-3">{a.combustivel_nome ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{Number(a.quantidade_litros).toLocaleString("pt-BR")} L</td>
                  <td className="px-4 py-3 tabular-nums">{a.quilometragem.toLocaleString("pt-BR")} km</td>
                  <td className="px-4 py-3">{a.tanque_nome ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}

        {/* Veículos utilizados */}
        {aba === "veiculos" && (
          <div className="rounded-card border border-[#C3C6D1]/20 bg-white shadow-card">
            <ul className="divide-y divide-[#E4E7EC]">
              {veiculosUsados.size === 0 && <li className="px-4 py-8 text-center text-[#737781]">Nenhum veículo utilizado.</li>}
              {Array.from(veiculosUsados.entries()).map(([veiculoId, info]) => (
                <li key={veiculoId} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="font-mono font-bold text-[#1D5BD6]">{info.placa ?? "—"}</div>
                    <div className="text-meta text-[#737781]">Veículo {veiculoId.slice(0, 8)}…</div>
                  </div>
                  <span className="text-meta text-[#737781]">Último uso: {new Date(info.ultimo).toLocaleDateString("pt-BR")}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Ocorrências */}
        {aba === "ocorrencias" && (
          <div className="rounded-card border border-[#C3C6D1]/20 bg-white shadow-card">
            <ul className="divide-y divide-[#E4E7EC]">
              {ocorrencias.length === 0 && <li className="px-4 py-8 text-center text-[#737781]">Sem ocorrências.</li>}
              {ocorrencias.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div>
                    <span className="text-body-sm font-medium">{o.categoria}</span>
                    <span className={`ml-2 rounded-pill px-2 py-0.5 text-meta ${GRAVIDADE_CLASSE[o.gravidade] ?? ""}`}>{o.gravidade}</span>
                    <span className="ml-2 text-meta text-[#737781]">{o.status.replace("_", " ")}</span>
                    <p className="text-meta text-[#737781]">{o.descricao}</p>
                  </div>
                  <span className="text-meta text-[#737781]">{new Date(o.data_ocorrencia + "T12:00").toLocaleDateString("pt-BR")}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Acesso */}
        {aba === "acesso" && (
          <div className="rounded-card border border-[#C3C6D1]/20 bg-white p-5 shadow-card">
            <h3 className="text-label font-semibold text-[#181C22]">Acesso ao GovFrota Motorista</h3>

            {!motorista.ativo && (
              <div className="mt-3 rounded-lg bg-[#FFDAD6] px-3 py-2 text-body-sm font-medium text-[#BA1A1A]">
                Motorista inativo — não poderá autenticar no GovFrota Motorista, mesmo com acesso ativo.
              </div>
            )}

            {!acesso?.login ? (
              <div className="mt-5 rounded-lg border border-dashed border-[#C3C6D1] p-6 text-center">
                <ShieldCheck size={32} className="mx-auto text-[#737781]" />
                <h4 className="mt-2 text-h3 text-[#181C22]">Acesso não configurado</h4>
                <p className="mx-auto mt-1 max-w-md text-body-sm text-[#737781]">
                  Crie um usuário e PIN para permitir que este motorista acesse o GovFrota Motorista.
                </p>
                {podeGerir && (
                  <button className="btn btn-primary btn-sm mt-4" onClick={() => setModalCriar(true)}>
                    <KeyRound size={14} /> Criar acesso
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-meta font-medium ${acesso.bloqueado ? "bg-[#FFDAD6] text-[#BA1A1A]" : "bg-[#9DF6B3] text-[#106D34]"}`}>
                      {acesso.bloqueado ? <Lock size={13} /> : <ShieldCheck size={13} />}
                      {acesso.bloqueado ? "Bloqueado" : "Ativo"}
                    </span>
                  </div>
                  <Info titulo="Usuário" valor={acesso.login} />
                  <Info titulo="PIN" valor="Configurado" />
                  <Info titulo="Último acesso" valor={acesso.ultimo_acesso ? new Date(acesso.ultimo_acesso).toLocaleString("pt-BR") : "Nunca acessou"} />
                  <Info titulo="Endereço" valor={URL_ACESSO} />
                </div>
                {podeGerir && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    <button className="btn btn-secondary btn-sm" onClick={() => { setFormLoginNovo(""); setFormPin(""); setFormConfirm(""); setModalEditar(true); }}>
                      <UserCog size={14} /> Editar usuário
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setFormPin(""); setFormConfirm(""); setModalRedefinir(true); }}>
                      <KeyRound size={14} /> Redefinir PIN
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={alternarBloqueio}>
                      {acesso.bloqueado ? <LockOpen size={14} /> : <Lock size={14} />}
                      {acesso.bloqueado ? "Desbloquear acesso" : "Bloquear acesso"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Histórico */}
        {aba === "historico" && (
          <div className="rounded-card border border-[#C3C6D1]/20 bg-white shadow-card">
            <ul className="divide-y divide-[#E4E7EC]">
              {historico.length === 0 && <li className="px-4 py-8 text-center text-[#737781]">Nenhum evento registrado.</li>}
              {historico.map((h, i) => (
                <li key={i} className="flex items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <span className={`rounded-pill px-2 py-0.5 text-meta ${h.tipo === "abastecimento" ? "bg-[#D9E2FF] text-[#1D5BD6]" : "bg-[#FFDD9A] text-[#805600]"}`}>{h.tipo}</span>{" "}
                    <span className="text-body-sm text-[#424750]">{h.texto}</span>
                  </div>
                  <span className="shrink-0 text-meta text-[#737781]">{new Date(h.data).toLocaleDateString("pt-BR")}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </RequirePermission>
  );
}

const TONS_KPI: Record<string, string> = {
  blue: "bg-[#EFF6FF] text-primary",
  emerald: "bg-[#E7F8EC] text-[#106D34]",
  amber: "bg-[#FFF4D6] text-[#805600]",
  indigo: "bg-[#EEF2FF] text-[#4338CA]",
};

function Kpi({ titulo, valor, sub, rodape, icone, tom }: { titulo: string; valor: React.ReactNode; sub: React.ReactNode; rodape: React.ReactNode; icone: React.ReactNode; tom: keyof typeof TONS_KPI }) {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-outline-variant/50 bg-surface-card p-5 shadow-sm transition-colors hover:border-primary/30">
      <div className="flex items-center justify-between">
        <span className="text-meta font-semibold uppercase tracking-wider text-text-subtle">{titulo}</span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${TONS_KPI[tom]}`}>{icone}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-3xl font-extrabold tracking-tight text-text-title">{valor}</span>
        <span className="text-meta font-medium text-text-subtle">{sub}</span>
      </div>
      <p className="mt-2 text-meta text-text-subtle">{rodape}</p>
    </div>
  );
}

function BadgeCnhBadge({ sit, classe }: { sit: string; classe: string }) {
  return <span className={`rounded-pill px-2 py-0.5 text-meta font-medium ${classe}`}>{sit}</span>;
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
      <td colSpan={colSpan} className="px-4 py-8 text-center text-[#737781]">{texto}</td>
    </tr>
  );
}

function Info({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-outline-variant/50 bg-surface-card p-4 shadow-sm transition-colors hover:border-outline-variant">
      <span className="text-meta font-medium uppercase tracking-wider text-text-subtle">{titulo}</span>
      <div className="mt-1 break-words text-body font-bold text-text-title">{valor}</div>
    </div>
  );
}

function Modal({ titulo, onClose, icon, children }: { titulo: string; onClose: () => void; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-card bg-white p-5 shadow-elevated">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <h3 className="text-h3 text-[#181C22]">{titulo}</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-[#737781] hover:bg-[#EFF4FF]" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Campo({ label, value, onChange, placeholder, autoComplete }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; autoComplete?: string }) {
  return (
    <label className="block">
      <span className="text-meta text-[#737781]">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="mt-1 w-full rounded-lg border border-[#C3C6D1] bg-white px-3 py-2 outline-none focus:border-[#1D5BD6]"
      />
    </label>
  );
}

function PinField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [visivel, setVisivel] = useState(false);
  return (
    <label className="block">
      <span className="text-meta text-[#737781]">{label}</span>
      <div className="mt-1 flex items-center gap-2 rounded-lg border border-[#C3C6D1] bg-white px-3 focus-within:border-[#1D5BD6]">
        <input
          type={visivel ? "text" : "password"}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={12}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
          placeholder={placeholder}
          className="w-full py-2 text-lg font-mono tracking-widest outline-none"
        />
        <button
          type="button"
          onClick={() => setVisivel((v) => !v)}
          className="shrink-0 text-[#737781] hover:text-[#1D5BD6]"
          aria-label={visivel ? "Ocultar PIN" : "Mostrar PIN"}
        >
          {visivel ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </label>
  );
}
