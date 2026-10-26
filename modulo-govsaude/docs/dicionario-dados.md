# Dicionário de dados — Fase 0

Classificação: `PUBLICO`, `PESSOAL`, `SENSIVEL_SAUDE`, `SIGILOSO`.
Toda tabela de negócio tem `tenant_id` (UUID, NOT NULL) e auditoria de escrita.
Campos marcados `[C]` são criptografados em coluna; `[H]` têm HMAC para busca;
`[M]` são mascarados em listagens.

## Núcleo

### organizacoes
`id`, `externo_id`, `nome`, `slug`, `tipo`, `cnpj_normalizado` [M], `cnpj_hash`,
`uf`, `municipio_ibge`, `fuso_horario`, `ativa`, timestamps.
Classe: PESSOAL (dados do ente; CNPJ público, mas mascarado por minimização).

### entes_consorciados
`tenant_id`, `municipio_ibge`, `nome`, `cnpj_normalizado` [M], `situacao`,
`vigencia_inicio`, `vigencia_fim`. Classe: PESSOAL.

### estabelecimentos / setores / equipes / especialidades
`tenant_id`, `cnes`, `nome`, `tipo`, endereço, contatos, `ine`, vínculos.
Classe: PUBLICO/PESSOAL (contato profissional). Sem dado clínico.

### profissionais / vinculos_profissionais
`nome`, `nome_social`, `cpf_hash` [H], `cpf_cifrado` [C], `cpf_final`, `cns_hash`
[H], `cns_cifrado` [C], `cbo`, conselho, carga horária, vigência.
Classe: PESSOAL.

### usuarios
`nome`, `email` [M], `nome_acesso`, `cpf_hash` [H], `cpf_cifrado` [C],
`cpf_final`, `cns_hash` [H], `cns_cifrado` [C], `telefone` [M],
`permissoes_extras`, `permissoes_revogadas`, `password_hash` (nunca exposto),
`mfa_secret_cifrado` [C], `token_version`, datas, janela de horário.
Classe: PESSOAL/SENSIVEL (credenciais e vínculos).

### historico_senhas
`usuario_id`, `password_hash` (hash bcrypt, nunca senha), `created_at`.
Classe: PESSOAL/SENSIVEL (credencial). A troca verifica as N senhas anteriores.

### grupos / permissoes / grupo_permissoes / usuario_grupos
Códigos e escopos (`estabelecimento_id`, `equipe_id`, `especialidade_id`),
vigência. Classe: PUBLICO (catálogo) / PESSOAL (vínculo).

### termos_uso / termos_aceites
Versão, conteúdo, IP, user-agent, data/hora. Classe: PESSOAL.

### configuracoes_tenant / formularios_dinamicos / respostas_formulario
Configuração e respostas; respostas clínicas são `SENSIVEL_SAUDE` quando
vinculadas a entidade clínica. JSON versionado por vigência.

### notificacoes / mensagens_internas / notas_profissionais / ocorrencias_unidade
`notificacoes`: destinatário, tipo, texto. `mensagens_internas.conteudo_cifrado`
[C]. `notas_profissionais.conteudo_cifrado` [C] e `nivel_sigilo` (padrão
SIGILOSO). Classe: PESSOAL/SENSIVEL_SAUDE.

### anexos
`chave_objeto` (opaca), `nome_original` (opcional, sem PII no caminho), `mime`,
`tamanho_bytes`, `hash_sha256`, `status_antivirus`. Classe: conforme entidade;
SENSIVEL quando clínico.

### jobs / idempotency_keys / contadores
Metadados operacionais; `idempotency_keys.response_body` pode conter dados de
resposta e deve ser expurgado. Classe: PESSOAL quando contém referência a
usuário/cidadão.

## Auditoria

### audit_trail (particionada por mês)
`tenant_id`, `usuario_id`, `usuario_nome`, `grupo_ativo`, `acao`, `recurso`,
`recurso_id`, `finalidade`, `resultado`, `justificativa`, `dados_antes`,
`dados_depois`, `diff`, `ip`, `user_agent`, `request_id`, `created_at`.
Classe: PESSOAL/SENSIVEL. Campos sensíveis em `dados_*`/`diff` ficam `***` ou
`[ALTERADO]`; UPDATE/DELETE bloqueados.

