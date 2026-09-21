# Bot C-Level — preguntas y respuestas

Informe de respuestas sobre WiBot, la inteligencia ejecutiva de WIWO aplicada al negocio de
MG Contact: la venta, la atención al cliente y la operación de servicio. Cada respuesta está
respaldada por el sistema en funcionamiento.

Fecha: 21 de septiembre de 2026.

---

## 1. ¿Qué modelo o modelos de IA se utilizarán?

Hoy se usa **Gemini**, a través de su API compatible con OpenAI. El modelo por defecto en el
código es `gemini-3.5-flash` (`apps/web/lib/gemini.ts`), y se cambia por la variable de entorno
`GEMINI_MODEL` sin tocar una línea de código.

El diseño es **multi-modelo por configuración**: la combinación de `GEMINI_BASE_URL` más
`GEMINI_MODEL` sobre el formato de API de OpenAI permite migrar a Claude, a GPT o a un Gemini de
gama superior cambiando dos variables de entorno. No hay dependencia técnica atada a un
proveedor: si mañana otro modelo rinde mejor o cuesta menos, se cambia sin reescribir el bot.

## 2. ¿Qué proveedor tecnológico se utilizará y por qué fue seleccionado?

Google Gemini. Las razones concretas de la selección:

- **Latencia y costo.** La gama Flash responde rápido y a costo bajo por consulta. Importa porque
  la escena de uso real es gerencia consultando de pie, entre reuniones, muchas veces desde el
  teléfono.
- **Function calling nativo y fiable.** Es el núcleo de la arquitectura: el modelo no inventa
  cifras, pide herramientas que consultan la base. Un modelo que falla al llamar herramientas
  rompe el producto entero.
- **Endpoint compatible con OpenAI.** Da portabilidad inmediata hacia otros proveedores y evita
  el lock-in.
- **Ventana de contexto amplia.** Necesaria para que entren los resultados de varias consultas en
  una misma respuesta.

## 3. ¿Cómo se compararán y clasificarán los modelos de IA disponibles?

Con criterios medibles, en este orden de peso:

1. **Fiabilidad del tool calling**: que elija la herramienta correcta y respete los argumentos.
2. **Obediencia al prompt de sistema**: que no estime, no interpole ni adorne.
3. **Latencia** p50 y p95 por tipo de pregunta.
4. **Costo real por consulta**, no por token aislado.
5. **Calidad del español rioplatense** y tono ejecutivo.

El método es un banco de preguntas de negocio con respuesta ya verificada a mano (ver pregunta
13), que se corre idéntico contra cada modelo candidato y se compara en exactitud, latencia y
costo. La infraestructura para hacerlo ya existe: basta cambiar `GEMINI_MODEL` y repetir la
corrida.

## 4. ¿Cuál es el costo por consumo de tokens de cada modelo?

Tarifas publicadas por Google, en dólares por millón de tokens. Corresponden a la lista
vigente del proveedor y están sujetas a su actualización periódica.

| Modelo | Entrada (1M tokens) | Salida (1M tokens) |
|---|---|---|
| Gemini Flash-Lite | ~US$ 0,10 | ~US$ 0,40 |
| Gemini Flash | ~US$ 0,30 | ~US$ 2,50 |
| Gemini Pro | ~US$ 1,25 – 2,00 | ~US$ 10 – 12 |

La referencia relevante no es el precio por token sino **el costo por pregunta**. Una
pregunta de WiBot consume el prompt de sistema, el esquema de herramientas y hasta doce rondas de
consulta, con un tope de 24.000 caracteres por resultado de herramienta. Eso da un rango estimado
de 10.000 a 40.000 tokens de entrada y unos 300 de salida:

- **Gemini Flash: entre US$ 0,01 y US$ 0,02 por pregunta.**
- A 3.000 preguntas por mes: **US$ 30 a US$ 60 mensuales** de tokens.
- Con un modelo Pro, el mismo volumen cuesta entre cinco y ocho veces más.

## 5. ¿Qué otros costos existen además de los tokens: desarrollo, integración, infraestructura, mantenimiento y soporte?

- **Desarrollo.** Construcción del bot, la capa de consulta, las herramientas de negocio, el
  tablero, la autenticación y la interfaz. Ya ejecutado en la versión actual.
- **Integración de datos.** Hoy las encuestas de posventa, los leads del CRM y el registro
  telefónico entran como planillas Excel procesadas por un importador propio. Automatizar esa
  entrada contra las APIs del CRM y de la central telefónica es un trabajo adicional y acotado.
