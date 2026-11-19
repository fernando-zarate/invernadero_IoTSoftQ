# Grillas y capturas pendientes

`bash tp-final/scripts/run.sh browser` genera 20 PNG y una grilla HTML autónoma de
4 columnas × 5 filas en `RUN_ID/grilla.html`. Abrir con
`xdg-open tp-final/evidencias/capturas/ultima-grilla.html` solo si el gate final pasa.
Si falla, abrir la ruta única mostrada; no se publica el enlace. Cada original, incluidos
los fallidos, se conserva en su carpeta. Pulsar una imagen la amplía.
`browser-stable` y `browser-canary` generan una captura y HTML de QA dirigida cada uno,
no sirven para medir reparto. La muestra natural no garantiza candidatas en 20 visitas.
Cada celda indica iteración, versión y PASS/FAIL. No se excluyen fallos; capturas
ausentes/inválidas hacen fallar la generación. Conservar todos los intentos y adjuntar
leyenda, UTC, SHA, escenario y conclusión. Revisar cuatro lecturas reales, API/JS y
contraste: un banner aislado no demuestra un panel sano.
No reutilizar ni sobrescribir las capturas originales de `tp-k8s/`.
