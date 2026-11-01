import "server-only";
import type { Role } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth";
export function sameOrigin(request: Request) {
  return request.headers.get("origin") === new URL(process.env.APP_URL || request.url).origin;
}
export async function authorize(request: Request, role: Role) {
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && !sameOrigin(request)) return { response: Response.json({ error: "forbidden" }, { status: 403 }) } as const;
  const user = await getCurrentUser();
  if (!user) return { response: Response.json({ error: "not_logged_in" }, { status: 401 }) } as const;
  if (user.role !== role || user.disabled || (role === "candidate" && !user.emailConfirmed)) return { response: Response.json({ error: "forbidden" }, { status: 403 }) } as const;
  return { user } as const;
}
