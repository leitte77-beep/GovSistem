# Pendências de especificação oficial

Regra: o sistema **não inventa** layout, código, campo ou regra oficial. O que
depende de artefato oficial fica atrás de uma porta e recebe o estado
`PENDENTE_ESPECIFICACAO_OFICIAL`.

## Artefatos ainda não presentes no repositório

| Sistema | Artefato necessário | Onde obter | Consequência |
|---|---|---|---|
| LEDI APS / e-SUS APS / SIAPS | `.thrift` oficial da versão vigente + manuais de ficha | Centralizador/SAPS e repositório oficial do e-SUS APS | Porta LEDI sem serializador real; envio não habilitado |
| RNDS (FHIR R4) | StructureDefinitions, OperationDefinitions e guias dos modelos RIA, RAC, REL, RIRA, REDFM e REPM | Portal RNDS/DATASUS e guia de interoperabilidade | Porta RNDS sem validador de perfis; homologação não habilitada |
| BNAFAR | Layouts oficiais REPE/RESMPE e regras de envio diário | Publicações do Ministério da Saúde/BNAFAR | Sem transmissão BNAFAR |
| CADSUS | Contrato de serviço e credencial do tenant | CADSUS/SERPRO | Porta sem adaptador |
| CNES | Arquivo/serviço oficial de estabelecimentos, profissionais e equipes | DATASUS/CNES | Importador sem massa oficial |
| SIGTAP | Tabela oficial por competência | DATASUS/SIGTAP | Tabela de referência vazia até importação |
| SIA/SIH/RAAS | Layouts BPA-C, BPA-I, APAC, RAAS e AIH vigentes | Manuais DATASUS | Exportadores não habilitados |
| SISCAN | Formulários e meio oficial vigente | INCA/SISCAN | Exportação não habilitada |
| Banco de Preços em Saúde | Layout vigente | Ministério da Saúde | Exportação não habilitada |
| SIOPS | Layout de apoio | SIOPS | Sem geração de apoio |
| Equipamentos de laboratório | Protocolos ASTM/HL7 v2 de cada equipamento | Manual do fabricante | Porta genérica sem adaptador |
| Geoprocessamento municipal | API documentada do município | Prefeitura | Importação/consulta pendente |

## Fase 1 — rede de atenção e cadastros-base

| Item | Artefato necessário | Onde obter | Consequência |
|---|---|---|---|
| Importação CNES | Arquivo oficial de estabelecimentos/profissionais/equipes/vínculos + manifesto de layout versionado | DATASUS/CNES (arquivo oficial), documentação de layout do CNES | `POST /importacoes/cnes` fica `PENDENTE_ESPECIFICACAO_OFICIAL`; nenhum dado é inventado |
| Base CNES de validação | Recorte oficial por competência para `referencia.cnes_estabelecimentos` | DATASUS/CNES | Enquanto vazia, o CNES é validado apenas estruturalmente (7 dígitos) |
| CBO oficial | Tabela CBO importada em `referencia.cbo` | MTE/CBO | Enquanto vazia, o CBO é validado apenas estruturalmente (6 dígitos) |
| SIGTAP oficial | Tabela por competência em `referencia.sigtap_procedimentos` | DATASUS/SIGTAP | Sem base, o procedimento autorizado é gravado com `validado_referencia=false` e aviso; com base, código inexistente é rejeitado |
| Validação do INE | Regra/arquivo oficial de INE (não há DV publicado no material recebido) | CNES/DATASUS | Validação estrutural de 10 dígitos e conferência contra equipes importadas |
| Prioridade legal | Norma municipal/estadual que fundamenta cada prioridade | Gestor municipal / secretaria de saúde | O tenant deve cadastrar `base_legal`; o seed não cria prioridade legal |
| Compartilhamento de consórcio | Acordo explícito entre entes (escopo, finalidade, vigência) | Gestores dos entes | A Fase 1 entrega somente o cadastro de entes; compartilhamento entre tenants não foi antecipado |

## Fase 2 — cadastro único do cidadão