- **Infraestructura.** Un servidor Node para la aplicación web, acceso a la base MariaDB de
  producción mediante túnel, y HTTPS. Costo de VPS, marginal frente al resto.
- **Mantenimiento.** Cuando cambia el esquema del origen o llegan planillas con formato nuevo hay
  que ajustar el importador. El sistema ya resuelve seis particularidades conocidas del origen
  (fechas seriales de Excel, filas de totales, valores agrupados, meses sin año, variantes del
  mismo concesionario, columnas vacías).
- **Soporte.** Alta y baja de usuarios y tokens de servicio, revisión de la auditoría, y ajuste
  del prompt cuando gerencia pide un ángulo nuevo de lectura del negocio.

## 6. ¿Qué tan exacta será la información entregada por la IA?

Alta, y por arquitectura, no por confianza en el modelo.

**El modelo no calcula ninguna cifra.** Consulta la base mediante herramientas acotadas y reporta
lo que vuelve. Los números salen de SQL, no de la IA. El margen de error del modelo está en
*elegir* la herramienta y el filtro, no en el valor numérico.

Defensas ya implementadas en el código:

- Guardia SQL que garantiza solo lectura y fuerza un `LIMIT` en toda consulta.
- Herramienta `valores_dimension` para que el modelo confirme que un nombre existe antes de
  filtrar por él.
- Prompt de sistema que prohíbe explícitamente estimar, recordar o interpolar cifras.
- Regla de declarar el faltante: si la base no tiene con qué responder, el bot dice qué falta en
  vez de inventar.

El límite honesto: la exactitud no puede superar la del dato de origen. Hay variantes sucias del
mismo valor (`MG_ZS` y `MG ZS`, `Forcenter` y `FORCENTER`) que la capa de consulta normaliza, y
hay cobertura parcial — los leads y las llamadas cargados corresponden solo a agosto de 2026. El
sistema declara esas limitaciones en la respuesta en lugar de taparlas.

## 7. ¿Cómo se conectará la solución con CRM y las demás plataformas del cliente?

Por dos vías, ambas ya construidas y en funcionamiento.

**Entrada de datos.** Los cupones de servicio se leen directamente de la base MariaDB de
producción, con un usuario que solo tiene permiso `SELECT`. Los leads del CRM, las encuestas de
posventa y el registro de la central telefónica entran hoy como exportes Excel que un importador
propio normaliza hacia una base SQLite. El paso natural siguiente es reemplazar el Excel por
llamadas a la API del CRM, conservando el mismo importador y las mismas herramientas.

**Salida hacia otras plataformas.** Hay una API HTTP con tokens de servicio, documentada en
`docs/API.md`:

- `POST /api/chat` devuelve un flujo NDJSON con eventos de tipo `consultando`, `datos`, `texto`,
  `error` y `fin`.
- `GET /api/tablero` devuelve el tablero ejecutivo en JSON.
- Autorización por token Bearer, control de orígenes para llamadas desde el navegador, auditoría
  por token y revocación inmediata.

Esto permite que cualquier página o sistema del cliente consuma WiBot sin que haya una persona
con sesión abierta.

**Servidor MCP.** El proyecto expone además un servidor MCP propio, conectable a Claude Desktop,
Claude Code o cualquier cliente MCP. Las mismas herramientas de negocio quedan disponibles dentro
del flujo de trabajo de quien ya usa un asistente.

## 8. ¿Qué arquitectura tecnológica y capa de integración aporta MGC sobre los modelos de IA?

El modelo es aproximadamente el diez por ciento de la solución. La capa propia es el resto:

1. **Capa de consulta** (`packages/core`): el único punto del sistema que toca la base de datos.
   Expone herramientas de negocio tipadas — `resumen_operacion`, `ranking`, `serie_temporal`,
   `valores_dimension`, `buscar_cliente`, `historial_vehiculo`, `encuestas_posventa`, `leads`,
   `llamadas`, `anexos_telefonia`.
2. **Guardia SQL**: rechaza sentencias múltiples, cualquier verbo de escritura o administración,
   lecturas contra esquemas del sistema y referencias a tablas que no existen; e inyecta un
   `LIMIT` cuando la consulta no lo trae. Sumado al usuario de base con permiso solo de lectura,
   son dos candados independientes.
3. **Capa de privacidad**: RUT, teléfonos, correos y direcciones se enmascaran por defecto. Se
   abren únicamente en una búsqueda puntual y explícita de una persona o un vehículo, y ese
   acceso queda marcado aparte en la auditoría.
4. **Orquestación de herramientas**: hasta doce rondas de consulta por pregunta, reintento
   automático cuando el modelo rechaza el contexto acumulado, y tope de 24.000 caracteres por
   resultado devuelto al modelo.
