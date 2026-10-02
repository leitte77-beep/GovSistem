# GovFrota Motorista — app Android

APK instalável (sem Google Play) com as **mesmas telas** de
`web-admin/src/app/motorista`, empacotadas no aparelho com Capacitor 7.
As telas abrem sem internet; a API é `https://frota.govsistem.com.br`.

## Gerar o APK

```bash
npm install
npm run apk        # build estático das telas + cap sync + gradle assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```

Outra API: `API_ORIGIN=https://... npm run apk`.

Servidor ARM (o nosso): rodar `scripts/preparar-arm.sh` uma vez antes.

## Assinatura — NÃO PERDER

A keystore fica fora do repositório:
`~/keystores/govfrota-motorista.keystore` + `.properties` (senha).
Sem ela, celulares não aceitam instalar atualizações por cima — seria preciso
desinstalar e perder a fila offline. Guarde uma cópia em local seguro.
SHA-256 do certificado: `e5bfeeb1fc09b7b167abc1820676c7cf5b91af329b7a741754ed9a580c6272ba`.

## Produção

A API precisa aceitar a origem do app no CORS: incluir `https://localhost`
em `CORS_ORIGINS` do GovFrota.

## Atualizar versão

Subir `versionCode` (e `versionName`) em `android/app/build.gradle` a cada APK
distribuído; o Android recusa instalar versão com código menor ou igual.