| Item | Artefato necessário | Onde obter | Consequência |
|---|---|---|---|
| CADSUS | Contrato oficial (endpoint, autenticação, mensagens) e credencial do tenant | CADSUS/SERPRO | `POST /cidadaos/consulta-cadsus` retorna `PENDENTE_ESPECIFICACAO_OFICIAL`; a compatibilização local CPF/CNS continua funcionando |
| Base oficial de CEP | Arquivo/base de CEP com logradouro, bairro, município IBGE e UF | Correios ou base oficial municipal/estadual | `referencia.ceps` vazia; consulta retorna pendência e nenhum endereço é inventado |
| Domínios oficiais de cadastro individual | Domínios de sexo, raça/cor, etnia, escolaridade, identidade de gênero e orientação conforme ficha oficial e-SUS/SIAPS | Ministério da Saúde/DATASUS | Valores atuais são contrato do módulo (`sexo` fechado; demais texto), a compatibilizar com o layout oficial |
| Pesos/limiar de deduplicação | Definição municipal dos pesos e limiar de sugestão de duplicidade | Gestor municipal/DPO | Seed conservador (`60`) e pesos configuráveis; requer calibração com dados reais |
| Política de foto | Definição do tenant sobre uso/obrigatoriedade da foto | Gestor municipal | Configuração `cidadao.uso_foto`; `permitir` é aplicado no upload; `obrigatoria` está registrada, mas ainda não bloqueia a criação do cidadão |

## Fase 4 — agenda, recepção, fila e painel

| Item | Artefato necessário | Onde obter | Consequência |
|---|---|---|---|
| Identificação biométrica | Especificação do equipamento/provedor, formato de captura, consentimento e motor de comparação (não há padrão municipal único) | Fabricante do equipamento / contrato do município | `POST /recepcao/check-in` com `metodo=BIOMETRIA` retorna `PENDENTE_ESPECIFICACAO_OFICIAL` e informa as alternativas obrigatórias (código de barras, QR e manual). Nenhum template biométrico é armazenado |
| Protocolos de classificação de risco | Protocolo vigente do município/estado com níveis, cores, tempos-alvo e prioridades legais | Secretaria municipal de saúde / regulação | O módulo implementa o motor; o tenant deve cadastrar os dados via `/protocolos-classificacao-risco`. Não há protocolo, cor ou tempo-alvo “de memória” no seed |
| Prioridades legais da fila | Norma municipal/estadual que fundamenta cada prioridade legal | Gestor municipal / secretaria de saúde | A fila lê `prioridades` do tenant; o seed continua criando apenas prioridades configuráveis e não legais |
| Regra de antecedência/tolerância | Definição municipal de antecedência mínima/máxima e tolerância de atraso por agenda | Gestor municipal | Campos configuráveis por agenda; os defaults (`0 h`, `365 dias`, `30 min`) são operacionais e precisam de validação |
| Integração com painéis físicos | Protocolo do painel/TV ou API do fornecedor, se o município já possui telas | Fornecedor do painel | A API entrega SSE + histórico + texto de voz; a integração específica do hardware não foi antecipada |

## Fase 5 — prontuário (PEC) ambulatorial

| Item | Artefato necessário | Onde obter | Consequência |
|---|---|---|---|
| Classificação nutricional (IMC) por ciclo de vida | Pontos de corte vigentes por ciclo (adulto, idoso, gestante) e curvas de crescimento (escore-z por sexo/idade) para crianças e adolescentes | Ministério da Saúde/SISVAN (orientações de antropometria) e curvas OMS | `prontuario.tabelas_classificacao_nutricional` vazia: IMC é calculado e devolvido com `pendencia=TABELA_REFERENCIA_NAO_CONFIGURADA`. Escore-z exige importar as curvas; o motor atual só aplica faixas de IMC |
| Base farmacológica validada | Base de interações e de medicamentos potencialmente perigosos, com fonte e versão | Fonte licenciada/validada pela assistência farmacêutica municipal | Alertas de interação e MPP retornam `NAO_AVALIADO` (o alerta não é exibido); alergia e duplicidade são alertadas por código |
| Tabela de medicamentos (OBM/BR) | `referencia.medicamentos` importada | CATMAT/BR / RENAME | Sem base, o código do item não é validado |
| CID-10, CIAP-2 e CIPE | Tabelas oficiais importadas (`referencia.cid10`, `referencia.ciap2`); CIPE sem tabela no modelo | DATASUS (CID-10), SBMFC/WONCA (CIAP-2), CIE/COFEN (CIPE) | Condição do cadastro (Fase 2) validada só estruturalmente (CID-10/CIAP-2); a conferência na base importada fica pendente |
| Notificação compulsória | Lista nacional de agravos vigente e meio de envio ao SINAN | Ministério da Saúde/SINAN | Notificação é registro assistencial configurável; envio não habilitado |
| Fichas e-SUS (consumo alimentar, atividade coletiva, atenção domiciliar etc.) | `.thrift` LEDI da versão vigente | Portal e-SUS APS | Coleta via formulário dinâmico do tenant; exportação na Fase 11 |
| Etapas, campos obrigatórios e validade de consulta | Definição municipal | Secretaria municipal de saúde | Configurações `prontuario.*` nascem vazias; sem regra, nada é exigido |
| Assinatura digital | ICP-Brasil / assinatura gov.br | ITI / gov.br | Assinatura atual é eletrônica interna (usuário + carimbo de tempo + auditoria) |

