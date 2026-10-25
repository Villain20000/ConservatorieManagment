-- Records that every tenant-owned child row belongs to the same tenant as its
-- parent aggregate. Prisma models these as composite relations, so the
-- constraint names follow Prisma's convention; this header only explains why.

ALTER TABLE "lesson_students" DROP CONSTRAINT IF EXISTS "lesson_students_lessonId_fkey";

-- DropForeignKey
ALTER TABLE "lesson_students" DROP CONSTRAINT IF EXISTS "lesson_students_studentId_fkey";

-- DropForeignKey
ALTER TABLE "lessons" DROP CONSTRAINT IF EXISTS "lessons_branchId_fkey";

-- DropForeignKey
ALTER TABLE "lessons" DROP CONSTRAINT IF EXISTS "lessons_lessonSeriesId_fkey";

-- DropForeignKey
ALTER TABLE "lessons" DROP CONSTRAINT IF EXISTS "lessons_roomId_fkey";

-- DropForeignKey
ALTER TABLE "lessons" DROP CONSTRAINT IF EXISTS "lessons_teacherId_fkey";

-- DropForeignKey
ALTER TABLE "lessons" DROP CONSTRAINT IF EXISTS "lessons_tenantId_fkey";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "branches_tenantId_id_key" ON "branches"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "charges_tenantId_id_key" ON "charges"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "lesson_series_tenantId_id_key" ON "lesson_series"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "lessons_tenantId_id_key" ON "lessons"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "rooms_tenantId_id_key" ON "rooms"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "students_tenantId_id_key" ON "students"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "teachers_tenantId_id_key" ON "teachers"("tenantId", "id");

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_tenantId_fkeyb" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_tenantId_lessonSeriesId_fkeyb" FOREIGN KEY ("tenantId", "lessonSeriesId") REFERENCES "lesson_series"("tenantId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_tenantId_branchId_fkeyb" FOREIGN KEY ("tenantId", "branchId") REFERENCES "branches"("tenantId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_tenantId_roomId_fkeyb" FOREIGN KEY ("tenantId", "roomId") REFERENCES "rooms"("tenantId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_tenantId_teacherId_fkeyb" FOREIGN KEY ("tenantId", "teacherId") REFERENCES "teachers"("tenantId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "lesson_students" ADD CONSTRAINT "lesson_students_tenantId_lessonId_fkeyb" FOREIGN KEY ("tenantId", "lessonId") REFERENCES "lessons"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_students" ADD CONSTRAINT "lesson_students_tenantId_studentId_fkeyb" FOREIGN KEY ("tenantId", "studentId") REFERENCES "students"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Constraint names are restored to Prisma's convention so introspection stays stable.
ALTER TABLE "lesson_students" RENAME CONSTRAINT "lesson_students_tenantId_lessonId_fkeyb" TO "lesson_students_tenantId_lessonId_fkey";
ALTER TABLE "lesson_students" RENAME CONSTRAINT "lesson_students_tenantId_studentId_fkeyb" TO "lesson_students_tenantId_studentId_fkey";
ALTER TABLE "lessons" RENAME CONSTRAINT "lessons_tenantId_branchId_fkeyb" TO "lessons_tenantId_branchId_fkey";
ALTER TABLE "lessons" RENAME CONSTRAINT "lessons_tenantId_fkeyb" TO "lessons_tenantId_fkey";
ALTER TABLE "lessons" RENAME CONSTRAINT "lessons_tenantId_lessonSeriesId_fkeyb" TO "lessons_tenantId_lessonSeriesId_fkey";
ALTER TABLE "lessons" RENAME CONSTRAINT "lessons_tenantId_roomId_fkeyb" TO "lessons_tenantId_roomId_fkey";
ALTER TABLE "lessons" RENAME CONSTRAINT "lessons_tenantId_teacherId_fkeyb" TO "lessons_tenantId_teacherId_fkey";
