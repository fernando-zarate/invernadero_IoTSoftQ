# TP: TerraSense con Kubernetes y k6 local

Cuatro actividades: desplegar la aplicación, habilitar HPA, medir carga y observar fallos. Se utilizan el backend NestJS y el frontend Next.js originales, sin modificar sus fuentes. **Las mediciones y capturas están pendientes de ejecución local; no hay resultados inventados.**

Requisitos: Linux, Docker activo, Minikube, kubectl, k6 con `k6/browser`, Chromium/Chrome y curl. Reserve 4 CPU y 6 GB para Minikube, además de recursos para el sistema, k6 y el navegador. Si reduce la carga por falta de recursos, indíquelo en el informe.

Abra las terminales en la **raíz de este repositorio**: todos los comandos parten de allí. k6 se ejecuta en su computadora, no en un pod. Guarde las capturas manuales directamente en `tp-k8s/`, junto a este README; no se necesitan carpetas adicionales.

Si todavía no tiene una copia del repositorio:

```bash
git clone https://github.com/fernando-zarate/invernadero_IoTSoftQ.git
cd invernadero_IoTSoftQ
```

## Actividad 1 — Clúster, aplicación e Ingress

### 1. Crear el entorno local

```bash
minikube -p terrasense start --driver=docker --cpus=4 --memory=6144
minikube -p terrasense addons enable ingress
```

**En esta terminal y en cada terminal nueva**, seleccione el contexto y el namespace antes de usar kubectl:

```bash
kubectl config use-context terrasense
kubectl config set-context --current --namespace=terrasense
```

Estos comandos cambian la selección local de kubectl de forma persistente. Use exclusivamente este perfil local, nunca un clúster compartido. Los Secrets contienen credenciales públicas descartables, solo para el TP. Un nodo y una base de datos no constituyen alta disponibilidad de producción.

```bash
kubectl -n ingress-nginx rollout status deployment/ingress-nginx-controller --timeout=180s
```

### 2. Construir y cargar las imágenes

```bash
docker build -f tp-k8s/k8s/backend.Dockerfile -t terrasense-backend:tp .
docker build -f tp-k8s/k8s/frontend.Dockerfile -t terrasense-frontend:tp .
minikube -p terrasense image load terrasense-backend:tp
minikube -p terrasense image load terrasense-frontend:tp
```

El contexto de build es la raíz. Los Dockerfiles solo empaquetan las aplicaciones: el backend incluye `openapi.json` y ejecuta `dist/src/main.js`; el frontend usa la salida standalone. `NEXT_PUBLIC_API_URL` queda fijada al construir, por defecto `http://api.terrasense.local`; cambiarla requiere reconstruir con `--build-arg NEXT_PUBLIC_API_URL=...`. El navegador no puede usar el DNS interno `backend:3000`.

### 3. Iniciar PostgreSQL y una réplica del backend

```bash
kubectl apply -f tp-k8s/k8s/00-base.yaml
kubectl apply -f tp-k8s/k8s/10-postgres.yaml
kubectl rollout status statefulset/postgres --timeout=240s
kubectl apply -f tp-k8s/k8s/30-app.yaml
kubectl rollout status deployment/backend --timeout=240s
kubectl rollout status deployment/frontend --timeout=240s
kubectl logs deployment/backend --tail=50
```

**No aplique toda la carpeta `k8s/` de una vez.** El código original utiliza TypeORM `synchronize: true` y un seeder por réplica. Primero una réplica debe crear el esquema y `ESP32-INV-01`; verifique el log y no continúe si falla. HPA se habilita en la actividad 2. Para repetir desde un entorno ya escalado, detenga las cargas, retire su HPA y vuelva a una réplica antes de preparar el esquema; no borre datos para ocultar errores. Este arranque serial no reemplaza migraciones seguras en producción.

### 4. Preparar los 2000 dispositivos y publicar la aplicación

```bash
kubectl exec -i postgres-0 -- sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < tp-k8s/k8s/fleet.sql
kubectl apply -f tp-k8s/k8s/40-ingress.yaml
kubectl get pods,svc,ingress,pvc
```

