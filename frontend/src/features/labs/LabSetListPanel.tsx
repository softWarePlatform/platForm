import { useState } from "react";
import { Link } from "react-router-dom";
import { formatDateTime, labSetTimeBannerStyle } from "./labSetAccess";
import type {
  LabSetOverviewGroup,
  StudentLabSetOverviewCard,
  TeacherLabSetOverviewCard,
} from "./labSetTypes";

type BaseProps = {
  loading?: boolean;
  err?: string | null;
  /** 跨课程列表时展示课程名 */
  showCourseName?: boolean;
  emptyHint?: string;
  headerRight?: React.ReactNode;
};

type StudentProps = BaseProps & {
  mode: "student";
  groups: LabSetOverviewGroup<StudentLabSetOverviewCard>[];
};

type TeacherProps = BaseProps & {
  mode: "teacher";
  groups: LabSetOverviewGroup<TeacherLabSetOverviewCard>[];
  onDelete?: (
    courseId: string,
    labSetId: string,
    title: string,
    problemCount: number,
  ) => void | Promise<void>;
};

type Props = StudentProps | TeacherProps;

function ProgressBar({ done, total, completed }: { done: number; total: number; completed: boolean }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const fillColor = completed ? "var(--ok, #3fb950)" : "var(--warn, #d4a017)";
  return (
    <div style={{ marginTop: 8 }}>
      <div className="spread muted" style={{ fontSize: 12, marginBottom: 4 }}>
        <span>完成进度</span>
        <span>
          {done}/{total} 题{total > 0 ? ` · ${pct}%` : ""}
        </span>
      </div>
      <div className="progress-bar">
        <div
          className="progress-bar-fill"
          style={{ width: `${pct}%`, background: fillColor }}
        />
      </div>
    </div>
  );
}

function LabSetCard({
  item,
  mode,
  showCourseName,
  onDelete,
}: {
  item: StudentLabSetOverviewCard | TeacherLabSetOverviewCard;
  mode: "student" | "teacher";
  showCourseName: boolean;
  onDelete?: TeacherProps["onDelete"];
}) {
  const access = item.access;
  const statusStyle = labSetTimeBannerStyle(access);

  const isStudent = mode === "student";
  const studentItem = isStudent ? (item as StudentLabSetOverviewCard) : null;
  const teacherItem = !isStudent ? (item as TeacherLabSetOverviewCard) : null;

  return (
    <div
      className="course-list-item"
      style={{
        flexDirection: "column",
        alignItems: "stretch",
        gap: 10,
        padding: "14px 16px",
      }}
    >
      <div className="row spread" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700 }}>{item.title}</div>
          {showCourseName ? (
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              {item.courseTitle}
            </div>
          ) : null}
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            {item.problemCount} 道题目
            {item.dueAt ? ` · 截止 ${formatDateTime(item.dueAt)}` : " · 未设置截止时间"}
          </div>
        </div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            padding: "4px 10px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            ...statusStyle,
          }}
        >
          {access.statusLabel}
        </span>
      </div>

      {isStudent && studentItem ? (
        <>
          <ProgressBar
            done={studentItem.progress.done}
            total={studentItem.progress.total}
            completed={studentItem.completed}
          />
          <div className="muted" style={{ fontSize: 13 }}>
            得分：{studentItem.score == null ? "—" : Number(studentItem.score).toFixed(1)}
          </div>
        </>
      ) : null}

      {!isStudent && teacherItem ? (
        <div className="muted" style={{ fontSize: 13 }}>
          完成人数：{teacherItem.completion.solved}/{teacherItem.completion.enrolled}
        </div>
      ) : null}

      <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <Link className="btn primary" to={`/courses/${item.courseId}/lab-sets/${item.id}`}>
          进入实验
        </Link>
        {!isStudent ? (
          <>
            <Link className="btn" to={`/courses/${item.courseId}/lab-sets/${item.id}/manage`}>
              管理
            </Link>
            {onDelete ? (
              <button
                type="button"
                className="btn"
                style={{ color: "#f85149" }}
                onClick={() =>
                  void onDelete(item.courseId, item.id, item.title, item.problemCount)
                }
              >
                删除
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function LabSetListPanel(props: Props) {
  const {
    mode,
    loading = false,
    err = null,
    showCourseName = false,
    emptyHint = "暂无实验集",
    headerRight = null,
  } = props;

  const groups = props.groups;
  const onDelete = props.mode === "teacher" ? props.onDelete : undefined;

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  function toggle(status: string) {
    setCollapsed((prev) => ({ ...prev, [status]: !prev[status] }));
  }

  const total = groups.reduce((n, g) => n + g.items.length, 0);

  if (loading) {
    return <div className="muted" style={{ padding: 24, textAlign: "center" }}>加载实验列表…</div>;
  }

  if (err) {
    return <div className="err">{err}</div>;
  }

  return (
    <section className="dash-panel" style={{ padding: 0, background: "transparent", border: "none" }}>
      {headerRight ? (
        <div className="spread" style={{ marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <span className="muted" style={{ fontSize: 13 }}>
            共 {total} 个实验集
          </span>
          {headerRight}
        </div>
      ) : total > 0 ? (
        <div className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
          共 {total} 个实验集
        </div>
      ) : null}

      {groups.length === 0 ? (
        <div className="course-section-empty">{emptyHint}</div>
      ) : (
        groups.map((group) => {
          const isCollapsed = collapsed[group.status];
          return (
            <div key={group.status} style={{ marginBottom: 16 }}>
              <button
                type="button"
                className="course-group-toggle"
                onClick={() => toggle(group.status)}
              >
                <span>{isCollapsed ? "▸" : "▾"}</span>
                <span style={{ fontWeight: 700 }}>{group.label}</span>
                <span className="muted" style={{ fontWeight: 400 }}>
                  {group.items.length} 个
                </span>
              </button>
              {!isCollapsed ? (
                <div className="grid" style={{ marginTop: 10, gap: 10 }}>
                  {group.items.map((item) => (
                    <LabSetCard
                      key={item.id}
                      item={item}
                      mode={mode}
                      showCourseName={showCourseName}
                      onDelete={onDelete}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })
      )}
    </section>
  );
}
