import { useState } from "react";

export type FilterTab = "nature" | "category" | "college";

type FilterOptions = {
  courseNatures: Record<string, string>;
  subjectCategories: Record<string, string>;
  offeringColleges: Record<string, string>;
};

type Props = {
  options: FilterOptions;
  natures: string[];
  categories: string[];
  colleges: string[];
  onNaturesChange: (v: string[]) => void;
  onCategoriesChange: (v: string[]) => void;
  onCollegesChange: (v: string[]) => void;
};

const TAB_LABELS: { key: FilterTab; label: string }[] = [
  { key: "nature", label: "\u8bfe\u7a0b\u6027\u8d28" },
  { key: "category", label: "\u8bfe\u7a0b\u7c7b\u522b" },
  { key: "college", label: "\u5f00\u8bfe\u5b66\u9662" },
];

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

function labelFor(
  options: FilterOptions,
  tab: FilterTab,
  code: string,
): string {
  if (tab === "nature") return options.courseNatures[code] ?? code;
  if (tab === "category") return options.subjectCategories[code] ?? code;
  const name = options.offeringColleges[code];
  return name ? `${code}\uff1a${name}` : code;
}

export default function EnrollmentFilterPanel({
  options,
  natures,
  categories,
  colleges,
  onNaturesChange,
  onCategoriesChange,
  onCollegesChange,
}: Props) {
  const [activeTab, setActiveTab] = useState<FilterTab | null>(null);

  const countFor = (tab: FilterTab) =>
    tab === "nature" ? natures.length : tab === "category" ? categories.length : colleges.length;

  const activeEntries: [string, string][] =
    activeTab === "nature"
      ? Object.entries(options.courseNatures)
      : activeTab === "category"
        ? Object.entries(options.subjectCategories)
        : activeTab === "college"
          ? Object.entries(options.offeringColleges)
          : [];

  const activeSelected =
    activeTab === "nature" ? natures : activeTab === "category" ? categories : colleges;

  const onActiveChange =
    activeTab === "nature"
      ? onNaturesChange
      : activeTab === "category"
        ? onCategoriesChange
        : onCollegesChange;

  const clearActive = () => {
    if (activeTab === "nature") onNaturesChange([]);
    else if (activeTab === "category") onCategoriesChange([]);
    else if (activeTab === "college") onCollegesChange([]);
  };

  const clearAll = () => {
    onNaturesChange([]);
    onCategoriesChange([]);
    onCollegesChange([]);
  };

  const hasAny = natures.length > 0 || categories.length > 0 || colleges.length > 0;

  return (
    <div className="enroll-filter-panel">
      <div className="enroll-filter-head">
        <span className="enroll-filter-title">{"\u7b5b\u9009"}</span>
        <div className="enroll-filter-tabs">
          {TAB_LABELS.map(({ key, label }) => {
            const n = countFor(key);
            return (
              <button
                key={key}
                type="button"
                className={`enroll-filter-tab${activeTab === key ? " active" : ""}`}
                onClick={() => setActiveTab(activeTab === key ? null : key)}
              >
                {label}
                {n > 0 ? <span className="enroll-filter-tab-badge">{n}</span> : null}
              </button>
            );
          })}
        </div>
        {hasAny ? (
          <button type="button" className="enroll-filter-clear-all" onClick={clearAll}>
            {"\u6e05\u9664\u5168\u90e8"}
          </button>
        ) : null}
      </div>

      {activeTab ? (
        <div className="enroll-filter-body">
          <button
            type="button"
            className={`enroll-filter-option${activeSelected.length === 0 ? " selected" : ""}`}
            onClick={clearActive}
          >
            {"\u4e0d\u9650"}
          </button>
          {activeEntries.map(([code, label]) => (
            <button
              key={code}
              type="button"
              className={`enroll-filter-option${activeSelected.includes(code) ? " selected" : ""}`}
              onClick={() => onActiveChange(toggle(activeSelected, code))}
              title={label}
            >
              {activeTab === "college" ? `${code}\uff1a${label}` : label}
            </button>
          ))}
        </div>
      ) : null}

      {hasAny ? (
        <div className="enroll-filter-applied">
          <span className="enroll-filter-applied-label">{"\u5df2\u9009\u6761\u4ef6\uff08\u540c\u65f6\u6ee1\u8db3\uff09\uff1a"}</span>
          {natures.map((code) => (
            <span key={`n-${code}`} className="enroll-filter-tag">
              {labelFor(options, "nature", code)}
              <button type="button" aria-label="remove" onClick={() => onNaturesChange(natures.filter((x) => x !== code))}>
                {"\u00d7"}
              </button>
            </span>
          ))}
          {categories.map((code) => (
            <span key={`c-${code}`} className="enroll-filter-tag">
              {labelFor(options, "category", code)}
              <button type="button" aria-label="remove" onClick={() => onCategoriesChange(categories.filter((x) => x !== code))}>
                {"\u00d7"}
              </button>
            </span>
          ))}
          {colleges.map((code) => (
            <span key={`o-${code}`} className="enroll-filter-tag">
              {labelFor(options, "college", code)}
              <button type="button" aria-label="remove" onClick={() => onCollegesChange(colleges.filter((x) => x !== code))}>
                {"\u00d7"}
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
