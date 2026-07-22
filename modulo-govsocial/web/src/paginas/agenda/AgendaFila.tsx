import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { CalendarClock, Plus } from "lucide-react";
import { Abas } from "@/ui/Abas";
import { Skeleton } from "@/ui/Skeleton";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { EstadoErro } from "@/ui/EstadoErro";
import { EstadoSemPermissao } from "@/ui/EstadoSemPermissao";
import { Botao } from "@/ui/Botao";
import { avisar } from "@/ui/Toast";
import { useUnidadeAtual } from "@/contextos/UnidadeAtualProvider";
import { useSessao } from "@/nucleo/auth/SessaoProvider";
import { usePermissoes } from "@/nucleo/permissoes/usePermissao";
import { useAgendaSemana, useFilaDoDia } from "@/nucleo/api/hooks";
import { servicoAgenda } from "@/nucleo/api/agenda";
import { servicoPessoas } from "@/nucleo/api/pessoas";
import { queryClient } from "@/nucleo/query/queryClient";
import { formatarDataHora } from "@/nucleo/datas";
import { ErroApi } from "@/nucleo/http/problemDetails";
import type { AppointmentOut } from "@/tipos/agenda";
import { CartaoFila, type AcaoFila } from "./CartaoFila";
import { rotuloStatusAgendamento, rotuloTipoAgendamento } from "./rotulos";
import { ModalNovoAgendamento } from "./ModalNovoAgendamento";

/**
 * Agenda & Fila do dia (§4.6). Duas visões em abas:
 * - Fila do dia: kanban de 3 colunas (Aguardando → Em atendimento → Concluído),
 *   com check-in e "chamar" por um clique.
 * - Agenda: lista dos agendamentos do dia por horário.
 * O contexto é a unidade selecionada no cabeçalho. A recepção também acessa.
 */
export default function AgendaFila() {
  const { tem } = usePermissoes();
  const { unidadeAtual } = useUnidadeAtual();
  const [aba, setAba] = useState("fila");
  const [modalAberto, setModalAberto] = useState(false);

  const podeAgendar = tem("atendimento.registrar");

  // Agenda & Fila são acessíveis a quem vê o menu (recepção/técnico/coord).
  // Guard de rota já barra perfis sem acesso; aqui garantimos a leitura mínima.
  const podeVer = tem("familia.ler");
  if (!podeVer) return <EstadoSemPermissao />;

  return (
    <section aria-labelledby="titulo-agenda" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 id="titulo-agenda" className="text-xl">
          Agenda &amp; Fila do dia
        </h1>
        <div className="flex items-center gap-3">
          {unidadeAtual && (
            <p className="text-sm text-ink-soft">
              Unidade: <span className="font-semibold text-ink">{unidadeAtual.nome}</span>
            </p>
          )}
          {podeAgendar && unidadeAtual && (
            <Botao
              variante="primario"
              tamanho="sm"
              iconeInicio={<Plus className="w-4 h-4" />}
              onClick={() => setModalAberto(true)}
            >
              Novo agendamento
            </Botao>
          )}
        </div>
      </div>

      <Abas
        rotulo="Visões da agenda"
        ativa={aba}
        aoMudar={setAba}
        abas={[
          { id: "fila", rotulo: "Fila do dia", conteudo: <FilaDoDia unitId={unidadeAtual?.id} /> },
          { id: "agenda", rotulo: "Agenda do dia", conteudo: <AgendaDoDia unitId={unidadeAtual?.id} /> },
        ]}
      />

      {unidadeAtual && (
        <ModalNovoAgendamento
          aberto={modalAberto}
          aoFechar={() => setModalAberto(false)}
          unitId={unidadeAtual.id}
        />
      )}
    </section>
  );
}

/** Hook local: resolve nomes de pessoas a partir dos agendamentos. */
function useNomes(itens: AppointmentOut[]): Map<string, string> {
  const personIds = useMemo(
    () => [...new Set(itens.map((a) => a.person_id).filter(Boolean) as string[])],
    [itens],
  );
  const pessoasQ = useQueries({
    queries: personIds.map((id) => ({
      queryKey: ["pessoa", id],
      queryFn: () => servicoPessoas.obter(id),
      staleTime: 60_000,
    })),
  });
  return useMemo(() => {
    const mapa = new Map<string, string>();
    personIds.forEach((id, idx) => {
      const nome = pessoasQ[idx]?.data?.nome_exibicao;
      if (nome) mapa.set(id, nome);
    });
    return mapa;
  }, [personIds, pessoasQ]);
}

function nomeDo(a: AppointmentOut, nomes: Map<string, string>): string {
  return (a.person_id && nomes.get(a.person_id)) || "Cidadão(ã)";
}

