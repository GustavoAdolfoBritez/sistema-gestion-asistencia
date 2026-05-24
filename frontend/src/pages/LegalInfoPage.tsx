type LegalPageType = 'terminos' | 'privacidad' | 'soporte';

interface LegalInfoPageProps {
  page: LegalPageType;
  onBack: () => void;
}

const PAGE_META: Record<LegalPageType, { title: string; subtitle: string }> = {
  terminos: {
    title: 'Terminos y condiciones',
    subtitle: 'Marco de uso institucional del sistema desarrollado para fines academicos de tesis.',
  },
  privacidad: {
    title: 'Politica de privacidad',
    subtitle: 'Lineamientos para el tratamiento de datos en el contexto del proyecto academico.',
  },
  soporte: {
    title: 'Soporte',
    subtitle: 'Condiciones y alcance del soporte para la entrega de tesis y uso en facultad.',
  },
};

export function LegalInfoPage({ page, onBack }: LegalInfoPageProps) {
  const currentYear = new Date().getFullYear();
  const meta = PAGE_META[page];

  return (
    <div
      className="min-h-screen w-full bg-[#061b40] bg-cover bg-center font-display px-5 py-8 text-[#e8eef8] sm:px-8 lg:px-10"
      style={{ backgroundImage: "url('/login-bg.svg')" }}
    >
        <div className="mx-auto w-full max-w-4xl rounded-2xl border border-white/15 bg-[#0d1f3d] p-6 shadow-[0_18px_45px_rgba(3,11,32,0.35)] sm:p-8">
        <button
          type="button"
          onClick={onBack}
          className="mb-5 inline-flex items-center gap-2 rounded-lg border border-[#3d5270] bg-[#142744] px-3 py-2 text-sm font-medium text-white hover:border-[#5a7394] hover:bg-[#1a3154]"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Volver a iniciar sesión
        </button>

        <header className="mb-7 border-b border-white/15 pb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#a8bdd4]">Universidad Nihon Gakko</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">{meta.title}</h1>
          <p className="mt-3 text-sm leading-snug text-[#d0ddf2]">{meta.subtitle}</p>
        </header>

        {page === 'terminos' ? (
          <section className="space-y-5 text-sm leading-relaxed text-[#dce6f6]">
            <h2 className="text-lg font-semibold text-white">Clausulas generales</h2>
            <ol className="list-decimal space-y-3 pl-5">
              <li>
                Objeto y alcance funcional: el sistema se limita exclusivamente a la gestion y control de asistencias. Queda
                expresamente excluida la administracion de examenes, aulas, pagos, calificaciones, recursos humanos y cualquier
                otro modulo academico o administrativo no definido en esta tesis.
              </li>
              <li>
                Integraciones externas: no se contempla integracion con sistemas institucionales, academicos,
                administrativos o de recursos humanos. Toda integracion futura requerira solicitud formal y definicion de nuevo
                alcance tecnico y economico.
              </li>
              <li>
                Condicion de implementacion: el desarrollo corresponde a una entrega academica de tesis. No incluye,
                por defecto, mantenimiento correctivo, evolutivo, actualizaciones ni trabajos adicionales sin acuerdo expreso.
              </li>
              <li>
                Propiedad intelectual: el sistema, su documentacion y codigo fuente son propiedad exclusiva del autor.
                Se prohibe su reutilizacion, modificacion, distribucion, cesion o comercializacion sin consentimiento previo,
                expreso y por escrito.
              </li>
              <li>
                Formato documental: para la justificacion de inasistencias solo se acepta el formato PDF, con el fin de
                garantizar uniformidad documental, seguridad y facilidad de revision.
              </li>
            </ol>

            <p className="rounded-lg border border-[#2a3f5c] bg-[#050a14]/80 px-4 py-3 text-xs leading-relaxed text-[#dce6f6]">
              La utilizacion del sistema por parte de usuarios autorizados implica aceptacion de las presentes condiciones en el
              marco del proyecto academico.
            </p>
          </section>
        ) : null}

        {page === 'privacidad' ? (
          <section className="space-y-5 text-sm leading-relaxed text-[#dce6f6]">
            <h2 className="text-lg font-semibold text-white">Principios de tratamiento de datos</h2>
            <ol className="list-decimal space-y-3 pl-5">
              <li>
                Finalidad: los datos gestionados en la plataforma se utilizan exclusivamente para registro, seguimiento y
                control de asistencias en la facultad.
              </li>
              <li>
                Minimacion: solo se procesan los datos estrictamente necesarios para el cumplimiento de la finalidad academica
                definida en el proyecto.
              </li>
              <li>
                Confidencialidad: el acceso a la informacion esta restringido por roles institucionales y credenciales de
                usuario.
              </li>
              <li>
                No cesion a terceros: no se contempla transferencia o comercializacion de datos personales a terceros externos
                al proyecto sin autorizacion formal.
              </li>
              <li>
                Evidencia documental: las justificaciones de inasistencia se admiten unicamente en formato PDF para preservar
                trazabilidad y control documental.
              </li>
            </ol>

            <p className="rounded-lg border border-[#2a3f5c] bg-[#050a14]/80 px-4 py-3 text-xs leading-relaxed text-[#dce6f6]">
              La presente politica se aplica dentro del alcance academico del proyecto de tesis y no constituye un sistema de
              tratamiento de datos de alcance institucional integral.
            </p>
          </section>
        ) : null}

        {page === 'soporte' ? (
          <section className="space-y-5 text-sm leading-relaxed text-[#dce6f6]">
            <h2 className="text-lg font-semibold text-white">Condiciones de soporte</h2>
            <ol className="list-decimal space-y-3 pl-5">
              <li>
                El soporte se limita al periodo de desarrollo, validacion y sustentacion correspondiente al trabajo de tesis.
              </li>
              <li>
                Las atenciones se circunscriben al alcance funcional aprobado para control de asistencias.
              </li>
              <li>
                No se incluyen mejoras evolutivas, integraciones nuevas, migraciones, ni funcionalidades adicionales sin
                acuerdo previo.
              </li>
              <li>
                Toda solicitud extraordinaria debera gestionarse mediante coordinacion formal con el autor y la instancia
                academica correspondiente.
              </li>
            </ol>

            <p className="rounded-lg border border-[#2a3f5c] bg-[#050a14]/80 px-4 py-3 text-xs leading-relaxed text-[#dce6f6]">
              Este apartado define soporte academico de proyecto y no representa un contrato de servicio permanente.
            </p>
          </section>
        ) : null}

        <footer className="mt-8 border-t border-white/15 pt-4 text-xs text-[#96abc4]">
          © {currentYear} Sistema de Control de Asistencia - Proyecto de Tesis UNG.
        </footer>
      </div>
    </div>
  );
}
