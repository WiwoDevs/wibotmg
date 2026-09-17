# Sistema visual de WiWO Me

Deriva del **Wiwo Neo Design System** (https://neo.wiwo.me/): *Humanity, Augmented*. La aplicación no
reinterpreta la marca, la aplica.

## Mundo

**Luz de día, no sala de control.** El lienzo es el beige Wiwo; la interfaz se apoya en él con
superficies casi blancas, esquinas muy redondeadas y sombras suaves. Lo único oscuro de la pantalla
es el escenario del Thinking Orb: la tinta existe para que la luz del orbe se lea.

El producto se llama **WiWO Me**. El asistente es el **Thinking Orb**: no hay mascota, no hay robot,
no hay cara. Hay una esfera de luz que respira.

## Color

Base, del fondo a lo más elevado:

| Token | Hex | Rol |
|---|---|---|
| `--lienzo` | `#F8FAD7` | Fondo de la aplicación (beige Wiwo) |
| `--superficie` | `#FFFDF2` | Burbujas del orbe, tarjetas, cabecera |
| `--superficie-alta` | `#F4F3DD` | Encabezados de bloque, campos de formulario |
| `--superficie-inversa` | `#292929` | Escenario del orbe y botón de detener |
| `--linea` | `rgba(41,41,41,.14)` | Divisores y estructura |
| `--texto` | `#292929` | Texto principal |
| `--texto-suave` | `#66685F` | Texto secundario |

Acentos, uno por función:

| Token | Hex | Rol |
|---|---|---|
| `--senal` | `#4242FF` | Acción, foco, enlace, botón de enviar. Es el azul Wiwo |
| `--energia` | `#3BFF00` | Solo energía: degradados, glow del orbe, barra de actividad |
| `--emisor` | `#4242FF` | Lo que dice la persona, sobre `#FFFDF2` |
| `--alerta` | `#9C6417` | Dato parcial, enmascarado o sucio |
| `--peligro` | `#B3261E` | Error, consulta rechazada |

`--degradado` (`linear-gradient(103deg,#3BFF00,#4242FF)`) es el gesto de marca: aparece en la barra
de actividad y en los medidores, nunca como relleno de superficie ni detrás de texto — el verde puro
no tiene contraste suficiente sobre beige.

Para la temperatura de los leads hay una escala propia, la única parte del sistema donde el color
codifica un valor y no un estado: `--calor-4` `#C3463D` (super caliente), `--calor-3` `#D88719`
(caliente), `--calor-2` `#4242FF` (tibio) y `--calor-1` `#8B8D85` (frío).

## Tipografía

- **Outfit** (`--fuente-marca`) para el nombre del producto y los títulos de apertura. Es la voz de
  la marca: pesada, estrecha, con tracking negativo.
- **Plus Jakarta Sans** (`--fuente-interfaz`) para todo el texto de interfaz y de conversación.
- **Tomorrow** (`--fuente-datos`) solo para lo que se lee como identificador o medida: patentes, VIN,
  números de orden, RUT, cifras de las tablas, horas y estados.

Cuerpo a 15px con interlineado 1.55 y peso 450. Los números de tablas y métricas usan
`font-variant-numeric: tabular-nums` para que las columnas alineen.

## El Thinking Orb

Componente `OrbePensante` (`apps/web/componentes/OrbePensante.tsx`). Un vidrio de luz sobre un
escenario circular de tinta: cintas de color en `mix-blend-mode: screen`, auroras que giran, un
núcleo que late, partículas en órbita. Todo escala desde una sola variable, `--orbe-tamano`.

Cinco estados, y cada uno cambia ritmo, brillo, deformación y cantidad de partículas:

| Estado | Cuándo | Lectura |
|---|---|---|
| `reposo` | Nada en curso | Casi quieto, sin partículas, luz baja |
| `escuchando` | La persona está escribiendo | Verde sensible, ritmo medio |
| `pensando` | Hay una consulta a la base en curso | Auroras rápidas, anillos vivos |
| `generando` | Llega texto del modelo | Máxima energía, órbitas completas |
| `error` | El último turno falló | Contracción fría y violácea, sin dramatizar |

El orbe aparece en tres lugares: 42px en la cabecera, 188px en la pantalla vacía y 56px en la
entrada. Nunca lleva texto encima.

## Composición

Una columna, de borde a borde en el teléfono, con un ancho máximo de 760px en escritorio. Tres zonas
fijas: cabecera anclada arriba, conversación con desplazamiento propio, campo de escritura anclado
abajo respetando el área segura del dispositivo.

Las burbujas del orbe van alineadas a la izquierda y no superan el 88% del ancho; las de la persona
van a la derecha con el mismo tope. El radio exterior es 24px y el interior de los bloques de datos
16px, para que la anidación quede concéntrica.

## Movimiento

`--curva` es `cubic-bezier(.2,.8,.2,1)`, la expresiva de Neo. La entrada de cada mensaje sube 10px y
aparece en 240ms. La actividad mientras el orbe consulta la base se comunica con una barra
indeterminada en degradado y el nombre de la consulta en curso, no con puntitos saltando: la persona
tiene derecho a saber qué se está preguntando a la base.

Todo lo demás son transiciones de estado de 160ms o menos. Con `prefers-reduced-motion` no se mueve
nada —el orbe incluido— y el estado se sigue comunicando con color y texto.

## Superficies del navegador

La selección de texto, el cursor de escritura, la barra de desplazamiento y el anillo de foco están
teñidos del sistema. Ninguna queda en su valor por defecto.
