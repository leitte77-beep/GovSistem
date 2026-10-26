# Catálogo oficial — Anexo B (Lote 02, Saúde)

Transcrição dos requisitos do **Anexo B do Termo de Referência para contratação
de sistemas web do Município de Farol/PR** (documento recebido em 2026-10-26).
É a fonte dos IDs `B.x-nnn` usados em `rastreabilidade.md`, nas docstrings e
nos nomes dos testes. Em caso de divergência, vale o TR original.

Os requisitos deste anexo foram consolidados, deduplicados e atualizados. Deverão ser atendidos a Portaria GM/MS nº 3.493/2024, o
modelo vigente de cofinanciamento da APS, as fichas metodológicas atuais, a RNDS e o SUS Digital. Todos os requisitos são obrigatórios
no aceite, ainda que a PoC teste apenas amostra crítica e obrigatória.
DADOS SENSÍVEIS O Lote 02 tratará dados pessoais sensíveis de saúde. A implantação exige avaliação de riscos, perfis por necessidade de
acesso, trilhas de auditoria, continuidade e cooperação com o encarregado de dados do Município.

## B.1 Saúde da Família, Território e ACS

- **B.1-001** — Permitir cadastro e baixa lógica do cidadão com motivo, data, responsável e preservação do histórico.
- **B.1-002** — Registrar foto do cidadão por câmera ou arquivo, quando houver base legal e política municipal de uso.
- **B.1-003** — Cadastrar e pesquisar logradouros, bairros, distritos, CEP, código IBGE e referências territoriais, com atualização por fonte autorizada.
- **B.1-004** — Manter cadastro do cidadão compatível com os modelos de informação vigentes do e-SUS APS, incluindo CPF, CNS quando disponível, nome social, filiação, nascimento, sexo, raça/cor, etnia, ocupação, contatos, documentos e endereço.
- **B.1-005** — Vincular cidadão, família, domicílio, equipe, área, microárea, unidade e profissional de referência, mantendo histórico de alterações.
- **B.1-006** — Permitir cadastro individual, informações sociodemográficas, condições de saúde, situação de rua, contatos, local de trabalho e observações conforme modelos oficiais vigentes.
- **B.1-007** — Controlar unificações cadastrais com comparação, justificativa, origem dos dados e possibilidade de auditoria.
- **B.1-008** — Registrar planos de saúde e demais vínculos assistenciais do cidadão quando necessários ao atendimento.
- **B.1-009** — Permitir cadastro de recém-nascido a partir da mãe, sem duplicação e com atualização posterior de documentos.
- **B.1-010** — Cadastrar áreas, microáreas, equipes e profissionais conforme CNES e identificadores oficiais vigentes.
- **B.1-011** — Controlar inclusão, afastamento e retirada de profissionais de equipes e microáreas com vigência e histórico.
- **B.1-012** — Transferir imóveis, famílias e cidadãos entre áreas, microáreas e domicílios, preservando o histórico territorial.
- **B.1-013** — Cadastrar domicílios e imóveis segundo o modelo oficial, composição familiar, responsável, condições de moradia e vínculo com cidadãos.
- **B.1-014** — Permitir baixa lógica de imóvel e família, mudança de domicílio, alteração de responsável e registro dos integrantes que deixaram a residência.
- **B.1-015** — Registrar animais existentes no imóvel quando relevante às ações de saúde e vigilância, com campos configuráveis.
- **B.1-016** — Pesquisar domicílio por endereço, responsável, integrante, família atual ou histórica.
- **B.1-017** — Emitir extrato territorial de domicílios, famílias, cidadãos e visitas por unidade, equipe, área, microárea, bairro e logradouro.
- **B.1-018** — Identificar domicílios não visitados, cobertura de visitas e percentuais por competência, território e profissional.
- **B.1-019** — Registrar visita domiciliar e territorial conforme modelos de informação vigentes do e-SUS APS, incluindo motivo, busca ativa, acompanhamento, controle ambiental, antropometria, sinais vitais, glicemia e desfecho.
- **B.1-020** — Respeitar regras de uma visita por cidadão, turno ou competência quando definidas pelo Ministério da Saúde, alertando o operador.
- **B.1-021** — Exibir o vínculo do cidadão visitado com domicílio, família, equipe e profissional.
- **B.1-022** — Permitir configurar obrigatoriedade ou recomendação de GPS, precisão mínima, justificativa de ausência e política de privacidade para visitas móveis.
- **B.1-023** — Registrar assinatura do cidadão ou responsável em visitas quando previsto no fluxo municipal.
- **B.1-024** — Emitir relatórios de cidadãos, famílias e domicílios visitados e não visitados, com quantidades, percentuais e filtros territoriais.
- **B.1-025** — Disponibilizar estratificação de risco familiar e individual por instrumentos configuráveis, com cálculo, histórico e impressão.
- **B.1-026** — Cadastrar metas de agentes comunitários e equipes, incluindo famílias, cidadãos, gestantes, hipertensos, diabéticos, tuberculose, hanseníase, nutrição e outras prioridades.
- **B.1-027** — Comparar metas e produção por período, profissional, área, microárea e equipe, sem substituir os indicadores oficiais.
- **B.1-028** — Exibir mapas de áreas e microáreas, pontos de visita e cobertura territorial, respeitando o princípio da minimização e o acesso autorizado.
- **B.1-029** — Exibir trajetos de visitas somente para usuários autorizados, com período definido, justificativa de finalidade e retenção limitada.
- **B.1-030** — Possibilitar dashboards com população por território, evolução de visitas, cadastros inconsistentes e demanda de atualização.
- **B.1-031** — Permitir atualização offline e sincronização segura de cadastros, domicílios e visitas por aplicativo móvel.
- **B.1-032** — Tratar conflitos de sincronização, duplicidades, rejeições e inconsistências com fila de revisão.
- **B.1-033** — Exportar registros para o e-SUS APS/SISAB ou sistema oficial sucessor nos layouts e meios vigentes, com protocolo e retorno.
- **B.1-034** — Permitir múltiplas exportações na competência, identificando registros novos, alterados, rejeitados e já enviados.
- **B.1-035** — Validar previamente campos obrigatórios e regras do layout oficial, apresentando mensagens compreensíveis e possibilidade de correção.
- **B.1-036** — Disponibilizar relatórios de indicadores e boas práticas da APS conforme fichas metodológicas vigentes do Ministério da Saúde.
- **B.1-037** — Permitir acompanhamento de numerador, denominador, parâmetro, meta, resultado e memória de cálculo por município, unidade e equipe, quando publicados oficialmente.
- **B.1-038** — Acompanhar a Portaria GM/MS nº 3.493/2024, suas alterações, o modelo de cofinanciamento e o componente de qualidade vigentes, sem se limitar a normas anteriores revogadas.
- **B.1-039** — Permitir simulação e acompanhamento de períodos atuais ou futuros com identificação clara de dados preliminares.
- **B.1-040** — Manter histórico das regras de cálculo e da versão do indicador utilizada em cada apuração.
- **B.1-041** — Emitir relatórios em formatos abertos e painéis com filtros, aplicando proteção a dados pessoais.
- **B.1-042** — Permitir integração autorizada com cadastro territorial e geoprocessamento municipal por API documentada.

