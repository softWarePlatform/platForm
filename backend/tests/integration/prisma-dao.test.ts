import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const runId = randomUUID();
const emailPrefix = `dao-${runId}`;

let teacherId = "";
let studentId = "";
let courseId = "";
let announcementId = "";
let materialId = "";

describe("DAO 层关键 Prisma 方法", { concurrency: 1 }, () => {
  before(async () => {
    await prisma.$connect();
  });

  after(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: emailPrefix } } });
    await prisma.$disconnect();
  });

  it("DAO-01：事务创建用户、课程和选课关系，并通过复合键查询", async () => {
    const created = await prisma.$transaction(async (tx) => {
      const teacher = await tx.user.create({
        data: {
          email: `${emailPrefix}-teacher@example.test`,
          passwordHash: "integration-test-only",
          name: "DAO 测试教师",
          role: "TEACHER",
        },
      });
      const student = await tx.user.create({
        data: {
          email: `${emailPrefix}-student@example.test`,
          passwordHash: "integration-test-only",
          name: "DAO 测试学生",
          role: "STUDENT",
        },
      });
      const course = await tx.course.create({
        data: {
          title: "DAO 关键方法测试课程",
          teacherId: teacher.id,
          published: true,
          courseCode: `DAO-${runId}`,
          semesterKey: "2026-fall",
        },
      });
      const enrollment = await tx.enrollment.create({
        data: { userId: student.id, courseId: course.id },
      });
      return { teacher, student, course, enrollment };
    });

    teacherId = created.teacher.id;
    studentId = created.student.id;
    courseId = created.course.id;

    const enrollment = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: studentId, courseId } },
      include: { user: true, course: true },
    });
    assert.equal(enrollment?.id, created.enrollment.id);
    assert.equal(enrollment?.user.role, "STUDENT");
    assert.equal(enrollment?.course.teacherId, teacherId);
  });

  it("DAO-02：公告已读 upsert 保持复合唯一约束且关联可查询", async () => {
    const announcement = await prisma.courseAnnouncement.create({
      data: {
        courseId,
        authorId: teacherId,
        title: "DAO 公告",
        content: "用于验证公告读状态的持久化。",
      },
    });
    announcementId = announcement.id;

    const where = { announcementId_userId: { announcementId, userId: studentId } };
    await prisma.announcementRead.upsert({ where, update: { readAt: new Date() }, create: where.announcementId_userId });
    await prisma.announcementRead.upsert({ where, update: { readAt: new Date() }, create: where.announcementId_userId });

    assert.equal(await prisma.announcementRead.count({ where: { announcementId, userId: studentId } }), 1);
    const withReads = await prisma.courseAnnouncement.findUnique({
      where: { id: announcementId },
      include: { reads: true },
    });
    assert.equal(withReads?.reads[0]?.userId, studentId);
  });

  it("DAO-03：资料计数原子递增，收藏 upsert 不产生重复记录", async () => {
    const material = await prisma.courseMaterial.create({
      data: {
        courseId,
        title: "DAO 资料",
        fileName: "dao-test.txt",
        storedPath: `dao/${runId}/dao-test.txt`,
        mimeType: "text/plain",
        sizeBytes: 8,
        uploadedById: teacherId,
        groupId: runId,
      },
    });
    materialId = material.id;

    const updated = await prisma.courseMaterial.update({
      where: { id: materialId },
      data: { downloadCount: { increment: 1 }, lastDownloadAt: new Date() },
    });
    assert.equal(updated.downloadCount, 1);

    const where = { userId_materialId: { userId: studentId, materialId } };
    await prisma.materialFavorite.upsert({ where, update: {}, create: where.userId_materialId });
    await prisma.materialFavorite.upsert({ where, update: {}, create: where.userId_materialId });
    assert.equal(await prisma.materialFavorite.count({ where: { userId: studentId, materialId } }), 1);
  });

  it("DAO-04：讨论帖及回复可一次关联查询，课程级删除按外键级联", async () => {
    const post = await prisma.discussionPost.create({
      data: {
        courseId,
        userId: studentId,
        title: "DAO 讨论帖",
        body: "主贴内容",
        comments: {
          create: { userId: teacherId, body: "教师回复" },
        },
      },
      include: { comments: true },
    });
    assert.equal(post.comments.length, 1);
    assert.equal(post.comments[0]?.body, "教师回复");

    await prisma.discussionPost.delete({ where: { id: post.id } });
    assert.equal(await prisma.discussionComment.count({ where: { postId: post.id } }), 0);
  });
});
