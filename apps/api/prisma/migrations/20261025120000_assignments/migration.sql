/* Assignments & submissions: tables, enums, NotificationType values, tenant-coherent FKs. */
-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('SUBMITTED', 'GRADED', 'RETURNED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'ASSIGNMENT_CREATED';
ALTER TYPE "NotificationType" ADD VALUE 'ASSIGNMENT_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'ASSIGNMENT_GRADED';

-- CreateTable
CREATE TABLE "assignments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "teacherId" UUID,
    "programId" UUID,
    "lessonSeriesId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assignedOn" DATE NOT NULL,
    "dueAt" TIMESTAMPTZ(3),
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_targets" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "assignmentId" UUID NOT NULL,
    "studentId" UUID NOT NULL,

    CONSTRAINT "assignment_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_submissions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "assignmentId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "content" TEXT,
    "submittedAt" TIMESTAMP(3),
    "grade" INTEGER,
    "feedback" TEXT,
    "gradedById" UUID,
    "gradedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignment_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assignments_tenantId_status_idx" ON "assignments"("tenantId", "status");

-- CreateIndex
CREATE INDEX "assignments_tenantId_assignedOn_idx" ON "assignments"("tenantId", "assignedOn");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_tenantId_id_key" ON "assignments"("tenantId", "id");

-- CreateIndex
CREATE INDEX "assignment_targets_tenantId_studentId_idx" ON "assignment_targets"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_targets_assignmentId_studentId_key" ON "assignment_targets"("assignmentId", "studentId");

-- CreateIndex
CREATE INDEX "assignment_submissions_tenantId_studentId_idx" ON "assignment_submissions"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_submissions_assignmentId_studentId_key" ON "assignment_submissions"("assignmentId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "programs_tenantId_id_key" ON "programs"("tenantId", "id");

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_tenantId_teacherId_fkey" FOREIGN KEY ("tenantId", "teacherId") REFERENCES "teachers"("tenantId", "id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_tenantId_programId_fkey" FOREIGN KEY ("tenantId", "programId") REFERENCES "programs"("tenantId", "id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_tenantId_lessonSeriesId_fkey" FOREIGN KEY ("tenantId", "lessonSeriesId") REFERENCES "lesson_series"("tenantId", "id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assignment_targets" ADD CONSTRAINT "assignment_targets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_targets" ADD CONSTRAINT "assignment_targets_tenantId_assignmentId_fkey" FOREIGN KEY ("tenantId", "assignmentId") REFERENCES "assignments"("tenantId", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assignment_targets" ADD CONSTRAINT "assignment_targets_tenantId_studentId_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES "students"("tenantId", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_tenantId_assignmentId_fkey" FOREIGN KEY ("tenantId", "assignmentId") REFERENCES "assignments"("tenantId", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_tenantId_studentId_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES "students"("tenantId", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
