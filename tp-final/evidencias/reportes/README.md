# Reportes pendientes

`scripts/run.sh` genera un subdirectorio único por prueba con contexto, UTC,
snapshots sin Secrets, resumen/serie JSON, dashboard HTML, consola, códigos de
salida, comparación de split/A-B, eventos, top e Ingress. No editar los datos crudos.
Agregar `interpretacion.md` a cada run y enlazarlo en bitácora e índice.

Revisar secretos y datos personales antes de versionar. Nunca copiar los reportes
Horusec crudos del usuario; publicar solo un resumen redactado de hallazgos/tratamiento.
Un directorio vacío, una ejecución abortada o un código cero con artefactos faltantes
no prueban SLO. El resultado actual continúa pendiente.
