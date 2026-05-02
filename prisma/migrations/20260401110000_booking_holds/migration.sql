-- CreateEnum
CREATE TYPE "BookingHoldStatus" AS ENUM ('ACTIVE', 'RELEASED', 'EXPIRED', 'CONVERTED');

-- CreateTable
CREATE TABLE "booking_holds" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "booking_id" UUID,
    "booking_date" DATE NOT NULL,
    "start_time" TIME(0) NOT NULL,
    "end_time" TIME(0) NOT NULL,
    "people_count" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "status" "BookingHoldStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_holds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "booking_holds_booking_id_key" ON "booking_holds"("booking_id");
CREATE INDEX "booking_holds_user_id_idx" ON "booking_holds"("user_id");
CREATE INDEX "booking_holds_service_id_idx" ON "booking_holds"("service_id");
CREATE INDEX "booking_holds_booking_date_idx" ON "booking_holds"("booking_date");
CREATE INDEX "booking_holds_booking_date_start_time_end_time_idx" ON "booking_holds"("booking_date", "start_time", "end_time");
CREATE INDEX "booking_holds_user_id_status_idx" ON "booking_holds"("user_id", "status");
CREATE INDEX "booking_holds_status_expires_at_idx" ON "booking_holds"("status", "expires_at");

-- AddForeignKey
ALTER TABLE "booking_holds" ADD CONSTRAINT "booking_holds_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_holds" ADD CONSTRAINT "booking_holds_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "booking_holds" ADD CONSTRAINT "booking_holds_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
