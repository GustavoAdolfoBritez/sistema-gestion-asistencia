import { toast } from 'sonner';

/** API en Heroku; usada en build de producción si no hay VITE_API_URL (p. ej. en Vercel). */
const PRODUCTION_API_BASE_URL = 'https://gestion-asistencias-ung-623e820b6ba1.herokuapp.com/api';

function resolveApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '');
  }
  if (import.meta.env.PROD) {
    return PRODUCTION_API_BASE_URL;
  }
  return 'http://localhost:4000/api';
}

export const API_BASE_URL = resolveApiBaseUrl();
export const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');
const TOKEN_KEYS = ['accessToken', 'token', 'authToken'];
const USER_STORAGE_KEY = 'currentUser';

/** Disparado en 401 (token ausente, inválido o expirado); `App` escucha y cierra sesión. */
export const UNAUTHORIZED_EVENT = 'app:unauthorized';

const SESSION_EXPIRED_TOAST_ID = 'session-expired';

/** Error lanzado por `apiFetch` ante 401; no volver a mostrar toast en cada `catch` de la página. */
export class SessionExpiredError extends Error {
  readonly sessionExpired = true;

  constructor(message = 'Tu sesión expiró. Iniciá sesión de nuevo.') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

export function isSessionExpiredError(error: unknown): boolean {
  return error instanceof SessionExpiredError;
}

let unauthorizedEventPending = false;

export function notifySessionExpired(): void {
  if (unauthorizedEventPending) return;
  unauthorizedEventPending = true;
  window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
  queueMicrotask(() => {
    unauthorizedEventPending = false;
  });
}

/** Tras login exitoso, permite volver a detectar una nueva expiración. */
export function resetSessionExpiredState(): void {
  unauthorizedEventPending = false;
}

/** Un solo toast aunque varias peticiones fallen con 401 a la vez. */
function showSessionExpiredToast(message: string): void {
  toast.error(message, { id: SESSION_EXPIRED_TOAST_ID });
}

/** Toast de error de API; omite duplicar el mensaje si la sesión ya expiró. */
export function toastApiError(error: unknown, fallback: string): void {
  if (isSessionExpiredError(error)) return;
  const msg = error instanceof Error ? error.message : fallback;
  toast.error(msg);
}

/** Limpia tokens y perfil en el navegador (cierre local, CU-03). */
export function clearLocalSession(): void {
  for (const key of TOKEN_KEYS) {
    localStorage.removeItem(key);
  }
  localStorage.removeItem('refreshToken');
  localStorage.removeItem(USER_STORAGE_KEY);
}

/**
 * Revoca refresh en servidor y registra auditoría logout.
 * No usa apiFetch para evitar toast de sesión expirada durante el cierre.
 */
export async function logoutOnServer(): Promise<void> {
  const refreshToken = localStorage.getItem('refreshToken')?.trim();
  if (!refreshToken) return;

  const accessToken = TOKEN_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  try {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // El cierre local sigue aunque falle la red (RN2 spec CU-03).
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = path.startsWith('/') ? `${API_BASE_URL}${path}` : `${API_BASE_URL}/${path}`;
  const headers = new Headers(options.headers ?? {});

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const token = TOKEN_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    const payload = await response.json().catch(() => ({}));
    const mensaje =
      typeof payload?.mensaje === 'string' && payload.mensaje.trim()
        ? payload.mensaje
        : 'Tu sesión expiró. Iniciá sesión de nuevo.';
    notifySessionExpired();
    showSessionExpiredToast(mensaje);
    throw new SessionExpiredError(mensaje);
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.mensaje ?? 'Error de comunicación con el servidor');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
