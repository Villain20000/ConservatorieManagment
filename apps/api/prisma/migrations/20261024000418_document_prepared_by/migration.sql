-- AlterTable
ALTER TABLE "document_records" ADD COLUMN     "preparedById" UUID;

-- AddForeignKey
ALTER TABLE "document_records" ADD CONSTRAINT "document_records_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
