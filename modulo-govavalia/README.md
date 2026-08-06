# govavalia — Pesquisa de satisfação + Ouvidoria (Saúde)

Módulo para o seu sistema (Express + PostgreSQL) com duas portas de entrada:

| Onde | Endereço | Quem usa | Login |
|------|----------|----------|-------|
| Tela pública (tablets) | `www.govsistem.com.br/avalia` | cidadãos | não |
| Painel da equipe | `avalia.govsistem.com.br` | servidores | sim (reaproveita o login do seu sistema) |

A tela pública foi desenhada para **idosos e pessoas com pouca familiaridade digital**:
carinhas grandes, leitura em voz alta (botão *Ouvir*), textos grandes, botões de toque
generosos, uma pergunta por tela e retorno automático à tela inicial (modo totem).

## Postura legal (já embutida)

- **Pesquisa anônima** — não pede nome nem CPF. Não é dado pessoal (minimização, LGPD).
- **Ouvidoria** conforme a **Lei 13.460/2017**: tipos de manifestação, opção anônima ou
  identificada, e **número de protocolo** para acompanhamento.
- A mensagem da ouvidoria pode conter **dado sensível de saúde** → acesso restrito por
  perfil, **trilha de auditoria** imutável em toda leitura/exportação, e **retenção** do
  contato com anonimização automática após o prazo.
- Erros no padrão **RFC 9457** (Problem Details). Base legal registrada em `src/config.js`.

## Estrutura

```
govavalia/
├─ db/migrations/001_init.sql     schema (schema "govavalia")
├─ openapi.yaml                   contrato da API
├─ scripts/migrate.js             roda as migrations
├─ src/
│  ├─ config.js                   variáveis de ambiente
│  ├─ db.js                       pool PostgreSQL
│  ├─ auth.js                     liga ao SEU login (RBAC)
│  ├─ audit.js                    trilha de auditoria
│  ├─ problem.js                  erros RFC 9457
│  ├─ app.js                      routers + segurança
│  ├─ index.js                    servidor standalone (dev)
│  ├─ routes/{publico,admin}.js
│  ├─ repositories/…              acesso a dados
│  └─ services/{protocolo,retencao,csv}.js
└─ web/
   ├─ avalia/index.html           tela dos tablets
   └─ admin/index.html            painel da equipe
```

## Instalação

```bash
npm install
cp .env.example .env          # edite DATABASE_URL e os perfis
npm run migrate               # cria o schema e as perguntas iniciais
```

## Integrar ao seu sistema Express (recomendado)

```js
const {
  criarRouterPublico, criarRouterAdmin
} = require('./govavalia/src/app');

// 1) Tela pública -> www.govsistem.com.br/avalia
app.use('/avalia', criarRouterPublico());

// 2) Painel -> subdomínio avalia.govsistem.com.br
//    Coloque o SEU middleware de login ANTES, para preencher req.user.
const vhost = require('vhost'); // ou um if (req.hostname === ...)
app.use(vhost('avalia.govsistem.com.br',
  express.Router()
    .use(seuMiddlewareDeLogin)   // <- preenche req.user = { id, nome, perfis: [...] }
    .use(criarRouterAdmin())
));
```

O `auth.js` espera `req.user = { id, nome, perfis: ['ouvidoria', ...] }`. Se no seu
sistema os papéis têm outro nome (`roles`, `permissoes`), ele já tenta esses campos;
ajuste `papeisDe()` se necessário. Defina os nomes reais dos perfis no `.env`
(`GOVAVALIA_ROLE_OUVIDORIA`, `GOVAVALIA_ROLE_GESTOR`).

> **Acesso:** o resumo da pesquisa exige perfil *gestor* **ou** *ouvidoria*; as
> manifestações (dado sensível) exigem perfil *ouvidoria*.

## Rodar isolado (para testar)

```bash
GOVAVALIA_DEV_FAKE_USER=true npm start
# público: http://localhost:4000/avalia
# admin:   aponte avalia.govsistem.com.br para localhost (hosts/proxy)
```

`GOVAVALIA_DEV_FAKE_USER=true` injeta um usuário de teste. **Remova em produção.**

## Nginx (exemplo das duas portas)

```nginx
server { server_name www.govsistem.com.br;
  location /avalia { proxy_pass http://127.0.0.1:4000; proxy_set_header Host $host; } }
server { server_name avalia.govsistem.com.br;
  location / { proxy_pass http://127.0.0.1:4000; proxy_set_header Host $host; } }
```

## Retenção (LGPD)

Agende `anonimizarContatosExpirados()` para rodar 1x ao dia (cron, ou o `setInterval`
já presente no `index.js`). Após `GOVAVALIA_RETENCAO_CONTATO_DIAS`, o contato é apagado
e a manifestação fica anônima.

## Editar as perguntas

Pela aba **Perguntas** do painel (sem mexer em código). As perguntas iniciais vêm na
migration `001_init.sql`.

## O que ficou propositalmente simples

Sem fila de mensagens, sem microsserviços — um módulo de monólito é o melhor ponto de
partida para um município (mais fácil de auditar e manter). Quando a demanda crescer ou
surgir necessidade de e-mail automático ao cidadão, integração com o e-Ouv/Fala.BR ou
relatórios públicos (dados abertos anonimizados), dá para evoluir a partir daqui.
