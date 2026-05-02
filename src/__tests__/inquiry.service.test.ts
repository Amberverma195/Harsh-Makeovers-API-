import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/prisma", () => ({
  prisma: {
    contactInquiry: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("../helpers/email", () => ({
  sendContactInquiryEmail: vi.fn(),
  sendClassInquiryEmail: vi.fn(),
  sendLargeGroupInquiryEmail: vi.fn(),
}));

import { prisma } from "../config/prisma";
import { InquiryType } from "../generated/prisma/client.js";
import {
  sendClassInquiryEmail,
  sendContactInquiryEmail,
  sendLargeGroupInquiryEmail,
} from "../helpers/email";
import { createContactInquiry, getUserInquiries } from "../services/inquiry.service";

const mockPrisma = prisma as unknown as {
  contactInquiry: {
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
};

const mockSendContactInquiryEmail = sendContactInquiryEmail as unknown as ReturnType<typeof vi.fn>;
const mockSendClassInquiryEmail = sendClassInquiryEmail as unknown as ReturnType<typeof vi.fn>;
const mockSendLargeGroupInquiryEmail = sendLargeGroupInquiryEmail as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockSendContactInquiryEmail.mockResolvedValue(undefined);
  mockSendClassInquiryEmail.mockResolvedValue(undefined);
  mockSendLargeGroupInquiryEmail.mockResolvedValue(undefined);
});

describe("createContactInquiry", () => {
  it("sends an admin email for contact inquiries", async () => {
    mockPrisma.contactInquiry.create.mockResolvedValue({
      id: "i1",
      inquiryType: InquiryType.CONTACT,
      subject: "Travel question",
      message: "Do you travel to Oakville for bridal trials?",
      category: null,
      peopleCount: null,
      user: { name: "Jane Doe", email: "jane@example.com" },
    });

    const result = await createContactInquiry({
      inquiryType: InquiryType.CONTACT,
      subject: "Travel question",
      message: "Do you travel to Oakville for bridal trials?",
      userId: "u1",
    });

    expect(result.id).toBe("i1");
    expect(mockSendContactInquiryEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        userName: "Jane Doe",
        userEmail: "jane@example.com",
        subject: "Travel question",
      })
    );
    expect(mockSendClassInquiryEmail).not.toHaveBeenCalled();
    expect(mockSendLargeGroupInquiryEmail).not.toHaveBeenCalled();
  });

  it("sends an admin email for class inquiries", async () => {
    mockPrisma.contactInquiry.create.mockResolvedValue({
      id: "i2",
      inquiryType: InquiryType.CLASS,
      subject: "Weekend workshop",
      message: "Interested in a bridal basics workshop for my team.",
      category: "Bridal Basics",
      peopleCount: 6,
      user: { name: "Priya", email: "priya@example.com" },
    });

    await createContactInquiry({
      inquiryType: InquiryType.CLASS,
      subject: "Weekend workshop",
      message: "Interested in a bridal basics workshop for my team.",
      category: "Bridal Basics",
      peopleCount: 6,
      userId: "u2",
    });

    expect(mockSendClassInquiryEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        userName: "Priya",
        category: "Bridal Basics",
        peopleCount: 6,
      })
    );
    expect(mockSendContactInquiryEmail).not.toHaveBeenCalled();
    expect(mockSendLargeGroupInquiryEmail).not.toHaveBeenCalled();
  });

  it("keeps large group inquiry emails working", async () => {
    mockPrisma.contactInquiry.create.mockResolvedValue({
      id: "i3",
      inquiryType: InquiryType.LARGE_GROUP,
      subject: null,
      message: "Wedding party booking for 8 people.",
      category: "Wedding Party",
      peopleCount: 8,
      user: { name: "Anita", email: "anita@example.com" },
    });

    await createContactInquiry({
      inquiryType: InquiryType.LARGE_GROUP,
      message: "Wedding party booking for 8 people.",
      category: "Wedding Party",
      peopleCount: 8,
      userId: "u3",
    });

    expect(mockSendLargeGroupInquiryEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        userName: "Anita",
        category: "Wedding Party",
        peopleCount: 8,
      })
    );
  });

  it("does not attempt email when the inquiry has no user relation loaded", async () => {
    mockPrisma.contactInquiry.create.mockResolvedValue({
      id: "i4",
      inquiryType: InquiryType.CONTACT,
      subject: "Hello",
      message: "Need a quick answer.",
      category: null,
      peopleCount: null,
      user: null,
    });

    await createContactInquiry({
      inquiryType: InquiryType.CONTACT,
      subject: "Hello",
      message: "Need a quick answer.",
      userId: "u4",
    });

    expect(mockSendContactInquiryEmail).not.toHaveBeenCalled();
    expect(mockSendClassInquiryEmail).not.toHaveBeenCalled();
    expect(mockSendLargeGroupInquiryEmail).not.toHaveBeenCalled();
  });
});

describe("getUserInquiries", () => {
  it("returns inquiries ordered by most recent first", async () => {
    mockPrisma.contactInquiry.findMany.mockResolvedValue([{ id: "i2" }, { id: "i1" }]);

    const result = await getUserInquiries("u1");

    expect(result).toHaveLength(2);
    expect(mockPrisma.contactInquiry.findMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
      orderBy: { createdAt: "desc" },
    });
  });
});