-- CreateTable
CREATE TABLE "_health" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL DEFAULT 'payforge',
    "version" TEXT NOT NULL DEFAULT '0.0.0',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "_health_pkey" PRIMARY KEY ("id")
);
