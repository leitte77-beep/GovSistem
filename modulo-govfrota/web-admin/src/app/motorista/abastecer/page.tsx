"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Camera, Check, ChevronLeft, CloudOff, MapPin, RefreshCw, WifiOff } from "lucide-react";
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

function reais(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function AbastecerPage() {
  const router = useRouter();
  const [passo, setPasso] = useState<1 | 2 | 3>(1);
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
  const [numeroNf, setNumeroNf] = useState("");
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

  const veiculosFiltrados = veiculos.filter((v) =>
    v.placa.toLowerCase().includes(buscaPlaca.replace(/[- ]/g, "").toLowerCase())
  );

  const ultimoKm = veiculo?.quilometragem_atual ?? 0;
  const ultimoHorimetro = veiculo?.horimetro_atual ? Number(veiculo.horimetro_atual) : null;
  const valorMedicao = numero(medicao);
  const medicaoMenorQueUltima =
    medicao !== "" &&
    !isNaN(valorMedicao) &&
    (veiculo?.usa_horimetro ? ultimoHorimetro != null && valorMedicao < ultimoHorimetro : valorMedicao < ultimoKm);
  const litrosNum = numero(litros);
  // Posto: preço do contrato (o motorista não informa valor).
  const precoContrato = noPosto
    ? locais.postos
        .find((p) => p.id === localEfetivo?.id)
        ?.precos?.find((c) => c.combustivel_id === combustivelEfetivo)?.preco_litro ?? null
    : null;
  const valorEstimado = precoContrato != null && litrosNum > 0 ? precoContrato * litrosNum : null;

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
    setNumeroNf("");
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
      if (numeroNf.trim()) dados.numero_nf = numeroNf.trim();
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

  return (
    <main
      className="min-h-screen bg-[#F8F9FF] p-5"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 1.25rem)", paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
    >
      <div className="mx-auto max-w-[480px]">
        <header className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {passo > 1 && (
              <button onClick={() => setPasso((p) => (p === 2 ? 1 : 2))} aria-label="Voltar" className="rounded-full p-2 text-[#424750] hover:bg-white">
                <ChevronLeft size={24} />
              </button>
            )}
            <h1 className="text-xl font-bold text-[#181C22]">
              {passo === 1 ? "Qual veículo?" : passo === 2 ? "Novo abastecimento" : "Confira o abastecimento"}
            </h1>
          </div>
          <Link href="/motorista" className="rounded-full px-4 py-2 text-sm text-[#424750] hover:bg-white">Cancelar</Link>
        </header>

        {(!online || dadosDoCache) && (
          <div className="mb-4 flex items-start gap-2 rounded-xl bg-[#FFF4D6] px-3 py-2 text-sm text-[#5C4200]">
            <WifiOff size={18} className="mt-0.5 flex-shrink-0" />
            <span>Sem internet. Pode abastecer normalmente: o registro fica guardado no celular e é enviado quando o sinal voltar.</span>
          </div>
        )}

        {/* Passo 1 — Veículo */}
        {passo === 1 && (
          <div className="space-y-3">
            <input
              placeholder="Buscar placa…"
              value={buscaPlaca}
              onChange={(e) => setBuscaPlaca(e.target.value)}
              className="w-full rounded-xl border border-[#C3C6D1] bg-white px-4 py-3 text-lg outline-none focus:border-[#1D5BD6]"
            />
            {veiculosFiltrados.length === 0 ? (
              <div className="rounded-xl border border-[#C3C6D1]/40 bg-white px-4 py-8 text-center text-sm text-[#737781]">
                Nenhum veículo encontrado.
              </div>
            ) : (
              <ul className="space-y-2">
                {veiculosFiltrados.map((v) => (
                  <li key={v.id}>
                    <button
                      onClick={() => selecionarVeiculo(v)}
                      className="flex w-full items-center gap-3 rounded-xl border border-[#C3C6D1]/30 bg-white p-3 text-left shadow-card active:bg-[#EFF4FF]"
                    >
                      <FotoMotorista src={v.foto_url} className="h-14 w-16 flex-shrink-0 rounded-lg" />
                      <div className="min-w-0">
                        <div className="font-mono text-lg font-bold text-[#1D5BD6]">{v.placa}</div>
                        <div className="truncate text-sm text-[#424750]">
                          {[v.marca, v.modelo].filter(Boolean).join(" ") || "—"}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Passo 2 — Dados */}
        {passo === 2 && veiculo && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 rounded-xl border border-[#C3C6D1]/30 bg-white p-3 shadow-card">
              <FotoMotorista src={veiculo.foto_url} className="h-14 w-16 flex-shrink-0 rounded-lg" />
              <div>
                <div className="font-mono text-lg font-bold text-[#1D5BD6]">{veiculo.placa}</div>
                <div className="text-sm text-[#424750]">
                  {[veiculo.marca, veiculo.modelo].filter(Boolean).join(" ") || "—"}
                </div>
              </div>
            </div>

            {/* Combustível / produto */}
            <div>
              <span className="mb-2 block text-sm font-medium text-[#424750]">O que foi abastecido?</span>
              {combustiveisVeiculo.length <= 1 ? (
                <div className="rounded-xl border border-[#C3C6D1]/30 bg-white px-4 py-3 text-lg font-semibold text-[#181C22]">
                  {combustiveisVeiculo[0]?.nome ?? "Veículo sem combustível cadastrado"}
                </div>
              ) : (
                <div className="grid gap-2">
                  {combustiveisVeiculo.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCombustivelId(c.id);
                        setLocalChave("");
                      }}
                      className={`rounded-xl px-4 py-3 text-lg font-medium ${
                        combustivelEfetivo === c.id ? "bg-[#1D5BD6] text-white" : "border border-[#C3C6D1] bg-white text-[#181C22]"
                      }`}
                    >
                      {c.nome.toUpperCase()}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Onde abasteceu */}
            {combustivelEfetivo && (
              <div>
                <span className="mb-2 block text-sm font-medium text-[#424750]">
                  {opcoesLocal.length > 1 ? "Onde abasteceu?" : "Abastecendo em"}
                </span>
                {opcoesLocal.length === 0 ? (
                  <div className="rounded-xl border border-[#FFDD9A] bg-[#FFF8E6] px-4 py-3 text-sm text-[#5C4200]">
                    Nenhum tanque ou posto credenciado para este combustível. Avise o setor de frota.
                  </div>
                ) : opcoesLocal.length === 1 ? (
                  <div className="flex items-center gap-2 rounded-xl border border-[#C3C6D1]/30 bg-white px-4 py-3">
                    <MapPin size={18} className="text-[#737781]" />
                    <div>
                      <div className="text-lg font-semibold text-[#181C22]">{opcoesLocal[0].nome}</div>
                      {opcoesLocal[0].detalhe && <div className="text-xs text-[#737781]">{opcoesLocal[0].detalhe}</div>}
                    </div>
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
                          className={`rounded-xl px-4 py-3 text-left ${ativo ? "bg-[#1D5BD6] text-white" : "border border-[#C3C6D1] bg-white text-[#181C22]"}`}
                        >
                          <div className="text-lg font-medium">{l.nome}</div>
                          <div className={`text-xs ${ativo ? "text-white/80" : "text-[#737781]"}`}>
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

            {/* Litros */}
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[#424750]">
                {produtoSelecionado ? `Litros de ${produtoSelecionado.nome}` : "Litros abastecidos"}
              </span>
              <input
                inputMode="decimal"
                placeholder="0,00"
                value={litros}
                onChange={(e) => setLitros(e.target.value.replace(/[^\d.,]/g, ""))}
                className="w-full rounded-xl border border-[#C3C6D1] bg-white px-4 py-5 text-3xl font-semibold outline-none focus:border-[#1D5BD6]"
              />
            </label>

            {/* Posto: valor vem do contrato com o posto; nota é opcional */}
            {noPosto && (
              <div className="space-y-3">
                <div className="rounded-xl border border-[#C3C6D1] bg-[#F1F3FA] px-4 py-3">
                  {precoContrato != null ? (
                    <>
                      <span className="block text-sm font-medium text-[#424750]">
                        Preço contratado: {reais(precoContrato)} por litro
                      </span>
                      <span className="block text-xl font-semibold text-[#181C22]">
                        {valorEstimado != null ? reais(valorEstimado) : "—"}
                      </span>
                    </>
                  ) : (
                    <span className="block text-sm text-[#424750]">
                      O valor é definido pelo setor de frota conforme o contrato com o posto.
                    </span>
                  )}
                </div>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-[#424750]">Nº da nota</span>
                  <input
                    inputMode="numeric"
                    placeholder="Opcional"
                    value={numeroNf}
                    onChange={(e) => setNumeroNf(e.target.value.replace(/[^\d]/g, "").slice(0, 20))}
                    className="w-full rounded-xl border border-[#C3C6D1] bg-white px-4 py-4 text-xl font-semibold outline-none focus:border-[#1D5BD6]"
                  />
                </label>
              </div>
            )}

            {/* KM / Horímetro */}
            <div>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-[#424750]">
                  {veiculo.usa_horimetro ? "Horímetro atual (horas)" : "KM atual do veículo"}
                </span>
                <input
                  inputMode="decimal"
                  placeholder="0"
                  value={medicao}
                  onChange={(e) => setMedicao(e.target.value.replace(/[^\d.,]/g, ""))}
                  className="w-full rounded-xl border border-[#C3C6D1] bg-white px-4 py-5 text-3xl font-semibold outline-none focus:border-[#1D5BD6]"
                />
              </label>
              <p className="mt-1 text-xs text-[#737781]">
                {veiculo.usa_horimetro
                  ? ultimoHorimetro != null && `Último horímetro registrado: ${ultimoHorimetro.toLocaleString("pt-BR")} h`
                  : `Último KM registrado: ${ultimoKm.toLocaleString("pt-BR")} km`}
              </p>
              {medicaoMenorQueUltima && (
                <p className="mt-1 text-sm font-medium text-[#BA1A1A]">
                  {veiculo.usa_horimetro ? "O horímetro informado é menor que o último registro." : "O KM informado é menor que o último registro."}
                </p>
              )}
            </div>

            {/* Tanque cheio */}
            <div>
              <span className="mb-2 block text-sm font-medium text-[#424750]">
                Completou o tanque?{config.exigir_tanque_cheio && <span className="text-[#BA1A1A]"> *</span>}
              </span>
              <div className="grid grid-cols-2 gap-3">
                {[true, false].map((val) => (
                  <button
                    key={String(val)}
                    type="button"
                    onClick={() => setCompletouTanque(completouTanque === val ? null : val)}
                    className={`rounded-xl py-4 text-lg font-bold transition-colors ${
                      completouTanque === val
                        ? val
                          ? "bg-[#106D34] text-white ring-2 ring-[#9DF6B3]"
                          : "bg-[#805600] text-white ring-2 ring-[#FFDD9A]"
                        : "border border-[#C3C6D1] bg-white text-[#181C22]"
                    }`}
                  >
                    {val ? "SIM" : "NÃO"}
                  </button>
                ))}
              </div>
            </div>

            {/* Fotos */}
            <div className="space-y-3">
              <CampoFoto
                rotulo={veiculo.usa_horimetro ? "Foto do painel / horímetro" : "Foto do painel / KM"}
                obrigatoria={config.foto_km_obrigatoria}
                foto={fotoPainel}
                aoTirar={(e) => tirarFoto(e, setFotoPainel)}
                aoLimpar={() => setFotoPainel(null)}
              />
              <CampoFoto
                rotulo={noPosto ? "Foto da bomba ou do cupom" : "Foto da bomba"}
                obrigatoria={config.foto_bomba_obrigatoria}
                foto={fotoBomba}
                aoTirar={(e) => tirarFoto(e, setFotoBomba)}
                aoLimpar={() => setFotoBomba(null)}
              />
            </div>

            <button
              onClick={() => setPasso(3)}
              disabled={!podeConfirmar}
              className="w-full rounded-xl bg-[#1D5BD6] py-5 text-xl font-bold text-white disabled:opacity-50"
            >
              CONFERIR ABASTECIMENTO
            </button>

            {!podeConfirmar && (litros !== "" || medicao !== "") && (
              <p className="text-center text-sm text-[#805600]">
                {!localEfetivo && combustivelEfetivo && opcoesLocal.length > 1
                  ? "Escolha onde abasteceu."
                  : tanqueCheioFaltando
                    ? "Responda se completou o tanque."
                    : "Preencha os campos e as fotos obrigatórias para continuar."}
              </p>
            )}
          </div>
        )}

        {/* Passo 3 — Resumo e confirmação */}
        {passo === 3 && veiculo && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-[#C3C6D1]/30 bg-white p-5 shadow-card">
              <h2 className="mb-4 text-base font-bold text-[#181C22]">Confira o abastecimento</h2>
              <LinhaResumo rotulo="Veículo" valor={`${veiculo.placa} • ${[veiculo.marca, veiculo.modelo].filter(Boolean).join(" ")}`} />
              <LinhaResumo rotulo="Combustível" valor={produtoSelecionado?.nome ?? "—"} />
              <LinhaResumo rotulo="Local" valor={localEfetivo?.nome ?? "—"} />
              <LinhaResumo rotulo="Quantidade" valor={`${litrosNum.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} L`} />
              {noPosto && valorEstimado != null && <LinhaResumo rotulo="Valor (contrato)" valor={reais(valorEstimado)} />}
              {noPosto && numeroNf && <LinhaResumo rotulo="Nota fiscal" valor={numeroNf} />}
              <LinhaResumo
                rotulo={veiculo.usa_horimetro ? "Horímetro" : "KM"}
                valor={
                  veiculo.usa_horimetro
                    ? `${valorMedicao.toLocaleString("pt-BR")} h`
                    : `${Math.round(valorMedicao || 0).toLocaleString("pt-BR")} km`
                }
              />
              <LinhaResumo rotulo="Tanque cheio" valor={completouTanque === null ? "—" : completouTanque ? "Sim" : "Não"} />
              <LinhaResumo rotulo="Data e hora" valor={new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} />
              <LinhaResumo rotulo="Foto da bomba" valor={fotoBomba ? "✓" : "—"} />
              <LinhaResumo rotulo="Foto do painel" valor={fotoPainel ? "✓" : "—"} />
            </div>
            <p className="text-center text-xs text-[#737781]">
              Ao confirmar, este registro fica assinado com o seu acesso (login e PIN), com data e hora.
            </p>

            <button
              disabled={!podeConfirmar || enviando}
              onClick={confirmar}
              className="w-full rounded-xl bg-[#1D5BD6] py-5 text-xl font-bold text-white disabled:opacity-50"
            >
              {enviando ? "REGISTRANDO ABASTECIMENTO…" : "CONFIRMAR ABASTECIMENTO"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

function LinhaResumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#C3C6D1]/20 py-2 last:border-0">
      <span className="text-sm text-[#737781]">{rotulo}</span>
      <span className="text-right text-sm font-semibold text-[#181C22]">{valor}</span>
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
    <div className="rounded-xl border-2 border-dashed border-[#C3C6D1] bg-white p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium text-[#424750]">{rotulo}</span>
        <span className={`text-xs font-semibold ${obrigatoria ? "text-[#BA1A1A]" : "text-[#737781]"}`}>
          {obrigatoria ? "* Obrigatória" : "Opcional"}
        </span>
      </div>
      {foto ? (
        <div className="space-y-2">
          <img src={foto.preview} alt={`Foto: ${rotulo}`} className="h-40 w-full rounded-lg object-cover" />
          {!foto.url && (
            <p className="flex items-center gap-1 text-xs text-[#805600]">
              <CloudOff size={14} /> Guardada no celular — sobe junto com o abastecimento.
            </p>
          )}
          <button
            type="button"
            onClick={aoLimpar}
            className="flex w-full items-center justify-center gap-1 rounded-lg border border-[#C3C6D1] py-2 text-sm font-medium text-[#424750]"
          >
            <RefreshCw size={16} /> Tirar novamente
          </button>
        </div>
      ) : (
        <label className="flex cursor-pointer items-center justify-center gap-2 py-4 text-lg font-medium text-[#424750]">
          <Camera size={24} /> Tirar foto
          <input type="file" accept="image/*" capture="environment" hidden onChange={aoTirar} />
        </label>
      )}
    </div>
  );
}
