import { db } from "../../../../db";

export async function GET() {
  try {
    await db.prepare("SELECT 1 AS healthy").first();
    return Response.json({ status: "ok", database: "connected" });
  } catch {
    return Response.json({ status: "error", database: "unavailable" }, { status: 503 });
  }
}
