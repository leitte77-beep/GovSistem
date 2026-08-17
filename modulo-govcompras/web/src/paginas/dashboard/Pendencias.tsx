import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/nucleo/http/clienteHttp";
import { useSessao } from "@/nucleo/auth/SessaoProvider";
import type { Pagina, ProcessoResumo, Setor } from "@/nucleo/tipos";
import { Cartao, CartaoCabecalho, CartaoCorpo, ChipSLA, EstadoVazio, SkeletonLinhas, Botao } from "@/ui";

export function Pendencias() {
  const { usuario } = useSessao();

  const { data: setores } = useQuery({
    queryKey: ["setores"],
    queryFn: () => api.get<Setor[]>("/setores"),
  });

  const meuSetor = useMemo(
    () => setores?.find((s) => s.id === usuario?.setor_id) ?? null,
    [setores, usuario],
  );

  const { data: processos, isLoading } = useQuery({
    queryKey: ["processos", "em-andamento-para-pendencias"],
    queryFn: () => api.get<Pagina<ProcessoResumo>>("/processos", { status_geral: "em_andamento", por_pagina: 100 }),
  });

  const meus = useMemo(() => {
    if (!processos) return [];
    return processos.itens.filter(
      (p) => p.responsavel_usuario === usuario?.nome || (meuSetor && p.responsavel_setor === meuSetor.nome),
    );
  }, [processos, usuario, meuSetor]);

  const urgentes = meus.filter((p) => p.status_sla === "atrasado" || p.status_sla === "critico");
  const demais = meus.filter((p) => p.status_sla !== "atrasado" && p.status_sla !== "critico");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Minhas Pendências</h1>
        <p className="text-sm text-slate-500">
          Processos parados no seu setor{meuSetor ? ` (${meuSetor.nome})` : ""} ou atribuídos a você.
        </p>
      </div>

      <Cartao>
        <CartaoCabecalho titulo="Urgentes" descricao="Além do prazo interno configurado para a etapa" />
        <CartaoCorpo>
          {isLoading ? (
            <SkeletonLinhas quantidade={3} />
          ) : urgentes.length === 0 ? (
            <EstadoVazio titulo="Nada urgente no momento" />
          ) : (
            <ListaPendencias itens={urgentes} />
          )}
        </CartaoCorpo>
      </Cartao>

      <Cartao>
        <CartaoCabecalho titulo="Demais pendências" />
        <CartaoCorpo>
          {isLoading ? (
            <SkeletonLinhas quantidade={3} />
          ) : demais.length === 0 ? (
            <EstadoVazio titulo="Nenhuma outra pendência" descricao="Tudo o mais está fora do seu setor ou concluído." />
          ) : (
            <ListaPendencias itens={demais} />
          )}
        </CartaoCorpo>
      </Cartao>
    </div>
  );
}

function ListaPendencias({ itens }: { itens: ProcessoResumo[] }) {
  return (
    <ul className="divide-y divide-slate-100">
      {itens.map((processo) => (
        <li key={processo.id} className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-800">
              {processo.numero_processo} — {processo.objeto}
            </p>
            <p className="text-xs text-slate-500">
              {processo.secretaria_nome} · aguardando {processo.etapa_atual_nome} há {processo.dias_na_etapa}{" "}
              dia(s)
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ChipSLA status={processo.status_sla} />
            <Link to={`/processos/${processo.id}`}>
              <Botao variante="secundario" tamanho="sm">
                Abrir processo
              </Botao>
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
