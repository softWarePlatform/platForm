import { Navigate, Route, Routes } from "react-router-dom";
import PageShell from "../components/layout/PageShell";
import LabExplorerCourses from "../features/labs/explorer/LabExplorerCourses";
import LabExplorerProblems from "../features/labs/explorer/LabExplorerProblems";
import LabExplorerSets from "../features/labs/explorer/LabExplorerSets";

export default function MyLabs() {
  return (
    <PageShell>
      <Routes>
        <Route index element={<LabExplorerCourses />} />
        <Route path=":courseId" element={<LabExplorerSets />} />
        <Route path=":courseId/:labSetId" element={<LabExplorerProblems />} />
        <Route path="*" element={<Navigate to="/my-labs" replace />} />
      </Routes>
    </PageShell>
  );
}
