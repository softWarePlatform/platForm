import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const rows = await prisma.course.findMany({
  select: { courseCode: true, title: true, teacherId: true },
  orderBy: { courseCode: "asc" },
});
console.log("total:", rows.length);
for (const r of rows) {
  console.log(r.courseCode ?? "(null)", "-", r.title);
}
await prisma.$disconnect();
