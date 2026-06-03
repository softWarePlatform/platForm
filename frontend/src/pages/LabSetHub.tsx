import { useParams } from "react-router-dom";
import LabExplorerProblems from "../features/labs/explorer/LabExplorerProblems";

/** 实验集入口：学习情况网格（题目 AC/WA） */
export default function LabSetHub() {
  const { courseId, labSetId } = useParams();
  return (
    <div className="container" style={{ marginTop: 10 }}>
      <LabExplorerProblems embedded courseIdProp={courseId} labSetIdProp={labSetId} />
    </div>
  );
}
