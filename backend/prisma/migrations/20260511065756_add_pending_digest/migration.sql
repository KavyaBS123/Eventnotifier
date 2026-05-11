-- CreateTable
CREATE TABLE "PendingDigest" (
    "id" TEXT NOT NULL,
    "eventData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingDigest_pkey" PRIMARY KEY ("id")
);
