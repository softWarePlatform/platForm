import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_MATERIAL_BYTES,
  MAX_VIDEO_BYTES,
  canManageMaterials,
  classifyMaterial,
  isPreviewable,
  materialVisibleToUser,
  maxBytesForFile,
  normalizeFolderPath,
} from "../../src/lib/course-materials.js";
import { sanitizeFilename } from "../../src/lib/uploads.js";

describe("UC-04 课程资料分类、权限与文件规则", () => {
  it("UNIT-04-01：按扩展名或 MIME 正确识别资料类型", () => {
    assert.equal(classifyMaterial("chapter.PPTX"), "slides");
    assert.equal(classifyMaterial("demo", "video/webm"), "video");
    assert.equal(classifyMaterial("answer.ts"), "code");
    assert.equal(classifyMaterial("bundle.zip"), "archive");
    assert.equal(classifyMaterial("unknown.bin"), "other");
  });

  it("UNIT-04-02：目录路径统一分隔符并移除空白段", () => {
    assert.equal(normalizeFolderPath(" / 第1章 \\ 课件 // "), "第1章/课件");
  });

  it("UNIT-04-03：预览能力只开放给文档、图片、代码和幻灯片", () => {
    assert.equal(isPreviewable("guide.pdf"), true);
    assert.equal(isPreviewable("photo.png"), true);
    assert.equal(isPreviewable("movie.mp4"), false);
    assert.equal(isPreviewable("archive.7z"), false);
  });

  it("UNIT-04-04：视频使用独立大小上限，普通文件使用默认上限", () => {
    assert.equal(maxBytesForFile("lesson.mp4"), MAX_VIDEO_BYTES);
    assert.equal(maxBytesForFile("lesson.pdf"), MAX_MATERIAL_BYTES);
  });

  it("UNIT-04-05：资料管理与可见性遵循教师、管理员、班级规则", () => {
    assert.equal(canManageMaterials("teacher-1", "TEACHER", { teacherId: "teacher-1" }), true);
    assert.equal(canManageMaterials("teacher-2", "TEACHER", { teacherId: "teacher-1" }), false);
    assert.equal(canManageMaterials("admin", "ADMIN", { teacherId: "teacher-1" }), true);

    assert.equal(
      materialVisibleToUser(
        { visibility: "CLASS", targetClassId: "class-a" },
        { isManager: false, enrollmentClassId: "class-a" },
      ),
      true,
    );
    assert.equal(
      materialVisibleToUser(
        { visibility: "CLASS", targetClassId: "class-a" },
        { isManager: false, enrollmentClassId: "class-b" },
      ),
      false,
    );
    assert.equal(
      materialVisibleToUser(
        { visibility: "TEACHER_ONLY", targetClassId: null },
        { isManager: false, enrollmentClassId: null },
      ),
      false,
    );
  });

  it("UNIT-04-06：上传文件名会清理路径和特殊字符并限制长度", () => {
    const sanitized = sanitizeFilename("../课程 资料?.pdf");
    assert.equal(sanitized, ".._课程_资料_.pdf");
    assert.ok(sanitizeFilename("a".repeat(300)).length <= 180);
  });
});
