import { useState } from "react";
import { Link } from "react-router-dom";
import EmptyState from "../../components/layout/EmptyState";
import MetaChips from "../../components/layout/MetaChips";
import TeachingLabSetCard from "../teaching/TeachingLabSetCard";
import { formatDateTime, labSetTimeBannerStyle } from "./labSetAccess";
import type {
  LabSetOverviewGroup,
  StudentLabSetOverviewCard,
  TeacherLabSetOverviewCard,
} from "./labSetTypes";

type BaseProps = {
  loading?: boolean;
  err?: string | null;
  showCourseName?: boolean;
  emptyHint?: string;
  headerRight?: React.ReactNode;
  variant?: "default" | "vivid";
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
  return (
    <div className="entity-card__progress">
      <div className="spread muted" style={{ fontSize: 12, marginBottom: 4 }}>
        <span>进度</span>
        <span>
          {done}/{total} · {pct}%
        </span>
      </div>
      <div className="progress-bar">
        <div
          className="progress-bar-fill"
          style={{
            width: `${pct}%`,
            background: completed
              ? "linear-gradient(90deg, var(--ok), #4ade80)"
              : "linear-gradient(90deg, var(--warn), #fbbf24)",
          }}
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

  const chips = [
    `${item.problemCount} 题`,
    item.dueAt ? `截止 ${formatDateTime(item.dueAt)}` : "无截止",
  ];
  if (teacherItem) {
    chips.push(`完成 ${teacherItem.completion.solved}/${teacherItem.completion.enrolled}`);
  }
  if (isStudent && studentItem?.score != null) {
    chips.push(`均分 ${Number(studentItem.score).toFixed(1)}`);
  }

  return (
    <article className="entity-card">
      <div className="entity-card__head">
        <div className="entity-card__head-text">
          <h3 className="entity-card__title">{item.title}</h3>
          {showCourseName ? <div className="entity-card__sub">{item.courseTitle}</div> : null}
        </div>
        <span className="status-badge status-badge--brand" style={statusStyle}>
          {access.statusLabel}
        </span>
      </div>

      <MetaChips items={chips} />

      {isStudent && studentItem ? (
        <ProgressBar
          done={studentItem.progress.done}
          total={studentItem.progress.total}
          completed={studentItem.completed}
        />
      ) : null}

      <div className="entity-card__actions">
        <Link className="btn primary btn--sm" to={`/courses/${item.courseId}/labs/sets/${item.id}`}>
          {isStudent ? "进入" : "查看"}
        </Link>
        {!isStudent ? (
          <>
            <Link className="btn btn--sm" to={`/courses/${item.courseId}/lab-sets/${item.id}/manage`}>
              管理
            </Link>
            {onDelete ? (
              <button
                type="button"
                className="btn btn--sm btn--danger"
                onClick={() => void onDelete(item.courseId, item.id, item.title, item.problemCount)}
              >
                删除
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </article>
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
    variant = "default",
  } = props;

  const groups = props.groups;
  const onDelete = props.mode === "teacher" ? props.onDelete : undefined;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  function toggle(status: string) {
    setCollapsed((prev) => ({ ...prev, [status]: !prev[status] }));
  }

  const total = groups.reduce((n, g) => n + g.items.length, 0);

  if (loading) {
    return <div className="panel-loading muted">加载中…</div>;
  }

  if (err) {
    return <div className="page-alert err">{err}</div>;
  }

  const isVivid = variant === "vivid";
  const panelClass = isVivid ? "teach-labs-panel-inner" : "list-panel";
  const groupClass = isVivid ? "teach-list-group" : "list-panel__group";
  const toggleClass = isVivid ? "teach-list-group__toggle" : "list-panel__toggle";
  const gridClass = isVivid ? "teach-lab-grid" : "entity-card-grid";

  return (
    <section className={panelClass}>
      {headerRight ? (
        <div className={isVivid ? "teach-toolbar" : "list-panel__toolbar spread"}>{headerRight}</div>
      ) : total > 0 ? (
        <div className={isVivid ? "teach-toolbar__hint" : "list-panel__toolbar muted"}>{total} 项</div>
      ) : null}

      {groups.length === 0 ? (
        <EmptyState title={emptyHint} />
      ) : (
        groups.map((group) => {
          const isCollapsed = collapsed[group.status];
          return (
            <div key={group.status} className={groupClass}>
              <button type="button" className={toggleClass} onClick={() => toggle(group.status)}>
                <span>{isCollapsed ? "▸" : "▾"}</span>
                <span className={isVivid ? undefined : "list-panel__toggle-label"}>{group.label}</span>
                <span className={isVivid ? "teach-list-group__count" : "muted"}>{group.items.length}</span>
              </button>
              {!isCollapsed ? (
                <div className={gridClass}>
                  {group.items.map((item) =>
                    isVivid ? (
                      <TeachingLabSetCard
                        key={item.id}
                        item={item}
                        mode={mode}
                        showCourseName={showCourseName}
                        onDelete={onDelete}
                      />
                    ) : (
                      <LabSetCard
                        key={item.id}
                        item={item}
                        mode={mode}
                        showCourseName={showCourseName}
                        onDelete={onDelete}
                      />
                    ),
                  )}
                </div>
              ) : null}
            </div>
          );
        })
      )}
    </section>
  );
}
