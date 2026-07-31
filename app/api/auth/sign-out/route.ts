import { deleteSession, SESSION_COOKIE } from "../../../auth";

export async function POST(request: Request) {
  const token = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  await deleteSession(token);
  const response = Response.json({ ok: true });
  response.headers.append("set-cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return response;
}
