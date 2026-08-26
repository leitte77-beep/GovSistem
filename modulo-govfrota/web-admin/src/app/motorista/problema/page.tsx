"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Camera, Check, RefreshCw, Send } from "lucide-react";
import { driverApi, VeiculoApp } from "@/lib/api";
import { FotoMotorista } from "@/components/motorista/FotoMotorista";

const CATEGORIAS = [
  { valor: "PNEU", rotulo: "Pneu" },
  { valor: "FREIO", rotulo: "Freio" },
  { valor: "MOTOR", rotulo: "Motor" },
  { valor: "ELETRICO", rotulo: "Elétrica" },
  { valor: "PAINEL", rotulo: "Luz no painel" },
  { valor: "AVARIA", rotulo: "Avaria" },
  { valor: "ACIDENTE", rotulo: "Acidente" },
  { valor: "OUTRO", rotulo: "Outro" },
];

const GRAVIDADES: { valor: string; rotulo: string; cor: string }[] = [
  { valor: "BAIXA", rotulo: "Baixa", cor: "bg-[#D9E2FF] text-[#1D5BD6]" },
  { valor: "MEDIA", rotulo: "Média", cor: "bg-[#D9E2FF] text-[#1D5BD6]" },
  { valor: "ALTA", rotulo: "Alta", cor: "bg-[#FFDD9A] text-[#805600]" },
  { valor: "CRITICA", rotulo: "Crítica", cor: "bg-[#FFDAD6] text-[#BA1A1A]" },
];

