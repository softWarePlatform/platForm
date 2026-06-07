import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useLabSetOverview } from "../useLabSetOverview";
import type { LabSetOverviewGroup, StudentLabSetOverviewCard } from "../labSetTypes";
import LabAssignmentBar from "./LabAssignmentBar";
import LabExplorerBreadcrumb from "./LabExplorerBreadcrumb";
import ListPagination from "../../../components/layout/ListPagination";
import PageHeader from "../../../components/layout/PageHeader";
import { LabListSkeleton } from "../../../components/layout/PageSkeleton";
import { usePagination } from "../../../hooks/usePagination";
import {
  formatLabExplorerDateRange,
  formatLabExplorerScore,
  labSetGridTone,
  sortLabSetsForDisplay,
} from "./labExplorerStatus";
import EmptyState from "../../../components/layout/EmptyState";

const LAB_SETS_PAGE_SIZE = 5;

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
  const sets = useMemo(
    () => sortLabSetsForDisplay(groups.flatMap((g) => g.items)),
    [groups],
  );
  const courseTitle = sets[0]?.courseTitle ?? "课程实验";
  const setBase = setsLinkPrefix ?? (embedded ? `/courses/${courseId}/labs/sets` : `/my-labs/${courseId}`);
  const { page, setPage, totalPages, pageItems, total } = usePagination(
    sets,
    LAB_SETS_PAGE_SIZE,
    courseId,
  );

  return (
    <>
      <PageHeader
        title={embedded ? "学习情况" : courseTitle}
        lead={
          embedded
            ? courseTitle
            : total > LAB_SETS_PAGE_SIZE
              ? `${total} 次作业 · 第 ${page}/${totalPages} 页`
              : `${total} 次作业`
        }
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
                    { label: "学习情况" },
                  ]
                : [
                    { label: "全部课程", to: "/my-labs" },
                    { label: courseTitle },
                  ]
            }
          />
        }
      />

      {err ? <div className="page-alert err">{err}</div> : null}
      {loading ? <LabListSkeleton rows={4} /> : null}

      {!loading && sets.length === 0 ? <EmptyState title="暂无实验集" /> : null}

      {!loading && sets.length > 0 ? (
        <div className="lab-assign-stack">
          <div className="lab-assign-list">
            {pageItems.map((set) => (
              <LabAssignmentBar
                key={set.id}
                to={`${setBase}/${set.id}`}
                tone={labSetGridTone(set)}
                title={set.title}
                dateRange={formatLabExplorerDateRange(set.startAt, set.dueAt)}
                score={formatLabExplorerScore(set.score)}
                done={set.progress.done}
                total={set.progress.total}
              />
            ))}
          </div>
          <ListPagination
            page={page}
            pageSize={LAB_SETS_PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        </div>
      ) : null}

      {!embedded ? (
        <p className="muted lab-explorer-foot">
          <Link to="/my-labs">← 返回课程列表</Link>
        </p>
      ) : null}
    </>
  );
}
