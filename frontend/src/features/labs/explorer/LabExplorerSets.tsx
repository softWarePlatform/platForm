import { Link, useParams } from "react-router-dom";
import { useLabSetOverview } from "../useLabSetOverview";
import type { LabSetOverviewGroup, StudentLabSetOverviewCard } from "../labSetTypes";
import LabAssignmentBar from "./LabAssignmentBar";
import LabExplorerBreadcrumb from "./LabExplorerBreadcrumb";
import LabExplorerLegend from "./LabExplorerLegend";
import {
  formatLabExplorerDateRange,
  formatLabExplorerScore,
  labSetGridTone,
  sortLabSetsForDisplay,
} from "./labExplorerStatus";

type Props = {
  embedded?: boolean;
  courseIdProp?: string;
  setsLinkPrefix?: string;
};

export default function LabExplorerSets({
  embedded = false,
  courseIdProp,
  setsLinkPrefix,
}: Props) {
  const { courseId: courseIdParam } = useParams();
  const courseId = courseIdProp ?? courseIdParam;
  const { data, err, loading, reload } = useLabSetOverview("student", courseId);
  const groups = (data?.groups as LabSetOverviewGroup<StudentLabSetOverviewCard>[] | undefined) ?? [];
  const sets = sortLabSetsForDisplay(groups.flatMap((g) => g.items));
  const courseTitle = sets[0]?.courseTitle ?? "课程实验";

  const backTo = embedded ? `/courses/${courseId}` : "/my-labs";
  const setBase = setsLinkPrefix ?? (embedded ? `/courses/${courseId}/lab-sets` : `/my-labs/${courseId}`);

  return (
    <div className="lab-explorer">
      <div className="lab-explorer-panel">
        {!embedded ? (
          <div className="spread" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 className="lab-explorer-title">{courseTitle}</h2>
              <p className="lab-explorer-desc">每次作业一行，点击进入查看各题 AC / WA。</p>
            </div>
            <button type="button" className="btn" onClick={() => void reload()}>
              刷新
            </button>
          </div>
        ) : (
          <div className="spread" style={{ alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <h3 className="lab-explorer-title" style={{ margin: 0, fontSize: 17 }}>
              学习情况
            </h3>
            <button type="button" className="btn" onClick={() => void reload()}>
              刷新
            </button>
          </div>
        )}

        <LabExplorerBreadcrumb
          items={
            embedded
              ? [
                  { label: "课程", to: `/courses/${courseId}` },
                  { label: "实验", to: `/courses/${courseId}/labs` },
                  { label: "学习情况" },
                ]
              : [
                  { label: "全部课程", to: "/my-labs" },
                  { label: courseTitle },
                ]
          }
        />

        <LabExplorerLegend
          items={[
            { tone: "gray", label: "未做" },
            { tone: "yellow", label: "进行中" },
            { tone: "green", label: "已全部通过" },
          ]}
        />
      </div>

      {err ? <div className="err" style={{ marginTop: 12 }}>{err}</div> : null}
      {loading ? <div className="muted lab-explorer-loading">加载中…</div> : null}

      {!loading && sets.length === 0 ? (
        <div className="course-section-empty lab-explorer-empty">暂无实验集，请等待教师发布。</div>
      ) : null}

      {!loading && sets.length > 0 ? (
        <div className="lab-assign-list">
          {sets.map((set) => {
            const tone = labSetGridTone(set);
            return (
              <LabAssignmentBar
                key={set.id}
                to={`${setBase}/${set.id}`}
                tone={tone}
                title={set.title}
                dateRange={formatLabExplorerDateRange(set.startAt, set.dueAt)}
                score={formatLabExplorerScore(set.score)}
                done={set.progress.done}
                total={set.progress.total}
                accessLabel={set.access.statusLabel}
              />
            );
          })}
        </div>
      ) : null}

      {!embedded ? (
        <p className="muted lab-explorer-foot">
          <Link to={backTo}>← 返回课程列表</Link>
        </p>
      ) : null}
    </div>
  );
}
