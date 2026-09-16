# Sistema visual de WiBot

## Mundo

**Sala de control en turno de noche.** No es una app de chat de consumo ni un dashboard
corporativo: es el instrumental de un taller que sigue operando cuando ya no hay luz natural.
El fondo es casi negro con matiz verde; los datos se encienden sobre él. Todo lo que no es dato
se apaga.

La decisión de trabajar en oscuro viene de la escena de uso (taller a primera hora, teléfono en
la mano, brillo medio), no de la categoría.

## Color

Base, de más profundo a más cercano:

| Token | Hex | Rol |
|---|---|---|
| `--lienzo` | `#070B09` | Fondo de la aplicación |
| `--superficie` | `#0E1512` | Burbujas de WiBot, cabecera |
| `--superficie-alta` | `#16201B` | Bloques de datos dentro de una respuesta |
| `--linea` | `#1F2C26` | Divisores y estructura |
| `--texto` | `#E4EDE7` | Texto principal |
| `--texto-suave` | `#8FA098` | Texto secundario, teñido del verde del fondo, nunca gris |

Acentos, uno por función:

| Token | Hex | Rol |
|---|---|---|
| `--senal` | `#2FE87C` | El sistema está vivo y respondiendo: estado, foco, barra de actividad |
| `--emisor` | `#4B49F5` | Lo que dice la persona. Solo aparece en sus burbujas |
| `--alerta` | `#FFB547` | Dato parcial, enmascarado o sucio |
| `--peligro` | `#FF6B6B` | Error, consulta rechazada |

El verde nunca se usa como decoración ni como relleno de superficie: marca actividad y foco.
El violeta no se usa en ningún otro lugar que no sea la voz de la persona.

## Tipografía

- **Archivo** (variable, 100–900) para todo el texto de interfaz y de conversación. Grotesca
  estrecha y de contraste bajo: aguanta bien números pegados y nombres largos de concesionarios.
- **Spline Sans Mono** solo para lo que se lee como identificador o medida: patentes, VIN,
  números de orden, RUT, cifras de las tablas. Es el único uso de monoespaciada.

Escala: 12 / 13 / 15 / 17 / 22 / 28 px. Cuerpo a 15px con interlineado 1.55. Los números de las
tablas y de las métricas usan `font-variant-numeric: tabular-nums` para que las columnas alineen.

## Composición

Una columna, de borde a borde en el teléfono, con un ancho máximo de 680px en escritorio.
Tres zonas fijas: cabecera anclada arriba, conversación con desplazamiento propio, campo de
escritura anclado abajo respetando el área segura del dispositivo.

Las burbujas de WiBot van alineadas a la izquierda y no superan el 88% del ancho; las de la
persona van a la derecha con el mismo tope. El radio exterior es 20px y el interior de los
bloques de datos 12px, para que la anidación quede concéntrica con los 8px de relleno.

## Movimiento

Un solo momento con autoría: la entrada de cada mensaje, que sube 10px y aparece en 240ms con
`cubic-bezier(0.2, 0, 0, 1)`. La actividad mientras WiBot consulta la base se comunica con una
barra indeterminada y el nombre de la consulta en curso, no con puntitos saltando: la persona
tiene derecho a saber qué se está preguntando a la base.

Todo lo demás son transiciones de estado de 150ms o menos. Con `prefers-reduced-motion` no se
mueve nada y el estado se sigue comunicando con color y texto.

## Superficies del navegador

La selección de texto, el cursor de escritura, la barra de desplazamiento y el anillo de foco
están teñidos del sistema. Ninguna queda en su valor por defecto.
