# 🧩 micro:bit Panel Lab

Plataforma educativa **100 % estática (GitHub Pages)** que une el **micro:bit** con una **interfaz de monitoreo** que los estudiantes arman a su gusto y programan con **bloques estilo Scratch**.

```
micro:bit ──USB/serial──▶  Panel Lab  ──▶  panel de monitoreo (medidores, luces, gráficos, botones…)
                             ▲   │
     cámara + Teachable Machine  └──▶  bloques: alertas, lógica, envío de órdenes al micro:bit
```

**Demo:** `https://<usuario>.github.io/microbitpage/` · **Demo de embebido:** `embed-demo.html`

## ¿Qué se puede hacer?

| Área | Funciones |
| --- | --- |
| **Conexión** | Web Serial (Chrome/Edge) con el micro:bit por USB. Formatos `temp:23,luz:140`, `temp=23`, JSON, CSV o texto suelto. Simulador de datos para practicar sin placa. |
| **Panel** | Elementos arrastrables y redimensionables: valor numérico, medidor, barra, gráfico, luz indicadora, texto con `{variables}`, botón, deslizador, interruptor, lista de alertas, imagen, cámara, consola serial, tabla de variables, **flechas/líneas y marcos** para señalar lugares sobre el fondo. Título, colores, unidades, "sin tarjeta" para flotar sobre una imagen. |
| **Fondo** | Imagen de fondo (foto, plano, mapa) con ajuste; el panel se escala a cualquier pantalla manteniendo la posición de los indicadores. Tamaños 16:9, 4:3, Full HD, vertical. |
| **Alertas** | Reglas por elemento (`si el valor > 30 → Peligro → "¡Hace calor!"`) con cambio de color, sonido y lista de alertas. Desde bloques: alerta, sonido, voz, notificación. |
| **Bloques** | Eventos (cuando llegan datos, cuando X cambia, cada N segundos, botón, control, cámara, al iniciar), sensores (valor, promedio/máximo/mínimo, mapear), panel (mostrar, luz, color, texto, ocultar, imagen, fondo), micro:bit (enviar texto / `nombre:valor`), cámara/IA, más control, lógica, matemáticas, texto, variables y funciones. |
| **Cámara + IA** | Widget de cámara con modelo de imágenes de [Teachable Machine](https://teachablemachine.withgoogle.com). Variables `camara_clase`, `camara_confianza`, `camara_<clase>` y evento *cuando la cámara detecta…*. |
| **Proyectos** | Autoguardado en el navegador, **descarga/carga de archivo `.json`** con panel + bloques + fondo + configuración, enlace compartible con el proyecto comprimido, 4 ejemplos incluidos. |
| **Modo panel** | Solo la interfaz, pantalla completa, parámetros de URL para kiosco y **embebido por `<iframe>`** con API `postMessage` (para ml-microbit, MakeCode u otra página con conexión propia). |
| **Guía** | Tutorial paso a paso integrado (botón Guía) y generador de código para el micro:bit (MakeCode JavaScript y MicroPython). |

## Publicar en GitHub Pages

1. Subí este repositorio a GitHub.
2. **Settings → Pages → Build and deployment → Source: "GitHub Actions"**. El workflow `.github/workflows/deploy.yml` publica automáticamente cada `push` a `main`.
   (Alternativa sin Actions: Source "Deploy from a branch", rama `main`, carpeta `/`.)
3. Abrí `https://<usuario>.github.io/microbitpage/`.

No hay build: es HTML/CSS/JS puro. Blockly está incluido en `vendor/` para funcionar sin internet; solo TensorFlow.js / Teachable Machine se descargan al usar la cámara.

## Programar el micro:bit

El micro:bit debe enviar líneas `nombre:valor` por serial (115200 baudios). En MakeCode, el bloque **serial escribir valor** ya lo hace. Usá **Herramientas → Código para el micro:bit** en la app para generar el programa con los sensores que quieras, por ejemplo:

```js
serial.setBaudRate(BaudRate.BaudRate115200)
basic.forever(function () {
    serial.writeValue("temp", input.temperature())
    serial.writeValue("luz", input.lightLevel())
    basic.pause(500)
})
serial.onDataReceived(serial.delimiters(Delimiters.NewLine), function () {
    let linea = serial.readUntil(serial.delimiters(Delimiters.NewLine))   // ej. "led:1"
    basic.showString(linea)
})
```

### Con ml-microbit (CreateAI)

En el programa que genera [ml-microbit.github.io](https://ml-microbit.github.io) agregá dentro de cada evento de la extensión ML un bloque *serial write line* con `clase:nombre`. El panel recibe la variable `clase` y podés mostrarla o hacer alertas. También podés embeber el panel en cualquier página que ya tenga conexión al micro:bit y reenviarle los datos por `postMessage` (ver abajo).

## ML - micro:bit integrado (IA)

La carpeta `ml/` contiene una copia íntegra de [ML - micro:bit](https://github.com/ml-microbit/ml-microbit.github.io) (Plan Ceibal): una app que entrena modelos de **imagen, audio o pose** en el navegador y le manda al micro:bit por **Bluetooth UART** la clase detectada (`Gato#87`). Se abre desde el botón **IA · ML micro:bit** (o con `?ml=1`) en una ventana que puede quedar **flotante o en miniatura sobre el panel**, para ver la cámara y los datos a la vez; mientras esté abierta la detección sigue activa. También se puede usar sola en `ml/index.html`.

**El panel ejecuta los modelos de forma nativa.** El modelo se entrena una vez en ML - micro:bit (queda en IndexedDB del navegador) y el elemento **Cámara / IA** del panel lo corre con la cámara de la computadora, usando los mismos módulos de entrenamiento a través de `ml/runner.html` (un motor oculto en la misma origen). No hace falta Bluetooth:

```
ML - micro:bit (entrenar) ──▶ Cámara / IA del panel (detectar) ──▶ bloques ──USB serial──▶ micro:bit
                                                                    "clase:Gato,certeza:87", "led:1", …
```

1. Entrenar el modelo en **IA · ML micro:bit** y volver al panel.
2. Agregar **Cámara / IA**, elegir el proyecto entrenado (o "el más reciente") y presionar **▶ Iniciar cámara**. Publica `clase`, `certeza` y `camara_<clase>`; dispara el evento *cuando la cámara detecta…*.
3. Cada cambio de clase se envía al micro:bit por serial como `clase:NOMBRE,certeza:NN` (configurable), y los bloques pueden mandar cualquier otra orden.
4. En el micro:bit, un programa MakeCode lee el serial y actúa (**Herramientas → Cómo conectar ML - micro:bit** tiene el código). Ejemplo incluido: **Cámara con IA (ML - micro:bit)**.

Alternativa por Bluetooth (micro:bit lejos de la computadora): ML - micro:bit manda las clases por BLE con la extensión `iaMachine` y el micro:bit las reenvía al panel por serial; el mismo diálogo muestra ese programa. Para actualizar la copia de la app, ver `ml/PROCEDENCIA.md`.

## Embeber el panel en otra página

```html
<iframe src="https://<usuario>.github.io/microbitpage/?mode=panel&lock=1&project=URL_DEL_JSON"
        width="100%" height="600" allow="serial; camera; fullscreen"></iframe>
```

Parámetros de URL: `mode=panel` (solo panel) · `lock=1` (sin botón Editar) · `edit=0` · `sim=1` (simulador al abrir) · `project=URL` (carga un `.json`) · `#p=…` (proyecto dentro del enlace, generado con *Copiar enlace*).

API `postMessage` (página host ⇄ iframe):

| Mensaje | Dirección | Descripción |
| --- | --- | --- |
| `{type:'mbp:data', line:'temp:23,luz:140'}` | host → panel | Inyecta una línea como la del micro:bit |
| `{type:'mbp:setVar', name, value}` | host → panel | Fija una variable |
| `{type:'mbp:load', project}` | host → panel | Carga un proyecto (JSON) |
| `{type:'mbp:mode', mode:'panel'|'editor'}` | host → panel | Cambia el modo |
| `{type:'mbp:run', run:true|false}` | host → panel | Ejecuta / detiene los bloques |
| `{type:'mbp:getProject'}` → `{type:'mbp:project', project}` | ambos | Pide el proyecto actual |
| `{type:'mbp:ready'}` | panel → host | El panel cargó |
| `{type:'mbp:send', text}` | panel → host | Los bloques quieren enviar `text` al micro:bit (si el panel no tiene puerto propio) |
| `{type:'mbp:var', name, value}` / `{type:'mbp:alert', alert}` | panel → host | Variables y alertas en vivo |

`embed-demo.html` muestra todo esto funcionando.

## Formato del archivo de proyecto

```json
{
  "app": "microbit-panel-lab", "version": 1, "name": "Estación meteorológica",
  "serial": { "baud": 115200, "columns": ["temp", "luz"] },
  "sim": { "vars": [{ "name": "temp", "min": 15, "max": 35 }], "interval": 700 },
  "dashboard": { "width": 1280, "height": 720, "background": { "color": "#eef2f7", "image": "", "fit": "cover" }, "widgets": [ … ] },
  "blocks": { "blocks": { "languageVersion": 0, "blocks": [ … ] } },
  "alerts": { "sound": true }, "autorun": true
}
```

## Estructura

```
index.html          aplicación
embed-demo.html     demo de página host con postMessage
css/style.css
js/state.js         bus de eventos, variables, utilidades
js/serial.js        Web Serial, parser, simulador, puente postMessage
js/widgets.js       panel, widgets, propiedades, reglas de alerta
js/blocks.js        bloques Blockly + generador de código
js/runtime.js       ejecución por eventos del programa de bloques
js/tm.js            cámara + Teachable Machine
js/project.js       guardar / cargar / enlace / autoguardado
js/microbit-code.js generador de código MakeCode / MicroPython
js/examples.js      proyectos de ejemplo
js/guide.js         guía paso a paso
js/app.js           interfaz, modos, diálogos
vendor/blockly/     Blockly 10.4.3 (Apache-2.0)
ml/                 copia de ML - micro:bit (Plan Ceibal), ver ml/PROCEDENCIA.md
```

## Requisitos

- Chrome o Edge en computadora para la conexión serial (Web Serial). En otros navegadores funciona el simulador y el modo embebido con datos por `postMessage`.
- micro:bit V1 o V2 por USB. Si Windows no lo ve, instalá el driver mbed serial o actualizá el firmware del micro:bit.