export default function ProblemaPage() {
  const router = useRouter();
  const [veiculos, setVeiculos] = useState<VeiculoApp[]>([]);
  const [veiculoId, setVeiculoId] = useState("");
  const [categoria, setCategoria] = useState("MECANICO");
  const [gravidade, setGravidade] = useState("MEDIA");
  const [descricao, setDescricao] = useState("");
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState(false);

  useEffect(() => {
    driverApi
      .veiculos()
      .then(setVeiculos)
      .catch(() => router.replace("/motorista/login?expirado=1"));
  }, [router]);

  const veiculo = veiculos.find((v) => v.id === veiculoId);

  async function tirarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFotoPreview(URL.createObjectURL(file));
    toast.loading("Enviando foto…", { id: "foto" });
    try {
      setFotoUrl(await driverApi.uploadFoto(file));
      toast.success("Foto anexada.", { id: "foto" });
    } catch {
      setFotoPreview(null);
      toast.error("Não foi possível enviar a foto. Tente novamente.", { id: "foto" });
    }
  }

  async function enviar() {
    if (!veiculoId || descricao.trim().length < 3) {
      toast.error("Selecione o veículo e descreva o problema.");
      return;
    }
    setEnviando(true);
    try {
      await driverApi.informarProblema({
        veiculo_id: veiculoId,
        categoria,
        gravidade,
        descricao,
        foto_url: fotoUrl,
      });
      setConcluido(true);
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível registrar o problema. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  if (concluido) {
    return (
      <main
        className="flex min-h-screen flex-col items-center justify-center bg-[#F8F9FF] p-6 text-center"
        style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[#9DF6B3] text-[#106D34]">
          <Check size={44} />
        </div>
        <h1 className="text-2xl font-bold text-[#181C22]">Problema informado com sucesso.</h1>
        <p className="mt-2 text-sm text-[#424750]">A equipe já foi avisada e irá avaliar o ocorrido.</p>
        <button
          onClick={() => router.replace("/motorista")}
          className="mt-8 w-full max-w-[480px] rounded-xl bg-[#1D5BD6] py-4 text-lg font-bold text-white active:bg-[#1E40AF]"
        >
          VOLTAR AO INÍCIO
        </button>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen bg-[#F8F9FF] p-5"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 1.25rem)", paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
    >
      <div className="mx-auto max-w-[480px] space-y-5">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-[#181C22]">Informar problema</h1>
          <Link href="/motorista" className="rounded-full px-4 py-2 text-sm text-[#424750] hover:bg-white">Cancelar</Link>
        </header>

        {/* Veículo */}
        <div>
          <span className="mb-2 block text-sm font-medium text-[#424750]">Veículo</span>
          {veiculo ? (
            <div className="flex items-center gap-3 rounded-xl border border-[#C3C6D1]/30 bg-white p-3 shadow-card">
              <FotoMotorista src={veiculo.foto_url} className="h-14 w-16 flex-shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1">
                <div className="font-mono text-lg font-bold text-[#1D5BD6]">{veiculo.placa}</div>
                <div className="truncate text-sm text-[#424750]">
                  {[veiculo.marca, veiculo.modelo].filter(Boolean).join(" ") || "—"}
                </div>
              </div>
              <button onClick={() => setVeiculoId("")} className="text-sm text-[#1D5BD6] hover:underline">Trocar</button>
            </div>
          ) : (
            <div className="space-y-2">
              {veiculos.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setVeiculoId(v.id)}
                  className="flex w-full items-center gap-3 rounded-xl border border-[#C3C6D1]/30 bg-white p-3 text-left shadow-card active:bg-[#EFF4FF]"
                >
                  <FotoMotorista src={v.foto_url} className="h-14 w-16 flex-shrink-0 rounded-lg" />
                  <div>
                    <div className="font-mono text-lg font-bold text-[#1D5BD6]">{v.placa}</div>
                    <div className="truncate text-sm text-[#424750]">
                      {[v.marca, v.modelo].filter(Boolean).join(" ") || "—"}
                    </div>
                  </div>
                </button>
              ))}
              {veiculos.length === 0 && (
                <div className="rounded-xl border border-[#C3C6D1]/40 bg-white px-4 py-8 text-center text-sm text-[#737781]">
                  Nenhum veículo disponível.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Categoria */}
        <div>
          <span className="mb-2 block text-sm font-medium text-[#424750]">Tipo do problema</span>
          <div className="grid grid-cols-4 gap-2">
            {CATEGORIAS.map((c) => (
              <button
                key={c.valor}
                type="button"
                onClick={() => setCategoria(c.valor)}
                className={`rounded-xl px-2 py-3 text-sm font-medium ${
                  categoria === c.valor ? "bg-[#1D5BD6] text-white" : "border border-[#C3C6D1] bg-white text-[#181C22]"
                }`}
              >
                {c.rotulo}
              </button>
            ))}
          </div>
        </div>

        {/* Gravidade */}
        <div>
          <span className="mb-2 block text-sm font-medium text-[#424750]">Gravidade</span>
          <div className="grid grid-cols-4 gap-2">
            {GRAVIDADES.map((g) => (
              <button
                key={g.valor}
                type="button"
                onClick={() => setGravidade(g.valor)}
                className={`rounded-xl px-2 py-3 text-sm font-medium ${
                  gravidade === g.valor ? g.cor + " ring-2 ring-[#1D5BD6]" : "border border-[#C3C6D1] bg-white text-[#181C22]"
                }`}
              >
                {g.rotulo}
              </button>
            ))}
          </div>
        </div>

        {/* Descrição */}
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-[#424750]">Descreva o problema</span>
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={4}
            placeholder="Ex.: barulho na roda dianteira esquerda…"
            className="w-full rounded-xl border border-[#C3C6D1] bg-white px-4 py-3 text-base outline-none focus:border-[#1D5BD6]"
          />
        </label>

        {/* Foto */}
        <div className="rounded-xl border-2 border-dashed border-[#C3C6D1] bg-white p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-medium text-[#424750]">Foto do problema</span>
            <span className="text-xs font-semibold text-[#737781]">Opcional</span>
          </div>
          {fotoPreview ? (
            <div className="space-y-2">
              <img src={fotoPreview} alt="Preview foto do problema" className="h-40 w-full rounded-lg object-cover" />
              <button
                type="button"
                onClick={() => {
                  setFotoUrl(null);
                  setFotoPreview(null);
                }}
                className="flex w-full items-center justify-center gap-1 rounded-lg border border-[#C3C6D1] py-2 text-sm font-medium text-[#424750]"
              >
                <RefreshCw size={16} /> Tirar novamente
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center justify-center gap-2 py-4 text-lg font-medium text-[#424750]">
              <Camera size={24} /> Tirar foto
              <input type="file" accept="image/*" capture="environment" hidden onChange={tirarFoto} />
            </label>
          )}
        </div>

        <button
          onClick={enviar}
          disabled={enviando || !veiculoId || descricao.trim().length < 3}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1D5BD6] py-5 text-xl font-bold text-white disabled:opacity-50"
        >
          <Send size={22} /> {enviando ? "ENVIANDO…" : "ENVIAR"}
        </button>
      </div>
    </main>
  );
}
