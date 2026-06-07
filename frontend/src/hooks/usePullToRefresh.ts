import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

const MOBILE_MQ = '(max-width: 1023px)';
const PULL_THRESHOLD_PX = 72;
const MAX_PULL_PX = 112;
const PULL_RESISTANCE = 0.45;

export type UsePullToRefreshOptions = {
  containerRef: RefObject<HTMLElement | null>;
  onRefresh: () => void | Promise<void>;
  disabled?: boolean;
};

export type UsePullToRefreshResult = {
  pullDistance: number;
  isRefreshing: boolean;
  pullProgress: number;
};

function esMovilPullToRefresh(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(MOBILE_MQ).matches;
}

export function usePullToRefresh({
  containerRef,
  onRefresh,
  disabled = false,
}: UsePullToRefreshOptions): UsePullToRefreshResult {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const onRefreshRef = useRef(onRefresh);
  const pullingRef = useRef(false);
  const startYRef = useRef(0);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    refreshingRef.current = isRefreshing;
  }, [isRefreshing]);

  const ejecutarRefresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setIsRefreshing(true);
    setPullDistance(PULL_THRESHOLD_PX);
    try {
      await onRefreshRef.current();
    } finally {
      refreshingRef.current = false;
      setIsRefreshing(false);
      setPullDistance(0);
      pullRef.current = 0;
    }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || disabled) return;

    const limpiarGestos = () => {
      pullingRef.current = false;
      pullRef.current = 0;
      setPullDistance(0);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (!esMovilPullToRefresh() || refreshingRef.current) return;
      if (el.scrollTop > 1) return;
      startYRef.current = event.touches[0]?.clientY ?? 0;
      pullingRef.current = true;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!pullingRef.current || refreshingRef.current) return;
      if (!esMovilPullToRefresh()) {
        limpiarGestos();
        return;
      }
      if (el.scrollTop > 1) {
        limpiarGestos();
        return;
      }

      const currentY = event.touches[0]?.clientY ?? startYRef.current;
      const delta = currentY - startYRef.current;
      if (delta <= 0) {
        pullRef.current = 0;
        setPullDistance(0);
        return;
      }

      const pull = Math.min(delta * PULL_RESISTANCE, MAX_PULL_PX);
      pullRef.current = pull;
      setPullDistance(pull);
      if (pull > 8) {
        event.preventDefault();
      }
    };

    const onTouchEnd = () => {
      if (!pullingRef.current) return;
      pullingRef.current = false;
      if (pullRef.current >= PULL_THRESHOLD_PX) {
        void ejecutarRefresh();
        return;
      }
      limpiarGestos();
    };

    const mq = window.matchMedia(MOBILE_MQ);
    const onMqChange = () => {
      if (!mq.matches) limpiarGestos();
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    mq.addEventListener('change', onMqChange);

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      mq.removeEventListener('change', onMqChange);
    };
  }, [containerRef, disabled, ejecutarRefresh]);

  const pullProgress = Math.min(1, pullDistance / PULL_THRESHOLD_PX);

  return { pullDistance, isRefreshing, pullProgress };
}
