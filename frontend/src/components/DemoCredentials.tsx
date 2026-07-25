/**
 * Panel de acceso rápido para el entorno de demostración (Sandbox).
 *
 * Solo se muestra si la variable de entorno `VITE_IS_DEMO=true` está activa
 * (ver frontend/env.example). En el sistema real (producción de la
 * universidad) esta variable no debe definirse, por lo que el componente
 * no renderiza nada.
 *
 * Los usuarios/contraseñas mostrados aquí corresponden exclusivamente a la
 * base de datos de demo (ver database/seed_demo.sql) y no otorgan acceso a
 * ningún sistema productivo real.
 */

const DEMO_PASSWORD = 'Demo123456!';

interface DemoUser {
  role: string;
  label: string;
  description: string;
  identifier: string;
  icon: string;
}

const DEMO_USERS: DemoUser[] = [
  {
    role: 'admin',
    label: 'Administrador General',
    description: 'Acceso total al sistema',
    identifier: 'admin.demo@ung.edu.py',
    icon: '👑',
  },
  {
    role: 'secretaria',
    label: 'Secretaría Académica',
    description: 'Gestión académica y de usuarios',
    identifier: 'secretaria.demo@ung.edu.py',
    icon: '🗂️',
  },
  {
    role: 'docente',
    label: 'Docente',
    description: 'Planilla de asistencia y cronograma',
    identifier: 'docente.demo@ung.edu.py',
    icon: '🧑‍🏫',
  },
];

interface DemoCredentialsProps {
  onSelect: (identifier: string, password: string) => void;
}

export function DemoCredentials({ onSelect }: DemoCredentialsProps) {
  const isDemo = import.meta.env.VITE_IS_DEMO === 'true';
  if (!isDemo) return null;

  return (
    <div
      className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-left shadow-sm max-lg:mb-4 max-lg:p-3"
      role="region"
      aria-label="Accesos rápidos de demostración"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="text-lg leading-none" aria-hidden="true">
          🧪
        </span>
        <p className="text-sm font-semibold text-amber-900 max-lg:text-xs">
          Entorno de demostración — elegí un rol para autocompletar el acceso
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {DEMO_USERS.map((user) => (
          <button
            key={user.role}
            type="button"
            onClick={() => onSelect(user.identifier, DEMO_PASSWORD)}
            className="flex flex-col items-center gap-0.5 rounded-lg border border-amber-300 bg-white px-3 py-2 text-center shadow-sm transition-colors hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1"
            title={`Autocompletar como ${user.label} (${user.identifier})`}
          >
            <span className="text-base leading-none" aria-hidden="true">
              {user.icon}
            </span>
            <span className="text-xs font-semibold text-amber-900 max-lg:text-[11px]">{user.label}</span>
            <span className="text-[10px] text-amber-700 max-lg:text-[9px]">{user.description}</span>
          </button>
        ))}
      </div>

      <p className="mt-2 text-[11px] leading-snug text-amber-700 max-lg:text-[10px]">
        Datos 100% ficticios generados para pruebas. No representan alumnos, docentes ni información real de
        ninguna institución.
      </p>
    </div>
  );
}
