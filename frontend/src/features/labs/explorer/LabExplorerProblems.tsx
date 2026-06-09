import { Link, useParams } from "react-router-dom";
import LabSetTimeBanner from "../LabSetTimeBanner";
import LabExplorerBreadcrumb from "./LabExplorerBreadcrumb";
import LabProblemRow from "./LabProblemRow";
import PageHeader from "../../../components/layout/PageHeader";
import {
  formatLabExplorerDateRange,
  formatLabExplorerScore,
  labProblemGridTone,
} from "./labExplorerStatus";
import { useLabSetMyProgress } from "./useLabSetMyProgress";
import EmptyState from "../../../components/layout/EmptyState";

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

  const leadParts = [
    labSet ? formatLabExplorerDateRange(labSet.startAt, labSet.dueAt) : null,
    labSet?.score != null ? `均分 ${formatLabExplorerScore(labSet.score)}` : null,
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title={labSet?.title ?? "实验作业"}
        lead={leadParts.join(" · ") || `${labs.length} 道题`}
        actions={
          <button type="button" className="btn" onClick={() => void reload()}>
            刷新
          </button>
        }
        below={
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
        }
      />

      {labSet ? (
        <div className="lab-explorer-banner-wrap">
          <LabSetTimeBanner labSet={labSet} />
        </div>
      ) : null}

      {err ? <div className="page-alert err">{err}</div> : null}
      {loading ? <div className="panel-loading muted">加载中…</div> : null}

      {!loading && labs.length === 0 && !err ? <EmptyState title="暂无题目" /> : null}

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
    </>
  );
}
