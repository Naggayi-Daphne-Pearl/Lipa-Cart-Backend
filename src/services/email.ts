import * as nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

/**
 * Initialize the Nodemailer transporter.
 * Call once at server startup. Skips gracefully if not configured.
 */
export function initEmail(): boolean {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn('[email] SMTP not configured — email notifications disabled');
    return false;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  console.log('[email] Nodemailer initialized');
  return true;
}

/** Whether the email service is ready. */
export function isEmailReady(): boolean {
  return transporter !== null;
}

const FROM_ADDRESS = process.env.SMTP_FROM || 'LipaCart <noreply@lipacart.com>';

/**
 * Send a generic email. Returns true on success.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  if (!transporter || !to) return false;

  try {
    await transporter.sendMail({ from: FROM_ADDRESS, to, subject, html });
    return true;
  } catch (err: any) {
    console.error(`[email] Failed to send to ${to}:`, err?.message);
    return false;
  }
}

/**
 * Send an order confirmation email to the customer.
 */
export async function sendOrderConfirmationEmail(
  strapi: any,
  orderId: number,
  orderNumber: string,
): Promise<void> {
  if (!isEmailReady()) return;

  try {
    const customerEmail = await _getCustomerEmail(strapi, orderId);
    if (!customerEmail) return;

    const order: any = await strapi.db.query('api::order.order').findOne({
      where: { id: orderId },
    });

    const total = order?.total ?? 0;
    const formattedTotal = `UGX ${Number(total).toLocaleString()}`;

    await sendEmail(
      customerEmail,
      `Order Confirmed — #${orderNumber}`,
      `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #15874B; font-size: 24px; margin: 0;">LipaCart</h1>
          <p style="color: #6B6660; margin: 4px 0 0;">Fresh groceries delivered to your doorstep</p>
        </div>
        <div style="background: #F5F2ED; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
          <h2 style="color: #2D2D2D; font-size: 20px; margin: 0 0 8px;">Order Confirmed!</h2>
          <p style="color: #6B6660; margin: 0;">Your order <strong>#${orderNumber}</strong> has been placed successfully.</p>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 8px 0; color: #6B6660;">Order Number</td>
            <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #2D2D2D;">#${orderNumber}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6B6660;">Total</td>
            <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #15874B;">${formattedTotal}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6B6660;">Status</td>
            <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #EA7702;">Payment Confirmed</td>
          </tr>
        </table>
        <p style="color: #6B6660; font-size: 14px;">A personal shopper will be assigned to your order shortly. You'll receive updates as your order progresses.</p>
        <hr style="border: none; border-top: 1px solid #EDE9E3; margin: 20px 0;" />
        <p style="color: #8F8A82; font-size: 12px; text-align: center;">LipaCart — Delivering fresh groceries across East Africa</p>
      </div>
      `,
    );
  } catch (err: any) {
    console.error('[email] sendOrderConfirmationEmail error:', err?.message);
  }
}

/**
 * Send a delivery receipt email to the customer.
 */
export async function sendDeliveryReceiptEmail(
  strapi: any,
  orderId: number,
  orderNumber: string,
): Promise<void> {
  if (!isEmailReady()) return;

  try {
    const customerEmail = await _getCustomerEmail(strapi, orderId);
    if (!customerEmail) return;

    const order: any = await strapi.db.query('api::order.order').findOne({
      where: { id: orderId },
    });

    const total = order?.total ?? 0;
    const formattedTotal = `UGX ${Number(total).toLocaleString()}`;

    await sendEmail(
      customerEmail,
      `Order Delivered — #${orderNumber}`,
      `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #15874B; font-size: 24px; margin: 0;">LipaCart</h1>
          <p style="color: #6B6660; margin: 4px 0 0;">Fresh groceries delivered to your doorstep</p>
        </div>
        <div style="background: #E3F5EC; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
          <h2 style="color: #15874B; font-size: 20px; margin: 0 0 8px;">Order Delivered!</h2>
          <p style="color: #2D2D2D; margin: 0;">Your order <strong>#${orderNumber}</strong> has been delivered. Enjoy your groceries!</p>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 8px 0; color: #6B6660;">Order Number</td>
            <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #2D2D2D;">#${orderNumber}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6B6660;">Total Paid</td>
            <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #15874B;">${formattedTotal}</td>
          </tr>
        </table>
        <p style="color: #6B6660; font-size: 14px;">If you have any issues with your order, please contact us in the app. Don't forget to rate your experience!</p>
        <hr style="border: none; border-top: 1px solid #EDE9E3; margin: 20px 0;" />
        <p style="color: #8F8A82; font-size: 12px; text-align: center;">LipaCart — Delivering fresh groceries across East Africa</p>
      </div>
      `,
    );
  } catch (err: any) {
    console.error('[email] sendDeliveryReceiptEmail error:', err?.message);
  }
}

/**
 * Look up the customer's email address from an order ID.
 */
async function _getCustomerEmail(strapi: any, orderId: number): Promise<string | null> {
  try {
    const customerLink: any = await strapi.db.connection.raw(
      `SELECT user_id FROM orders_customer_lnk WHERE order_id = ?`,
      [orderId],
    );
    const rows = customerLink?.rows || customerLink;
    if (!rows || rows.length === 0) return null;

    const user: any = await strapi.db.query('api::user.user').findOne({
      where: { id: rows[0].user_id },
    });

    return user?.email || null;
  } catch {
    return null;
  }
}
