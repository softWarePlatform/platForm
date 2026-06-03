import { Link, useParams } from "react-router-dom";
import LabSetTimeBanner from "../LabSetTimeBanner";
import LabExplorerBreadcrumb from "./LabExplorerBreadcrumb";
import LabExplorerLegend from "./LabExplorerLegend";
import LabProblemRow from "./LabProblemRow";
import {
  formatLabExplorerDateRange,
  formatLabExplorerScore,
  labProblemGridTone,
} from "./labExplorerStatus";
import { useLabSetMyProgress } from "./useLabSetMyProgress";

type Props = {
  embedded?: boolean;
  courseIdProp?: string;
  labSetIdProp?: string;
  listPathPrefix?: string;
};

export default function LabExplorerProblems({
  embedded = false,
  courseIdProp,
  labSetIdProp,
  listPathPrefix,
}: Props) {
  const { courseId: courseIdParam, labSetId: labSetIdParam } = useParams();
  const courseId = courseIdProp ?? courseIdParam;
  const labSetId = labSetIdProp ?? labSetIdParam;
  const { data, err, loading, reload } = useLabSetMyProgress(courseId, labSetId);

  const labSet = data?.labSet;
  const labs = data?.labs ?? [];
  const listPath =
    listPathPrefix ??
    (embedded ? `/courses/${courseId}/labs` : `/my-labs/${courseId}`);

  return (
    <div className="lab-explorer">
      <div className="lab-explorer-panel">
        <div className="spread" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 className="lab-explorer-title">{labSet?.title ?? "实验作业"}</h2>
            {labSet ? (
              <p className="lab-explorer-desc">
                {formatLabExplorerDateRange(labSet.startAt, labSet.dueAt)}
                {labSet.score != null ? ` · 均分 ${formatLabExplorerScore(labSet.score)}` : ""}
              </p>
            ) : null}
          </div>
          <button type="button" className="btn" onClick={() => void reload()}>
            刷新
          </button>
        </div>

        <LabExplorerBreadcrumb
          items={
            embedded
              ? [
                  { label: "课程", to: `/courses/${courseId}` },
                  { label: "实验", to: `/courses/${courseId}/labs` },
                  { label: labSet?.title ?? "题目" },
                ]
              : [
                  { label: "全部课程", to: "/my-labs" },
                  { label: "课程实验", to: listPath },
                  { label: labSet?.title ?? "题目" },
                ]
          }
        />

        <LabExplorerLegend
          items={[
            { tone: "gray", label: "未做" },
            { tone: "red", label: "WA" },
            { tone: "green", label: "AC" },
          ]}
        />
      </div>

      {labSet ? (
        <div className="lab-explorer-banner-wrap">
          <LabSetTimeBanner labSet={labSet} />
        </div>
      ) : null}

      {err ? <div className="err" style={{ marginTop: 12 }}>{err}</div> : null}
      {loading ? <div className="muted lab-explorer-loading">加载中…</div> : null}

      {!loading && labs.length === 0 && !err ? (
        <div className="course-section-empty lab-explorer-empty">暂无题目。</div>
      ) : null}

      {!loading && labs.length > 0 ? (
        <div className="lab-problem-list">
          {labs.map((lab) => (
            <LabProblemRow
              key={lab.id}
              to={`/courses/${courseId}/labs/${lab.id}`}
              tone={labProblemGridTone(lab.gridStatus)}
              status={lab.gridStatus}
              title={lab.title}
              language={lab.language}
              score={lab.bestScore != null ? formatLabExplorerScore(lab.bestScore) : undefined}
            />
          ))}
        </div>
      ) : null}

      <p className="muted lab-explorer-foot">
        <Link to={listPath}>← 返回作业列表</Link>
      </p>
    </div>
  );
}
