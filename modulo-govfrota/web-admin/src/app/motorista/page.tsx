"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Fuel, AlertTriangle, CloudOff, LogOut, Droplets, RefreshCw } from "lucide-react";
import { AuthError, driverApi, AbastecimentoRecenteMotorista } from "@/lib/api";
import {
  AbastecimentoPendente,
  descartarPendente,
  lerCache,
  listarPendentes,
  salvarCache,
  sincronizarPendentes,
} from "@/lib/filaOffline";

export default function InicioMotoristaPage() {
  const router = useRouter();
  const [nome, setNome] = useState<string>("");
  const [orgNome, setOrgNome] = useState<string | null>(null);
  const [ultimos, setUltimos] = useState<AbastecimentoRecenteMotorista[]>([]);
  const [pendentes, setPendentes] = useState<AbastecimentoPendente[]>([]);
  const [enviando, setEnviando] = useState(false);

  const carregarUltimos = useCallback(() => {
    driverApi
      .meusAbastecimentos()
      .then((lista) => setUltimos(lista.slice(0, 3)))
      .catch(() => {});
  }, []);

  // Envia o que ficou guardado no celular e atualiza a lista.
  const sincronizar = useCallback(async (avisar = false) => {
    setEnviando(true);
    try {
      const { enviados, recusados } = await sincronizarPendentes();
      if (enviados) {
        toast.success(`${enviados} abastecimento(s) enviado(s).`);
        carregarUltimos();
      } else if (avisar && !recusados) {
        toast("Ainda sem conexão com o servidor.", { icon: "📶" });
      }
    } finally {
      setPendentes(await listarPendentes());
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
      })
      .catch((e) => {
        // Sem internet o motorista continua no app; só a sessão expirada volta ao login.
        if (e instanceof AuthError) router.replace("/motorista/login?expirado=1");
      });
    carregarUltimos();
    listarPendentes().then((p) => !cancelado && setPendentes(p));
    sincronizar();
    const aoVoltarSinal = () => sincronizar();
    window.addEventListener("online", aoVoltarSinal);
    return () => {
      cancelado = true;
      window.removeEventListener("online", aoVoltarSinal);
    };
  }, [router, carregarUltimos, sincronizar]);

  async function descartar(item: AbastecimentoPendente) {
    if (!window.confirm(`Descartar o abastecimento de ${item.resumo.placa}? Ele não será enviado.`)) return;
    await descartarPendente(item.idempotency_key);
    setPendentes(await listarPendentes());
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

  return (
    <main
      className="min-h-screen bg-[#F8F9FF] p-6"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 1.5rem)", paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)" }}
    >
      <div className="mx-auto max-w-[480px]">
        <header className="mb-8 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-[#181C22]">Olá, {nome || "…"}</h1>
            <p className="mt-0.5 truncate text-sm text-[#424750]" title={orgNome || undefined}>
              {orgNome || "O que deseja fazer?"}
            </p>
          </div>
          <button
            onClick={sair}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[#424750] hover:bg-white"
            aria-label="Sair"
          >
            <LogOut size={24} />
          </button>
        </header>

        <div className="space-y-4">
          <Link
            href="/motorista/abastecer"
            className="flex min-h-20 items-center justify-center gap-3 rounded-2xl bg-[#1D5BD6] py-6 text-xl font-bold text-white shadow-card active:bg-[#1E40AF]"
          >
            <Fuel size={28} /> ABASTECER VEÍCULO
          </Link>

          <Link
            href="/motorista/problema"
            className="flex min-h-20 items-center justify-center gap-3 rounded-2xl border-2 border-[#C3C6D1] bg-white py-5 text-lg font-medium text-[#181C22] active:bg-[#EFF4FF]"
          >
            <AlertTriangle size={24} className="text-[#805600]" /> INFORMAR PROBLEMA
          </Link>
        </div>

        {pendentes.length > 0 && (
          <section className="mt-8 rounded-2xl border border-[#FFDD9A] bg-[#FFF8E6] p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-[#5C4200]">
                <CloudOff size={18} /> {pendentes.length} guardado(s) no celular
              </h2>
              <button
                onClick={() => sincronizar(true)}
                disabled={enviando}
                className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-2 text-sm font-medium text-[#1D5BD6] disabled:opacity-50"
              >
                <RefreshCw size={16} className={enviando ? "animate-spin" : ""} /> Enviar agora
              </button>
            </div>
            <ul className="mt-3 space-y-2">
              {pendentes.map((p) => (
                <li key={p.idempotency_key} className="rounded-xl bg-white px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-[#1D5BD6]">{p.resumo.placa}</span>
                    <span className="text-[#424750]">
                      {Number(p.resumo.litros).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} L ·{" "}
                      {new Date(p.registrado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                  </div>
                  {p.erro ? (
                    <div className="mt-1 flex items-start justify-between gap-2">
                      <span className="text-xs text-[#BA1A1A]">Não aceito: {p.erro} Avise o setor de frota.</span>
                      <button onClick={() => descartar(p)} className="shrink-0 text-xs font-medium text-[#737781] underline">
                        Descartar
                      </button>
                    </div>
                  ) : (
                    <div className="mt-1 text-xs text-[#737781]">Aguardando internet para enviar.</div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-10">
          <h2 className="mb-2 text-sm font-medium text-[#737781]">Últimos abastecimentos</h2>
          {ultimos.length === 0 ? (
            <div className="rounded-xl border border-[#C3C6D1]/40 bg-white px-4 py-6 text-center text-sm text-[#737781]">
              Nenhum abastecimento registrado ainda.
            </div>
          ) : (
            <ul className="divide-y divide-[#C3C6D1]/30 overflow-hidden rounded-xl bg-white shadow-card">
              {ultimos.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-[#737781]">{dataRecente(a.data)}</div>
                    <div className="mt-0.5 font-mono text-base font-bold text-[#1D5BD6]">{a.placa || "—"}</div>
                    <div className="truncate text-sm text-[#424750]">
                      {[a.marca, a.modelo].filter(Boolean).join(" ") || "—"}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-base font-bold text-[#181C22]">
                      {a.litros.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L
                    </div>
                    {a.combustivel && <div className="text-xs text-[#737781]">{a.combustivel}</div>}
                    <div className="flex items-center justify-end gap-1 text-xs text-[#737781]">
                      <Droplets size={12} />{" "}
                      {a.horimetro != null ? `${a.horimetro.toLocaleString("pt-BR")} h` : `${a.km.toLocaleString("pt-BR")} km`}
                    </div>
                    {a.local && <div className="text-xs text-[#737781]">{a.local}</div>}
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