## B.2 Ações Programáticas e Linhas de Cuidado

- **B.2-001** — Cadastrar programas, linhas de cuidado, grupos prioritários, protocolos, medicamentos, consultas, exames e periodicidades.
- **B.2-002** — Programar acompanhamentos e fornecimentos por cidadão, com agenda, frequência, atraso, suspensão e encerramento.
- **B.2-003** — Controlar inclusão, situação, motivo de saída, profissional responsável e histórico do usuário no programa.
- **B.2-004** — Registrar atendimentos e informações específicas definidas em formulários configuráveis e modelos oficiais.
- **B.2-005** — Permitir fluxo de recepção, enfermagem, atendimento médico, odontológico e multiprofissional.
- **B.2-006** — Registrar ações de prevenção e rastreamento de câncer de colo do útero e mama.
- **B.2-007** — Gerenciar planejamento reprodutivo, fatores de risco, métodos contraceptivos, orientações e acompanhamento.
- **B.2-008** — Gerenciar climatério e menopausa, sintomas, condições, tratamentos e acompanhamento.
- **B.2-009** — Gerenciar saúde da criança, crescimento, desenvolvimento, alimentação, situação vacinal e intercorrências.
- **B.2-010** — Controlar fornecimentos de medicamentos e insumos vinculados aos programas, integrando a farmácia.
- **B.2-011** — Emitir busca ativa de usuários com comparecimento, consulta, exame ou fornecimento em atraso.
- **B.2-012** — Emitir relatórios por programa, sexo, faixa etária, território, unidade, profissional e situação.
- **B.2-013** — Produzir informações de apoio a programas federais e estaduais vigentes, sem manter referências exclusivas a sistemas descontinuados.
- **B.2-014** — Estimar demanda futura de consultas, exames, medicamentos e procedimentos com base na programação.
- **B.2-015** — Permitir parametrização de novas ações programáticas sem desenvolvimento estrutural.

## B.3 Odontologia

- **B.3-001** — Cadastrar e inativar procedimentos odontológicos, grupos, dentes, faces, cores e aplicabilidade em dentição decídua ou permanente.
- **B.3-002** — Integrar procedimentos ao faturamento ambulatorial e aos modelos de informação do e-SUS APS vigentes.
- **B.3-003** — Configurar classificação de risco odontológico, protocolos, níveis, cores, tempo de espera e regras por unidade.
- **B.3-004** — Realizar triagem odontológica com sinais vitais, motivo, profissional, especialidade, risco e encaminhamento.
- **B.3-005** — Disponibilizar questionários de anamnese configuráveis por idade, sexo e condição.
- **B.3-006** — Manter odontograma gráfico e histórico, refletindo diagnósticos, condições, procedimentos realizados e planejados.
- **B.3-007** — Permitir visualização do histórico multiprofissional autorizado do paciente durante o atendimento.
- **B.3-008** — Recepcionar paciente por agendamento, código de barras, QR Code ou pesquisa segura.
- **B.3-009** — Registrar atendimento odontológico, diagnóstico por dente e face, procedimentos, auxiliares, orientações e desfecho.
- **B.3-010** — Registrar tipo de consulta, vigilância em saúde bucal e fornecimento de produtos conforme ficha oficial vigente.
- **B.3-011** — Programar procedimentos futuros e controlar atrasos e retornos.
- **B.3-012** — Visualizar documentos anexos do paciente conforme permissão.
- **B.3-013** — Emitir receitas, atestados, declarações, autorizações, orientações, guias de referência e contrarreferência.
- **B.3-014** — Permitir assinatura eletrônica ou digital dos documentos conforme política municipal.
- **B.3-015** — Cadastrar e imprimir estratificações de risco odontológico.
- **B.3-016** — Permitir digitação retroativa de fichas realizadas em unidades não informatizadas, com identificação do responsável e período.
- **B.3-017** — Emitir ficha completa do atendimento com odontograma, prescrição, exames e encaminhamentos.
- **B.3-018** — Consultar histórico odontológico por paciente, incluindo triagens, riscos, diagnósticos, procedimentos, prescrições, exames e documentos.
- **B.3-019** — Emitir relatórios de atendimentos por profissional, especialidade, unidade, território, faixa etária e procedimento.
- **B.3-020** — Emitir relatórios de procedimentos por dente, face, procedimento, profissional e período.
- **B.3-021** — Gerar comparativos temporais de atendimentos, procedimentos, encaminhamentos e solicitações.
- **B.3-022** — Listar usuários com procedimentos programados atrasados.
- **B.3-023** — Integrar estoque e farmácia para consulta e prescrição de medicamentos, respeitando permissões.
- **B.3-024** — Manter auditoria de alteração do odontograma e do prontuário.
- **B.3-025** — Permitir modelos diferenciados de documentos por profissional ou unidade, mediante parametrização.
- **B.3-026** — Aplicar sigilo e restrição de acesso às informações clínicas odontológicas.
- **B.3-027** — Exportar produção e registros conforme layouts oficiais vigentes.

## B.4 Estoque, Almoxarifado e Assistência Farmacêutica

