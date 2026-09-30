# Migração do DNS para a Cloudflare (proteção DDoS)

Objetivo: colocar a Cloudflare na frente de `govsistem.com.br` para absorver ataques
DDoS, sem quebrar e-mail, certificados, WebSocket (ChatGov) e SSE (GovTask).

Levantamento feito em 29/09/2026:

- Nameservers atuais: `solar.dns-parking.com` / `lunar.dns-parking.com` (DNS da **Hostinger**).
- E-mail: **Hostinger** (MX `mx1/mx2.hostinger.com`, SPF, DKIM, DMARC).
- Tudo aponta para o IP de origem **137.131.238.177**, inclusive um **curinga**
  `*.govsistem.com.br` (usado pelos subdomínios de cidade do Diário).
- Certificados Let's Encrypt emitidos via `webroot` (desafio HTTP-01, porta 80).
- DNSSEC: **desligado** (sem registro DS). Não é preciso fazer nada nesse ponto.

As etapas estão divididas entre **você** (painel da Cloudflare/Hostinger) e **nós**
(servidor). Siga na ordem: a etapa 6 **não** pode vir antes da etapa 5.

---

## Etapa 1: adicionar o domínio (você)

1. No painel da Cloudflare: **Add a domain** → `govsistem.com.br`.
2. Opção **Quick scan for DNS records** (importa os registros atuais).
3. Plano **Free**.
4. **Ainda não troque os nameservers.** Anote os dois nameservers que a Cloudflare
   mostrar (algo como `xxx.ns.cloudflare.com`). Eles serão usados na etapa 6.

## Etapa 2: conferir os registros DNS (você)

Em **DNS → Records**, a zona deve ficar exatamente assim. A importação costuma
**esquecer o curinga `*`**; se faltar, crie-o à mão.

| Tipo  | Nome                          | Conteúdo                                   | Proxy                  |
|-------|-------------------------------|--------------------------------------------|------------------------|
| A     | `govsistem.com.br` (`@`)      | `137.131.238.177`                          | 🟠 **Proxied**          |
| A     | `*`                           | `137.131.238.177`                          | 🟠 **Proxied**          |
| CNAME | `www`                         | `govsistem.com.br`                         | 🟠 **Proxied**          |
| MX    | `@`                           | `mx1.hostinger.com` (prioridade 5)         | (não se aplica)        |
| MX    | `@`                           | `mx2.hostinger.com` (prioridade 10)        | (não se aplica)        |
| TXT   | `@`                           | `v=spf1 include:_spf.mail.hostinger.com ~all` | (não se aplica)     |
| TXT   | `_dmarc`                      | `v=DMARC1; p=none`                         | (não se aplica)        |
| CNAME | `hostingermail-a._domainkey`  | `hostingermail-a.dkim.mail.hostinger.com`  | ⚪ **DNS only**         |
| CNAME | `hostingermail-b._domainkey`  | `hostingermail-b.dkim.mail.hostinger.com`  | ⚪ **DNS only**         |
| CNAME | `hostingermail-c._domainkey`  | `hostingermail-c.dkim.mail.hostinger.com`  | ⚪ **DNS only**         |
| CNAME | `autodiscover`                | `autodiscover.mail.hostinger.com`          | ⚪ **DNS only**         |
| CNAME | `autoconfig`                  | `autoconfig.mail.hostinger.com`            | ⚪ **DNS only**         |

Regras que valem para qualquer registro extra que aparecer:

- **Nenhum registro "DNS only" (nuvem cinza) pode apontar para `137.131.238.177`.**
  Um único registro cinza para o nosso IP entrega a origem ao atacante e anula a
  proteção. Se a importação criar `mail`, `webmail`, `smtp`, `ftp` etc. apontando para
  o nosso IP, **apague-os**: hoje eles só existem por causa do curinga e não são
  serviços reais.
