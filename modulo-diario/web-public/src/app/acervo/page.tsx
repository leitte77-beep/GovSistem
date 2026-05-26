import InstitutionalPage from "@/components/InstitutionalPage";

export default function AcervoPage() {
  return (
    <InstitutionalPage
      title="Acervo Histórico"
      description="Consulte edições publicadas e utilize os filtros do portal para localizar documentos oficiais por data, número ou termo."
      sections={[
        {
          title: "Consulta por edições",
          body: "A lista de edições concentra os diários publicados e permite acessar o conteúdo de cada publicação disponível no sistema.",
        },
        {
          title: "Pesquisa textual",
          body: "A busca pública ajuda a localizar matérias e atos específicos por palavras-chave, facilitando o acesso ao histórico documental.",
        },
      ]}
      actionHref="/edicoes"
      actionLabel="Abrir edições"
    />
  );
}
