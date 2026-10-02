"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { AlertTriangle, Camera, Car, Check, Cog, Disc, Hammer, Lightbulb, Loader2, MoreHorizontal, OctagonAlert, RefreshCw, Send, X, Zap } from "lucide-react";
import { AuthError, driverApi, VeiculoApp } from "@/lib/api";
import { enviarOuGuardar, lerCache, novoId, salvarCache } from "@/lib/filaOffline";
import { useLocalizacao } from "@/lib/localizacao";
import { FotoMotorista } from "@/components/motorista/FotoMotorista";

const CATEGORIAS: { valor: string; rotulo: string; icone: typeof Disc }[] = [
  { valor: "PNEU", rotulo: "Pneu", icone: Disc },
  { valor: "FREIO", rotulo: "Freio", icone: OctagonAlert },
  { valor: "MOTOR", rotulo: "Motor", icone: Cog },
  { valor: "ELETRICO", rotulo: "Elétrica", icone: Zap },
  { valor: "PAINEL", rotulo: "Luz no painel", icone: Lightbulb },
  { valor: "AVARIA", rotulo: "Avaria", icone: Hammer },
  { valor: "ACIDENTE", rotulo: "Acidente", icone: Car },
  { valor: "OUTRO", rotulo: "Outro", icone: MoreHorizontal },
];

const GRAVIDADES: { valor: string; rotulo: string; texto: string; ativo: string; ponto: string }[] = [
  { valor: "BAIXA", rotulo: "Baixa", texto: "Dá para rodar", ativo: "bg-[#16A34A] text-white", ponto: "bg-[#16A34A]" },
  { valor: "MEDIA", rotulo: "Média", texto: "Precisa ver logo", ativo: "bg-[#2563EB] text-white", ponto: "bg-[#2563EB]" },
  { valor: "ALTA", rotulo: "Alta", texto: "Risco ao rodar", ativo: "bg-[#D97706] text-white", ponto: "bg-[#D97706]" },
  { valor: "CRITICA", rotulo: "Crítica", texto: "Veículo parado", ativo: "bg-[#DC2626] text-white", ponto: "bg-[#DC2626]" },
];

