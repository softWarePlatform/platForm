/** 当前学期 key 与展示标签（与 dashboard 口径一致） */
export function currentSemester() {
  const now = new Date();
  const y = now.getFullYear();
  const spring = now.getMonth() >= 1 && now.getMonth() <= 7;
  return {
    key: `${y}-${spring ? "spring" : "fall"}`,
    label: `${y}-${y + 1} ${spring ? "春季" : "秋季"}学期`,
  };
}