`fleet.sql` es necesario porque esta API puede responder 201 para un dispositivo desconocido sin guardar sus lecturas. El SQL transaccional e idempotente prepara **2000 dispositivos exactos** (`ESP32-INV-01` y `TP-0001`…`TP-1999`), cada uno con cuatro sensores: `temp`, `airHum`, `soilHum`, `waterLevel`. Debe mostrar 2000 dispositivos y 2000 sensores por tipo; aborta ante cantidades incompatibles. No borra métricas ni dispositivos ajenos. Puede repetir el mismo comando, sin cargas activas; no necesita Job ni ConfigMap adicional.

### 5. Resolver los nombres y verificar

```bash
minikube -p terrasense ip
sudoedit /etc/hosts
```

Agregue `IP_MOSTRADA api.terrasense.local terrasense.local`, reemplazando cualquier entrada anterior de esos hosts, sin duplicarla.

```bash
curl --fail-with-body 'http://api.terrasense.local/metrics/ESP32-INV-01/latest?sensorType=temp,airHum,soilHum,waterLevel'
```

Abra **http://terrasense.local/dashboard**. Antes del smoke puede no haber lecturas. La API no tiene `/health` ni prefijo `/api`; `/` puede devolver 404. Si la IP del nodo no es accesible, resuelva la red del driver antes de continuar. Las probes TCP comprueban conexiones, no salud funcional; readiness consulta la base pero puede aceptar datos vacíos. El smoke comprobará contenido real.

**Captura pendiente:** `tp-k8s/app.png`, con el dashboard y lecturas después del smoke de la actividad 3.

## Actividad 2 — Autoescalado con HPA

```bash
minikube -p terrasense addons enable metrics-server
kubectl -n kube-system rollout status deployment/metrics-server --timeout=180s
kubectl apply -f tp-k8s/k8s/50-hpa.yaml
kubectl scale deployment/backend --replicas=2
kubectl rollout status deployment/backend --timeout=240s
kubectl get hpa,pods
kubectl top pods
```

HPA mantiene entre **2 y 6 réplicas**, con objetivo CPU **60%** de `requests.cpu=100m` (aproximadamente 60m por pod). No garantiza escalado: depende de las métricas, las ventanas y la capacidad disponible. PostgreSQL o E/S pueden saturarse antes que la CPU.

Durante las actividades 3 y 4, use otra terminal con el contexto seleccionado para observar:

```bash
kubectl get hpa -w
```

Ctrl+C detiene la observación. Consulte también `kubectl get pods` y `kubectl top pods` durante las mesetas. **Captura pendiente:** `tp-k8s/hpa-escalado.png` cuando aumenten las réplicas; si no aumentan, use `hpa-sin-escalado.png` y describa lo observado. HPA `<unknown>` requiere revisar metrics-server y los requests, no asumir éxito.

## Actividad 3 — Smoke, carga y estrés con k6

Ejecute las pruebas **una por vez**. Espere que CPU, errores y latencia vuelvan a su línea base entre pruebas; las métricas históricas permanecen en PostgreSQL y las repeticiones no parten del mismo historial.

```bash
k6 run tp-k8s/k6/smoke.js
k6 run tp-k8s/k6/load.js
k6 run tp-k8s/k6/stress.js
```

| Script | Qué ejecuta |
|---|---|
| `smoke.js` | 1 VU: escribe y lee ambos extremos de la flota; verifica cuatro valores y fechas posteriores al POST. Revise `READBACK` antes de seguir. |
| `load.js` | 200 reportes cada 3 s durante 3 min: **66,67 reportes/s**, equivalentes al promedio de 2000 dispositivos cada 30 s. Llegadas distribuidas, no sincronizadas. |
| `stress.js` | Rampas 10 → 40 → 100 VUs, con mesetas y pausa de 1 s por reporte, durante 5 min. Modelo cerrado: no garantiza una tasa fija. |

Cada POST envía `{temp:24.5, airHum:60, soilHum:45, waterLevel:90}` y comprueba 201 con `status: success`. Umbrales: **p95 del POST `<300 ms`, errores HTTP `<1%`, checks `>99%`**; los modelos de llegada exigen cero `dropped_iterations`. Un código de salida no cero por umbrales incumplidos es una prueba fallida válida, no un aprobado. No oculte descartes ni fallos.

