# ChatGov — desenvolvimento isolado

Este ambiente roda somente o ChatGov e não compartilha containers, rede,
banco, uploads, imagens ou sessões de WhatsApp com a produção.

## Isolamento

| Recurso | Desenvolvimento | Produção |
|---|---|---|
| Projeto Compose | `chatgov-dev` | `modulo-chatgov` |
| Backend | `127.0.0.1:13050` | `0.0.0.0:3050` |
| Frontend | `127.0.0.1:13051` | `0.0.0.0:3051` |
| Banco/uploads | volumes `chatgov-dev_*` | volumes `modulo-chatgov_*` |
| Rede | exclusiva do projeto dev | rede de produção |
| WhatsApp | banco vazio, sem credenciais/sessões reais | sessões reais |

As portas de desenvolvimento aceitam conexão somente no próprio servidor.
Para abrir o frontend em outra máquina, use um túnel SSH:

```bash
ssh -L 13051:127.0.0.1:13051 -L 13050:127.0.0.1:13050 usuario@servidor
```

Depois acesse `http://127.0.0.1:13051`.

## Uso diário

```bash
cd /home/ubuntu/sistemaweb/modulo-chatgov

./scripts/dev.sh up
./scripts/dev.sh ps
./scripts/dev.sh logs backend
./scripts/dev.sh stop
```

Backend e frontend têm recarga automática. Alterações em `backend/src` e
`frontend/src` são percebidas sem reconstruir as imagens.

Na tela inicial, use o mesmo e-mail e senha do GovSistem. O ambiente valida a
identidade no SaaS, mas cria tenant, operador e sessão somente no banco dev.
Ele não chama o fluxo de abertura do módulo em produção.

Para apagar e recriar exclusivamente os dados de desenvolvimento:

```bash
./scripts/dev.sh reset-data
./scripts/dev.sh up
```

## Validação antes de homologar

```bash
cd backend
npm test
npm run test:integration:dev
npm run test:load:dev

cd ../frontend
npm run build
npm run test:e2e
```

O teste de carga contém uma trava e aceita somente `127.0.0.1` ou `localhost`.
Na aba **Configurações → Governança**, o botão **Gerar massa sintética DEV**
cria horário, canal simulado, SLA e roteamento sem copiar qualquer dado pessoal
da produção. O painel também informa quais integrações externas ainda precisam
de credencial real.

## Fluxo até produção

1. Desenvolva e teste no `chatgov-dev`.
2. Faça commit das mudanças e registre o commit aprovado.
3. Confira `./scripts/dev.sh ps`, a interface e os logs.
4. Execute `./scripts/promote-production.sh <commit>`.
5. O script exige checkout limpo e exatamente no commit informado, constrói
   imagens versionadas, salva um dump do banco e pede a confirmação
   `PROMOVER`.
6. Somente os containers `backend` e `frontend` do ChatGov são recriados. Se
   a verificação local falhar, as imagens anteriores são recolocadas.

O script nunca executa `docker compose down`, nunca remove volumes e não toca
nos demais módulos do sistema.
