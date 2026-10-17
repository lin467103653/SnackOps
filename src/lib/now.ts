/**
 * 请求级时间基准。
 *
 * React 的 purity 规则不允许组件在渲染期直接调用 `Date.now()`（结果会随重渲染漂移），
 * 而运营台又必须展示「本次请求」的 SLA 判定。所以把时间来源收敛到这里：
 * - 页面只拿一次 now，全页共用，保证同一屏内判断一致；
 * - 需要固定时间的测试/截图可以注入 override。
 */
export function requestNow(override?: Date): Date {
  return override ?? new Date();
}

/** 是否已过期（仅比较时间，业务状态由调用方判断） */
export function isPastDue(iso: string, now: Date): boolean {
  const time = new Date(iso).getTime();
  return Number.isFinite(time) && time < now.getTime();
}
