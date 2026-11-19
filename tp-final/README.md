# TerraSense: canary del frontend, de principio a fin

Flujo único: **preparar → comprobar las dos pantallas → 10 % → 25 % → estrés → promover o revertir**.
Solo cambia el dashboard Next.js: estable `1.0.0`, candidata `1.1.0`.
Backend `1.0.0` y PostgreSQL son dependencias fijas; no tienen canary.

**Estado: PENDIENTE DE EJECUCIÓN; NO-GO preventivo.** No hay mediciones del clúster,
videos ni CI remoto aprobado. Las tablas pendientes no son resultados.

## 1. Despliegue desde cero

### Requisitos y barrera de calidad

Ejecutar en Bash desde la raíz del repositorio. Tener instalados y operativos
[Docker](https://docs.docker.com/engine/install/),
[Minikube](https://minikube.sigs.k8s.io/docs/start/),
[kubectl](https://kubernetes.io/docs/tasks/tools/),
[k6 con browser](https://grafana.com/docs/k6/latest/set-up/install-k6/), Chromium,
Python 3, Git, curl, OBS y `xdg-open`. Reservar 4 CPU, 7 GiB y espacio para imágenes/PVC.
El perfil, contexto y namespace aislados se llaman `terrasense-final`.
NGINX comunitario se usa por el alcance didáctico, no como recomendación de producción.

**El gate de CI es obligatorio:** seguir [ci/README.md](ci/README.md) para lint sin
warnings, tests, build y Horusec bloqueante, y vincular SHA e imágenes aprobadas.
El helper reutiliza el `ARTIFACT` verificado por esa guía, sin reconstruirlo. Sin él,
solo prepara un **ensayo local**, no aprobado. Un árbol sucio no se identifica solo por SHA.

```bash
bash tp-final/scripts/setup.sh
sudoedit /etc/hosts
```

El helper muestra la línea `IP api.terrasense.local terrasense.local` que debe quedar
una sola vez en `/etc/hosts`; reemplazar las entradas anteriores sin tocar otros hosts.
No modifica DNS ni instala herramientas. Carga las tres imágenes, espera DB,
arranca backend serialmente, valida la semilla y carga la flota
de 2000 dispositivos/8000 canales; después habilita HPA y frontend.
Con un laboratorio completo existente no reconstruye ni reinicia el rollout.
Si detecta una preparación incompleta se detiene: inspeccionarla, **no borrar PVC ni
regenerar contraseñas**. No reaplicar `base/20-backend.yaml` durante el experimento.
Las credenciales quedan en `.local/`; no mostrarlas en grabaciones.

```bash
getent ahostsv4 terrasense.local
getent ahostsv4 api.terrasense.local
bash tp-final/scripts/run.sh smoke
```

Smoke escribe y relee cuatro valores reales en ambos extremos de la flota. No continuar
si falla. No hay `/health` ni prefijo `/api`; un POST exitoso por sí solo no prueba persistencia.

### Ver la diferencia del frontend

La ruta es **http://terrasense.local/dashboard**. `1.0.0` conserva el panel oscuro y
banner verde; `1.1.0` muestra **un banner amarillo grande y lecturas de alto contraste**.
Estos comandos abren Chromium sin interfaz, validan cuatro lecturas contra la API y
generan una captura ampliable de cada versión, incluso con peso inicial 0:

```bash
bash tp-final/scripts/run.sh browser-stable
xdg-open tp-final/evidencias/capturas/ultima-grilla.html
bash tp-final/scripts/run.sh browser-canary
xdg-open tp-final/evidencias/capturas/ultima-grilla.html
```

Cada HTML original queda en su carpeta `RUN_ID`; `ultima-grilla.html` se publica solo
si el gate final pasa. Si el comando falla, abrir la ruta única mostrada, **no el enlace**;
los fallos se conservan. Estas visitas son QA dirigida, no reparto: usan la cookie
frontend `TERRASENSE_QA=never/always`.
Para observar la candidata en vivo, abrir `/dashboard` y ejecutar en la consola del
navegador `document.cookie='TERRASENSE_QA=always; path=/'; location.reload()`.
Con `never` se fuerza la estable; para quitar QA, usar
`document.cookie='TERRASENSE_QA=; Max-Age=0; path=/'` y cerrar ese contexto.
Conservar una ventana candidata para validar su transición al cierre.

Guardar también sesiones anteriores al cierre, sin mostrar secretos:

```bash
mkdir -p tp-final/.local
curl --fail -c tp-final/.local/canary.cookies -H 'X-Canary: always' http://terrasense.local/version.txt
printf '# Netscape HTTP Cookie File\nterrasense.local\tFALSE\t/\tFALSE\t0\tTERRASENSE_QA\talways\n' > tp-final/.local/qa.cookies
curl --fail -b tp-final/.local/qa.cookies -c tp-final/.local/qa.cookies http://terrasense.local/version.txt
```

## 2. Plan de rollout y bitácora

| Paso | Prueba necesaria | Avance |
|---|---|---|
| QA, peso 0 | Smoke y ambas pantallas | Datos persistidos, identidad y UI sanas |
| Peso 10 | 2 min a 40 visitas HTTP/s + grilla natural de 20 | Todos los gates PASS |
| Peso 25 | Mismas pruebas | Todos los gates PASS |
| Estrés y cierre | Comparar ambos frontends; promover o revertir | Decisión registrada y sesiones verificadas |

Gates por versión: **p95 <300 ms, error <1 %, checks >99 %, ≥200 muestras**;
cero versiones desconocidas e iteraciones descartadas. Además,
**p95 candidata ≤1,10 × p95 estable**. `compare.py` evalúa también el reparto natural:
`|observado − p| ≤ max(0,03; 3√(p(1−p)/n))`, con `p=peso/100`.
Las 4800 visitas planeadas no sustituyen los conteos reales ni garantizan la muestra mínima.
Fallo, muestra insuficiente o evidencia incompleta: **detener avance y revertir**, conservar
el intento y explicar la causa; no repetir silenciosamente hasta conseguir un verde.

### Peso 10 y grilla de 20 capturas

Iniciar grabación según el Anexo C. `desired.py` solo edita YAML local; revisar sus cambios.
El wrapper comprueba el peso configurado y registra snapshots; observar reconciliación
del controller: un `apply` exitoso no prueba por sí solo convergencia.

```bash
python3 tp-final/scripts/desired.py weight 10
git diff -- tp-final/k8s
kubectl --context=terrasense-final apply -f tp-final/k8s/canary/ingress.yaml
bash tp-final/scripts/run.sh split10
bash tp-final/scripts/run.sh browser
xdg-open tp-final/evidencias/capturas/ultima-grilla.html
```

`browser` crea **20 contextos nuevos**, captura `/dashboard` y genera automáticamente
una **grilla HTML de 4 columnas × 5 filas**, con PNG incrustados para abrir sin internet.
Cada celda indica iteración, versión y PASS/FAIL; pulsarla amplía la imagen completa.
La cabecera muestra UTC, RUN_ID, conteos, porcentaje observado y peso configurado capturado.
Incluye los FAIL; si falta una captura o el PNG es inválido, la generación falla.
El wrapper conserva el fallo de k6 aunque consiga generar el HTML.

Lo esperable es ver mayormente estable, **no exactamente 18 antiguas/2 nuevas**.
Con peso 10 hay aproximadamente un **12 % de probabilidad de obtener cero candidatas**
en 20 visitas independientes. No seleccionar imágenes para fabricar proporciones:
las visitas QA anteriores prueban la diferencia visual; `split10` mide el reparto con
miles de visitas. Recargar con F5 conserva afinidad; incógnito puede compartir cookies
entre ventanas: cerrar **todas** para una sesión limpia. El script evita ese problema.

### Peso 25: solo si la etapa 10 pasó

```bash
python3 tp-final/scripts/desired.py weight 25
git diff -- tp-final/k8s
kubectl --context=terrasense-final apply -f tp-final/k8s/canary/ingress.yaml
bash tp-final/scripts/run.sh split25
bash tp-final/scripts/run.sh browser
xdg-open tp-final/evidencias/capturas/ultima-grilla.html
```

Revisar en cada `evidencias/reportes/RUN_ID/`: `gate.exit`, `k6.exit`, `comparison.json`
(split), `summary.json`, `dashboard.html`, `metrics.json` y `console.log`.
Los snapshots incluyen SHA, imágenes, YAML deseado/observado, recursos y eventos.
Un código cero sin UI sana ni evidencia completa no autoriza avanzar.

| UTC inicio/fin | RUN_ID / SHA / CI URL | peso deseado/real | n estable/canary/desconocida | % observado / tolerancia | p95 / errores / dropped | evidencia y decisión |
|---|---|---|---|---|---|---|
| PENDIENTE | PENDIENTE | 0/— | — | — | — | QA pendiente |
| PENDIENTE | PENDIENTE | 10/— | — | — | — | No ejecutado |
| PENDIENTE | PENDIENTE | 25/— | — | — | — | No ejecutado |
| PENDIENTE | PENDIENTE | Cierre | — | — | — | Sin decisión ejecutada |

### Cierre obligatorio: una decisión, no dos ensayos
Primero completar el [estrés de sección 3](#3-hipótesis-y-prueba-de-estrés).
**Con CI/imágenes aprobadas, ambas etapas, UI y estrés satisfactorios: promover.**
Cambiar imagen y label de estable es promoción real; peso 100 no lo sustituye:

```bash
python3 tp-final/scripts/desired.py promote
kubectl --context=terrasense-final apply -f tp-final/k8s/stable/frontend.yaml
kubectl --context=terrasense-final -n terrasense-final rollout status deployment/front-stable --timeout=180s
export EXPECTED=1.1.0
```

**Si no se cumplen las condiciones: rollback.** Restaurar estable y esperar salud:

```bash
python3 tp-final/scripts/desired.py restore-stable
kubectl --context=terrasense-final apply -f tp-final/k8s/stable/frontend.yaml
kubectl --context=terrasense-final -n terrasense-final rollout status deployment/front-stable --timeout=180s
export EXPECTED=1.0.0
```

Después de **la decisión elegida**, retirar la ruta candidata. Peso 0 no elimina
sesiones sticky ni overrides QA; mantener sus pods hasta validar el tráfico:

```bash
python3 tp-final/scripts/desired.py route-off
kubectl --context=terrasense-final -n terrasense-final delete ingress front-canary --ignore-not-found --wait=true
bash tp-final/scripts/check-route.sh "$EXPECTED"
```

Ahora recargar la ventana candidata conservada y abrir un contexto nuevo: comprobar
versión esperada, cuatro lecturas y assets/API sanos. Registrar fallos de caché/transición;
si falla algo, **no apagar pods**. Solo tras ambas comprobaciones:

```bash
python3 tp-final/scripts/desired.py park
kubectl --context=terrasense-final apply -f tp-final/k8s/canary/frontend.yaml
kubectl --context=terrasense-final -n terrasense-final get pods -L track,version
git diff -- tp-final/k8s
```

No aplicar YAML recursivamente: podría restaurar el Ingress retirado. Kustomize conserva
la lista deseada, pero quitar un recurso de esa lista no lo elimina del clúster.
Registrar tiempo detección → cambio → éxito confirmado; sin fallo observado, recuperación
**no medible**, no cero. Completar bitácora con responsable y motivo del cierre.

## 3. Hipótesis y prueba de estrés

**Antes del cierre**, comparar HTTP de `/dashboard`, no ingestión de sensores ni tiempo
de hidratación. Hipótesis: candidata con p95 <300 ms, error <1 % y regresión ≤10 %.
Ambos tracks tienen 2 pods, requests `100m/128Mi`, limits `500m/384Mi`, sin HPA frontend.
Misma máquina/script/rampa: 10 → 20 → 50 → 100 → 200 → 0 visitas/s, 8 min.
Ejecutar aisladamente; no lanzar browser u otras cargas al mismo tiempo.

```bash
bash tp-final/scripts/run.sh stress-stable
sleep 120
bash tp-final/scripts/run.sh stress-canary
```

Son dos ejecuciones, sin contrabalanceo: el orden y la caché pueden sesgar la comparación.
Comparar ventanas de la misma rampa en `metrics.json`: el p95 agregado no prueba cada escalón. Calcular
`delta=100×(p95_canary/p95_stable−1)` con ventanas comparables. El wrapper controla SLO
absoluto en cada stress; la comparación relativa de estrés debe quedar en el informe.
Iteraciones descartadas invalidan la carga lograda. No cambiar recursos a mitad del ensayo.

| RUN_ID / versión | carga ofrecida/lograda / n | p95 / errores / dropped | primer escalón fuera de SLO / delta |
|---|---|---|---|
| PENDIENTE / 1.0.0 | — | — | — |
| PENDIENTE / 1.1.0 | — | — | — |

**Resultado y conclusión: pendientes.** No confundir falta de prueba con hipótesis refutada.

## 4. Mapa ISO/IEC 25000

Modelo: **25010:2023**, no certificación. 2500n organiza el plan; 2501n contiene modelos;
2503n/25030 define requisitos → 2502n/25023/25022 orienta medición → 2504n/25040 evaluación.

| Etapa | Característica/subcaracterística | Requisito → medición → decisión / límite |
|---|---|---|
| Lint | Mantenibilidad: analizabilidad/modificabilidad | 0 errores/warnings → conteo → bloquear CI; no prueba corrección |
| Horusec | Seguridad: confidencialidad/integridad/autenticidad | 0 LOW+ abiertos, análisis completo → severidades → bloquear; SAST no prueba seguridad runtime |
| Contenedores/K8s | Flexibilidad: instalabilidad/adaptabilidad | SHA/ID y arranque → rollout → aceptar artefacto; bases flotantes limitan reproducibilidad |
| Probes | Fiabilidad: disponibilidad/recuperabilidad | No enrutar no-listos → readiness/reinicios → verificar; TCP/HTTP no prueba datos |
| HPA, TP previo | Flexibilidad: escalabilidad; eficiencia: recursos/capacidad | CPU 60 %, 2–6 pods → réplicas/SLO → evaluar; no escala DB ni prueba 10.000 sensores |
| Carga/estrés | Eficiencia: tiempo/capacidad; adecuación funcional: corrección | SLO + readback → JSON/series → contrastar hipótesis; HTTP no mide JS |
| Fallas, TP previo | Fiabilidad: tolerancia a fallos/recuperabilidad | Ventana definida → errores/éxito sostenido → evaluar; reemplazo sin error no demuestra RTO=0 |
| Canary | Fiabilidad: disponibilidad; flexibilidad: reemplazabilidad; interacción: operabilidad | Exposición/SLO/UI → split/grilla → promover o revertir; sintéticos no prueban satisfacción |

**Producto (25010) ≠ calidad en uso (25019).** Browser añade evidencia de interacción
real con JS/datos, pero no mide eficacia de tareas, satisfacción ni decisiones agronómicas.
Brechas: inclusividad/operabilidad (axe, teclado y tareas con productores, 0 fallos críticos
y ≥95 % tareas completas); safety (riesgos y simulación/HIL, alarmas dentro del plazo
acordado); seguridad runtime (auth/pruebas negativas, 0 accesos no autorizados críticos).
Evaluarlas antes de producción; no son demostraciones adicionales de este flujo local.

## 5. Índice de evidencia

| ID | Archivo/producción | Estado y conclusión |
|---|---|---|
| CI | [Gate e imágenes](ci/README.md), URL y SHA | PENDIENTE |
| QA | `smoke`, `browser-stable`, `browser-canary` | Persistencia y dos pantallas: PENDIENTE |
| C10/C25 | `split10`/`split25`, `browser`; grilla por RUN_ID | Peso/SLO y 20 capturas por etapa: PENDIENTE |
| STRESS | Dos runs aislados de sección 3 y comparación | PENDIENTE |
| HPA/FALLA | [TP anterior](../tp-k8s/), con sus fechas y contexto | Incorporar evidencia previa identificada, no atribuirla a este run |
| CIERRE | Estado final, sesiones previas/nuevas y video | PENDIENTE |
| PRESENTACIÓN | [Fuente de diapositivas](presentacion/diapositivas.md), exportar PDF | PENDIENTE |

Leyenda necesaria: **ID — UTC — RUN_ID — SHA/imagen — escenario/peso — observación —
conclusión — límite**. Añadir `interpretacion.md` a cada run con métricas y decisión;
enlazar rutas reales en las tablas. Conservar intentos fallidos y originales, revisar
secretos/tamaño antes de versionar. Nunca publicar reportes Horusec crudos.

## 6. Veredictos separados

- **Release 1.1.0: NO-GO preventivo**, hasta CI/imágenes aprobadas, persistencia, UI,
  dos pesos con gates, estrés comparado y cierre documentado.
- **10.000 sensores: NO-GO por capacidad no demostrada.** La flota actual tiene
  2000 dispositivos/8000 canales: cada 30 s son 66,67 POST/s. La futura exige 10.000
  IDs/40.000 canales y 333,33 POST/s sostenidos, readback, DB/retención, ráfagas y fallas.
  Aumentar GET/s del frontend no demuestra esa capacidad.

## 7. Aprendizajes y limitaciones

- Header/meta correctos no prueban hidratación: comprobar cuatro valores contra API.
- React SSR intercala comentarios en el banner: validar su texto por selector HTML,
  no por coincidencias en el cuerpo completo, que también contiene scripts RSC.
- Afinidad solo frontend evita mezclar assets; QA no debe contaminar llamadas CORS API.
- Peso 0 no es rollback: retirar ruta, verificar sesiones y recién apagar candidata.
- Seeder/synchronize requieren arranque serial; no reemplazan migraciones productivas.
- Ninguna validación local aprueba CI remoto, SAST, rendimiento ni calidad en uso.

## Anexo C. Grabar y presentar sin complicar la ejecución

1. Preparar OBS antes del ensayo: captura de ventana, **navegador y terminal lado a lado**,
   1920×1080, 30 fps, fuente terminal ≥24 px. Ocultar notificaciones y datos personales.
2. Probar 10 s y reproducirlos. Grabar en MKV dentro de `evidencias/videos/`; no mostrar
   `.env`, cookies, tokens ni scans crudos. Iniciar antes de `date -u` y del comando k6.
3. Mostrar peso, RUN_ID, gate y grilla; cada ejecución dura lo necesario. Editar después
   en clips **≤3 min**, sin ocultar fallos; indicar “x4” cuando se acelere. Remultiplexar
   a MP4 desde OBS y conservar el original. Añadir leyenda y conclusión, no solo imágenes.
4. Grabar el cierre con la ventana antigua y contexto nuevo. Incorporar clips previos
   HPA/falla con fecha/contexto explícitos, sin repetir esos experimentos aquí.
5. Abrir y reproducir HTML, PDF y MP4 **sin conexión** antes de entregar; llevar copia
   local completa. El enlace `ultima-grilla.html` es para navegar: entregar el HTML
   autónomo `capturas/RUN_ID/grilla.html` y los PNG originales con el índice actualizado.