- **B.4-001** — Controlar medicamentos, vacinas, insumos, materiais e produtos por estabelecimento, local, lote, fabricante, validade, quantidade e situação.
- **B.4-002** — Permitir bloqueio e desbloqueio de itens ou lotes em um ou vários locais, com motivo, responsável e auditoria.
- **B.4-003** — Gerenciar grupos, princípios ativos, apresentações, unidades, códigos oficiais, Rename, Remume e Ontologia Brasileira de Medicamentos quando aplicável.
- **B.4-004** — Definir estoque mínimo, máximo, ideal, ponto de pedido e consumo médio por local.
- **B.4-005** — Gerar sugestão de compra, requisição e redistribuição, apresentando memória de cálculo e permitindo ajuste autorizado.
- **B.4-006** — Apurar custo médio, última aquisição ou outro método parametrizado e aceito pela contabilidade.
- **B.4-007** — Controlar centros de custo e rastreabilidade de cada movimentação por lote.
- **B.4-008** — Gerenciar kits e conjuntos de materiais, composição, montagem, desmontagem, código de barras e etiquetas.
- **B.4-009** — Registrar entradas por nota fiscal, fornecedor, pedido, empenho, contrato, lote, validade, quantidade, custo e centro de custo.
- **B.4-010** — Importar itens de pedidos e documentos de compra integrados, evitando redigitação.
- **B.4-011** — Emitir guias de entrada, pedido, transferência, requisição, ajustes e inventário.
- **B.4-012** — Registrar saídas para consumo interno, dispensação ao cidadão, perdas, quebras, vencimentos, devoluções e doações.
- **B.4-013** — Identificar item e lote por código de barras ou QR Code.
- **B.4-014** — Controlar requisições entre locais, saldo do solicitante, saldo do fornecedor, previsão de entrega, observações e atendimento parcial.
- **B.4-015** — Permitir aceite, recusa e devolução de itens recebidos por transferência, com reintegração do estoque de origem.
- **B.4-016** — Alertar sobre estoque abaixo do mínimo, itens a vencer, frascos abertos, lotes bloqueados e consumo anormal.
- **B.4-017** — Realizar inventário físico, contagem, reconciliação e ajuste mediante autorização.
- **B.4-018** — Controlar abertura e encerramento de competências de movimentação.
- **B.4-019** — Importar prescrições médicas e odontológicas e apresentar disponibilidade por unidade, sem substituir a decisão clínica.
- **B.4-020** — Permitir dispensação total ou parcial, com registro do profissional, cidadão, prescrição, lote, quantidade, data e documento.
- **B.4-021** — Alertar fornecimento duplicado no mesmo dia ou período configurado em qualquer unidade, permitindo exceção justificada.
- **B.4-022** — Solicitar dados obrigatórios de receituários controlados e antimicrobianos, conforme legislação vigente.
- **B.4-023** — Emitir comprovante de dispensação e declaração de comparecimento, com assinatura quando exigida.
- **B.4-024** — Controlar medicamentos sujeitos à Portaria SVS/MS nº 344/1998 e normas sucessoras, com livros, balanços e relatórios exigidos.
- **B.4-025** — Emitir BMPO, balanços trimestrais e anuais, livros e relação de notificações conforme regras vigentes.
- **B.4-026** — Disponibilizar curva ABC, consumo diário/mensal/anual, giro, cobertura, perdas e indicadores gerenciais.
- **B.4-027** — Emitir saldo em qualquer data, por lote, custo, validade, local e pedidos pendentes.
- **B.4-028** — Gerar relatórios comparativos de entradas, saídas, dispensações, transferências, perdas e ajustes.
- **B.4-029** — Integrar compras, contratos, empenhos, almoxarifado geral e contabilidade, com segregação dos dados clínicos.
- **B.4-030** — Transmitir dados de estoque, movimentação, dispensação e fornecimento à BNAFAR/RNDS por SOA, APIs ou padrão oficial vigente.
- **B.4-031** — Atender aos modelos REPE, RESMPE, REDFM, REPM e demais registros oficiais aplicáveis, conforme periodicidade vigente.
- **B.4-032** — Apresentar fila de envio, protocolos, inconsistências, correções, reenvios e histórico de cada registro.
- **B.4-033** — Não se limitar a web service legado quando o Ministério da Saúde disponibilizar mecanismo sucessor.
- **B.4-034** — Integrar com a RNDS conforme o Decreto nº 12.560/2025 e atos posteriores aplicáveis.
- **B.4-035** — Manter controle de acesso reforçado a prescrições, dispensações e medicamentos controlados.
- **B.4-036** — Permitir rastreabilidade completa da aquisição à dispensação ou perda.
- **B.4-037** — Registrar temperatura e condições de armazenamento quando previsto no fluxo, com alertas e histórico.
- **B.4-038** — Permitir importação e atualização de tabelas oficiais de medicamentos e procedimentos.
- **B.4-039** — Disponibilizar APIs para equipamentos, leitores e integrações autorizadas.
- **B.4-040** — Permitir operação contingencial e posterior sincronização em indisponibilidade temporária, preservando integridade.
- **B.4-041** — Gerar dados de apoio ao Banco de Preços em Saúde nos layouts vigentes.
- **B.4-042** — Migrar estoques, lotes, movimentos, prescrições, dispensações, documentos e históricos do sistema anterior.
- **B.4-043** — Manter relatórios de conciliação entre estoque físico, sistema e contabilidade.

## B.5 Preventivos de Câncer e SISCAN

