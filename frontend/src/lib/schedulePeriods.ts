/** 北航课表：每天 14 节课 */
export const MAX_SCHEDULE_PERIODS = 14;

export const PERIOD_OPTIONS = Array.from(
  { length: MAX_SCHEDULE_PERIODS },
  (_, i) => i + 1,
);
