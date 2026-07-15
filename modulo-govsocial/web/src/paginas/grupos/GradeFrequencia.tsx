import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, X, FileText, RotateCcw, WifiOff } from "lucide-react";
import clsx from "clsx";
import { Botao } from "@/ui/Botao";
import { Skeleton } from "@/ui/Skeleton";
import { avisar } from "@/ui/Toast";
import { servicoGrupos } from "@/nucleo/api/grupos";
import { useEstadoConexao } from "@/nucleo/offline/estadoConexao";
import { useSincronizacao } from "@/nucleo/offline/SincronizacaoProvider";
import { enfileirar } from "@/nucleo/offline/filaSync";
import { novaChaveIdempotencia } from "@/nucleo/http/idempotencia";
import { ErroApi } from "@/nucleo/http/problemDetails";
import type { InscricaoOut } from "@/tipos/grupos";
import {
  estadoParaRegistro,
  registroParaEstado,
  resumirChamada,
  ROTULO_PRESENCA,
  type EstadoPresenca,
} from "./frequenciaEstado";

/**
 * <GradeFrequencia> — chamada mobile-first (§4.5). Alvo de toque ≥ 48px,
 * alternância Presente/Falta/Justificada, contador no topo, 100% offline com
 * fila de sincronização e "repetir lista do último encontro".
 *
 * Nomes de participantes exigem o mapa inscricao_id → nome (vindo da página).
 */
