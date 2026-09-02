export interface TwilioSosInput {
  to?: string;
  smsBody: string;
  callMessage: string;
}

export interface TwilioDelivery {
  enabled: boolean;
  to?: string;
  sms?: "sent" | "queued" | "skipped" | "failed";
  call?: "sent" | "queued" | "skipped" | "failed";
  sms_sid?: string;
  call_sid?: string;
  error?: string;
}

export async function sendTwilioSos(input: TwilioSosInput): Promise<TwilioDelivery> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const to = input.to || process.env.TWILIO_EMERGENCY_TO || process.env.TWILIO_TO_NUMBER;
  const callsEnabled = process.env.TWILIO_ENABLE_CALLS !== "false";

  if (!accountSid || !authToken || !from || !to) {
    return {
      enabled: false,
      sms: "skipped",
      call: "skipped",
      error: "Twilio env vars are missing, SOS was simulated."
    };
  }

  const delivery: TwilioDelivery = { enabled: true, to };
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  try {
    const sms = await twilioPost(accountSid, auth, "Messages", {
      From: from,
      To: to,
      Body: input.smsBody
    });
    delivery.sms = sms.ok ? "sent" : "failed";
    delivery.sms_sid = sms.sid;
    if (!sms.ok) delivery.error = sms.error;
  } catch (error) {
    delivery.sms = "failed";
    delivery.error = error instanceof Error ? error.message : "SMS failed";
  }

  if (!callsEnabled) {
    delivery.call = "skipped";
    return delivery;
  }

  try {
    const call = await twilioPost(accountSid, auth, "Calls", {
      From: from,
      To: to,
      Twiml: `<Response><Say voice="alice" language="en-IN">${escapeXml(input.callMessage)}</Say></Response>`
    });
    delivery.call = call.ok ? "sent" : "failed";
    delivery.call_sid = call.sid;
    if (!call.ok && !delivery.error) delivery.error = call.error;
  } catch (error) {
    delivery.call = "failed";
    if (!delivery.error) delivery.error = error instanceof Error ? error.message : "Call failed";
  }

  return delivery;
}

async function twilioPost(
  accountSid: string,
  auth: string,
  resource: "Messages" | "Calls",
  params: Record<string, string>
) {
  const body = new URLSearchParams(params);
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/${resource}.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });
  const json = (await response.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
  return {
    ok: response.ok,
    sid: json.sid,
    error: response.ok ? undefined : json.message || `Twilio ${resource} returned ${response.status}`
  };
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