## Integrações

### integracao_sistemas / integracao_configuracoes
Catálogo e versão ativa por tenant; credenciais por referência, nunca em claro.

### integracao_envios
`tenant_id`, `sistema`, `tipo_registro`, `registro_id`, `versao_registro`,
`operacao`, `situacao`, `tentativas`, `protocolo`, `payload_hash`, `payload_ref`,
`mensagens`, `competencia`. Payload oficial pode ser SENSIVEL_SAUDE; fica no
MinIO cifrado/privado e é referenciado por hash.

## Fase 1 — rede de atenção e cadastros-base

### servicos_classificacoes
`tenant_id`, `estabelecimento_id`, `tipo` (`SERVICO|CLASSIFICACAO`), `codigo`,
`nome`, `observacoes`, `ativo`, `versao`, baixa lógica. Classe: PUBLICO.
Código/descrição são configuração do tenant; não substituem tabela oficial.

### procedimentos_autorizados
`tenant_id`, `estabelecimento_id`, `profissional_id` (opcional),
`especialidade_id` (opcional), `codigo_sigtap` (10 dígitos), `competencia`,
vigência, `validado_referencia`, `aviso_referencia`, `ativo`, `versao`.
Classe: PUBLICO/PESSOAL (vínculo profissional). Sem base SIGTAP, o aviso
registra a pendência; nunca há descrição/compatibilidade inventada.

### horarios_funcionamento
`tenant_id`, `estabelecimento_id`, `setor_id` (opcional), `dia_semana` (0–6),
`hora_inicio`, `hora_fim`, vigência, `ativo`, `versao`. Classe: PUBLICO.

### escalas / plantoes
`tenant_id`, `estabelecimento_id`, `setor_id`, `equipe_id`, `profissional_id`,
`data`, `hora_inicio`, `hora_fim`, `tipo`, `situacao`, `observacoes`,
`justificativa_excecao`, `autorizado_por_id`, `autorizado_em`, `versao`,
baixa lógica. Classe: PESSOAL (turno de profissional). Sobreposição é
detectada; exceção exige justificativa de 20+ caracteres e fica auditada.

### prioridades
`tenant_id`, `codigo`, `rotulo`, `ordem`, `prioridade_legal`, `base_legal`,
`observacoes`, vigência, `ativo`, `versao`. Classe: PUBLICO. O motor lê os
dados; nenhuma ordem/rótulo/legalidade é fixada no Python. Seed cria apenas
`ELETIVA`/`PRIORITARIA` configuráveis e não legais.

### restricoes_horario_acesso
`tenant_id`, `usuario_id` ou `grupo_id`, `estabelecimento_id` (opcional),
`dias_semana` (JSON 0–6), `hora_inicio`, `hora_fim`, vigência, `motivo`,
`ativo`, `versao`, baixa lógica. Classe: PESSOAL.

### profissionais_especialidades
`tenant_id`, `profissional_id`, `especialidade_id`, `principal`, vigência,
`versao`. Classe: PESSOAL.

### importacoes_cnes
`tenant_id`, `job_id`, `status`, `arquivo_nome` (nome técnico, sem PII),
`hash_arquivo`, `versao_layout`, `competencia`, totais (`linhas`, `validos`,
`rejeitados`, `criados`, `atualizados`), `conferencia_ok`, `relatorio` JSON,
`criado_por_id`. Classe: PESSOAL quando o relatório contém referência a
profissional; valores de CPF/CNS/nome aparecem mascarados.

### profissionais (extensão)
Novas colunas: `nome_busca`, `nome_fonetico`, `email` [M], `telefone` [M],
`versao`. CPF/CNS continuam com hash [H], ciphertext [C] e final [M]. Índices
únicos parciais por tenant impedem CPF/CNS ativo duplicado.

