export default function MetaChips({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="meta-chips">
      {items.map((label) => (
        <span key={label} className="meta-chips__item">
          {label}
        </span>
      ))}
    </div>
  );
}
