import { useQuery } from "@tanstack/react-query";
import { api } from "@/nucleo/http/clienteHttp";
import type { Usuario } from "@/nucleo/tipos";
import { Cartao, CartaoCabecalho, Chip, EstadoVazio, Tabela, type ColunaTabela } from "@/ui";

export function AdminUsuarios() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-usuarios"],
    queryFn: () => api.get<Usuario[]>("/usuarios"),
  });

  const colunas: ColunaTabela<Usuario>[] = [
    { chave: "nome", cabecalho: "Nome", renderizar: (u) => <span className="font-medium text-slate-800">{u.nome}</span> },
    { chave: "email", cabecalho: "E-mail", renderizar: (u) => u.email },
    { chave: "perfil", cabecalho: "Perfil", renderizar: (u) => <span className="capitalize">{u.perfil}</span> },
    { chave: "cargo", cabecalho: "Cargo", renderizar: (u) => u.cargo ?? "—" },
    { chave: "ativo", cabecalho: "Situação", renderizar: (u) => <Chip cor={u.ativo ? "verde" : "vermelho"}>{u.ativo ? "Ativo" : "Inativo"}</Chip> },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Usuários</h1>
        <p className="text-sm text-slate-500">Perfis e acesso ao GovCompras (RBAC — seções 79-80)</p>
      </div>
      <Cartao>
        <CartaoCabecalho titulo={`${data?.length ?? 0} usuário(s)`} />
        <Tabela
          colunas={colunas}
          itens={data ?? []}
          chavePorItem={(u) => u.id}
          carregando={isLoading}
          vazio={<EstadoVazio titulo="Nenhum usuário encontrado" />}
        />
      </Cartao>
    </div>
  );
}
