import { describe, expect, it } from "vitest";

import { registerSchema } from "../validators/auth.validator";
import { createBookingSchema } from "../validators/booking.validator";
import { updateProfileSchema } from "../validators/user.validator";

describe("phone validation", () => {
  it("requires exactly 10 digits for registration", () => {
    const result = registerSchema.safeParse({
      name: "Jane Doe",
      email: "jane@test.com",
      phone: "41655512345",
      password: "Pass123!",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Phone must be exactly 10 digits");
    }
  });

  it("accepts exactly 10 digits for booking", () => {
    const result = createBookingSchema.safeParse({
      serviceId: "123e4567-e89b-12d3-a456-426614174000",
      holdId: "123e4567-e89b-12d3-a456-426614174001",
      fullName: "Jane Doe",
      email: "jane@test.com",
      phone: "4165551234",
      address: "123 Main Street",
      peopleCount: 1,
      bookingDate: "2099-12-31",
      startTime: "10:00",
    });

    expect(result.success).toBe(true);
  });

  it("rejects long phone numbers on profile updates", () => {
    const result = updateProfileSchema.safeParse({
      phone: "4165551234567",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Phone must be exactly 10 digits");
    }
  });
});