- **B.5-001** — Registrar requisições de exames citopatológicos e histopatológicos de colo do útero conforme modelo vigente do SISCAN.
- **B.5-002** — Registrar requisições de mamografia, com anamnese, exame clínico e indicação conforme modelo vigente.
- **B.5-003** — Registrar requisições citopatológicas e histopatológicas de mama.
- **B.5-004** — Identificar paciente, unidade de origem, profissional, especialidade, data de coleta, material e informações clínicas.
- **B.5-005** — Emitir guias oficiais ou modelos equivalentes para cada tipo de exame.
- **B.5-006** — Registrar resultados citopatológicos de colo do útero a partir da requisição.
- **B.5-007** — Registrar resultados histopatológicos de colo do útero.
- **B.5-008** — Registrar resultados citopatológicos de mama.
- **B.5-009** — Registrar resultados histopatológicos de mama.
- **B.5-010** — Registrar resultados de mamografia com classificação e campos vigentes.
- **B.5-011** — Controlar situação da requisição, coleta, envio, resultado, comunicação e acompanhamento.
- **B.5-012** — Exibir histórico por paciente, tipo, situação e período, incluindo programação do próximo exame.
- **B.5-013** — Gerar alertas e listas de busca ativa por atraso ou resultado alterado, com acesso restrito.
- **B.5-014** — Faturar procedimentos de coleta em BPA conforme regras vigentes.
- **B.5-015** — Exportar produção para o e-SUS APS, SISAB ou sistema oficial sucessor.
- **B.5-016** — Permitir assinatura eletrônica ou digital do resultado e laudo.
- **B.5-017** — Emitir relatórios por unidade, profissional, resultado, faixa etária, território e período.
- **B.5-018** — Atualizar modelos e campos quando o SISCAN ou sistema sucessor alterar seus layouts.

## B.6 Atendimento Ambulatorial, Prontuário Eletrônico e Regulação

- **B.6-001** — Disponibilizar recepção para demanda espontânea e agendada, cadastro, atualização, pesquisa e visão resumida do cidadão.
- **B.6-002** — Exibir endereço, CPF, CNS, território, equipe, família, agendamentos e atendimentos anteriores conforme permissão.
- **B.6-003** — Recepcionar por código de barras, QR Code ou biometria opcional, com método alternativo obrigatório.
- **B.6-004** — Manter prontuário eletrônico com recepção, acolhimento, triagem, enfermagem, consulta e demais etapas configuráveis.
- **B.6-005** — Bloquear ou alertar agendamentos cancelados, excluídos, vencidos ou incompatíveis.
- **B.6-006** — Restringir visualização de atendimentos por unidade, especialidade, profissional, sigilo e necessidade de acesso.
- **B.6-007** — Cadastrar classificações de risco, protocolos, sintomas, níveis, cores e tempos de espera por unidade.
- **B.6-008** — Ordenar fila conforme classificação, prioridade legal e tempo de espera, com transparência da regra.
- **B.6-009** — Registrar dor torácica e outros protocolos estruturados, sem impedir texto clínico livre.
- **B.6-010** — Calcular IMC e classificações nutricionais por ciclo de vida conforme referências vigentes.
- **B.6-011** — Exibir evolução de peso, IMC, pressão, glicemia, frequência cardíaca, respiratória, saturação e outras medidas.
- **B.6-012** — Registrar acolhimento, sinais vitais, motivo, observações, risco, encaminhamento, evasão e desfecho.
- **B.6-013** — Permitir encaminhamento interno sem retorno obrigatório à recepção, conforme fluxo configurado.
- **B.6-014** — Configurar obrigatoriedade de campos por unidade, idade, sexo, especialidade e tipo de atendimento.
- **B.6-015** — Manter cadastro de alergias e alertá-las nos fluxos clínicos.
- **B.6-016** — Permitir múltiplos problemas, condições, CIDs, CIAP, CIPE e classificações adotadas oficialmente.
- **B.6-017** — Registrar plano de cuidados e plano terapêutico, com controle de acesso e vigência.
- **B.6-018** — Solicitar exames, incluir complementares, aplicar regras de autorização, carência, contrato e validade.
- **B.6-019** — Prescrever medicamentos, consultar disponibilidade, distinguir uso contínuo, via, antimicrobianos e controlados.
- **B.6-020** — Alertar alergias, interações, duplicidades e medicamentos potencialmente perigosos quando houver base validada.
- **B.6-021** — Permitir cópia assistida de prescrição anterior, exigindo revisão e confirmação do profissional.
- **B.6-022** — Registrar práticas integrativas, aleitamento, atenção domiciliar, condições avaliadas e demais campos do modelo oficial.
- **B.6-023** — Registrar notificações compulsórias e abrir investigação quando configurada ocorrência, preservando sigilo.
- **B.6-024** — Registrar solicitações e atendimentos de atenção psicossocial e RAAS conforme layouts vigentes.
- **B.6-025** — Registrar escalas e avaliações fisioterapêuticas e multiprofissionais configuráveis.
- **B.6-026** — Manter ficha clínica contínua e linha do tempo do prontuário.
- **B.6-027** — Registrar anamnese, queixa, exame físico, hipótese, diagnóstico, conduta, procedimento, prescrição, exame e encaminhamento.
- **B.6-028** — Permitir observação, internação municipal ou encaminhamento ao pronto atendimento quando integrante do fluxo.
- **B.6-029** — Anexar imagens, PDFs e documentos, com classificação, autoria, data e permissão.
- **B.6-030** — Registrar marcadores de consumo alimentar e demais fichas do e-SUS APS.
- **B.6-031** — Cadastrar e imprimir estratificações de risco configuráveis.
- **B.6-032** — Emitir receitas, atestados, declarações, orientações, requisições e referências/contrarreferências.
- **B.6-033** — Separar receituários comuns, antimicrobianos, controlados e itens disponíveis em estoque, conforme regras.
- **B.6-034** — Permitir modelos de receituário por profissional e unidade, com assinatura eletrônica ou digital.
- **B.6-035** — Registrar atendimentos sigilosos e definir especialidades/unidades autorizadas a visualizá-los.
- **B.6-036** — Permitir digitação retroativa de atendimentos e procedimentos realizados em contingência, com autorização e auditoria.
- **B.6-037** — Registrar atendimentos domiciliares, elegibilidade, admissão, plano, procedimentos e alta conforme modelo oficial.
- **B.6-038** — Registrar atividades coletivas conforme modelos vigentes.
- **B.6-039** — Registrar atenção psicossocial, solicitações, situação de rua, álcool e outras drogas, procedimentos e desfechos.
- **B.6-040** — Controlar comorbidades e linhas de cuidado de acordo com protocolos adotados.
- **B.6-041** — Controlar validade de consultas e reconsultas, alertando ou bloqueando conforme regra autorizada.
- **B.6-042** — Registrar ocorrências diárias das unidades.
- **B.6-043** — Permitir programação de produção e comparação entre meta e realizado.
- **B.6-044** — Gerenciar benefícios ou procedimentos custeados, com quantidade, valor, autorização, faturamento e relatório.
- **B.6-045** — Gerenciar painéis eletrônicos, setores, filas, notícias, chamada por voz ou som e histórico.
- **B.6-046** — Proteger identidade no painel, exibindo nome abreviado quando necessário, especialmente em classificação de risco.
- **B.6-047** — Emitir relatório de tempos de recepção, triagem, consulta e espera por unidade, setor, profissional e especialidade.
- **B.6-048** — Emitir relatório clínico e gerencial de atendimentos, diagnósticos, procedimentos, prescrições, exames e encaminhamentos.
- **B.6-049** — Emitir comparativos temporais de atendimentos, diagnósticos, encaminhamentos e procedimentos.
- **B.6-050** — Permitir listas de espera de consultas e exames com prioridade, classificação, posição, contatos e auditoria.
- **B.6-051** — Integrar regulação municipal e prestadores, com cotas, autorizações, contratos e retorno.
- **B.6-052** — Permitir faturamento BPA, APAC, RAAS, AIH e outros, conforme competência e responsabilidade municipal.
- **B.6-053** — Aplicar consistências oficiais de sexo, idade, CNES, CBO, especialidade, serviço, classificação e procedimento.
- **B.6-054** — Gerar arquivos e relatórios para sistemas oficiais vigentes sem redigitação desnecessária.
- **B.6-055** — Permitir operação em contingência com posterior reconciliação e identificação de registros.
- **B.6-056** — Manter auditoria clínica de consulta, alteração, impressão, exportação e assinatura.
- **B.6-057** — Garantir que retificações preservem conteúdo anterior e justificativa.
- **B.6-058** — Disponibilizar busca rápida e filtros no prontuário sem expor dados a usuários não autorizados.
- **B.6-059** — Migrar integralmente prontuários, atendimentos, documentos, prescrições, exames, encaminhamentos e históricos.