- Os subdomínios dos sistemas (`api`, `admin`, `app`, `auth`, `chatgov`, `govtask`,
  `frota`, `farol`, `diario`, `doe-admin`, `govpro`, `proc`) e os de cidade já são
  cobertos pelo curinga. Se a importação os criar explicitamente, deixe-os
  **Proxied** (laranja).
- Registros de e-mail (MX, TXT, DKIM) continuam apontando para a Hostinger e ficam
  cinza. O e-mail **não passa** pela Cloudflare.

## Etapa 3: SSL/TLS (você)

1. **SSL/TLS → Overview → Configure** → modo **Full (strict)**.
   - ⚠️ **Nunca** use *Flexible*: o nginx redireciona HTTP→HTTPS e isso vira um loop
     infinito de redirecionamento.
   - Faça isso **antes** da etapa 6.
2. **SSL/TLS → Edge Certificates**:
   - **Always Use HTTPS**: ligado.
   - **Minimum TLS Version**: TLS 1.2.
   - **HSTS**: **deixe desligado aqui**. O nginx já envia o cabeçalho, e ativar nos
     dois lugares só complica uma eventual reversão.
   - **Automatic HTTPS Rewrites**: ligado.
3. O certificado Universal da Cloudflare cobre `govsistem.com.br` e
   `*.govsistem.com.br`, o que basta para todos os nossos subdomínios (todos são de
   1º nível).

## Etapa 4: velocidade, rede e segurança (você)

**Network**
- **WebSockets**: ligado (o ChatGov depende disso).
- **HTTP/3 (QUIC)**: pode ficar ligado.

**Speed → Optimization**
- **Rocket Loader**: **desligado**. Ele quebra aplicações Next.js/React.

**Caching → Configuration**
- Deixe o padrão (**Standard**). **Não** crie regra "Cache Everything": as APIs e
  páginas logadas não podem ser cacheadas.

**Security → Settings**
- **Security Level**: Medium.
- **Bot Fight Mode**: **desligado por enquanto**. No plano Free não há como abrir
  exceções, e ele pode bloquear integrações legítimas que chamam a API (ex.: a futura
  integração com a Elotech). A proteção DDoS da Cloudflare funciona independentemente
  dele.
- **Under Attack Mode**: saiba onde fica (**Overview**, lado direito), mas **não
  ative** no dia a dia. Ele só serve para usar durante um ataque, porque coloca um
  desafio JavaScript na frente de todo mundo e quebra chamadas de API feitas por
  sistemas.

**Security → WAF → Rate limiting rules** (o plano Free permite 1 regra)
- Nome: `login`
- Condição: *URI Path* `equals` `/api/v1/auth/login` **e** *Hostname* `equals`
  `api.govsistem.com.br`
- Limite: **10 requisições por 10 segundos**, por IP
- Ação: **Block** por 10 segundos

## Etapa 5: preparar o servidor (nós, antes da troca)

Avise quando as etapas 1 a 4 estiverem prontas. Antes de você trocar os nameservers,
eu faço o seguinte no servidor:

1. **Configurar o nginx para enxergar o IP real do visitante** (`set_real_ip_from`
   com as faixas da Cloudflare + `real_ip_header CF-Connecting-IP`). Isso é
   **obrigatório antes da troca**: sem essa configuração, o nginx enxerga o IP da
   Cloudflare no lugar do IP do cidadão. Aí o limite de login (10/min por IP) passa a
   ser dividido entre milhares de usuários e o login começa a devolver 429 para todo
   mundo. Aplicar agora é inofensivo, porque a regra só age em requisições vindas da
   Cloudflare.
2. **Ajustar timeouts incompatíveis com a Cloudflare.** O plano Free corta
   requisições que ficam **100 s** sem resposta (erro 524). O Farol está com
   `proxy_read_timeout 300s`, e é preciso ver se alguma operação dele realmente passa
   de 100 s.
   - SSE do GovTask: já envia `ping` a cada 20 s, então está OK.
   - WebSocket do ChatGov: OK. As conexões podem ser reiniciadas pela Cloudflare de
     vez em quando, e o cliente reconecta sozinho.
   - Uploads: a Cloudflare Free aceita até **100 MB**, e o nosso maior limite é
     64 MB, então está OK.