## Fase 9 — imunização

| Item | Artefato necessário | Onde obter | Consequência |
|---|---|---|---|
| Calendário/esquemas do PNI | Doses, idades mínima/máxima, intervalos e grupos por imunobiológico, na versão vigente | Ministério da Saúde/PNI (Calendário Nacional de Vacinação, Instrução Normativa anual, notas técnicas) | Nenhum esquema semeado; sem esquema ativo a aplicação só informa `SEM_ESQUEMA_ATIVO` |
| Validade pós-abertura | Prazo por imunobiológico e apresentação | Bula do fabricante / Manual de Normas e Procedimentos para Vacinação | Obrigatória no cadastro da vacina multidose; o sistema não supõe valor |
| Estratégias de vacinação e domínios RIA | Lista oficial (rotina, campanha, bloqueio etc.) e códigos | Modelo RIA da RNDS | Estratégia é texto do tenant |
| RNDS — RIA | StructureDefinitions/perfis FHIR do RIA e credencial do estabelecimento | Portal RNDS/DATASUS | `exportacao-rnds` retorna `PENDENTE_ESPECIFICACAO_OFICIAL`; contrato `xfail` |
| URL pública do QR | Domínio público do município | Prefeitura | Configurar `PUBLIC_BASE_URL`; sem ela o QR traz só o caminho |

## Fase 8 — estoque e assistência farmacêutica

| Item | Artefato necessário | Onde obter | Consequência |
|---|---|---|---|
| Portaria SVS/MS 344/1998 — livros, BMPO e balanços | Modelos/layout vigentes de escrituração e balanços (e o meio oficial de envio, se houver) | ANVISA / vigilância sanitária | Dispensação exige documento; escrituração e balanços não são gerados |
| Campos obrigatórios da retenção de receita | Norma vigente de receituário de controlados e antimicrobianos | ANVISA (Portaria 344, RDC de antimicrobianos) | `estoque.campos_documento_controlado` vazio: exige apenas o documento |
| Listas de controle | Listas oficiais vigentes (A1…C5 etc.) | ANVISA | `lista_controle` é texto do tenant; não há lista no seed |
| BNAFAR (REPE/RESMPE) | Layouts oficiais e regras de envio diário | Ministério da Saúde/BNAFAR | Exportação entra na Fase 11 pela porta pendente |
| CATMAT/OBM | Tabelas oficiais | Compras.gov.br / CMED-ANVISA | Códigos aceitos estruturalmente |
| Limiares operacionais | Antecedência de vencimento, janela de duplicidade, desvios, ABC e cobertura | Assistência farmacêutica municipal | Seeds `estoque.*` com valores operacionais (90 dias, 30 dias, 2σ, 80/95%, 1 mês) a validar |
| Frascos multidose abertos | Validade pós-abertura por imunobiológico | Manual de normas do PNI | Alerta `PENDENTE` até a Fase 10 |
| Integração contábil/compras | Contrato de API do GovCompras/contábil (Lote 01) | Plataforma GovSistem | Sem integração; nenhum dado clínico trafega |

## Fase 6 — programas e linhas de cuidado

| Item | Artefato necessário | Onde obter | Consequência |
|---|---|---|---|
| Protocolos dos modelos (mulher, criança, hipertensão, diabetes, gestante) | Periodicidade de consultas/exames/fornecimentos, faixas etárias e códigos CID-10/CIAP-2 de entrada vigentes | Cadernos de Atenção Básica/protocolos MS-SAPS e protocolo municipal | Seeds `SEED_A_VALIDAR` sem regra clínica e inativos; o motor não agenda nada até o tenant preencher e ativar |

## Fase 7 — odontologia

| Item | Artefato necessário | Onde obter | Consequência |
|---|---|---|---|
| LEDI — ficha de atendimento odontológico | `.thrift` oficial da versão vigente | Portal e-SUS APS / documentação LEDI | `exportacao-ledi` retorna `PENDENTE_ESPECIFICACAO_OFICIAL`; contrato em `xfail` |
| Catálogo odontológico | Condições/procedimentos, cores e SIGTAP adotados pelo município | Coordenação de saúde bucal + tabela SIGTAP importada | Catálogo vazio até o tenant cadastrar |
| Classificação de risco odontológico | Protocolo municipal (níveis e critérios) | Coordenação de saúde bucal | Configuração `odontologia.classificacoes_risco` vazia aceita qualquer valor |

## Pontos que exigem validação humana antes de produção

