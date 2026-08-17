import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { CheckCircle2, Plus } from "lucide-react";
import { api } from "@/nucleo/http/clienteHttp";
import { usePermissao } from "@/nucleo/auth/usePermissao";
import { Botao, Campo, Cartao, CartaoCabecalho, CartaoCorpo, Chip, EstadoVazio, Input, Modal } from "@/ui";

interface Fornecedor {
  id: string;
  razao_social: string;
}
interface CotacaoFornecedor {
  id: string;
  fornecedor_id: string;
  fornecedor_nome: string | null;
  situacao: string;
}
interface Cotacao {
  id: string;
  numero: string;
  data_abertura: string;
  status: string;
  fornecedores: CotacaoFornecedor[];
}
interface LinhaMapa {
  item_id: string;
  descricao: string;
  quantidade: number;
  menor_preco: number | null;
  media: number | null;
  mediana: number | null;
  maior_preco: number | null;
  precos_por_fornecedor: Record<string, number>;
  alerta: string | null;
}

const SITUACAO_COR: Record<string, "neutro" | "azul" | "verde" | "vermelho"> = {
  pendente: "neutro",
  enviada: "azul",
  visualizada: "azul",
  respondida: "verde",
  recusada: "vermelho",
};

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function AbaCompras({ processoId }: { processoId: string }) {
  const queryClient = useQueryClient();
  const podeGerenciar = usePermissao("govcompras.cotacoes.gerenciar");
  const [modalAberto, setModalAberto] = useState(false);
  const [numero, setNumero] = useState("");
  const [descricaoItem, setDescricaoItem] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [fornecedoresEscolhidos, setFornecedoresEscolhidos] = useState<string[]>([]);

  const { data: cotacoes, isLoading } = useQuery({
    queryKey: ["processo", processoId, "cotacoes"],
    queryFn: () => api.get<Cotacao[]>(`/processos/${processoId}/cotacoes`),
  });

  const { data: fornecedores } = useQuery({
    queryKey: ["fornecedores-todos"],
    queryFn: () => api.get<{ itens: Fornecedor[] }>("/fornecedores", { por_pagina: 100 }),
    enabled: modalAberto,
  });

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ["processo", processoId, "cotacoes"] });
    queryClient.invalidateQueries({ queryKey: ["processo", processoId] });
  };

  const criar = useMutation({
    mutationFn: () =>
      api.post(`/processos/${processoId}/cotacoes`, {
        numero,
        data_abertura: new Date().toISOString().slice(0, 10),
        fornecedor_ids: fornecedoresEscolhidos,
        itens: descricaoItem ? [{ descricao: descricaoItem, quantidade: Number(quantidade) }] : [],
      }),
    onSuccess: () => {
      toast.success("Pesquisa de preços criada e enviada aos fornecedores selecionados.");
      setModalAberto(false);
      setNumero("");
      setDescricaoItem("");
      setFornecedoresEscolhidos([]);
      invalidar();
    },
  });

  return (
    <div className="space-y-4">
      <Cartao>
        <CartaoCabecalho
          titulo="Pesquisa de Preços"
          descricao="Cotações enviadas a fornecedores para este processo"
          acoes={
            podeGerenciar && (
              <Botao tamanho="sm" icone={<Plus className="size-3.5" />} onClick={() => setModalAberto(true)}>
                Nova cotação
              </Botao>
            )
          }
        />
        <CartaoCorpo>
          {isLoading ? (
            <p className="text-xs text-slate-400">Carregando…</p>
          ) : !cotacoes?.length ? (
            <EstadoVazio titulo="Nenhuma cotação criada ainda" descricao="Crie uma cotação para iniciar a pesquisa de preços com os fornecedores." />
          ) : (
            <div className="space-y-4">
              {cotacoes.map((cotacao) => (
                <CartaoCotacao key={cotacao.id} cotacao={cotacao} onAtualizar={invalidar} podeGerenciar={podeGerenciar} />
              ))}
            </div>
          )}
        </CartaoCorpo>
      </Cartao>

      <Modal
        aberto={modalAberto}
        aoFechar={() => setModalAberto(false)}
        titulo="Nova pesquisa de preços"
        rodape={
          <Botao onClick={() => criar.mutate()} carregando={criar.isPending} disabled={!numero || fornecedoresEscolhidos.length === 0}>
            Criar e enviar
          </Botao>
        }
      >
        <div className="space-y-3">
          <Campo rotulo="Número" obrigatorio>
            <Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ex.: 2026/0002" />
          </Campo>
          <Campo rotulo="Item a cotar">
            <Input value={descricaoItem} onChange={(e) => setDescricaoItem(e.target.value)} placeholder="Descrição do item" />
          </Campo>
          <Campo rotulo="Quantidade">
            <Input type="number" min="1" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
          </Campo>
          <Campo rotulo="Fornecedores a consultar" obrigatorio>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {fornecedores?.itens.map((f) => (
                <label key={f.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={fornecedoresEscolhidos.includes(f.id)}
                    onChange={(e) =>
                      setFornecedoresEscolhidos((atual) =>
                        e.target.checked ? [...atual, f.id] : atual.filter((id) => id !== f.id),
                      )
                    }
                  />
                  {f.razao_social}
                </label>
              ))}
              {!fornecedores?.itens.length && <p className="text-xs text-slate-400">Cadastre fornecedores primeiro.</p>}
            </div>
          </Campo>
        </div>
      </Modal>
    </div>
  );
}

