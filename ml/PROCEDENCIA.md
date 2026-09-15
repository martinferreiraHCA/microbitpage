# Procedencia

Esta carpeta es una copia íntegra de **ML - micro:bit** (Plan Ceibal),
tomada del repositorio público https://github.com/ml-microbit/ml-microbit.github.io
para integrarla dentro de micro:bit Panel Lab y que los estudiantes puedan
entrenar modelos y conectarlos al micro:bit sin salir de la plataforma.

No se modificó ningún archivo. La app original vive en https://ml-microbit.github.io
y se recomienda actualizar esta copia periódicamente desde ese repositorio:

    rm -rf ml && git clone --depth 1 https://github.com/ml-microbit/ml-microbit.github.io ml && rm -rf ml/.git ml/.github

Los créditos y la autoría corresponden a sus autores (ver README.md y package.json).

## Archivo agregado por Panel Lab

- `runner.html`: página auxiliar (oculta) que carga los módulos de entrenamiento de la app
  y expone `window.Runner` para que el panel ejecute los modelos entrenados de forma nativa.
  No modifica ningún archivo original; si se actualiza la copia, volver a agregar este archivo.
