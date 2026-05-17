import { useEffect, useState } from "react";
import { api } from "../api/client";

function clampInt(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

type NumberStepInputProps = {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
};

function NumberStepInput({ value, onChange, min, max }: NumberStepInputProps) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  function commit(raw: string) {
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed === "-") {
      onChange(min);
      setDraft(String(min));
      return;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      const next = clampInt(parsed, min, max);
      onChange(next);
      setDraft(String(next));
      return;
    }
    setDraft(String(value));
  }

  return (
    <input
      type="number"
      min={min}
      max={max}
      step={1}
      inputMode="numeric"
      value={focused ? draft : value}
      onFocus={() => {
        setFocused(true);
        setDraft(String(value));
      }}
      onChange={(e) => {
        const raw = e.target.value;
        if (focused) {
          setDraft(raw);
          if (raw === "" || raw === "-") return;
          const parsed = Number(raw);
          if (Number.isFinite(parsed)) onChange(clampInt(parsed, min, max));
          return;
        }
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) onChange(clampInt(parsed, min, max));
      }}
      onBlur={() => {
        setFocused(false);
        commit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export type CourseEnrollmentDraft = {
  courseCode: string;
  credits: number;
  capacity: number;
  courseNature: string;
  subjectCategory: string;
  offeringCollegeCode: string;
};

export function emptyEnrollmentDraft(): CourseEnrollmentDraft {
  return {
    courseCode: "",
    credits: 2,
    capacity: 60,
    courseNature: "ELECTIVE",
    subjectCategory: "GENERAL_MAJOR",
    offeringCollegeCode: "",
  };
}

export function enrollmentFromCourse(course: {
  courseCode?: string | null;
  credits?: number;
  capacity?: number;
  courseNature?: string;
  subjectCategory?: string;
  offeringCollegeCode?: string | null;
}): CourseEnrollmentDraft {
  return {
    courseCode: course.courseCode ?? "",
    credits: course.credits ?? 2,
    capacity: course.capacity ?? 60,
    courseNature: course.courseNature ?? "ELECTIVE",
    subjectCategory: course.subjectCategory ?? "GENERAL_MAJOR",
    offeringCollegeCode: course.offeringCollegeCode ?? "",
  };
}

export function enrollmentToPayload(
  draft: CourseEnrollmentDraft,
  opts?: { clearEmptyCode?: boolean },
) {
  const code = draft.courseCode.trim();
  return {
    courseCode: opts?.clearEmptyCode ? code || null : code || undefined,
    credits: draft.credits,
    capacity: draft.capacity,
    courseNature: draft.courseNature,
    subjectCategory: draft.subjectCategory,
    offeringCollegeCode: draft.offeringCollegeCode.trim() || null,
  };
}

type Options = {
  courseNatures: Record<string, string>;
  subjectCategories: Record<string, string>;
  offeringColleges: Record<string, string>;
  semester?: { key: string; label: string };
};

type Props = {
  value: CourseEnrollmentDraft;
  onChange: (v: CourseEnrollmentDraft) => void;
  options?: Options | null;
};

export function useEnrollmentFieldOptions() {
  const [options, setOptions] = useState<Options | null>(null);
  useEffect(() => {
    api
      .get<Options>("/courses/enrollment-field-options")
      .then(({ data }) => setOptions(data))
      .catch(() => setOptions(null));
  }, []);
  return options;
}

export default function CourseEnrollmentFields({ value, onChange, options }: Props) {
  const set = <K extends keyof CourseEnrollmentDraft>(key: K, v: CourseEnrollmentDraft[K]) => {
    onChange({ ...value, [key]: v });
  };

  if (!options) {
    return <div className="muted">加载选课字段选项…</div>;
  }

  return (
    <div className="grid" style={{ gap: 12 }}>
      {options.semester ? (
        <div className="muted" style={{ fontSize: 13 }}>
          开课学期：{options.semester.label}（{options.semester.key}）
        </div>
      ) : null}
      <div className="field">
        <label>课程代码</label>
        <input
          value={value.courseCode}
          onChange={(e) => set("courseCode", e.target.value)}
          placeholder="如 CS101（选课系统唯一标识）"
        />
      </div>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="field">
          <label>学分</label>
          <NumberStepInput
            value={value.credits}
            min={1}
            max={20}
            onChange={(n) => set("credits", n)}
          />
        </div>
        <div className="field">
          <label>课容量</label>
          <NumberStepInput
            value={value.capacity}
            min={1}
            max={9999}
            onChange={(n) => set("capacity", n)}
          />
        </div>
      </div>
      <div className="field">
        <label>课程性质</label>
        <select value={value.courseNature} onChange={(e) => set("courseNature", e.target.value)}>
          {Object.entries(options.courseNatures).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>课程类别</label>
        <select
          value={value.subjectCategory}
          onChange={(e) => set("subjectCategory", e.target.value)}
        >
          {Object.entries(options.subjectCategories).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>开课单位（学院）</label>
        <select
          value={value.offeringCollegeCode}
          onChange={(e) => set("offeringCollegeCode", e.target.value)}
        >
          <option value="">请选择开课学院</option>
          {Object.entries(options.offeringColleges).map(([code, name]) => (
            <option key={code} value={code}>
              {code}：{name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
