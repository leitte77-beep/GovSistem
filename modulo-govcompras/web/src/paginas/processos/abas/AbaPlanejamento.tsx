import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { CheckCircle2 } from "lucide-react";
import { api } from "@/nucleo/http/clienteHttp";
import { usePermissao } from "@/nucleo/auth/usePermissao";
import { Botao, Campo, Cartao, CartaoCabecalho, CartaoCorpo, Chip, Input, Select, Textarea } from "@/ui";

interface Dfd {
  processo_id: string;
  descricao_necessidade: string;
  quantidade_estimada: string | null;
  status: string;
}
interface EtpTopico {
  id: string;
  ordem: number;
  titulo: string;
  conteudo: string | null;
  status: string;
}
interface Etp {
  id: string;
  status: string;
  topicos: EtpTopico[];
}
interface TermoReferencia {
  objeto: string | null;
  justificativa: string | null;
  especificacoes: string | null;
  criterio_julgamento: string | null;
  valor_estimado: number | null;
  status: string;
  versao: number;
}
interface RiscoItem {
  id: string;
  descricao_risco: string;
  probabilidade: string;
  impacto: string;
  nivel: string;
  acao_preventiva: string | null;
}
interface MatrizRisco {
  id: string;
  itens: RiscoItem[];
}

function ChipDocumento({ status }: { status: string }) {
  const cor = status === "aprovado" ? "verde" : status === "em_revisao" ? "amarelo" : "neutro";
  const rotulo = status === "aprovado" ? "Aprovado" : status === "em_revisao" ? "Em revisão" : "Rascunho";
  return <Chip cor={cor}>{rotulo}</Chip>;
}

export function AbaPlanejamento({ processoId }: { processoId: string }) {
  return (
    <div className="space-y-4">
      <SecaoDfd processoId={processoId} />
      <SecaoEtp processoId={processoId} />
      <SecaoTermoReferencia processoId={processoId} />
      <SecaoMatrizRisco processoId={processoId} />
    </div>
  );
}

function SecaoDfd({ processoId }: { processoId: string }) {
  const queryClient = useQueryClient();
  const podeEditar = usePermissao("govcompras.planejamento.editar");
  const podeAprovar = usePermissao("govcompras.planejamento.aprovar");
  const { data } = useQuery({
    queryKey: ["processo", processoId, "dfd"],
    queryFn: () => api.get<Dfd | null>(`/processos/${processoId}/dfd`),
  });
  const [descricao, setDescricao] = useState("");
  const [quantidade, setQuantidade] = useState("");

  useEffect(() => {
    setDescricao(data?.descricao_necessidade ?? "");
    setQuantidade(data?.quantidade_estimada ?? "");
  }, [data]);

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["processo", processoId] });

  const salvar = useMutation({
    mutationFn: () =>
      api.put(`/processos/${processoId}/dfd`, { descricao_necessidade: descricao, quantidade_estimada: quantidade || null }),
    onSuccess: () => {
      toast.success("DFD salvo.");
      invalidar();
    },
  });
  const aprovar = useMutation({
    mutationFn: () => api.post(`/processos/${processoId}/dfd/aprovar`),
    onSuccess: () => {
      toast.success("DFD aprovado.");
      invalidar();
    },
  });

  return (
    <Cartao>
      <CartaoCabecalho
        titulo="Documento de Formalização da Demanda (DFD)"
        acoes={data && <ChipDocumento status={data.status} />}
      />
      <CartaoCorpo className="space-y-3">
        <Campo rotulo="Descrição da necessidade" obrigatorio>
          <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} disabled={!podeEditar} />
        </Campo>
        <Campo rotulo="Quantidade estimada">
          <Input value={quantidade} onChange={(e) => setQuantidade(e.target.value)} disabled={!podeEditar} />
        </Campo>
        <div className="flex gap-2">
          {podeEditar && (
            <Botao tamanho="sm" onClick={() => salvar.mutate()} carregando={salvar.isPending} disabled={!descricao}>
              Salvar
            </Botao>
          )}
          {podeAprovar && data?.status !== "aprovado" && (
            <Botao
              tamanho="sm"
              variante="secundario"
              icone={<CheckCircle2 className="size-3.5" />}
              onClick={() => aprovar.mutate()}
              carregando={aprovar.isPending}
              disabled={!data}
            >
              Aprovar DFD
            </Botao>
          )}
        </div>
      </CartaoCorpo>
    </Cartao>
  );
}

