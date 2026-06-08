import { useParams } from "react-router-dom";
import LabExplorerProblems from "../../../features/labs/explorer/LabExplorerProblems";

/** 课程内实验集题目列表（与「我的实验」同组件，留在课程壳内） */
export default function CourseLabSetProblems() {
  const { courseId = "", labSetId = "" } = useParams();
  return (
    <LabExplorerProblems
      embedded
      courseIdProp={courseId}
      labSetIdProp={labSetId}
      listPathPrefix={`/courses/${courseId}/labs`}
    />
  );
}
