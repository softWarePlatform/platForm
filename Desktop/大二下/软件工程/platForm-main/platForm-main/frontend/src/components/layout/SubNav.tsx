import { NavLink } from "react-router-dom";

export type SubNavItem = {
  to: string;
  label: string;
  end?: boolean;
};

type Props = {
  items: SubNavItem[];
  className?: string;
};

export default function SubNav({ items, className = "" }: Props) {
  return (
    <nav className={`subnav ${className}`.trim()} aria-label="模块导航">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => `subnav__link${isActive ? " subnav__link--active" : ""}`}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
