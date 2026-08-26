"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import { ArrowLeft, Copy, KeyRound, Pencil, ShieldCheck, Users } from "lucide-react";
import { api, Abastecimento, AcessoInfo, Motorista, Ocorrencia } from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";
import { useAuth } from "@/lib/auth";
import { AvatarMotorista } from "@/components/motorista/AvatarMotorista";
import { MotoristaFormDrawer } from "@/components/motorista/MotoristaFormDrawer";
import {
  diasRestantesCnh,
  formatarCpf,
  mascararCpf,
  situacaoCnh,
  situacaoCnhInfo,
} from "@/lib/motoristas";

type Aba = "resumo" | "abastecimentos" | "veiculos" | "ocorrencias" | "acesso" | "historico";

const GRAVIDADE_CLASSE: Record<string, string> = {
  BAIXA: "bg-gray-100 text-gray-600",
  MEDIA: "bg-[#D9E2FF] text-[#1D5BD6]",
  ALTA: "bg-[#FFDD9A] text-[#805600]",
  CRITICA: "bg-[#FFDAD6] text-[#BA1A1A]",
};

interface PinGerado {
  login: string;
  pin_provisorio: string;
  criado: boolean;
}

export default function DetalheMotoristaPage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const podeGerir = hasPermission("driver.manage");
  const [motorista, setMotorista] = useState<Motorista | null>(null);
  const [acesso, setAcesso] = useState<AcessoInfo | null>(null);
  const [abastecimentos, setAbastecimentos] = useState<Abastecimento[]>([]);
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([]);
  const [historico, setHistorico] = useState<{ data: string; texto: string; tipo: string }[]>([]);
  const [aba, setAba] = useState<Aba>("resumo");
  const [editando, setEditando] = useState(false);
  const [pinGerado, setPinGerado] = useState<PinGerado | null>(null);
  const [gerandoPin, setGerandoPin] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const m = await api.getMotorista(id);
      setMotorista(m);
      setAcesso(await api.getAcesso(id));
      const [abast, ocorr] = await Promise.all([
        api.listAbastecimentos({ motorista_id: id }).catch(() => []),
        api.listOcorrencias({ motorista_id: id }).catch(() => []),
      ]);
      setAbastecimentos(abast);
      setOcorrencias(ocorr);

      const eventos: { data: string; texto: string; tipo: string }[] = [
        ...abast.map((a) => ({
          data: a.data_abastecimento,
          texto: `Abastecimento registrado · ${Number(a.quantidade_litros).toLocaleString("pt-BR")} L${a.veiculo_placa ? ` · ${a.veiculo_placa}` : ""}`,
          tipo: "abastecimento",
        })),
        ...ocorr.map((o) => ({
          data: o.data_ocorrencia + "T12:00",
          texto: `Ocorrência ${o.categoria} — ${o.descricao.slice(0, 60)}`,
          tipo: "ocorrencia",
        })),
      ];
      setHistorico(eventos.sort((x, y) => new Date(y.data).getTime() - new Date(x.data).getTime()));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    carregar();
    if (typeof window !== "undefined") {
      const q = new URLSearchParams(window.location.search);
      if (q.get("editar")) setEditando(true);
      if (q.get("acesso")) setAba("acesso");
    }
  }, [carregar]);

  async function gerarPin() {
    if (!motorista) return;
    setGerandoPin(true);
    try {
      const r = await api.gerarPinAcesso(motorista.id);
      setPinGerado(r);
      setAcesso(await api.getAcesso(id));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGerandoPin(false);
    }
  }

  async function alternarBloqueio() {
    if (!acesso?.login) return;
    if (!confirm(acesso.bloqueado ? "Desbloquear o acesso deste motorista?" : "Bloquear o acesso deste motorista?")) return;
    try {
      await api.atualizarCredencial(id, {}, !acesso.bloqueado);
      setAcesso(await api.getAcesso(id));
      toast.success(acesso.bloqueado ? "Acesso desbloqueado." : "Acesso bloqueado.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!motorista) return <p className="animate-pulse text-[#737781]">Carregando…</p>;

  const sitCnh = situacaoCnh(motorista.cnh_validade);
  const sitCnhInfo = situacaoCnhInfo(sitCnh);
  const dias = diasRestantesCnh(motorista.cnh_validade);
  const litrosTotal = abastecimentos
    .filter((a) => a.status === "CONFIRMADO")
    .reduce((s, a) => s + Number(a.quantidade_litros), 0);
  const veiculosUsados = new Map<string, { placa: string | null; ultimo: string }>();
  abastecimentos.forEach((a) => {
    const existente = veiculosUsados.get(a.veiculo_id);
    if (!existente || new Date(a.data_abastecimento) > new Date(existente.ultimo)) {
      veiculosUsados.set(a.veiculo_id, { placa: a.veiculo_placa ?? null, ultimo: a.data_abastecimento });
    }
  });
  const ocorrenciasAbertas = ocorrencias.filter((o) => o.status === "ABERTA" || o.status === "EM_ANALISE").length;

  const abas: { chave: Aba; label: string }[] = [
    { chave: "resumo", label: "Resumo" },
    { chave: "abastecimentos", label: `Abastecimentos (${abastecimentos.length})` },
    { chave: "veiculos", label: `Veículos (${veiculosUsados.size})` },
    { chave: "ocorrencias", label: `Ocorrências (${ocorrencias.length})` },
    { chave: "acesso", label: "Acesso" },
    { chave: "historico", label: "Histórico" },
  ];

  return (
    <RequirePermission perms={["driver.manage", "vehicle.view"]}>
      <MotoristaFormDrawer
        aberto={editando}
        onClose={() => setEditando(false)}
        motorista={motorista}
        onSalvo={carregar}
      />

      <div className="space-y-4">
        <Link href="/motoristas" className="inline-flex items-center gap-1 text-body-sm text-[#737781] hover:text-[#1D5BD6]">
          <ArrowLeft size={15} /> Motoristas
        </Link>

        {/* Cabeçalho */}
        <div className="flex flex-col gap-4 rounded-card border border-[#C3C6D1]/20 bg-white p-5 shadow-card md:flex-row md:items-center">
          <AvatarMotorista src={motorista.foto_url} nome={motorista.nome} className="h-20 w-20 flex-shrink-0 text-2xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-[#181C22]">{motorista.nome}</h1>
              <span className={`rounded-pill px-2.5 py-0.5 text-meta font-medium ${motorista.ativo ? "bg-[#9DF6B3] text-[#106D34]" : "bg-gray-100 text-gray-600"}`}>
                {motorista.ativo ? "Ativo" : "Inativo"}
              </span>
            </div>
            <div className="mt-1 text-body-sm text-[#424750]">
              {podeGerir ? `CPF ${formatarCpf(motorista.cpf)}` : `CPF ${mascararCpf(motorista.cpf)}`}
              {motorista.matricula ? ` · Matrícula ${motorista.matricula}` : ""}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-body-sm text-[#424750]">
              {motorista.cnh_categoria && (
                <span className="font-mono font-bold text-[#1D5BD6]">CNH {motorista.cnh_categoria}</span>
              )}
              {motorista.cnh_validade && (
                <>
                  <span className="tabular-nums">Válida até {new Date(motorista.cnh_validade + "T12:00").toLocaleDateString("pt-BR")}</span>
                  <BadgeCnhBadge sit={sitCnhInfo.rotulo} classe={sitCnhInfo.classe} />
                </>
              )}
            </div>
            {sitCnh === "VENCIDA" && (
              <p className="mt-1 text-sm font-medium text-[#BA1A1A]">CNH vencida. Acesso operacional pode estar bloqueado pela política da organização.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {podeGerir && (
              <>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditando(true)}>
                  <Pencil size={14} /> Editar
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setAba("acesso")}>
                  <KeyRound size={14} /> Gerenciar acesso
                </button>
              </>
            )}
          </div>
        </div>

        {/* Abas */}
        <div className="flex gap-1 overflow-x-auto border-b border-[#E4E7EC]">
          {abas.map((a) => (
            <button key={a.chave} onClick={() => setAba(a.chave)} className={`whitespace-nowrap px-4 py-2 text-body-sm ${aba === a.chave ? "border-b-2 border-[#1D5BD6] font-medium text-[#1D5BD6]" : "text-[#424750]"}`}>
              {a.label}
            </button>
          ))}
        </div>

        {/* Resumo */}
        {aba === "resumo" && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Info titulo="Total de abastecimentos" valor={String(abastecimentos.filter((a) => a.status === "CONFIRMADO").length)} />
              <Info titulo="Litros abastecidos" valor={`${litrosTotal.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L`} />
              <Info titulo="Veículos utilizados" valor={String(veiculosUsados.size)} />
              <Info titulo="Ocorrências abertas" valor={String(ocorrenciasAbertas)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Info titulo="Telefone" valor={motorista.telefone || "—"} />
              <Info titulo="E-mail" valor={motorista.email || "—"} />
              <Info titulo="Situação CNH" valor={sitCnhInfo.rotulo} />
              {dias !== null && dias >= 0 && <Info titulo="Dias para vencimento CNH" valor={`${dias} dia(s)`} />}
              <Info titulo="Matrícula" valor={motorista.matricula || "—"} />
              {motorista.observacoes && <Info titulo="Observações" valor={motorista.observacoes} />}
            </div>
          </>
        )}

        {/* Abastecimentos */}
        {aba === "abastecimentos" && (
          <Tabela>
            <thead>
              <tr className="border-b border-[#E4E7EC] bg-[#EFF4FF] text-left text-meta text-[#737781]">
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Veículo</th>
                <th className="px-4 py-3">Combustível</th>
                <th className="px-4 py-3">Litros</th>
                <th className="px-4 py-3">KM</th>
                <th className="px-4 py-3">Tanque</th>
              </tr>
            </thead>
            <tbody>
              {abastecimentos.length === 0 && <Vazio colSpan={6} texto="Nenhum abastecimento." />}
              {abastecimentos.map((a) => (
                <tr key={a.id} className="border-b border-[#E4E7EC] last:border-0">
                  <td className="px-4 py-3 tabular-nums">{new Date(a.data_abastecimento).toLocaleDateString("pt-BR")}</td>
                  <td className="px-4 py-3">
                    <Link href={`/veiculos/${a.veiculo_id}`} className="font-medium text-[#1D5BD6] hover:underline">{a.veiculo_placa ?? "—"}</Link>
                  </td>
                  <td className="px-4 py-3">{a.combustivel_nome ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{Number(a.quantidade_litros).toLocaleString("pt-BR")} L</td>
                  <td className="px-4 py-3 tabular-nums">{a.quilometragem.toLocaleString("pt-BR")} km</td>
                  <td className="px-4 py-3">{a.tanque_nome ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}

        {/* Veículos utilizados */}
        {aba === "veiculos" && (
          <div className="rounded-card border border-[#C3C6D1]/20 bg-white shadow-card">
            <ul className="divide-y divide-[#E4E7EC]">
              {veiculosUsados.size === 0 && <li className="px-4 py-8 text-center text-[#737781]">Nenhum veículo utilizado.</li>}
              {Array.from(veiculosUsados.entries()).map(([veiculoId, info]) => (
                <li key={veiculoId} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="font-mono font-bold text-[#1D5BD6]">{info.placa ?? "—"}</div>
                    <div className="text-meta text-[#737781]">Veículo {veiculoId.slice(0, 8)}…</div>
                  </div>
                  <span className="text-meta text-[#737781]">Último uso: {new Date(info.ultimo).toLocaleDateString("pt-BR")}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Ocorrências */}
        {aba === "ocorrencias" && (
          <div className="rounded-card border border-[#C3C6D1]/20 bg-white shadow-card">
            <ul className="divide-y divide-[#E4E7EC]">
              {ocorrencias.length === 0 && <li className="px-4 py-8 text-center text-[#737781]">Sem ocorrências.</li>}
              {ocorrencias.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div>
                    <span className="text-body-sm font-medium">{o.categoria}</span>
                    <span className={`ml-2 rounded-pill px-2 py-0.5 text-meta ${GRAVIDADE_CLASSE[o.gravidade] ?? ""}`}>{o.gravidade}</span>
                    <span className="ml-2 text-meta text-[#737781]">{o.status.replace("_", " ")}</span>
                    <p className="text-meta text-[#737781]">{o.descricao}</p>
                  </div>
                  <span className="text-meta text-[#737781]">{new Date(o.data_ocorrencia + "T12:00").toLocaleDateString("pt-BR")}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Acesso */}
        {aba === "acesso" && (
          <div className="rounded-card border border-[#C3C6D1]/20 bg-white p-5 shadow-card">
            <h3 className="text-label font-semibold text-[#181C22]">Acesso ao GovFrota Motorista</h3>
            <div className="mt-4 space-y-3">
              <Info titulo="Status" valor={acesso?.login ? (acesso.bloqueado ? "Bloqueado" : "Ativo") : "Sem acesso"} />
              <Info titulo="Usuário" valor={acesso?.login ?? "—"} />
              <Info titulo="Último acesso" valor={acesso?.ultimo_acesso ? new Date(acesso.ultimo_acesso).toLocaleString("pt-BR") : "Nunca acessou"} />
            </div>
            {podeGerir && (
              <div className="mt-5 flex flex-wrap gap-2">
                <button className="btn btn-primary btn-sm" onClick={gerarPin} disabled={gerandoPin}>
                  <KeyRound size={14} /> {acesso?.login ? (gerandoPin ? "Gerando…" : "Redefinir PIN") : "Criar acesso"}
                </button>
                {acesso?.login && (
                  <button className="btn btn-secondary btn-sm" onClick={alternarBloqueio}>
                    {acesso.bloqueado ? "Desbloquear acesso" : "Bloquear acesso"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Histórico */}
        {aba === "historico" && (
          <div className="rounded-card border border-[#C3C6D1]/20 bg-white shadow-card">
            <ul className="divide-y divide-[#E4E7EC]">
              {historico.length === 0 && <li className="px-4 py-8 text-center text-[#737781]">Nenhum evento registrado.</li>}
              {historico.map((h, i) => (
                <li key={i} className="flex items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <span className={`rounded-pill px-2 py-0.5 text-meta ${h.tipo === "abastecimento" ? "bg-[#D9E2FF] text-[#1D5BD6]" : "bg-[#FFDD9A] text-[#805600]"}`}>{h.tipo}</span>{" "}
                    <span className="text-body-sm text-[#424750]">{h.texto}</span>
                  </div>
                  <span className="shrink-0 text-meta text-[#737781]">{new Date(h.data).toLocaleDateString("pt-BR")}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Modal PIN provisório */}
      {pinGerado && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setPinGerado(null)} />
          <div className="relative w-full max-w-sm rounded-card bg-white p-5 shadow-elevated">
            <div className="mb-2 flex items-center gap-2">
              <ShieldCheck size={20} className="text-[#1D5BD6]" />
              <h3 className="text-h3 text-[#181C22]">Acesso criado com sucesso</h3>
            </div>
            <div className="space-y-3 text-body-sm text-[#424750]">
              <div>
                <div className="text-meta text-[#737781]">Usuário</div>
                <div className="font-medium text-[#181C22]">{pinGerado.login}</div>
              </div>
              <div>
                <div className="text-meta text-[#737781]">PIN provisório</div>
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-[#EFF4FF] px-3 py-1.5 font-mono text-2xl font-bold tracking-widest text-[#1D5BD6]">{pinGerado.pin_provisorio}</span>
                  <button
                    className="rounded-lg p-2 text-[#1D5BD6] hover:bg-[#EFF4FF]"
                    onClick={() => navigator.clipboard?.writeText(pinGerado.pin_provisorio).then(() => toast.success("PIN copiado."))}
                    aria-label="Copiar PIN"
                  >
                    <Copy size={18} />
                  </button>
                </div>
              </div>
              <div>
                <div className="text-meta text-[#737781]">Endereço de acesso</div>
                <div className="font-medium text-[#181C22]">frota.govsistem.com.br/motorista</div>
              </div>
              <p className="rounded-lg bg-[#FFDD9A] px-3 py-2 text-meta font-medium text-[#805600]">
                Copie agora. Por segurança, este PIN não será exibido novamente.
              </p>
            </div>
            <div className="mt-4 flex justify-end">
              <button className="btn btn-primary btn-sm" onClick={() => setPinGerado(null)}>Entendi</button>
            </div>
          </div>
        </div>
      )}
    </RequirePermission>
  );
}

function BadgeCnhBadge({ sit, classe }: { sit: string; classe: string }) {
  return <span className={`rounded-pill px-2 py-0.5 text-meta font-medium ${classe}`}>{sit}</span>;
}

function Tabela({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-card border border-[#C3C6D1]/20 bg-white shadow-card">
      <table className="w-full min-w-160 text-body-sm">{children}</table>
    </div>
  );
}

function Vazio({ colSpan, texto }: { colSpan: number; texto: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-[#737781]">{texto}</td>
    </tr>
  );
}

function Info({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-card border border-[#C3C6D1]/20 bg-white p-4 shadow-card">
      <div className="text-meta text-[#737781]">{titulo}</div>
      <div className="text-h3 text-[#181C22]">{valor}</div>
    </div>
  );
}
