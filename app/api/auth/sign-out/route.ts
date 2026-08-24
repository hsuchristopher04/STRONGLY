import { deleteSession, expiredSessionCookie, SESSION_COOKIE } from "../../../auth";

export async function POST(request: Request) {
  const token = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  await deleteSession(token);
  const response = Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.headers.append("set-cookie", expiredSessionCookie(new URL(request.url).protocol === "https:"));
  return response;
}
