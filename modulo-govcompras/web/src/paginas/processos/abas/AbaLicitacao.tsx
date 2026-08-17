import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api } from "@/nucleo/http/clienteHttp";
import { usePermissao } from "@/nucleo/auth/usePermissao";
import { Botao, Campo, Cartao, CartaoCabecalho, CartaoCorpo, Chip, EstadoVazio, Input, Select, Textarea } from "@/ui";

interface Edital {
  id: string;
  numero: string;
  modalidade: string;
  criterio_julgamento: string | null;
  conteudo: string | null;
  status: string;
}
interface Publicacao {
  id: string;
  veiculo: string;
  data_publicacao: string;
  link: string | null;
}
interface Fornecedor {
  id: string;
  razao_social: string;
}
interface Proposta {
  id: string;
  fornecedor_id: string;
  valor_proposto: number;
  situacao: string;
}

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function AbaLicitacao({ processoId }: { processoId: string }) {
  const queryClient = useQueryClient();
  const podeGerenciar = usePermissao("govcompras.licitacao.gerenciar");
  const podePublicar = usePermissao("govcompras.edital.publicar");
  const podeHomologar = usePermissao("govcompras.homologacao.decidir");

  const { data: edital } = useQuery({
    queryKey: ["processo", processoId, "edital"],
    queryFn: () => api.get<Edital | null>(`/processos/${processoId}/edital`),
  });
  const { data: publicacoes } = useQuery({
    queryKey: ["processo", processoId, "publicacoes"],
    queryFn: () => api.get<Publicacao[]>(`/processos/${processoId}/edital/publicacoes`),
  });
  const { data: propostas } = useQuery({
    queryKey: ["processo", processoId, "propostas"],
    queryFn: () => api.get<Proposta[]>(`/processos/${processoId}/propostas`),
  });
  const { data: fornecedores } = useQuery({
    queryKey: ["fornecedores-todos"],
    queryFn: () => api.get<{ itens: Fornecedor[] }>("/fornecedores", { por_pagina: 100 }),
  });

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ["processo", processoId] });
  };

  const [formEdital, setFormEdital] = useState({ numero: "", modalidade: "pregao_eletronico", conteudo: "" });
  useEffect(() => {
    if (edital) setFormEdital({ numero: edital.numero, modalidade: edital.modalidade, conteudo: edital.conteudo ?? "" });
  }, [edital]);

  const salvarEdital = useMutation({
    mutationFn: () => api.put(`/processos/${processoId}/edital`, formEdital),
    onSuccess: () => {
      toast.success("Edital salvo.");
      invalidar();
    },
  });
  const publicarEdital = useMutation({
    mutationFn: () => api.post(`/processos/${processoId}/edital/publicar`),
    onSuccess: () => {
      toast.success("Edital publicado.");
      invalidar();
    },
  });

  const [novaPublicacao, setNovaPublicacao] = useState({ veiculo: "Diário Oficial do Município", link: "" });
  const registrarPublicacao = useMutation({
    mutationFn: () =>
      api.post(`/processos/${processoId}/edital/publicacoes`, {
        veiculo: novaPublicacao.veiculo,
        data_publicacao: new Date().toISOString().slice(0, 10),
        link: novaPublicacao.link || undefined,
      }),
    onSuccess: () => {
      toast.success("Publicação registrada.");
      setNovaPublicacao({ veiculo: "Diário Oficial do Município", link: "" });
      queryClient.invalidateQueries({ queryKey: ["processo", processoId, "publicacoes"] });
    },
  });

  const [novaProposta, setNovaProposta] = useState({ fornecedor_id: "", valor: "" });
  const registrarProposta = useMutation({
    mutationFn: () =>
      api.post(`/processos/${processoId}/propostas`, { fornecedor_id: novaProposta.fornecedor_id, valor_proposto: Number(novaProposta.valor) }),
    onSuccess: () => {
      toast.success("Proposta registrada.");
      setNovaProposta({ fornecedor_id: "", valor: "" });
      queryClient.invalidateQueries({ queryKey: ["processo", processoId, "propostas"] });
    },
  });

  const [vencedorId, setVencedorId] = useState("");
  const adjudicar = useMutation({
    mutationFn: () => {
      const proposta = propostas?.find((p) => p.fornecedor_id === vencedorId);
      return api.post(`/processos/${processoId}/adjudicar`, {
        fornecedor_vencedor_id: vencedorId,
        valor_adjudicado: proposta?.valor_proposto ?? 0,
      });
    },
    onSuccess: () => {
      toast.success("Fornecedor adjudicado.");
      invalidar();
    },
  });

  const homologar = useMutation({
    mutationFn: () => {
      const proposta = propostas?.find((p) => p.fornecedor_id === vencedorId);
      return api.post(`/processos/${processoId}/homologar`, { valor_homologado: proposta?.valor_proposto ?? 0 });
    },
    onSuccess: () => {
      toast.success("Processo homologado.");
      invalidar();
    },
  });

  return (
    <div className="space-y-4">
      <Cartao>
        <CartaoCabecalho titulo="Edital" acoes={edital && <Chip cor={edital.status === "publicado" ? "verde" : "neutro"}>{edital.status}</Chip>} />
        <CartaoCorpo className="space-y-3">
          <Campo rotulo="Número">
            <Input value={formEdital.numero} onChange={(e) => setFormEdital({ ...formEdital, numero: e.target.value })} disabled={!podeGerenciar} />
          </Campo>
          <Campo rotulo="Modalidade">
            <Select value={formEdital.modalidade} onChange={(e) => setFormEdital({ ...formEdital, modalidade: e.target.value })} disabled={!podeGerenciar}>
              <option value="pregao_eletronico">Pregão Eletrônico</option>
              <option value="pregao_presencial">Pregão Presencial</option>
              <option value="concorrencia">Concorrência</option>
            </Select>
          </Campo>
          <Campo rotulo="Conteúdo do edital">
            <Textarea value={formEdital.conteudo} onChange={(e) => setFormEdital({ ...formEdital, conteudo: e.target.value })} disabled={!podeGerenciar} className="min-h-24" />
          </Campo>
          <div className="flex gap-2">
            {podeGerenciar && (
              <Botao tamanho="sm" onClick={() => salvarEdital.mutate()} carregando={salvarEdital.isPending} disabled={!formEdital.numero}>
                Salvar edital
              </Botao>
            )}
            {podePublicar && edital && edital.status !== "publicado" && (
              <Botao tamanho="sm" variante="secundario" onClick={() => publicarEdital.mutate()} carregando={publicarEdital.isPending}>
                Publicar
              </Botao>
            )}
          </div>
        </CartaoCorpo>
      </Cartao>

      <Cartao>
        <CartaoCabecalho titulo="Publicações" descricao="Controle de veículo, data e link de cada publicação" />
        <CartaoCorpo className="space-y-3">
          {!publicacoes?.length ? (
            <EstadoVazio titulo="Nenhuma publicação registrada" />
          ) : (
            <ul className="space-y-1.5">
              {publicacoes.map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span>{p.veiculo}</span>
                  <span className="text-xs text-slate-500">{new Date(p.data_publicacao).toLocaleDateString("pt-BR")}</span>
                </li>
              ))}
            </ul>
          )}
          {podeGerenciar && (
            <div className="flex gap-2">
              <Input value={novaPublicacao.veiculo} onChange={(e) => setNovaPublicacao({ ...novaPublicacao, veiculo: e.target.value })} placeholder="Veículo" />
              <Input value={novaPublicacao.link} onChange={(e) => setNovaPublicacao({ ...novaPublicacao, link: e.target.value })} placeholder="Link (opcional)" />
              <Botao tamanho="sm" onClick={() => registrarPublicacao.mutate()} carregando={registrarPublicacao.isPending}>
                Registrar
              </Botao>
            </div>
          )}
        </CartaoCorpo>
      </Cartao>

      <Cartao>
        <CartaoCabecalho titulo="Sessão, Propostas, Adjudicação e Homologação" />
        <CartaoCorpo className="space-y-3">
          {!propostas?.length ? (
            <EstadoVazio titulo="Nenhuma proposta registrada" />
          ) : (
            <ul className="space-y-1.5">
              {propostas.map((p) => {
                const fornecedor = fornecedores?.itens.find((f) => f.id === p.fornecedor_id);
                return (
                  <li key={p.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <span>{fornecedor?.razao_social ?? p.fornecedor_id}</span>
                    <span className="flex items-center gap-2">
                      {formatarMoeda(p.valor_proposto)}
                      <Chip cor={p.situacao === "vencedora" ? "verde" : "neutro"}>{p.situacao}</Chip>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {podeGerenciar && (
            <div className="flex gap-2">
              <Select value={novaProposta.fornecedor_id} onChange={(e) => setNovaProposta({ ...novaProposta, fornecedor_id: e.target.value })}>
                <option value="">Fornecedor…</option>
                {fornecedores?.itens.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.razao_social}
                  </option>
                ))}
              </Select>
              <Input type="number" placeholder="Valor" value={novaProposta.valor} onChange={(e) => setNovaProposta({ ...novaProposta, valor: e.target.value })} />
              <Botao tamanho="sm" onClick={() => registrarProposta.mutate()} carregando={registrarProposta.isPending} disabled={!novaProposta.fornecedor_id || !novaProposta.valor}>
                Registrar proposta
              </Botao>
            </div>
          )}

          {(podeGerenciar || podeHomologar) && !!propostas?.length && (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              <Select value={vencedorId} onChange={(e) => setVencedorId(e.target.value)} className="w-auto">
                <option value="">Escolher vencedor…</option>
                {propostas.map((p) => {
                  const fornecedor = fornecedores?.itens.find((f) => f.id === p.fornecedor_id);
                  return (
                    <option key={p.id} value={p.fornecedor_id}>
                      {fornecedor?.razao_social} — {formatarMoeda(p.valor_proposto)}
                    </option>
                  );
                })}
              </Select>
              {podeGerenciar && (
                <Botao tamanho="sm" variante="secundario" onClick={() => adjudicar.mutate()} disabled={!vencedorId} carregando={adjudicar.isPending}>
                  Adjudicar
                </Botao>
              )}
              {podeHomologar && (
                <Botao tamanho="sm" onClick={() => homologar.mutate()} disabled={!vencedorId} carregando={homologar.isPending}>
                  Homologar
                </Botao>
              )}
            </div>
          )}
        </CartaoCorpo>
      </Cartao>
    </div>
  );
}
