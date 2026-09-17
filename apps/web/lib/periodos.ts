/** Un período con nombre, para el selector del tablero. */
export interface OpcionPeriodo {
  clave: string;
  etiqueta: string;
  desde: string;
  hasta: string;
}

function dosDigitos(valor: number): string {
  return String(valor).padStart(2, '0');
}

/** Último día del mes indicado, en formato YYYY-MM-DD. */
function finDeMes(anio: number, mes: number): string {
  const fin = new Date(Date.UTC(anio, mes, 0));
  return `${anio}-${dosDigitos(mes)}-${dosDigitos(fin.getUTCDate())}`;
}

/**
 * Arma las opciones del selector: los últimos meses hacia atrás desde la fecha
 * indicada, más el año en curso.
 *
 * @param hoyIso fecha de referencia YYYY-MM-DD.
 * @param cantidadMeses cuántos meses ofrecer.
 */
export function construirPeriodos(hoyIso: string, cantidadMeses = 8): OpcionPeriodo[] {
  const [anioHoy, mesHoy] = hoyIso.split('-').map(Number);
  const nombres = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];

  const opciones: OpcionPeriodo[] = [];
  for (let atras = 0; atras < cantidadMeses; atras += 1) {
    const fecha = new Date(Date.UTC(anioHoy ?? 2026, (mesHoy ?? 1) - 1 - atras, 1));
    const anio = fecha.getUTCFullYear();
    const mes = fecha.getUTCMonth() + 1;
    opciones.push({
      clave: `${anio}-${dosDigitos(mes)}`,
      etiqueta: `${nombres[mes - 1]} ${anio}`,
      desde: `${anio}-${dosDigitos(mes)}-01`,
      hasta: finDeMes(anio, mes),
    });
  }

  opciones.push({
    clave: `anio-${anioHoy}`,
    etiqueta: `año ${anioHoy}`,
    desde: `${anioHoy}-01-01`,
    hasta: hoyIso,
  });

  return opciones;
}

/**
 * Elige el período que se muestra al abrir: el último mes cerrado con datos en
 * todas las fuentes. Se prefiere sobre el mes en curso porque los leads y la
 * telefonía se cargan por planilla y el mes corriente suele estar vacío.
 */
export const PERIODO_POR_DEFECTO = '2026-08';
