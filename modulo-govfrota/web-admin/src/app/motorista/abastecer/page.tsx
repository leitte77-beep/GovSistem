"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Camera, Check, ChevronLeft, ChevronRight, CloudOff, Droplets, Fuel, Gauge, Loader2, MapPin, RefreshCw, Search, ShieldCheck, WifiOff, X } from "lucide-react";
import { AuthError, driverApi, LocaisAbastecimento, VeiculoApp } from "@/lib/api";
import {
  AbastecimentoPendente,
  ehFalhaDeRede,
  enviarAbastecimento,
  guardarPendente,
  lerCache,
  salvarCache,
  sincronizarPendentes,
} from "@/lib/filaOffline";
import { FotoMotorista } from "@/components/motorista/FotoMotorista";
import { useLocalizacao } from "@/lib/localizacao";

interface ConfigMotorista {
  foto_bomba_obrigatoria: boolean;
  foto_km_obrigatoria: boolean;
  exigir_tanque_cheio?: boolean;
}

/** Onde o abastecimento foi feito: tanque próprio ou posto credenciado. */
interface Local {
  tipo: "TANQUE" | "POSTO";
  id: string;
  nome: string;
  detalhe?: string | null;
}

function novoIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** "1.234,5" e "40,5" (vírgula decimal) ou "40.5" (teclado com ponto). */
function numero(v: string): number {
  if (v.includes(",")) return Number(v.replace(/\./g, "").replace(",", "."));
  return Number(v);
}

