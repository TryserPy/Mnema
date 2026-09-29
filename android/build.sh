#!/usr/bin/env bash
# Сборка APK Мнемы без Android Studio: aapt2 + javac + dx + zipalign + apksigner.
# Запуск из корня проекта после `npm run build` (нужна папка dist):  bash android/build.sh
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
VERSION="$(node -p "require('$ROOT/package.json').version")"
IFS=. read -r MA MI PA <<<"$VERSION"
CODE=$((MA * 10000 + MI * 100 + PA))
PLATFORM="${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}"
# Для javac можно дать более новый android.jar (нужны API новее 23: установка обновлений, значки).
JAVAC_JAR="${ANDROID_JAVAC_JAR:-$PLATFORM}"
KS="${ANDROID_KEYSTORE:-mnema-release.jks}"
KS_PASS="${ANDROID_KEYSTORE_PASSWORD:-mnema-release}"
OUT=build
rm -rf "$OUT"
mkdir -p "$OUT"/{compiled,gen,classes,assets/www/ocr}

echo "▸ Файлы приложения"
cp -r "$ROOT/dist/." "$OUT/assets/www/"
cp "$ROOT/node_modules/tesseract.js/dist/worker.min.js" "$OUT/assets/www/ocr/"
for v in lstm simd-lstm relaxedsimd-lstm; do
  cp "$ROOT/node_modules/tesseract.js-core/tesseract-core-$v.wasm.js" "$OUT/assets/www/ocr/"
done
cp "$ROOT"/ocr-data/*.traineddata.gz "$OUT/assets/www/ocr/"

echo "▸ Ресурсы (aapt2)"
aapt2 compile --dir res -o "$OUT/compiled/res.zip"
aapt2 link -o "$OUT/unsigned.apk" -I "$PLATFORM" \
  --manifest AndroidManifest.xml \
  --min-sdk-version 24 --target-sdk-version 34 \
  --version-code "$CODE" --version-name "$VERSION" \
  -A "$OUT/assets" --java "$OUT/gen" --auto-add-overlay \
  "$OUT/compiled/res.zip"

echo "▸ Java"
if [ "$JAVAC_JAR" = "$PLATFORM" ]; then JAVAC_CP="-bootclasspath $JAVAC_JAR -classpath $JAVAC_JAR"; else JAVAC_CP="-classpath $JAVAC_JAR"; fi
javac -nowarn -encoding UTF-8 -source 8 -target 8 $JAVAC_CP \
  -d "$OUT/classes" $(find src "$OUT/gen" -name '*.java') 2>&1 | grep -v 'bootstrap classpath\|source value 8\|target value 8\|To suppress warnings\|^warning: \[options\]\|^[0-9] warnings\?$' || true
test -f "$OUT/classes/app/mnema/study/MainActivity.class"

echo "▸ DEX"
if command -v d8 >/dev/null; then
  d8 --release --min-api 24 --lib "$PLATFORM" --output "$OUT" $(find "$OUT/classes" -name '*.class')
else
  dalvik-exchange --dex --min-sdk-version=24 --output="$OUT/classes.dex" "$OUT/classes"
fi
(cd "$OUT" && zip -q -j unsigned.apk classes.dex)

echo "▸ Выравнивание и подпись"
zipalign -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
if [ ! -f "$KS" ] && [ -n "${CI:-}" ]; then
  # На сборочном сервере новый ключ создавать нельзя: APK с другим ключом не встанет поверх старой Мнемы.
  echo "✗ Нет ключа подписи ($KS). Добавь секрет ANDROID_KEYSTORE_B64 в настройках репозитория." >&2
  exit 1
fi
if [ ! -f "$KS" ]; then
  # Ключ подписи. Его нужно хранить: обновления APK должны быть подписаны тем же ключом.
  keytool -genkeypair -keystore "$KS" -storepass "$KS_PASS" -keypass "$KS_PASS" -alias mnema \
    -keyalg RSA -keysize 3072 -validity 12000 -dname "CN=Mnema, O=Mnema" -noprompt >/dev/null
fi
apksigner sign --ks "$KS" --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" --ks-key-alias mnema \
  --v1-signing-enabled true --v2-signing-enabled true --out "$OUT/Mnema-$VERSION.apk" "$OUT/aligned.apk"
apksigner verify "$OUT/Mnema-$VERSION.apk"
echo "✓ $(pwd)/$OUT/Mnema-$VERSION.apk ($(du -h "$OUT/Mnema-$VERSION.apk" | cut -f1))"
