"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Fuel, AlertTriangle, ChevronRight, CloudOff, Flag, Gauge, LogOut, RefreshCw, Route, Truck, Wifi, WifiOff } from "lucide-react";
import { AuthError, driverApi, AbastecimentoRecenteMotorista, UsoVeiculo } from "@/lib/api";
import {
  AbastecimentoPendente,
  EnvioPendente,
  descartarEnvio,
  descartarPendente,
  lerCache,
  listarEnvios,
  listarPendentes,
  usoAbertoComFila,
  salvarCache,
  sincronizarPendentes,
} from "@/lib/filaOffline";

export default function InicioMotoristaPage() {
  const router = useRouter();
  const [nome, setNome] = useState<string>("");
  const [orgNome, setOrgNome] = useState<string | null>(null);
  const [ultimos, setUltimos] = useState<AbastecimentoRecenteMotorista[]>([]);
  const [noMes, setNoMes] = useState<{ qtd: number; litros: number } | null>(null);
  const [online, setOnline] = useState(true);
  // Hora do celular, não do servidor (UTC): calculada só depois de montar,
  // senão o HTML do servidor diverge na hidratação (React #418/#425).
  const [saudacao, setSaudacao] = useState("Olá");
  useEffect(() => {
    const h = new Date().getHours();
    setSaudacao(h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite");
  }, []);
  const [pendentes, setPendentes] = useState<AbastecimentoPendente[]>([]);
  const [envios, setEnvios] = useState<EnvioPendente[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [usoAberto, setUsoAberto] = useState<UsoVeiculo | null>(null);

  const carregarUltimos = useCallback(() => {
    driverApi
      .meusAbastecimentos()
      .then((lista) => {
        setUltimos(lista.slice(0, 3));
        const agora = new Date();
        const doMes = lista.filter((a) => { const d = new Date(a.data); return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear(); });
        setNoMes({ qtd: doMes.length, litros: doMes.reduce((t, a) => t + a.litros, 0) });
      })
      .catch(() => {});
  }, []);

  // Envia o que ficou guardado no celular e atualiza a lista.
  const sincronizar = useCallback(async (avisar = false) => {
    setEnviando(true);
    try {
      const { enviados, recusados } = await sincronizarPendentes();
      if (enviados) {
        toast.success(`${enviados} registro(s) enviado(s).`);
        carregarUltimos();
        driverApi.usoAtual().then(usoAbertoComFila).then(setUsoAberto).catch(() => {});
      } else if (avisar && !recusados) {
        toast("Ainda sem conexão com o servidor.", { icon: "📶" });
      }
    } finally {
      setPendentes(await listarPendentes());
      setEnvios(await listarEnvios());
      setEnviando(false);
    }
  }, [carregarUltimos]);

  useEffect(() => {
    let cancelado = false;
    const eu = lerCache<{ nome: string; org: string | null }>("me");
    if (eu) {
      setNome(eu.nome);
      setOrgNome(eu.org);
    }
    driverApi
      .me()
      .then((m) => {
        if (cancelado) return;
        setNome(m.nome.split(" ")[0]);
        setOrgNome(m.organization_name);
        salvarCache("me", { nome: m.nome.split(" ")[0], org: m.organization_name });
        salvarCache("config", {
          foto_bomba_obrigatoria: m.foto_bomba_obrigatoria,
          foto_km_obrigatoria: m.foto_km_obrigatoria,
          exigir_tanque_cheio: m.exigir_tanque_cheio,
        });
        // Com sinal, já guarda veículos e locais: assim abastecer, usar o
        // veículo e informar problema funcionam sem internet mesmo que o
        // motorista nunca tenha aberto essas telas online.
        driverApi.veiculos().then((vs) => salvarCache("veiculos", vs)).catch(() => {});
        driverApi.locais().then((ls) => salvarCache("locais", ls)).catch(() => {});
      })
      .catch((e) => {
        // Sem internet o motorista continua no app; só a sessão expirada volta ao login.
        if (e instanceof AuthError) router.replace("/motorista/login?expirado=1");
      });
    carregarUltimos();
    driverApi.usoAtual()
      .catch(() => undefined)
      .then(usoAbertoComFila)
      .then((u) => !cancelado && setUsoAberto(u));
    listarPendentes().then((p) => !cancelado && setPendentes(p));
    listarEnvios().then((p) => !cancelado && setEnvios(p));
    sincronizar();
    setOnline(navigator.onLine);
    const aoVoltarSinal = () => { setOnline(true); sincronizar(); };
    // O sincronizador do layout enviou algo: atualiza a tela.
    const aoSincronizar = () => sincronizar();
    window.addEventListener("fila:sincronizada", aoSincronizar);
    const aoPerderSinal = () => setOnline(false);
    window.addEventListener("online", aoVoltarSinal);
    window.addEventListener("offline", aoPerderSinal);
    return () => {
      cancelado = true;
      window.removeEventListener("online", aoVoltarSinal);
      window.removeEventListener("offline", aoPerderSinal);
      window.removeEventListener("fila:sincronizada", aoSincronizar);
    };
  }, [router, carregarUltimos, sincronizar]);

  async function descartar(item: AbastecimentoPendente) {
    if (!window.confirm(`Descartar o abastecimento de ${item.resumo.placa}? Ele não será enviado.`)) return;
    await descartarPendente(item.idempotency_key);
    setPendentes(await listarPendentes());
  }

  async function descartarOutro(item: EnvioPendente) {
    if (!window.confirm(`Descartar "${item.resumo}"? Não será enviado.`)) return;
    await descartarEnvio(item.chave);
    setEnvios(await listarEnvios());
    setUsoAberto(await usoAbertoComFila(usoAberto?.id === item.chave ? null : usoAberto));
  }

  function sair() {
    driverApi.logout();
    router.replace("/motorista/login");
  }

  function dataRecente(iso: string) {
    const d = new Date(iso);
    const hoje = new Date();
    const mesmoDia = d.toDateString() === hoje.toDateString();
    const ontem = new Date();
    ontem.setDate(hoje.getDate() - 1);
    const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (mesmoDia) return `Hoje • ${hora}`;
    if (d.toDateString() === ontem.toDateString()) return `Ontem • ${hora}`;
    return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} • ${hora}`;
  }

  const iniciais = (nome || "?").slice(0, 1).toUpperCase();

  return (
    <main className="min-h-[100dvh] bg-[#F1F4FA] text-[#0F172A]">
      <style>{`
        @keyframes mi-sobe { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
        @keyframes mi-flutua { 0%,100% { transform: translate(0,0); } 50% { transform: translate(18px,-16px); } }
        @keyframes mi-brilho { from { transform: translateX(-120%); } to { transform: translateX(220%); } }
        .mi-sobe { animation: mi-sobe .5s cubic-bezier(.2,.8,.2,1) both; }
        .mi-flutua { animation: mi-flutua 12s ease-in-out infinite; }
        .mi-brilho { animation: mi-brilho 3.2s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .mi-sobe, .mi-flutua, .mi-brilho { animation: none !important; } }
      `}</style>

      {/* Cabeçalho */}
      <header className="relative overflow-hidden rounded-b-[32px] bg-gradient-to-br from-[#1D5BD6] via-[#153B8F] to-[#0B1B3F] px-6 pb-20 text-white"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 1.25rem)" }}>
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="mi-flutua absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#5B8CFF]/40 blur-3xl" />
          <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(white 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
        </div>
        <div className="relative mx-auto flex max-w-[480px] items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-lg font-bold ring-1 ring-white/30 backdrop-blur">{iniciais}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] text-white/75">{saudacao},</p>
            <h1 className="truncate text-[22px] font-bold leading-tight">{nome || "…"}</h1>
          </div>
          <button onClick={sair} aria-label="Sair"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20 active:bg-white/25">
            <LogOut size={21} />
          </button>
        </div>
        <div className="relative mx-auto mt-4 flex max-w-[480px] flex-wrap items-center gap-2 text-[13px]">
          {orgNome && <span className="truncate rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/20">{orgNome}</span>}
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium ${online ? "bg-[#22C55E]/20 text-[#BBF7D0]" : "bg-[#F59E0B]/25 text-[#FDE68A]"}`}>
            {online ? <Wifi size={13} /> : <WifiOff size={13} />} {online ? "Conectado" : "Sem internet"}
          </span>
        </div>
      </header>

      <div className="relative mx-auto -mt-14 max-w-[480px] px-5" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 2rem)" }}>
        {/* Ações */}
        {usoAberto && (
          <Link href="/motorista/uso"
            className="mi-sobe relative mb-3 flex items-center gap-4 overflow-hidden rounded-3xl bg-gradient-to-br from-[#059669] to-[#047857] p-5 text-white shadow-[0_18px_36px_-14px_rgba(5,150,105,.7)] transition active:scale-[.98]">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/30"><Flag size={30} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] text-white/85">
                Em uso: <strong className="font-mono">{usoAberto.veiculo_placa}</strong> desde{" "}
                {new Date(usoAberto.saida_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="block text-[21px] font-bold leading-tight">Registrar chegada</span>
            </span>
            <ChevronRight size={26} className="shrink-0 text-white/80" />
          </Link>
        )}
        <Link href="/motorista/abastecer"
          className="mi-sobe relative flex items-center gap-4 overflow-hidden rounded-3xl bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] p-5 text-white shadow-[0_18px_36px_-14px_rgba(29,78,216,.7)] transition active:scale-[.98]">
          <span className="mi-brilho pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent" aria-hidden />
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/30"><Fuel size={32} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[21px] font-bold leading-tight">Abastecer veículo</span>
            <span className="block text-[14px] text-white/80">Informe só os litros e o km</span>
          </span>
          <ChevronRight size={26} className="shrink-0 text-white/80" />
        </Link>

        {!usoAberto && (
          <Link href="/motorista/uso"
            className="mi-sobe mt-3 relative flex items-center gap-4 overflow-hidden rounded-3xl bg-gradient-to-br from-[#16A34A] to-[#047857] p-5 text-white shadow-[0_14px_30px_-14px_rgba(4,120,87,.7)] transition active:scale-[.98]"
            style={{ animationDelay: ".03s" }}>
            <span className="mi-brilho pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent" aria-hidden />
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/30"><Route size={32} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[21px] font-bold leading-tight">Usar veículo</span>
              <span className="block text-[14px] text-white/85">Registre a saída e a chegada</span>
            </span>
            <ChevronRight size={26} className="shrink-0 text-white/80" />
          </Link>
        )}

        <Link href="/motorista/problema"
          className="mi-sobe mt-3 relative flex items-center gap-4 overflow-hidden rounded-3xl bg-gradient-to-br from-[#F97316] to-[#C2410C] p-5 text-white shadow-[0_14px_30px_-14px_rgba(194,65,12,.7)] transition active:scale-[.98]"
          style={{ animationDelay: ".06s" }}>
          <span className="mi-brilho pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent" aria-hidden />
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/30"><AlertTriangle size={32} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[21px] font-bold leading-tight">Informar problema</span>
            <span className="block text-[14px] text-white/85">Pane, avaria, pneu, acidente…</span>
          </span>
          <ChevronRight size={26} className="shrink-0 text-white/80" />
        </Link>

        {/* Resumo do mês */}
        {noMes && (
          <div className="mi-sobe mt-3 grid grid-cols-2 gap-3" style={{ animationDelay: ".12s" }}>
            <div className="rounded-2xl bg-white p-4 ring-1 ring-[#E2E8F0]">
              <p className="text-[13px] text-[#64748B]">Abastecimentos no mês</p>
              <p className="text-[26px] font-bold leading-tight">{noMes.qtd}</p>
            </div>
            <div className="rounded-2xl bg-white p-4 ring-1 ring-[#E2E8F0]">
              <p className="text-[13px] text-[#64748B]">Litros no mês</p>
              <p className="text-[26px] font-bold leading-tight">{noMes.litros.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}<span className="text-[16px] font-semibold text-[#64748B]"> L</span></p>
            </div>
          </div>
        )}

        {pendentes.length + envios.length > 0 && (
          <section className="mi-sobe mt-5 rounded-3xl bg-[#FFF8E6] p-4 ring-1 ring-[#FCD98A]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-[15px] font-bold text-[#5C4200]">
                <CloudOff size={19} /> {pendentes.length + envios.length} guardado(s) no celular
              </h2>
              <button
                onClick={() => sincronizar(true)}
                disabled={enviando}
                className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-white px-3.5 text-[14px] font-semibold text-[#1D5BD6] shadow-sm disabled:opacity-50"
              >
                <RefreshCw size={16} className={enviando ? "animate-spin" : ""} /> Enviar agora
              </button>
            </div>
            <ul className="mt-3 space-y-2">
              {pendentes.map((p) => (
                <li key={p.idempotency_key} className="rounded-2xl bg-white px-4 py-3 text-[14px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[15px] font-bold text-[#1D5BD6]">{p.resumo.placa}</span>
                    <span className="text-[#475569]">
                      {Number(p.resumo.litros).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} L ·{" "}
                      {new Date(p.registrado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                  </div>
                  {p.erro ? (
                    <div className="mt-1.5 flex items-start justify-between gap-2">
                      <span className="text-[13px] text-[#BA1A1A]">Não aceito: {p.erro} Avise o setor de frota.</span>
                      <button onClick={() => descartar(p)} className="shrink-0 px-1 py-1 text-[13px] font-medium text-[#64748B] underline">
                        Descartar
                      </button>
                    </div>
                  ) : (
                    <div className="mt-1 text-[13px] text-[#64748B]">Aguardando internet para enviar.</div>
                  )}
                </li>
              ))}
              {envios.map((p) => (
                <li key={p.chave} className="rounded-2xl bg-white px-4 py-3 text-[14px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#1D5BD6]">{p.resumo}</span>
                    <span className="text-[#475569]">
                      {new Date(p.registrado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                  </div>
                  {p.erro ? (
                    <div className="mt-1.5 flex items-start justify-between gap-2">
                      <span className="text-[13px] text-[#BA1A1A]">Não aceito: {p.erro} Avise o setor de frota.</span>
                      <button onClick={() => descartarOutro(p)} className="shrink-0 px-1 py-1 text-[13px] font-medium text-[#64748B] underline">
                        Descartar
                      </button>
                    </div>
                  ) : (
                    <div className="mt-1 text-[13px] text-[#64748B]">Aguardando internet para enviar.</div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Últimos */}
        <section className="mi-sobe mt-6" style={{ animationDelay: ".18s" }}>
          <h2 className="mb-3 px-1 text-[15px] font-bold">Últimos abastecimentos</h2>
          {ultimos.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-3xl bg-white px-6 py-8 text-center ring-1 ring-[#E2E8F0]">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E5EEFF] text-[#1D5BD6]"><Truck size={26} /></span>
              <p className="text-[15px] font-semibold">Nenhum abastecimento ainda</p>
              <p className="text-[14px] text-[#64748B]">Toque em <strong>Abastecer veículo</strong> quando for ao posto.</p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {ultimos.map((a) => (
                <li key={a.id} className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-[#E2E8F0]">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#E5EEFF] text-[#1D5BD6]"><Fuel size={22} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md border-2 border-[#0F172A] bg-white px-1.5 font-mono text-[14px] font-bold leading-5">{a.placa || "—"}</span>
                      <span className="text-[12px] font-medium text-[#64748B]">{dataRecente(a.data)}</span>
                    </div>
                    <div className="mt-1 truncate text-[14px] text-[#475569]">
                      {[a.marca, a.modelo].filter(Boolean).join(" ") || "—"}{a.combustivel ? ` · ${a.combustivel}` : ""}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-[12px] text-[#64748B]">
                      <Gauge size={12} />
                      {a.horimetro != null ? `${a.horimetro.toLocaleString("pt-BR")} h` : `${a.km.toLocaleString("pt-BR")} km`}
                      {a.local ? ` · ${a.local}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[20px] font-bold leading-tight">{a.litros.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</div>
                    <div className="text-[12px] font-medium text-[#64748B]">litros</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