### equipes (extensão)
Novas colunas: `vigencia_inicio`, `vigencia_fim`, `versao`; `tipo` restrito a
`ESF|EAP|ESB|EMULTI|OUTRA` por CHECK.

## Fase 2 — cidadão (cadastro único)

### cidadaos
`tenant_id`, `nome`, `nome_social`, `nome_busca`, `nome_fonetico`, `cpf_hash` [H],
`cpf_cifrado` [C], `cpf_final` [M], `cns_hash` [H], `cns_cifrado` [C],
`cns_final` [M], `data_nascimento`, `sexo`, identidade/orientação, raça/cor,
etnia, nacionalidade, `municipio_nascimento_ibge`, `ocupacao_cbo`,
`escolaridade`, `situacao_rua`, `mae_id` (auto-relacionamento), `nome_mae`,
`mae_nome_busca`, `mae_nome_fonetico`, `unificado_para_id`, `unificado_em`,
`observacoes`, `versao`, baixa lógica. Classe: PESSOAL/SENSIVEL.
Índices únicos parciais impedem CPF/CNS ativo duplicado.

### cidadao_documentos
`tenant_id`, `cidadao_id`, `tipo`, `numero_hash` [H], `numero_cifrado` [C],
`numero_final` [M], órgão/UF, emissão, validade, `principal`, baixa, `versao`.
Classe: PESSOAL/SENSIVEL.

### cidadao_contatos
`tenant_id`, `cidadao_id`, `tipo`, `valor_hash` [H], `valor_cifrado` [C],
`valor_final`, `principal`, baixa, `versao`. Classe: PESSOAL.

### cidadao_enderecos
`tenant_id`, `cidadao_id`, tipo, CEP, logradouro, número, complemento, bairro,
`municipio_ibge`, UF, país, referência, `principal`, baixa, `versao`.
Classe: PESSOAL.

### cidadao_fotos
`tenant_id`, `cidadao_id`, `chave_objeto` opaca, MIME, tamanho, hash SHA-256,
status antivírus, `principal`, `criado_por_id`, baixa, `versao`. Classe:
SENSIVEL (biometria/foto). Objeto privado; nunca nome/CPF no caminho.

### planos_saude_vinculos
`tenant_id`, `cidadao_id`, operadora, plano, tipo, carteira (`hash` [H],
`cifrado` [C], final [M]), `principal`, vigência, baixa, `versao`.
Classe: PESSOAL/SENSIVEL.

### cidadao_alergias / cidadao_condicoes
Alergias: substância/busca, tipo, gravidade, reação, data, observações.
Condições: `tipo_codigo` (`CID10|CIAP2|CIPE|OUTRO`), código, descrição
opcional (nunca inventada), datas, situação, observações. Ambas com baixa e
`versao`. Classe: SENSIVEL_SAUDE.

### cidadao_duplicidades
`tenant_id`, `cidadao_id`, `candidato_id`, `pontuacao`, `motivos` JSON,
`status` (`PENDENTE|MESMO|DIFERENTE|IGNORADO`), decisão (autor/data/
justificativa). Classe: PESSOAL.

### cidadao_unificacoes
`tenant_id`, `origem_id`, `destino_id`, `campos_escolhidos` JSON,
`dados_antes_destino` JSON, `status` (`ATIVA|REVERTIDA`), justificativa,
autor, reversão (data/autor/justificativa). Classe: PESSOAL.

### cidadao_baixas
`tenant_id`, `cidadao_id`, `tipo` (`BAIXA|REATIVACAO`), motivo, data, usuário,
observações. Classe: PESSOAL.

## Fase 4 — agenda, recepção, fila e painéis

### protocolos_classificacao_risco / niveis_classificacao_risco
Protocolo por estabelecimento (`nome`, `versao_protocolo`, `descricao`,
`vigencia_inicio`, `vigencia_fim`, `ativo`, `versao`, baixa lógica) e níveis
(`codigo`, `rotulo`, `cor`, `ordem`, `prioridade_legal`, `tempo_alvo_minutos`,
`ativo`). Classe: PUBLICO (configuração assistencial); o tenant define os dados,
nenhuma cor/ordem/tempo é fixada no código.

