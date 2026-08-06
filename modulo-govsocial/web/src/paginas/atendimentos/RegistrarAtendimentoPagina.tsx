import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarClock, Lock, Users } from "lucide-react";
import { Select } from "@/ui/Select";
import { Input } from "@/ui/Input";
import { Botao } from "@/ui/Botao";
import { Checkbox } from "@/ui/Checkbox";
import { Skeleton } from "@/ui/Skeleton";
import { EstadoErro } from "@/ui/EstadoErro";
import { avisar } from "@/ui/Toast";
import { EditorEvolucao } from "@/ui/EditorEvolucao";
import { SeletorMembros } from "@/paginas/familias/SeletorMembros";
import { useFamilia } from "@/nucleo/api/hooks";
import { useSessao } from "@/nucleo/auth/SessaoProvider";
import { useUnidadeAtual } from "@/contextos/UnidadeAtualProvider";
import { useSincronizacao } from "@/nucleo/offline/SincronizacaoProvider";
import { useEstadoConexao } from "@/nucleo/offline/estadoConexao";
import {
  criarAtendimento,
  resolverProntuario,
  servicoDominios,
  type PayloadAtendimento,
} from "@/nucleo/api/atendimento";
import { novaChaveIdempotencia } from "@/nucleo/http/idempotencia";
import { ErroApi } from "@/nucleo/http/problemDetails";
import {
  apagarRascunho,
  chaveRascunho,
  lerRascunho,
  salvarRascunho,
} from "@/nucleo/offline/rascunhos";
import { enfileirar } from "@/nucleo/offline/filaSync";
import { TIPO_ATENDIMENTO } from "@/i18n/dominios";
import { queryClient } from "@/nucleo/query/queryClient";
import type { ErroApi as TipoErroApi } from "@/nucleo/http/problemDetails";
import type { FamilyOut } from "@/tipos/pessoas";

const TIPO_RASCUNHO = "atendimento";

type RascunhoAtendimento = {
  dataHora: string;
  serviceCode: string;
  tipo: string;
  evolucao: string;
  reforcado: boolean;
  membros: string[];
};

/** Ação encadeada disparada após salvar (§4.3). */
export type AcaoEncadeada = "encaminhar" | "beneficio" | "retorno";

/**
 * Página dedicada "Registrar atendimento" (§4.3) — meta de fluxo ≤ 2 min.
 * Substitui o SlideOver: dá espaço de trabalho completo para a evolução
 * técnica, mantendo data/hora pré-preenchidas, serviço (tipificados), tipo,
 * membros por chips, autosave em IndexedDB, sigilo e ações encadeadas.
 * Funciona offline: sem conexão (ou falha de rede), enfileira e avisa.
 */
export default function RegistrarAtendimentoPagina() {
  const { familiaId } = useParams<{ familiaId: string }>();
  const familiaQ = useFamilia(familiaId);

  if (familiaQ.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton variante="cartao" />
        <Skeleton variante="trilha" linhas={3} />
      </div>
    );
  }
  if (familiaQ.isError) {
    return (
      <EstadoErro
        problema={(familiaQ.error as TipoErroApi).problema}
        aoTentarNovamente={() => familiaQ.refetch()}
      />
    );
  }
  if (!familiaQ.data) return null;

  return <FormularioAtendimento familia={familiaQ.data} />;
}

