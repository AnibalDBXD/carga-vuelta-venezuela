// Notificaciones al solicitante: correo (SMTP o Mailpit local) y Web Push.
// Solo corre en servidor (desde createServerFn); las dependencias de Node se
// importan dinámicamente para que no entren al bundle del cliente.

export function appUrl(): string {
  return process.env["APP_URL"] ?? "http://localhost:5173";
}

export async function sendMail(msg: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  const smtpUrl = process.env["SMTP_URL"];
  if (smtpUrl) {
    const nodemailer = (await import("nodemailer")).default;
    const transport = nodemailer.createTransport(smtpUrl);
    await transport.sendMail({
      from: "CargaRuta <no-reply@cargaruta.local>",
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
    return;
  }
  const mailpit = process.env["MAILPIT_URL"];
  if (mailpit) {
    const res = await fetch(`${mailpit.replace(/\/+$/, "")}/api/v1/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        From: { Name: "CargaRuta", Email: "no-reply@cargaruta.local" },
        To: [{ Email: msg.to }],
        Subject: msg.subject,
        Text: msg.text,
        HTML: msg.html ?? "",
      }),
    });
    if (!res.ok) throw new Error(`mailpit respondió ${res.status}`);
    return;
  }
  console.log(`[mail:skip] sin SMTP_URL ni MAILPIT_URL → ${msg.to}: ${msg.subject}`);
}

export type PushSubscriptionRow = { endpoint: string; p256dh: string; auth: string };

/** Devuelve 'gone' si la suscripción murió (404/410) para que el caller la borre. */
export async function sendPush(
  sub: PushSubscriptionRow,
  payload: { title: string; body: string; url: string },
): Promise<"sent" | "gone"> {
  const publicKey = process.env["VAPID_PUBLIC_KEY"] ?? process.env["VITE_VAPID_PUBLIC_KEY"];
  const privateKey = process.env["VAPID_PRIVATE_KEY"];
  if (!publicKey || !privateKey) {
    console.log("[push:skip] sin claves VAPID");
    return "sent";
  }
  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails("mailto:no-reply@cargaruta.local", publicKey, privateKey);
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
    );
    return "sent";
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";
    throw error;
  }
}
