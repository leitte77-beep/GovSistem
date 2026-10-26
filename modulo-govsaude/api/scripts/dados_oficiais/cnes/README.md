# Arquivos oficiais do CNES

Coloque aqui os arquivos oficiais do CNES (sem editar o conteúdo) e o
manifesto de layout em `app/integracoes/especificacoes/cnes/<versao>/`.

Nunca renomeie colunas nem preencha dados "de memória". O importador usa o
mapeamento declarado no manifesto e produz relatório de inconsistências com
linha, campo, valor mascarado, motivo e ação sugerida.

Enquanto o arquivo/manifesto não estiver presente, a API responde
`PENDENTE_ESPECIFICACAO_OFICIAL` e nada é importado.
