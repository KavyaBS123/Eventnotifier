-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "city" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "city" TEXT;

-- CreateIndex
CREATE INDEX "Event_city_idx" ON "Event"("city");

-- CreateIndex
CREATE INDEX "User_city_idx" ON "User"("city");
