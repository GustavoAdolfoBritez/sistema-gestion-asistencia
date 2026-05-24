import { memo, type ReactNode } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Funnel,
  FunnelChart,
  LabelList,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import type {
  AsistenciaAlertasMesRow,
  CarreraInhabilitadosRow,
  FunnelRetencionRow,
  ScatterAsistenciaRiesgoRow,
} from '../../utils/panel-chart-data';
import { getPanelChartTheme, type PanelChartTheme } from '../../utils/panel-chart-theme';

type PanelChartShellProps = {
  theme: PanelChartTheme;
  title: string;
  subtitle: string;
  hint?: string;
  statsLoading: boolean;
  empty: boolean;
  emptyMessage: string;
  height?: number;
  children: ReactNode;
};

function PanelChartShell({
  theme,
  title,
  subtitle,
  hint,
  statsLoading,
  empty,
  emptyMessage,
  height = 260,
  children,
}: PanelChartShellProps) {
  return (
    <div className={theme.card}>
      <p className={theme.kicker}>{title}</p>
      <h2 className={theme.title}>{subtitle}</h2>
      {hint ? <p className={theme.hint}>{hint}</p> : <div className="mb-3" />}
      {statsLoading ? (
        <div className={`flex items-center justify-center text-sm ${theme.muted}`} style={{ height }}>
          Cargando...
        </div>
      ) : empty ? (
        <div
          className={`flex flex-col items-center justify-center gap-2 ${theme.muted}`}
          style={{ height }}
        >
          <span className="material-symbols-outlined text-[36px] opacity-40">insights</span>
          <p className="text-sm">{emptyMessage}</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          {children}
        </ResponsiveContainer>
      )}
    </div>
  );
}

function ChartTooltipBox({
  theme,
  title,
  children,
}: {
  theme: PanelChartTheme;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="text-xs rounded-lg px-3 py-2 max-w-[280px]" style={theme.tooltip}>
      <p className={theme.tooltipTitle}>{title}</p>
      <div className={`space-y-0.5 mt-1 ${theme.tooltipBody}`}>{children}</div>
    </div>
  );
}

export const PanelFunnelRetencionChart = memo(function PanelFunnelRetencionChart({
  statsLoading,
  data,
  chartKey,
  totalAlumnos,
  isDark,
}: {
  statsLoading: boolean;
  data: FunnelRetencionRow[];
  chartKey: string;
  totalAlumnos: number;
  isDark: boolean;
}) {
  const theme = getPanelChartTheme(isDark);

  return (
    <PanelChartShell
      theme={theme}
      title="Retención académica"
      subtitle="Embudo de matrícula a inhabilitación"
      hint={`${totalAlumnos} matrículas en el período más reciente por curso. La caída indica cuántos alumnos pasan a cada estado más restrictivo.`}
      statsLoading={statsLoading}
      empty={!data.length}
      emptyMessage="Sin matrículas para el embudo"
      height={280}
    >
      <FunnelChart key={chartKey}>
        <ReTooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0].payload as FunnelRetencionRow;
            return (
              <ChartTooltipBox theme={theme} title={row.name}>
                <p>
                  Alumnos: <strong>{row.value}</strong>
                </p>
                {row.dropOffAbs > 0 ? (
                  <p className={theme.tooltipMuted}>
                    Caída desde etapa anterior:{' '}
                    <strong>
                      {row.dropOffAbs} ({row.dropOffPct}%)
                    </strong>
                  </p>
                ) : null}
              </ChartTooltipBox>
            );
          }}
        />
        <Funnel dataKey="value" data={data} isAnimationActive animationDuration={1200}>
          <LabelList position="right" fill={theme.funnelLabel} stroke="none" fontSize={11} dataKey="name" />
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.fill} />
          ))}
        </Funnel>
      </FunnelChart>
    </PanelChartShell>
  );
});