export default function ProblemaPage() {
  const router = useRouter();
  const [veiculos, setVeiculos] = useState<VeiculoApp[]>([]);
  const [veiculoId, setVeiculoId] = useState("");
  const [categoria, setCategoria] = useState("MECANICO");
  const [gravidade, setGravidade] = useState("MEDIA");
  const [descricao, setDescricao] = useState("");
  // A foto fica no celular e só sobe no envio — funciona sem internet.
  const [foto, setFoto] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState<{ guardado: boolean } | null>(null);
  const localizacao = useLocalizacao();

  useEffect(() => {
    driverApi
      .veiculos()
      .then((vs) => {
        setVeiculos(vs);
        salvarCache("veiculos", vs);
      })
      .catch((e) => {
        if (e instanceof AuthError) router.replace("/motorista/login?expirado=1");
        else setVeiculos(lerCache<VeiculoApp[]>("veiculos") ?? []);
      });
  }, [router]);

  const veiculo = veiculos.find((v) => v.id === veiculoId);

  async function tirarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFotoPreview(URL.createObjectURL(file));
    setFoto(file);
  }

  async function enviar() {
    if (!veiculoId || descricao.trim().length < 3) {
      toast.error("Selecione o veículo e descreva o problema.");
      return;
    }
    setEnviando(true);
    const id = novoId();
    try {
      const r = await enviarOuGuardar({
        chave: id,
        tipo: "problema",
        registrado_em: new Date().toISOString(),
        dados: { id, veiculo_id: veiculoId, categoria, gravidade, descricao, ...localizacao() },
        foto,
        resumo: `Problema · ${veiculo?.placa ?? ""}`,
      });
      setConcluido({ guardado: r === null });
    } catch (e) {
      if (e instanceof AuthError) router.replace("/motorista/login?expirado=1");
      else toast.error((e as Error).message || "Não foi possível registrar o problema. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  const ESTILO = `
    @keyframes ip-sobe { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
    @keyframes ip-pop { 0% { transform: scale(.5); opacity: 0; } 70% { transform: scale(1.08); } 100% { transform: none; opacity: 1; } }
    .ip-sobe { animation: ip-sobe .4s cubic-bezier(.2,.8,.2,1) both; }
    .ip-pop { animation: ip-pop .5s cubic-bezier(.2,.8,.2,1) both; }
    @media (prefers-reduced-motion: reduce) { .ip-sobe, .ip-pop { animation: none !important; } }
  `;
  const prontoParaEnviar = !!veiculoId && descricao.trim().length >= 3;

  if (concluido) {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#F1F4FA] p-6 text-center text-[#0F172A]"
        style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)" }}>
        <style>{ESTILO}</style>
        <div className="ip-pop mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[#34D399] to-[#059669] text-white shadow-[0_18px_36px_-14px_rgba(5,150,105,.7)]">
          <Check size={50} />
        </div>
        <h1 className="ip-sobe text-[24px] font-bold">{concluido.guardado ? "Guardado no celular" : "Problema informado!"}</h1>
        <p className="ip-sobe mt-2 max-w-xs text-[15px] text-[#475569]" style={{ animationDelay: ".08s" }}>
          {concluido.guardado
            ? "Sem internet agora. O aviso será enviado sozinho quando o sinal voltar."
            : `A equipe de frota já foi avisada e vai avaliar o ocorrido${veiculo ? ` com o ${veiculo.placa}` : ""}.`}
        </p>
        <button
          onClick={() => router.replace("/motorista")}
          className="ip-sobe mt-8 h-14 w-full max-w-[480px] rounded-2xl bg-gradient-to-r from-[#1D5BD6] to-[#153B8F] text-[18px] font-bold text-white shadow-[0_12px_24px_-10px_rgba(29,91,214,.7)] active:scale-[.98]"
          style={{ animationDelay: ".14s" }}
        >
          Voltar ao início
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-[#F1F4FA] text-[#0F172A]">
      <style>{ESTILO}</style>
      <header className="sticky top-0 z-20 bg-gradient-to-br from-[#D97706] to-[#B45309] px-5 pb-4 text-white shadow-lg"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + .75rem)" }}>
        <div className="mx-auto flex max-w-[480px] items-center gap-2">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20"><AlertTriangle size={22} /></span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[20px] font-bold leading-tight">Informar problema</h1>
            <p className="text-[13px] text-white/80">Avise a frota sobre pane, avaria ou acidente</p>
          </div>
          <Link href="/motorista" aria-label="Cancelar" className="flex h-11 items-center gap-1 rounded-2xl px-3 text-[15px] font-medium text-white/90 active:bg-white/15">
            <X size={18} /> Cancelar
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-[480px] space-y-4 px-5 pt-5" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 7rem)" }}>
        {/* Veículo */}
        <section className="ip-sobe rounded-3xl bg-white p-4 ring-1 ring-[#E2E8F0]">
          <span className="mb-2 block text-[15px] font-semibold">1. Qual veículo?</span>
          {veiculo ? (
            <div className="flex items-center gap-4 rounded-2xl bg-[#F1F5FF] p-3">
              <FotoMotorista src={veiculo.foto_url} className="h-14 w-16 flex-shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1">
                <span className="inline-block rounded-md border-2 border-[#0F172A] bg-white px-2 font-mono text-[16px] font-bold leading-6">{veiculo.placa}</span>
                <div className="mt-0.5 truncate text-[14px] text-[#475569]">
                  {[veiculo.marca, veiculo.modelo].filter(Boolean).join(" ") || "—"}
                </div>
              </div>
              <button onClick={() => setVeiculoId("")} className="shrink-0 rounded-xl px-2 py-2 text-[14px] font-medium text-[#1D5BD6] active:bg-white">Trocar</button>
            </div>
          ) : (
            <div className="space-y-2">
              {veiculos.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setVeiculoId(v.id)}
                  className="flex w-full items-center gap-4 rounded-2xl bg-[#F8FAFC] p-3 text-left ring-2 ring-[#E2E8F0] transition active:scale-[.98] active:bg-[#EFF4FF]"
                >
                  <FotoMotorista src={v.foto_url} className="h-14 w-16 flex-shrink-0 rounded-xl" />
                  <div className="min-w-0">
                    <span className="inline-block rounded-md border-2 border-[#0F172A] bg-white px-2 font-mono text-[16px] font-bold leading-6">{v.placa}</span>
                    <div className="mt-0.5 truncate text-[14px] text-[#475569]">
                      {[v.marca, v.modelo].filter(Boolean).join(" ") || "—"}
                    </div>
                  </div>
                </button>
              ))}
              {veiculos.length === 0 && (
                <div className="rounded-2xl bg-[#F8FAFC] px-4 py-8 text-center text-[14px] text-[#64748B]">
                  Nenhum veículo disponível.
                </div>
              )}
            </div>
          )}
        </section>

        {/* Categoria */}
        <section className="ip-sobe rounded-3xl bg-white p-4 ring-1 ring-[#E2E8F0]" style={{ animationDelay: ".05s" }}>
          <span className="mb-2 block text-[15px] font-semibold">2. O que aconteceu?</span>
          <div className="grid grid-cols-4 gap-2">
            {CATEGORIAS.map((c) => {
              const ativo = categoria === c.valor;
              return (
                <button
                  key={c.valor}
                  type="button"
                  onClick={() => setCategoria(c.valor)}
                  aria-pressed={ativo}
                  className={`flex min-h-[78px] flex-col items-center justify-center gap-1.5 rounded-2xl px-1 py-2 text-[12px] font-semibold leading-tight transition active:scale-95 ${
                    ativo ? "bg-[#1D5BD6] text-white shadow-md" : "bg-[#F8FAFC] text-[#334155] ring-2 ring-[#E2E8F0]"
                  }`}
                >
                  <c.icone size={22} />
                  {c.rotulo}
                </button>
              );
            })}
          </div>
        </section>

        {/* Gravidade */}
        <section className="ip-sobe rounded-3xl bg-white p-4 ring-1 ring-[#E2E8F0]" style={{ animationDelay: ".1s" }}>
          <span className="mb-2 block text-[15px] font-semibold">3. Qual a gravidade?</span>
          <div className="grid grid-cols-2 gap-2">
            {GRAVIDADES.map((g) => {
              const ativo = gravidade === g.valor;
              return (
                <button
                  key={g.valor}
                  type="button"
                  onClick={() => setGravidade(g.valor)}
                  aria-pressed={ativo}
                  className={`flex items-center gap-2.5 rounded-2xl px-3 py-3 text-left transition active:scale-95 ${
                    ativo ? `${g.ativo} shadow-md` : "bg-[#F8FAFC] ring-2 ring-[#E2E8F0]"
                  }`}
                >
                  <span className={`h-3 w-3 shrink-0 rounded-full ${ativo ? "bg-white" : g.ponto}`} />
                  <span className="min-w-0">
                    <span className="block text-[15px] font-bold leading-tight">{g.rotulo}</span>
                    <span className={`block text-[12px] ${ativo ? "text-white/85" : "text-[#64748B]"}`}>{g.texto}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Descrição e foto */}
        <section className="ip-sobe space-y-3 rounded-3xl bg-white p-4 ring-1 ring-[#E2E8F0]" style={{ animationDelay: ".15s" }}>
          <label className="block">
            <span className="mb-2 block text-[15px] font-semibold">4. Descreva o problema</span>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={4}
              placeholder="Ex.: barulho na roda dianteira esquerda ao frear…"
              className="w-full rounded-2xl border-2 border-[#E2E8F0] bg-white px-4 py-3 text-[17px] outline-none transition focus:border-[#1D5BD6]"
            />
          </label>

          {fotoPreview ? (
            <div className="overflow-hidden rounded-2xl ring-1 ring-[#E2E8F0]">
              <div className="relative">
                <img src={fotoPreview} alt="Foto do problema" className="h-44 w-full object-cover" />
                {foto && <span className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-[#16A34A] text-white shadow"><Check size={16} /></span>}
              </div>
              <button
                type="button"
                onClick={() => {
                  setFoto(null);
                  setFotoPreview(null);
                }}
                className="flex h-11 w-full items-center justify-center gap-1.5 bg-[#F1F5F9] text-[14px] font-medium text-[#475569] active:bg-[#E2E8F0]"
              >
                <RefreshCw size={16} /> Tirar de novo
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center gap-4 rounded-2xl border-2 border-dashed border-[#CBD5E1] p-4 active:bg-[#F8FAFF]">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#E5EEFF] text-[#1D5BD6]"><Camera size={24} /></span>
              <span>
                <span className="block text-[15px] font-semibold">Tirar foto do problema</span>
                <span className="block text-[13px] text-[#64748B]">Opcional, mas ajuda muito a equipe</span>
              </span>
              <input type="file" accept="image/*" capture="environment" hidden onChange={tirarFoto} />
            </label>
          )}
        </section>
      </div>

      {/* Botão fixo no rodapé */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[#E2E8F0] bg-white/95 px-5 pt-3 backdrop-blur"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + .75rem)" }}>
        <div className="mx-auto max-w-[480px]">
          {!prontoParaEnviar && (
            <p className="mb-2 text-center text-[13px] font-medium text-[#64748B]">
              {!veiculoId ? "Escolha o veículo." : "Descreva o problema para enviar."}
            </p>
          )}
          <button
            onClick={enviar}
            disabled={enviando || !prontoParaEnviar}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#D97706] to-[#B45309] text-[18px] font-bold text-white shadow-[0_12px_24px_-10px_rgba(217,119,6,.7)] transition active:scale-[.98] disabled:opacity-45 disabled:shadow-none"
          >
            {enviando ? <><Loader2 size={20} className="animate-spin" /> Enviando…</> : <><Send size={20} /> Enviar para a frota</>}
          </button>
        </div>
      </div>
    </main>
  );
}
