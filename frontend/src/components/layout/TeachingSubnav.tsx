import SubNav from "./SubNav";

const ITEMS = [
  { to: "/teaching", label: "课程", end: true },
  { to: "/teaching/homework", label: "作业" },
  { to: "/teaching/labs", label: "实验" },
];

export default function TeachingSubnav() {
  return (
    <div className="teach-subnav-wrap">
      <SubNav items={ITEMS} className="teach-subnav" />
    </div>
  );
}