1. **Código IBGE de município**: o requisito fala em 7 dígitos com DV, mas o
   algoritmo de DV não foi publicado no material recebido. A implementação
   valida estrutura (UF 11..53 + 5 dígitos) e, quando a base oficial estiver
   importada, valida contra a tabela `referencia.municipios_ibge`. Não foi
   criado algoritmo de DV “de memória”. Validar com a fonte oficial.
2. **CNES e CBO**: validação estrutural; a validação definitiva é contra as
   bases oficiais importadas (`universo`).
3. **Regras de indicadores APS**: fichas metodológicas mudam por portaria;
   o motor versionado entra na Fase 12 com seeds marcados `A_VALIDAR`.
4. **RNDS/BNAFAR**: ambientes de homologação e certificados ICP-Brasil do ente
   precisam ser fornecidos pelo município.
5. **Prazos de competência**: SIAPS (10º dia útil), BNAFAR (diário/correção até
   o fim do mês seguinte) serão implementados na Fase 11 a partir das regras
   oficiais vigentes, não no código da fundação.
6. **Mapeamento dos IDs da Fase 1**: o catálogo completo dos requisitos
   (`B.x-nnn`) não está no repositório. Os IDs usados foram confirmados no
   `PROMPT-BACKEND-GOVSAUDE.md`; a associação funcional de cada ID precisa ser
   conferida no catálogo oficial do Lote 02.
7. **Prioridades legais**: não há tabela nacional única no material recebido;
   a prioridade legal é configuração do tenant com base normativa informada.
8. **INE**: validação estrutural; confirmar se existe regra oficial de DV ou
   conferência obrigatória contra o arquivo CNES para o município.
9. **Semântica da restrição de horário**: a implementação trata
   `dias_semana`/`hora_inicio`/`hora_fim` como **janela permitida** (fora dela
   bloqueia). Confirmar com o gestor se alguma restrição deve ser interpretada
   como janela proibida.
10. **Criação de profissional**: agora exige `estabelecimento_id` e cria o
    primeiro vínculo na mesma transação. Confirmar se haverá fluxo de cadastro
    de profissional sem lotação inicial (ex.: banco de talentos) em fase futura.
11. **Mapeamento dos IDs da Fase 2**: B.1-004, B.1-006 e B.12-008 foram
    associados a cadastro/documentos/contatos/compatibilização por inferência
    da descrição da fase; conferir no catálogo oficial do Lote 02.
12. **Unificação**: a origem continua existindo e é excluída da busca padrão;
    os dados de origem não são reparentados. Confirmar se essa semântica atende
    à operação municipal.
13. **Deduplicação**: a pontuação e o limiar são sugestões; a decisão e a
    unificação são sempre humanas e auditadas.
14. **Mapeamento dos IDs da Fase 4**: B.6-003, B.6-005 e B.3-008 foram
    associados à recepção/bloqueio, identificação e agenda odontológica por
    inferência da descrição da fase; conferir no catálogo oficial do Lote 02.
15. **Fila e justiça da ordenação**: a implementação ordena por nível de risco,
    prioridade legal/ordem e chegada. Confirmar com o gestor e com o protocolo
    municipal se a prioridade legal deve prevalecer em algum cenário.
16. **Encaixe**: exige agenda com `permite_encaixe` e justificativa de 20+
    caracteres; confirmar se o município quer aprovação de um segundo usuário
    para encaixes de risco.
17. **Biometria**: a decisão de adotar biometria exige base legal, RIPD,
    consentimento quando aplicável, contrato com fornecedor e alternativa
    obrigatória. O módulo não armazena template nem usa biometria como único
    fator.

## Como registrar um novo artefato

1. Coloque o arquivo em `api/app/integracoes/especificacoes/<sistema>/<versao>/`.
2. Registre a versão em `integracao_sistemas`/`integracao_configuracoes`.
3. Implemente `mapeador.py` e `validador.py` contra o fixture oficial.
4. Adicione teste de contrato que compara o payload gerado ao fixture.
5. Atualize esta página e `docs/rastreabilidade.md`.
16. **Mapeamento dos IDs da Fase 6**: a divisão de B.2-001…015 por
    funcionalidade foi inferida; conferir no catálogo oficial do Lote 02.
17. **Primeira programação**: com periodicidade, a primeira data prevista é
    `data_base + periodicidade` (a inscrição não gera consulta no mesmo dia).
    Confirmar com a coordenação da APS.
18. **Mapeamento dos IDs da Fase 7**: só parte de B.3-001…027 pôde ser associada;
    conferir no catálogo oficial do Lote 02.
19. **Digitação retroativa**: considerada retroativa a data de início com mais
    de 24 h; limite padrão de 30 dias. Validar com a coordenação.