### agendas / agenda_horarios / agenda_bloqueios
`agendas`: `tenant_id`, `estabelecimento_id`, `setor_id`, `equipe_id`,
`profissional_id`, `especialidade_id`, `protocolo_risco_id`,
`prioridade_padrao_id`, `procedimento_sigtap`, `nome`, `tipo`, `modalidade`,
`permite_encaixe`, `falta_automatica`, `tolerancia_atraso_minutos`,
antecedências, faixa de idade, `sexos_permitidos` (JSON), vigência, `ativo`,
`versao`, baixa lógica. Classe: PUBLICO.
`agenda_horarios`: dia da semana (0–6), início/fim, duração e vagas por horário.
`agenda_bloqueios`: intervalo, tipo, motivo, autor, cancelamento com motivo.
Classe: PUBLICO.

### agendamentos
`tenant_id`, `agenda_id`, `estabelecimento_id`, `setor_id`, `profissional_id`,
`especialidade_id`, `cidadao_id`, prioridade/protocolo/nível, procedimento
SIGTAP, `inicio_em`/`fim_em` (UTC), `situacao`, `origem`, `encaixe`,
`excecao_justificada`, `justificativa_excecao`, `observacoes`, `codigo_hash`
[H], `id_cliente`, marcos (`confirmado_em`, `recepcionado_em`, `iniciado_em`,
`concluido_em`, `cancelado_em`, `falta_em`), falta automática/reversão,
`reagendado_de_id`, `versao`. Classe: PESSOAL/SENSIVEL_SAUDE. O token de
comprovante não é armazenado em claro; só o HMAC. Índice único parcial impede
dois agendamentos ativos do mesmo cidadão no mesmo horário.

### filas_atendimento / eventos_fila
`filas_atendimento`: estabelecimento, setor, cidadão, agendamento (opcional),
prioridade/protocolo/nível, `origem`, `situacao`, marcos de entrada, chamada,
triagem e atendimento, `nome_abreviado` [M], snapshots de ordenação
(`nivel_ordem`, `prioridade_ordem`, `prioridade_legal`), `regra_ordenacao` JSON,
`versao`. Classe: PESSOAL/SENSIVEL_SAUDE.
`eventos_fila`: trilha de eventos da fila (`ENTRADA`, `CHAMADA`,
`CLASSIFICACAO`, triagem, atendimento, evasão, cancelamento), com usuário e
dados resumidos. Classe: PESSOAL. Não é apagada pela API.

### paineis_chamada / chamadas_painel
`paineis_chamada`: estabelecimento, setor, nome, `nome_abreviado`,
`voz_habilitada`, rodapé, notícias JSON, `ultima_chamada_em`, `versao` e baixa
lógica. `chamadas_painel`: fila, destino, tipo (`NORMAL|PREFERENCIAL|
RECHAMADA`), texto exibido, texto para voz, autor e instante. Classe: PUBLICO
(configuração do painel) / PESSOAL (histórico com nome abreviado).

## Referência (schema `referencia`, sem tenant)

`municipios_ibge`, `ceps`, `cbo`, `cid10`, `ciap2`, `cnae`,
`cnes_estabelecimentos`, `sigtap_procedimentos`, `imunobiologicos`,
`medicamentos`, `versoes_referencia`.
Classe: PUBLICO (tabelas oficiais). Não há dado de cidadão aqui.

## Regras transversais

- `created_at`/`updated_at` em timestamptz UTC; competência no fuso do tenant.
- Dinheiro `NUMERIC(14,2)`, quantidade `NUMERIC(14,3)`, `Decimal` no Python.
- Baixa lógica (`baixa_em`, `baixa_motivo`, `baixa_por_id`) em vez de DELETE.
- Histórico por vigência (`vigencia_inicio`, `vigencia_fim`), nunca sobrescrita.
- CPF/CNS não aparecem em URL, log, cache, nome de arquivo ou chave de objeto.