export default function AbastecerPage() {
  const router = useRouter();
  const [passo, setPasso] = useState<1 | 2 | 3>(1);
  const localizacao = useLocalizacao();
  const [veiculos, setVeiculos] = useState<VeiculoApp[]>([]);
  const [locais, setLocais] = useState<LocaisAbastecimento>({ tanques: [], postos: [] });
  const [config, setConfig] = useState<ConfigMotorista>({ foto_bomba_obrigatoria: false, foto_km_obrigatoria: false });
  const [dadosDoCache, setDadosDoCache] = useState(false);
  const [semDados, setSemDados] = useState(false);

  const [veiculoId, setVeiculoId] = useState("");
  const [buscaPlaca, setBuscaPlaca] = useState("");
  const [combustivelId, setCombustivelId] = useState("");
  const [localChave, setLocalChave] = useState("");
  const [litros, setLitros] = useState("");
  const [medicao, setMedicao] = useState("");
  const [completouTanque, setCompletouTanque] = useState<boolean | null>(null);
  // Foto: URL já enviada ao servidor OU arquivo guardado para enviar depois.
  const [fotoBomba, setFotoBomba] = useState<{ url: string | null; arquivo: File | null; preview: string } | null>(null);
  const [fotoPainel, setFotoPainel] = useState<{ url: string | null; arquivo: File | null; preview: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState<{ veiculo: VeiculoApp; guardado: boolean } | null>(null);
  const [online, setOnline] = useState(true);
  const [idempotencyKey, setIdempotencyKey] = useState("");

  const veiculo = veiculos.find((v) => v.id === veiculoId);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      sincronizarPendentes().then(({ enviados }) => {
        if (enviados) toast.success(`${enviados} abastecimento(s) guardado(s) enviado(s).`);
      });
    };
    const onOffline = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Carrega veículos/locais; sem internet, usa a última cópia guardada no celular.
  useEffect(() => {
    let cancelado = false;
    Promise.all([driverApi.me(), driverApi.veiculos(), driverApi.locais()])
      .then(([me, vs, ls]) => {
        if (cancelado) return;
        const cfg = {
          foto_bomba_obrigatoria: me.foto_bomba_obrigatoria,
          foto_km_obrigatoria: me.foto_km_obrigatoria,
          exigir_tanque_cheio: me.exigir_tanque_cheio,
        };
        setVeiculos(vs);
        setLocais(ls);
        setConfig(cfg);
        salvarCache("veiculos", vs);
        salvarCache("locais", ls);
        salvarCache("config", cfg);
        sincronizarPendentes().catch(() => {});
      })
      .catch((e) => {
        if (cancelado) return;
        if (e instanceof AuthError) {
          router.replace("/motorista/login?expirado=1");
          return;
        }
        const vs = lerCache<VeiculoApp[]>("veiculos");
        const ls = lerCache<LocaisAbastecimento>("locais");
        const cfg = lerCache<ConfigMotorista>("config");
        if (vs && ls) {
          setVeiculos(vs);
          setLocais(ls);
          if (cfg) setConfig(cfg);
          setDadosDoCache(true);
        } else {
          setSemDados(true);
        }
      });
    return () => {
      cancelado = true;
    };
  }, [router]);

  // Produtos que o veículo aceita (principal, flex e reservatórios auxiliares),
  // ex.: Diesel S10 e ARLA 32.
  const combustiveisVeiculo = (veiculo?.combustiveis ?? []).map((p) => ({
    id: p.combustivel_id,
    nome: p.nome,
    capacidade: p.capacidade,
  }));
  const combustivelEfetivo =
    veiculo && combustiveisVeiculo.length === 1 ? combustiveisVeiculo[0].id : combustivelId;
  const produtoSelecionado = combustiveisVeiculo.find((c) => c.id === combustivelEfetivo);

  // Opções de local: tanques próprios do combustível + postos credenciados.
  const opcoesLocal: Local[] = combustivelEfetivo
    ? [
        ...locais.tanques
          .filter((t) => t.combustivel_id === combustivelEfetivo)
          .map((t) => ({ tipo: "TANQUE" as const, id: t.id, nome: t.nome, detalhe: "Tanque próprio" })),
        ...locais.postos.map((p) => ({ tipo: "POSTO" as const, id: p.id, nome: p.nome, detalhe: p.endereco })),
      ]
    : [];
  const chaveLocal = (l: Local) => `${l.tipo}:${l.id}`;
  const localEfetivo =
    opcoesLocal.length === 1 ? opcoesLocal[0] : opcoesLocal.find((l) => chaveLocal(l) === localChave);
  const noPosto = localEfetivo?.tipo === "POSTO";

  const termo = buscaPlaca.trim().toLowerCase();
  const veiculosFiltrados = veiculos.filter(
    (v) =>
      v.placa.toLowerCase().includes(termo.replace(/[- ]/g, "")) ||
      [v.marca, v.modelo].filter(Boolean).join(" ").toLowerCase().includes(termo)
  );

  const ultimoKm = veiculo?.quilometragem_atual ?? 0;
  const ultimoHorimetro = veiculo?.horimetro_atual ? Number(veiculo.horimetro_atual) : null;
  const valorMedicao = numero(medicao);
  const medicaoMenorQueUltima =
    medicao !== "" &&
    !isNaN(valorMedicao) &&
    (veiculo?.usa_horimetro ? ultimoHorimetro != null && valorMedicao < ultimoHorimetro : valorMedicao < ultimoKm);
  const litrosNum = numero(litros);
  // Posto: o valor vem do contrato e é aplicado pelo sistema — o motorista não vê nem informa valores.

  const fotosFaltando =
    (config.foto_bomba_obrigatoria && !fotoBomba) || (config.foto_km_obrigatoria && !fotoPainel);
  const tanqueCheioFaltando = !!config.exigir_tanque_cheio && completouTanque === null;
  const podeConfirmar =
    litros !== "" &&
    medicao !== "" &&
    !fotosFaltando &&
    !tanqueCheioFaltando &&
    !!combustivelEfetivo &&
    !!localEfetivo;

  function limparFormulario() {
    setCombustivelId("");
    setLocalChave("");
    setMedicao("");
    setCompletouTanque(null);
    setLitros("");
    setFotoBomba(null);
    setFotoPainel(null);
    setIdempotencyKey("");
  }

  function selecionarVeiculo(v: VeiculoApp) {
    setVeiculoId(v.id);
    limparFormulario();
    setPasso(2);
  }

  async function tirarFoto(
    evento: React.ChangeEvent<HTMLInputElement>,
    setter: (f: { url: string | null; arquivo: File | null; preview: string } | null) => void
  ) {
    const file = evento.target.files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    if (!online) {
      // Guarda a foto no celular; ela sobe junto com o abastecimento.
      setter({ url: null, arquivo: file, preview });
      return;
    }
    setter({ url: null, arquivo: file, preview });
    toast.loading("Enviando foto…", { id: "foto" });
    try {
      const url = await driverApi.uploadFoto(file);
      setter({ url, arquivo: null, preview });
      toast.success("Foto anexada.", { id: "foto" });
    } catch (e) {
      if (ehFalhaDeRede(e)) {
        toast("Sem sinal: a foto fica guardada e sobe junto com o abastecimento.", { id: "foto", icon: "📶" });
      } else {
        setter(null);
        toast.error("Não foi possível enviar a foto. Tente novamente.", { id: "foto" });
      }
    }
  }

  function montarPendente(): AbastecimentoPendente {
    const chave = idempotencyKey || novoIdempotencyKey();
    if (!idempotencyKey) setIdempotencyKey(chave);
    const v = veiculo!;
    const dados: Record<string, unknown> = {
      ...localizacao(),
      veiculo_id: v.id,
      combustivel_id: combustivelEfetivo || undefined,
      quantidade_litros: String(litrosNum),
      quilometragem: v.usa_horimetro ? 0 : Math.round(valorMedicao || 0),
      horimetro: v.usa_horimetro ? String(valorMedicao) : undefined,
      completou_tanque: completouTanque,
      foto_bomba_url: fotoBomba?.url ?? null,
      foto_painel_url: fotoPainel?.url ?? null,
    };
    if (localEfetivo?.tipo === "POSTO") {
      dados.fornecedor_id = localEfetivo.id;
    } else if (localEfetivo) {
      dados.tanque_id = localEfetivo.id;
    }
    return {
      idempotency_key: chave,
      registrado_em: new Date().toISOString(),
      dados,
      foto_bomba: fotoBomba?.url ? null : fotoBomba?.arquivo ?? null,
      foto_painel: fotoPainel?.url ? null : fotoPainel?.arquivo ?? null,
      resumo: { placa: v.placa, litros: String(litrosNum), local: localEfetivo?.nome ?? null },
    };
  }

  async function confirmar() {
    if (!veiculo) return;
    if (!podeConfirmar) {
      toast.error("Preencha os campos obrigatórios para confirmar.");
      return;
    }
    if (medicaoMenorQueUltima) {
      toast.error(veiculo.usa_horimetro ? "O horímetro informado é menor que o último registro." : "O KM informado é menor que o último registro.");
      return;
    }
    const item = montarPendente();
    setEnviando(true);
    try {
      if (!navigator.onLine) throw new TypeError("offline");
      await enviarAbastecimento(item);
      setConcluido({ veiculo, guardado: false });
    } catch (e) {
      if (ehFalhaDeRede(e)) {
        try {
          await guardarPendente(item);
          setConcluido({ veiculo, guardado: true });
        } catch {
          toast.error("Sem internet e sem espaço para guardar no celular. Tente de novo com sinal.");
        }
      } else if (e instanceof AuthError) {
        router.replace("/motorista/login?expirado=1");
      } else {
        toast.error((e as Error).message || "Não foi possível registrar o abastecimento. Tente novamente.");
      }
    } finally {
      setEnviando(false);
    }
  }

  // ── Sucesso ───────────────────────────────────────────────────────────────
  if (concluido) {
    const v = concluido.veiculo;
    return (
      <main
        className="flex min-h-screen flex-col items-center justify-center bg-[#F8F9FF] p-6 text-center"
        style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-[480px] flex-col items-center">
          <div className={`mb-4 flex h-20 w-20 items-center justify-center rounded-full ${concluido.guardado ? "bg-[#FFDD9A] text-[#805600]" : "bg-[#9DF6B3] text-[#106D34]"}`}>
            {concluido.guardado ? <CloudOff size={40} /> : <Check size={44} />}
          </div>
          <h1 className="text-2xl font-bold text-[#181C22]">
            {concluido.guardado ? "Guardado no celular" : "Abastecimento registrado!"}
          </h1>
          {concluido.guardado && (
            <p className="mt-2 text-sm text-[#424750]">
              Sem internet agora. O abastecimento será enviado sozinho quando o sinal voltar — com a data e a hora de agora.
            </p>
          )}
          <div className="mt-4 w-full rounded-2xl border border-[#C3C6D1]/30 bg-white p-5 shadow-card">
            <div className="flex items-center justify-center gap-3">
              <div className="font-mono text-xl font-bold text-[#1D5BD6]">{v.placa}</div>
              <div className="text-sm text-[#424750]">{[v.marca, v.modelo].filter(Boolean).join(" ")}</div>
            </div>
            <div className="mt-3 text-3xl font-bold text-[#181C22]">
              {litrosNum.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L
            </div>
            <div className="text-sm text-[#737781]">
              {v.usa_horimetro
                ? `${valorMedicao.toLocaleString("pt-BR")} h`
                : `${Math.round(valorMedicao || 0).toLocaleString("pt-BR")} km`}
              {localEfetivo && ` · ${localEfetivo.nome}`}
            </div>
          </div>
          <button
            onClick={() => router.replace("/motorista")}
            className="mt-8 w-full rounded-xl bg-[#1D5BD6] py-4 text-lg font-bold text-white active:bg-[#1E40AF]"
          >
            VOLTAR AO INÍCIO
          </button>
          <button
            onClick={() => {
              setConcluido(null);
              setPasso(1);
              setVeiculoId("");
              limparFormulario();
            }}
            className="mt-3 w-full rounded-xl border border-[#C3C6D1] bg-white py-4 text-lg font-medium text-[#1D5BD6]"
          >
            Novo abastecimento
          </button>
        </div>
      </main>
    );
  }

  // ── Sem internet e sem dados guardados (primeiro uso) ─────────────────────
  if (semDados) {
    return (
      <main
        className="flex min-h-screen flex-col items-center justify-center bg-[#F8F9FF] p-6 text-center"
        style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#FFDD9A] text-[#805600]">
          <WifiOff size={32} />
        </div>
        <h1 className="text-2xl font-bold text-[#181C22]">Sem conexão</h1>
        <p className="mt-2 max-w-[360px] text-sm text-[#424750]">
          Abra o app uma vez com internet para ele guardar os veículos no celular. Depois dá para abastecer mesmo sem sinal.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-8 w-full max-w-[480px] rounded-xl bg-[#1D5BD6] py-4 text-lg font-bold text-white"
        >
          <span className="inline-flex items-center gap-2"><RefreshCw size={20} /> TENTAR NOVAMENTE</span>
        </button>
      </main>
    );
  }

  const ETAPAS = ["Veículo", "Dados", "Conferir"];
  const titulo = passo === 1 ? "Qual veículo?" : passo === 2 ? "Novo abastecimento" : "Confira e confirme";
  const nomeVeiculo = veiculo ? [veiculo.marca, veiculo.modelo].filter(Boolean).join(" ") || "—" : "";
  const campo =
    "w-full rounded-2xl border-2 border-[#E2E8F0] bg-white px-4 text-[17px] outline-none transition focus:border-[#1D5BD6]";

  return (
    <main className="min-h-[100dvh] bg-[#F1F4FA] text-[#0F172A]">
      <style>{`
        @keyframes ab-sobe { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        .ab-sobe { animation: ab-sobe .4s cubic-bezier(.2,.8,.2,1) both; }
        @media (prefers-reduced-motion: reduce) { .ab-sobe { animation: none !important; } }
      `}</style>

      {/* Cabeçalho com etapas */}
      <header className="sticky top-0 z-20 bg-gradient-to-br from-[#1D5BD6] to-[#153B8F] px-5 pb-4 text-white shadow-lg"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + .75rem)" }}>
        <div className="mx-auto max-w-[480px]">
          <div className="flex items-center gap-2">
            {passo > 1 ? (
              <button onClick={() => setPasso((p) => (p === 2 ? 1 : 2))} aria-label="Voltar"
                className="-ml-2 flex h-11 w-11 items-center justify-center rounded-2xl active:bg-white/15">
                <ChevronLeft size={26} />
              </button>
            ) : (
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15"><Fuel size={22} /></span>
            )}
            <h1 className="min-w-0 flex-1 truncate text-[20px] font-bold">{titulo}</h1>
            <Link href="/motorista" aria-label="Cancelar" className="flex h-11 items-center gap-1 rounded-2xl px-3 text-[15px] font-medium text-white/85 active:bg-white/15">
              <X size={18} /> Cancelar
            </Link>
          </div>
          <ol className="mt-3 grid grid-cols-3 gap-2" aria-label="Etapas">
            {ETAPAS.map((e, i) => {
              const n = i + 1;
              const feito = passo > n;
              const atual = passo === n;
              return (
                <li key={e} aria-current={atual ? "step" : undefined}>
                  <div className={`h-1.5 rounded-full transition-all ${feito || atual ? "bg-white" : "bg-white/25"}`} />
                  <span className={`mt-1.5 flex items-center gap-1 text-[12px] font-medium ${atual ? "text-white" : "text-white/60"}`}>
                    {feito && <Check size={12} />} {e}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </header>

      <div className="mx-auto max-w-[480px] px-5 pt-5" style={{ paddingBottom: passo === 1 ? "calc(env(safe-area-inset-bottom) + 1.5rem)" : "calc(env(safe-area-inset-bottom) + 7rem)" }}>
        {(!online || dadosDoCache) && (
          <div className="mb-4 flex items-start gap-3 rounded-2xl bg-[#FFF4D6] px-4 py-3 text-[14px] text-[#5C4200] ring-1 ring-[#FCD98A]">
            <WifiOff size={20} className="mt-0.5 flex-shrink-0" />
            <span>Sem internet. Pode abastecer normalmente: o registro fica guardado no celular e é enviado quando o sinal voltar.</span>
          </div>
        )}

        {/* Passo 1 — Veículo */}
        {passo === 1 && (
          <div className="ab-sobe space-y-3">
            <div className="relative">
              <Search size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#94A3B8]" aria-hidden />
              <input
                placeholder="Buscar placa ou modelo…"
                value={buscaPlaca}
                onChange={(e) => setBuscaPlaca(e.target.value)}
                autoCapitalize="characters"
                autoCorrect="off"
                className={`${campo} h-14 pl-12 uppercase placeholder:normal-case`}
              />
            </div>
            {veiculosFiltrados.length === 0 ? (
              <div className="rounded-3xl bg-white px-4 py-10 text-center text-[15px] text-[#64748B] ring-1 ring-[#E2E8F0]">
                Nenhum veículo encontrado.
              </div>
            ) : (
              <ul className="space-y-2.5">
                {veiculosFiltrados.map((v) => (
                  <li key={v.id}>
                    <button
                      onClick={() => selecionarVeiculo(v)}
                      className="flex w-full items-center gap-4 rounded-3xl bg-white p-3 pr-4 text-left shadow-[0_6px_18px_-12px_rgba(15,23,42,.35)] ring-1 ring-[#E2E8F0] transition active:scale-[.98] active:bg-[#EFF4FF]"
                    >
                      <FotoMotorista src={v.foto_url} className="h-16 w-20 flex-shrink-0 rounded-2xl" />
                      <div className="min-w-0 flex-1">
                        <span className="inline-block rounded-md border-2 border-[#0F172A] bg-white px-2 font-mono text-[17px] font-bold leading-6">{v.placa}</span>
                        <div className="mt-1 truncate text-[15px] text-[#475569]">
                          {[v.marca, v.modelo].filter(Boolean).join(" ") || "—"}
                        </div>
                      </div>
                      <ChevronRight size={22} className="shrink-0 text-[#94A3B8]" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Passo 2 — Dados */}
        {passo === 2 && veiculo && (
          <div className="ab-sobe space-y-5">
            <div className="flex items-center gap-4 rounded-3xl bg-white p-3 pr-4 ring-1 ring-[#E2E8F0]">
              <FotoMotorista src={veiculo.foto_url} className="h-16 w-20 flex-shrink-0 rounded-2xl" />
              <div className="min-w-0 flex-1">
                <span className="inline-block rounded-md border-2 border-[#0F172A] bg-white px-2 font-mono text-[17px] font-bold leading-6">{veiculo.placa}</span>
                <div className="mt-1 truncate text-[15px] text-[#475569]">{nomeVeiculo}</div>
              </div>
              <button onClick={() => setPasso(1)} className="shrink-0 rounded-xl px-2 py-2 text-[14px] font-medium text-[#1D5BD6] active:bg-[#EFF4FF]">Trocar</button>
            </div>

            {/* Combustível / produto */}
            <section className="rounded-3xl bg-white p-4 ring-1 ring-[#E2E8F0]">
              <span className="mb-2 flex items-center gap-2 text-[15px] font-semibold"><Droplets size={18} className="text-[#1D5BD6]" /> O que foi abastecido?</span>
              {combustiveisVeiculo.length <= 1 ? (
                <div className="rounded-2xl bg-[#F1F5FF] px-4 py-3 text-[17px] font-bold">
                  {combustiveisVeiculo[0]?.nome ?? "Veículo sem combustível cadastrado"}
                </div>
              ) : (
                <div className="grid gap-2">
                  {combustiveisVeiculo.map((c) => {
                    const ativo = combustivelEfetivo === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setCombustivelId(c.id);
                          setLocalChave("");
                        }}
                        className={`flex items-center justify-between rounded-2xl px-4 py-3.5 text-[17px] font-semibold transition ${
                          ativo ? "bg-[#1D5BD6] text-white shadow-md" : "bg-[#F8FAFC] ring-2 ring-[#E2E8F0]"
                        }`}
                      >
                        {c.nome.toUpperCase()} {ativo && <Check size={20} />}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Onde abasteceu */}
              {combustivelEfetivo && (
                <div className="mt-4">
                  <span className="mb-2 flex items-center gap-2 text-[15px] font-semibold"><MapPin size={18} className="text-[#1D5BD6]" /> {opcoesLocal.length > 1 ? "Onde abasteceu?" : "Abastecendo em"}</span>
                  {opcoesLocal.length === 0 ? (
                    <div className="rounded-2xl bg-[#FFF8E6] px-4 py-3 text-[14px] text-[#5C4200] ring-1 ring-[#FCD98A]">
                      Nenhum tanque ou posto credenciado para este combustível. Avise o setor de frota.
                    </div>
                  ) : opcoesLocal.length === 1 ? (
                    <div className="rounded-2xl bg-[#F1F5FF] px-4 py-3">
                      <div className="text-[17px] font-bold">{opcoesLocal[0].nome}</div>
                      {opcoesLocal[0].detalhe && <div className="text-[13px] text-[#64748B]">{opcoesLocal[0].detalhe}</div>}
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      {opcoesLocal.map((l) => {
                        const ativo = localEfetivo && chaveLocal(localEfetivo) === chaveLocal(l);
                        return (
                          <button
                            key={chaveLocal(l)}
                            type="button"
                            onClick={() => setLocalChave(chaveLocal(l))}
                            className={`rounded-2xl px-4 py-3 text-left transition ${ativo ? "bg-[#1D5BD6] text-white shadow-md" : "bg-[#F8FAFC] ring-2 ring-[#E2E8F0]"}`}
                          >
                            <div className="text-[17px] font-semibold">{l.nome}</div>
                            <div className={`text-[13px] ${ativo ? "text-white/80" : "text-[#64748B]"}`}>
                              {l.tipo === "POSTO" ? "Posto credenciado" : "Tanque próprio"}
                              {l.tipo === "POSTO" && l.detalhe ? ` · ${l.detalhe}` : ""}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Litros e medição */}
            <section className="space-y-4 rounded-3xl bg-white p-4 ring-1 ring-[#E2E8F0]">
              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-[15px] font-semibold"><Fuel size={18} className="text-[#1D5BD6]" /> {produtoSelecionado ? `Litros de ${produtoSelecionado.nome}` : "Litros abastecidos"}</span>
                <div className="relative">
                  <input
                    inputMode="decimal"
                    enterKeyHint="next"
                    placeholder="0,00"
                    value={litros}
                    onChange={(e) => setLitros(e.target.value.replace(/[^\d.,]/g, ""))}
                    className={`${campo} h-[72px] pr-14 text-[32px] font-bold`}
                  />
                  <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-[20px] font-bold text-[#94A3B8]">L</span>
                </div>
              </label>

              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-[15px] font-semibold"><Gauge size={18} className="text-[#1D5BD6]" /> {veiculo.usa_horimetro ? "Horímetro atual" : "KM atual do veículo"}</span>
                <div className="relative">
                  <input
                    inputMode="decimal"
                    enterKeyHint="done"
                    placeholder="0"
                    value={medicao}
                    onChange={(e) => setMedicao(e.target.value.replace(/[^\d.,]/g, ""))}
                    className={`${campo} h-[72px] pr-16 text-[32px] font-bold ${medicaoMenorQueUltima ? "!border-[#DC2626]" : ""}`}
                  />
                  <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-[18px] font-bold text-[#94A3B8]">{veiculo.usa_horimetro ? "h" : "km"}</span>
                </div>
                <p className="mt-1.5 text-[13px] text-[#64748B]">
                  {veiculo.usa_horimetro
                    ? ultimoHorimetro != null && `Último registrado: ${ultimoHorimetro.toLocaleString("pt-BR")} h`
                    : `Último registrado: ${ultimoKm.toLocaleString("pt-BR")} km`}
                </p>
                {medicaoMenorQueUltima && (
                  <p className="mt-1 text-[14px] font-semibold text-[#B91C1C]">
                    {veiculo.usa_horimetro ? "O horímetro informado é menor que o último registro." : "O KM informado é menor que o último registro."}
                  </p>
                )}
              </label>

              {noPosto && (
                <p className="flex items-start gap-2 rounded-2xl bg-[#F1F5FF] px-3 py-2.5 text-[13px] text-[#334155]">
                  <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[#1D5BD6]" />
                  O valor é calculado pelo contrato com o posto. Você só informa os litros e o km.
                </p>
              )}
            </section>

            {/* Tanque cheio */}
            <section className="rounded-3xl bg-white p-4 ring-1 ring-[#E2E8F0]">
              <span className="mb-2 block text-[15px] font-semibold">
                Completou o tanque?{config.exigir_tanque_cheio && <span className="text-[#BA1A1A]"> *</span>}
              </span>
              <div className="grid grid-cols-2 gap-3">
                {[true, false].map((val) => (
                  <button
                    key={String(val)}
                    type="button"
                    onClick={() => setCompletouTanque(completouTanque === val ? null : val)}
                    className={`flex h-14 items-center justify-center gap-2 rounded-2xl text-[17px] font-bold transition ${
                      completouTanque === val
                        ? val
                          ? "bg-[#16A34A] text-white shadow-md"
                          : "bg-[#B45309] text-white shadow-md"
                        : "bg-[#F8FAFC] ring-2 ring-[#E2E8F0]"
                    }`}
                  >
                    {completouTanque === val && <Check size={20} />} {val ? "Sim" : "Não"}
                  </button>
                ))}
              </div>
            </section>

            {/* Fotos */}
            <section className="grid grid-cols-2 gap-3">
              <CampoFoto
                rotulo={veiculo.usa_horimetro ? "Painel / horímetro" : "Painel / KM"}
                obrigatoria={config.foto_km_obrigatoria}
                foto={fotoPainel}
                aoTirar={(e) => tirarFoto(e, setFotoPainel)}
                aoLimpar={() => setFotoPainel(null)}
              />
              <CampoFoto
                rotulo={noPosto ? "Bomba ou cupom" : "Bomba"}
                obrigatoria={config.foto_bomba_obrigatoria}
                foto={fotoBomba}
                aoTirar={(e) => tirarFoto(e, setFotoBomba)}
                aoLimpar={() => setFotoBomba(null)}
              />
            </section>
          </div>
        )}

        {/* Passo 3 — Resumo e confirmação */}
        {passo === 3 && veiculo && (
          <div className="ab-sobe space-y-4">
            <div className="overflow-hidden rounded-3xl bg-white ring-1 ring-[#E2E8F0]">
              <div className="flex items-center gap-4 bg-gradient-to-br from-[#EFF4FF] to-white p-4">
                <FotoMotorista src={veiculo.foto_url} className="h-14 w-16 flex-shrink-0 rounded-xl" />
                <div className="min-w-0">
                  <span className="inline-block rounded-md border-2 border-[#0F172A] bg-white px-2 font-mono text-[16px] font-bold leading-6">{veiculo.placa}</span>
                  <div className="mt-0.5 truncate text-[14px] text-[#475569]">{nomeVeiculo}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 divide-x divide-[#E2E8F0] border-y border-[#E2E8F0]">
                <div className="p-4 text-center">
                  <p className="text-[13px] text-[#64748B]">Litros</p>
                  <p className="text-[28px] font-bold leading-tight">{litrosNum.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</p>
                </div>
                <div className="p-4 text-center">
                  <p className="text-[13px] text-[#64748B]">{veiculo.usa_horimetro ? "Horímetro" : "KM"}</p>
                  <p className="text-[28px] font-bold leading-tight">
                    {veiculo.usa_horimetro ? valorMedicao.toLocaleString("pt-BR") : Math.round(valorMedicao || 0).toLocaleString("pt-BR")}
                  </p>
                </div>
              </div>
              <div className="px-4 py-2">
                <LinhaResumo rotulo="Combustível" valor={produtoSelecionado?.nome ?? "—"} />
                <LinhaResumo rotulo="Local" valor={localEfetivo?.nome ?? "—"} />
                <LinhaResumo rotulo="Tanque cheio" valor={completouTanque === null ? "—" : completouTanque ? "Sim" : "Não"} />
                <LinhaResumo rotulo="Data e hora" valor={new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} />
                <LinhaResumo rotulo="Foto do painel" valor={fotoPainel ? "✓ Tirada" : "—"} />
                <LinhaResumo rotulo="Foto da bomba" valor={fotoBomba ? "✓ Tirada" : "—"} />
              </div>
            </div>
            <p className="flex items-start gap-2 px-1 text-[13px] text-[#64748B]">
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[#1D5BD6]" />
              Ao confirmar, este registro fica assinado com o seu acesso (login e PIN), com data e hora.
            </p>
          </div>
        )}
      </div>

      {/* Botão principal fixo no rodapé (etapas 2 e 3) */}
      {passo > 1 && veiculo && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[#E2E8F0] bg-white/95 px-5 pt-3 backdrop-blur"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + .75rem)" }}>
          <div className="mx-auto max-w-[480px]">
            {passo === 2 && !podeConfirmar && (litros !== "" || medicao !== "") && (
              <p className="mb-2 text-center text-[13px] font-medium text-[#92400E]">
                {!localEfetivo && combustivelEfetivo && opcoesLocal.length > 1
                  ? "Escolha onde abasteceu."
                  : tanqueCheioFaltando
                    ? "Responda se completou o tanque."
                    : "Preencha os campos e as fotos obrigatórias para continuar."}
              </p>
            )}
            {passo === 2 ? (
              <button
                onClick={() => setPasso(3)}
                disabled={!podeConfirmar}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#1D5BD6] to-[#153B8F] text-[18px] font-bold text-white shadow-[0_12px_24px_-10px_rgba(29,91,214,.7)] transition active:scale-[.98] disabled:opacity-45 disabled:shadow-none"
              >
                Conferir <ChevronRight size={22} />
              </button>
            ) : (
              <button
                disabled={!podeConfirmar || enviando}
                onClick={confirmar}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#16A34A] to-[#15803D] text-[18px] font-bold text-white shadow-[0_12px_24px_-10px_rgba(22,163,74,.7)] transition active:scale-[.98] disabled:opacity-50"
              >
                {enviando ? <><Loader2 size={20} className="animate-spin" /> Registrando…</> : <><Check size={22} /> Confirmar abastecimento</>}
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function LinhaResumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#F1F5F9] py-2.5 last:border-0">
      <span className="text-[14px] text-[#64748B]">{rotulo}</span>
      <span className="text-right text-[15px] font-semibold">{valor}</span>
    </div>
  );
}

function CampoFoto({
  rotulo,
  obrigatoria,
  foto,
  aoTirar,
  aoLimpar,
}: {
  rotulo: string;
  obrigatoria: boolean;
  foto: { url: string | null; arquivo: File | null; preview: string } | null;
  aoTirar: (e: React.ChangeEvent<HTMLInputElement>) => void;
  aoLimpar: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-3xl bg-white ring-1 ring-[#E2E8F0]">
      {foto ? (
        <div>
          <div className="relative">
            <img src={foto.preview} alt={`Foto: ${rotulo}`} className="h-32 w-full object-cover" />
            <span className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-[#16A34A] text-white shadow"><Check size={16} /></span>
          </div>
          <div className="p-2.5">
            <p className="truncate text-[13px] font-semibold">{rotulo}</p>
            {!foto.url && (
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[#92400E]">
                <CloudOff size={12} /> Guardada no celular
              </p>
            )}
            <button
              type="button"
              onClick={aoLimpar}
              className="mt-1.5 flex h-9 w-full items-center justify-center gap-1 rounded-xl bg-[#F1F5F9] text-[13px] font-medium text-[#475569] active:bg-[#E2E8F0]"
            >
              <RefreshCw size={14} /> Tirar de novo
            </button>
          </div>
        </div>
      ) : (
        <label className="flex h-full min-h-[150px] cursor-pointer flex-col items-center justify-center gap-2 p-3 text-center active:bg-[#F8FAFF]">
          <span className={`flex h-14 w-14 items-center justify-center rounded-2xl ${obrigatoria ? "bg-[#FEE4E2] text-[#B42318]" : "bg-[#E5EEFF] text-[#1D5BD6]"}`}><Camera size={26} /></span>
          <span className="text-[14px] font-semibold leading-tight">{rotulo}</span>
          <span className={`text-[12px] font-medium ${obrigatoria ? "text-[#B42318]" : "text-[#64748B]"}`}>
            {obrigatoria ? "Obrigatória" : "Opcional"}
          </span>
          <input type="file" accept="image/*" capture="environment" hidden onChange={aoTirar} />
        </label>
      )}
    </div>
  );
}