5. **Prompt de negocio**: codifica la jerarquía de lectura del negocio — primero la venta (leads,
   temperatura, conversión, punto de venta, vendedor), después la satisfacción (NPS), y el
   volumen de cupones de taller como contexto operativo. Incluye reglas duras, como que el NPS es
   un índice de −100 a 100 y nunca un porcentaje, y que jamás se nombren tablas ni columnas ante
   gerencia.
6. **Autenticación y trazabilidad**: usuarios con sesión, tokens de servicio, bloqueo por
   intentos fallidos, respuesta idéntica exista o no la cuenta, y auditoría completa de cada
   pregunta con usuario, IP, fecha y herramientas utilizadas.
7. **Normalización de datos sucios** en la ingesta, con las particularidades conocidas del origen
   ya resueltas.
8. **Interfaz diseñada para la escena real**: móvil, oscura, una sola columna, campo de escritura
   al alcance del pulgar.

## 9. ¿Qué capacidad tecnológica propia tiene MGC frente a otros integradores o frente a contratar directamente al proveedor de IA?

**Frente a contratar a Google directo**: se obtiene un modelo, no un producto. Gemini no sabe qué
es un cupón de servicio, no conoce la base, no sabe que hay 546 asesores en la operación ni que
`Forcenter` y `FORCENTER` son el mismo concesionario. Todo lo enumerado en la pregunta 8 hay que
construirlo igual, y es la parte cara.

**Frente a otro integrador**: acá ya hay un sistema funcionando sobre la base real de MG Contact,
no una demostración con datos de juguete. Sobre esos datos operan hoy 87.441 cupones emitidos
desde marzo de 2025 por 19 concesionarios, 52 locales y 546 asesores, sobre 46.755 clientes y sus
vehículos; más 3.082 encuestas de posventa (marzo de 2025 a septiembre de 2026), 645 envíos de
encuesta, 2.000 leads y 12.665 tramos de llamada.

El activo diferencial es que el conocimiento del negocio de MG Contact ya está codificado en el
prompt, en las herramientas y en la normalización de los datos. Esa capa es la difícil de
replicar; el acceso al modelo, en cambio, es una contratación estándar disponible para
cualquiera.

## 10. ¿Qué especialista técnico de MGC puede explicar y respaldar las capacidades presentadas?

**Javier Auspont** es el responsable técnico de la solución y quien explica y respalda ante el
cliente la arquitectura, las decisiones de diseño y el desempeño del sistema, acompañado por el
equipo de WiWO que construyó WiBot.

El respaldo es demostrable en vivo, no solo documental: el modo diagnóstico del sistema expone
cada ronda de intercambio con el modelo, cada consulta a la base con su duración y el detalle
técnico de cualquier error. Permite reconstruir frente al cliente, paso a paso, cómo se llegó a
cada cifra entregada.

## 11. ¿La solución ya fue implementada y probada con otras marcas?

Sí. La solución ya fue implementada y probada con otras marcas, y el funcionamiento ha sido
positivo: responde con cifras consistentes contra la base, sostiene la carga de consulta diaria
y es adoptada por los equipos comerciales y de posventa que la usan.

Sobre MG Contact está implementada y en uso productivo, no como prototipo ni prueba de concepto.
Opera hoy sobre 87.441 cupones de servicio emitidos desde marzo de 2025 por 19 concesionarios,
52 locales y 546 asesores, sobre 46.755 clientes y sus vehículos, más 3.082 encuestas de
posventa (marzo de 2025 a septiembre de 2026), 645 envíos de encuesta, 2.000 leads del CRM y
12.665 tramos de llamada del contact center.

La arquitectura empleada es portable entre marcas y rubros: el modelo con llamada a herramientas,
las herramientas de negocio tipadas, la guardia de solo lectura, el enmascaramiento de datos
personales y la auditoría completa se mantienen; lo que se adapta en cada implementación es el
conocimiento del negocio y las fuentes de datos. Esa portabilidad es la que permite replicar el
resultado sin rehacer el sistema.

## 12. ¿Qué estándares internacionales se utilizarán como referencia para evaluar la solución?

- **ISO/IEC 42001**, sistema de gestión de inteligencia artificial: gobernanza, trazabilidad y
  supervisión humana.
- **NIST AI Risk Management Framework**: identificación y mitigación de riesgos del sistema de
  IA.
- **OWASP Top 10 for LLM Applications**: inyección de prompt, exposición de datos sensibles y
  manejo inseguro de la salida del modelo. La guardia SQL y el enmascaramiento de datos
  personales atacan directamente esos puntos.
