import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { api } from "@/nucleo/http/clienteHttp";
import type { Pagina, ProcessoResumo } from "@/nucleo/tipos";
import { ROTULOS_TIPO_PROCESSO } from "@/nucleo/tipos";
import { usePermissao } from "@/nucleo/auth/usePermissao";
import {
  Cartao,
  CartaoCabecalho,
  Tabela,
  type ColunaTabela,
  ChipSLA,
  ChipStatus,
  EstadoVazio,
  Botao,
  Select,
} from "@/ui";

export function ProcessosLista() {
  const navegar = useNavigate();
  const [parametros, definirParametros] = useSearchParams();
  const podeCriar = usePermissao("govcompras.solicitacoes.enviar");

  const tipoProcesso = parametros.get("tipo") ?? "";
  const statusGeral = parametros.get("status_geral") ?? "";
  const apenasAtrasados = parametros.get("apenas_atrasados") === "1";
  const busca = parametros.get("busca") ?? "";

  const { data, isLoading } = useQuery({
    queryKey: ["processos", tipoProcesso, statusGeral, apenasAtrasados],
    queryFn: () =>
      api.get<Pagina<ProcessoResumo>>("/processos", {
        tipo_processo: tipoProcesso || undefined,
        status_geral: statusGeral || undefined,
        apenas_atrasados: apenasAtrasados || undefined,
        por_pagina: 100,
      }),
  });

  const itensFiltrados = useMemo(() => {
    if (!data) return [];
    if (!busca) return data.itens;
    const termo = busca.toLowerCase();
    return data.itens.filter(
      (p) => p.numero_processo.toLowerCase().includes(termo) || p.objeto.toLowerCase().includes(termo),
    );
  }, [data, busca]);

  function atualizarParametro(chave: string, valor: string) {
    const novo = new URLSearchParams(parametros);
    if (valor) novo.set(chave, valor);
    else novo.delete(chave);
    definirParametros(novo);
  }

  const colunas: ColunaTabela<ProcessoResumo>[] = [
    {
      chave: "numero",
      cabecalho: "Processo",
      renderizar: (p) => (
        <div>
          <p className="font-medium text-slate-800">{p.numero_processo}</p>
          <p className="max-w-xs truncate text-xs text-slate-500">{p.objeto}</p>
        </div>
      ),
    },
    { chave: "tipo", cabecalho: "Modalidade", renderizar: (p) => ROTULOS_TIPO_PROCESSO[p.tipo_processo] ?? p.tipo_processo },
    { chave: "secretaria", cabecalho: "Secretaria", renderizar: (p) => p.secretaria_nome ?? "—" },
    {
      chave: "etapa",
      cabecalho: "Etapa atual",
      renderizar: (p) => (
        <div>
          <p className="text-slate-700">{p.etapa_atual_nome ?? "—"}</p>
          <p className="text-xs text-slate-400">{p.responsavel_setor ?? "sem responsável"}</p>
        </div>
      ),
    },
    { chave: "dias", cabecalho: "Nesta etapa", renderizar: (p) => (p.dias_na_etapa !== null ? `${p.dias_na_etapa} dia(s)` : "—") },
    { chave: "sla", cabecalho: "Prazo", renderizar: (p) => <ChipSLA status={p.status_sla} /> },
    { chave: "status", cabecalho: "Status", renderizar: (p) => <ChipStatus status={p.status_geral} /> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Processos</h1>
          <p className="text-sm text-slate-500">
            {busca ? `Resultados para "${busca}"` : "Todos os processos de contratação em andamento e concluídos"}
          </p>
        </div>
        {podeCriar && (
          <Botao icone={<Plus className="size-4" />} onClick={() => navegar("/solicitacoes/nova")}>
            Nova solicitação
          </Botao>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Select
          value={tipoProcesso}
          onChange={(e) => atualizarParametro("tipo", e.target.value)}
          className="w-auto"
        >
          <option value="">Todas as modalidades</option>
          {Object.entries(ROTULOS_TIPO_PROCESSO).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </Select>
        <Select
          value={statusGeral}
          onChange={(e) => atualizarParametro("status_geral", e.target.value)}
          className="w-auto"
        >
          <option value="">Todos os status</option>
          <option value="em_andamento">Em andamento</option>
          <option value="concluido">Concluído</option>
          <option value="cancelado">Cancelado</option>
          <option value="suspenso">Suspenso</option>
        </Select>
        <label className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={apenasAtrasados}
            onChange={(e) => atualizarParametro("apenas_atrasados", e.target.checked ? "1" : "")}
          />
          Somente atrasados
        </label>
      </div>

      <Cartao>
        <CartaoCabecalho titulo={`${itensFiltrados.length} processo(s)`} />
        <Tabela
          colunas={colunas}
          itens={itensFiltrados}
          chavePorItem={(p) => p.id}
          carregando={isLoading}
          aoClicarLinha={(p) => navegar(`/processos/${p.id}`)}
          vazio={
            <EstadoVazio
              titulo="Nenhum processo encontrado"
              descricao="Ajuste os filtros ou crie uma nova solicitação para iniciar um processo."
            />
          }
        />
      </Cartao>
    </div>
  );
}
