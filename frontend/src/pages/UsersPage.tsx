import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, SyntheticEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AppSidebar } from '../components/AppSidebar';
import { UserAvatar } from '../components/ui/user-avatar';
import { SkeletonRow } from '../components/ui/skeleton';
import { AppSelect } from '../components/ui/app-select';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { generarYAbrirPdf, apiFetch } from '../utils/api';
import { formatDateOnly } from '../utils/datetime';
import { appPath } from '../navigation/app-paths';
import { readStoredUser } from '../utils/session-user';
import { etiquetaRol, etiquetasRoles } from '../utils/role-labels';

/** Checkbox de carreras: círculo y punto como rol/facultad (ver .scope-radio-dot en index.css). */
const SCOPE_CARRERA_CHOICE_CLASS =
  'scope-radio-dot size-5 rounded-full border-slate-600 text-primary focus:ring-primary';

function normalizeRolSesion(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Administrador General y Secretaría Académica (alineado con API DELETE /usuarios). */
function puedeEliminarUsuariosSesion(roles: string[] | undefined): boolean {
  const set = new Set((roles ?? []).map(normalizeRolSesion));
  return set.has('administrador general') || set.has('secretaria academica');
}

function usuarioCoincideFiltroRol(roles: string[], roleFilter: string): boolean {
  if (roleFilter === 'all') return true;
  if (roleFilter === 'Administrador General') {
    return roles.some((rol) => rol.toLowerCase().includes('admin'));
  }
  if (roleFilter === 'Coordinador de Facultad') {
    return usuarioTieneCoordinacionFacultad(roles);
  }
  return roles.includes(roleFilter);
}

function roleFilterToExportBody(
  roleFilter: string
): { rol?: string; rolCategoria?: 'admins' | 'secretaria' | 'directores' | 'docentes' } {
  if (roleFilter === 'all') return {};
  if (roleFilter === 'Administrador General') return { rolCategoria: 'admins' };
  if (roleFilter === 'Secretaría Académica') return { rolCategoria: 'secretaria' };
  if (roleFilter === 'Docente') return { rolCategoria: 'docentes' };
  if (roleFilter === 'Coordinador de Facultad') return { rolCategoria: 'directores' };
  return { rol: roleFilter };
}

type EstadoUsuario = 'activo' | 'inactivo' | 'suspendido';

type PersonaTipo = 'docente';

interface PersonaInfo {
  tipo: PersonaTipo;
  id: string;
  legajo?: string | null;
  tituloAcademico?: string | null;
}

interface UsuarioScope {
  facultad_id: number | null;
  facultad_nombre: string | null;
  carrera_id: number | null;
  carrera_nombre: string | null;
}

interface Usuario {
  id: string;
  nombres: string;
  apellidos: string;
  email: string;
  usuario: string;
  telefono: string | null;
  estado: EstadoUsuario;
  roles: string[];
  creadoEn: string;
  actualizadoEn: string;
  permisos: PermisosEspeciales;
  persona?: PersonaInfo | null;
  scopes?: UsuarioScope[];
}

interface Facultad {
  id: number;
  nombre: string;
}

interface Carrera {
  id: number;
  nombre: string;
  facultad_id: number;
}

interface UsuariosResponse {
  total: number;
  datos: Usuario[];
}

interface CreateUserPayload {
  nombres: string;
  apellidos: string;
  email: string;
  usuario?: string;
  telefono?: string;
  password: string;
  roles: string[];
  estado?: EstadoUsuario;
  persona?: { tipo: 'docente'; id: string };
  permisos?: PermisosEspeciales;
  scope?: { facultad_ids?: number[]; carrera_ids?: number[] };
}

interface EditableUserState {
  nombres: string;
  apellidos: string;
  email: string;
  usuario: string;
  telefono: string;
  estado: EstadoUsuario;
  roles: string[];
}

interface PermisosEspeciales {
  aprobarHorarios: boolean;
  gestionarMatriculas: boolean;
  accesoBitacoras: boolean;
}

interface ResetPasswordResponse {
  passwordTemporal: string;
}

type UsersAction = 'list' | 'create';

interface UsersPageProps {
  onLogout?: () => void;
  requestedAction?: UsersAction;
}

const ESTADO_USUARIO_OPTIONS: { value: EstadoUsuario; label: string }[] = [
  { value: 'activo', label: 'Activo' },
  { value: 'inactivo', label: 'Inactivo' },
  { value: 'suspendido', label: 'Suspendido' },
];

const ROLE_OPTIONS = [
  {
    value: 'Administrador General',
    label: 'Administrador General',
    description: 'Configuración avanzada y control total.',
    icon: 'admin_panel_settings',
  },
  {
    value: 'Secretaría Académica',
    label: 'Secretaría Académica',
    description: 'Gestión de alumnos, inscripciones e importaciones.',
    icon: 'support_agent',
  },
  {
    value: 'Docente',
    label: 'Docente',
    description: 'Registro de asistencias y planillas de curso.',
    icon: 'school',
  },
  {
    value: 'Coordinador de Facultad',
    label: 'Coordinador de Facultad',
    description: 'Gestión académica y reportes por facultad.',
    icon: 'domain',
  },
  {
    value: 'Jefe de Carrera',
    label: 'Jefe de Carrera',
    description: 'Gestión académica y reportes por carrera.',
    icon: 'manage_accounts',
  },
];

/** Nombres posibles del rol de coordinación de facultad en BD (renombres / variantes). */
/** Nombres históricos en BD; el vigente es «Coordinador de Facultad». */
const ROLES_COORDINACION_FACULTAD_ALCANCE = new Set([
  'Coordinador de Facultad',
  'Coordinador/a de Facultad',
  'Coordinadora de Facultad',
]);

function esRolCoordinacionFacultad(rol: string | undefined): boolean {
  if (!rol) return false;
  return ROLES_COORDINACION_FACULTAD_ALCANCE.has(rol);
}

function usuarioTieneCoordinacionFacultad(roles: string[]): boolean {
  return roles.some(esRolCoordinacionFacultad);
}

function primaryRoleSelection(roles: string[]): string[] {
  const canon = etiquetasRoles(roles);
  if (!canon.length) return [];
  for (const opt of ROLE_OPTIONS) {
    if (canon.includes(opt.value)) return [opt.value];
  }
  return [canon[0]];
}

function scopesFromApiToFormState(scopes?: UsuarioScope[]): { facultadIds: number[]; carreraIds: number[] } {
  if (!scopes?.length) return { facultadIds: [], carreraIds: [] };
  const facultadIds = [
    ...new Set(scopes.map((s) => s.facultad_id).filter((id): id is number => id != null)),
  ];
  const carreraIds = [...new Set(scopes.map((s) => s.carrera_id).filter((id): id is number => id != null))];
  return { facultadIds, carreraIds };
}

function normalizedScopePayload(facultadIds: number[], carreraIds: number[]) {
  return {
    facultad_ids: [...new Set(facultadIds)].sort((a, b) => a - b),
    carrera_ids: [...new Set(carreraIds)].sort((a, b) => a - b),
  };
}

function scopePayloadMatchesUser(
  facultadIds: number[],
  carreraIds: number[],
  scopes: UsuarioScope[] | undefined
): boolean {
  const fromDb = scopesFromApiToFormState(scopes);
  const a = normalizedScopePayload(fromDb.facultadIds, fromDb.carreraIds);
  const b = normalizedScopePayload(facultadIds, carreraIds);
  return a.facultad_ids.join(',') === b.facultad_ids.join(',') && a.carrera_ids.join(',') === b.carrera_ids.join(',');
}

function arraysAreEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
}

