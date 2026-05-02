/**
 * Inquiry Service - Harsh Makeovers
 */

import { prisma } from "../config/prisma";
import { InquiryType } from "../generated/prisma/client.js";
import {
  sendClassInquiryEmail,
  sendContactInquiryEmail,
  sendLargeGroupInquiryEmail,
} from "../helpers/email";

interface InquiryData {
  inquiryType: InquiryType;
  subject?: string;
  message: string;
  category?: string;
  peopleCount?: number;
  userId: string;
}

export async function createContactInquiry(data: InquiryData) {
  const inquiry = await prisma.contactInquiry.create({
    data: {
      userId: data.userId,
      inquiryType: data.inquiryType,
      subject: data.subject,
      message: data.message,
      category: data.category,
      peopleCount: data.peopleCount,
    },
    include: { user: { select: { name: true, email: true } } },
  });

  if (inquiry.user) {
    const emailPayload = {
      userName: inquiry.user.name,
      userEmail: inquiry.user.email,
      subject: inquiry.subject,
      category: inquiry.category,
      peopleCount: inquiry.peopleCount,
      message: inquiry.message,
    };

    switch (data.inquiryType) {
      case InquiryType.CONTACT:
        sendContactInquiryEmail(emailPayload).catch(() => {});
        break;
      case InquiryType.CLASS:
        sendClassInquiryEmail(emailPayload).catch(() => {});
        break;
      case InquiryType.LARGE_GROUP:
        sendLargeGroupInquiryEmail(emailPayload).catch(() => {});
        break;
    }
  }

  return inquiry;
}

export async function getUserInquiries(userId: string) {
  return prisma.contactInquiry.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}