type Item = { tone: string; label: string };

export default function LabExplorerLegend({ items }: { items: Item[] }) {
  return (
    <div className="lab-explorer-legend" role="list">
      {items.map((item) => (
        <span key={item.label} className="lab-explorer-legend__item" role="listitem">
          <span className={`lab-explorer-legend__dot lab-explorer-legend__dot--${item.tone}`} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