function FilaDoDia({ unitId }: { unitId?: string }) {
  const { usuario } = useSessao();
  const { data, isLoading, isError, error, refetch } = useFilaDoDia(unitId);
  const agendaQ = useAgendaSemana(unitId);

  // A fila (aguardando/agendado) + os em atendimento/concluídos da agenda do dia.
  const todos = useMemo(() => {
    const mapa = new Map<string, AppointmentOut>();
    for (const a of data ?? []) mapa.set(a.id, a);
    for (const a of agendaQ.data ?? []) {
      if (["EM_ATENDIMENTO", "CONCLUIDO"].includes(a.status)) mapa.set(a.id, a);
    }
    return [...mapa.values()];
  }, [data, agendaQ.data]);

  const nomes = useNomes(todos);

  const checkIn = useMutation({
    mutationFn: (id: string) => servicoAgenda.atualizar(id, { status: "AGUARDANDO" }),
    onSuccess: () => {
      avisar.sucesso("Check-in realizado.");
      invalidar(unitId);
    },
    onError: (e) => avisar.erro(e instanceof ErroApi ? e.message : "Não foi possível fazer o check-in."),
  });

  const chamar = useMutation({
    mutationFn: (id: string) => {
      if (!usuario?.id) throw new Error("Usuário não identificado");
      return servicoAgenda.chamar(id, usuario.id);
    },
    onSuccess: () => {
      avisar.sucesso("Cidadão chamado para atendimento.");
      invalidar(unitId);
    },
    onError: (e) => avisar.erro(e instanceof ErroApi ? e.message : "Não foi possível chamar."),
  });

  const concluir = useMutation({
    mutationFn: (id: string) => servicoAgenda.atualizar(id, { status: "CONCLUIDO" }),
    onSuccess: () => {
      avisar.sucesso("Atendimento concluído.");
      invalidar(unitId);
    },
    onError: (e) => avisar.erro(e instanceof ErroApi ? e.message : "Não foi possível concluir."),
  });

  if (isLoading) return <Skeleton variante="tabela" linhas={4} />;
  if (isError) {
    return <EstadoErro problema={(error as ErroApi).problema} aoTentarNovamente={() => refetch()} />;
  }

  const aguardando = todos.filter((a) => a.status === "AGUARDANDO" || a.status === "AGENDADO");
  const emAtendimento = todos.filter((a) => a.status === "EM_ATENDIMENTO");
  const concluidos = todos.filter((a) => a.status === "CONCLUIDO");

  const acoesAguardando = (a: AppointmentOut): AcaoFila[] => {
    if (a.status === "AGENDADO") {
      return [{ rotulo: "Fazer check-in", variante: "primario", aoClicar: () => checkIn.mutate(a.id) }];
    }
    return [{ rotulo: "Chamar", variante: "primario", aoClicar: () => chamar.mutate(a.id) }];
  };

  return (
    <div className="grid gap-4 md:grid-cols-3" aria-label="Fila do dia em três colunas">
      <ColunaKanban titulo="Aguardando" total={aguardando.length}>
        {aguardando.length === 0 ? (
          <VazioColuna texto="Ninguém aguardando." />
        ) : (
          aguardando.map((a) => (
            <CartaoFila key={a.id} agendamento={a} nome={nomeDo(a, nomes)} acoes={acoesAguardando(a)} />
          ))
        )}
      </ColunaKanban>

      <ColunaKanban titulo="Em atendimento" total={emAtendimento.length}>
        {emAtendimento.length === 0 ? (
          <VazioColuna texto="Nenhum atendimento em curso." />
        ) : (
          emAtendimento.map((a) => (
            <CartaoFila
              key={a.id}
              agendamento={a}
              nome={nomeDo(a, nomes)}
              acoes={[{ rotulo: "Concluir", variante: "secundario", aoClicar: () => concluir.mutate(a.id) }]}
            />
          ))
        )}
      </ColunaKanban>

      <ColunaKanban titulo="Concluído" total={concluidos.length}>
        {concluidos.length === 0 ? (
          <VazioColuna texto="Nada concluído ainda hoje." />
        ) : (
          concluidos.map((a) => <CartaoFila key={a.id} agendamento={a} nome={nomeDo(a, nomes)} />)
        )}
      </ColunaKanban>
    </div>
  );
}

function ColunaKanban({
  titulo,
  total,
  children,
}: {
  titulo: string;
  total: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-cartao border border-ink-soft/15 bg-paper/60 p-2">
      <h2 className="mb-2 px-1 text-sm font-semibold text-ink">
        {titulo} <span className="text-ink-soft">({total})</span>
      </h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function VazioColuna({ texto }: { texto: string }) {
  return (
    <p className="rounded-input border border-dashed border-ink-soft/25 p-3 text-center text-xs text-ink-soft">
      {texto}
    </p>
  );
}

function AgendaDoDia({ unitId }: { unitId?: string }) {
  const { data, isLoading, isError, error, refetch } = useAgendaSemana(unitId);
  const itens = useMemo(() => data ?? [], [data]);
  const nomes = useNomes(itens);

  if (isLoading) return <Skeleton variante="tabela" linhas={4} />;
  if (isError) {
    return <EstadoErro problema={(error as ErroApi).problema} aoTentarNovamente={() => refetch()} />;
  }
  if (itens.length === 0) {
    return (
      <EstadoVazio
        titulo="Sem agendamentos para hoje"
        descricao="Nenhum atendimento marcado nesta unidade para o dia de hoje."
        icone={<CalendarClock className="h-8 w-8" />}
      />
    );
  }

  return (
    <ul className="space-y-2">
      {itens.map((a) => (
        <li
          key={a.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-input border border-ink-soft/15 bg-surface p-3"
        >
          <div>
            <p className="font-semibold text-ink">
              {a.senha ? `${a.senha} · ` : ""}
              {nomeDo(a, nomes)}
            </p>
            <p className="text-sm text-ink-soft">
              {formatarDataHora(a.data_hora_inicio)} · {rotuloTipoAgendamento(a.tipo)}
            </p>
          </div>
          <span className="text-xs font-semibold text-ink-soft">
            {rotuloStatusAgendamento(a.status)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function invalidar(unitId?: string) {
  void queryClient.invalidateQueries({ queryKey: ["fila-dia", unitId ?? "todos"] });
  void queryClient.invalidateQueries({ queryKey: ["agenda", unitId ?? "todos"] });
}
