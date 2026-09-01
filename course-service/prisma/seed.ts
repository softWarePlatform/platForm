import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.materialFavorite.deleteMany();
  await prisma.courseMaterial.deleteMany();
  await prisma.announcementMark.deleteMany();
  await prisma.announcementRead.deleteMany();
  await prisma.courseAnnouncement.deleteMany();
  await prisma.siteNotification.deleteMany();
  await prisma.enrollmentWaitlist.deleteMany();
  await prisma.enrollmentLog.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.class.deleteMany();
  await prisma.course.deleteMany();
  await prisma.enrollmentPeriod.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash("Course123456", 10);
  const [admin, teacher, student, studentTwo] = await Promise.all([
    prisma.user.create({ data: { email: "admin@course.local", name: "课程管理员", role: "ADMIN", passwordHash } }),
    prisma.user.create({ data: { email: "teacher@course.local", name: "课程教师", role: "TEACHER", passwordHash } }),
    prisma.user.create({ data: { email: "student@course.local", name: "课程学生", role: "STUDENT", passwordHash } }),
    prisma.user.create({ data: { email: "student2@course.local", name: "候补学生", role: "STUDENT", passwordHash } }),
  ]);
  const course = await prisma.course.create({ data: { title: "课程服务演示课程", description: "用于 UC01—UC04、UC10 的独立服务验证", category: "软件工程", courseCode: "CS-SVC-101", capacity: 2, published: true, semesterKey: "2026-fall", scheduleSlotsJson: JSON.stringify([{ dayOfWeek: 1, periodStart: 1, periodEnd: 2, room: "A101" }]), teacherId: teacher.id } });
  await prisma.course.create({ data: { title: "时间冲突课程", courseCode: "CS-SVC-102", capacity: 1, published: true, semesterKey: "2026-fall", scheduleSlotsJson: JSON.stringify([{ dayOfWeek: 1, periodStart: 2, periodEnd: 3, room: "A102" }]), teacherId: teacher.id } });
  await prisma.enrollmentPeriod.create({ data: { semesterKey: "2026-fall", label: "2026 秋季学期", phase: "FORMAL", openAt: new Date("2026-01-01T00:00:00Z"), closeAt: new Date("2026-12-31T23:59:59Z") } });
  await prisma.class.create({ data: { name: "软件工程 1 班", courseId: course.id } });
  console.log(JSON.stringify({ admin: admin.email, teacher: teacher.email, student: student.email, studentTwo: studentTwo.email, password: "Course123456", courseId: course.id }));
}

main().finally(() => prisma.$disconnect());
