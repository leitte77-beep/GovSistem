"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import {
  AlertTriangle, ArrowLeft, BadgeCheck, Camera, ClipboardList, Flag, Gauge, History, Landmark, MapPin, Navigation, Route, Timer, User,
} from "lucide-react";
import { api, UsoVeiculo } from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";
import { useAuth } from "@/lib/auth";
import { FotoAnexo } from "@/components/abastecimento/FotoAnexo";
import MapaLocal from "@/components/MapaLocal";
import { FotoVeiculo } from "@/components/veiculo/FotoVeiculo";
import { BadgeStatusUso, dataHora, duracaoUso, medicaoUso } from "@/components/uso/uso";

export default function UsoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const podeGerir = hasPermission("vehicle.manage");
  const [u, setU] = useState<UsoVeiculo | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    api.getUso(id).then(setU).catch((e) => setErro((e as Error).message));
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <RequirePermission perms="vehicle.view">
      <div className="space-y-5">
        <Link
          href="/usos"
          className="group inline-flex items-center gap-2 py-1 text-body-sm font-medium text-secondary transition-colors hover:text-primary"
        >
          <ArrowLeft size={18} className="transition-transform group-hover:-translate-x-0.5" />
          Voltar para Diário de Bordo
        </Link>

        {erro && <p className="rounded-2xl bg-surface-card p-6 text-on-surface-variant shadow-card">{erro}</p>}
        {!u && !erro && <div className="h-40 animate-pulse rounded-2xl bg-surface-container" />}
        {u && <Conteudo u={u} podeGerir={podeGerir} onMudou={setU} />}
      </div>
    </RequirePermission>
  );
}