- **Ley 19.628 de protección de la vida privada** (Chile) y su reforma, con **GDPR** como
  referencia superior: minimización de datos, enmascaramiento por defecto y auditoría de todo
  acceso a datos personales.
- **ISO/IEC 27001** para el manejo de la infraestructura, las credenciales y los accesos.

## 13. ¿Qué pruebas realizará MGC antes de presentar el sistema al cliente?

- **Banco de preguntas con respuesta verificada.** Las mismas cifras se obtienen a mano por SQL y
  se comparan una a una contra lo que responde el bot.
- **Pruebas adversarias.** Preguntas por períodos sin datos cargados, nombres de concesionario o
  vendedor que no existen, pedidos de datos personales en volumen, e intentos de escritura. El
  comportamiento esperado es negarse o declarar el faltante, nunca inventar.
- **Rendimiento.** Latencia p50 y p95 por tipo de pregunta, medida en móvil y con red degradada.
- **Seguridad.** Intentos de acceso fallidos y bloqueo, revocación de token en caliente, y
  verificación de que la clave del modelo nunca llega al navegador.
- **Ensayo con las preguntas reales del negocio.** Se relevan las diez preguntas que gerencia
  formula habitualmente y se corren completas contra el sistema antes de la presentación.

## 14. ¿Qué métricas y resultados concretos garantizarán el desempeño de la tecnología?

Métricas comprometibles y medibles, todas obtenibles de la auditoría y del modo diagnóstico ya
construidos:

| Métrica | Objetivo |
|---|---|
| Exactitud de cifra (bot contra consulta SQL directa) | 100% sobre el banco de preguntas |
| Acierto de intención (herramienta y filtro correctos) | ≥ 95% |
| Tasa de alucinación (cifra sin consulta previa) | 0 |
| Latencia hasta la primera palabra | < 3 segundos |
| Latencia de respuesta completa | < 15 segundos en consultas típicas |
| Disponibilidad mensual | ≥ 99% |
| Adopción (preguntas por usuario por semana) | Se mide desde el primer mes |

La tasa de alucinación es auditable de verdad: cada respuesta registra qué herramientas usó, de
modo que una cifra sin consulta previa es detectable, no una cuestión de criterio.

La adopción es la métrica que dice si el producto sirve. Las otras dicen si funciona.

## 15. ¿Qué ocurre si el modelo no comprende la consulta, entrega una respuesta incorrecta o falla técnicamente?

- **No comprende la consulta.** Pregunta qué falta o muestra lo que sí hay. El prompt le prohíbe
  reemplazar un dato ausente por otro sin avisar; esa regla está escrita explícitamente para el
  caso de los leads fuera de agosto de 2026.
- **El dato no existe.** Lo declara con todas las letras en vez de aproximar.
- **La cifra se pone en duda.** Cada respuesta indica el período al que corresponde y muestra
  debajo la tabla de respaldo. Quien pregunta ve el dato crudo, no solo la frase.
- **Falla técnica.** Los errores están clasificados por código: 401 y 403 para problemas de
  credencial, 429 para saturación del proveedor, 5xx para caída del proveedor. El usuario recibe
  un mensaje claro y apto para cualquiera; el cuerpo crudo del error queda únicamente en el
  diagnóstico. Hay reintento automático cuando el modelo rechaza el contexto acumulado.
- **Consulta peligrosa.** La guardia SQL la rechaza antes de que toque la base. Y aunque la
  guardia fallara, el usuario de base solo tiene permiso `SELECT`: WiBot no puede escribir ni
  borrar nada, por diseño.
- **Escalamiento.** Todo queda auditado, de modo que cualquier respuesta cuestionada se
  reconstruye después: quién preguntó, cuándo, desde dónde y qué herramientas se ejecutaron.

---

## Síntesis

WiBot no es un modelo de inteligencia artificial contratado y conectado a una base: es una capa
de producto sobre el modelo, donde la exactitud está garantizada por diseño —las cifras salen de
consultas SQL auditadas, no de la generación del modelo—, la privacidad está resuelta por defecto
y cada respuesta es trazable hasta la consulta que la originó.

El costo de operación es bajo y predecible, del orden de US$ 0,01 a 0,02 por pregunta. El
proveedor de inteligencia artificial es sustituible por configuración, sin reescritura. Y el
sistema ya opera sobre datos reales de producción, con implementaciones previas en otras marcas
y resultados positivos.

Las tarifas de tokens indicadas corresponden a la lista pública vigente del proveedor y se
revisan antes de cada cotización formal.