function SecaoEtp({ processoId }: { processoId: string }) {
  const queryClient = useQueryClient();
  const podeEditar = usePermissao("govcompras.planejamento.editar");
  const podeAprovar = usePermissao("govcompras.planejamento.aprovar");
  const { data } = useQuery({
    queryKey: ["processo", processoId, "etp"],
    queryFn: () => api.get<Etp | null>(`/processos/${processoId}/etp`),
  });
  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["processo", processoId] });

  const criar = useMutation({
    mutationFn: () => api.post(`/processos/${processoId}/etp`),
    onSuccess: () => {
      toast.success("ETP iniciado com o roteiro padrão.");
      invalidar();
    },
  });
  const aprovar = useMutation({
    mutationFn: () => api.post(`/processos/${processoId}/etp/aprovar`),
    onSuccess: () => {
      toast.success("ETP aprovado.");
      invalidar();
    },
  });

  return (
    <Cartao>
      <CartaoCabecalho titulo="Estudo Técnico Preliminar (ETP)" acoes={data && <ChipDocumento status={data.status} />} />
      <CartaoCorpo className="space-y-3">
        {!data ? (
          podeEditar && (
            <Botao tamanho="sm" onClick={() => criar.mutate()} carregando={criar.isPending}>
              Iniciar ETP com roteiro padrão
            </Botao>
          )
        ) : (
          <>
            <div className="space-y-3">
              {data.topicos.map((topico) => (
                <TopicoEtp key={topico.id} processoId={processoId} topico={topico} podeEditar={podeEditar} />
              ))}
            </div>
            {podeAprovar && data.status !== "aprovado" && (
              <Botao tamanho="sm" variante="secundario" icone={<CheckCircle2 className="size-3.5" />} onClick={() => aprovar.mutate()} carregando={aprovar.isPending}>
                Aprovar ETP
              </Botao>
            )}
          </>
        )}
      </CartaoCorpo>
    </Cartao>
  );
}

function TopicoEtp({ processoId, topico, podeEditar }: { processoId: string; topico: EtpTopico; podeEditar: boolean }) {
  const queryClient = useQueryClient();
  const [conteudo, setConteudo] = useState(topico.conteudo ?? "");
  const salvar = useMutation({
    mutationFn: () => api.put(`/processos/${processoId}/etp/topicos/${topico.id}`, { titulo: topico.titulo, conteudo }),
    onSuccess: () => {
      toast.success("Tópico salvo.");
      queryClient.invalidateQueries({ queryKey: ["processo", processoId, "etp"] });
    },
  });

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-700">
          {topico.ordem}. {topico.titulo}
        </p>
        <Chip cor={topico.status === "preenchido" ? "azul" : "neutro"}>{topico.status === "preenchido" ? "Preenchido" : "Pendente"}</Chip>
      </div>
      <Textarea
        value={conteudo}
        onChange={(e) => setConteudo(e.target.value)}
        disabled={!podeEditar}
        className="min-h-16 text-xs"
      />
      {podeEditar && (
        <Botao tamanho="sm" variante="fantasma" className="mt-1.5" onClick={() => salvar.mutate()} carregando={salvar.isPending}>
          Salvar tópico
        </Botao>
      )}
    </div>
  );
}

function SecaoTermoReferencia({ processoId }: { processoId: string }) {
  const queryClient = useQueryClient();
  const podeEditar = usePermissao("govcompras.planejamento.editar");
  const podeAprovar = usePermissao("govcompras.planejamento.aprovar");
  const { data } = useQuery({
    queryKey: ["processo", processoId, "tr"],
    queryFn: () => api.get<TermoReferencia | null>(`/processos/${processoId}/termo-referencia`),
  });
  const [form, setForm] = useState({ objeto: "", justificativa: "", especificacoes: "", criterio_julgamento: "menor_preco" });

  useEffect(() => {
    if (data) {
      setForm({
        objeto: data.objeto ?? "",
        justificativa: data.justificativa ?? "",
        especificacoes: data.especificacoes ?? "",
        criterio_julgamento: data.criterio_julgamento ?? "menor_preco",
      });
    }
  }, [data]);

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["processo", processoId] });
  const salvar = useMutation({
    mutationFn: () => api.put(`/processos/${processoId}/termo-referencia`, form),
    onSuccess: () => {
      toast.success("Termo de Referência salvo.");
      invalidar();
    },
  });
  const aprovar = useMutation({
    mutationFn: () => api.post(`/processos/${processoId}/termo-referencia/aprovar`),
    onSuccess: () => {
      toast.success("Termo de Referência aprovado.");
      invalidar();
    },
  });

  return (
    <Cartao>
      <CartaoCabecalho titulo="Termo de Referência" descricao={data ? `Versão ${data.versao}` : undefined} acoes={data && <ChipDocumento status={data.status} />} />
      <CartaoCorpo className="space-y-3">
        <Campo rotulo="Objeto">
          <Textarea value={form.objeto} onChange={(e) => setForm({ ...form, objeto: e.target.value })} disabled={!podeEditar} className="min-h-16" />
        </Campo>
        <Campo rotulo="Justificativa">
          <Textarea value={form.justificativa} onChange={(e) => setForm({ ...form, justificativa: e.target.value })} disabled={!podeEditar} className="min-h-16" />
        </Campo>
        <Campo rotulo="Especificações">
          <Textarea value={form.especificacoes} onChange={(e) => setForm({ ...form, especificacoes: e.target.value })} disabled={!podeEditar} className="min-h-16" />
        </Campo>
        <Campo rotulo="Critério de julgamento">
          <Select value={form.criterio_julgamento} onChange={(e) => setForm({ ...form, criterio_julgamento: e.target.value })} disabled={!podeEditar}>
            <option value="menor_preco">Menor preço</option>
            <option value="melhor_tecnica">Melhor técnica</option>
            <option value="tecnica_e_preco">Técnica e preço</option>
          </Select>
        </Campo>
        <div className="flex gap-2">
          {podeEditar && (
            <Botao tamanho="sm" onClick={() => salvar.mutate()} carregando={salvar.isPending}>
              Salvar
            </Botao>
          )}
          {podeAprovar && data?.status !== "aprovado" && (
            <Botao tamanho="sm" variante="secundario" icone={<CheckCircle2 className="size-3.5" />} onClick={() => aprovar.mutate()} carregando={aprovar.isPending} disabled={!data}>
              Aprovar TR
            </Botao>
          )}
        </div>
      </CartaoCorpo>
    </Cartao>
  );
}

