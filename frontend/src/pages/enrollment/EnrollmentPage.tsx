import Courses from "../Courses";

/** 选课系统入口（与主界面课表同步，见 docs/选课系统.md） */
export default function EnrollmentPage() {
  return <Courses enrollmentMode />;
}
