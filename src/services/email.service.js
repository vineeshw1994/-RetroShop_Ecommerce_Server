import { Resend } from 'resend';
import config from '../config/index.js';

const BRAND = config.resend.fromName || 'Retro Shop';
const ACCENT = '#00e5ff';

const isResendConfigured = () => {
  const key = config.resend.apiKey;
  if (!key || key.startsWith('re_') === false) return false;
  if (key.includes('your_') || key.length < 10) return false;
  return Boolean(config.resend.fromEmail);
};

let cachedClient = null;

const getResend = () => {
  if (!isResendConfigured()) return null;
  if (!cachedClient) cachedClient = new Resend(config.resend.apiKey);
  return cachedClient;
};

const fromAddress = () => `${config.resend.fromName} <${config.resend.fromEmail}>`;

const layout = (heading, bodyHtml) => `
  <div style="font-family:Segoe UI,Arial,sans-serif;background:#050814;padding:32px 16px;">
    <div style="max-width:520px;margin:0 auto;background:#0b1224;border-radius:14px;overflow:hidden;border:1px solid #1e3050;">
      <div style="background:linear-gradient(90deg,#00e5ff,#d946ef);padding:20px 28px;">
        <span style="color:#030712;font-size:20px;font-weight:800;letter-spacing:.5px;">${BRAND}</span>
      </div>
      <div style="padding:28px;">
        <h2 style="margin:0 0 14px;color:#f4f7fb;font-size:20px;">${heading}</h2>
        ${bodyHtml}
      </div>
      <div style="padding:18px 28px;background:#132038;color:#8fa0bb;font-size:12px;">
        You are receiving this because you have an account at ${BRAND}.
      </div>
    </div>
  </div>
`;

/** Send mail via Resend, falling back to console log in dev when not configured. */
const deliver = async ({ to, subject, html, devLabel }) => {
  const resend = getResend();

  if (!resend) {
    console.log(`[DEV MAIL] ${subject} -> ${to}${devLabel ? ` | ${devLabel}` : ''}`);
    return { devMode: true };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: fromAddress(),
      to: [to],
      subject,
      html,
    });

    if (error) {
      console.warn('[Resend] send rejected:', error.message);
      if (error.message?.includes('testing emails to your own email')) {
        console.warn(
          '[Resend] Sandbox: only your Resend account email can receive mail until a domain is verified. OTP is in the server log below (and devOtp in the API in development).'
        );
      }
      console.log(`[DEV MAIL] ${subject} -> ${to}${devLabel ? ` | ${devLabel}` : ''}`);
      return { devMode: true, resendError: error.message };
    }

    if (data?.id) {
      console.log(`[Resend] queued ${data.id} -> ${to}`);
    }

    return { sent: true, id: data?.id };
  } catch (error) {
    console.warn('[Resend] request failed:', error.message);
    console.log(`[DEV MAIL] ${subject} -> ${to}${devLabel ? ` | ${devLabel}` : ''}`);
    return { devMode: true, resendError: error.message };
  }
};

export const logResendStartup = () => {
  if (!isResendConfigured()) {
    console.warn('[Resend] RESEND_API_KEY missing — emails will log to console only.');
    return;
  }
  console.log(`[Resend] From ${fromAddress()}`);
  console.log(
    '[Resend] Without a verified domain, Resend only delivers to the email on your Resend account. Other recipients need domain verification.'
  );
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
      `<p style="color:#b8c5d9;margin:0 0 18px;">Use the code below to continue. It expires in ${config.otpExpiryMinutes} minutes.</p>
       <p style="font-size:34px;letter-spacing:10px;font-weight:800;color:#22f0ff;margin:0 0 18px;">${code}</p>
       <p style="color:#6b7c99;font-size:13px;margin:0;">Never share this code with anyone.</p>`
    ),
  });
};

export const sendWelcomeEmail = async (email, firstName) =>
  deliver({
    to: email,
    subject: `Welcome to ${BRAND}`,
    html: layout(
      `Welcome aboard, ${firstName}!`,
      `<p style="color:#b8c5d9;">Your account is ready. Browse thousands of pre-owned games and consoles, all covered by our warranty.</p>
       <p><a href="${config.clientUrl}" style="display:inline-block;background:linear-gradient(90deg,#00e5ff,#d946ef);color:#030712;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700;">Start shopping</a></p>`
    ),
  });

