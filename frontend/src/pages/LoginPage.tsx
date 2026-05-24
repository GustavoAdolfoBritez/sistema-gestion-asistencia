import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import type { SessionUser } from '../utils/rbac';
import { resetSessionExpiredState } from '../utils/api';

interface LoginPageProps {
  onLoginSuccess?: (usuario?: SessionUser | null) => void;
  onOpenLegalPage?: (page: 'terminos' | 'privacidad' | 'soporte') => void;
}

interface LoginResponse {
  token: string;
  refreshToken: string;
  usuario?: SessionUser;
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';
const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');
const LOGIN_LOGO_URL = `${API_ORIGIN}/assets/ung-logo.jpg`;

export function LoginPage({ onLoginSuccess, onOpenLegalPage }: LoginPageProps) {
  const [rememberMe, setRememberMe] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    const storedIdentifier = localStorage.getItem('rememberedIdentifier');
    if (storedIdentifier) {
      setIdentifier(storedIdentifier);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identificador: identifier, password }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.mensaje ?? 'Credenciales inválidas');
        }
        return (await response.json()) as LoginResponse;
      })
      .then((data) => {
        resetSessionExpiredState();
        localStorage.setItem('accessToken', data.token);
        localStorage.setItem('token', data.token);
        localStorage.setItem('refreshToken', data.refreshToken);
        if (data.usuario) {
          localStorage.setItem('currentUser', JSON.stringify(data.usuario));
        } else {
          localStorage.removeItem('currentUser');
        }
        if (rememberMe) {
          localStorage.setItem('rememberedIdentifier', identifier);
        } else {
          localStorage.removeItem('rememberedIdentifier');
        }
        onLoginSuccess?.(data.usuario);
      })
      .catch((err: unknown) => {
        const mensaje = err instanceof Error ? err.message : 'No se pudo iniciar sesión';
        setError(mensaje);
      })
      .finally(() => setLoading(false));
  };

  return (
    <div
      className="min-h-screen w-full bg-slate-900 bg-cover bg-center"
      style={{
        backgroundImage: "url('/login-bg.svg')",
      }}
    >
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <main className="w-full max-w-xl overflow-hidden rounded-2xl bg-slate-100 shadow-2xl">
          <div className="px-10 pb-12 pt-12">
            <div className="pb-7 text-center">
              <img src={LOGIN_LOGO_URL} alt="Logo institucional" className="mx-auto mb-5 h-auto w-36 rounded-xl" loading="eager" />
              <h1 className="text-4xl font-bold text-gray-800">Sistema de control de asistencia academica</h1>
            </div>
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="usuario" className="mb-1 block text-sm font-medium text-gray-700">
                  Usuario
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
                    </svg>
                  </div>
                  <input
                    id="usuario"
                    className="block w-full rounded-lg border border-gray-300 py-3.5 pl-10 pr-3 text-base text-gray-900 placeholder-gray-400 transition-all duration-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Usuario o correo"
                    type="text"
                    autoComplete="username"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                    Contraseña
                  </label>
                </div>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path
                        fillRule="evenodd"
                        d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <input
                    id="password"
                    className="block w-full rounded-lg border border-gray-300 py-3.5 pl-10 pr-3 text-base text-gray-900 placeholder-gray-400 transition-all duration-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Ingresa tu contraseña"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="flex items-center">
                <input
                  id="remember-me"
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-600">
                  Recordarme
                </label>
              </div>

              <button
                type="submit"
                className="flex w-full justify-center rounded-lg border border-transparent bg-blue-700 px-4 py-3.5 text-base font-bold text-white shadow-md transition-all duration-200 hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={loading}
              >
                {loading ? 'Ingresando...' : 'Ingresar al sistema'}
              </button>
            </form>

            {error ? <p className="mt-4 text-center text-sm text-rose-600">{error}</p> : null}
          </div>

          <footer className="border-t border-gray-100 bg-slate-100 px-10 py-5 text-center">
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-gray-500">
              <button type="button" onClick={() => onOpenLegalPage?.('terminos')} className=" hover:text-gray-700">
                Términos y condiciones
              </button>
              <button type="button" onClick={() => onOpenLegalPage?.('privacidad')} className=" hover:text-gray-700">
                Política de privacidad
              </button>
              <button type="button" onClick={() => onOpenLegalPage?.('soporte')} className=" hover:text-gray-700">
                Soporte
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-400">© {currentYear} Universidad Nihon Gakko. Todos los derechos reservados.</p>
          </footer>
        </main>
      </div>
    </div>
  );
}
