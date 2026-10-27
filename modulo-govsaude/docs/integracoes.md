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

## Central de integrações (Fase 11)

Motor em `app/services/integracoes.py`, rotas em `/integracoes`, migração `0014`.

**Adaptador por manifesto.** `app/integracoes/manifesto.py` lê
`especificacoes/<SISTEMA>/<versao>/manifest.json` (formato no docstring do
módulo) e mapeia o payload canônico do domínio para o layout. Trocar de
versão de layout é trocar o manifesto; o motor não muda. Sem manifesto, ou com
manifesto inválido, o sistema fica no `AdaptadorPendente`. Manifesto com
`"sintetico": true` (só para teste) é recusado em produção.

**Fluxo.** `POST /integracoes/{sistema}/execucoes?competencia=AAAAMM`:
1. *Geração*: varre o domínio da competência e classifica em novos, alterados,
   exclusões, já enviados, rejeitados e em fila. Registro alterado depois do
   envio vira uma nova linha `ALTERACAO`; registro invalidado vira `EXCLUSAO`
   (se o layout admitir). A linha anterior é preservada (`substituido_por_id`).
   Pode ser repetida na mesma competência sem duplicar.
2. *Validação prévia*: CPF/CNS, nascimento, CNES, CNS/CBO do profissional,
   código da vacina, lote, CATMAT e SIGTAP, mais os obrigatórios do layout.
   Erros vão para a fila de correção (`INVALIDO`) com mensagem legível.
3. *Transmissão*: `HTTP_JSON` com mTLS (certificado do ente via
   `credenciais_ref` = `env:` ou `arquivo:`), `Idempotency-Key`, backoff
   exponencial em 5xx/429/timeout (`ERRO_TRANSITORIO`), 4xx = `REJEITADO` com
   as mensagens oficiais. `ARQUIVO`: `POST /{sistema}/lotes` gera o arquivo
   (JSON Lines) para o centralizador e marca os envios como `ENVIADO`.
4. *Retornos*: `POST /{sistema}/retornos` por protocolo, envio ou lote+registro.

Fila de correção e consulta: `/integracoes/inconsistencias` (CSV/XLSX/PDF, por
cidadão, unidade, tipo e motivo), `/envios`, `/registros/{tipo}/{id}`,
`/envios/{id}/reprocessar|cancelar`, `/{sistema}/competencias/{AAAAMM}`.
Painel e alertas: `/integracoes/painel`. Automática: tarefa
`govsaude.processar_outbox` (ligar `INTEGRACOES_AUTOMATICAS`) executa as
configurações com `transmissao_automatica` conforme `periodicidade_minutos`.
RNDS em produção exige `homologacao_aprovada_em`.

Tipos de registro: RNDS — `aplicacao_vacina`, `resultado_exame`,
`dispensacao`; BNAFAR — `dispensacao`, `movimentacao_estoque`; LEDI_APS —
`atendimento_individual`, `atendimento_odontologico`, `visita_domiciliar`,
`exame_siscan`.

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
