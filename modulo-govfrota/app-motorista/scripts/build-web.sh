#!/usr/bin/env bash
# Gera as telas do motorista como site estático (www/) para o Capacitor.
#
# Não há cópia do código: as telas são as mesmas de web-admin/src/app/motorista.
# Copiamos o web-admin para .web-build/, retiramos o que não é do motorista
# (painel, portal do posto) e exportamos com `output: "export"`.
set -euo pipefail
cd "$(dirname "$0")/.."
APP_DIR="$PWD"
WEB="$APP_DIR/../web-admin"
OUT="$APP_DIR/.web-build"
API_ORIGIN="${API_ORIGIN:-https://frota.govsistem.com.br}"

rm -rf "$OUT" "$APP_DIR/www"
mkdir -p "$OUT"
cp -r "$WEB/src" "$WEB/public" "$WEB"/tsconfig.json "$WEB"/tailwind.config.* "$WEB"/postcss.config.* "$OUT/"
ln -s "$WEB/node_modules" "$OUT/node_modules"

# Só as telas do motorista.
rm -rf "$OUT/src/app/(admin)" "$OUT/src/app/login" "$OUT/src/app/posto"
# Os arquivos já estão dentro do APK: o service worker do PWA só atrapalharia.
rm -f "$OUT/public/sw.js"

# Despachante. O servidor interno do Capacitor só entrega o arquivo pedido
# quando o endereço tem extensão; "/motorista/" (ou um recarregar da página)
# recebe sempre ESTE index.html da raiz. Daqui carregamos o index.html do
# caminho pedido — com extensão, o Capacitor entrega o arquivo certo.
# (Antes era location.replace("/motorista/"): voltava para cá → tela branca.)
cat > "$OUT/src/app/page.tsx" <<'TSX'
"use client";
import { useEffect } from "react";
export default function Inicio() {
  useEffect(() => {
    const caminho = window.location.pathname.replace(/\/+$/, "");
    const destino = caminho && caminho !== "/index.html" ? caminho : "/motorista";
    window.location.replace(`${destino}/index.html${window.location.search}`);
  }, []);
  return null;
}
TSX

cat > "$OUT/next.config.js" <<'JS'
module.exports = { output: "export", trailingSlash: true, images: { unoptimized: true } };
JS

cd "$OUT"
NEXT_PUBLIC_API_ORIGIN="$API_ORIGIN" NEXT_TELEMETRY_DISABLED=1 "$WEB/node_modules/.bin/next" build
mv "$OUT/out" "$APP_DIR/www"
echo "Telas geradas em www/ (API: $API_ORIGIN)"