## B.7 Imunização e Integração com a RNDS

- **B.7-001** — Cadastrar imunobiológicos, doses, esquemas, faixas etárias, sexo, fabricantes, apresentações, lotes e regras vigentes do PNI.
- **B.7-002** — Alertar ou bloquear aplicação fora de faixa, dose, intervalo, validade ou regra, permitindo exceção clínica justificada quando admitida.
- **B.7-003** — Controlar frascos ativos, abertos, aplicados, baixados e descartados, com saldo, validade após abertura e motivo de perda.
- **B.7-004** — Registrar abertura de frasco por unidade, lote, data, hora, quantidade e prazo de uso.
- **B.7-005** — Realizar descarte automático ou assistido de frascos vencidos e apurar perdas.
- **B.7-006** — Agendar vacinação por cidadão, unidade, vacina, dose e observação.
- **B.7-007** — Dar baixa no agendamento após aplicação e manter faltas e reagendamentos.
- **B.7-008** — Registrar atualização manual de vacina aplicada fora da rede, destacando que não houve aplicação local.
- **B.7-009** — Registrar aplicação nominal com data, lote, validade, dose, estratégia, profissional, estabelecimento e demais campos oficiais.
- **B.7-010** — Dar baixa automática do estoque e do frasco quando integrado.
- **B.7-011** — Calcular aprazamento conforme regras do PNI e permitir atualização de tabelas.
- **B.7-012** — Emitir carteira e certificado de vacinação, com histórico e doses futuras.
- **B.7-013** — Exportar e transmitir aplicações e movimentações conforme padrões oficiais vigentes.
- **B.7-014** — Integrar sistemas próprios à RNDS nos termos da Portaria GM/MS nº 5.663/2024 e normas sucessoras.
- **B.7-015** — Utilizar modelos de informação e padrões computacionais oficiais, inclusive FHIR quando determinado.
- **B.7-016** — Suportar autenticação mútua, certificados, credenciais e demais controles exigidos pela RNDS.
- **B.7-017** — Enviar inclusões, alterações e exclusões quando o serviço oficial admitir.
- **B.7-018** — Marcar registros alterados para reenvio e preservar versões.
- **B.7-019** — Manter fila de integração com pendentes, enviados, rejeitados, reenvios, protocolos e mensagens.
- **B.7-020** — Validar CPF/CNS, CNES, profissional, lote, vacina e campos obrigatórios antes do envio.
- **B.7-021** — Permitir impressão e exportação das inconsistências por cidadão, vacina, unidade e motivo.
- **B.7-022** — Executar transmissão automática com periodicidade configurada e compatível com a norma.
- **B.7-023** — Manter monitoramento e alerta de falhas de integração.
- **B.7-024** — Emitir busca ativa de cidadãos com vacinas pendentes ou atrasadas.
- **B.7-025** — Emitir relatórios de aplicações por unidade, profissional, vacina, dose, território, idade e população.
- **B.7-026** — Emitir relatórios de frascos, aplicações, perdas e saldo por lote e unidade.
- **B.7-027** — Permitir bloqueio por vacina vencida ou lote interditado.
- **B.7-028** — Aplicar rastreabilidade e auditoria integral das aplicações e alterações.
- **B.7-029** — Atualizar-se continuamente às regras, tabelas e modelos do PNI/RNDS sem custo adicional.

## B.8 Laboratório e Exames

