/**
 * SMS Service — Africa's Talking provider for OTP delivery.
 *
 * Africa's Talking is the leading SMS gateway in East Africa with
 * reliable delivery in Uganda (+256) and Kenya (+254).
 *
 * Env vars:
 *   AT_API_KEY     — API key from africastalking.com dashboard
 *   AT_USERNAME    — Username (use "sandbox" for testing)
 *   AT_SENDER_ID   — Optional sender name (e.g. "LipaCart")
 */

let atClient: any = null;
let smsService: any = null;

/**
 * Initialize the Africa's Talking SMS client.
 * Call once at server startup. Skips gracefully if not configured.
 */
export function initSms(): boolean {
  const apiKey = process.env.AT_API_KEY;
  const username = process.env.AT_USERNAME;

  if (!apiKey || !username) {
    console.warn('[sms] Africa\'s Talking not configured — SMS disabled (OTPs logged to console)');
    return false;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AfricasTalking = require('africastalking');
    atClient = AfricasTalking({ apiKey, username });
    smsService = atClient.SMS;
    console.log(`[sms] Africa's Talking initialized (username: ${username})`);
    return true;
  } catch (err: any) {
    console.error('[sms] Failed to initialize Africa\'s Talking:', err?.message);
    return false;
  }
}

/** Whether the SMS service is ready to send. */
export function isSmsReady(): boolean {
  return smsService !== null;
}

/**
 * Send an SMS message to a phone number.
 * Returns true on success.
 */
export async function sendSms(to: string, message: string): Promise<boolean> {
  if (!smsService) {
    console.log(`[sms] (not configured) Would send to ${to}: ${message}`);
    return false;
  }

  try {
    const options: any = {
      to: [to],
      message,
    };

    const senderId = process.env.AT_SENDER_ID;
    if (senderId) {
      options.from = senderId;
    }

    const result = await smsService.send(options);
    const recipient = result?.SMSMessageData?.Recipients?.[0];

    if (recipient?.statusCode === 101) {
      return true;
    }

    console.error(`[sms] Send failed for ${to}:`, recipient?.status || 'Unknown error');
    return false;
  } catch (err: any) {
    console.error(`[sms] Error sending to ${to}:`, err?.message);
    return false;
  }
}

/**
 * Send an OTP code via SMS.
 */
export async function sendOtpSms(phone: string, otp: string): Promise<boolean> {
  const message = `Your LipaCart verification code is: ${otp}. Valid for 5 minutes. Do not share this code.`;
  return sendSms(phone, message);
}
