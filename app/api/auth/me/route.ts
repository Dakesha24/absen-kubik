import { requireRole } from "@/lib/auth";

export async function GET() {
  const auth = await requireRole();
  if (auth.response) return auth.response;
  return Response.json({ user: auth.user });
}
