"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Camera, Check, ChevronLeft, RefreshCw, WifiOff } from "lucide-react";
import { driverApi, VeiculoApp } from "@/lib/api";
import { FotoMotorista } from "@/components/motorista/FotoMotorista";

interface TanqueApp {
  id: string;
  nome: string;
  combustivel_id: string;
}

function novoIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function AbastecerPage() {
  const router = useRouter();
  const [passo, setPasso] = useState<1 | 2 | 3>(1);
  const [veiculos, setVeiculos] = useState<VeiculoApp[]>([]);
  const [tanques, setTanques] = useState<TanqueApp[]>([]);
  const [veiculoId, setVeiculoId] = useState("");
  const [buscaPlaca, setBuscaPlaca] = useState("");
  const [combustivelId, setCombustivelId] = useState("");
  const [tanqueId, setTanqueId] = useState("");
  const [litros, setLitros] = useState("");
  const [medicao, setMedicao] = useState("");
  const [completouTanque, setCompletouTanque] = useState<boolean | null>(null);
  const [fotoBomba, setFotoBomba] = useState<string | null>(null);
  const [fotoBombaPreview, setFotoBombaPreview] = useState<string | null>(null);
  const [fotoPainel, setFotoPainel] = useState<string | null>(null);
  const [fotoPainelPreview, setFotoPainelPreview] = useState<string | null>(null);
  const [fotoBombaObrigatoria, setFotoBombaObrigatoria] = useState(false);
  const [fotoKmObrigatoria, setFotoKmObrigatoria] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState<VeiculoApp | null>(null);
  const [online, setOnline] = useState(true);
  const [idempotencyKey, setIdempotencyKey] = useState("");

  const veiculo = veiculos.find((v) => v.id === veiculoId);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    let cancelado = false;
    Promise.all([driverApi.me(), driverApi.veiculos(), driverApi.tanques()])
      .then(([me, vs, ts]) => {
        if (cancelado) return;
        setVeiculos(vs);
        setTanques(ts);
        setFotoBombaObrigatoria(me.foto_bomba_obrigatoria);
        setFotoKmObrigatoria(me.foto_km_obrigatoria);
      })
      .catch(() => router.replace("/motorista/login?expirado=1"));
    return () => {
      cancelado = true;
    };
  }, [router]);

  // Combustíveis compatíveis do veículo (principal + secundário).
  const combustiveisVeiculo = veiculo
    ? [
        { id: veiculo.combustivel_principal_id, nome: veiculo.combustivel_principal_nome },
        { id: veiculo.combustivel_secundario_id, nome: veiculo.combustivel_secundario_nome },
      ].filter((c) => c.id && c.nome) as { id: string; nome: string }[]
    : [];

  // Auto-seleciona o combustível quando há apenas um.
  const combustivelAuto =
    veiculo && combustiveisVeiculo.length === 1 ? combustiveisVeiculo[0].id : "";
  const combustivelEfetivo = combustivelAuto || combustivelId;

  // Tanques compatíveis com o combustível selecionado.
  const tanquesCompativeis = combustivelEfetivo
    ? tanques.filter((t) => t.combustivel_id === combustivelEfetivo)
    : [];
  const tanqueAuto =
    combustivelEfetivo && tanquesCompativeis.length === 1 ? tanquesCompativeis[0].id : "";
  const tanqueEfetivo = tanqueAuto || tanqueId;

  const veiculosFiltrados = veiculos.filter((v) =>
    v.placa.toLowerCase().includes(buscaPlaca.replace(/[- ]/g, "").toLowerCase())
  );

  const ultimoKm = veiculo?.quilometragem_atual ?? 0;
  const ultimoHorimetro = veiculo?.horimetro_atual ? Number(veiculo.horimetro_atual) : null;
  const valorMedicao = Number(medicao.replace(",", "."));
  const kmMenorQueUltimo =
    !veiculo?.usa_horimetro && medicao !== "" && !isNaN(valorMedicao) && valorMedicao < ultimoKm;

  const fotosFaltando =
    (fotoBombaObrigatoria && !fotoBomba) || (fotoKmObrigatoria && !fotoPainel);
  const podeConfirmar = litros !== "" && medicao !== "" && !fotosFaltando && !!combustivelEfetivo && !!tanqueEfetivo;

  function selecionarVeiculo(v: VeiculoApp) {
    setVeiculoId(v.id);
    setCombustivelId("");
    setTanqueId("");
    setMedicao("");
    setCompletouTanque(null);
    setLitros("");
    setFotoBomba(null);
    setFotoBombaPreview(null);
    setFotoPainel(null);
    setFotoPainelPreview(null);
    setPasso(2);
  }

  async function tirarFoto(
    evento: React.ChangeEvent<HTMLInputElement>,
    setter: (url: string | null) => void,
    setPreview: (url: string | null) => void
  ) {
    const file = evento.target.files?.[0];
    if (!file) return;
    if (!online) {
      toast.error("Sem conexão com o servidor. Reconecte-se para enviar a foto.");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    toast.loading("Enviando foto…", { id: "foto" });
    try {
      const url = await driverApi.uploadFoto(file);
      setter(url);
      toast.success("Foto anexada.", { id: "foto" });
    } catch {
      setPreview(null);
      toast.error("Não foi possível enviar a foto. Tente novamente.", { id: "foto" });
    }
  }

  function limparFoto(setter: (u: string | null) => void, setPreview: (u: string | null) => void) {
    setter(null);
    setPreview(null);
  }

  async function confirmar() {
    if (!online) {
      toast.error("Sem conexão com o servidor. Verifique sua internet para registrar o abastecimento.");
      return;
    }
    if (!veiculo) return;
    if (!podeConfirmar) {
      toast.error("Preencha os campos obrigatórios e as fotos para confirmar.");
      return;
    }
    if (kmMenorQueUltimo) {
      toast.error("O KM informado é menor que o último registro.");
      return;
    }
    setEnviando(true);
    // Idempotência real: mesma chave é reutilizada em reenvios (evita duplicar).
    if (!idempotencyKey) setIdempotencyKey(novoIdempotencyKey());
    try {
      await driverApi.abastecer({
        veiculo_id: veiculoId,
        tanque_id: tanqueEfetivo || null,
        combustivel_id: combustivelEfetivo || undefined,
        quantidade_litros: litros.replace(",", "."),
        quilometragem: veiculo.usa_horimetro ? 0 : Math.round(valorMedicao || 0),
        horimetro: veiculo.usa_horimetro ? medicao.replace(",", ".") : undefined,
        completou_tanque: completouTanque,
        foto_bomba_url: fotoBomba,
        foto_painel_url: fotoPainel,
        idempotency_key: idempotencyKey,
      });
      setConcluido(veiculo);
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível registrar o abastecimento. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  // ── Sucesso ───────────────────────────────────────────────────────────────
  if (concluido) {
    return (
      <main
        className="flex min-h-screen flex-col items-center justify-center bg-[#F8F9FF] p-6 text-center"
        style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-[480px] flex-col items-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[#9DF6B3] text-[#106D34]">
            <Check size={44} />
          </div>
          <h1 className="text-2xl font-bold text-[#181C22]">Abastecimento registrado!</h1>
          <div className="mt-4 w-full rounded-2xl border border-[#C3C6D1]/30 bg-white p-5 shadow-card">
            <div className="flex items-center justify-center gap-3">
              <div className="font-mono text-xl font-bold text-[#1D5BD6]">{concluido.placa}</div>
              <div className="text-sm text-[#424750]">
                {[concluido.marca, concluido.modelo].filter(Boolean).join(" ")}
              </div>
            </div>
            <div className="mt-3 text-3xl font-bold text-[#181C22]">
              {Number(litros.replace(",", ".")).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L
            </div>
            <div className="text-sm text-[#737781]">
              {concluido.usa_horimetro
                ? `${Number(medicao.replace(",", ".")).toLocaleString("pt-BR")} h`
                : `${Math.round(valorMedicao || 0).toLocaleString("pt-BR")} km`}
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
              setLitros("");
              setMedicao("");
              setCompletouTanque(null);
              setFotoBomba(null);
              setFotoBombaPreview(null);
              setFotoPainel(null);
              setFotoPainelPreview(null);
              setIdempotencyKey("");
            }}
            className="mt-3 w-full rounded-xl border border-[#C3C6D1] bg-white py-4 text-lg font-medium text-[#1D5BD6]"
          >
            Novo abastecimento
          </button>
        </div>
      </main>
    );
  }

  // ── Offline ───────────────────────────────────────────────────────────────
  if (!online) {
    return (
      <main
        className="flex min-h-screen flex-col items-center justify-center bg-[#F8F9FF] p-6 text-center"
        style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#FFDD9A] text-[#805600]">
          <WifiOff size={32} />
        </div>
        <h1 className="text-2xl font-bold text-[#181C22]">Sem conexão</h1>
        <p className="mt-2 text-sm text-[#424750]">Conecte-se à internet para registrar o abastecimento.</p>
        <button
          onClick={() => setOnline(navigator.onLine)}
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
        <header className="mb-6 flex items-center justify-between">
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

            {/* Combustível */}
            <div>
              <span className="mb-2 block text-sm font-medium text-[#424750]">Combustível</span>
              {combustiveisVeiculo.length <= 1 ? (
                <div className="rounded-xl border border-[#C3C6D1]/30 bg-white px-4 py-3 text-lg font-semibold text-[#181C22]">
                  {combustiveisVeiculo[0]?.nome ?? "—"}
                </div>
              ) : (
                <div className="grid gap-2">
                  {combustiveisVeiculo.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCombustivelId(c.id);
                        setTanqueId("");
                      }}
                      className={`rounded-xl px-4 py-3 text-lg font-medium ${
                        combustivelEfetivo === c.id
                          ? "bg-[#1D5BD6] text-white"
                          : "border border-[#C3C6D1] bg-white text-[#181C22]"
                      }`}
                    >
                      {c.nome}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tanque */}
            <div>
              <span className="mb-2 block text-sm font-medium text-[#424750]">
                {tanquesCompativeis.length > 1 ? "Selecione o tanque" : "Abastecendo pelo"}
              </span>
              {tanquesCompativeis.length <= 1 ? (
                <div className="rounded-xl border border-[#C3C6D1]/30 bg-white px-4 py-3 text-lg font-semibold text-[#181C22]">
                  {tanquesCompativeis[0]?.nome ?? "—"}
                </div>
              ) : (
                <div className="grid gap-2">
                  {tanquesCompativeis.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTanqueId(t.id)}
                      className={`rounded-xl px-4 py-3 text-lg font-medium ${
                        tanqueEfetivo === t.id
                          ? "bg-[#1D5BD6] text-white"
                          : "border border-[#C3C6D1] bg-white text-[#181C22]"
                      }`}
                    >
                      {t.nome}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Litros */}
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[#424750]">Litros abastecidos</span>
              <input
                inputMode="decimal"
                placeholder="0,00"
                value={litros}
                onChange={(e) => setLitros(e.target.value)}
                className="w-full rounded-xl border border-[#C3C6D1] bg-white px-4 py-5 text-3xl font-semibold outline-none focus:border-[#1D5BD6]"
              />
            </label>

            {/* KM / Horímetro */}
            <div>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-[#424750]">
                  {veiculo.usa_horimetro ? "Horímetro atual" : "KM atual do veículo"}
                </span>
                <input
                  inputMode="decimal"
                  placeholder="0"
                  value={medicao}
                  onChange={(e) => setMedicao(e.target.value.replace(/[^\d.,]/g, ""))}
                  className="w-full rounded-xl border border-[#C3C6D1] bg-white px-4 py-5 text-3xl font-semibold outline-none focus:border-[#1D5BD6]"
                />
              </label>
              {veiculo.usa_horimetro ? (
                ultimoHorimetro != null && (
                  <p className="mt-1 text-xs text-[#737781]">
                    Último horímetro registrado: {ultimoHorimetro.toLocaleString("pt-BR")} h
                  </p>
                )
              ) : (
                <p className="mt-1 text-xs text-[#737781]">
                  Último KM registrado: {ultimoKm.toLocaleString("pt-BR")} km
                </p>
              )}
              {kmMenorQueUltimo && (
                <p className="mt-1 text-sm font-medium text-[#BA1A1A]">
                  O KM informado é menor que o último registro: {ultimoKm.toLocaleString("pt-BR")} km.
                </p>
              )}
            </div>

            {/* Tanque cheio */}
            <div>
              <span className="mb-2 block text-sm font-medium text-[#424750]">Completou o tanque?</span>
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
                obrigatoria={fotoKmObrigatoria}
                preview={fotoPainelPreview}
                aoTirar={(e) => tirarFoto(e, setFotoPainel, setFotoPainelPreview)}
                aoLimpar={() => limparFoto(setFotoPainel, setFotoPainelPreview)}
                online={online}
              />
              <CampoFoto
                rotulo="Foto da bomba"
                obrigatoria={fotoBombaObrigatoria}
                preview={fotoBombaPreview}
                aoTirar={(e) => tirarFoto(e, setFotoBomba, setFotoBombaPreview)}
                aoLimpar={() => limparFoto(setFotoBomba, setFotoBombaPreview)}
                online={online}
              />
            </div>

            <button
              onClick={() => setPasso(3)}
              className="w-full rounded-xl bg-[#1D5BD6] py-5 text-xl font-bold text-white disabled:opacity-50"
            >
              CONFERIR ABASTECIMENTO
            </button>

            {fotosFaltando && (
              <p className="text-center text-sm text-[#805600]">
                Preencha os campos e as fotos obrigatórias para continuar.
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
              <LinhaResumo rotulo="Combustível" valor={combustiveisVeiculo.find((c) => c.id === combustivelEfetivo)?.nome ?? "—"} />
              <LinhaResumo rotulo="Tanque" valor={tanquesCompativeis.find((t) => t.id === tanqueEfetivo)?.nome ?? "—"} />
              <LinhaResumo rotulo="Quantidade" valor={`${Number(litros.replace(",", ".")).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L`} />
              <LinhaResumo
                rotulo={veiculo.usa_horimetro ? "Horímetro" : "KM"}
                valor={
                  veiculo.usa_horimetro
                    ? `${Number(medicao.replace(",", ".")).toLocaleString("pt-BR")} h`
                    : `${Math.round(valorMedicao || 0).toLocaleString("pt-BR")} km`
                }
              />
              <LinhaResumo rotulo="Tanque cheio" valor={completouTanque === null ? "—" : completouTanque ? "Sim" : "Não"} />
              <LinhaResumo rotulo="Foto da bomba" valor={fotoBomba ? "✓" : "—"} />
              <LinhaResumo rotulo="Foto do painel" valor={fotoPainel ? "✓" : "—"} />
            </div>

            <button
              disabled={!podeConfirmar || enviando}
              onClick={confirmar}
              className="w-full rounded-xl bg-[#1D5BD6] py-5 text-xl font-bold text-white disabled:opacity-50"
            >
              {enviando ? "REGISTRANDO ABASTECIMENTO…" : "CONFIRMAR ABASTECIMENTO"}
            </button>
            {enviando && <p className="text-center text-sm text-[#737781]">Registrando abastecimento…</p>}
            {!podeConfirmar && !enviando && (
              <p className="text-center text-sm text-[#805600]">
                Confira os campos obrigatórios e as fotos marcadas com * para confirmar.
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function LinhaResumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[#C3C6D1]/20 py-2 last:border-0">
      <span className="text-sm text-[#737781]">{rotulo}</span>
      <span className="text-sm font-semibold text-[#181C22]">{valor}</span>
    </div>
  );
}

function CampoFoto({
  rotulo,
  obrigatoria,
  preview,
  aoTirar,
  aoLimpar,
  online,
}: {
  rotulo: string;
  obrigatoria: boolean;
  preview: string | null;
  aoTirar: (e: React.ChangeEvent<HTMLInputElement>) => void;
  aoLimpar: () => void;
  online: boolean;
}) {
  return (
    <div className="rounded-xl border-2 border-dashed border-[#C3C6D1] bg-white p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium text-[#424750]">{rotulo}</span>
        <span className={`text-xs font-semibold ${obrigatoria ? "text-[#BA1A1A]" : "text-[#737781]"}`}>
          {obrigatoria ? "* Obrigatória" : "Opcional"}
        </span>
      </div>
      {preview ? (
        <div className="space-y-2">
          <img src={preview} alt={`Preview ${rotulo}`} className="h-40 w-full rounded-lg object-cover" />
          <button
            type="button"
            onClick={aoLimpar}
            className="flex w-full items-center justify-center gap-1 rounded-lg border border-[#C3C6D1] py-2 text-sm font-medium text-[#424750]"
          >
            <RefreshCw size={16} /> Tirar novamente
          </button>
        </div>
      ) : (
        <label
          className={`flex cursor-pointer items-center justify-center gap-2 py-4 text-lg font-medium ${
            online ? "text-[#424750]" : "pointer-events-none text-[#C3C6D1]"
          }`}
        >
          <Camera size={24} /> Tirar foto
          <input type="file" accept="image/*" capture="environment" hidden onChange={aoTirar} />
        </label>
      )}
    </div>
  );
}
