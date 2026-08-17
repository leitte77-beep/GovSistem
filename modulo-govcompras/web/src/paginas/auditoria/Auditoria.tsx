import { useQuery } from "@tanstack/react-query";
import { api } from "@/nucleo/http/clienteHttp";
import { Cartao, CartaoCabecalho, EstadoVazio, Tabela, type ColunaTabela } from "@/ui";

interface RegistroAuditoria {
  id: string;
  usuario_nome: string | null;
  usuario_perfil: string | null;
  acao: string;
  entidade_tipo: string | null;
  entidade_descricao: string | null;
  resultado: string;
  justificativa: string | null;
  created_at: string;
}

const ROTULOS_ACAO: Record<string, string> = {
  criar: "Criou",
  avancar_etapa: "Avançou etapa",
  devolver_etapa: "Devolveu etapa",
  cancelar_processo: "Cancelou processo",
  reabrir_processo: "Reabriu processo",
  login: "Entrou no sistema",
};

export function Auditoria() {
  const { data, isLoading } = useQuery({
    queryKey: ["auditoria"],
    queryFn: () => api.get<RegistroAuditoria[]>("/auditoria"),
  });

  const colunas: ColunaTabela<RegistroAuditoria>[] = [
    {
      chave: "quando",
      cabecalho: "Quando",
      renderizar: (r) => <span className="whitespace-nowrap text-xs text-slate-500">{new Date(r.created_at).toLocaleString("pt-BR")}</span>,
    },
    { chave: "usuario", cabecalho: "Usuário", renderizar: (r) => r.usuario_nome ?? "Sistema" },
    { chave: "acao", cabecalho: "Ação", renderizar: (r) => ROTULOS_ACAO[r.acao] ?? r.acao },
    { chave: "entidade", cabecalho: "Registro", renderizar: (r) => r.entidade_descricao ?? r.entidade_tipo ?? "—" },
    { chave: "justificativa", cabecalho: "Justificativa", renderizar: (r) => <span className="max-w-xs truncate text-xs">{r.justificativa ?? "—"}</span> },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Auditoria</h1>
        <p className="text-sm text-slate-500">Trilha imutável de ações críticas do sistema (seção 67)</p>
      </div>
      <Cartao>
        <CartaoCabecalho titulo="Últimos registros" />
        <Tabela
          colunas={colunas}
          itens={data ?? []}
          chavePorItem={(r) => r.id}
          carregando={isLoading}
          vazio={<EstadoVazio titulo="Nenhum registro de auditoria ainda" />}
        />
      </Cartao>
    </div>
  );
}
