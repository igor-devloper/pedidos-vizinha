CREATE TABLE "StoreSettings" (
  "id" TEXT NOT NULL DEFAULT 'singleton',
  "isOpen" BOOLEAN NOT NULL DEFAULT true,
  "minimumLeadHours" INTEGER NOT NULL DEFAULT 2,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StoreSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "StoreSettings" ("id", "isOpen", "minimumLeadHours", "updatedAt")
VALUES ('singleton', true, 2, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
