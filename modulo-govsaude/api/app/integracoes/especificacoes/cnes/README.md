# Especificação oficial do CNES

Esta pasta **não** contém layout inventado. Para habilitar a importação real,
coloque o artefato oficial em `scripts/dados_oficiais/cnes/` e crie um
manifesto em `app/integracoes/especificacoes/cnes/<versao>/manifest.json`.

Enquanto o manifesto/arquivo não existir, `POST /importacoes/cnes` responde
`202` com status `PENDENTE_ESPECIFICACAO_OFICIAL` e não importa nada.

## Formato do manifesto

O manifesto apenas declara onde cada campo interno está no arquivo oficial:

```json
{
  "versao_layout": "202601",
  "entidade": "estabelecimentos",
  "arquivo": "cnes_estabelecimentos.csv",
  "encoding": "utf-8-sig",
  "delimitador": ";",
  "competencia": "202601",
  "mapeamento": {
    "cnes": "CO_CNES",
    "nome": "NO_FANTASIA",
    "tipo": "TP_UNIDADE",
    "cnpj": "NU_CNPJ",
    "municipio_ibge": "CO_IBGE"
  }
}
```

Entidades aceitas pelo importador genérico:

| `entidade` | Campos internos mínimos |
|---|---|
| `estabelecimentos` | `cnes`, `nome`, `tipo` |
| `equipes` | `cnes`, `ine`, `nome`, `tipo` |
| `profissionais` | `nome`, `cpf` ou `cns` |
| `vinculos` | `cnes`, `cpf` ou `cns`, `cbo`, `carga_horaria` |

Os nomes das colunas oficiais são exatamente os do arquivo fornecido pelo
DATASUS/CNES. O sistema não presume posições, códigos de domínio nem
compatibilidades; quando a base oficial não está importada, a validação é
estrutural e o aviso fica no relatório.

Consulte também [docs/pendencias-oficiais.md](../../../../../docs/pendencias-oficiais.md).
