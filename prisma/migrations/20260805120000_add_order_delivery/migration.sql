ALTER TABLE "Order"
ADD COLUMN "fulfillmentType" TEXT NOT NULL DEFAULT 'PICKUP',
ADD COLUMN "deliveryAddress" TEXT,
ADD COLUMN "deliveryNeighborhood" TEXT,
ADD COLUMN "deliveryCity" TEXT,
ADD COLUMN "deliveryPlaceId" TEXT,
ADD COLUMN "deliveryLatitude" DECIMAL(10,7),
ADD COLUMN "deliveryLongitude" DECIMAL(10,7),
ADD COLUMN "deliveryMapsUrl" TEXT,
ADD COLUMN "deliveryFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "deliveryFeeAgreed" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "StoreSettings" ADD COLUMN "motorcycleCourierPhone" TEXT;