function formatName(usuario: Usuario | EditableUserState): string {
  return `${usuario.nombres} ${usuario.apellidos}`.trim();
}

export function UsersPage({ onLogout, requestedAction = 'list' }: UsersPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [users, setUsers] = useState<Usuario[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | EstadoUsuario>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditableUserState | null>(null);
  const [saving, setSaving] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [puedeEliminarUsuario] = useState(() => puedeEliminarUsuariosSesion(readStoredUser()?.roles));
  const [editScopeFacultadIds, setEditScopeFacultadIds] = useState<number[]>([]);
  const [editScopeCarreraIds, setEditScopeCarreraIds] = useState<number[]>([]);
  const [editFacultades, setEditFacultades] = useState<Facultad[]>([]);
  const [editCarreras, setEditCarreras] = useState<Carrera[]>([]);
  const autoEditRef = useRef(false);

  const loadUsers = useCallback(async (focusId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<UsuariosResponse>('/usuarios');
      const lista = data?.datos ?? [];
      setUsers(lista);
      setSelectedUserId((current) => {
        if (focusId) return focusId;
        if (current && lista.some((item) => item.id === current)) {
          return current;
        }
        return null;
      });
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'No se pudieron cargar los usuarios';
      setError(mensaje);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (requestedAction === 'create') {
      setIsCreateOpen(true);
    } else {
      setIsCreateOpen(false);
    }
  }, [requestedAction]);

  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;

  const hydrateDraftFromSelected = useCallback(() => {
    if (!selectedUser) {
      setDraft(null);
      setEditScopeFacultadIds([]);
      setEditScopeCarreraIds([]);
      return;
    }
    const fromScopes = scopesFromApiToFormState(selectedUser.scopes);
    setEditScopeFacultadIds(fromScopes.facultadIds);
    setEditScopeCarreraIds(fromScopes.carreraIds);
    setDraft({
      nombres: selectedUser.nombres,
      apellidos: selectedUser.apellidos,
      email: selectedUser.email,
      usuario: selectedUser.usuario,
      telefono: selectedUser.telefono ?? '',
      estado: selectedUser.estado,
      roles: primaryRoleSelection(selectedUser.roles),
    });
  }, [selectedUser]);

  useEffect(() => {
    hydrateDraftFromSelected();
    if (autoEditRef.current && selectedUser) {
      setIsEditing(true);
    } else {
      setIsEditing(false);
    }
    autoEditRef.current = false;
  }, [hydrateDraftFromSelected, selectedUser]);

  useEffect(() => {
    if (!isEditing) {
      setNewPassword('');
      setConfirmNewPassword('');
    }
  }, [isEditing]);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const text = `${user.nombres} ${user.apellidos} ${user.email} ${user.usuario}`.toLowerCase();
      const matchesSearch = text.includes(searchTerm.trim().toLowerCase());

      const matchesRole = usuarioCoincideFiltroRol(user.roles, roleFilter);

      const matchesStatus = statusFilter === 'all' ? true : user.estado === statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchTerm, roleFilter, statusFilter]);

  const rolEdicion = draft?.roles[0];

  useEffect(() => {
    const necesita =
      esRolCoordinacionFacultad(rolEdicion) || rolEdicion === 'Jefe de Carrera';
    if (!necesita || !selectedUser) return;
    void apiFetch<Facultad[]>('/facultades').then(setEditFacultades).catch(() => {});
  }, [rolEdicion, selectedUser]);

  useEffect(() => {
    if (rolEdicion !== 'Jefe de Carrera' || editScopeFacultadIds.length === 0) {
      setEditCarreras([]);
      return;
    }
    const promises = editScopeFacultadIds.map((fid) =>
      apiFetch<{ total: number; datos: Carrera[] }>(`/academico/carreras?facultadId=${fid}`).then((r) => r.datos)
    );
    void Promise.all(promises)
      .then((results) => {
        const todas = results.flat();
        setEditCarreras(todas);
        setEditScopeCarreraIds((prev) => prev.filter((cid) => todas.some((c) => c.id === cid)));
      })
      .catch(() => {});
  }, [rolEdicion, editScopeFacultadIds]);

  useEffect(() => {
    if (rolEdicion !== 'Jefe de Carrera') return;
    if (editScopeFacultadIds.length > 0 || editScopeCarreraIds.length === 0) return;
    let cancelled = false;
    void apiFetch<{ total: number; datos: Carrera[] }>('/academico/carreras')
      .then((r) => {
        if (cancelled) return;
        const match = r.datos.find((c) => editScopeCarreraIds.includes(c.id));
        if (match) setEditScopeFacultadIds([match.facultad_id]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [rolEdicion, editScopeFacultadIds.length, editScopeCarreraIds]);

  const handleStartEditing = () => setIsEditing(true);

  const handleCancelEditing = () => {
    hydrateDraftFromSelected();
    setNewPassword('');
    setConfirmNewPassword('');
    setIsEditing(false);
  };

  const handleInlineEditClick = (userId: string) => {
    if (selectedUserId === userId) {
      setIsEditing(true);
      return;
    }
    autoEditRef.current = true;
    setIsEditing(false);
    setSelectedUserId(userId);
  };

  const handleSaveChanges = async () => {
    if (!selectedUser || !draft || !isEditing) return;

    const trimmedNewPassword = newPassword.trim();
    if (trimmedNewPassword) {
      if (trimmedNewPassword.length < 8) {
        toast.error('La nueva contraseña debe tener al menos 8 caracteres');
        return;
      }
      if (trimmedNewPassword !== confirmNewPassword.trim()) {
        toast.error('La confirmación de contraseña no coincide');
        return;
      }
    }

    if (!draft.roles.length) {
      toast.error('Seleccioná al menos un rol');
      return;
    }

    const draftRol = draft.roles[0];
    const draftNecesitaScope =
      esRolCoordinacionFacultad(draftRol) || draftRol === 'Jefe de Carrera';

    if (draftNecesitaScope) {
      if (editScopeFacultadIds.length === 0) {
        toast.error('Seleccioná una facultad.');
        return;
      }
      if (draftRol === 'Jefe de Carrera' && editScopeCarreraIds.length === 0) {
        toast.error('Seleccioná al menos una carrera.');
        return;
      }
    }

    setSaving(true);
    try {
      const promises: Array<Promise<unknown>> = [];
      const baseChanges: {
        nombres?: string;
        apellidos?: string;
        email?: string;
        telefono?: string;
        usuario?: string;
      } = {};

      if (selectedUser.nombres !== draft.nombres) baseChanges.nombres = draft.nombres;
      if (selectedUser.apellidos !== draft.apellidos) baseChanges.apellidos = draft.apellidos;
      if (selectedUser.email !== draft.email) baseChanges.email = draft.email;
      if (selectedUser.usuario !== draft.usuario) baseChanges.usuario = draft.usuario;
      if ((selectedUser.telefono ?? '') !== draft.telefono) baseChanges.telefono = draft.telefono || undefined;
      if (Object.keys(baseChanges).length) {
        promises.push(
          apiFetch(`/usuarios/${selectedUser.id}`, {
            method: 'PATCH',
            body: JSON.stringify(baseChanges),
          })
        );
      }

      if (selectedUser.estado !== draft.estado) {
        promises.push(
          apiFetch(`/usuarios/${selectedUser.id}/estado`, {
            method: 'PATCH',
            body: JSON.stringify({ estado: draft.estado }),
          })
        );
      }

      if (!arraysAreEqual(selectedUser.roles, draft.roles)) {
        promises.push(
          apiFetch(`/usuarios/${selectedUser.id}/roles`, {
            method: 'PUT',
            body: JSON.stringify({ roles: draft.roles }),
          })
        );
      }

      const scopeBody = normalizedScopePayload(
        draftNecesitaScope ? editScopeFacultadIds : [],
        draftNecesitaScope && draftRol === 'Jefe de Carrera' ? editScopeCarreraIds : []
      );

      if (!scopePayloadMatchesUser(scopeBody.facultad_ids, scopeBody.carrera_ids, selectedUser.scopes)) {
        promises.push(
          apiFetch(`/usuarios/${selectedUser.id}/scopes`, {
            method: 'PATCH',
            body: JSON.stringify(scopeBody),
          })
        );
      }

      if (trimmedNewPassword) {
        promises.push(
          apiFetch(`/usuarios/${selectedUser.id}/reset-password`, {
            method: 'POST',
            body: JSON.stringify({ nuevaPassword: trimmedNewPassword }),
          })
        );
      }

      if (!promises.length) {
        toast('No se detectaron cambios');
        setSaving(false);
        return;
      }

      await Promise.all(promises);
      await loadUsers(selectedUser.id);
      toast.success('Cambios guardados correctamente');
      setNewPassword('');
      setConfirmNewPassword('');
      setIsEditing(false);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'No se pudieron guardar los datos del usuario';
      toast.error(mensaje);
    } finally {
      setSaving(false);
    }
  };

  const handleDisable = () => {
    if (!draft || !isEditing) return;
    setDraft({ ...draft, estado: draft.estado === 'inactivo' ? 'activo' : 'inactivo' });
  };

  const handleResetPassword = async () => {
    if (!selectedUser) return;
    setResetConfirmOpen(true);
  };

  const doResetPassword = async () => {
    if (!selectedUser) return;
    setResetConfirmOpen(false);
    setResettingPassword(true);
    try {
      const data = await apiFetch<ResetPasswordResponse>(`/usuarios/${selectedUser.id}/reset-password`, {
        method: 'POST',
      });
      toast.success(`Contraseña temporal: ${data.passwordTemporal}`, { duration: 10000 });
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'No se pudo restablecer la contraseña';
      toast.error(mensaje);
    } finally {
      setResettingPassword(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!puedeEliminarUsuario || !selectedUser) return;
    setDeleteConfirmOpen(true);
  };

  const doDeleteUser = async () => {
    if (!puedeEliminarUsuario || !selectedUser) return;
    setDeleteConfirmOpen(false);
    setDeletingUser(true);
    try {
      await apiFetch<void>(`/usuarios/${selectedUser.id}`, { method: 'DELETE' });
      toast.success('Usuario eliminado correctamente');
      setSelectedUserId(null);
      setDraft(null);
      await loadUsers();
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'No se pudo eliminar el usuario';
      toast.error(mensaje);
    } finally {
      setDeletingUser(false);
    }
  };

  const handleChangeUserStatus = async (user: Usuario, estado: EstadoUsuario) => {
    if (user.estado === estado) return;
    setTogglingUserId(user.id);
    try {
      await apiFetch(`/usuarios/${user.id}/estado`, {
        method: 'PATCH',
        body: JSON.stringify({ estado }),
      });
      await loadUsers(user.id);
      toast.success(`Estado actualizado a ${estado}`);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'No se pudo actualizar el estado';
      toast.error(mensaje);
    } finally {
      setTogglingUserId(null);
    }
  };

  const handleExport = useCallback(async () => {
    setExportLoading(true);
    try {
      const body: Record<string, unknown> = {};
      const q = searchTerm.trim();
      if (q) body.q = q;
      if (statusFilter !== 'all') body.estado = statusFilter;
      Object.assign(body, roleFilterToExportBody(roleFilter));

      await generarYAbrirPdf('/usuarios/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      toast.success('PDF de usuarios generado.');
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'No se pudo exportar el listado';
      toast.error(mensaje);
    } finally {
      setExportLoading(false);
    }
  }, [searchTerm, statusFilter, roleFilter]);

  const handleCreateUser = async (payload: CreateUserPayload) => {
    setCreateLoading(true);
    try {
      const nuevoUsuario = await apiFetch<Usuario>('/usuarios', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setIsCreateOpen(false);
      if (location.pathname.endsWith('/usuarios/nuevo')) {
        navigate('/app/usuarios', { replace: true });
      }
      await loadUsers(nuevoUsuario.id);
      toast.success('Usuario creado correctamente');
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'No se pudo crear el usuario';
      toast.error(mensaje);
    } finally {
      setCreateLoading(false);
    }
  };

  const clearSelection = () => {
    setSelectedUserId(null);
    setDraft(null);
    setIsEditing(false);
  };

  const stopRowSelection = (event: SyntheticEvent) => {
    event.stopPropagation();
  };

  return (
    <div className="system-bg text-[#e7eef9] min-h-screen h-screen overflow-hidden">
      <div className="flex h-full w-full overflow-hidden">
        {sidebarOpen ? (
          <div
            className="fixed inset-0 bg-black/70 z-20 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        ) : null}

        <AppSidebar sidebarOpen={sidebarOpen} onLogout={onLogout} onClose={() => setSidebarOpen(false)} />

        <main className="flex-1 flex flex-col h-full overflow-hidden">
          <header className="flex-shrink-0 h-16 bg-[#132a52]/90 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-6 z-10">
            <div className="flex items-center gap-3">
              <button
                className="lg:hidden text-slate-400"
                onClick={() => setSidebarOpen(true)}
                aria-label="Abrir menú"
              >
                <span className="material-symbols-outlined">menu</span>
              </button>
              <span className="material-symbols-outlined text-[#6b8bc3]">manage_accounts</span>
              <div className="flex flex-col">
                <h2 className="text-lg font-bold text-[#f0f4f8] tracking-tight">Gestión de usuarios y RBAC</h2>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedUserId(null);
                  setDraft(null);
                  setIsEditing(false);
                  navigate(appPath('usuarios', { usersAction: 'create' }));
                }}
                className="btn-modern btn-modern-primary btn-modern-sm"
              >
                <span className="material-symbols-outlined text-[18px]">person_add</span>
                NUEVO USUARIO
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
            <section className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="relative w-full max-w-md">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[20px]">search</span>
                    <input
                      className="w-full bg-surface-dark border border-slate-700 text-[#c9d7ed] text-sm rounded-xl pl-10 pr-4 py-2 focus:ring-primary focus:border-primary"
                      placeholder="Buscar por nombre, correo o rol..."
                      type="text"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFiltersOpen((prev) => !prev)}
                      className="btn-modern btn-modern-ghost btn-modern-sm"
                    >
                      <span className="material-symbols-outlined text-[18px]">filter_list</span>
                      Filtrar
                    </button>
                    <button
                      type="button"
                      className="btn-modern btn-modern-ghost btn-modern-sm"
                      disabled={exportLoading}
                      onClick={() => {
                        void handleExport();
                      }}
                    >
                      <span className="material-symbols-outlined text-[18px]">download</span>
                      {exportLoading ? 'Exportando…' : 'Exportar'}
                    </button>
                  </div>
                </div>

                {filtersOpen ? (
                  <div className="bg-surface-dark border border-slate-800 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="text-xs text-slate-400 uppercase tracking-widest space-y-2">
                      <span>Rol</span>
                      <AppSelect
                        value={roleFilter}
                        onChange={setRoleFilter}
                        clearOption={{ value: 'all', label: 'Todos los roles' }}
                        options={ROLE_OPTIONS.map((role) => ({
                          value: role.value,
                          label: role.label,
                        }))}
                        triggerClassName="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-black text-sm dark:bg-[#0b2147] dark:hover:bg-[#091c3d] dark:border-slate-700 dark:text-[#e7eef9]"
                      />
                    </label>
                    <label className="text-xs text-slate-400 uppercase tracking-widest space-y-2">
                      <span>Estado</span>
                      <AppSelect
                        value={statusFilter}
                        onChange={(v) => setStatusFilter(v as 'all' | EstadoUsuario)}
                        clearOption={{ value: 'all', label: 'Todos los estados' }}
                        options={ESTADO_USUARIO_OPTIONS}
                        triggerClassName="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-black text-sm dark:bg-[#0b2147] dark:hover:bg-[#091c3d] dark:border-slate-700 dark:text-[#e7eef9]"
                      />
                    </label>
                  </div>
                ) : null}
              </div>

              <div className="bg-surface-dark border border-slate-800 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Directorio de usuarios</p>
                    <p className="text-sm text-[#c9d7ed]">Se encontraron {filteredUsers.length} registros</p>
                  </div>
                  <span className="text-xs text-slate-500">Actualizado {formatDateOnly(new Date(), 'es-AR')}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[640px]">
                    <thead>
                      <tr className="bg-[#132a52] border-b border-slate-800 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        <th className="px-6 py-4">Nombre e identificación</th>
                        <th className="px-6 py-4">Rol</th>
                        <th className="px-6 py-4">Estado</th>
                        <th className="px-6 py-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-sm">
                      {loading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <tr key={i}>
                            <td colSpan={4} className="px-0 py-0">
                              <SkeletonRow cols={4} />
                            </td>
                          </tr>
                        ))
                      ) : error ? (
                        <tr>
                          <td colSpan={4} className="px-6 py-6 text-center text-slate-400">
                            {error}
                            <button
                              type="button"
                              className="ml-3 btn-modern btn-modern-ghost btn-modern-xs"
                              onClick={() => loadUsers()}
                            >
                              Reintentar
                            </button>
                          </td>
                        </tr>
                      ) : filteredUsers.length ? (
                        filteredUsers.map((user) => {
                          const isSelected = selectedUserId === user.id;
                          return (
                            <tr
                              key={user.id}
                              className={`${isSelected ? 'bg-primary/5 border-l-2 border-l-primary' : 'hover:bg-slate-800/30 cursor-pointer'}`}
                              onClick={() => {
                                setSelectedUserId(user.id);
                                setIsEditing(false);
                              }}
                            >
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <UserAvatar nombres={user.nombres} apellidos={user.apellidos} size="sm" />
                                  <div className="flex flex-col">
                                    <span className="font-medium text-[#f0f4f8]">{formatName(user)}</span>
                                    <span className="text-xs text-slate-500">{user.email}</span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex flex-wrap gap-2">
                                  {etiquetasRoles(user.roles).slice(0, 2).map((role) => (
                                    <span
                                      key={role}
                                      className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-primary/10 text-primary border border-primary/20"
                                    >
                                      {role}
                                    </span>
                                  ))}
                                  {etiquetasRoles(user.roles).length > 2 ? (
                                    <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-slate-800 text-slate-400 border border-slate-700">
                                      +{etiquetasRoles(user.roles).length - 2}
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div
                                  onClick={stopRowSelection}
                                  onMouseDown={stopRowSelection}
                                  onFocus={stopRowSelection}
                                >
                                  <AppSelect
                                    aria-label={`Cambiar estado de ${formatName(user)}`}
                                    value={user.estado}
                                    disabled={togglingUserId === user.id}
                                    size="xs"
                                    onChange={(v) => {
                                      handleChangeUserStatus(user, v as EstadoUsuario);
                                    }}
                                    options={ESTADO_USUARIO_OPTIONS}
                                    triggerClassName="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide bg-white border border-slate-300 text-black focus:outline-none focus:border-primary dark:bg-[#0b2147] dark:hover:bg-[#091c3d] dark:border-slate-700 dark:text-[#e7eef9]"
                                  />
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <button
                                  type="button"
                                  className="text-slate-500 hover:text-[#f0f4f8] "
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleInlineEditClick(user.id);
                                  }}
                                >
                                  <span className="material-symbols-outlined text-[20px]">edit</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={4} className="px-6 py-10 text-center text-slate-400">
                            <div className="flex flex-col items-center gap-3 max-w-sm mx-auto">
                              <span className="material-symbols-outlined text-slate-600 text-[40px]">
                                {users.length === 0 ? 'group_off' : 'filter_alt_off'}
                              </span>
                              <p className="text-sm">
                                {users.length === 0
                                  ? 'Todavía no hay usuarios registrados en el sistema.'
                                  : 'Ningún usuario coincide con los filtros o la búsqueda actual.'}
                              </p>
                              {users.length === 0 ? (
                                <button
                                  type="button"
                                  className="btn-modern btn-modern-primary btn-modern-sm mt-1"
                                  onClick={() => {
                                    setSelectedUserId(null);
                                    setDraft(null);
                                    setIsEditing(false);
                                    navigate(appPath('usuarios', { usersAction: 'create' }));
                                  }}
                                >
                                  <span className="material-symbols-outlined text-[18px]">person_add</span>
                                  Crear primer usuario
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {selectedUser ? (
              <div className="w-full lg:w-[450px] bg-surface-dark border-l border-slate-800 flex flex-col h-full z-10 shadow-xl">
                <div className="p-6 border-b border-slate-800 bg-[#132a52]">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Perfil y permisos</p>
                    <h3 className="text-[#f0f4f8] font-semibold text-lg">{formatName(draft ?? selectedUser)}</h3>
                    <p className="text-sm text-primary font-medium">
                      {etiquetasRoles(selectedUser.roles).join(' · ') || 'Sin rol'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={isEditing ? handleCancelEditing : handleStartEditing}
                      className={`size-10 rounded-lg border border-slate-700 flex items-center justify-center ${
                        isEditing ? 'bg-primary/10 border-primary/40 text-primary' : 'text-[#9fb3d4] hover:text-[#f0f4f8]'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[20px]">edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={clearSelection}
                      className="size-10 rounded-lg border border-slate-700 text-slate-400 hover:text-[#f0f4f8] flex items-center justify-center"
                    >
                      <span className="material-symbols-outlined text-[22px]">close</span>
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="size-16 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center relative">
                    <span className="material-symbols-outlined text-primary text-3xl">person</span>
                    <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-surface-dark ${
                      selectedUser.estado === 'activo' ? 'bg-emerald-500' : 'bg-amber-500'
                    }`} />
                  </div>
                  <div className="flex flex-col">
                    <p className="text-sm text-slate-400">{selectedUser.email}</p>
                    <p className="text-[11px] text-slate-500 font-mono mt-1">UUID · {selectedUser.id}</p>
                  </div>
                </div>
              </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">Información básica</label>
                        {isEditing ? (
                          <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">Modo edición</span>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <label className="text-xs text-[#9fb3d4] space-y-1">
                          <span>Nombres</span>
                          <input
                            type="text"
                            value={draft?.nombres ?? ''}
                            disabled={!isEditing}
                            onChange={(event) => setDraft((prev) => (prev ? { ...prev, nombres: event.target.value } : prev))}
                            className="w-full bg-surface-darker border border-slate-700 rounded-lg px-3 py-2 text-sm text-[#f0f4f8] focus:border-primary disabled:opacity-50"
                          />
                        </label>
                        <label className="text-xs text-[#9fb3d4] space-y-1">
                          <span>Apellidos</span>
                          <input
                            type="text"
                            value={draft?.apellidos ?? ''}
                            disabled={!isEditing}
                            onChange={(event) => setDraft((prev) => (prev ? { ...prev, apellidos: event.target.value } : prev))}
                            className="w-full bg-surface-darker border border-slate-700 rounded-lg px-3 py-2 text-sm text-[#f0f4f8] focus:border-primary disabled:opacity-50"
                          />
                        </label>
                        <label className="text-xs text-[#9fb3d4] space-y-1">
                          <span>Correo institucional</span>
                          <input
                            type="email"
                            value={draft?.email ?? ''}
                            disabled={!isEditing}
                            onChange={(event) => setDraft((prev) => (prev ? { ...prev, email: event.target.value } : prev))}
                            className="w-full bg-surface-darker border border-slate-700 rounded-lg px-3 py-2 text-sm text-[#f0f4f8] focus:border-primary disabled:opacity-50"
                          />
                        </label>
                        <label className="text-xs text-[#9fb3d4] space-y-1">
                          <span>Usuario</span>
                          <input
                            type="text"
                            value={draft?.usuario ?? ''}
                            disabled={!isEditing}
                            onChange={(event) => setDraft((prev) => (prev ? { ...prev, usuario: event.target.value } : prev))}
                            className="w-full bg-surface-darker border border-slate-700 rounded-lg px-3 py-2 text-sm text-[#f0f4f8] focus:border-primary disabled:opacity-50"
                          />
                        </label>
                        <label className="text-xs text-[#9fb3d4] space-y-1">
                          <span>Teléfono</span>
                          <input
                            type="tel"
                            value={draft?.telefono ?? ''}
                            disabled={!isEditing}
                            maxLength={10}
                            onChange={(event) => {
                              const val = event.target.value.replace(/\D/g, '').slice(0, 10);
                              setDraft((prev) => (prev ? { ...prev, telefono: val } : prev));
                            }}
                            className="w-full bg-surface-darker border border-slate-700 rounded-lg px-3 py-2 text-sm text-[#f0f4f8] focus:border-primary disabled:opacity-50"
                          />
                        </label>
                        <label className="text-xs text-[#9fb3d4] space-y-1">
                          <span>Estado</span>
                          <AppSelect
                            value={draft?.estado ?? 'activo'}
                            disabled={!isEditing}
                            onChange={(v) =>
                              setDraft((prev) => (prev ? { ...prev, estado: v as EstadoUsuario } : prev))
                            }
                            options={ESTADO_USUARIO_OPTIONS}
                            triggerClassName="w-full rounded-lg px-3 py-2 text-sm bg-white border border-slate-300 text-black focus:border-primary disabled:opacity-50 dark:bg-[#0b2147] dark:hover:bg-[#091c3d] dark:border-slate-700 dark:text-[#e7eef9]"
                          />
                        </label>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Roles</label>
                        {isEditing ? (
                          <button
                            type="button"
                            onClick={() => {
                              setDraft((prev) => (prev ? { ...prev, roles: [] } : prev));
                              setEditScopeFacultadIds([]);
                              setEditScopeCarreraIds([]);
                            }}
                            className="text-[11px] text-primary hover:underline"
                          >
                            Limpiar
                          </button>
                        ) : null}
                      </div>
                      <div className="space-y-2">
                        {ROLE_OPTIONS.map((role) => (
                          <label
                            key={role.value}
                            className={`flex items-center gap-3 rounded-2xl border border-slate-800 px-4 py-3 ${
                              draft?.roles.includes(role.value) ? 'bg-primary/5 border-primary/30' : 'bg-[#132a52]'
                            } ${isEditing ? 'cursor-pointer' : 'opacity-70 cursor-not-allowed'}`}
                          >
                            <input
                              type="radio"
                              name="edit_role_option"
                              checked={draft?.roles.includes(role.value)}
                              disabled={!isEditing}
                              onChange={() => {
                                setDraft((prev) => (prev ? { ...prev, roles: [role.value] } : prev));
                                const necesita =
                                  role.value === 'Coordinador de Facultad' ||
                                  role.value === 'Jefe de Carrera';
                                if (!necesita) {
                                  setEditScopeFacultadIds([]);
                                  setEditScopeCarreraIds([]);
                                } else if (role.value === 'Coordinador de Facultad') {
                                  setEditScopeCarreraIds([]);
                                }
                              }}
                              className="size-5 border-slate-600 text-primary focus:ring-primary"
                            />
                            <div>
                              <p className="text-sm text-[#f0f4f8] flex items-center gap-2">
                                <span className="material-symbols-outlined text-base text-slate-400">{role.icon}</span>
                                {role.label}
                              </p>
                              <p className="text-xs text-slate-500">{role.description}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    {(esRolCoordinacionFacultad(rolEdicion) || rolEdicion === 'Jefe de Carrera') && (
                      <div className="space-y-3 pt-4 border-t border-slate-800/50">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                          Alcance de visibilidad
                        </label>
                        {!isEditing ? (
                          selectedUser.scopes?.length ? (
                            <ul className="space-y-2 text-sm text-slate-300">
                              {selectedUser.scopes.map((s, idx) => (
                                <li
                                  key={`${s.facultad_id ?? ''}-${s.carrera_id ?? ''}-${idx}`}
                                  className="rounded-lg border border-slate-800 bg-[#132a52] px-3 py-2"
                                >
                                  {s.facultad_nombre ? (
                                    <span className="text-[#f0f4f8]">Facultad: {s.facultad_nombre}</span>
                                  ) : null}
                                  {s.carrera_nombre ? (
                                    <span className="text-[#f0f4f8]">
                                      {s.facultad_nombre ? ' · ' : null}
                                      Carrera: {s.carrera_nombre}
                                    </span>
                                  ) : null}
                                  {!s.facultad_nombre && !s.carrera_nombre ? (
                                    <span className="text-slate-500">Alcance registrado (sin nombre en catálogo)</span>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-slate-500">Sin facultad o carrera en la ficha.</p>
                          )
                        ) : (
                          <>
                            <div className="space-y-2">
                              <p className="text-xs text-slate-500">Facultad</p>
                              {editFacultades.map((f) => {
                                const checked = editScopeFacultadIds.includes(f.id);
                                const icon = f.nombre.toLowerCase().includes('tecnolog')
                                  ? 'computer'
                                  : f.nombre.toLowerCase().includes('empresa')
                                    ? 'business_center'
                                    : f.nombre.toLowerCase().includes('derecho')
                                      ? 'gavel'
                                      : 'menu_book';
                                return (
                                  <label
                                    key={f.id}
                                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${
                                      checked
                                        ? 'border-primary/60 bg-primary/10'
                                        : 'border-slate-700 hover:border-slate-600 bg-surface-darker'
                                    }`}
                                  >
                                    <input
                                      type="radio"
                                      name="edit_scope_facultad"
                                      checked={checked}
                                      onChange={() => setEditScopeFacultadIds([f.id])}
                                      className="size-5 border-slate-600 text-primary focus:ring-primary"
                                    />
                                    <div>
                                      <p className="text-sm text-[#f0f4f8] flex items-center gap-2">
                                        <span className="material-symbols-outlined text-base text-slate-400">{icon}</span>
                                        {f.nombre}
                                      </p>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>

                            {rolEdicion === 'Jefe de Carrera' && editScopeFacultadIds.length > 0 && (
                              <div className="space-y-2 pt-2">
                                <p className="text-xs text-slate-500">Carreras</p>
                                {editCarreras.map((c) => {
                                  const checked = editScopeCarreraIds.includes(c.id);
                                  return (
                                    <label
                                      key={c.id}
                                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${
                                        checked
                                          ? 'border-primary/60 bg-primary/10'
                                          : 'border-slate-700 hover:border-slate-600 bg-surface-darker'
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={(e) =>
                                          setEditScopeCarreraIds((prev) =>
                                            e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id)
                                          )
                                        }
                                        className={SCOPE_CARRERA_CHOICE_CLASS}
                                      />
                                      <p className="text-sm text-[#f0f4f8]">{c.nombre}</p>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    <div className="space-y-3 pt-4 border-t border-slate-800/50">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Seguridad</label>
                      {isEditing ? (
                        <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-[#132a52] p-3">
                          <label className="text-xs text-[#9fb3d4] space-y-1">
                            <span>Nueva contraseña</span>
                            <input
                              type="password"
                              value={newPassword}
                              onChange={(event) => setNewPassword(event.target.value)}
                              placeholder="Minimo 8 caracteres"
                              autoComplete="new-password"
                              className="w-full bg-surface-darker border border-slate-700 rounded-lg px-3 py-2 text-sm text-[#f0f4f8] focus:border-primary"
                            />
                          </label>
                          <label className="text-xs text-[#9fb3d4] space-y-1">
                            <span>Confirmar nueva contraseña</span>
                            <input
                              type="password"
                              value={confirmNewPassword}
                              onChange={(event) => setConfirmNewPassword(event.target.value)}
                              placeholder="Repite la contraseña"
                              autoComplete="new-password"
                              className="w-full bg-surface-darker border border-slate-700 rounded-lg px-3 py-2 text-sm text-[#f0f4f8] focus:border-primary"
                            />
                          </label>
                        </div>
                      ) : null}
                      <div className="flex flex-col gap-3">
                        <button
                          type="button"
                          onClick={handleDisable}
                          disabled={!isEditing}
                          className="w-full btn-modern btn-modern-danger justify-between"
                        >
                          <span className="text-xs font-bold uppercase tracking-wider">
                            {draft?.estado === 'inactivo' ? 'Reactivar acceso' : 'Deshabilitar acceso'}
                          </span>
                          <span className="material-symbols-outlined text-[18px]">lock</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleResetPassword}
                          disabled={resettingPassword}
                          className="w-full btn-modern btn-modern-primary justify-between"
                        >
                          <span className="text-xs font-bold uppercase tracking-wider">
                            {resettingPassword ? 'Generando contraseña temporal' : 'Restablecer credenciales'}
                          </span>
                          <span className="material-symbols-outlined text-[18px]">lock_reset</span>
                        </button>
                      </div>
                    </div>
              </div>

                <div className="p-6 bg-[#132a52] border-t border-slate-800">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={isEditing ? handleCancelEditing : clearSelection}
                      className="btn-modern btn-modern-ghost"
                    >
                      {isEditing ? 'Cancelar' : 'Cerrar'}
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveChanges}
                      disabled={!isEditing || saving}
                      className="btn-modern btn-modern-primary"
                    >
                      {isEditing ? (saving ? 'Guardando...' : 'Guardar cambios') : 'Guardar cambios'}
                    </button>
                  </div>
                  {puedeEliminarUsuario ? (
                    <button
                      type="button"
                      onClick={handleDeleteUser}
                      disabled={deletingUser}
                      className="mt-3 w-full btn-modern btn-modern-danger"
                    >
                      {deletingUser ? 'Eliminando usuario...' : 'Eliminar usuario'}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : isCreateOpen ? (
              <CreateUserModal
                onClose={() => {
                  setIsCreateOpen(false);
                  if (location.pathname.endsWith('/usuarios/nuevo')) {
                    navigate('/app/usuarios', { replace: true });
                  }
                }}
                onSubmit={handleCreateUser}
                saving={createLoading}
                existingUsers={users}
              />
            ) : null}
          </div>
        </main>
      </div>

      {puedeEliminarUsuario ? (
        <ConfirmDialog
          open={deleteConfirmOpen}
          onCancel={() => setDeleteConfirmOpen(false)}
          onConfirm={() => { void doDeleteUser(); }}
          title="Eliminar usuario"
          description={selectedUser ? `¿Deseas eliminar a ${formatName(selectedUser)}? Esta acción no se puede deshacer.` : ''}
          confirmLabel="Eliminar"
          variant="danger"
          loading={deletingUser}
        />
      ) : null}
      <ConfirmDialog
        open={resetConfirmOpen}
        onCancel={() => setResetConfirmOpen(false)}
        onConfirm={() => { void doResetPassword(); }}
        title="Restablecer contraseña"
        description={selectedUser ? `¿Generás una contraseña temporal para ${formatName(selectedUser)}? Se mostrará una sola vez.` : ''}
        confirmLabel="Generar contraseña"
        variant="warning"
        loading={resettingPassword}
      />
    </div>
  );
}

interface CreateUserModalProps {
  onClose: () => void;
  onSubmit: (payload: CreateUserPayload) => Promise<void>;
  saving: boolean;
  existingUsers: Usuario[];
}

function CreateUserModal({ onClose, onSubmit, saving, existingUsers: _existingUsers }: CreateUserModalProps) {
  const [form, setForm] = useState({
    nombres: '',
    apellidos: '',
    email: '',
    usuario: '',
    telefono: '',
    password: '',
    personaTipo: 'docente' as PersonaTipo,
    personaId: '',
    roles: [] as string[],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [facultades, setFacultades] = useState<Facultad[]>([]);
  const [carreras, setCarreras] = useState<Carrera[]>([]);
  const [scopeFacultadIds, setScopeFacultadIds] = useState<number[]>([]);
  const [scopeCarreraIds, setScopeCarreraIds] = useState<number[]>([]);

  const scopeRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const carreraRef = useRef<HTMLDivElement>(null);

  const esDirector = usuarioTieneCoordinacionFacultad(form.roles);
  const esCoordinador = form.roles.includes('Jefe de Carrera');
  const necesitaScope = esDirector || esCoordinador;

  useEffect(() => {
    if (!necesitaScope) {
      queueMicrotask(() => {
        setScopeFacultadIds([]);
        setScopeCarreraIds([]);
      });
      return;
    }
    apiFetch<Facultad[]>('/facultades').then(setFacultades).catch(() => {});
    setTimeout(() => {
      scrollContainerRef.current?.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' });
    }, 50);
  }, [necesitaScope]);

  useEffect(() => {
    if (!esCoordinador || scopeFacultadIds.length === 0) {
      queueMicrotask(() => {
        setCarreras([]);
        setScopeCarreraIds([]);
      });
      return;
    }
    const promises = scopeFacultadIds.map(fid =>
      apiFetch<{ total: number; datos: Carrera[] }>(`/academico/carreras?facultadId=${fid}`).then(r => r.datos)
    );
    Promise.all(promises).then(results => {
      const todas = results.flat();
      setCarreras(todas);
      setScopeCarreraIds(prev => prev.filter(cid => todas.some(c => c.id === cid)));
      setTimeout(() => {
        scrollContainerRef.current?.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' });
      }, 50);
    }).catch(() => {});
  }, [esCoordinador, scopeFacultadIds]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const newErrors: Record<string, string> = {};
    if (!form.nombres.trim()) newErrors.nombres = 'Obligatorio';
    if (!form.apellidos.trim()) newErrors.apellidos = 'Obligatorio';
    if (!form.email.trim()) newErrors.email = 'Obligatorio';
    if (!form.usuario.trim()) newErrors.usuario = 'Obligatorio';
    if (!form.password.trim()) newErrors.password = 'Obligatorio';

    if (Object.keys(newErrors).length) {
      setErrors(newErrors);
      return;
    }

    await onSubmit({
      nombres: form.nombres.trim(),
      apellidos: form.apellidos.trim(),
      email: form.email.trim(),
      usuario: form.usuario.trim(),
      telefono: form.telefono.trim() || undefined,
      password: form.password,
      roles: form.roles,
      persona:
        form.personaId.trim() && form.personaTipo
          ? { tipo: form.personaTipo, id: form.personaId.trim() }
          : undefined,
      ...(necesitaScope ? {
        scope: {
          facultad_ids: scopeFacultadIds,
          carrera_ids: scopeCarreraIds,
        }
      } : {}),
    });
  };

  const handleRoleChange = (role: string) => {
    setForm((prev) => ({ ...prev, roles: [role] }));
  };

  return (
    <div className="w-full lg:w-[450px] bg-surface-dark border-l border-slate-800 flex flex-col h-full z-10 shadow-xl">
      <form onSubmit={handleSubmit} className="h-full flex flex-col">
        <div className="p-6 border-b border-slate-800 bg-[#132a52]">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Perfil y permisos</p>
              <h3 className="text-[#f0f4f8] font-semibold text-lg">
                {`${form.nombres} ${form.apellidos}`.trim() || 'Nuevo usuario'}
              </h3>
              <p className="text-sm text-primary font-medium">{etiquetaRol(form.roles[0] ?? '') || 'Sin rol'}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="size-10 btn-modern btn-modern-ghost text-slate-400 hover:text-[#f0f4f8]"
            >
              <span className="material-symbols-outlined text-[22px]">close</span>
            </button>
          </div>
          <div className="flex items-center gap-4">
            <div className="size-16 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center relative">
              <span className="material-symbols-outlined text-primary text-3xl">person</span>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-surface-dark bg-emerald-500" />
            </div>
            <div className="flex flex-col">
              <p className="text-sm text-slate-400">{form.email || 'Sin correo'}</p>
              <p className="text-[11px] text-slate-500 font-mono mt-1">UUID · pendiente de creación</p>
            </div>
          </div>
        </div>

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">

          <div className="space-y-4">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">Información básica</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="text-xs text-[#9fb3d4] space-y-1">
                <span>Nombres</span>
                <input
                  type="text"
                  value={form.nombres}
                  onChange={(event) => setForm((prev) => ({ ...prev, nombres: event.target.value }))}
                  className={`w-full bg-surface-darker border rounded-lg px-3 py-2 text-sm text-[#f0f4f8] focus:border-primary ${
                    errors.nombres ? 'border-rose-400' : 'border-slate-700'
                  }`}
                />
                {errors.nombres ? <p className="text-xs text-rose-400">{errors.nombres}</p> : null}
              </label>
              <label className="text-xs text-[#9fb3d4] space-y-1">
                <span>Apellidos</span>
                <input
                  type="text"
                  value={form.apellidos}
                  onChange={(event) => setForm((prev) => ({ ...prev, apellidos: event.target.value }))}
                  className={`w-full bg-surface-darker border rounded-lg px-3 py-2 text-sm text-[#f0f4f8] focus:border-primary ${
                    errors.apellidos ? 'border-rose-400' : 'border-slate-700'
                  }`}
                />
                {errors.apellidos ? <p className="text-xs text-rose-400">{errors.apellidos}</p> : null}
              </label>
              <label className="text-xs text-[#9fb3d4] space-y-1">
                <span>Correo institucional</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                  className={`w-full bg-surface-darker border rounded-lg px-3 py-2 text-sm text-[#f0f4f8] focus:border-primary ${
                    errors.email ? 'border-rose-400' : 'border-slate-700'
                  }`}
                />
                {errors.email ? <p className="text-xs text-rose-400">{errors.email}</p> : null}
              </label>
              <label className="text-xs text-[#9fb3d4] space-y-1">
                <span>Usuario</span>
                <input
                  type="text"
                  value={form.usuario}
                  onChange={(event) => setForm((prev) => ({ ...prev, usuario: event.target.value }))}
                  className={`w-full bg-surface-darker border rounded-lg px-3 py-2 text-sm text-[#f0f4f8] focus:border-primary ${
                    errors.usuario ? 'border-rose-400' : 'border-slate-700'
                  }`}
                />
                {errors.usuario ? <p className="text-xs text-rose-400">{errors.usuario}</p> : null}
              </label>
              <label className="text-xs text-[#9fb3d4] space-y-1">
                <span>Teléfono</span>
                <input
                  type="tel"
                  value={form.telefono}
                  maxLength={10}
                  onChange={(event) => {
                    const val = event.target.value.replace(/\D/g, '').slice(0, 10);
                    setForm((prev) => ({ ...prev, telefono: val }));
                  }}
                  className="w-full bg-surface-darker border border-slate-700 rounded-lg px-3 py-2 text-sm text-[#f0f4f8] focus:border-primary"
                />
              </label>
              <label className="text-xs text-[#9fb3d4] space-y-1">
                <span>Contraseña inicial</span>
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                  className={`w-full bg-surface-darker border rounded-lg px-3 py-2 text-sm text-[#f0f4f8] focus:border-primary ${
                    errors.password ? 'border-rose-400' : 'border-slate-700'
                  }`}
                />
                {errors.password ? <p className="text-xs text-rose-400">{errors.password}</p> : null}
              </label>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Roles</label>
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, roles: [] }))}
                className="text-[11px] text-primary hover:underline"
              >
                Limpiar
              </button>
            </div>
            <div className="space-y-2">
              {ROLE_OPTIONS.map((role) => (
                <label
                  key={role.value}
                  className={`flex items-center gap-3 rounded-2xl border border-slate-800 px-4 py-3 cursor-pointer ${
                    form.roles.includes(role.value) ? 'bg-primary/5 border-primary/30' : 'bg-[#132a52]'
                  }`}
                >
                  <input
                    type="radio"
                    name="role_option"
                    checked={form.roles.includes(role.value)}
                    onChange={() => handleRoleChange(role.value)}
                    className="size-5 border-slate-600 text-primary focus:ring-primary"
                  />
                  <div>
                    <p className="text-sm text-[#f0f4f8] flex items-center gap-2">
                      <span className="material-symbols-outlined text-base text-slate-400">{role.icon}</span>
                      {role.label}
                    </p>
                    <p className="text-xs text-slate-500">{role.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {necesitaScope && (
            <div ref={scopeRef} className="space-y-3 pt-4 border-t border-slate-800/50">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Alcance de visibilidad</label>

              <div className="space-y-2">
                <p className="text-xs text-slate-500">Facultad</p>
                {facultades.map(f => {
                  const checked = scopeFacultadIds.includes(f.id);
                  const icon = f.nombre.toLowerCase().includes('tecnolog') ? 'computer'
                    : f.nombre.toLowerCase().includes('empresa') ? 'business_center'
                    : f.nombre.toLowerCase().includes('derecho') ? 'gavel'
                    : 'menu_book';
                  return (
                    <label key={f.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${
                      checked
                        ? 'border-primary/60 bg-primary/10'
                        : 'border-slate-700 hover:border-slate-600 bg-surface-darker'
                    }`}>
                      <input
                        type="radio"
                        name="scope_facultad"
                        checked={checked}
                        onChange={() => setScopeFacultadIds([f.id])}
                        className="size-5 border-slate-600 text-primary focus:ring-primary"
                      />
                      <div>
                        <p className="text-sm text-[#f0f4f8] flex items-center gap-2">
                          <span className="material-symbols-outlined text-base text-slate-400">{icon}</span>
                          {f.nombre}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>

              {esCoordinador && scopeFacultadIds.length > 0 && (
                <div ref={carreraRef} className="space-y-2 pt-2">
                  <p className="text-xs text-slate-500">Carreras</p>
                  {carreras.map(c => {
                    const checked = scopeCarreraIds.includes(c.id);
                    return (
                      <label key={c.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${
                        checked
                          ? 'border-primary/60 bg-primary/10'
                          : 'border-slate-700 hover:border-slate-600 bg-surface-darker'
                      }`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => setScopeCarreraIds(prev =>
                            e.target.checked ? [...prev, c.id] : prev.filter(id => id !== c.id)
                          )}
                          className={SCOPE_CARRERA_CHOICE_CLASS}
                        />
                        <p className="text-sm text-[#f0f4f8]">{c.nombre}</p>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-6 bg-[#132a52] border-t border-slate-800">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onClose}
              className="btn-modern btn-modern-ghost"
            >
              Cerrar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-modern btn-modern-primary"
            >
              {saving ? 'Creando...' : 'Crear usuario'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}


