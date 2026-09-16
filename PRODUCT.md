# WiBot

## Qué es

Una conversación con la operación. WiBot responde en lenguaje natural preguntas sobre la base
de cupones de servicio de MG Contact: 87.441 cupones emitidos desde marzo de 2025 por 19
concesionarios, 52 locales y 546 asesores, sobre 46.755 clientes y sus vehículos MG.

Sustituye el circuito actual —pedirle un reporte a alguien, esperar el Excel, descubrir que
faltaba un filtro— por una pregunta escrita y un número con su contexto.

## Para quién

Gerencia comercial y de posventa de MG Contact, y los jefes de servicio de cada concesionario.
Gente que conoce el negocio al dedillo y no tiene por qué conocer SQL. Consultan de pie, entre
reuniones, muchas veces desde el teléfono.

## Qué tiene que lograr

- Responder "cómo vamos" con una cifra fiable y el período al que corresponde, en segundos.
- Comparar: asesores, locales, concesionarios, modelos, meses.
- Llegar al caso puntual cuando hace falta: un cliente, una patente, un VIN.
- No mentir nunca. Si el dato no está o está sucio, decirlo.

## Qué no es

- No es un panel de control con métricas fijas: la pregunta la pone la persona.
- No es un CRM ni un sistema de gestión: WiBot solo lee, jamás escribe en la base.
- No es una herramienta de marketing masivo: los datos personales están restringidos por diseño.

## Restricciones

- **Solo lectura.** El usuario de base de datos tiene únicamente permiso SELECT y toda consulta
  pasa por una guardia que rechaza cualquier escritura.
- **Privacidad.** RUT, teléfonos, correos y direcciones se enmascaran salvo en una búsqueda
  puntual y explícita de una persona o un vehículo.
- **Datos sucios.** El origen trae variantes del mismo valor (`MG_ZS` y `MG ZS`) y basura en
  `TipoEvento`. La capa de consulta normaliza; la interfaz no finge una limpieza que no hay.
- **Modelo.** Gemini a través de su API compatible con OpenAI. La clave nunca llega al navegador.

## Escena de uso

Un jefe de servicio, a las 8 de la mañana, en el taller, con el teléfono en una mano. Luz
ambiente baja, pantalla a brillo medio, una sola mano libre. De ahí sale la interfaz: oscura,
de una sola columna, con el campo de escritura al alcance del pulgar.
