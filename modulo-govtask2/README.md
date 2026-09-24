# GovTask

Do pedido do Prefeito ao pagamento.

O Prefeito conversa com um deputado e consegue um carro para o município.
Ele avisa o Assessor. O Assessor registra o pedido aqui, encaminha ao setor
que resolve — Jurídico, Engenharia, Licitação, Contabilidade, Tesouraria —,
recebe de volta com o documento anexado, e decide o próximo encaminhamento
até o dinheiro entrar e o carro chegar. Obra é a mesma coisa, com projeto,
medição, licitação e execução no meio.

Este módulo é exatamente isso, e nada mais.

## O desenho em uma frase

**O pedido vai e vem: só o Assessor encaminha, o setor assume, executa e
devolve ao Assessor.**

O Assessor é o centro. O pedido está sempre com ele ou com um setor. Não há
trilha fixa de fases: a cada encaminhamento o Assessor escolhe o destino, e
cada passagem por um setor é um `Encaminhamento`. Departamento **nunca**
encaminha para outro departamento.

Está no ar em **https://govtask.govsistem.com.br** desde 23/09/2026,
substituindo a versão anterior.

## Por que é pequeno de propósito

A versão anterior do módulo tinha 62 tabelas, 58 grupos de rotas, 116 telas e
cerca de 30 itens de menu. Entidades paralelas competiam entre si — Demanda,
Convênio, Obra, Processo, Tarefa, Etapa, Workflow, Licitação, Contrato,
Medição, Prestação, Repasse — e cada uma virou uma tela. O usuário não via um
fluxo; via um catálogo de cadastros.

O fluxo continua minúsculo: cinco tabelas de domínio — `pedidos`,
`encaminhamentos`, `medicoes`, `anexos` e `andamentos` — mais `notificacoes`.
O vocabulário estável (tipos, setores, prazos sugeridos) vive em código, em
[`api/app/core/fluxo.py`](api/app/core/fluxo.py), e não numa tela de
administração: foi a configurabilidade que produziu o labirinto anterior.

## O vai e vem

1. **O Assessor abre** o pedido. Ele nasce na mesa do Assessor.
2. **O Assessor encaminha** a um setor, com um assunto e, se quiser, prazo e
   responsável. Sem prazo, o sistema sugere um pelo setor de destino.
3. A tarefa cai na **fila do setor**. Qualquer pessoa do setor a vê.
4. **Um engenheiro assume.** A tarefa some para os demais do setor — salvo
   para quem ele **mencionar**, que passa a ver, comentar, anexar e concluir.
5. O responsável pode **transferir** a tarefa para outro colega do setor;
   o Assessor é avisado.
6. Se faltou informação, o setor **solicita complemento**: o pedido volta à
   mesa do Assessor. Respondido, retorna ao mesmo engenheiro.
7. Concluída, o setor **devolve ao Assessor** com o resultado. O Assessor
   decide o próximo encaminhamento — ou conclui o pedido.

Prazo é combinado: sugerido pelo sistema ou informado pelo Assessor, e o
responsável pode **negociar** depois. Toda mudança avisa o Assessor.

## Fila compartilhada, menção e transferência

Uma tarefa encaminhada sem responsável não pode sumir. Ela aparece para todo
o setor de destino até alguém assumir. Assumida, some para os outros — a
mesma pessoa que assumiu pode mencionar colegas, e eles trabalham junto. Se
quem assumiu sai de férias, transfere para um colega do mesmo setor, e o
Assessor recebe o aviso no sino.

## Avisos e espera de terceiros

- **Notificações in-app** — assunção, transferência, prazo alterado,
  complemento e devolução geram um aviso no sino da topbar do Assessor.
  Nada de e-mail: o aviso vive na tela.
- **Espera de terceiros** — quando o processo depende de um órgão externo, o
  Assessor estaciona o pedido em `AGUARDANDO_TERCEIRO`. Ele fica com o
  Assessor, e o painel para de cobrar a prefeitura por um atraso que não é
  dela.

## Próxima ação e saúde

Duas respostas que o gestor precisa em segundos, calculadas a partir do que
já está gravado — sem tabela nova, sem campo para manter e sem IA:

- **Próxima ação** — em uma frase: *"Assumir «Projeto e orçamento»"*,
  *"Responder complemento ao setor"*, *"Encaminhar a um setor ou concluir"*.
- **Saúde** — `NORMAL`, `ATENCAO` ou `CRITICA`, com o **motivo em palavras**.
  Regras em `api/app/services/saude.py`: prazo vencido no setor → crítico;
  na espera de terceiro → atenção; sem movimentação há 15 dias → crítico, há
  7 → atenção; complemento pendente → atenção.

A inatividade usa `pedidos.ultima_movimentacao_em`, um espelho do último
evento que `services.pedidos.registrar` mantém.

## Protocolo, financeiro, versões e medições

- **Protocolo estruturado** — número, sistema, órgão e data, editáveis no
  pedido. O painel de dados mostra tudo.
- **Financeiro gerencial** — `valor_previsto`, `valor_liberado` e
  `valor_pago`. Não substitui a contabilidade; responde "existe recurso?" e
  "houve pagamento?".
- **Versões de documento** — anexar de novo o mesmo documento (mesma
  descrição, ou mesmo nome de arquivo) gera v1, v2, v3. Nada é sobrescrito.
- **Medição de obra** — para pedidos do tipo `OBRA`, cada medição tem número,
  período, valor, percentual executado, responsável, observação e **fotos**.
  O acompanhamento é a linha do tempo mais as fotos.

## Relatórios

- **PDF e Excel por pedido** — identificação, participantes, protocolo,
  financeiro, todos os encaminhamentos com anexos e medições, e a timeline.
- **Exportações consolidadas** — listas por setor, por período e atrasados.

## Papéis

| Papel | O que faz |
|---|---|
| `ASSESSOR` | Abre o pedido, encaminha aos setores, recebe de volta, responde complemento, conclui e cancela. É o dono do fluxo. |
| `PREFEITO` | Abre pedido e acompanha. Não encaminha nem trabalha. |
| `DEPARTAMENTO` | Jurídico, Engenharia, Licitação, Contabilidade, Tesouraria: assumem, executam, anexam, pedem complemento e devolvem. |
| `CONSULTA` | Só lê. |
| `ADMIN` | Tudo. |

Os papéis vêm da plataforma SaaS por `/internal/sync-user`. Nome não mapeado
vira `CONSULTA`: ninguém ganha poder de encaminhar por erro de cadastro.

## Telas

- **Minha caixa** (`/`) — o que está na sua mão agora, e os atrasados.
- **Meu setor** (`/meu-setor`) — a fila do departamento, com "assumir".
- **Pedidos** (`/pedidos`) — todos, com busca global e filtros, em quatro
  visões (Lista, Quadro, Calendário, Tabela).
- **Pedido** (`/pedidos/{id}`) — o vai e vem: encaminhamentos, documentos,
  medições, comentários e histórico. É a tela do módulo.
- **Relatório** (`/pedidos/{id}/relatorio`) — a página de imprimir/arquivar.
- **Acompanhamento** (`/acompanhamento`) — a tela do Prefeito.

## Rodar

```bash
# API
cd api
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --port 8106

# Web
cd web-admin
npm install
NEXT_PUBLIC_API_URL=http://localhost:8106 npm run dev
```

Testes (precisa de um Postgres; veja `tests/conftest.py`):

```bash
cd api && pytest
```

Detalhes de operação, deploy e migração em [docs/OPERACAO.md](docs/OPERACAO.md).
