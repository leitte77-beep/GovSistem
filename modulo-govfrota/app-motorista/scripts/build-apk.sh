#!/usr/bin/env bash
# Compila o APK assinado (android/app/build/outputs/apk/release/).
set -euo pipefail
cd "$(dirname "$0")/../android"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
GRADLE_ARGS=()
# Servidor ARM: o aapt2 do Google só existe para x86-64; usamos o oficial via
# qemu (ver scripts/preparar-arm.sh). Em máquina x86 nada disso é necessário.
if [ "$(uname -m)" = "aarch64" ]; then
  GRADLE_ARGS+=("-Pandroid.aapt2FromMavenOverride=$HOME/android-sdk/aapt2-x86/wrapper/aapt2")
fi
./gradlew --no-daemon assembleRelease "${GRADLE_ARGS[@]}"
ls -lh app/build/outputs/apk/release/*.apk