export const sendOrderConfirmationEmail = async (email, order) => {
  const rows = (order.items || [])
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 0;color:#e8eef7;">${item.name} &times; ${item.quantity}</td>
        <td style="padding:8px 0;text-align:right;color:#e8eef7;">£${Number(item.lineTotal).toFixed(2)}</td>
      </tr>`
    )
    .join('');

  return deliver({
    to: email,
    subject: `${BRAND} order ${order.orderNumber} confirmed`,
    html: layout(
      `Order ${order.orderNumber} confirmed`,
      `<p style="color:#b8c5d9;">Thanks for your order. We will email you again as soon as it ships.</p>
       <table style="width:100%;border-collapse:collapse;font-size:14px;">${rows}
         <tr><td style="padding-top:12px;border-top:1px solid #1e3050;font-weight:700;color:#f4f7fb;">Total</td>
             <td style="padding-top:12px;border-top:1px solid #1e3050;text-align:right;font-weight:700;color:#22f0ff;">£${Number(order.total).toFixed(2)}</td></tr>
       </table>
       <p style="margin-top:20px;"><a href="${config.clientUrl}/account/orders/${order.orderNumber}" style="display:inline-block;background:linear-gradient(90deg,#00e5ff,#d946ef);color:#030712;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700;">Track order</a></p>`
    ),
  });
};

export const sendOrderStatusEmail = async (email, order, note) =>
  deliver({
    to: email,
    subject: `${BRAND} order ${order.orderNumber} is now ${order.status}`,
    html: layout(
      `Order ${order.orderNumber} update`,
      `<p style="color:#b8c5d9;">Your order status changed to <strong style="color:#f4f7fb;">${order.status}</strong>.</p>
       ${note ? `<p style="color:#b8c5d9;">${note}</p>` : ''}
       ${order.trackingNumber ? `<p style="color:#b8c5d9;">Tracking: <strong style="color:#f4f7fb;">${order.trackingNumber}</strong>${order.courier ? ` (${order.courier})` : ''}</p>` : ''}`
    ),
  });

export const sendStaffInviteEmail = async (email, name, tempPassword) =>
  deliver({
    to: email,
    subject: `Your ${BRAND} staff account`,
    devLabel: `temp password ${tempPassword}`,
    html: layout(
      `Hi ${name}, your staff account is ready`,
      `<p style="color:#b8c5d9;">Sign in to the admin dashboard with the temporary password below, then change it from your profile.</p>
       <p style="font-size:20px;font-weight:800;color:#22f0ff;background:#132038;padding:12px 16px;border-radius:8px;display:inline-block;">${tempPassword}</p>
       <p><a href="${config.clientUrl}/admin/login" style="display:inline-block;background:linear-gradient(90deg,#00e5ff,#d946ef);color:#030712;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700;">Open admin</a></p>`
    ),
  });

export const sendSellEnquiryEmail = async (to, { customerName, customerEmail, title, quote, notes }) => {
  if (!to) return { skipped: true };
  return deliver({
    to,
    subject: `${BRAND} sell enquiry: ${title}`,
    html: layout(
      'New sell-to-us enquiry',
      `<p style="color:#b8c5d9;"><strong style="color:#f4f7fb;">${customerName}</strong> (${customerEmail}) wants to sell <strong style="color:#f4f7fb;">${title}</strong>.</p>
       <p style="color:#22f0ff;font-size:22px;font-weight:800;">Quoted offer: £${Number(quote || 0).toFixed(2)}</p>
       <p style="color:#e8eef7;white-space:pre-wrap;">${notes || ''}</p>`
    ),
  });
};

export const sendGameRequestUpdateEmail = async (email, request) =>
  deliver({
    to: email,
    subject: `${BRAND} update on "${request.title}"`,
    html: layout(
      `We have an update on "${request.title}"`,
      `<p style="color:#b8c5d9;">Status: <strong style="color:#f4f7fb;">${request.status}</strong></p>
       ${request.adminResponse ? `<p style="color:#b8c5d9;">${request.adminResponse}</p>` : ''}`
    ),
  });

export const sendContactNotification = async (row, to) => {
  if (!to) return { skipped: true };
  return deliver({
    to,
    subject: `${BRAND} contact form: ${row.subject}`,
    html: layout(
      'New contact form message',
      `<p style="color:#b8c5d9;"><strong style="color:#f4f7fb;">${row.name}</strong> (${row.email}${row.phone ? `, ${row.phone}` : ''}) wrote:</p>
       <p style="color:#e8eef7;white-space:pre-wrap;">${row.message}</p>`
    ),
  });
};

export const sendContactReply = async (row, reply) =>
  deliver({
    to: row.email,
    subject: `Re: ${row.subject}`,
    html: layout(
      `Reply from ${BRAND}`,
      `<p style="color:#b8c5d9;">Hi ${row.name},</p>
       <p style="color:#e8eef7;white-space:pre-wrap;">${reply}</p>
       <p style="color:#6b7c99;font-size:13px;margin-top:24px;">Your original message:</p>
       <p style="color:#8fa0bb;white-space:pre-wrap;">${row.message}</p>`
    ),
  });