3. **Definir o que fazer com o sistema de Preço** (portas 7000, 7001, 7002 e 5177
   expostas direto no IP). A Cloudflare não faz proxy dessas portas, então elas
   continuariam acessíveis direto na origem. Precisamos colocá-las atrás do nginx
   (porta 443, com subdomínio próprio) antes de fechar o firewall na etapa 8.

## Etapa 6: trocar os nameservers (você)

1. No painel onde o domínio foi comprado (pelos nameservers atuais, é a **Hostinger**:
   *Domínios → govsistem.com.br → DNS/Nameservers*; se tiver sido comprado direto no
   **registro.br**, a troca é feita lá):
   - Troque `solar.dns-parking.com` / `lunar.dns-parking.com` pelos dois
     nameservers da Cloudflare anotados na etapa 1.
2. De preferência, faça a troca **fora do horário de expediente das prefeituras**. A
   propagação de `.com.br` costuma levar de minutos a poucas horas, com máximo de 24 h.
3. A Cloudflare envia um e-mail quando o domínio fica **Active**.

## Etapa 7: verificar (você + nós)

Depois de ficar Active:

```bash
dig +short NS govsistem.com.br          # deve mostrar os NS da Cloudflare
dig +short govsistem.com.br             # deve mostrar IPs da Cloudflare, NÃO 137.131.238.177
curl -sI https://govtask.govsistem.com.br | grep -iE "server|cf-ray"   # server: cloudflare
```

Checklist funcional:
- [ ] Landing, portal do órgão, login e troca de módulo (SSO)
- [ ] Diário: admin + um subdomínio de cidade + download de PDF
- [ ] ChatGov: painel conecta, mensagens chegam em tempo real, envio de arquivo
- [ ] GovTask: painel atualiza sozinho (SSE)
- [ ] Frota, Farol, GovPro, Protocolo abrem normalmente
- [ ] **E-mail**: enviar e receber um e-mail em uma caixa `@govsistem.com.br`
- [ ] Nos logs do nginx aparecem IPs reais dos visitantes, e não os da Cloudflare

## Etapa 8: fechar a origem (nós)

Com tudo funcionando, **só a Cloudflare pode falar com o servidor nas portas
80/443**. Sem este passo, o atacante ignora a Cloudflare e ataca direto o IP
`137.131.238.177`, que já é público e fica guardado em históricos de DNS.

1. Restringir 80/443 às faixas de IP da Cloudflare no iptables (`DOCKER-USER` e
   `INPUT`) e na **Security List da Oracle Cloud**. O `infra/harden-firewall.sh`
   citado na auditoria de agosto **não está mais no disco**: as regras continuam
   ativas no kernel, mas o script precisa ser recriado.
2. Confirmar que a renovação dos certificados Let's Encrypt continua funcionando
   (`certbot renew --dry-run`). O desafio HTTP-01 passa pela Cloudflare, então deve
   continuar funcionando.
3. (Opcional, mais forte) Trocar o IP público reservado da VM na Oracle, para que
   o IP antigo, que já vazou, deixe de levar ao servidor.

## Como reverter

Se algo grave quebrar depois da troca:

- **Rápido (segundos):** em *DNS → Records*, clique na nuvem laranja do registro
  afetado para deixá-la cinza (DNS only). O tráfego volta a ir direto para o
  servidor, sem a proteção.
- **Completo:** volte os nameservers para `solar.dns-parking.com` /
  `lunar.dns-parking.com` no painel do domínio. A zona antiga continua existindo na
  Hostinger enquanto ninguém apagá-la. **Não apague a zona DNS da Hostinger** até a
  migração estar estável.
- Se a etapa 8 já tiver sido feita, reabra 80/443 para qualquer IP **antes** de
  reverter o DNS, ou o site fica fora do ar.
