import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log(
    JSON.stringify({
      note: "作业服务不保存用户。请用 course-service 账号登录后携带 JWT 访问本服务。",
      accounts: {
        admin: "admin@course.local",
        teacher: "teacher@course.local",
        student: "student@course.local",
        password: "Course123456",
      },
      homeworkCount: await prisma.homework.count(),
    }),
  );
}

main().finally(() => prisma.$disconnect());
