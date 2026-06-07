type Props = {
  pullDistance: number;
  isRefreshing: boolean;
  pullProgress: number;
};

export function PullToRefreshIndicator({ pullDistance, isRefreshing, pullProgress }: Props) {
  if (!isRefreshing && pullDistance <= 0) return null;

  const altura = isRefreshing ? 52 : Math.max(0, pullDistance);
  const rotacion = isRefreshing ? 0 : Math.round(pullProgress * 220);

  return (
    <div
      className="pull-to-refresh-indicator pointer-events-none flex shrink-0 items-center justify-center gap-2 overflow-hidden text-xs font-medium text-slate-500 dark:text-slate-400 max-lg:flex lg:hidden"
      style={{ height: altura }}
      aria-hidden={!isRefreshing}
      aria-live={isRefreshing ? 'polite' : 'off'}
    >
      <span
        className={`material-symbols-outlined text-[20px] text-primary ${isRefreshing ? 'animate-spin' : ''}`}
        style={isRefreshing ? undefined : { transform: `rotate(${rotacion}deg)` }}
      >
        refresh
      </span>
      <span>
        {isRefreshing
          ? 'Actualizando…'
          : pullProgress >= 1
            ? 'Soltá para actualizar'
            : 'Deslizá para actualizar'}
      </span>
    </div>
  );
}
