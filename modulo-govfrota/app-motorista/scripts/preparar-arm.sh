#!/usr/bin/env bash
# Prepara um servidor ARM (aarch64) para compilar o APK. Rodar uma vez.
# - Android SDK em ~/android-sdk
# - qemu-user (binfmt) para executar o aapt2 oficial, que só existe em x86-64
#   (reverter: docker run --privileged --rm tonistiigi/binfmt --uninstall qemu-x86_64)
# - bibliotecas x86 (debian) em ~/android-sdk/x86-root para o aapt2
set -euo pipefail
SDK=~/android-sdk
if [ ! -x $SDK/cmdline-tools/latest/bin/sdkmanager ]; then
  mkdir -p $SDK/cmdline-tools && cd $SDK
  curl -sSLo ct.zip https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip
  python3 -c "import zipfile;zipfile.ZipFile('ct.zip').extractall('cmdline-tools')"
  mv cmdline-tools/cmdline-tools cmdline-tools/latest && chmod +x cmdline-tools/latest/bin/* && rm ct.zip
  yes | cmdline-tools/latest/bin/sdkmanager --licenses >/dev/null || true
  cmdline-tools/latest/bin/sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"
fi
[ "$(uname -m)" = "aarch64" ] || exit 0

ls /proc/sys/fs/binfmt_misc/ | grep -q qemu-x86_64 || docker run --privileged --rm tonistiigi/binfmt --install amd64

R=$SDK/x86-root
if [ ! -e $R/usr/lib/x86_64-linux-gnu/libc.so.6 ]; then
  mkdir -p $R
  cid=$(docker create --platform linux/amd64 debian:bookworm-slim)
  docker export "$cid" | tar -x -C $R --exclude='dev/*' || true
  docker rm "$cid" >/dev/null
  # O link original é absoluto e escaparia da pasta.
  ln -sfn ../lib/x86_64-linux-gnu/ld-linux-x86-64.so.2 $R/usr/lib64/ld-linux-x86-64.so.2
fi

# aapt2 sai do cache do Gradle (o primeiro build baixa e falha; rode este script de novo).
A=$(ls ~/.gradle/caches/modules-2/files-2.1/com.android.tools.build/aapt2/*/*/aapt2-*-linux.jar 2>/dev/null | head -1 || true)
[ -n "$A" ] || { echo "Rode scripts/build-apk.sh uma vez (vai falhar no aapt2) e repita este script."; exit 1; }
mkdir -p $SDK/aapt2-x86/wrapper
python3 -c "import zipfile,sys;zipfile.ZipFile(sys.argv[1]).extract('aapt2',sys.argv[2])" "$A" $SDK/aapt2-x86
chmod +x $SDK/aapt2-x86/aapt2
cat > $SDK/aapt2-x86/wrapper/aapt2 <<W
#!/bin/sh
# aapt2 oficial (x86-64) rodando via qemu-user no servidor ARM.
QEMU_LD_PREFIX=$R exec $SDK/aapt2-x86/aapt2 "\$@"
W
chmod +x $SDK/aapt2-x86/wrapper/aapt2
$SDK/aapt2-x86/wrapper/aapt2 version