- **B.8-001** — Configurar exames, métodos, materiais, bancadas, campos de resultado, unidades, referências e layouts de laudo.
- **B.8-002** — Registrar problemas de coleta, amostra, transporte e processamento com motivo e responsável.
- **B.8-003** — Copiar configurações entre unidades mediante controle de versão.
- **B.8-004** — Vincular procedimentos, CID e regras de faturamento.
- **B.8-005** — Controlar autorização de exames, alto custo, carência e validade.
- **B.8-006** — Restringir requisição e impressão por unidade, exame, perfil e sigilo.
- **B.8-007** — Controlar entrega de resultado e identificação de quem recebeu.
- **B.8-008** — Identificar exames integrados a equipamentos laboratoriais.
- **B.8-009** — Suportar interfaceamento por padrões ou APIs do equipamento, com logs e tratamento de falhas.
- **B.8-010** — Recepcionar exames a partir de solicitações do prontuário, agenda, código de barras ou QR Code.
- **B.8-011** — Registrar unidade de coleta, solicitante, urgência, gestação, material e observações.
- **B.8-012** — Emitir etiquetas com código de barras e permitir reimpressão auditada.
- **B.8-013** — Controlar coleta por leitura de etiqueta, material, data, hora e coletador.
- **B.8-014** — Emitir comprovante com previsão de retirada.
- **B.8-015** — Gerar mapas de trabalho por bancada, urgência, profissional, exame e situação.
- **B.8-016** — Acompanhar visualmente as etapas de recepção, coleta, processamento, resultado, validação, assinatura e entrega.
- **B.8-017** — Digitar resultados com validação de limites, unidades e valores críticos.
- **B.8-018** — Permitir resultados estruturados, texto livre, imagens e anexos.
- **B.8-019** — Registrar resultados de radiologia quando incluídos no escopo.
- **B.8-020** — Identificar resultados incompletos, pendentes ou fora de referência.
- **B.8-021** — Alertar exame recente ainda válido conforme regra configurada.
- **B.8-022** — Restringir liberação eletrônica ao profissional habilitado.
- **B.8-023** — Assinar eletrônica ou digitalmente laudos, registrando autor, data e hora.
- **B.8-024** — Permitir impressão e consulta do laudo na unidade de origem e portal autorizado do cidadão.
- **B.8-025** — Proteger exames sigilosos, como HIV e outros definidos, com acesso restrito.
- **B.8-026** — Emitir declaração de comparecimento.
- **B.8-027** — Faturar produção conforme BPA e demais instrumentos vigentes.
- **B.8-028** — Emitir relatórios de exames por quantidade, valor, unidade, exame, profissional, mapa, situação e prazo.
- **B.8-029** — Emitir histórico de todas as etapas e ocorrências do exame.
- **B.8-030** — Emitir comparativos temporais de produção e prazos.
- **B.8-031** — Integrar resultados ao prontuário e à RNDS quando houver modelo e interface oficial.
- **B.8-032** — Manter auditoria de visualização, alteração, impressão, download e entrega.
- **B.8-033** — Migrar exames, requisições, resultados, laudos, anexos e históricos.
- **B.8-034** — Permitir contingência e posterior sincronização sem duplicação.

## B.9 Vigilância Sanitária e Ambiental

- **B.9-001** — Manter CNAE e demais classificações oficiais atualizadas.
- **B.9-002** — Cadastrar estabelecimentos, responsáveis, contador, atividades, endereços, documentos e situação.
- **B.9-003** — Identificar estabelecimentos isentos, dispensados, licenciados, interditados ou com pendências.
- **B.9-004** — Emitir licenças sanitárias por atividade, exercício, vistoria, serviço farmacêutico e validade.
- **B.9-005** — Registrar inspeções, vistorias, notificações, advertências, autos, multas, interdições e providências.
- **B.9-006** — Programar atividades dos fiscais, prazos, responsáveis e produtividade.
- **B.9-007** — Emitir fichas de vistoria e habite-se por modelos configuráveis.
- **B.9-008** — Alertar ou escalar tarefas vencidas, sem bloquear acesso indevidamente.
- **B.9-009** — Registrar reclamações, denúncias e solicitações, protegendo identidade quando aplicável.
- **B.9-010** — Controlar habite-se sanitário, unidades, taxas e emissão.
- **B.9-011** — Cadastrar veículos e emitir licenças por tipo, proprietário, estabelecimento e validade.
- **B.9-012** — Manter modelos distintos de licenças e documentos.
- **B.9-013** — Registrar solicitação, coleta, recepção e resultado de análises de água.
- **B.9-014** — Registrar análises físico-químicas, microbiológicas, conclusão, alerta e necessidade de recoleta.
- **B.9-015** — Controlar entrega de resultados de água.
- **B.9-016** — Registrar solicitação e resultado de análises de alimentos.
- **B.9-017** — Permitir assinatura eletrônica ou digital dos resultados.
- **B.9-018** — Controlar entrega de resultados de alimentos.
- **B.9-019** — Registrar inspeção de abate, procedência, animais, peso, idade, sexo e achados.
- **B.9-020** — Registrar acidentes com animais, endereço, espécie, situação, acompanhamento e ficha.
- **B.9-021** — Gerenciar tarefas de controle ambiental e vetorial quando incluídas no escopo.
- **B.9-022** — Emitir relatórios por estabelecimento, atividade, contador, bairro, licença, situação e período.
- **B.9-023** — Emitir relatórios de veículos, análises, abates, tarefas e arrecadação.
- **B.9-024** — Integrar tributário para taxas e contabilidade para arrecadação sem expor dados clínicos.
- **B.9-025** — Integrar protocolo e documentos digitais.
- **B.9-026** — Disponibilizar aplicação móvel para vistorias, fotos, localização e assinatura, com modo offline.
- **B.9-027** — Manter trilha de auditoria e sigilo de denúncias.
- **B.9-028** — Atualizar modelos e regras de vigilância conforme Anvisa, Ministério da Saúde e normas locais.

## B.10 Aplicativo de Gestão da Saúde

