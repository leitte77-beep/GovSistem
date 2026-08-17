import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/nucleo/http/clienteHttp";
import { ErroApi } from "@/nucleo/http/erroApi";
import type { Secretaria, Setor } from "@/nucleo/tipos";
import { Botao, Campo, Cartao, CartaoCabecalho, CartaoCorpo, EstadoErro, Input, Select, Textarea } from "@/ui";

interface ItemForm {
  descricao: string;
  unidade: string;
  quantidade: string;
  valor_unitario_estimado: string;
}

const ITEM_VAZIO: ItemForm = { descricao: "", unidade: "unidade", quantidade: "1", valor_unitario_estimado: "" };

export function SolicitacaoNova() {
  const navegar = useNavigate();
  const [erro, setErro] = useState<string | null>(null);

  const { data: secretarias } = useQuery({
    queryKey: ["secretarias"],
    queryFn: () => api.get<Secretaria[]>("/secretarias"),
  });
  const [secretariaId, setSecretariaId] = useState("");
  const { data: setores } = useQuery({
    queryKey: ["setores", secretariaId],
    queryFn: () => api.get<Setor[]>("/setores", { secretaria_id: secretariaId }),
    enabled: !!secretariaId,
  });

  const [form, setForm] = useState({
    setor_id: "",
    tipo_objeto: "bem",
    objeto: "",
    justificativa: "",
    prioridade: "normal",
    observacoes: "",
  });
  const [itens, setItens] = useState<ItemForm[]>([{ ...ITEM_VAZIO }]);

  const criar = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>("/solicitacoes", {
        secretaria_id: secretariaId,
        setor_id: form.setor_id || undefined,
        tipo_objeto: form.tipo_objeto,
        objeto: form.objeto,
        justificativa: form.justificativa,
        prioridade: form.prioridade,
        observacoes: form.observacoes || undefined,
        itens: itens
          .filter((i) => i.descricao.trim())
          .map((i) => ({
            descricao: i.descricao,
            unidade: i.unidade,
            quantidade: Number(i.quantidade) || 1,
            valor_unitario_estimado: i.valor_unitario_estimado ? Number(i.valor_unitario_estimado) : undefined,
          })),
      }),
    onSuccess: (dados) => {
      toast.success("Solicitação criada como rascunho.");
      navegar(`/solicitacoes/${dados.id}`);
    },
    onError: (e: unknown) => setErro(e instanceof ErroApi ? e.message : "Não foi possível criar a solicitação."),
  });

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Nova Solicitação</h1>
        <p className="text-sm text-slate-500">Etapa 1 de 1 — dados principais e itens (seções 8-9)</p>
      </div>

      {erro && <EstadoErro mensagem={erro} />}

      <Cartao>
        <CartaoCabecalho titulo="Dados principais" />
        <CartaoCorpo className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Secretaria solicitante" obrigatorio>
              <Select value={secretariaId} onChange={(e) => { setSecretariaId(e.target.value); setForm({ ...form, setor_id: "" }); }}>
                <option value="">Selecione…</option>
                {secretarias?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo rotulo="Setor">
              <Select value={form.setor_id} onChange={(e) => setForm({ ...form, setor_id: e.target.value })} disabled={!secretariaId}>
                <option value="">Selecione…</option>
                {setores?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </Select>
            </Campo>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Tipo de objeto">
              <Select value={form.tipo_objeto} onChange={(e) => setForm({ ...form, tipo_objeto: e.target.value })}>
                <option value="bem">Bem</option>
                <option value="servico">Serviço</option>
                <option value="obra">Obra</option>
              </Select>
            </Campo>
            <Campo rotulo="Prioridade">
              <Select value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: e.target.value })}>
                <option value="baixa">Baixa</option>
                <option value="normal">Normal</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
                <option value="emergencial">Emergencial</option>
              </Select>
            </Campo>
          </div>

          <Campo rotulo="Objeto" obrigatorio>
            <Input value={form.objeto} onChange={(e) => setForm({ ...form, objeto: e.target.value })} placeholder="Ex.: Aquisição de 20 computadores" />
          </Campo>
          <Campo rotulo="Justificativa" obrigatorio>
            <Textarea value={form.justificativa} onChange={(e) => setForm({ ...form, justificativa: e.target.value })} />
          </Campo>
          <Campo rotulo="Observações">
            <Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} className="min-h-16" />
          </Campo>
        </CartaoCorpo>
      </Cartao>

      <Cartao>
        <CartaoCabecalho
          titulo="Itens"
          acoes={
            <Botao tamanho="sm" variante="secundario" icone={<Plus className="size-3.5" />} onClick={() => setItens([...itens, { ...ITEM_VAZIO }])}>
              Adicionar item
            </Botao>
          }
        />
        <CartaoCorpo className="space-y-3">
          {itens.map((item, indice) => (
            <div key={indice} className="grid grid-cols-12 items-end gap-2 rounded-lg border border-slate-200 p-3">
              <div className="col-span-5">
                <Campo rotulo="Descrição">
                  <Input value={item.descricao} onChange={(e) => atualizarItem(indice, "descricao", e.target.value)} />
                </Campo>
              </div>
              <div className="col-span-2">
                <Campo rotulo="Unidade">
                  <Input value={item.unidade} onChange={(e) => atualizarItem(indice, "unidade", e.target.value)} />
                </Campo>
              </div>
              <div className="col-span-2">
                <Campo rotulo="Quantidade">
                  <Input type="number" min="0" value={item.quantidade} onChange={(e) => atualizarItem(indice, "quantidade", e.target.value)} />
                </Campo>
              </div>
              <div className="col-span-2">
                <Campo rotulo="Valor unitário">
                  <Input type="number" min="0" value={item.valor_unitario_estimado} onChange={(e) => atualizarItem(indice, "valor_unitario_estimado", e.target.value)} />
                </Campo>
              </div>
              <div className="col-span-1 flex justify-center pb-2">
                <button
                  onClick={() => setItens(itens.filter((_, i) => i !== indice))}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  aria-label="Remover item"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </CartaoCorpo>
      </Cartao>

      <div className="flex justify-end gap-2">
        <Botao variante="secundario" onClick={() => navegar("/solicitacoes")}>
          Cancelar
        </Botao>
        <Botao onClick={() => criar.mutate()} carregando={criar.isPending} disabled={!secretariaId || !form.objeto || !form.justificativa}>
          Criar solicitação
        </Botao>
      </div>
    </div>
  );

  function atualizarItem(indice: number, campo: keyof ItemForm, valor: string) {
    setItens((atual) => atual.map((item, i) => (i === indice ? { ...item, [campo]: valor } : item)));
  }
}
