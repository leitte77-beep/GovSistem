# Artefatos oficiais

Esta pasta **não** contém dados inventados. Coloque aqui os arquivos oficiais,
versionados por competência/versão, antes de rodar
`python scripts/importar_referencias.py`.

| Arquivo | Fonte oficial | Observação |
|---|---|---|
| `municipios.csv` | IBGE — localidades | colunas `codigo_ibge,nome,uf` |
| `cbo.csv` | MTE/CBO | colunas `codigo,descricao,familia` |
| `cid10.csv` | DATASUS/CID-10 | colunas `codigo,descricao,capitulo,grupo` |
| `ciap2.csv` | Ministério da Saúde/CIAP-2 | colunas `codigo,descricao,grupo` |
| `cnae.csv` | IBGE/CNAE | colunas `codigo,descricao,secao` |
| `ceps.csv` | Correios/base oficial de CEP | colunas `cep,logradouro,bairro,municipio_ibge,uf` |
| `cnes_estabelecimentos.csv` | DATASUS/CNES | colunas `codigo_cnes,competencia,nome,tipo,municipio_ibge` (base de validação) |
| `sigtap.csv` | DATASUS/SIGTAP | colunas `codigo,competencia,nome,complexidade,financiamento,valor_ambulatorial,valor_hospitalar` |
| `imunobiologicos.csv` | PNI | colunas `codigo,nome,apresentacao,via_administracao` |
| `medicamentos.csv` | OBM/Rename | colunas `codigo_obm,nome,principio_ativo,apresentacao,renome` |
| `cnes/` | DATASUS/CNES | arquivo oficial + manifesto em `app/integracoes/especificacoes/cnes/` (ver README local) |

Enquanto um arquivo não estiver presente, a importação termina com
`PENDENTE_ESPECIFICACAO_OFICIAL` e a funcionalidade dependente deve permanecer
com a porta/adaptador pendente, nunca com regra “de memória”.
