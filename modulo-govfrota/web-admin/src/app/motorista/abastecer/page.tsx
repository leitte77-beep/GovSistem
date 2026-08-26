"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Camera, Check, WifiOff, RefreshCw } from "lucide-react";
import { driverApi } from "@/lib/api";

interface VeiculoApp {
  id: string;
  placa: string;
  modelo: string | null;
  marca: string | null;
  usa_horimetro: boolean;
  combustivel_principal_id: string | null;
}

function novoIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function AbastecerPage() {
  const router = useRouter();
  const [passo, setPasso] = useState(1);
  const [veiculos, setVeiculos] = useState<VeiculoApp[]>([]);
  const [tanques, setTanques] = useState<{ id: string; nome: string; combustivel_id: string }[]>([]);
  const [tanqueId, setTanqueId] = useState("");
  const [veiculoId, setVeiculoId] = useState("");
  const [buscaPlaca, setBuscaPlaca] = useState("");
  const [litros, setLitros] = useState("");
  const [medicao, setMedicao] = useState("");
  const [completouTanque, setCompletouTanque] = useState<boolean | null>(null);
  const [fotoBomba, setFotoBomba] = useState<string | null>(null);
  const [fotoBombaPreview, setFotoBombaPreview] = useState<string | null>(null);
  const [fotoPainel, setFotoPainel] = useState<string | null>(null);
  const [fotoPainelPreview, setFotoPainelPreview] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState(false);
  const [online, setOnline] = useState(true);

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
    Promise.all([driverApi.me(), driverApi.veiculos(), driverApi.tanques()])
      .then(([, vs, ts]) => {
        setVeiculos(vs);
        setTanques(ts);
      })
      .catch(() => router.replace("/motorista/login"));
  }, [router]);

  const veiculosFiltrados = veiculos.filter(
    (v) => v.placa.toLowerCase().includes(buscaPlaca.replace("-", "").toLowerCase())
  );

  // Tanques compatíveis com o combustível do veículo
  const tanquesCompativeis = veiculo?.combustivel_principal_id
    ? tanques.filter((t) => t.combustivel_id === veiculo.combustivel_principal_id)
    : tanques;
  const tanqueAuto =
    veiculo?.combustivel_principal_id && tanquesCompativeis.length === 1 ? tanquesCompativeis[0].id : "";
  const tanqueSelecionado = tanqueAuto || tanqueId;

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
    } catch (e) {
      setPreview(null);
      toast.error((e as Error).message, { id: "foto" });
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
    setEnviando(true);
    // Idempotência real: mesma operação reenviada não duplica no servidor.
    const idempotency_key = novoIdempotencyKey();
    try {
      await driverApi.abastecer({
        veiculo_id: veiculoId,
        tanque_id: tanqueSelecionado || null,
        quantidade_litros: litros.replace(",", "."),
        quilometragem: Number(medicao),
        completou_tanque: completouTanque,
        foto_bomba_url: fotoBomba,
        foto_painel_url: fotoPainel,
        idempotency_key,
      });
      setConcluido(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  if (concluido) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#F6F7F9] p-6 text-center">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-[#067647]">
          <Check size={44} />
        </div>
        <h1 className="text-2xl font-semibold text-text-title">Abastecimento registrado com sucesso.</h1>
        <div className="mt-8 w-full max-w-xs space-y-3">
          <button onClick={() => router.push("/motorista")} className="w-full rounded-xl bg-[#1D4ED8] py-4 text-lg font-semibold text-white">
            VOLTAR AO INÍCIO
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F6F7F9] p-5">
      <div className="mx-auto max-w-md">
        {!online && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-[#B54708] bg-[#FFFAEB] p-4 text-[#B54708]">
            <WifiOff size={20} className="mt-0.5 shrink-0" />
            <p className="text-sm font-medium">
              Sem conexão com o servidor. Verifique sua internet para registrar o abastecimento.
            </p>
          </div>
        )}

        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-text-title">Novo abastecimento</h1>
          <Link href="/motorista" className="rounded-full px-4 py-2 text-body-sm text-text-body hover:bg-white">Cancelar</Link>
        </header>

        {/* Passo 1 — Veículo */}
        {passo === 1 && (
          <div className="space-y-3">
            <input
              placeholder="Buscar placa…"
              value={buscaPlaca}
              onChange={(e) => setBuscaPlaca(e.target.value)}
              className="w-full rounded-xl border border-surface-border bg-white px-4 py-3 text-lg outline-none focus:border-[#1D4ED8]"
            />
            <ul className="space-y-2">
              {veiculosFiltrados.map((v) => (
                <li key={v.id}>
                  <button
                    onClick={() => {
                      setVeiculoId(v.id);
                      setPasso(2);
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl bg-white p-4 text-left shadow-card active:bg-surface-bg ${
                      !v.combustivel_principal_id ? "" : ""
                    }`}
                  >
                    <div className="rounded-lg bg-blue-50 px-3 py-2 font-mono text-base font-bold text-[#1D4ED8]">{v.placa}</div>
                    <span className="text-body-sm text-text-body">{[v.marca, v.modelo].filter(Boolean).join(" ")}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Passo 2/3 — Litros + KM */}
        {passo === 2 && veiculo && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-card">
              <div className="rounded-lg bg-blue-50 px-3 py-1.5 font-mono font-bold text-[#1D4ED8]">{veiculo.placa}</div>
              <span className="text-body-sm text-text-subtle">{[veiculo.marca, veiculo.modelo].filter(Boolean).join(" ")}</span>
            </div>

            {tanquesCompativeis.length > 1 && (
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-text-body">De qual tanque?</span>
                <select
                  value={tanqueId}
                  onChange={(e) => setTanqueId(e.target.value)}
                  className="w-full rounded-xl border border-surface-border bg-white px-4 py-3 text-lg"
                >
                  <option value="">Selecione…</option>
                  {tanquesCompativeis.map((t) => (
                    <option key={t.id} value={t.id}>{t.nome}</option>
                  ))}
                </select>
              </label>
            )}

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-text-body">Litros abastecidos</span>
              <input
                inputMode="decimal"
                placeholder="0,00"
                value={litros}
                onChange={(e) => setLitros(e.target.value)}
                className="w-full rounded-xl border border-surface-border bg-white px-4 py-5 text-3xl font-semibold outline-none focus:border-[#1D4ED8]"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-text-body">
                {veiculo.usa_horimetro ? "Horímetro atual" : "KM atual do veículo"}
              </span>
              <input
                inputMode="numeric"
                placeholder="0"
                value={medicao}
                onChange={(e) => setMedicao(e.target.value.replace(/\D/g, ""))}
                className="w-full rounded-xl border border-surface-border bg-white px-4 py-5 text-3xl font-semibold outline-none focus:border-[#1D4ED8]"
              />
            </label>

            <div>
              <span className="mb-2 block text-sm font-medium text-text-body">Completou o tanque?</span>
              <div className="grid grid-cols-2 gap-3">
                {[true, false].map((val) => (
                  <button
                    key={String(val)}
                    type="button"
                    onClick={() => setCompletouTanque(completouTanque === val ? null : val)}
                    className={`rounded-xl py-4 text-lg font-medium transition-colors ${
                      completouTanque === val
                        ? val ? "bg-[#067647] text-white" : "bg-[#B54708] text-white"
                        : "border border-surface-border bg-white text-text-title"
                    }`}
                  >
                    {val ? "SIM" : "NÃO"}
                  </button>
                ))}
              </div>
            </div>

            {/* Fotos — abertura direta da câmera + preview + tirar novamente */}
            <div className="space-y-3">
              <div className="rounded-xl border-2 border-dashed border-surface-border bg-white p-3">
                {fotoBombaPreview ? (
                  <div className="space-y-2">
                    <img src={fotoBombaPreview} alt="Preview foto da bomba" className="h-40 w-full rounded-lg object-cover" />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => limparFoto(setFotoBomba, setFotoBombaPreview)}
                        className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-surface-border py-2 text-sm font-medium text-text-body">
                        <RefreshCw size={16} /> Tirar novamente
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center justify-center gap-2 py-4 text-lg font-medium text-text-body">
                    <Camera size={24} /> Foto da bomba
                    <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => tirarFoto(e, setFotoBomba, setFotoBombaPreview)} />
                  </label>
                )}
              </div>

              <div className="rounded-xl border-2 border-dashed border-surface-border bg-white p-3">
                {fotoPainelPreview ? (
                  <div className="space-y-2">
                    <img src={fotoPainelPreview} alt="Preview foto do painel" className="h-40 w-full rounded-lg object-cover" />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => limparFoto(setFotoPainel, setFotoPainelPreview)}
                        className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-surface-border py-2 text-sm font-medium text-text-body">
                        <RefreshCw size={16} /> Tirar novamente
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center justify-center gap-2 py-4 text-lg font-medium text-text-body">
                    <Camera size={24} /> Foto do painel / KM
                    <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => tirarFoto(e, setFotoPainel, setFotoPainelPreview)} />
                  </label>
                )}
              </div>
            </div>

            <button
              disabled={!litros || !medicao || enviando || !online}
              onClick={confirmar}
              className="w-full rounded-xl bg-[#1D4ED8] py-5 text-xl font-bold text-white disabled:opacity-50"
            >
              {enviando ? "REGISTRANDO ABASTECIMENTO…" : "CONFIRMAR ABASTECIMENTO"}
            </button>

            {enviando && (
              <p className="text-center text-meta text-text-subtle">Registrando abastecimento…</p>
            )}

            <p className="text-center text-meta text-text-subtle">
              Confira os dados antes de confirmar: {litros || "?"} L · {veiculo.usa_horimetro ? "Hr" : "KM"} {medicao || "?"}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
