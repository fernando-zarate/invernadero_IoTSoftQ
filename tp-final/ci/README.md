# Primera barrera del release

Estado remoto: **PENDIENTE**. [Final quality gate](../../.github/workflows/final-quality.yml)
agrega lint sin `--fix`, cero warnings, tests, build y Horusec bloqueante. El
[workflow anterior](../../.github/workflows/MainActions.yml) se conserva; por sí solo no certifica lint/SAST.
No se ocultan hallazgos preexistentes para obtener verde. El script de lint del backend
modifica archivos: este gate invoca ESLint directamente, sin `--fix`.

Verificación local: los warnings conocidos y fixtures inválidos se corrigieron sin
relajar reglas ni excluir pruebas. Lint sin warnings, tests, typecheck y build se
validan por separado; no convierten el SAST o CI remoto en aprobados. Las pruebas
loopback del harness tampoco prueban rendimiento ni capacidad del clúster.

Horusec v2.8.0 linux/amd64 se descarga de su [release oficial](https://github.com/ZupIT/horusec/releases/tag/v2.8.0).
El SHA-256 fijado en el workflow se verificó contra el
[checksums.txt oficial](https://github.com/ZupIT/horusec/releases/download/v2.8.0/checksums.txt).
No se ejecuta un `curl | bash`. Política: LOW, MEDIUM, HIGH, CRITICAL y severidades
desconocidas bloquean; INFO no bloquea. Fallos o análisis incompletos bloquean.
Las imágenes de analizadores auxiliares de Horusec no están fijadas por digest: registrar
su inventario si se exige reproducibilidad de toda la cadena, no solo del CLI.

## Reproducir antes de enviar

Desde la raíz, Bash, Node 22:

```bash
npm --prefix frontend/dashboard ci --legacy-peer-deps
npm --prefix frontend/dashboard run lint -- --max-warnings=0
npm --prefix frontend/dashboard test -- --runInBand
npm --prefix frontend/dashboard run build
(cd frontend/dashboard && npx --no-install tsc --noEmit --incremental false)
npm --prefix backend/nestjs ci
(cd backend/nestjs && npx --no-install eslint '{src,apps,libs,test}/**/*.ts' --max-warnings=0)
npm --prefix backend/nestjs test -- --runInBand
npm --prefix backend/nestjs run build
(cd backend/nestjs && npx --no-install tsc --noEmit --incremental false)
mkdir -p tp-final/.local
curl --fail --location --retry 3 https://github.com/ZupIT/horusec/releases/download/v2.8.0/horusec_linux_amd64 -o tp-final/.local/horusec
echo '93c001a0b1efea27c74bfc3e9b57d4bc55ec2d7ffc9015674a19844d8677d9c8  tp-final/.local/horusec' | sha256sum --check --strict
chmod +x tp-final/.local/horusec
tp-final/.local/horusec start -p "$PWD" --config-file-path tp-final/ci/horusec-config.json -e=true -o=json -O=tp-final/.local/horusec.json -l=tp-final/.local/horusec-private.log > tp-final/.local/horusec-console-private.log 2>&1
python3 tp-final/ci/horusec-gate.py tp-final/.local/horusec.json
```

No publicar el JSON/log crudo: puede contener secretos. Mostrar solo cantidades,
categorías, reglas y tratamiento redactado. Revocar/rotar credenciales reales encontradas,
retirarlas del código, investigar historia y volver a ejecutar. Un scan viejo, de un árbol
sucio o con `returnErrorIfFoundVulnerability=false` no aprueba esta barrera.

## Vincular imagen y código aprobado (camino recomendado)

Después de la revisión humana y del push del commit (no automatizados aquí), descargar
el artefacto del job `images` de una ejecución **exitosa**, no reconstruir otro árbol.
En un PR, GitHub prueba un commit de merge: comprobar `source-sha.txt`, no asumir que
coincide con el último commit de la rama. Para entrega preferir push/workflow_dispatch.

```bash
gh run list --workflow final-quality.yml --limit 10
export CI_RUN_ID=REEMPLAZAR_POR_ID_REAL
gh run view "$CI_RUN_ID" --json conclusion,headSha,url
test "$(gh run view "$CI_RUN_ID" --json conclusion --jq .conclusion)" = success
mkdir -p "tp-final/.local/ci-$CI_RUN_ID"
gh run download "$CI_RUN_ID" --dir "tp-final/.local/ci-$CI_RUN_ID"
find "tp-final/.local/ci-$CI_RUN_ID" -name source-sha.txt -print -exec cat {} \;
# ARTIFACT debe apuntar al directorio que contiene source-sha.txt e images.tar.gz.
export ARTIFACT="$PWD/tp-final/.local/ci-$CI_RUN_ID/final-images-$(git rev-parse HEAD)"
test "$(cat "$ARTIFACT/source-sha.txt")" = "$(git rev-parse HEAD)"
test -z "$(git status --porcelain --untracked-files=no)"
# La lista de checksums lleva el prefijo image-artifacts/ del runner.
(cd "$ARTIFACT" && sed 's@image-artifacts/@@' SHA256SUMS | sha256sum --check --strict)
docker load --input "$ARTIFACT/images.tar.gz"
docker image inspect terrasense-frontend:1.0.0 terrasense-frontend:1.1.0 terrasense-backend:1.0.0
```

Comparar IDs y labels con `images.json`. Guardar URL de CI, SHA, checksum e IDs en la
bitácora. Mantener `ARTIFACT` exportado al ejecutar `scripts/setup.sh`: reutiliza ese tar,
comprueba SHA/checksum/IDs y no reconstruye las imágenes aprobadas.
El tar son artefactos locales (retención 7 días), no una publicación en registry
ni una attestation firmada. Descargar a tiempo y respaldar. Bloqueos de lint/SAST deben
resolverse con revisión antes de obtener imágenes aprobadas; no declarar CI verde mientras tanto.
