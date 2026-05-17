/**
 * 平台模块注册表（课程内子模块见 `modules/courseNav.ts`）。
 * 顶栏：主界面、选课系统、我的作业、站内消息、个人中心。
 */

export type ModuleStatus = "implemented" | "partial" | "planned";

export type PlatformModule = {
  id: string;
  title: string;
  description: string;
  status: ModuleStatus;
  path: string;
  roles?: Array<"STUDENT" | "TEACHER" | "ADMIN">;
};

/** @deprecated 主界面不再展示模块快捷入口；保留供课程内导航参考 */
export const PLATFORM_MODULES: PlatformModule[] = [];

export const STATUS_LABEL: Record<ModuleStatus, string> = {
  implemented: "已接入",
  partial: "部分可用",
  planned: "规划中",
};
