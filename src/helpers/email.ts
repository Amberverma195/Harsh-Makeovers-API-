import nodemailer from "nodemailer";
import { env } from "../config/env";

const ADMIN_EMAIL = env.ADMIN_NOTIFICATION_EMAIL;
const FROM_NAME = "Harsh Makeovers";

function createTransporter() {
  if (!env.SMTP_USER || !env.SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });
}

const transporter = createTransporter();

async function sendMail(to: string, subject: string, html: string) {
  if (!transporter) {
    console.warn(`[EMAIL] SMTP not configured - skipping email to ${to}: ${subject}`);
    return;
  }

  try {
    await transporter.sendMail({
      from: `"${FROM_NAME}" <${env.SMTP_USER}>`,
      to,
      subject,
      html,
    });
    console.log(`[EMAIL] Sent to ${to}: ${subject}`);
  } catch (err) {
    console.error(`[EMAIL] Failed to send to ${to}:`, err);
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTime(d: Date | string) {
  const date = new Date(d);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

const baseStyle = `
  font-family: 'Helvetica Neue', Arial, sans-serif;
  max-width: 560px;
  margin: 0 auto;
  color: #333;
`;

const headerStyle = `
  background: linear-gradient(135deg, #1a1a1a, #2d2d2d);
  padding: 28px 32px;
  border-radius: 12px 12px 0 0;
  text-align: center;
`;

const bodyStyle = `
  background: #ffffff;
  padding: 32px;
  border: 1px solid #eee;
  border-top: none;
  border-radius: 0 0 12px 12px;
`;

const rowStyle = `
  padding: 10px 0;
  border-bottom: 1px solid #f5f5f5;
  font-size: 14px;
`;

function renderOptionalRow(label: string, value?: string | number | null) {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  return `<div style="${rowStyle}"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(String(value))}</div>`;
}

function renderMessageBlock(message: string) {
  return `
    <div style="padding:16px 0;">
      <strong>Message:</strong>
      <div style="margin-top:8px; padding:12px; background:#f9f9f9; border-radius:8px; font-size:14px; white-space:pre-wrap;">${escapeHtml(message)}</div>
    </div>
  `;
}

export async function sendBookingSubmittedEmail(booking: {
  fullName: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  peopleCount: number;
  bookingDate: Date | string;
  startTime: Date | string;
  endTime: Date | string;
  service: { name: string; category: string };
}) {
  const html = `
    <div style="${baseStyle}">
      <div style="${headerStyle}">
        <h1 style="margin:0; color:#f9a8c9; font-size:20px;">New Booking Request</h1>
      </div>
      <div style="${bodyStyle}">
        <p style="margin-top:0;">A new booking has been submitted and is awaiting your confirmation.</p>
        ${renderOptionalRow("Client", booking.fullName)}
        ${renderOptionalRow("Email", booking.email)}
        ${renderOptionalRow("Phone", booking.phone)}
        ${renderOptionalRow("Service", `${booking.service.name} (${booking.service.category})`)}
        ${renderOptionalRow("People", booking.peopleCount)}
        ${renderOptionalRow("Date", formatDate(booking.bookingDate))}
        ${renderOptionalRow("Time", `${formatTime(booking.startTime)} - ${formatTime(booking.endTime)}`)}
        ${renderOptionalRow("Address", booking.address)}
        <p style="margin-top:24px; font-size:13px; color:#888;">Log in to the admin dashboard to confirm or reject this booking.</p>
      </div>
    </div>`;

  await sendMail(ADMIN_EMAIL, `New Booking: ${booking.fullName} - ${booking.service.name}`, html);
}

export async function sendBookingConfirmedEmail(booking: {
  fullName: string;
  email: string;
  bookingDate: Date | string;
  startTime: Date | string;
  endTime: Date | string;
  address?: string | null;
  service: { name: string };
}) {
  const html = `
    <div style="${baseStyle}">
      <div style="${headerStyle}">
        <h1 style="margin:0; color:#f9a8c9; font-size:20px;">Booking Confirmed!</h1>
      </div>
      <div style="${bodyStyle}">
        <p style="margin-top:0;">Hi ${escapeHtml(booking.fullName)},</p>
        <p>Your booking with Harsh Makeovers has been confirmed. Here are your details:</p>
        ${renderOptionalRow("Service", booking.service.name)}
        ${renderOptionalRow("Date", formatDate(booking.bookingDate))}
        ${renderOptionalRow("Time", `${formatTime(booking.startTime)} - ${formatTime(booking.endTime)}`)}
        ${renderOptionalRow("Location", booking.address)}
        <p style="margin-top:24px;">If you need to make any changes, please contact us at <a href="mailto:${escapeHtml(ADMIN_EMAIL)}">${escapeHtml(ADMIN_EMAIL)}</a> or call +1 672-855-3363.</p>
        <p style="font-size:13px; color:#888;">Thank you for choosing Harsh Makeovers!</p>
      </div>
    </div>`;

  await sendMail(
    booking.email,
    `Booking Confirmed - ${booking.service.name} on ${formatDate(booking.bookingDate)}`,
    html
  );
}

interface AdminInquiryEmail {
  userName: string;
  userEmail: string;
  subject?: string | null;
  category?: string | null;
  peopleCount?: number | null;
  message: string;
}

async function sendAdminInquiryEmail(options: {
  heading: string;
  subjectLine: string;
  intro: string;
  inquiry: AdminInquiryEmail;
}) {
  const { heading, subjectLine, intro, inquiry } = options;
  const html = `
    <div style="${baseStyle}">
      <div style="${headerStyle}">
        <h1 style="margin:0; color:#f9a8c9; font-size:20px;">${escapeHtml(heading)}</h1>
      </div>
      <div style="${bodyStyle}">
        <p style="margin-top:0;">${escapeHtml(intro)}</p>
        ${renderOptionalRow("From", `${inquiry.userName} (${inquiry.userEmail})`)}
        ${renderOptionalRow("Subject", inquiry.subject)}
        ${renderOptionalRow("Category", inquiry.category)}
        ${renderOptionalRow("People", inquiry.peopleCount)}
        ${renderMessageBlock(inquiry.message)}
        <p style="font-size:13px; color:#888;">Reply directly to ${escapeHtml(inquiry.userEmail)} to follow up.</p>
      </div>
    </div>`;

  await sendMail(ADMIN_EMAIL, subjectLine, html);
}

export async function sendContactInquiryEmail(inquiry: AdminInquiryEmail) {
  await sendAdminInquiryEmail({
    heading: "Contact Inquiry",
    subjectLine: `Contact Inquiry from ${inquiry.userName}`,
    intro: "A new contact inquiry has been submitted and needs your attention.",
    inquiry,
  });
}

export async function sendClassInquiryEmail(inquiry: AdminInquiryEmail) {
  await sendAdminInquiryEmail({
    heading: "Class Inquiry",
    subjectLine: `Class Inquiry from ${inquiry.userName}`,
    intro: "A new class inquiry has been submitted and needs your attention.",
    inquiry,
  });
}

export async function sendLargeGroupInquiryEmail(inquiry: AdminInquiryEmail) {
  await sendAdminInquiryEmail({
    heading: "Large Group Inquiry",
    subjectLine: `Large Group Inquiry from ${inquiry.userName}`,
    intro: "A large group inquiry has been submitted and needs your attention.",
    inquiry,
  });
}
export async function sendAdminSecurityAlertEmail(options: {
  title: string;
  intro: string;
  details: Record<string, string | number | null | undefined>;
}) {
  const rows = Object.entries(options.details)
    .map(([label, value]) => renderOptionalRow(label, value))
    .join("");

  const html = `
    <div style="${baseStyle}">
      <div style="${headerStyle}">
        <h1 style="margin:0; color:#f9a8c9; font-size:20px;">${escapeHtml(options.title)}</h1>
      </div>
      <div style="${bodyStyle}">
        <p style="margin-top:0;">${escapeHtml(options.intro)}</p>
        ${rows}
        <p style="margin-top:24px; font-size:13px; color:#888;">Review the admin dashboard security page if this activity was not expected.</p>
      </div>
    </div>`;

  await sendMail(ADMIN_EMAIL, `[Admin Security] ${options.title}`, html);
}