- **B.10-001** — Disponibilizar aplicativo ou interface móvel segura para Android e iOS, admitida tecnologia nativa ou multiplataforma que cumpra desempenho, segurança e acessibilidade.
- **B.10-002** — Não exigir tecnologia específica de desenvolvimento quando os requisitos funcionais e de segurança forem atendidos.
- **B.10-003** — Distribuir atualizações por lojas oficiais, MDM ou mecanismo corporativo seguro.
- **B.10-004** — Configurar unidades, módulos, indicadores e perfis visíveis para cada usuário.
- **B.10-005** — Oferecer modo claro/escuro, fonte dinâmica e recursos de acessibilidade.
- **B.10-006** — Permitir login por CPF ou identificador institucional, MFA e biometria do dispositivo como segundo fator opcional.
- **B.10-007** — Permitir manter sessão somente conforme política de risco e tempo de inatividade.
- **B.10-008** — Exibir pacientes aguardando por setor, unidade e risco em tempo próximo do real.
- **B.10-009** — Exibir profissionais em atendimento, especialidade, produção e horários, respeitando privacidade.
- **B.10-010** — Exibir pacientes em observação ou internação quando aplicável.
- **B.10-011** — Permitir filtro por unidade, equipe, período e competência.
- **B.10-012** — Exibir medicamentos prescritos, dispensados, estoques e itens críticos por unidade.
- **B.10-013** — Exibir vacinas aplicadas, cobertura e busca ativa conforme regras oficiais.
- **B.10-014** — Exibir tempo médio de recepção, triagem, consulta e atendimento por unidade e profissional.
- **B.10-015** — Acompanhar indicadores do componente de qualidade da APS conforme fichas metodológicas vigentes.
- **B.10-016** — Exibir memória de cálculo, numerador, denominador, meta, parâmetro, competência, equipe e situação.
- **B.10-017** — Exibir listas de espera de consultas e exames por especialidade, exame, status e prioridade.
- **B.10-018** — Exibir motivos de não atendimento, tipos de atendimento e demanda por unidade.
- **B.10-019** — Exibir diagnósticos, procedimentos e exames solicitados de forma agregada.
- **B.10-020** — Exibir perfis populacionais agregados de gestantes, idosos, crianças e condições crônicas.
- **B.10-021** — Disponibilizar busca de insumo, vacina e procedimento.
- **B.10-022** — Enviar notificações push para usuários ou grupos autorizados.
- **B.10-023** — Manter painel de notificações, leitura, validade e desativação.
- **B.10-024** — Alertar prazos de envio e falhas de integração com sistemas oficiais.
- **B.10-025** — Alertar inatividade do usuário somente conforme política municipal e sem exposição de dados.
- **B.10-026** — Permitir exportação ou compartilhamento apenas de dados agregados e autorizados.
- **B.10-027** — Impedir armazenamento local desnecessário de dados pessoais e limpar cache sensível.
- **B.10-028** — Registrar acessos, consultas e ações do aplicativo.
- **B.10-029** — Permitir revogação de sessão e bloqueio remoto.
- **B.10-030** — Operar em conexão criptografada e validar certificado.
- **B.10-031** — Manter compatibilidade com versões suportadas dos sistemas móveis.

## B.11 Aplicativo ACS e Visitas Offline

- **B.11-001** — Apurar posição geográfica das visitas por GPS quando autorizado e configurado.
- **B.11-002** — Registrar múltiplas visitas por domicílio e cidadão conforme regras oficiais.
- **B.11-003** — Disponibilizar ao ACS somente áreas e microáreas autorizadas.
- **B.11-004** — Coletar assinatura do cidadão ou responsável quando previsto.
- **B.11-005** — Atualizar domicílio, família e cidadãos segundo modelos oficiais, com fila de validação.
- **B.11-006** — Permitir inclusão, alteração, saída e mudança de integrantes, preservando histórico.
- **B.11-007** — Carregar cadastros existentes da base central para uso offline de forma criptografada e minimizada.
- **B.11-008** — Registrar visitas domiciliares conforme ficha oficial vigente.
- **B.11-009** — Notificar inclusões, alterações e movimentações territoriais.
- **B.11-010** — Calcular estratificação familiar por instrumento configurado, como Coelho-Savassi, quando adotado.
- **B.11-011** — Registrar marcadores de consumo alimentar e demais formulários permitidos.
- **B.11-012** — Sincronizar dados com a base central, com protocolos, rejeições e reenvio. O funcionamento básico offline (registro e fila de sincronização) é requisito crítico; a resolução de conflitos complexos de sincronização concorrente é requisito obrigatório sujeito a saneamento pós-contratual, nos termos do Anexo H.
- **B.11-013** — Detectar e instalar atualizações por mecanismo seguro.
- **B.11-014** — Gerar backup criptografado controlado e impedir cópias informais.
- **B.11-015** — Permitir instalação em dispositivos Android suportados e, quando contratado, iOS.
- **B.11-016** — Funcionar offline em áreas sem cobertura, com sincronização posterior.
- **B.11-017** — Verificar cidadãos que entraram ou saíram da microárea e pendências de movimentação.
- **B.11-018** — Exibir relatórios locais de cidadãos, domicílios, famílias, visitas e comorbidades permitidas.
- **B.11-019** — Proteger o dispositivo com autenticação, criptografia, bloqueio e expiração de sessão.
- **B.11-020** — Permitir apagamento remoto ou invalidação de credenciais em perda, roubo ou desligamento.

## B.12 Cadastros, Configurações, Faturamento e Integrações Oficiais

