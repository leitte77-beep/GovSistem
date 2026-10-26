# Integrações oficiais

## Padrão

Cada sistema tem:

```
app/integracoes/<sistema>/
  porta.py            # Protocol com métodos de domínio
  mapeador.py         # domínio → payload oficial
  validador.py        # regras pré-envio
  adaptador_<versao>.py
app/integracoes/especificacoes/<sistema>/<versao>/  # artefatos oficiais
```

A versão ativa por tenant fica em `integracao_configuracoes`
(`sistema`, `versao_layout`, `ambiente`, vigência, parâmetros). O estado de cada
registro fica em `integracao_envios`, nunca dentro do registro clínico.

## Estados

`PENDENTE → VALIDADO → ENVIANDO → ENVIADO → ACEITO | REJEITADO`
e, para falhas temporárias, `ERRO_TRANSITORIO` com retry exponencial.
Alteração de registro já enviado gera uma nova linha `ALTERACAO` e preserva o
histórico.

## Fase 0

A infraestrutura está pronta:

- catálogo `integracao_sistemas` (seed);
- configuração por tenant;
- outbox e worker Celery;
- painel técnico via `/sistema/info` e futura `/integracoes/painel`;
- worker não transmite sem adaptador registrado em `ADAPTADORES_DISPONIVEIS`.

Não há adaptador oficial habilitado. Consulte
[pendencias-oficiais.md](pendencias-oficiais.md).

## CNES (Fase 1)

A importação de estabelecimentos, equipes, profissionais e vínculos é feita por
arquivo oficial colocado em `api/scripts/dados_oficiais/cnes/`, descrito por um
manifesto em `api/app/integracoes/especificacoes/cnes/<versao>/manifest.json`.
O manifesto mapeia campos internos para nomes de colunas oficiais; não há
posições/layout fixos no código. Sem manifesto/arquivo, a execução retorna
`PENDENTE_ESPECIFICACAO_OFICIAL`. O relatório aponta linha, campo, valor
mascarado, motivo e ação sugerida, e a importação é idempotente pelo hash.

## CADSUS (Fase 2)

A porta `app/integracoes/cadsus/porta.py` expõe consulta por CPF (identificador
principal) ou CNS (alternativo). Sem contrato/credencial oficial, o adaptador
`AdaptadorCADSUSPendente` retorna `PENDENTE_ESPECIFICACAO_OFICIAL`; o endpoint
ainda faz compatibilização com o cadastro local por hash HMAC. Nunca há
scraping.

## Biometria da recepção (Fase 4)

A porta `app/integracoes/biometria/porta.py` define a identificação biométrica
opcional. O adaptador `AdaptadorBiometriaPendente` não compara templates e
retorna `PENDENTE_ESPECIFICACAO_OFICIAL`, pois não há padrão/provedor oficial
configurado. A recepção sempre aceita código de barras, QR e identificação
manual; nenhum template biométrico é armazenado pelo módulo. Para habilitar,
o município deve fornecer a especificação do equipamento, base legal/RIPD,
contrato e alternativas obrigatórias.

## Ambientes

| Sistema | Homologação | Produção |
|---|---|---|
| RNDS | obrigatória antes da produção; certificado do ente | só após aceite |
| LEDI/SIAPS | centralizador municipal de teste | centralizador oficial |
| BNAFAR | ambiente de teste quando publicado | produção |
| CADSUS | credencial de teste do tenant | credencial do tenant |

## Segurança

- Certificados ICP-Brasil em volume montado, fora do repositório.
- Senha do PFX em `SecretStr`/variável de ambiente.
- Payloads oficiais referenciados por `payload_ref` no MinIO privado.
- Nenhum dado clínico trafega para compras/contábil/protocolo (Lote 01).
