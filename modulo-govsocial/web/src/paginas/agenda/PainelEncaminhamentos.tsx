import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Inbox, Plus } from "lucide-react";
import { Abas } from "@/ui/Abas";
import { Skeleton } from "@/ui/Skeleton";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { EstadoErro } from "@/ui/EstadoErro";
import { EstadoSemPermissao } from "@/ui/EstadoSemPermissao";
import { Botao } from "@/ui/Botao";
import { usePermissao } from "@/nucleo/permissoes/usePermissao";
import { useUnidadeAtual } from "@/contextos/UnidadeAtualProvider";
import {
  useEncaminhamentosEnviados,
  useEncaminhamentosRecebidos,
} from "@/nucleo/api/hooks";
import { queryClient } from "@/nucleo/query/queryClient";
import type { ErroApi } from "@/nucleo/http/problemDetails";
import type { EncaminhamentoListItem } from "@/tipos/encaminhamentos";
import { ItemEncaminhamento } from "./ItemEncaminhamento";

/**
 * Painel de encaminhamentos (§4.7): duas listas em abas.
 * - Recebidos: aguardando aceite / em atendimento / com devolutiva a dar.
 * - Enviados: aguardando devolutiva (idade em dias, âmbar após o prazo).
 * O contexto é a unidade selecionada no cabeçalho.
 */
export default function PainelEncaminhamentos() {
  const podeCriar = usePermissao("encaminhamento.criar");
  const { unidadeAtual, unidades } = useUnidadeAtual();
  const [aba, setAba] = useState("recebidos");
  const navigate = useNavigate();

  function nomeUnidade(id: string | null): string {
    if (!id) return "—";
    return unidades.find((u) => u.id === id)?.nome ?? "Rede";
  }

  if (!podeCriar) return <EstadoSemPermissao />;

  return (
    <section aria-labelledby="titulo-encaminhamentos" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 id="titulo-encaminhamentos" className="text-xl">
          Encaminhamentos
        </h1>
        <div className="flex items-center gap-3">
          {unidadeAtual && (
            <p className="text-sm text-ink-soft">
              Unidade: <span className="font-semibold text-ink">{unidadeAtual.nome}</span>
            </p>
          )}
          <Botao
            variante="primario"
            tamanho="sm"
            iconeInicio={<Plus className="h-4 w-4" />}
            onClick={() => navigate("/encaminhamentos/novo")}
          >
            Novo Encaminhamento
          </Botao>
        </div>
      </div>

      <Abas
        rotulo="Listas de encaminhamentos"
        ativa={aba}
        aoMudar={setAba}
        abas={[
          {
            id: "recebidos",
            rotulo: "Recebidos",
            conteudo: <Recebidos unitId={unidadeAtual?.id} nomeUnidade={nomeUnidade} />,
          },
          {
            id: "enviados",
            rotulo: "Enviados",
            conteudo: <Enviados unitId={unidadeAtual?.id} nomeUnidade={nomeUnidade} />,
          },
        ]}
      />
    </section>
  );
}

function Recebidos({ unitId, nomeUnidade }: { unitId?: string; nomeUnidade: (id: string | null) => string }) {
  const { data, isLoading, isError, error, refetch } = useEncaminhamentosRecebidos(unitId);
  const itens = useMemo(() => data ?? [], [data]);

  function invalidar() {
    void queryClient.invalidateQueries({ queryKey: ["encaminhamentos", "recebidos", unitId ?? "todos"] });
  }

  if (isLoading) return <Skeleton variante="tabela" linhas={3} />;
  if (isError) {
    return <EstadoErro problema={(error as ErroApi).problema} aoTentarNovamente={() => refetch()} />;
  }
  if (itens.length === 0) {
    return (
      <EstadoVazio
        titulo="Nenhum encaminhamento recebido"
        descricao="Não há encaminhamentos aguardando sua unidade — bom trabalho."
        icone={<Inbox className="h-8 w-8" />}
      />
    );
  }
  return (
    <ul className="space-y-2">
      {itens.map((e: EncaminhamentoListItem) => (
        <li key={e.id}>
          <ItemEncaminhamento
            item={e}
            lado="recebidos"
            nomeUnidade={nomeUnidade}
            aoMudar={invalidar}
          />
        </li>
      ))}
    </ul>
  );
}

function Enviados({ unitId, nomeUnidade }: { unitId?: string; nomeUnidade: (id: string | null) => string }) {
  const { data, isLoading, isError, error, refetch } = useEncaminhamentosEnviados(unitId);
  const itens = useMemo(() => data ?? [], [data]);

  function invalidar() {
    void queryClient.invalidateQueries({ queryKey: ["encaminhamentos", "enviados", unitId ?? "todos"] });
  }

  if (isLoading) return <Skeleton variante="tabela" linhas={3} />;
  if (isError) {
    return <EstadoErro problema={(error as ErroApi).problema} aoTentarNovamente={() => refetch()} />;
  }
  if (itens.length === 0) {
    return (
      <EstadoVazio
        titulo="Nenhum encaminhamento enviado"
        descricao="Encaminhamentos criados a partir da ficha da família aparecem aqui."
        icone={<Send className="h-8 w-8" />}
      />
    );
  }
  return (
    <ul className="space-y-2">
      {itens.map((e: EncaminhamentoListItem) => (
        <li key={e.id}>
          <ItemEncaminhamento
            item={e}
            lado="enviados"
            nomeUnidade={nomeUnidade}
            aoMudar={invalidar}
          />
        </li>
      ))}
    </ul>
  );
}
