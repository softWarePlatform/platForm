import * as XLSX from "xlsx";
import { loadCustomEvents } from "./scheduleStorage";
import type { CustomScheduleEvent, DashboardCourse } from "./types";

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
import { PERIOD_OPTIONS } from "../../lib/schedulePeriods";

const PERIODS = PERIOD_OPTIONS;

type GridCell = {
  text: string;
  rowSpan: number;
  colSpan: number;
  skip: boolean;
};

function buildGrid(courses: DashboardCourse[], custom: CustomScheduleEvent[]) {
  const grid: (GridCell | null)[][] = PERIODS.map(() =>
    WEEKDAYS.map(() => ({ text: "", rowSpan: 1, colSpan: 1, skip: false })),
  );

  const place = (
    day: number,
    p0: number,
    p1: number,
    text: string,
  ) => {
    const dayIdx = day - 1;
    const rowIdx = p0 - 1;
    if (dayIdx < 0 || dayIdx >= 7 || rowIdx < 0 || rowIdx >= 8) return;
    grid[rowIdx][dayIdx] = {
      text,
      rowSpan: p1 - p0 + 1,
      colSpan: 1,
      skip: false,
    };
    for (let p = p0 + 1; p <= p1; p++) {
      grid[p - 1][dayIdx] = { text: "", rowSpan: 1, colSpan: 1, skip: true };
    }
  };

  for (const c of courses) {
    for (const slot of c.scheduleSlots) {
      const lines = [c.title, `${slot.room || "—"}`, c.teacherName].filter(Boolean);
      place(slot.dayOfWeek, slot.periodStart, slot.periodEnd, lines.join("\n"));
    }
  }

  for (const e of custom) {
    const lines = [e.title, e.room || "—", "个人事项", e.note || ""].filter(Boolean);
    place(e.dayOfWeek, e.periodStart, e.periodEnd, lines.join("\n"));
  }

  return grid;
}

function safeFilePart(s: string) {
  return s.replace(/[\\/:*?"<>|]/g, "_").slice(0, 40);
}

/** 导出个人课表为 .xlsx（与主界面课表数据一致，含 localStorage 个人事项） */
export function exportTimetableExcel(opts: {
  courses: DashboardCourse[];
  semesterLabel: string;
  userName: string;
  customEvents?: CustomScheduleEvent[];
}) {
  const custom = opts.customEvents ?? loadCustomEvents();
  const grid = buildGrid(opts.courses, custom);

  const sheetRows: string[][] = [["节次", ...WEEKDAYS]];
  for (let i = 0; i < PERIODS.length; i++) {
    const row: string[] = [String(PERIODS[i])];
    for (let j = 0; j < 7; j++) {
      const cell = grid[i][j];
      row.push(cell?.skip ? "" : cell?.text ?? "");
    }
    sheetRows.push(row);
  }

  const wsGrid = XLSX.utils.aoa_to_sheet(sheetRows);
  wsGrid["!cols"] = [{ wch: 6 }, ...WEEKDAYS.map(() => ({ wch: 22 }))];

  const merges: XLSX.Range[] = [];
  for (let i = 0; i < PERIODS.length; i++) {
    for (let j = 0; j < 7; j++) {
      const cell = grid[i][j];
      if (!cell || cell.skip) continue;
      if (cell.rowSpan > 1) {
        merges.push({
          s: { r: i + 1, c: j + 1 },
          e: { r: i + cell.rowSpan, c: j + 1 },
        });
      }
    }
  }
  if (merges.length) wsGrid["!merges"] = merges;

  const detailRows: string[][] = [
    ["课程名称", "教师", "星期", "开始节次", "结束节次", "教室", "类型"],
  ];
  for (const c of opts.courses) {
    for (const slot of c.scheduleSlots) {
      detailRows.push([
        c.title,
        c.teacherName,
        WEEKDAYS[slot.dayOfWeek - 1] ?? String(slot.dayOfWeek),
        String(slot.periodStart),
        String(slot.periodEnd),
        slot.room || "",
        "课程",
      ]);
    }
  }
  for (const e of custom) {
    detailRows.push([
      e.title,
      "—",
      WEEKDAYS[e.dayOfWeek - 1] ?? String(e.dayOfWeek),
      String(e.periodStart),
      String(e.periodEnd),
      e.room || "",
      "个人事项",
    ]);
  }

  const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
  wsDetail["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 10 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsGrid, "课表网格");
  XLSX.utils.book_append_sheet(wb, wsDetail, "课程明细");

  const meta = [[`学期：${opts.semesterLabel}`], [`姓名：${opts.userName}`], [`导出时间：${new Date().toLocaleString("zh-CN")}`]];
  const wsMeta = XLSX.utils.aoa_to_sheet(meta);
  XLSX.utils.book_append_sheet(wb, wsMeta, "说明");

  const fname = `${safeFilePart(opts.semesterLabel)}_${safeFilePart(opts.userName)}_课表.xlsx`;
  XLSX.writeFile(wb, fname);
}