function Conteudo({ u, podeGerir, onMudou }: { u: UsoVeiculo; podeGerir: boolean; onMudou: (u: UsoVeiculo) => void }) {
  const emUso = u.status === "EM_USO";
  const un = u.usa_horimetro ? "Horímetro" : "Quilometragem";
  const situacao = u.alertas.length > 0 || u.atrasado
    ? { classe: "bg-[#FFF4D6] text-[#5C4200]", icone: <AlertTriangle size={22} className="shrink-0 text-[#805600]" />, titulo: "Requer atenção", texto: "Este uso disparou alertas — confira com o motorista." }
    : emUso
      ? { classe: "bg-[#E5EEFF] text-[#0B2A6B]", icone: <Navigation size={22} className="shrink-0 text-[#1D4ED8]" />, titulo: "Veículo na rua", texto: "O motorista ainda não registrou a chegada." }
      : { classe: "bg-[#E7F8EC] text-[#0B3D20]", icone: <BadgeCheck size={22} className="shrink-0 text-[#106D34]" />, titulo: "Uso conforme", texto: "Saída e chegada registradas, sem alertas." };

  return (
    <>
      {/* Cabeçalho */}
      <div className="relative overflow-hidden rounded-2xl bg-surface-card shadow-card ring-1 ring-outline-variant/40">
        <div className="h-1.5 bg-gradient-to-r from-[#1D4ED8] via-[#3B82F6] to-[#16A34A]" />
        <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center">
          <FotoVeiculo src={u.veiculo_foto_url ?? null} className="h-20 w-20 shrink-0 rounded-2xl" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded bg-navy px-2.5 py-1 font-mono text-base font-semibold tracking-wider text-white shadow-sm">{u.veiculo_placa ?? "—"}</span>
              <h1 className="truncate text-h2 text-text-title">{u.veiculo_modelo || "Veículo"}</h1>
              <BadgeStatusUso u={u} />
              {u.origem === "PAINEL" && <span className="rounded-pill bg-surface-container px-2 py-0.5 text-meta">Lançado pelo painel</span>}
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-body-sm text-text-subtle">
              <span className="inline-flex items-center gap-1.5"><User size={16} className="text-primary" /><span className="font-medium text-text-body">{u.motorista_nome ?? "—"}</span></span>
              <span className="inline-flex items-center gap-1.5"><MapPin size={16} className="text-[#DC2626]" />{u.destino}</span>
              {u.unidade_nome && <span className="inline-flex items-center gap-1.5"><Landmark size={16} className="text-secondary" />{u.unidade_nome}</span>}
            </div>
          </div>
        </div>
      </div>

      {u.alertas.map((a) => (
        <div key={a.tipo} className="flex items-start gap-2 rounded-2xl border border-[#F5C451] bg-[#FFF8E6] p-4 text-body-sm text-[#5C4200]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {a.mensagem}
        </div>
      ))}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        <div className="flex flex-col gap-5 lg:col-span-8">
          {/* Métricas */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metrica rotulo="Percorrido" destaque icone={<Route size={16} />}>
              {u.percorrido != null ? medicaoUso(u.percorrido, u.usa_horimetro) : "—"}
            </Metrica>
            <Metrica rotulo={emUso ? "Na rua há" : "Duração"} icone={<Timer size={16} />}>{duracaoUso(u.duracao_min)}</Metrica>
            <Metrica rotulo={`${un} saída`} icone={<Gauge size={16} />}>{medicaoUso(u.medicao_saida, u.usa_horimetro)}</Metrica>
            <Metrica rotulo={`${un} chegada`} icone={<Gauge size={16} />}>{medicaoUso(u.medicao_chegada, u.usa_horimetro)}</Metrica>
          </div>

          {/* Trajeto */}
          <section className="rounded-2xl bg-surface-card p-6 shadow-card ring-1 ring-outline-variant/40">
            <h2 className="mb-5 flex items-center gap-2 text-h3 text-text-title"><Route size={20} className="text-primary" /> Trajeto</h2>
            <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
              <Ponto rotulo="Saída" cor="#16A34A" quando={u.saida_em} medicao={medicaoUso(u.medicao_saida, u.usa_horimetro)} foto={u.foto_saida_url} />
              <div className="flex items-center justify-center md:flex-col">
                <div className="h-px w-full bg-gradient-to-r from-[#16A34A] to-[#DC2626] md:h-auto md:w-px md:flex-1 md:bg-gradient-to-b" />
                <span className="mx-3 shrink-0 rounded-pill bg-surface-container px-3 py-1 text-meta font-semibold text-on-surface md:mx-0 md:my-3">
                  {u.percorrido != null ? medicaoUso(u.percorrido, u.usa_horimetro) : "em andamento"}
                </span>
                <div className="h-px w-full bg-gradient-to-r from-[#16A34A] to-[#DC2626] md:h-auto md:w-px md:flex-1 md:bg-gradient-to-b" />
              </div>
              <Ponto rotulo="Chegada" cor="#DC2626" quando={u.chegada_em} medicao={medicaoUso(u.medicao_chegada, u.usa_horimetro)} foto={u.foto_chegada_url} pendente={emUso} />
            </div>
          </section>

          {/* Finalidade */}
          <section className="rounded-2xl bg-surface-card p-6 shadow-card ring-1 ring-outline-variant/40">
            <h2 className="mb-4 flex items-center gap-2 text-h3 text-text-title"><ClipboardList size={20} className="text-primary" /> Finalidade do uso</h2>
            <p className="whitespace-pre-line text-body text-text-body">{u.finalidade || "—"}</p>
            {u.motivo_encerramento && (
              <div className="mt-4 rounded-xl bg-amber-50 p-3 text-body-sm text-[#93370D]">
                <span className="font-semibold">Encerrado pela gestão:</span> {u.motivo_encerramento}
              </div>
            )}
          </section>

          <MapaLocal
            titulo="Saída e chegada"
            ligar
            pontos={[
              { lat: u.saida_latitude, lng: u.saida_longitude, rotulo: "Saída", cor: "#16A34A" },
              { lat: u.chegada_latitude, lng: u.chegada_longitude, rotulo: "Chegada", cor: "#DC2626" },
            ]}
          />
        </div>

        <aside className="flex flex-col gap-5 lg:col-span-4">
          <div className={`flex items-start gap-3 rounded-2xl p-5 ${situacao.classe}`}>
            {situacao.icone}
            <div>
              <p className="font-semibold">{situacao.titulo}</p>
              <p className="text-body-sm opacity-90">{situacao.texto}</p>
            </div>
          </div>

          <section className="rounded-2xl bg-surface-card p-6 shadow-card ring-1 ring-outline-variant/40">
            <h2 className="mb-4 flex items-center gap-2 text-h3 text-text-title"><History size={20} className="text-primary" /> Linha do tempo</h2>
            <ol className="relative space-y-5 border-l-2 border-outline-variant/40 pl-5">
              <Evento cor="bg-[#16A34A]" titulo="Saída registrada" quando={u.saida_em} texto={`${u.motorista_nome ?? "Motorista"} · ${medicaoUso(u.medicao_saida, u.usa_horimetro)}`} />
              {u.chegada_em ? (
                <Evento
                  cor={u.status === "ENCERRADO_GESTOR" ? "bg-[#F59E0B]" : "bg-[#DC2626]"}
                  titulo={u.status === "ENCERRADO_GESTOR" ? "Encerrado pela gestão" : "Chegada registrada"}
                  quando={u.chegada_em}
                  texto={medicaoUso(u.medicao_chegada, u.usa_horimetro)}
                />
              ) : (
                <Evento cor="bg-[#3B82F6] animate-pulse" titulo="Aguardando chegada" quando={null} texto={`Na rua há ${duracaoUso(u.duracao_min)}`} />
              )}
            </ol>
          </section>

          {emUso && podeGerir && <Encerrar u={u} onMudou={onMudou} />}
        </aside>
      </div>
    </>
  );
}

function Metrica({ rotulo, icone, destaque, children }: { rotulo: string; icone: React.ReactNode; destaque?: boolean; children: React.ReactNode }) {
  return (
    <div className={`rounded-2xl p-4 shadow-card ring-1 ${destaque ? "bg-gradient-to-br from-[#1D4ED8] to-[#3B82F6] text-white ring-transparent" : "bg-surface-card ring-outline-variant/40"}`}>
      <p className={`flex items-center gap-1.5 text-meta font-medium uppercase tracking-wider ${destaque ? "text-white/80" : "text-text-subtle"}`}>{icone} {rotulo}</p>
      <p className={`mt-2 text-2xl font-bold tracking-tight ${destaque ? "" : "text-text-title"}`}>{children}</p>
    </div>
  );
}

function Ponto({ rotulo, cor, quando, medicao, foto, pendente }: {
  rotulo: string; cor: string; quando: string | null; medicao: string; foto: string | null; pendente?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-outline-variant/40">
      <div className="aspect-[4/3] bg-surface-container">
        {foto ? <FotoAnexo url={foto} alt={`Painel na ${rotulo.toLowerCase()}`} className="h-full w-full !rounded-none !border-0" />
          : <div className="flex h-full flex-col items-center justify-center gap-1 text-meta text-on-surface-variant"><Camera size={22} />{pendente ? "Aguardando chegada" : "Sem foto"}</div>}
      </div>
      <div className="flex items-center gap-3 p-4">
        <span className="h-3 w-3 shrink-0 rounded-full ring-4 ring-offset-0" style={{ backgroundColor: cor, boxShadow: `0 0 0 4px ${cor}22` }} />
        <div className="min-w-0">
          <p className="text-meta font-semibold uppercase tracking-wider text-text-subtle">{rotulo}</p>
          <p className="text-body font-semibold text-text-title">{pendente ? "—" : medicao}</p>
          <p className="text-meta text-on-surface-variant">{dataHora(quando)}</p>
        </div>
      </div>
    </div>
  );
}

function Evento({ cor, titulo, quando, texto }: { cor: string; titulo: string; quando: string | null; texto: string }) {
  return (
    <li className="relative">
      <span className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full ring-4 ring-surface-card ${cor}`} />
      {quando && <p className="font-mono text-meta text-text-subtle">{dataHora(quando)}</p>}
      <p className="text-body-sm font-semibold text-text-title">{titulo}</p>
      <p className="text-meta text-on-surface-variant">{texto}</p>
    </li>
  );
}

function Encerrar({ u, onMudou }: { u: UsoVeiculo; onMudou: (u: UsoVeiculo) => void }) {
  const [aberto, setAberto] = useState(false);
  const [medicao, setMedicao] = useState("");
  const [motivo, setMotivo] = useState("");
  const [chegada, setChegada] = useState("");
  const [salvando, setSalvando] = useState(false);
  const un = u.usa_horimetro ? "Horímetro" : "Km";

  async function encerrar() {
    setSalvando(true);
    try {
      onMudou(await api.encerrarUso(u.id, {
        medicao: Number(medicao.replace(",", ".")),
        motivo,
        chegada_em: chegada ? new Date(chegada).toISOString() : null,
      }));
      setAberto(false);
      toast.success("Uso encerrado.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto) {
    return <button className="btn btn-primary btn-sm w-full" onClick={() => setAberto(true)}><Flag size={15} /> Encerrar uso</button>;
  }
  return (
    <div className="space-y-3 rounded-2xl bg-surface-card p-6 shadow-card ring-1 ring-outline-variant/40">
      <h3 className="font-semibold">Encerrar uso</h3>
      <Campo texto={`${un} de chegada`}>
        <input className="input" inputMode="decimal" value={medicao} onChange={(e) => setMedicao(e.target.value)} />
      </Campo>
      <Campo texto="Chegada (vazio = agora)">
        <input type="datetime-local" className="input" value={chegada} onChange={(e) => setChegada(e.target.value)} />
      </Campo>
      <Campo texto="Motivo">
        <textarea className="input" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: motorista esqueceu de registrar a chegada" />
      </Campo>
      <div className="flex justify-end gap-2">
        <button className="btn btn-secondary btn-sm" onClick={() => setAberto(false)}>Cancelar</button>
        <button className="btn btn-primary btn-sm" disabled={salvando || !medicao || motivo.trim().length < 3} onClick={encerrar}>Encerrar</button>
      </div>
    </div>
  );
}

function Campo({ texto, children }: { texto: string; children: React.ReactNode }) {
  return (
    <label className="block text-meta text-on-surface-variant">
      <span className="block text-xs font-semibold uppercase tracking-wide">{texto}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