function CartaoCotacao({
  cotacao,
  onAtualizar,
  podeGerenciar,
}: {
  cotacao: Cotacao;
  onAtualizar: () => void;
  podeGerenciar: boolean;
}) {
  const [mostrarMapa, setMostrarMapa] = useState(false);
  const { data: mapa } = useQuery({
    queryKey: ["cotacao", cotacao.id, "mapa"],
    queryFn: () => api.get<{ linhas: LinhaMapa[] }>(`/cotacoes/${cotacao.id}/mapa-comparativo`),
    enabled: mostrarMapa,
  });

  const concluir = useMutation({
    mutationFn: () => api.post(`/cotacoes/${cotacao.id}/concluir`),
    onSuccess: () => {
      toast.success("Pesquisa de preços concluída.");
      onAtualizar();
    },
  });

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-800">Cotação {cotacao.numero}</p>
          <p className="text-xs text-slate-500">Aberta em {new Date(cotacao.data_abertura).toLocaleDateString("pt-BR")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Chip cor={cotacao.status === "concluida" ? "verde" : "azul"}>
            {cotacao.status === "concluida" ? "Concluída" : "Em andamento"}
          </Chip>
          {podeGerenciar && cotacao.status !== "concluida" && (
            <Botao tamanho="sm" variante="secundario" icone={<CheckCircle2 className="size-3.5" />} onClick={() => concluir.mutate()} carregando={concluir.isPending}>
              Concluir
            </Botao>
          )}
          <Botao tamanho="sm" variante="fantasma" onClick={() => setMostrarMapa((v) => !v)}>
            {mostrarMapa ? "Ocultar mapa" : "Mapa comparativo"}
          </Botao>
        </div>
      </div>

      <ul className="mt-2 flex flex-wrap gap-1.5">
        {cotacao.fornecedores.map((f) => (
          <li key={f.id}>
            <Chip cor={SITUACAO_COR[f.situacao] ?? "neutro"}>{f.fornecedor_nome}</Chip>
          </li>
        ))}
      </ul>

      {mostrarMapa && mapa && (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          {mapa.linhas.map((linha) => (
            <div key={linha.item_id} className="rounded-lg bg-slate-50 p-2.5 text-xs">
              <p className="font-medium text-slate-700">
                {linha.descricao} ({linha.quantidade})
              </p>
              <div className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-4">
                <span>Menor: {linha.menor_preco !== null ? formatarMoeda(linha.menor_preco) : "—"}</span>
                <span>Média: {linha.media !== null ? formatarMoeda(linha.media) : "—"}</span>
                <span>Mediana: {linha.mediana !== null ? formatarMoeda(linha.mediana) : "—"}</span>
                <span>Maior: {linha.maior_preco !== null ? formatarMoeda(linha.maior_preco) : "—"}</span>
              </div>
              {linha.alerta && <p className="mt-1 text-amber-600">⚠️ {linha.alerta}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
