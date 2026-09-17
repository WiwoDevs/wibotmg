'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { OrbePensante } from './OrbePensante';
import { IconoAlerta, IconoEnviar } from './Iconos';
import estilos from './entrar.module.css';

interface Props {
  volver: string;
  largoMinimo: number;
  /** Cuando es true, la pantalla arranca pidiendo una contraseña nueva. */
  cambioObligatorio: boolean;
  correoEnSesion?: string;
}

/**
 * Pantalla de entrada a WiWO Me. Cubre los dos momentos del acceso: iniciar
 * sesión y, si la cuenta todavía tiene la contraseña temporal, cambiarla.
 */
export function FormularioEntrar({ volver, largoMinimo, cambioObligatorio, correoEnSesion }: Props) {
  const router = useRouter();
  const [paso, setPaso] = useState<'entrar' | 'cambiar'>(cambioObligatorio ? 'cambiar' : 'entrar');
  const [correo, setCorreo] = useState(correoEnSesion ?? '');
  const [contrasena, setContrasena] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function iniciarSesion(evento: React.FormEvent): Promise<void> {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const respuesta = await fetch('/api/sesion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo, contrasena }),
      });
      const datos = (await respuesta.json()) as {
        error?: string;
        usuario?: { debeCambiar: boolean };
      };

      if (!respuesta.ok) {
        setError(datos.error ?? 'No se pudo iniciar sesión.');
        return;
      }

      if (datos.usuario?.debeCambiar) {
        setPaso('cambiar');
        setNueva('');
        setRepetida('');
        return;
      }

      router.replace(volver);
      router.refresh();
    } catch {
      setError('No se pudo contactar al servidor. Revisá tu conexión.');
    } finally {
      setEnviando(false);
    }
  }

  async function cambiarClave(evento: React.FormEvent): Promise<void> {
    evento.preventDefault();
    setError(null);

    if (nueva !== repetida) {
      setError('Las dos contraseñas nuevas no coinciden.');
      return;
    }

    setEnviando(true);
    try {
      const respuesta = await fetch('/api/sesion/clave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actual: contrasena, nueva }),
      });
      const datos = (await respuesta.json()) as { error?: string };

      if (!respuesta.ok) {
        setError(datos.error ?? 'No se pudo cambiar la contraseña.');
        return;
      }

      router.replace(volver);
      router.refresh();
    } catch {
      setError('No se pudo contactar al servidor. Revisá tu conexión.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className={estilos.pantalla}>
      <div className={estilos.tarjeta}>
        <div className={estilos.marca}>
          <OrbePensante tamano={56} estado={enviando ? 'generando' : 'reposo'} />
          <div>
            <h1 className={estilos.titulo}>WiWO Me</h1>
            <p className={estilos.bajada}>Thinking Orb · Inteligencia ejecutiva</p>
          </div>
        </div>

        {paso === 'entrar' ? (
          <form className={estilos.formulario} onSubmit={iniciarSesion}>
            <p className={estilos.introduccion}>
              Esta base tiene datos de clientes y de la operación. Entrá con la cuenta que te dieron.
            </p>

            <label className={estilos.campo}>
              <span className={estilos.etiqueta}>Correo</span>
              <input
                className={estilos.entrada}
                type="email"
                name="correo"
                value={correo}
                autoComplete="username"
                autoFocus
                required
                onChange={(evento) => setCorreo(evento.target.value)}
              />
            </label>

            <label className={estilos.campo}>
              <span className={estilos.etiqueta}>Contraseña</span>
              <input
                className={estilos.entrada}
                type="password"
                name="contrasena"
                value={contrasena}
                autoComplete="current-password"
                required
                onChange={(evento) => setContrasena(evento.target.value)}
              />
            </label>

            {error ? (
              <p className={estilos.error} role="alert">
                <IconoAlerta tamano={16} />
                {error}
              </p>
            ) : null}

            <button className={estilos.boton} type="submit" disabled={enviando}>
              {enviando ? 'Verificando…' : 'Entrar'}
              <IconoEnviar tamano={16} className={estilos.botonFlecha} />
            </button>
          </form>
        ) : (
          <form className={estilos.formulario} onSubmit={cambiarClave}>
            <p className={estilos.introduccion}>
              Tu cuenta todavía usa la contraseña temporal. Elegí una propia para seguir.
            </p>

            {contrasena === '' ? (
              <label className={estilos.campo}>
                <span className={estilos.etiqueta}>Contraseña actual</span>
                <input
                  className={estilos.entrada}
                  type="password"
                  value={contrasena}
                  autoComplete="current-password"
                  required
                  onChange={(evento) => setContrasena(evento.target.value)}
                />
              </label>
            ) : null}

            <label className={estilos.campo}>
              <span className={estilos.etiqueta}>Contraseña nueva</span>
              <input
                className={estilos.entrada}
                type="password"
                value={nueva}
                autoComplete="new-password"
                minLength={largoMinimo}
                required
                autoFocus
                onChange={(evento) => setNueva(evento.target.value)}
              />
              <span className={estilos.pista}>Mínimo {largoMinimo} caracteres.</span>
            </label>

            <label className={estilos.campo}>
              <span className={estilos.etiqueta}>Repetila</span>
              <input
                className={estilos.entrada}
                type="password"
                value={repetida}
                autoComplete="new-password"
                minLength={largoMinimo}
                required
                onChange={(evento) => setRepetida(evento.target.value)}
              />
            </label>

            {error ? (
              <p className={estilos.error} role="alert">
                <IconoAlerta tamano={16} />
                {error}
              </p>
            ) : null}

            <button className={estilos.boton} type="submit" disabled={enviando}>
              {enviando ? 'Guardando…' : 'Guardar y entrar'}
              <IconoEnviar tamano={16} className={estilos.botonFlecha} />
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
