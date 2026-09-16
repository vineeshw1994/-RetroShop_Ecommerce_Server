import nodemailer from 'nodemailer';
import config from '../config/index.js';

const BRAND = 'Retro Shop';
const ACCENT = '#e4002b';

const isSmtpConfigured = () => {
  const { user, pass } = config.smtp;
  if (!user || !pass) return false;
  if (user === 'your_email@gmail.com' || pass === 'your_app_password') return false;
  return true;
};

let cachedTransporter = null;

const getTransporter = () => {
  if (!isSmtpConfigured()) return null;
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
  }
  return cachedTransporter;
};

const layout = (heading, bodyHtml) => `
  <div style="font-family:Segoe UI,Arial,sans-serif;background:#f4f5f7;padding:32px 16px;">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,.08);">
      <div style="background:${ACCENT};padding:20px 28px;">
        <span style="color:#fff;font-size:20px;font-weight:800;letter-spacing:.5px;">${BRAND}</span>
      </div>
      <div style="padding:28px;">
        <h2 style="margin:0 0 14px;color:#0f172a;font-size:20px;">${heading}</h2>
        ${bodyHtml}
      </div>
      <div style="padding:18px 28px;background:#f8fafc;color:#64748b;font-size:12px;">
        You are receiving this because you have an account at ${BRAND}.
      </div>
    </div>
  </div>
`;

/** Send mail, falling back to a console log so dev flows never dead-end. */
const deliver = async ({ to, subject, html, devLabel }) => {
  const transporter = getTransporter();

  if (!transporter) {
    console.log(`[DEV MAIL] ${subject} -> ${to}${devLabel ? ` | ${devLabel}` : ''}`);
    return { devMode: true };
  }

  try {
    await transporter.sendMail({ from: config.smtp.from, to, subject, html });
    return { sent: true };
  } catch (error) {
    console.warn('[SMTP failed, logging instead]', error.message);
    console.log(`[DEV MAIL] ${subject} -> ${to}${devLabel ? ` | ${devLabel}` : ''}`);
    return { devMode: true };
  }
};

export const sendOtpEmail = async (email, code, purpose) => {
  const headings = {
    signup: 'Confirm your email address',
    forgot_password: 'Reset your password',
    admin_reset: 'Reset your admin password',
  };

  return deliver({
    to: email,
    subject: `${BRAND} verification code`,
    devLabel: `OTP ${code} (${purpose})`,
    html: layout(
      headings[purpose] || 'Your verification code',
      `<p style="color:#475569;margin:0 0 18px;">Use the code below to continue. It expires in ${config.otpExpiryMinutes} minutes.</p>
       <p style="font-size:34px;letter-spacing:10px;font-weight:800;color:#0f172a;margin:0 0 18px;">${code}</p>
       <p style="color:#94a3b8;font-size:13px;margin:0;">Never share this code with anyone.</p>`
    ),
  });
};

export const sendWelcomeEmail = async (email, firstName) =>
  deliver({
    to: email,
    subject: `Welcome to ${BRAND}`,
    html: layout(
      `Welcome aboard, ${firstName}!`,
      `<p style="color:#475569;">Your account is ready. Browse thousands of pre-owned games and consoles, all covered by our warranty.</p>
       <p><a href="${config.clientUrl}" style="display:inline-block;background:${ACCENT};color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700;">Start shopping</a></p>`
    ),
  });

export const sendOrderConfirmationEmail = async (email, order) => {
  const rows = (order.items || [])
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 0;color:#0f172a;">${item.name} &times; ${item.quantity}</td>
        <td style="padding:8px 0;text-align:right;color:#0f172a;">£${Number(item.lineTotal).toFixed(2)}</td>
      </tr>`
    )
    .join('');

  return deliver({
    to: email,
    subject: `${BRAND} order ${order.orderNumber} confirmed`,
    html: layout(
      `Order ${order.orderNumber} confirmed`,
      `<p style="color:#475569;">Thanks for your order. We will email you again as soon as it ships.</p>
       <table style="width:100%;border-collapse:collapse;font-size:14px;">${rows}
         <tr><td style="padding-top:12px;border-top:1px solid #e2e8f0;font-weight:700;">Total</td>
             <td style="padding-top:12px;border-top:1px solid #e2e8f0;text-align:right;font-weight:700;">£${Number(order.total).toFixed(2)}</td></tr>
       </table>
       <p style="margin-top:20px;"><a href="${config.clientUrl}/account/orders/${order.orderNumber}" style="display:inline-block;background:${ACCENT};color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700;">Track order</a></p>`
    ),
  });
};

export const sendOrderStatusEmail = async (email, order, note) =>
  deliver({
    to: email,
    subject: `${BRAND} order ${order.orderNumber} is now ${order.status}`,
    html: layout(
      `Order ${order.orderNumber} update`,
      `<p style="color:#475569;">Your order status changed to <strong>${order.status}</strong>.</p>
       ${note ? `<p style="color:#475569;">${note}</p>` : ''}
       ${order.trackingNumber ? `<p style="color:#475569;">Tracking: <strong>${order.trackingNumber}</strong>${order.courier ? ` (${order.courier})` : ''}</p>` : ''}`
    ),
  });

export const sendStaffInviteEmail = async (email, name, tempPassword) =>
  deliver({
    to: email,
    subject: `Your ${BRAND} staff account`,
    devLabel: `temp password ${tempPassword}`,
    html: layout(
      `Hi ${name}, your staff account is ready`,
      `<p style="color:#475569;">Sign in to the admin dashboard with the temporary password below, then change it from your profile.</p>
       <p style="font-size:20px;font-weight:800;color:#0f172a;background:#f1f5f9;padding:12px 16px;border-radius:8px;display:inline-block;">${tempPassword}</p>
       <p><a href="${config.clientUrl}/admin/login" style="display:inline-block;background:${ACCENT};color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700;">Open admin</a></p>`
    ),
  });

export const sendGameRequestUpdateEmail = async (email, request) =>
  deliver({
    to: email,
    subject: `${BRAND} update on "${request.title}"`,
    html: layout(
      `We have an update on "${request.title}"`,
      `<p style="color:#475569;">Status: <strong>${request.status}</strong></p>
       ${request.adminResponse ? `<p style="color:#475569;">${request.adminResponse}</p>` : ''}`
    ),
  });

export const sendContactNotification = async (row, to) => {
  if (!to) return { skipped: true };
  return deliver({
    to,
    subject: `${BRAND} contact form: ${row.subject}`,
    html: layout(
      'New contact form message',
      `<p style="color:#475569;"><strong>${row.name}</strong> (${row.email}${row.phone ? `, ${row.phone}` : ''}) wrote:</p>
       <p style="color:#0f172a;white-space:pre-wrap;">${row.message}</p>`
    ),
  });
};

export const sendContactReply = async (row, reply) =>
  deliver({
    to: row.email,
    subject: `Re: ${row.subject}`,
    html: layout(
      `Reply from ${BRAND}`,
      `<p style="color:#475569;">Hi ${row.name},</p>
       <p style="color:#0f172a;white-space:pre-wrap;">${reply}</p>
       <p style="color:#94a3b8;font-size:13px;margin-top:24px;">Your original message:</p>
       <p style="color:#64748b;white-space:pre-wrap;">${row.message}</p>`
    ),
  });