function SecaoMatrizRisco({ processoId }: { processoId: string }) {
  const queryClient = useQueryClient();
  const podeEditar = usePermissao("govcompras.planejamento.editar");
  const { data } = useQuery({
    queryKey: ["processo", processoId, "matriz-risco"],
    queryFn: () => api.get<MatrizRisco | null>(`/processos/${processoId}/matriz-risco`),
  });
  const [novo, setNovo] = useState({ descricao_risco: "", probabilidade: "media", impacto: "medio", acao_preventiva: "" });

  const adicionar = useMutation({
    mutationFn: () => api.post(`/processos/${processoId}/matriz-risco/itens`, novo),
    onSuccess: () => {
      toast.success("Risco adicionado.");
      setNovo({ descricao_risco: "", probabilidade: "media", impacto: "medio", acao_preventiva: "" });
      queryClient.invalidateQueries({ queryKey: ["processo", processoId, "matriz-risco"] });
      queryClient.invalidateQueries({ queryKey: ["processo", processoId] });
    },
  });

  const corNivel: Record<string, "verde" | "amarelo" | "vermelho"> = { baixo: "verde", medio: "amarelo", alto: "vermelho" };

  return (
    <Cartao>
      <CartaoCabecalho titulo="Análise de Riscos" descricao="Matriz de riscos da contratação" />
      <CartaoCorpo className="space-y-3">
        {data?.itens.length ? (
          <ul className="space-y-2">
            {data.itens.map((item) => (
              <li key={item.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-slate-800">{item.descricao_risco}</p>
                  <Chip cor={corNivel[item.nivel] ?? "neutro"}>Nível {item.nivel}</Chip>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Probabilidade {item.probabilidade} · Impacto {item.impacto}
                </p>
                {item.acao_preventiva && <p className="mt-1 text-xs text-slate-500">Prevenção: {item.acao_preventiva}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-400">Nenhum risco cadastrado ainda.</p>
        )}

        {podeEditar && (
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-dashed border-slate-300 p-3">
            <div className="col-span-2">
              <Campo rotulo="Descrição do risco">
                <Input value={novo.descricao_risco} onChange={(e) => setNovo({ ...novo, descricao_risco: e.target.value })} />
              </Campo>
            </div>
            <Campo rotulo="Probabilidade">
              <Select value={novo.probabilidade} onChange={(e) => setNovo({ ...novo, probabilidade: e.target.value })}>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
              </Select>
            </Campo>
            <Campo rotulo="Impacto">
              <Select value={novo.impacto} onChange={(e) => setNovo({ ...novo, impacto: e.target.value })}>
                <option value="baixo">Baixo</option>
                <option value="medio">Médio</option>
                <option value="alto">Alto</option>
              </Select>
            </Campo>
            <div className="col-span-2">
              <Campo rotulo="Ação preventiva">
                <Input value={novo.acao_preventiva} onChange={(e) => setNovo({ ...novo, acao_preventiva: e.target.value })} />
              </Campo>
            </div>
            <div className="col-span-2">
              <Botao tamanho="sm" onClick={() => adicionar.mutate()} carregando={adicionar.isPending} disabled={!novo.descricao_risco}>
                Adicionar risco
              </Botao>
            </div>
          </div>
        )}
      </CartaoCorpo>
    </Cartao>
  );
}
