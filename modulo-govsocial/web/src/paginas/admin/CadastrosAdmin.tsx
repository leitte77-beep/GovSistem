import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Tabela } from "@/ui/Tabela";
import { http } from "@/nucleo/http/clienteHttp";
import type { Coluna } from "@/ui/Tabela";

interface CatalogoEntry {
  slug: string;
  label: string;
  table: string;
}

const COLUNAS: Coluna<CatalogoEntry>[] = [
  {
    chave: "label",
    titulo: "Cadastro",
    ordenavel: true,
    render: (entry) => (
      <Link to={`/administracao/cadastros/${entry.slug}`} className="text-primary hover:underline">
        {entry.label}
      </Link>
    ),
  },
];

export default function CatalogoDominios() {
  const { data = [] } = useQuery<CatalogoEntry[]>({
    queryKey: ["admin-cadastros-catalogo"],
    queryFn: async () => http.get<CatalogoEntry[]>("/admin/cadastros/catalogo"),
    staleTime: 300_000,
  });

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-xl font-semibold">Cadastros Gerais</h1>
      <p className="text-sm text-ink-soft">Tabelas de domínio do SUAS. Clique em um item para gerenciar.</p>
      <Tabela
        colunas={COLUNAS}
        dados={data}
        chaveLinha={(r) => r.slug}
        caption="Catálogo de cadastros gerais"
        vazio={<span className="text-ink-soft">Nenhum cadastro disponível.</span>}
        totalRegistros={data.length}
      />
    </div>
  );
}
