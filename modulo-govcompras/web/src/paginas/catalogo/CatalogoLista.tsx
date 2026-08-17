import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus } from "lucide-react";
import { api } from "@/nucleo/http/clienteHttp";
import { usePermissao } from "@/nucleo/auth/usePermissao";
import { Botao, Campo, Cartao, CartaoCabecalho, EstadoVazio, Input, Modal, Tabela, type ColunaTabela } from "@/ui";

interface HistoricoPreco {
  fonte: string;
  valor: number;
  data_referencia: string;
}
interface CatalogoItem {
  id: string;
  codigo: string;
  descricao: string;
  unidade_medida: string;
  categoria: string | null;
  ultimo_valor: number | null;
  media_historica: number | null;
  historico_precos: HistoricoPreco[];
}

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function CatalogoLista() {
  const queryClient = useQueryClient();
  const podeGerenciar = usePermissao("govcompras.catalogo.gerenciar");
  const [busca, setBusca] = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [novo, setNovo] = useState({ codigo: "", descricao: "", unidade_medida: "unidade", categoria: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["catalogo", busca],
    queryFn: () => api.get<CatalogoItem[]>("/catalogo/itens", { q: busca || undefined }),
  });

  const criar = useMutation({
    mutationFn: () => api.post("/catalogo/itens", novo),
    onSuccess: () => {
      toast.success("Item cadastrado no catálogo.");
      setModalAberto(false);
      setNovo({ codigo: "", descricao: "", unidade_medida: "unidade", categoria: "" });
      queryClient.invalidateQueries({ queryKey: ["catalogo"] });
    },
  });

  const colunas: ColunaTabela<CatalogoItem>[] = [
    { chave: "codigo", cabecalho: "Código", renderizar: (i) => i.codigo },
    { chave: "descricao", cabecalho: "Descrição", renderizar: (i) => <span className="font-medium text-slate-800">{i.descricao}</span> },
    { chave: "categoria", cabecalho: "Categoria", renderizar: (i) => i.categoria ?? "—" },
    { chave: "unidade", cabecalho: "Unidade", renderizar: (i) => i.unidade_medida },
    { chave: "ultimo", cabecalho: "Último valor", renderizar: (i) => (i.ultimo_valor ? formatarMoeda(i.ultimo_valor) : "—") },
    { chave: "media", cabecalho: "Média histórica", renderizar: (i) => (i.media_historica ? formatarMoeda(i.media_historica) : "—") },
  ];

  const itemExpandido = data?.find((i) => i.id === expandido);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Catálogo Municipal de Itens</h1>
          <p className="text-sm text-slate-500">Base de referência para estimativas de preço (seções 25-26)</p>
        </div>
        {podeGerenciar && (
          <Botao icone={<Plus className="size-4" />} onClick={() => setModalAberto(true)}>
            Novo item
          </Botao>
        )}
      </div>

      <Input placeholder="Buscar item…" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-sm" />

      <Cartao>
        <CartaoCabecalho titulo={`${data?.length ?? 0} item(ns)`} />
        <Tabela
          colunas={colunas}
          itens={data ?? []}
          chavePorItem={(i) => i.id}
          carregando={isLoading}
          aoClicarLinha={(i) => setExpandido(i.id === expandido ? null : i.id)}
          vazio={<EstadoVazio titulo="Nenhum item no catálogo" />}
        />
      </Cartao>

      {itemExpandido && (
        <Cartao>
          <CartaoCabecalho titulo={`Histórico de preços — ${itemExpandido.descricao}`} />
          <div className="p-4">
            {itemExpandido.historico_precos.length === 0 ? (
              <p className="text-xs text-slate-400">Sem histórico de preços registrado ainda.</p>
            ) : (
              <ul className="space-y-1.5">
                {itemExpandido.historico_precos.map((h, idx) => (
                  <li key={idx} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <span className="capitalize text-slate-600">
                      {h.fonte} — {new Date(h.data_referencia).toLocaleDateString("pt-BR")}
                    </span>
                    <span className="font-medium text-slate-800">{formatarMoeda(h.valor)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Cartao>
      )}

      <Modal
        aberto={modalAberto}
        aoFechar={() => setModalAberto(false)}
        titulo="Novo item de catálogo"
        rodape={
          <Botao onClick={() => criar.mutate()} carregando={criar.isPending} disabled={!novo.codigo || !novo.descricao}>
            Cadastrar
          </Botao>
        }
      >
        <div className="space-y-3">
          <Campo rotulo="Código" obrigatorio>
            <Input value={novo.codigo} onChange={(e) => setNovo({ ...novo, codigo: e.target.value })} />
          </Campo>
          <Campo rotulo="Descrição" obrigatorio>
            <Input value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} />
          </Campo>
          <Campo rotulo="Unidade de medida">
            <Input value={novo.unidade_medida} onChange={(e) => setNovo({ ...novo, unidade_medida: e.target.value })} />
          </Campo>
          <Campo rotulo="Categoria">
            <Input value={novo.categoria} onChange={(e) => setNovo({ ...novo, categoria: e.target.value })} />
          </Campo>
        </div>
      </Modal>
    </div>
  );
}
