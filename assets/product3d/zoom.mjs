import * as THREE from '../vendor/three/three.module.js';

export const DETAIL_MIN_PERCENT = 100;
export const DETAIL_MAX_PERCENT = 600;

// Keep the camera outside the product's bounds even while orbiting around a
// close surface target. A side view may therefore stop before the 600% cap.
export function safeDetailDistance(bounds, target, direction, padding = 0.01) {
  if (!bounds || bounds.isEmpty()) return 0;
  const safeBounds = bounds.clone().expandByScalar(padding);
  if (!safeBounds.containsPoint(target)) return 0;
  const unit = direction.clone().normalize();
  let exit = Infinity;
  for (const axis of ['x', 'y', 'z']) {
    if (Math.abs(unit[axis]) < 1e-8) continue;
    const edge = unit[axis] > 0 ? safeBounds.max[axis] : safeBounds.min[axis];
    exit = Math.min(exit, (edge - target[axis]) / unit[axis]);
  }
  return Number.isFinite(exit) ? Math.max(0, exit) + 0.002 : 0;
}

export function clampDetailDistance(distance, fitDistance, safeMinimum = 0, maxPercent = DETAIL_MAX_PERCENT) {
  const min = Math.max(fitDistance * 100 / maxPercent, safeMinimum);
  const max = Math.max(min, fitDistance * 100 / DETAIL_MIN_PERCENT);
  return THREE.MathUtils.clamp(distance, min, max);
}

export function detailZoomMetrics(enabled, fitDistance, distance, safeMinimum = 0, maxPercent = DETAIL_MAX_PERCENT) {
  const minDistance = Math.max(fitDistance * 100 / maxPercent, safeMinimum);
  const maximum = fitDistance > 0 && minDistance > 0
    ? Math.min(maxPercent, Math.floor(fitDistance / minDistance * 100 + 1e-8)) : maxPercent;
  const rawPercent = fitDistance > 0 && distance > 0 ? Math.round(fitDistance / distance * 100) : 100;
  return {
    enabled: Boolean(enabled),
    percent: enabled ? THREE.MathUtils.clamp(rawPercent, DETAIL_MIN_PERCENT, maxPercent) : rawPercent,
    minPercent: DETAIL_MIN_PERCENT,
    maxPercent: maximum,
    canZoomIn: Boolean(enabled) && distance > minDistance * 1.001,
    canZoomOut: Boolean(enabled) && distance < fitDistance * 0.999,
  };
}