function FormularioAtendimento({ familia }: { familia: FamilyOut }) {
  const navigate = useNavigate();
  const { usuario } = useSessao();
  const { unidadeAtual } = useUnidadeAtual();
  const { online } = useEstadoConexao();
  const { atualizarPendentes } = useSincronizacao();
  const usuarioId = usuario?.id ?? "anon";

  const [dataHora, setDataHora] = useState(() => agoraLocalInput());
  const [serviceCode, setServiceCode] = useState("");
  const [tipo, setTipo] = useState("FAMILIAR");
  const [evolucao, setEvolucao] = useState("");
  const [reforcado, setReforcado] = useState(false);
  const [membros, setMembros] = useState<Set<string>>(new Set());
  const [rascunhoEm, setRascunhoEm] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const rascunhoTimer = useRef<number | null>(null);

  const servicosQ = useQuery({
    queryKey: ["service-types"],
    queryFn: () => servicoDominios.serviceTypes(),
    staleTime: 60_000,
  });

  const opcoesServico = useMemo(
    () =>
      (servicosQ.data ?? []).map((s) => ({
        valor: s.code,
        rotulo: s.sigla ? `${s.sigla} — ${s.nome}` : s.nome,
      })),
    [servicosQ.data],
  );

  // Define o serviço padrão quando a lista chega.
  useEffect(() => {
    if (!serviceCode && opcoesServico.length > 0) setServiceCode(opcoesServico[0].valor);
  }, [opcoesServico, serviceCode]);

  // Recupera rascunho ao abrir (§9).
  useEffect(() => {
    let vivo = true;
    void lerRascunho<RascunhoAtendimento>(usuarioId, TIPO_RASCUNHO, familia.id).then((r) => {
      if (!vivo || !r) return;
      setDataHora(r.dados.dataHora || agoraLocalInput());
      setServiceCode(r.dados.serviceCode);
      setTipo(r.dados.tipo);
      setEvolucao(r.dados.evolucao);
      setReforcado(r.dados.reforcado);
      setMembros(new Set(r.dados.membros));
      setRascunhoEm(r.atualizadoEm);
      avisar.info("Rascunho recuperado deste atendimento.");
    });
    return () => {
      vivo = false;
    };
  }, [usuarioId, familia.id]);

  // Autosave (debounce 800ms) sempre que algo muda.
  useEffect(() => {
    if (rascunhoTimer.current) window.clearTimeout(rascunhoTimer.current);
    rascunhoTimer.current = window.setTimeout(async () => {
      const dados: RascunhoAtendimento = {
        dataHora,
        serviceCode,
        tipo,
        evolucao,
        reforcado,
        membros: [...membros],
      };
      const em = await salvarRascunho(usuarioId, TIPO_RASCUNHO, familia.id, dados);
      setRascunhoEm(em);
    }, 800);
    return () => {
      if (rascunhoTimer.current) window.clearTimeout(rascunhoTimer.current);
    };
  }, [dataHora, serviceCode, tipo, evolucao, reforcado, membros, usuarioId, familia.id]);

  function alternarMembro(id: string) {
    setMembros((s) => {
      const novo = new Set(s);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function voltarParaFicha() {
    navigate(`/familias/${familia.id}`);
  }

  async function salvar(acao?: AcaoEncadeada) {
    if (!unidadeAtual) {
      avisar.erro("Selecione uma unidade antes de registrar o atendimento.");
      return;
    }
    if (!serviceCode) {
      avisar.erro("Selecione o serviço do atendimento.");
      return;
    }
    setEnviando(true);
    const payload: PayloadAtendimento = {
      data_atendimento: new Date(dataHora).toISOString(),
      tipo,
      evolution_text: evolucao || null,
      sigiloso_reforcado: reforcado,
      member_ids: [...membros],
      professional_ids: [],
    };

    try {
      // Sem conexão: enfileira para sincronizar depois (§10).
      if (!online) {
        await enfileirarOffline(payload);
        avisar.info("Sem conexão — o atendimento será enviado ao reconectar.");
        finalizar(acao);
        return;
      }

      const caseFileId = await resolverProntuario(
        familia.id,
        unidadeAtual.id,
        serviceCode,
      );
      await criarAtendimento(caseFileId, payload, novaChaveIdempotencia());
      await apagarRascunho(usuarioId, TIPO_RASCUNHO, familia.id);
      void queryClient.invalidateQueries({ queryKey: ["timeline"] });
      void queryClient.invalidateQueries({ queryKey: ["prontuarios", familia.id] });
      avisar.sucesso("Atendimento registrado.");
      finalizar(acao);
    } catch (e) {
      // Falha de rede: cai para a fila offline (não perde o trabalho).
      if (e instanceof ErroApi && e.offline) {
        await enfileirarOffline(payload);
        avisar.info("Sem conexão — o atendimento entrou na fila de envio.");
        finalizar(acao);
        return;
      }
      avisar.erro(e instanceof ErroApi ? e.message : "Não foi possível registrar.");
    } finally {
      setEnviando(false);
    }
  }

  async function enfileirarOffline(payload: PayloadAtendimento) {
    // Offline: não dá para resolver o prontuário agora; guarda o suficiente para
    // o processador resolver ao reconectar.
    await enfileirar(
      "criar_atendimento",
      {
        case_file_id: "", // resolvido no reenvio
        family_id: familia.id,
        unit_id: unidadeAtual?.id,
        service_type_code: serviceCode,
        atendimento: payload,
        usuarioId,
        registroId: familia.id,
      },
      chaveRascunho(usuarioId, TIPO_RASCUNHO, familia.id),
    );
    await atualizarPendentes();
  }

  function finalizar(acao?: AcaoEncadeada) {
    if (acao === "encaminhar") {
      navigate(`/encaminhamentos?familia=${familia.id}`);
    } else if (acao === "beneficio") {
      navigate(`/beneficios?familia=${familia.id}`);
    } else if (acao === "retorno") {
      navigate("/agenda");
    } else {
      voltarParaFicha();
    }
  }

  const membrosAtivos = familia.membros.filter((m) => m.status === "ATIVO");

  return (
    <section aria-labelledby="atendimento-titulo" className="pb-24">
      {/* Cabeçalho da página */}
      <header className="mb-5">
        <button
          type="button"
          onClick={voltarParaFicha}
          className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline focus-visible:outline-focus"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Voltar para a ficha da família
        </button>
        <h1 id="atendimento-titulo" className="text-xl font-bold text-ink">
          Registrar atendimento
        </h1>
        <p className="mt-0.5 text-sm text-ink-soft">
          Família nº {familia.codigo}
          {familia.responsavel_nome && <> · {familia.responsavel_nome}</>}
          {unidadeAtual && <> · {unidadeAtual.nome}</>}
        </p>
      </header>

      <div className="grid gap-5 xl:grid-cols-3">
        {/* Coluna principal — dados e evolução */}
        <div className="space-y-5 xl:col-span-2">
          <fieldset className="rounded-cartao border border-ink-soft/15 bg-surface p-4 md:p-5">
            <legend className="flex items-center gap-2 px-1 text-sm font-bold text-ink">
              <CalendarClock className="h-4 w-4 text-primary" aria-hidden />
              Dados do atendimento
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Data e hora"
                type="datetime-local"
                value={dataHora}
                onChange={(e) => setDataHora(e.target.value)}
              />
              <Select
                label="Serviço"
                opcoes={opcoesServico}
                value={serviceCode}
                onChange={(e) => setServiceCode(e.target.value)}
                placeholder={servicosQ.isLoading ? "Carregando…" : "Selecione"}
                obrigatorio
              />
              <Select
                label="Tipo de atendimento"
                opcoes={TIPO_ATENDIMENTO}
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
              />
            </div>
          </fieldset>

          <div className="rounded-cartao border border-ink-soft/15 bg-surface p-4 md:p-5">
            <EditorEvolucao
              valor={evolucao}
              aoMudar={setEvolucao}
              rascunhoEm={rascunhoEm}
              minAltura="min-h-[320px]"
            />
          </div>
        </div>

        {/* Coluna lateral — membros e privacidade */}
        <div className="space-y-5">
          <fieldset className="rounded-cartao border border-ink-soft/15 bg-surface p-4 md:p-5">
            <legend className="flex items-center gap-2 px-1 text-sm font-bold text-ink">
              <Users className="h-4 w-4 text-primary" aria-hidden />
              Membros atendidos
            </legend>
            <p className="mb-3 text-xs text-ink-soft">
              Toque para marcar quem participou do atendimento.
            </p>
            <SeletorMembros
              membros={familia.membros}
              selecionados={membros}
              aoAlternar={alternarMembro}
            />
            {membrosAtivos.length > 0 && (
              <p className="mt-3 text-xs text-ink-soft" aria-live="polite">
                {membros.size} de {membrosAtivos.length}{" "}
                {membrosAtivos.length === 1 ? "membro selecionado" : "membros selecionados"}
              </p>
            )}
          </fieldset>

          <fieldset className="rounded-cartao border border-ink-soft/15 bg-surface p-4 md:p-5">
            <legend className="flex items-center gap-2 px-1 text-sm font-bold text-ink">
              <Lock className="h-4 w-4 text-sensitive" aria-hidden />
              Privacidade
            </legend>
            <Checkbox
              label="Sigilo reforçado"
              dica="Restringe a leitura a você e à coordenação da unidade."
              checked={reforcado}
              onChange={(e) => setReforcado(e.target.checked)}
            />
            {reforcado && (
              <p className="mt-2 flex items-center gap-1 text-xs text-sensitive">
                <Lock aria-hidden className="h-3.5 w-3.5" /> Este atendimento ficará
                como conteúdo restrito na Trilha.
              </p>
            )}
          </fieldset>
        </div>
      </div>

      {/* Barra de ações fixa no rodapé */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-ink-soft/15 bg-paper/95 px-4 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <Botao
              variante="texto"
              tamanho="sm"
              onClick={() => salvar("encaminhar")}
              disabled={enviando}
            >
              Salvar e encaminhar
            </Botao>
            <Botao
              variante="texto"
              tamanho="sm"
              onClick={() => salvar("beneficio")}
              disabled={enviando}
            >
              Salvar e conceder benefício
            </Botao>
            <Botao
              variante="texto"
              tamanho="sm"
              onClick={() => salvar("retorno")}
              disabled={enviando}
            >
              Salvar e agendar retorno
            </Botao>
          </div>
          <div className="flex gap-2">
            <Botao variante="secundario" onClick={voltarParaFicha} disabled={enviando}>
              Cancelar
            </Botao>
            <Botao
              variante="primario"
              onClick={() => salvar()}
              carregando={enviando}
              bloqueiaDuploSubmit
            >
              Salvar atendimento
            </Botao>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Valor "agora" no formato aceito por <input type=datetime-local> (local). */
function agoraLocalInput(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}
