import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus } from "lucide-react";
import { api } from "@/nucleo/http/clienteHttp";
import { usePermissao } from "@/nucleo/auth/usePermissao";
import { Botao, Campo, Cartao, CartaoCabecalho, Chip, EstadoVazio, Input, Modal, Tabela, type ColunaTabela } from "@/ui";

interface Fornecedor {
  id: string;
  razao_social: string;
  cnpj: string;
  municipio: string | null;
  uf: string | null;
  situacao: string;
}

export function FornecedoresLista() {
  const navegar = useNavigate();
  const queryClient = useQueryClient();
  const podeGerenciar = usePermissao("govcompras.fornecedores.gerenciar");
  const [busca, setBusca] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [novo, setNovo] = useState({ razao_social: "", cnpj: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["fornecedores", busca],
    queryFn: () => api.get<{ itens: Fornecedor[] }>("/fornecedores", { q: busca || undefined, por_pagina: 100 }),
  });

  const criar = useMutation({
    mutationFn: () => api.post("/fornecedores", novo),
    onSuccess: () => {
      toast.success("Fornecedor cadastrado.");
      setModalAberto(false);
      setNovo({ razao_social: "", cnpj: "" });
      queryClient.invalidateQueries({ queryKey: ["fornecedores"] });
    },
  });

  const colunas: ColunaTabela<Fornecedor>[] = [
    { chave: "nome", cabecalho: "Razão social", renderizar: (f) => <span className="font-medium text-slate-800">{f.razao_social}</span> },
    { chave: "cnpj", cabecalho: "CNPJ", renderizar: (f) => f.cnpj },
    { chave: "municipio", cabecalho: "Município/UF", renderizar: (f) => (f.municipio ? `${f.municipio}/${f.uf}` : "—") },
    { chave: "situacao", cabecalho: "Situação", renderizar: (f) => <Chip cor={f.situacao === "ativo" ? "verde" : "neutro"}>{f.situacao}</Chip> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Fornecedores</h1>
          <p className="text-sm text-slate-500">Cadastro central de fornecedores do município</p>
        </div>
        {podeGerenciar && (
          <Botao icone={<Plus className="size-4" />} onClick={() => setModalAberto(true)}>
            Novo fornecedor
          </Botao>
        )}
      </div>

      <Input placeholder="Buscar por razão social…" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-sm" />

      <Cartao>
        <CartaoCabecalho titulo={`${data?.itens.length ?? 0} fornecedor(es)`} />
        <Tabela
          colunas={colunas}
          itens={data?.itens ?? []}
          chavePorItem={(f) => f.id}
          carregando={isLoading}
          aoClicarLinha={(f) => navegar(`/fornecedores/${f.id}`)}
          vazio={<EstadoVazio titulo="Nenhum fornecedor cadastrado" />}
        />
      </Cartao>

      <Modal
        aberto={modalAberto}
        aoFechar={() => setModalAberto(false)}
        titulo="Novo fornecedor"
        rodape={
          <Botao onClick={() => criar.mutate()} carregando={criar.isPending} disabled={!novo.razao_social || !novo.cnpj}>
            Cadastrar
          </Botao>
        }
      >
        <div className="space-y-3">
          <Campo rotulo="Razão social" obrigatorio>
            <Input value={novo.razao_social} onChange={(e) => setNovo({ ...novo, razao_social: e.target.value })} />
          </Campo>
          <Campo rotulo="CNPJ" obrigatorio>
            <Input value={novo.cnpj} onChange={(e) => setNovo({ ...novo, cnpj: e.target.value })} placeholder="00.000.000/0000-00" />
          </Campo>
        </div>
      </Modal>
    </div>
  );
}
