"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Camera, Check, Flag, Gauge, Loader2, MapPin, RefreshCw, Route, X } from "lucide-react";
import { AuthError, driverApi, UsoVeiculo, VeiculoApp } from "@/lib/api";
import { EnvioPendente, enviarOuGuardar, lerCache, novoId, salvarCache, usoAbertoComFila } from "@/lib/filaOffline";
import { useLocalizacao } from "@/lib/localizacao";
import { FotoMotorista } from "@/components/motorista/FotoMotorista";

const ESTILO = `
  @keyframes uv-sobe { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
  @keyframes uv-pop { 0% { transform: scale(.5); opacity: 0; } 70% { transform: scale(1.08); } 100% { transform: none; opacity: 1; } }
  .uv-sobe { animation: uv-sobe .4s cubic-bezier(.2,.8,.2,1) both; }
  .uv-pop { animation: uv-pop .5s cubic-bezier(.2,.8,.2,1) both; }
  @media (prefers-reduced-motion: reduce) { .uv-sobe, .uv-pop { animation: none !important; } }
`;

function hora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function medicao(v: number, horimetro: boolean) {
  return horimetro
    ? `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`
    : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} km`;
}

function duracao(min: number) {
  const h = Math.floor(min / 60);
  return h ? `${h} h ${min % 60} min` : `${min} min`;
}

/** Foto do painel tirada na hora (câmera traseira). Fica no celular e só
 *  sobe junto com o registro — assim funciona sem internet. */
function FotoPainel({ rotulo, foto, onFoto }: { rotulo: string; foto: File | null; onFoto: (f: File | null) => void }) {
  const [preview, setPreview] = useState<string | null>(null);

  function tirar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    onFoto(file);
  }

  return preview ? (
    <div className="relative overflow-hidden rounded-2xl ring-1 ring-[#E2E8F0]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preview} alt={rotulo} className="h-48 w-full object-cover" />
      <span className={`absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-white shadow ${foto ? "bg-[#16A34A]" : "bg-[#64748B]"}`}>
        {foto ? <Check size={17} /> : <X size={17} />}
      </span>
      <label className="absolute bottom-2 right-2 inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-xl bg-white/95 px-3 text-[14px] font-semibold text-[#1D5BD6] shadow">
        <RefreshCw size={15} /> Tirar outra
        <input type="file" accept="image/*" capture="environment" hidden onChange={tirar} />
      </label>
    </div>
  ) : (
    <label className="flex cursor-pointer items-center gap-4 rounded-2xl border-2 border-dashed border-[#93B4F5] bg-[#F5F8FF] p-4 active:bg-[#E5EEFF]">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#E5EEFF] text-[#1D5BD6]"><Camera size={24} /></span>
      <span>
        <span className="block text-[15px] font-semibold">{rotulo}</span>
        <span className="block text-[13px] text-[#64748B]">O número do painel precisa aparecer na foto</span>
      </span>
      <input type="file" accept="image/*" capture="environment" hidden onChange={tirar} />
    </label>
  );
}

export default function UsoVeiculoPage() {
  const router = useRouter();
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState<UsoVeiculo | null>(null);
  const [veiculos, setVeiculos] = useState<VeiculoApp[]>([]);
  const [veiculoId, setVeiculoId] = useState("");
  const [finalidade, setFinalidade] = useState("");
  const [destino, setDestino] = useState("");
  const [valor, setValor] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const localizacao = useLocalizacao();
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState<{ titulo: string; texto: string; avisos: string[] } | null>(null);

  useEffect(() => {
    (async () => {
      // Sem sinal, o uso em aberto e os veículos vêm do que ficou no celular;
      // com sinal, a fila ainda pode ter saída/chegada que o servidor não viu.
      let servidor: UsoVeiculo | null | undefined;
      let v: VeiculoApp[];
      try {
        [servidor, v] = await Promise.all([driverApi.usoAtual(), driverApi.veiculos()]);
        salvarCache("veiculos", v);
      } catch (e) {
        if (e instanceof AuthError) {
          router.replace("/motorista/login?expirado=1");
          return null;
        }
        servidor = undefined;
        v = lerCache<VeiculoApp[]>("veiculos") ?? [];
      }
      return [await usoAbertoComFila(servidor), v] as const;
    })()
      .then((r) => {
        if (!r) return;
        const [u, v] = r;
        setAberto(u);
        setVeiculos(v);
        // Um veículo só: já vem escolhido, com o último km.
        if (!u && v.length === 1) {
          setVeiculoId(v[0].id);
          const atual = v[0].usa_horimetro ? Number(v[0].horimetro_atual || 0) : v[0].quilometragem_atual;
          setValor(atual ? String(atual).replace(".", ",") : "");
        }
      })
      .finally(() => setCarregando(false));
  }, [router]);

  const veiculo = veiculos.find((v) => v.id === veiculoId);
  const horimetro = aberto ? aberto.usa_horimetro : !!veiculo?.usa_horimetro;
  const numero = Number(valor.replace(",", "."));
  const valorOk = valor.trim() !== "" && Number.isFinite(numero) && numero >= 0;

  function sugerir(v: VeiculoApp) {
    const atual = v.usa_horimetro ? Number(v.horimetro_atual || 0) : v.quilometragem_atual;
    setValor(atual ? String(atual).replace(".", ",") : "");
  }

  function escolher(v: VeiculoApp) {
    setVeiculoId(v.id);
    // Sugere a última medição conhecida e confirma com o servidor na hora —
    // a lista pode ter sido carregada antes da última chegada.
    sugerir(v);
    driverApi.veiculos(v.placa).then((lista) => {
      const novo = lista.find((x) => x.id === v.id);
      if (!novo) return;
      setVeiculos((vs) => vs.map((x) => (x.id === v.id ? novo : x)));
      sugerir(novo);
    }).catch(() => {});
  }

  async function enviarSaida() {
    if (!veiculoId || !veiculo || finalidade.trim().length < 3 || destino.trim().length < 2 || !valorOk || !foto) {
      toast.error("Preencha todos os campos e tire a foto do painel.");
      return;
    }
    setEnviando(true);
    const id = novoId();
    const agora = new Date().toISOString();
    const item: EnvioPendente = {
      chave: id,
      tipo: "uso_saida",
      registrado_em: agora,
      dados: { id, veiculo_id: veiculoId, finalidade, destino, medicao: numero, ...localizacao() },
      foto,
      resumo: `Saída · ${veiculo.placa}`,
    };
    try {
      const r = await enviarOuGuardar<UsoVeiculo & { avisos: string[] }>(item);
      // Guardado sem sinal: o uso em aberto fica só no celular até sincronizar.
      const uso: UsoVeiculo = r ?? {
        id, veiculo_id: veiculoId, veiculo_placa: veiculo.placa,
        veiculo_modelo: [veiculo.marca, veiculo.modelo].filter(Boolean).join(" ") || null,
        motorista_id: "", motorista_nome: null, unidade_id: null, unidade_nome: null,
        finalidade, destino, usa_horimetro: !!veiculo.usa_horimetro, saida_em: agora, medicao_saida: numero,
        foto_saida_url: null, chegada_em: null, medicao_chegada: null, foto_chegada_url: null, percorrido: null,
        duracao_min: 0, status: "EM_USO", origem: "APP_MOTORISTA", motivo_encerramento: null, alertas: [], atrasado: false,
      };
      salvarCache("uso_aberto", uso);
      setConcluido({
        titulo: r ? "Boa viagem!" : "Saída guardada no celular",
        texto: r
          ? `Saída do ${uso.veiculo_placa} registrada às ${hora(uso.saida_em).split(" ")[1]}. Ao voltar, registre a chegada.`
          : `Sem internet agora. A saída do ${uso.veiculo_placa} será enviada sozinha quando o sinal voltar. Ao voltar, registre a chegada normalmente.`,
        avisos: r?.avisos ?? [],
      });
    } catch (e) {
      if (e instanceof AuthError) router.replace("/motorista/login?expirado=1");
      else toast.error((e as Error).message || "Não foi possível registrar a saída.");
    } finally {
      setEnviando(false);
    }
  }

  async function enviarChegada() {
    if (!aberto || !valorOk || !foto) {
      toast.error(`Informe o ${horimetro ? "horímetro" : "km"} e tire a foto do painel.`);
      return;
    }
    setEnviando(true);
    const agora = new Date();
    try {
      const r = await enviarOuGuardar<UsoVeiculo>({
        chave: `chegada:${aberto.id}`,
        tipo: "uso_chegada",
        registrado_em: agora.toISOString(),
        dados: { uso_id: aberto.id, medicao: numero, ...localizacao() },
        foto,
        resumo: `Chegada · ${aberto.veiculo_placa ?? ""}`,
      });
      salvarCache("uso_aberto", null);
      const percorrido = r ? r.percorrido ?? 0 : Math.max(numero - aberto.medicao_saida, 0);
      const minutos = r ? r.duracao_min : Math.max(Math.round((agora.getTime() - new Date(aberto.saida_em).getTime()) / 60000), 0);
      setConcluido({
        titulo: r ? "Chegada registrada!" : "Chegada guardada no celular",
        texto: `${aberto.veiculo_placa}: ${medicao(percorrido, aberto.usa_horimetro)} em ${duracao(minutos)}.` +
          (r ? "" : " Será enviada sozinha quando o sinal voltar."),
        avisos: [],
      });
    } catch (e) {
      if (e instanceof AuthError) router.replace("/motorista/login?expirado=1");
      else toast.error((e as Error).message || "Não foi possível registrar a chegada.");
    } finally {
      setEnviando(false);
    }
  }

  if (concluido) {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#F1F4FA] p-6 text-center text-[#0F172A]"
        style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)" }}>
        <style>{ESTILO}</style>
        <div className="uv-pop mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[#34D399] to-[#059669] text-white shadow-[0_18px_36px_-14px_rgba(5,150,105,.7)]">
          <Check size={50} />
        </div>
        <h1 className="uv-sobe text-[24px] font-bold">{concluido.titulo}</h1>
        <p className="uv-sobe mt-2 max-w-xs text-[15px] text-[#475569]">{concluido.texto}</p>
        {concluido.avisos.map((a) => (
          <p key={a} className="uv-sobe mt-3 max-w-xs rounded-2xl bg-[#FFF8E6] px-4 py-3 text-[14px] text-[#5C4200] ring-1 ring-[#FCD98A]">{a}</p>
        ))}
        <button onClick={() => router.replace("/motorista")}
          className="uv-sobe mt-8 h-14 w-full max-w-[480px] rounded-2xl bg-gradient-to-r from-[#1D5BD6] to-[#153B8F] text-[18px] font-bold text-white shadow-[0_12px_24px_-10px_rgba(29,91,214,.7)] active:scale-[.98]">
          Voltar ao início
        </button>
      </main>
    );
  }

  const chegada = !!aberto;
  const pronto = chegada
    ? valorOk && !!foto
    : !!veiculoId && finalidade.trim().length >= 3 && destino.trim().length >= 2 && valorOk && !!foto;
  const rotuloMedicao = horimetro ? "Horímetro" : "Km do painel";

  return (
    <main className="min-h-[100dvh] bg-[#F1F4FA] text-[#0F172A]">
      <style>{ESTILO}</style>
      <header className={`sticky top-0 z-20 px-5 pb-4 text-white shadow-lg ${chegada ? "bg-gradient-to-br from-[#059669] to-[#047857]" : "bg-gradient-to-br from-[#1D5BD6] to-[#153B8F]"}`}
        style={{ paddingTop: "calc(env(safe-area-inset-top) + .75rem)" }}>
        <div className="mx-auto flex max-w-[480px] items-center gap-2">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20">{chegada ? <Flag size={22} /> : <Route size={22} />}</span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[20px] font-bold leading-tight">{chegada ? "Registrar chegada" : "Usar veículo"}</h1>
            <p className="text-[13px] text-white/80">{chegada ? "Confira o painel ao estacionar" : "Registre a saída antes de rodar"}</p>
          </div>
          <Link href="/motorista" aria-label="Cancelar" className="flex h-11 items-center gap-1 rounded-2xl px-3 text-[15px] font-medium text-white/90 active:bg-white/15">
            <X size={18} /> Cancelar
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-[480px] space-y-4 px-5 pt-5" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 7rem)" }}>
        {carregando ? (
          <div className="flex justify-center py-16 text-[#64748B]"><Loader2 className="animate-spin" /></div>
        ) : chegada && aberto ? (
          <>
            <section className="uv-sobe rounded-3xl bg-white p-4 ring-1 ring-[#E2E8F0]">
              <div className="flex items-center gap-2">
                <span className="rounded-md border-2 border-[#0F172A] bg-white px-2 font-mono text-[16px] font-bold leading-6">{aberto.veiculo_placa}</span>
                <span className="truncate text-[14px] text-[#475569]">{aberto.veiculo_modelo}</span>
              </div>
              <dl className="mt-3 space-y-1.5 text-[14px]">
                <div className="flex gap-2"><dt className="w-20 shrink-0 text-[#64748B]">Saída</dt><dd>{hora(aberto.saida_em)} · {medicao(aberto.medicao_saida, aberto.usa_horimetro)}</dd></div>
                <div className="flex gap-2"><dt className="w-20 shrink-0 text-[#64748B]">Destino</dt><dd className="min-w-0">{aberto.destino}</dd></div>
                <div className="flex gap-2"><dt className="w-20 shrink-0 text-[#64748B]">Finalidade</dt><dd className="min-w-0">{aberto.finalidade}</dd></div>
              </dl>
            </section>
            <section className="uv-sobe rounded-3xl bg-white p-4 ring-1 ring-[#E2E8F0]">
              <label className="mb-2 block text-[15px] font-semibold" htmlFor="medicao">1. {rotuloMedicao} na chegada</label>
              <div className="relative">
                <Gauge size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input id="medicao" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value.replace(/[^\d,.]/g, ""))}
                  placeholder={`Maior que ${medicao(aberto.medicao_saida, aberto.usa_horimetro)}`}
                  className="h-14 w-full rounded-2xl bg-[#F8FAFC] pl-12 pr-4 text-[20px] font-bold ring-2 ring-[#E2E8F0] focus:outline-none focus:ring-[#1D5BD6]" />
              </div>
              {valorOk && numero >= aberto.medicao_saida && (
                <p className="mt-2 text-[14px] text-[#475569]">Percorrido: <strong>{medicao(numero - aberto.medicao_saida, aberto.usa_horimetro)}</strong></p>
              )}
              {valorOk && numero < aberto.medicao_saida && (
                <p className="mt-2 text-[14px] text-[#BA1A1A]">Menor que na saída. Confira o painel.</p>
              )}
            </section>
            <section className="uv-sobe rounded-3xl bg-white p-4 ring-1 ring-[#E2E8F0]">
              <span className="mb-2 block text-[15px] font-semibold">2. Foto do painel</span>
              <FotoPainel rotulo="Foto do painel na chegada" foto={foto} onFoto={setFoto} />
            </section>
          </>
        ) : (
          <>
            <section className="uv-sobe rounded-3xl bg-white p-4 ring-1 ring-[#E2E8F0]">
              <span className="mb-2 block text-[15px] font-semibold">1. Qual veículo?</span>
              {veiculo ? (
                <div className="flex items-center gap-4 rounded-2xl bg-[#F1F5FF] p-3">
                  <FotoMotorista src={veiculo.foto_url} className="h-14 w-16 flex-shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <span className="inline-block rounded-md border-2 border-[#0F172A] bg-white px-2 font-mono text-[16px] font-bold leading-6">{veiculo.placa}</span>
                    <div className="mt-0.5 truncate text-[14px] text-[#475569]">{[veiculo.marca, veiculo.modelo].filter(Boolean).join(" ") || "—"}</div>
                  </div>
                  <button onClick={() => { setVeiculoId(""); setValor(""); }} className="shrink-0 rounded-xl px-2 py-2 text-[14px] font-medium text-[#1D5BD6] active:bg-white">Trocar</button>
                </div>
              ) : (
                <div className="space-y-2">
                  {veiculos.map((v) => (
                    <button key={v.id} onClick={() => escolher(v)}
                      className="flex w-full items-center gap-4 rounded-2xl bg-[#F8FAFC] p-3 text-left ring-2 ring-[#E2E8F0] transition active:scale-[.98] active:bg-[#EFF4FF]">
                      <FotoMotorista src={v.foto_url} className="h-14 w-16 flex-shrink-0 rounded-xl" />
                      <div className="min-w-0">
                        <span className="inline-block rounded-md border-2 border-[#0F172A] bg-white px-2 font-mono text-[16px] font-bold leading-6">{v.placa}</span>
                        <div className="mt-0.5 truncate text-[14px] text-[#475569]">{[v.marca, v.modelo].filter(Boolean).join(" ") || "—"}</div>
                      </div>
                    </button>
                  ))}
                  {veiculos.length === 0 && (
                    <div className="rounded-2xl bg-[#F8FAFC] px-4 py-8 text-center text-[14px] text-[#64748B]">Nenhum veículo disponível.</div>
                  )}
                </div>
              )}
            </section>

            <section className="uv-sobe space-y-3 rounded-3xl bg-white p-4 ring-1 ring-[#E2E8F0]">
              <label className="block">
                <span className="mb-2 block text-[15px] font-semibold">2. Finalidade</span>
                <textarea value={finalidade} onChange={(e) => setFinalidade(e.target.value)} rows={2} maxLength={2000}
                  placeholder="Ex.: levar paciente ao hospital, entrega de documentos…"
                  className="w-full rounded-2xl bg-[#F8FAFC] p-3 text-[16px] ring-2 ring-[#E2E8F0] focus:outline-none focus:ring-[#1D5BD6]" />
              </label>
              <label className="block">
                <span className="mb-2 block text-[15px] font-semibold">3. Destino</span>
                <div className="relative">
                  <MapPin size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                  <input value={destino} onChange={(e) => setDestino(e.target.value)} maxLength={255} placeholder="Para onde vai?"
                    className="h-14 w-full rounded-2xl bg-[#F8FAFC] pl-12 pr-4 text-[16px] ring-2 ring-[#E2E8F0] focus:outline-none focus:ring-[#1D5BD6]" />
                </div>
              </label>
            </section>

            <section className="uv-sobe rounded-3xl bg-white p-4 ring-1 ring-[#E2E8F0]">
              <label className="mb-2 block text-[15px] font-semibold" htmlFor="medicao">4. {rotuloMedicao} na saída</label>
              <div className="relative">
                <Gauge size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input id="medicao" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value.replace(/[^\d,.]/g, ""))}
                  placeholder={!veiculoId ? "Escolha o veículo primeiro" : horimetro ? "Horas no painel" : "Km no painel"}
                  className="h-14 w-full rounded-2xl bg-[#F8FAFC] pl-12 pr-4 text-[20px] font-bold ring-2 ring-[#E2E8F0] focus:outline-none focus:ring-[#1D5BD6]" />
              </div>
              <p className="mt-2 text-[13px] text-[#64748B]">Já vem com o último registrado. Confira com o painel e corrija se precisar.</p>
              <div className="mt-4">
                <span className="mb-2 block text-[15px] font-semibold">5. Foto do painel</span>
                <FotoPainel rotulo="Foto do painel na saída" foto={foto} onFoto={setFoto} />
              </div>
            </section>
          </>
        )}
      </div>

      {!carregando && (
        <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[#F1F4FA] via-[#F1F4FA] to-transparent px-5 pt-6"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}>
          <button onClick={chegada ? enviarChegada : enviarSaida} disabled={!pronto || enviando}
            className={`mx-auto flex h-14 w-full max-w-[480px] items-center justify-center gap-2 rounded-2xl text-[18px] font-bold text-white shadow-[0_12px_24px_-10px_rgba(29,91,214,.7)] active:scale-[.98] disabled:opacity-50 ${chegada ? "bg-gradient-to-r from-[#059669] to-[#047857]" : "bg-gradient-to-r from-[#1D5BD6] to-[#153B8F]"}`}>
            {enviando ? <Loader2 className="animate-spin" /> : chegada ? <Flag size={20} /> : <Route size={20} />}
            {chegada ? "Registrar chegada" : "Registrar saída"}
          </button>
        </div>
      )}
    </main>
  );
}