export const PanelScatterAsistenciaRiesgoChart = memo(function PanelScatterAsistenciaRiesgoChart({
  statsLoading,
  data,
  chartKey,
  isDark,
}: {
  statsLoading: boolean;
  data: ScatterAsistenciaRiesgoRow[];
  chartKey: string;
  isDark: boolean;
}) {
  const theme = getPanelChartTheme(isDark);

  return (
    <PanelChartShell
      theme={theme}
      title="Mapa de riesgo"
      subtitle="Asistencia vs % en riesgo por materia"
      hint="Cada punto es una materia (último mes). Esquina inferior derecha = alta asistencia y bajo riesgo."
      statsLoading={statsLoading}
      empty={!data.length}
      emptyMessage="Sin materias para graficar"
      height={280}
    >
      <ScatterChart key={chartKey} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
        <XAxis
          type="number"
          dataKey="asistencia"
          name="Asistencia"
          unit="%"
          domain={[0, 100]}
          tick={{ fill: theme.axisTick, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="number"
          dataKey="pctRiesgo"
          name="% en riesgo"
          unit="%"
          domain={[0, 100]}
          tick={{ fill: theme.axisTick, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <ZAxis type="number" dataKey="matriculas" range={[48, 220]} />
        <ReTooltip
          cursor={{ stroke: theme.scatterCursor, strokeWidth: 1 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0].payload as ScatterAsistenciaRiesgoRow;
            return (
              <ChartTooltipBox theme={theme} title={row.materia}>
                <p>Asistencia: {row.asistencia}%</p>
                <p>En riesgo: {row.pctRiesgo}%</p>
                <p>Matrículas: {row.matriculas}</p>
              </ChartTooltipBox>
            );
          }}
        />
        <Scatter
          name="Materias"
          data={data}
          fill={theme.scatterDot}
          fillOpacity={isDark ? 0.85 : 0.72}
          stroke={isDark ? '#0ea5e9' : '#0369a1'}
          strokeWidth={1}
        />
      </ScatterChart>
    </PanelChartShell>
  );
});

export const PanelCarreraInhabilitadosChart = memo(function PanelCarreraInhabilitadosChart({
  statsLoading,
  data,
  chartKey,
  isDark,
}: {
  statsLoading: boolean;
  data: CarreraInhabilitadosRow[];
  chartKey: string;
  isDark: boolean;
}) {
  const theme = getPanelChartTheme(isDark);

  return (
    <PanelChartShell
      theme={theme}
      title="Comparativo por carrera"
      subtitle="Distribución de inhabilitados"
      hint="Solo coordinadores / vista facultad o institucional. Eje X: % de matrículas en estado irregular (último mes por curso)."
      statsLoading={statsLoading}
      empty={!data.length}
      emptyMessage="Sin carreras con datos en el alcance"
      height={Math.max(220, data.length * 44)}
    >
      <BarChart
        key={chartKey}
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 24, left: 8, bottom: 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
        <XAxis
          type="number"
          unit="%"
          domain={[0, 'auto']}
          tick={{ fill: theme.axisTick, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="carrera"
          width={180}
          tick={{ fill: theme.axisTickCategory, fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => (String(v).length > 28 ? `${String(v).slice(0, 26)}…` : String(v))}
        />
        <ReTooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0].payload as CarreraInhabilitadosRow;
            return (
              <ChartTooltipBox theme={theme} title={row.carrera}>
                <p>Inhabilitados: {row.pctInhabilitados}%</p>
                <p>Asistencia prom.: {row.pctAsistencia}%</p>
                <p>Matrículas: {row.matriculas}</p>
              </ChartTooltipBox>
            );
          }}
        />
        <Bar
          dataKey="pctInhabilitados"
          name="% inhabilitados"
          fill={theme.barInhabilitados}
          radius={[0, 6, 6, 0]}
          isAnimationActive
          animationDuration={1400}
        />
      </BarChart>
    </PanelChartShell>
  );
});

export const PanelAsistenciaAlertasChart = memo(function PanelAsistenciaAlertasChart({
  statsLoading,
  data,
  chartKey,
  isDark,
}: {
  statsLoading: boolean;
  data: AsistenciaAlertasMesRow[];
  chartKey: string;
  isDark: boolean;
}) {
  const theme = getPanelChartTheme(isDark);

  return (
    <PanelChartShell
      theme={theme}
      title="Asistencia y alertas"
      subtitle="Evolución mensual superpuesta"
      hint="Área verde: % asistencia ponderado. Barras: cantidad de alertas generadas ese mes."
      statsLoading={statsLoading}
      empty={!data.length}
      emptyMessage="Sin historial mensual para comparar"
      height={300}
    >
      <ComposedChart key={chartKey} data={data} margin={{ top: 8, right: 48, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
        <XAxis
          dataKey="periodo"
          tick={{ fill: theme.axisTick, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          yAxisId="left"
          tick={{ fill: theme.axisTick, fontSize: 11 }}
          unit="%"
          domain={[0, 100]}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fill: theme.axisAlertas, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <ReTooltip
          contentStyle={theme.tooltip}
          labelStyle={{ color: theme.tooltip.color, fontWeight: 600 }}
          itemStyle={{ color: theme.tooltip.color }}
          formatter={(value, name) => {
            if (name === 'Asistencia %') return [`${value}%`, name];
            if (name === 'Alertas') return [String(value ?? 0), name];
            return [String(value ?? 0), String(name)];
          }}
        />
        <Legend formatter={(v) => <span className={theme.legend}>{v}</span>} />
        <Area
          yAxisId="left"
          type="monotone"
          dataKey="asistencia"
          name="Asistencia %"
          stroke={theme.areaStroke}
          fill={theme.areaFill}
          fillOpacity={isDark ? 0.28 : 0.2}
          strokeWidth={2}
          isAnimationActive
          animationDuration={1600}
        />
        <Bar
          yAxisId="right"
          dataKey="alertas"
          name="Alertas"
          fill={theme.barAlertas}
          barSize={18}
          radius={[4, 4, 0, 0]}
          fillOpacity={isDark ? 0.9 : 0.85}
          isAnimationActive
          animationDuration={1600}
        />
      </ComposedChart>
    </PanelChartShell>
  );
});
