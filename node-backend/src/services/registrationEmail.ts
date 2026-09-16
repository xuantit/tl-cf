import { Resend } from "resend";
import { env } from "../utils/env.js";

export class RegistrationError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "RegistrationError";
  }
}

export function requireRegistrationEmailConfig() {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL || !env.APP_URL) {
    throw new RegistrationError(503, "EMAIL_NOT_CONFIGURED",
      "Đăng ký qua email chưa được cấu hình. Vui lòng liên hệ quản trị viên.");
  }
  return { apiKey: env.RESEND_API_KEY, from: env.RESEND_FROM_EMAIL, appUrl: env.APP_URL };
}

export async function sendRegistrationEmail(email: string, token: string, deliveryId: string, expiresAt: Date) {
  const config = requireRegistrationEmailConfig();
  const link = new URL("/verify-email", config.appUrl);
  // Fragments are not sent to HTTP servers or leaked through Referer headers.
  link.hash = new URLSearchParams({ token }).toString();
  const url = link.toString();
  const expiry = expiresAt.toISOString();
  try {
    const { data, error } = await new Resend(config.apiKey).emails.send({
      from: `CF Tool <${config.from}>`,
      to: [email],
      subject: "Xác minh email đăng ký CF Tool",
      text: `Hoàn tất đăng ký CF Tool bằng cách mở liên kết và đặt mật khẩu:\n${url}\n\nLiên kết hết hạn lúc ${expiry} (UTC) và chỉ dùng một lần. Gửi lại không gia hạn liên kết. Nếu bạn không yêu cầu đăng ký, hãy bỏ qua email này.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px;color:#202938">
        <h2>Chào mừng đến với CF Tool</h2>
        <p>Xác minh địa chỉ email và đặt mật khẩu để hoàn tất đăng ký.</p>
        <p style="margin:28px 0"><a href="${url}" style="background:#2563eb;color:white;padding:12px 20px;border-radius:8px;text-decoration:none">Xác minh email &amp; tạo tài khoản</a></p>
        <p>Liên kết hết hạn lúc <strong>${expiry} (UTC)</strong> và chỉ dùng một lần. Gửi lại không gia hạn liên kết.</p>
        <p style="color:#64748b">Nếu bạn không yêu cầu đăng ký, hãy bỏ qua email này. Chưa có tài khoản nào được tạo.</p>
      </div>`,
    }, { idempotencyKey: `registration/${deliveryId}` });
    if (error || !data?.id) throw new Error("Email rejected");
  } catch {
    // Never expose provider responses, API keys or verification links in logs/errors.
    throw new RegistrationError(503, "EMAIL_SEND_FAILED",
      "Không gửi được email xác minh. Vui lòng thử lại sau.");
  }
}