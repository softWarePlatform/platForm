import { Link } from "react-router-dom";

type Crumb = { label: string; to?: string };

export default function LabExplorerBreadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav className="lab-explorer-crumb" aria-label="实验导航">
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="lab-explorer-crumb__item">
          {i > 0 ? <span className="lab-explorer-crumb__sep">/</span> : null}
          {item.to ? (
            <Link to={item.to} className="lab-explorer-crumb__link">
              {item.label}
            </Link>
          ) : (
            <span className="lab-explorer-crumb__current">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