- **B.12-001** — Identificar possíveis cadastros duplicados por nome, nascimento, filiação, CPF e CNS, com comparação e decisão humana.
- **B.12-002** — Unificar pessoas, logradouros, bairros e registros duplicados com preservação do histórico e rastreabilidade.
- **B.12-003** — Aplicar regras parametrizadas de sugestão de unificação, sem exclusão automática irreversível.
- **B.12-004** — Compatibilizar cidadãos com CPF, CNS e demais identificadores oficiais.
- **B.12-005** — Pesquisar nomes por fonética e variações, preservando critérios transparentes.
- **B.12-006** — Cadastrar estabelecimentos, setores, serviços, equipes, profissionais, especialidades, CBO, CNES e horários.
- **B.12-007** — Configurar procedimentos autorizados por estabelecimento, profissional e especialidade.
- **B.12-008** — Atualizar CEP, municípios, países e endereços por bases oficiais ou autorizadas.
- **B.12-009** — Exibir nome social nos fluxos e relatórios, mantendo o nome civil apenas quando legalmente necessário.
- **B.12-010** — Integrar com Cadweb, CNES e outras bases somente por interfaces oficiais e credenciais autorizadas.
- **B.12-011** — Configurar foto do cidadão e locais de exibição conforme política municipal.
- **B.12-012** — Definir horários, plantões, escalas e restrições de acesso por profissional e unidade.
- **B.12-013** — Cadastrar formulários, escalas e campos adicionais de forma dinâmica.
- **B.12-014** — Controlar carência, quantidade, valores e limites de procedimentos com alerta ou bloqueio.
- **B.12-015** — Vincular procedimentos municipais ao SIGTAP e demais tabelas oficiais.
- **B.12-016** — Configurar prioridade legal e clínica de atendimento.
- **B.12-017** — Acompanhar cadastros, vínculos e indicadores territoriais do modelo de cofinanciamento vigente.
- **B.12-018** — Cancelar ou marcar falta automaticamente após prazo configurado, permitindo reversão auditada.
- **B.12-019** — Configurar listas de espera por operador, unidade, especialidade e exame.
- **B.12-020** — Incluir automaticamente em lista de espera conforme regra e permitir revisão.
- **B.12-021** — Registrar lembretes e notas profissionais globais ou vinculadas ao cidadão, com controle de sigilo.
- **B.12-022** — Incluir notas pertinentes na impressão do prontuário apenas para perfis autorizados.
- **B.12-023** — Gerenciar termo de uso, aceite, versão, data, hora e rejeição de acesso.
- **B.12-024** — Emitir extratos consolidados do cidadão, família e unidade, com atendimentos, medicamentos, vacinas, exames, odontologia, transporte e outros.
- **B.12-025** — Emitir relatório consolidado de procedimentos por unidade, profissional, especialidade, território e faixa etária.
- **B.12-026** — Exportar AIH, APAC, BPA, RAAS e demais arquivos conforme sistemas e layouts vigentes.
- **B.12-027** — Importar retornos e produções de prestadores com validação e histórico.
- **B.12-028** — Importar e atualizar SIGTAP automaticamente por fonte oficial e também de forma manual controlada.
- **B.12-029** — Gerar BPA consolidado ou individualizado e permitir seleção de unidades e registros.
- **B.12-030** — Transmitir assistência farmacêutica à BNAFAR/RNDS conforme padrões vigentes.
- **B.12-031** — Integrar com CNES por web service, API ou arquivo oficial, com relatório de inconsistências.
- **B.12-032** — Gerar dados para o SIOPS somente como apoio operacional, permanecendo a obrigação fiscal no sistema contábil do Lote 01.
- **B.12-033** — Gerenciar contratos de prestadores, aditivos, vigência, valor, quantidade, cotas, fontes, impostos e unidades.
- **B.12-034** — Controlar disponibilidade anual e mensal por valor e quantidade.
- **B.12-035** — Configurar alertas de vencimento, consumo de saldo e inadimplência.
- **B.12-036** — Planejar produção e gastos de exercícios futuros, sem gerar obrigação orçamentária automática.
- **B.12-037** — Apurar faturamento por prestador, unidade, profissional, especialidade, convênio e procedimento.
- **B.12-038** — Controlar pagamentos parciais e situação de faturas, integrando contabilidade quando autorizado.
- **B.12-039** — Gerar documentos analíticos e sintéticos de faturamento.
- **B.12-040** — Aplicar regras oficiais de sexo, idade, CBO, CNES, serviço, classificação e procedimento.
- **B.12-041** — Emitir relatório de inconsistências por unidade, profissional, tipo de registro e mensagem.
- **B.12-042** — Permitir correção antes de exportação e reprocessamento controlado.
- **B.12-043** — Controlar cotas, PPI e limites por município, unidade, especialidade e procedimento quando aplicável.
- **B.12-044** — Distribuir custos e parâmetros por unidade de origem conforme regras municipais.
- **B.12-045** — Manter tabelas de valores por convênio e prestador com vigência.
- **B.12-046** — Permitir configurar convênios ativos, bloqueados e fontes de recurso.
- **B.12-047** — Controlar limites adicionais, autorizações e justificativas.
- **B.12-048** — Disponibilizar logs de usuário, IP, data, hora, ação, conteúdo anterior e posterior.
- **B.12-049** — Permitir senha forte, expiração, bloqueio por tentativas, MFA, encerramento de sessão e restrição de horário.
- **B.12-050** — Permitir grupos de usuários e privilégios por função, menu, unidade, dado e operação.
- **B.12-051** — Evitar algoritmos obsoletos de senha; utilizar hash forte com sal e parâmetros atuais.
- **B.12-052** — Permitir autenticação por CPF, e-mail ou nome de acesso, conforme política.
- **B.12-053** — Admitir biometria somente como método complementar, com alternativa de acesso e avaliação de proteção de dados.
- **B.12-054** — Anexar JPEG, PNG, PDF e outros formatos autorizados, com antivírus, tamanho, perfil e sigilo.
- **B.12-055** — Emitir relatórios em PDF, CSV, XLSX, XML e outros formatos abertos, com parâmetros de página.
- **B.12-056** — Utilizar banco de dados com transações ACID, integridade referencial, replicação, escalabilidade, backup e padrões abertos, sem exigir que seja open source.
- **B.12-057** — Exibir versão do sistema, data da atualização e notas de release.
- **B.12-058** — Disponibilizar mensagens internas com controle de acesso, retenção e auditoria.
- **B.12-059** — Disponibilizar APIs REST documentadas sob padrão OpenAPI e demais padrões de interoperabilidade do SUS, inclusive FHIR quando oficialmente exigido, sem limitar a tecnologia a SOAP.
- **B.12-060** — Atender ao Decreto nº 12.560/2025, ao Programa SUS Digital e aos modelos informacionais vigentes da RNDS. A funcionalidade de transmissão e recebimento de retorno (mecanismo de integração) é requisito crítico; a conformidade integral com a versão mais recente de cada layout de campo é requisito obrigatório, corrigível em prazo formal quando decorrente de atualização normativa federal superveniente.
- **B.12-061** — Manter integração desacoplada, filas, reprocessamento, idempotência e monitoramento.
- **B.12-062** — Fornecer ambiente de homologação com dados sintéticos ou anonimizados.
- **B.12-063** — Migrar integralmente cadastros, configurações, contratos, faturamentos, tabelas, documentos, logs e históricos.
- **B.12-064** — Entregar dicionário de dados, documentação de APIs, arquitetura, inventário de integrações e credenciais sob controle municipal.
- **B.12-065** — Garantir portabilidade e exportação total em formato aberto e estruturado ao término do contrato.