Variante opcional, separada y solo con recursos disponibles: `k6 run -e LOAD_MODE=synchronized tp-k8s/k6/load.js` intenta 2000 reportes juntos cada 30 s (100 VUs × batch de 20). No equivale al promedio distribuido; puede abrir unas 2000 solicitudes concurrentes y exige cero ventanas perdidas (`missed_windows`). Para reducir estrés puede usar `-e VU_SCALE=0.5`, indicando que cambió el escenario.

**Capturas pendientes:** `tp-k8s/smoke-terminal.png`, `load-terminal.png` y `stress-terminal.png`, con comando, resumen legible, tasa lograda, p95, errores, checks y descartes cuando correspondan. Incluya fecha UTC (`date -u --iso-8601=seconds`), versión de k6 y recursos del equipo en el informe. Después del smoke capture también `app.png` con las cuatro lecturas.

## Actividad 4 — Fallos y recuperación

### E1. Eliminar un pod y observar la experiencia de usuario

Mantenga HPA activo y al menos dos pods backend listos. No ejecute otras cargas. Es una eliminación normal con período de gracia, **no SIGKILL**; con varias réplicas puede no haber interrupción.

**Terminal A**, en la raíz del repositorio:

```bash
export K6_BROWSER_EXECUTABLE_PATH=$(command -v chromium || command -v chromium-browser || command -v google-chrome)
k6 run tp-k8s/k6/e1.js
```

Si no encuentra Chromium compatible o falla el baseline, no borre pods: corrija la preparación y repita. No se desactiva el sandbox. El navegador valida el documento, los cuatro canales recibidos y los valores renderizados; el encabezado solo no basta. Después guarda `tp-k8s/ux-antes.png` y muestra **`BROWSER_READY`**. Los checks del navegador exigen **100%** por separado: un fallo UX no puede diluirse entre checks HTTP.

**Terminal B**, ya abierta, con el contexto/namespace seleccionados. Liste los pods antes de iniciar A; al ver `BROWSER_READY`, reemplace `NOMBRE_DEL_POD` por uno de ellos y elimine **solo ese pod** inmediatamente:

```bash
kubectl get pods -l app=backend
date -u --iso-8601=seconds
kubectl delete pod NOMBRE_DEL_POD --wait=false
kubectl get pods -w
```

Conserve una captura de esta terminal con UTC y el acuse de borrado. Si el comando falla, no se acredita inyección del fallo. Ctrl+C detiene el watch, no k6. No espere a que termine E1 para borrar: el navegador observa 90 s desde `BROWSER_READY` y el tráfico dura 2 min.

El navegador intenta guardar **`tp-k8s/falla-ux.png`** en el primer fallo de API observado, muestreando cada 500 ms. Si no detecta fallo, guarda a los +10 s un **FALLBACK temporal, no prueba de falla**, identificado en consola; un fallo posterior observado reemplaza ese archivo. Puede perder interrupciones entre consultas (la UI consulta cada 5 s) o capturar después de la recuperación. Correlacione siempre UTC y consola; no afirme un error visible si la UI conservó datos antiguos. `ux-despues.png` muestra el final, no demuestra recuperación por sí sola. Las tres imágenes quedan directamente en `tp-k8s/`; una nueva ejecución las reemplaza, por lo que debe conservarlas antes si necesita comparar intentos.

**Recuperación:** un VU separado consulta la lectura cada 500 ms, con timeout de 5 s. Registra `PROBE_FAILURE` y, después de un error, `PROBE_RECOVERY` con último fallo, primer éxito de una serie saludable y confirmación tras ≥10 s de éxitos, ≥10 muestras y sin huecos mayores de 2 s. Cada nuevo error reinicia esa serie. Compare esos UTC con la fecha del borrado: el intervalo entre último fallo y primer éxito es una estimación muestreada de **ese observador de lectura**, no recuperación global ni instante exacto de reparación. Si no vio errores, informa **“interrupción no observada; recuperación no medible”**, nunca cero segundos; si no alcanza la ventana saludable, no confirma recuperación.

