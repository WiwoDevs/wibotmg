export { obtenerConfiguracionAcceso } from './config.js';
export type { ConfiguracionAcceso } from './config.js';

export { obtenerBaseAcceso, cerrarBaseAcceso } from './base.js';

export { derivarContrasena, verificarContrasena, generarContrasenaTemporal } from './contrasenas.js';

export {
  crearUsuario,
  buscarPorCorreo,
  buscarPorId,
  listarUsuarios,
  hayUsuariosActivos,
  verificarCredenciales,
  cambiarContrasena,
  cambiarActivacion,
  normalizarCorreo,
  esCorreoValido,
} from './usuarios.js';
export type { Usuario } from './usuarios.js';

export { NOMBRE_COOKIE, crearSesion, validarSesion, cerrarSesion, purgarSesionesVencidas } from './sesiones.js';
export type { SesionCreada } from './sesiones.js';

export { revisarBloqueo, registrarIntento } from './intentos.js';
export type { EstadoBloqueo } from './intentos.js';

export { registrarConsulta, listarAuditoria } from './auditoria.js';
export type { RegistroAuditoria } from './auditoria.js';

export {
  PREFIJO_TOKEN,
  crearTokenServicio,
  buscarTokenPorNombre,
  validarTokenServicio,
  origenAutorizado,
  origenConocido,
  listarTokensServicio,
  revocarTokenServicio,
  normalizarNombreToken,
  normalizarOrigen,
} from './tokens.js';
export type { TokenServicio } from './tokens.js';