export function GradeFrequencia({
  acaoId,
  encontroId,
  inscricoes,
  nomePorInscricao,
  encontroAnteriorId,
  aoEncerrar,
}: {
  acaoId: string;
  encontroId: string;
  inscricoes: InscricaoOut[];
  nomePorInscricao: Map<string, string>;
  encontroAnteriorId?: string | null;
  aoEncerrar?: () => void;
}) {
  const { online } = useEstadoConexao();
  const { atualizarPendentes } = useSincronizacao();
  const ativos = useMemo(
    () => inscricoes.filter((i) => i.status === "ATIVA"),
    [inscricoes],
  );

  // Estado inicial: todos presentes (padrão da chamada).
  const [estados, setEstados] = useState<Record<string, EstadoPresenca>>(() =>
    Object.fromEntries(ativos.map((i) => [i.id, "PRESENTE" as EstadoPresenca])),
  );
  const [justificativas, setJustificativas] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [resumoAberto, setResumoAberto] = useState(false);

  // Frequência já registrada (para carregar estado existente).
  const freqQ = useQuery({
    queryKey: ["frequencia", acaoId, encontroId],
    queryFn: () => servicoGrupos.frequencia(acaoId, encontroId),
  });

  useMemo(() => {
    if (freqQ.data && freqQ.data.length > 0) {
      const novos: Record<string, EstadoPresenca> = {};
      const just: Record<string, string> = {};
      for (const f of freqQ.data) {
        novos[f.inscricao_id] = registroParaEstado(f);
        if (f.justificativa) just[f.inscricao_id] = f.justificativa;
      }
      setEstados((prev) => ({ ...prev, ...novos }));
      setJustificativas((prev) => ({ ...prev, ...just }));
    }
  }, [freqQ.data]);

  const resumo = useMemo(() => resumirChamada(Object.values(estados)), [estados]);

  function definir(inscricaoId: string, estado: EstadoPresenca) {
    setEstados((s) => ({ ...s, [inscricaoId]: estado }));
  }

  async function repetirUltimo() {
    if (!encontroAnteriorId) return;
    try {
      const anterior = await servicoGrupos.frequencia(acaoId, encontroAnteriorId);
      const novos: Record<string, EstadoPresenca> = {};
      for (const f of anterior) novos[f.inscricao_id] = registroParaEstado(f);
      setEstados((s) => ({ ...s, ...novos }));
      avisar.info("Lista do último encontro aplicada.");
    } catch {
      avisar.erro("Não foi possível carregar o último encontro.");
    }
  }

  async function salvar() {
    setSalvando(true);
    const registros = ativos.map((i) =>
      estadoParaRegistro(i.id, estados[i.id] ?? "PRESENTE", justificativas[i.id]),
    );
    try {
      if (!online) {
        await enfileirarOffline(registros);
        avisar.info("Sem conexão — a chamada será enviada ao reconectar.");
        setResumoAberto(true);
        return;
      }
      await servicoGrupos.registrarFrequencia(
        acaoId,
        encontroId,
        registros,
        novaChaveIdempotencia(),
      );
      avisar.sucesso("Chamada registrada.");
      setResumoAberto(true);
    } catch (e) {
      if (e instanceof ErroApi && e.offline) {
        await enfileirarOffline(registros);
        avisar.info("Sem conexão — a chamada entrou na fila de envio.");
        setResumoAberto(true);
        return;
      }
      avisar.erro(e instanceof ErroApi ? e.message : "Não foi possível registrar.");
    } finally {
      setSalvando(false);
    }
  }

  async function enfileirarOffline(registros: ReturnType<typeof estadoParaRegistro>[]) {
    await enfileirar("registrar_frequencia", {
      acao_id: acaoId,
      encontro_id: encontroId,
      registros,
    });
    await atualizarPendentes();
  }

  if (freqQ.isLoading) return <Skeleton variante="tabela" linhas={5} />;

  if (resumoAberto) {
    return (
      <div className="space-y-4 rounded-cartao border border-ink-soft/15 bg-surface p-4 text-center">
        <h3 className="text-base">Chamada encerrada</h3>
        <p className="text-lg">
          {resumo.presentes} presentes · {resumo.faltas} faltas ·{" "}
          {resumo.justificadas} justificadas
        </p>
        <Botao variante="secundario" onClick={() => (aoEncerrar ? aoEncerrar() : setResumoAberto(false))}>
          Concluir
        </Botao>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Contador no topo (sticky) */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-input border border-ink-soft/15 bg-paper/95 p-2 backdrop-blur">
        <p className="text-sm font-semibold" aria-live="polite">
          {resumo.presentes} presentes · {resumo.faltas} faltas · {resumo.justificadas}{" "}
          justificadas
        </p>
        <div className="flex items-center gap-2">
          {!online && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber">
              <WifiOff aria-hidden className="h-4 w-4" /> offline
            </span>
          )}
          {encontroAnteriorId && (
            <Botao
              variante="texto"
              tamanho="sm"
              onClick={repetirUltimo}
              iconeInicio={<RotateCcw className="h-4 w-4" aria-hidden />}
            >
              Repetir último encontro
            </Botao>
          )}
        </div>
      </div>

      {ativos.length === 0 ? (
        <p className="text-sm text-ink-soft">Nenhum participante ativo inscrito.</p>
      ) : (
        <ul className="space-y-2" aria-label="Lista de presença">
          {ativos.map((i) => {
            const estado = estados[i.id] ?? "PRESENTE";
            const nome = nomePorInscricao.get(i.id) ?? "Participante";
            return (
              <li
                key={i.id}
                className="rounded-input border border-ink-soft/15 bg-surface p-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-ink">{nome}</span>
                  <span
                    className={clsx(
                      "text-xs font-semibold",
                      estado === "PRESENTE" && "text-primary",
                      estado === "FALTA" && "text-danger",
                      estado === "JUSTIFICADA" && "text-amber",
                    )}
                  >
                    {ROTULO_PRESENCA[estado]}
                  </span>
                </div>
                <div
                  role="radiogroup"
                  aria-label={`Presença de ${nome}`}
                  className="mt-2 grid grid-cols-3 gap-1"
                >
                  <BotaoPresenca
                    ativo={estado === "PRESENTE"}
                    cor="primary"
                    onClick={() => definir(i.id, "PRESENTE")}
                    icone={<Check className="h-5 w-5" aria-hidden />}
                    rotulo="Presente"
                  />
                  <BotaoPresenca
                    ativo={estado === "FALTA"}
                    cor="danger"
                    onClick={() => definir(i.id, "FALTA")}
                    icone={<X className="h-5 w-5" aria-hidden />}
                    rotulo="Falta"
                  />
                  <BotaoPresenca
                    ativo={estado === "JUSTIFICADA"}
                    cor="amber"
                    onClick={() => definir(i.id, "JUSTIFICADA")}
                    icone={<FileText className="h-5 w-5" aria-hidden />}
                    rotulo="Justificada"
                  />
                </div>
                {estado === "JUSTIFICADA" && (
                  <input
                    aria-label={`Justificativa de ${nome}`}
                    placeholder="Motivo da falta (opcional)"
                    value={justificativas[i.id] ?? ""}
                    onChange={(e) =>
                      setJustificativas((j) => ({ ...j, [i.id]: e.target.value }))
                    }
                    className="mt-2 min-h-[44px] w-full rounded-input border border-ink-soft/30 px-2 text-sm focus-visible:outline-focus"
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="sticky bottom-0 bg-paper/95 py-2 backdrop-blur">
        <Botao
          variante="primario"
          onClick={salvar}
          carregando={salvando}
          bloqueiaDuploSubmit
          className="w-full"
        >
          Encerrar chamada
        </Botao>
      </div>
    </div>
  );
}

function BotaoPresenca({
  ativo,
  cor,
  onClick,
  icone,
  rotulo,
}: {
  ativo: boolean;
  cor: "primary" | "danger" | "amber";
  onClick: () => void;
  icone: React.ReactNode;
  rotulo: string;
}) {
  const cores = {
    primary: ativo ? "border-primary bg-primary text-white" : "border-ink-soft/30 text-primary",
    danger: ativo ? "border-danger bg-danger text-white" : "border-ink-soft/30 text-danger",
    amber: ativo ? "border-amber bg-amber text-white" : "border-ink-soft/30 text-amber",
  }[cor];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={ativo}
      onClick={onClick}
      // Alvo de toque ≥ 48px (§4.5).
      className={clsx(
        "flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-input border text-xs font-semibold focus-visible:outline-focus",
        cores,
      )}
    >
      {icone}
      {rotulo}
    </button>
  );
}
