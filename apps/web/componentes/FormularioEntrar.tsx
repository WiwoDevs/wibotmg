'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { OrbePensante } from './OrbePensante';
import { IconoAlerta, IconoEnviar } from './Iconos';
import { useIdioma } from './ProveedorIdioma';
import { SelectorIdioma } from './SelectorIdioma';
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
  const t = useIdioma().textos.entrar;
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
        setError(datos.error ?? t.errorEntrar);
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
      setError(t.errorConexion);
    } finally {
      setEnviando(false);
    }
  }

  async function cambiarClave(evento: React.FormEvent): Promise<void> {
    evento.preventDefault();
    setError(null);

    if (nueva !== repetida) {
      setError(t.noCoinciden);
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
        setError(datos.error ?? t.errorCambiar);
        return;
      }

      router.replace(volver);
      router.refresh();
    } catch {
      setError(t.errorConexion);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className={estilos.pantalla}>
      <div className={estilos.idioma}>
        <SelectorIdioma />
      </div>
      <div className={estilos.tarjeta}>
        <div className={estilos.marca}>
          <OrbePensante tamano={56} estado={enviando ? 'generando' : 'reposo'} />
          <div>
            <h1 className={estilos.titulo}>WiWO Me</h1>
            <p className={estilos.bajada}>{t.bajada}</p>
          </div>
        </div>

        {paso === 'entrar' ? (
          <form className={estilos.formulario} onSubmit={iniciarSesion}>
            <p className={estilos.introduccion}>{t.introduccionEntrar}</p>

            <label className={estilos.campo}>
              <span className={estilos.etiqueta}>{t.correo}</span>
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
              <span className={estilos.etiqueta}>{t.contrasena}</span>
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
              {enviando ? t.verificando : t.entrar}
              <IconoEnviar tamano={16} className={estilos.botonFlecha} />
            </button>
          </form>
        ) : (
          <form className={estilos.formulario} onSubmit={cambiarClave}>
            <p className={estilos.introduccion}>{t.introduccionCambiar}</p>

            {contrasena === '' ? (
              <label className={estilos.campo}>
                <span className={estilos.etiqueta}>{t.contrasenaActual}</span>
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
              <span className={estilos.etiqueta}>{t.contrasenaNueva}</span>
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
              <span className={estilos.pista}>{t.largoMinimo(largoMinimo)}</span>
            </label>

            <label className={estilos.campo}>
              <span className={estilos.etiqueta}>{t.repetir}</span>
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
              {enviando ? t.guardando : t.guardarYEntrar}
              <IconoEnviar tamano={16} className={estilos.botonFlecha} />
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
