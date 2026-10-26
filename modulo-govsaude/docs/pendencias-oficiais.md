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
