type SearchFields = {
  courseCode: string;
  teacher: string;
  scheduleTime: string;
  scheduleRoom: string;
  className: string;
};

type Props = {
  value: SearchFields;
  onChange: (v: SearchFields) => void;
};

const FIELDS: { key: keyof SearchFields; label: string; placeholder: string }[] = [
  { key: "courseCode", label: "\u8bfe\u7a0b\u4ee3\u7801", placeholder: "\u5982 CS101" },
  { key: "teacher", label: "\u6559\u5e08", placeholder: "\u6559\u5e08\u59d3\u540d" },
  { key: "scheduleTime", label: "\u4e0a\u8bfe\u65f6\u95f4", placeholder: "\u5982 \u5468\u4e00\u3001\u7b2c3\u8282" },
  { key: "scheduleRoom", label: "\u4e0a\u8bfe\u5730\u70b9", placeholder: "\u5982 A301" },
  { key: "className", label: "\u4e0a\u8bfe\u73ed\u7ea7", placeholder: "\u5982 \u8ba1\u7b97\u673a1\u73ed" },
];

export default function EnrollmentSearchBar({ value, onChange }: Props) {
  return (
    <div className="enroll-search-panel">
      <div className="enroll-search-title">{"\u641c\u7d22"}</div>
      <div className="enroll-search-grid">
        {FIELDS.map(({ key, label, placeholder }) => (
          <div key={key}>
            <label>{label}</label>
            <input
              value={value[key]}
              onChange={(e) => onChange({ ...value, [key]: e.target.value })}
              placeholder={placeholder}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export type { SearchFields };
