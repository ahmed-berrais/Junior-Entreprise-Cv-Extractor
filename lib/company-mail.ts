import "server-only";
import nodemailer from "nodemailer";

// Plain text avoids HTML injection from company names. Codes are never stored or logged.
export async function sendCompanyCode(email: string, name: string, code: string) {
  const { SMTP_HOST, SMTP_USER, SMTP_PASSWORD, APP_URL } = process.env;
  const port = Number(process.env.SMTP_PORT || 465);
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD || !APP_URL || !Number.isInteger(port)) throw new Error("Mail is not configured");
  const transport = nodemailer.createTransport({ host: SMTP_HOST, port, secure: port === 465, requireTLS: port !== 465, auth: { user: SMTP_USER, pass: SMTP_PASSWORD }, connectionTimeout: 10_000, socketTimeout: 20_000 });
  const url = new URL("/company/login", APP_URL).toString();
  await transport.sendMail({ from: SMTP_USER, to: email, subject: "Pristini JE — Company access / Accès entreprise", text: `Hello ${name},\n\nWelcome to the Pristini JE CV platform.\nLog in: ${url}\nEmail: ${email}\nAccess code: ${code}\n\nThis code replaces any previous code. Keep it private. Contact the organisers if you need help.\n\nBonjour ${name},\n\nBienvenue sur la plateforme CV de Pristini JE.\nConnexion : ${url}\nE-mail : ${email}\nCode d’accès : ${code}\n\nCe code remplace tout ancien code. Gardez-le confidentiel. Contactez les organisateurs si vous avez besoin d’aide.\n\nPristini Junior Entreprise` });
}
