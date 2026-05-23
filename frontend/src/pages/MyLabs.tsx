import { Link } from "react-router-dom";
import LabSetListPanel from "../features/labs/LabSetListPanel";
import { useLabSetOverview } from "../features/labs/useLabSetOverview";
import type { LabSetOverviewGroup, StudentLabSetOverviewCard } from "../features/labs/labSetTypes";

export default function MyLabs() {
  const { data, err, loading, reload } = useLabSetOverview("student");
  const groups = (data?.groups as LabSetOverviewGroup<StudentLabSetOverviewCard>[] | undefined) ?? [];

  return (
    <div className="container">
      <div className="spread" style={{ marginTop: 10, alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>我的实验</h2>
          <p className="muted" style={{ marginTop: 8, lineHeight: 1.6, maxWidth: 640 }}>
            汇总您已选课程下的全部实验集，按状态分组展示。点击「进入实验」打开实验集题目列表。
          </p>
        </div>
        <button type="button" className="btn" onClick={() => void reload()}>
          刷新列表
        </button>
      </div>

      {err ? <div className="err" style={{ marginTop: 12 }}>{err}</div> : null}

      <div className="dash-panel" style={{ marginTop: 16 }}>
        <LabSetListPanel
          mode="student"
          groups={groups}
          loading={loading}
          err={err}
          showCourseName
          emptyHint="暂无实验集。请先在选课系统中加入课程，或等待教师发布实验。"
        />
      </div>

      <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
        也可在 <Link to="/enrollment">选课系统</Link> 选课，或进入各课程主页的「实验管理」查看本课实验。
      </p>
    </div>
  );
}
