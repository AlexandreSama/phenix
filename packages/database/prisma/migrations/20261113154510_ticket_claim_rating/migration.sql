-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "claimedById" TEXT,
ADD COLUMN     "claimedByName" TEXT,
ADD COLUMN     "ratedAt" TIMESTAMP(3),
ADD COLUMN     "rating" INTEGER;

-- La note va de 1 à 5 ; la base le garantit aussi, pas seulement le code
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_rating_check" CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 5);
