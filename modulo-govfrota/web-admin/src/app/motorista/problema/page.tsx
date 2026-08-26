"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Camera, Send } from "lucide-react";
import { driverApi } from "@/lib/api";

export default function ProblemaPage() {
  const router = useRouter();
  const [veiculos, setVeiculos] = useState<{ id: string; placa: string }[]>([]);
  const [veiculoId, setVeiculoId] = useState("");
  const [categoria, setCategoria] = useState("MECANICO");
  const [gravidade, setGravidade] = useState("MEDIA");
  const [descricao, setDescricao] = useState("");
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    driverApi
      .veiculos()
      .then(setVeiculos)
      .catch(() => router.replace("/motorista/login"));
  }, [router]);

  async function tirarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    toast.loading("Enviando foto…", { id: "foto" });
    try {
      setFotoUrl(await driverApi.uploadFoto(file));
      toast.success("Foto anexada.", { id: "foto" });
    } catch (err) {
      toast.error((err as Error).message, { id: "foto" });
    }
  }

  async function enviar() {
    if (!veiculoId || descricao.length < 3) {
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
      toast.success("Problema registrado com sucesso.");
      router.push("/motorista");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#F6F7F9] p-5">
      <div className="mx-auto max-w-md space-y-5">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-text-title">Informar problema</h1>
          <Link href="/motorista" className="rounded-full px-4 py-2 text-body-sm text-text-body hover:bg-white">Cancelar</Link>
        </header>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-text-body">Veículo</span>
          <select value={veiculoId} onChange={(e) => setVeiculoId(e.target.value)}
            className="w-full rounded-xl border border-surface-border bg-white px-4 py-4 text-lg outline-none focus:border-[#1D4ED8]">
            <option value="">Selecione…</option>
            {veiculos.map((v) => <option key={v.id} value={v.id}>{v.placa}</option>)}
          </select>
        </label>

        <div>
          <span className="mb-2 block text-sm font-medium text-text-body">Tipo do problema</span>
          <div className="grid grid-cols-3 gap-2">
            {["MECANICO", "PNEU", "FREIO", "ELETRICO", "AVARIA", "OUTRO"].map((c) => (
              <button key={c} type="button" onClick={() => setCategoria(c)}
                className={`rounded-xl py-3 text-sm font-medium ${
                  categoria === c ? "bg-[#1D4ED8] text-white" : "border border-surface-border bg-white text-text-title"
                }`}>
                {c.charAt(0) + c.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="mb-2 block text-sm font-medium text-text-body">Gravidade</span>
          <div className="grid grid-cols-4 gap-2">
            {["BAIXA", "MEDIA", "ALTA", "CRITICA"].map((g) => (
              <button key={g} type="button" onClick={() => setGravidade(g)}
                className={`rounded-xl py-3 text-sm font-medium ${
                  gravidade === g
                    ? g === "CRITICA" || g === "ALTA"
                      ? "bg-[#B42318] text-white"
                      : "bg-[#1D4ED8] text-white"
                    : "border border-surface-border bg-white text-text-title"
                }`}>
                {g}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-text-body">Descreva o problema</span>
          <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={4}
            placeholder="Ex.: barulho na roda dianteira esquerda…"
            className="w-full rounded-xl border border-surface-border bg-white px-4 py-3 text-base outline-none focus:border-[#1D4ED8]" />
        </label>

        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-surface-border bg-white py-5 text-lg font-medium text-text-body">
          <Camera size={24} /> {fotoUrl ? "Foto anexada ✓" : "Tirar foto"}
          <input type="file" accept="image/*" capture="environment" hidden onChange={tirarFoto} />
        </label>

        <button onClick={enviar} disabled={enviando}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1D4ED8] py-5 text-xl font-bold text-white disabled:opacity-50">
          <Send size={22} /> {enviando ? "ENVIANDO…" : "ENVIAR"}
        </button>
      </div>
    </main>
  );
}