### E2. Pico abrupto con HPA activo

Espere la recuperación de E1. Sin congelar HPA ni cambiar recursos, observe pods, HPA y CPU en otra terminal como en la actividad 2:

```bash
k6 run tp-k8s/k6/e2.js
```

El perfil ofrece **10 reportes/s durante 30 s → subida de 1 s → 200/s durante 30 s → bajada de 1 s → 10/s durante 60 s**. Compare tasa ofrecida, lograda, errores y descartes, además del resumen. Capture `tp-k8s/e2-terminal.png` y, durante una degradación comprobada, **`tp-k8s/colapso.png`** con pods/CPU y el síntoma. Si no hay colapso, guarde `e2-sin-colapso.png` y declare que no se reprodujo con este perfil.

Para investigar el síntoma observado:

```bash
kubectl describe pods -l app=backend
kubectl describe hpa backend
kubectl get events --sort-by=.metadata.creationTimestamp
kubectl logs deployment/backend --tail=100
kubectl logs postgres-0 --tail=50
```

Solo atribuya OOM con `OOMKilled` o eventos que lo acrediten; si hubo reinicios puede consultar `kubectl logs NOMBRE_DEL_POD --previous`. Los descartes por falta de VUs no prueban saturación exclusiva del servidor. Si no hay degradación y el equipo conserva margen, pruebe por separado `k6 run -e SPIKE_RPS=400 -e MAX_VUS=200 tp-k8s/k6/e2.js`; no fuerce un OOM del host. Ante agotamiento del equipo, detenga k6 con Ctrl+C y registre el ensayo como interrumpido.

Al finalizar, espere el retorno de CPU, errores y latencia a la línea base; no basta con pods Running. Como no cambió recursos ni HPA, no hay configuración que restaurar. Verifique persistencia y dashboard nuevamente:

```bash
k6 run tp-k8s/k6/smoke.js
```

## Análisis para completar con resultados reales

| Ensayo | Tasa lograda | POST p95 / error % | Descartes | Máx. réplicas / CPU / reinicios | Conclusión |
|---|---|---|---|---|---|
| Smoke | Pendiente | Pendiente | N/A | Pendiente | Persistencia pendiente |
| Carga 66,67/s | Pendiente | Pendiente | Pendiente | Pendiente | SLA pendiente |
| Estrés | Pendiente | Pendiente | N/A | Pendiente | Límite pendiente |
| E1 | Pendiente | Pendiente | Pendiente | Pendiente | Recuperación y UX pendientes |
| E2 10→200→10/s | Pendiente | Pendiente | Pendiente | Pendiente | Recuperación posterior pendiente |

**Desempeño:** con `[equipo, versiones, fecha, orden de ensayos]`, la carga ofreció `[tasa]` y logró `[tasa]`, con p95 `[ms]`, errores `[%]` y `[descartes]`. El SLA `[cumple/no cumple/no es evaluable]`. En estrés/E2, `[síntoma y recursos]` sostiene `[causa o hipótesis pendiente]`; el smoke posterior y el retorno a la línea base `[confirman/no confirman]` recuperación.

**Fiabilidad y UX:** el borrado ocurrió a `[UTC]`; se observó `[continuidad/errores]`. La recuperación del observador fue `[intervalo/no medible/no confirmada]`. La captura fue `[primer fallo observado/fallback temporal]` y la UI mostró `[datos válidos/antiguos/vacíos/error]`. La decisión `[GO/NO-GO/PENDIENTE]` se justifica con estos datos, sin sustituir resultados faltantes por aprobados.

**Aprendizajes:** distinga lo observado de propuestas futuras como migraciones coordinadas, mejor manejo de errores o escalado de la base. Relacione p95/capacidad/recursos con eficiencia de desempeño, E1/recuperación con fiabilidad y el estado visible del dashboard con usabilidad en ISO/IEC 25010. El TP no certifica conformidad completa ni aptitud para producción.

Para detener el entorno conservando sus datos: `minikube -p terrasense stop`. No se requiere eliminar el perfil ni sus PVC.
