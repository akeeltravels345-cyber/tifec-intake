import { NextResponse } from "next/server";
import { getCurrentClinician } from "@/lib/auth";
import { isSystemAdmin } from "@/lib/clinicians";
import { setHipaaStatus, addHipaaComment, type HipaaStatus, HIPAA_STATUSES } from "@/lib/hipaa";

export const dynamic = "force-dynamic";

// The HIPAA tracker is a leadership tool: the practice owner and the system admin
// can update it. Everyone else is refused.
async function gate() {
  const me = await getCurrentClinician();
  if (!me) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  if (!isSystemAdmin(me) && me.contact !== "owner") return { error: NextResponse.json({ error: "Not allowed." }, { status: 403 }) };
  return { me };
}

export async function POST(req: Request) {
  const g = await gate();
  if ("error" in g) return g.error;
  const { me } = g;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }

  const action = String(body.action ?? "");
  const taskId = String(body.taskId ?? "");
  if (!taskId) return NextResponse.json({ error: "Missing task." }, { status: 400 });

  if (action === "status") {
    const status = String(body.status ?? "");
    if (!HIPAA_STATUSES.includes(status as HipaaStatus)) return NextResponse.json({ error: "Bad status." }, { status: 400 });
    await setHipaaStatus(taskId, status as HipaaStatus);
    return NextResponse.json({ ok: true });
  }

  if (action === "comment") {
    const text = String(body.text ?? "");
    const comment = await addHipaaComment(taskId, { id: me.id, name: me.name }, text);
    if (!comment) return NextResponse.json({ error: "Empty or invalid comment." }, { status: 400 });
    return NextResponse.json({ ok: true, comment });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
