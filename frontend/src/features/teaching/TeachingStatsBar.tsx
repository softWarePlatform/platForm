type StatTone = "blue" | "purple" | "teal" | "amber";

export type TeachingStat = {
  key: string;
  label: string;
  value: string;
  tone: StatTone;
  icon: string;
};

export default function TeachingStatsBar({ items }: { items: TeachingStat[] }) {
  if (items.length === 0) return null;

  return (
    <div className="dash-stats teach-stats">
      {items.map((c) => (
        <article key={c.key} className={`dash-stat dash-stat--${c.tone}`}>
          <span className="dash-stat__icon" aria-hidden>
            {c.icon}
          </span>
          <div className="dash-stat__body">
            <div className="dash-stat__value">{c.value}</div>
            <div className="dash-stat__label">{c.label}</div>
          </div>
        </article>
      ))}
    </div>
  );
}
