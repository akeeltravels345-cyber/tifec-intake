import { NextResponse } from "next/server";
import { getCurrentClinician } from "@/lib/auth";
import { isSystemAdmin } from "@/lib/clinicians";
import {
  listBuilderTasks, createTask, updateTask, deleteTask,
  addSub, toggleSub, deleteSub, reorderTasks,
} from "@/lib/builderTasks";

export const dynamic = "force-dynamic";

const MAX_TITLE = 160;
const MAX_TEXT = 400;
const MAX_NOTE = 2000;

// The builder task list is the system admin's alone. Everyone else (owner,
// biller, clinicians) is refused, so this never leaks build notes.
async function requireAdmin() {
  const me = await getCurrentClinician();
  if (!me) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  if (!isSystemAdmin(me)) return { error: NextResponse.json({ error: "Not permitted." }, { status: 403 }) };
  return { me };
}

export async function GET() {
  const { me, error } = await requireAdmin();
  if (error) return error;
  const tasks = await listBuilderTasks(me.id);
  return NextResponse.json({ tasks });
}

export async function POST(req: Request) {
  const { me, error } = await requireAdmin();
  if (error) return error;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const action = String(body.action || "");
  const s = (v: unknown, cap: number) => String(v ?? "").slice(0, cap);

  try {
    if (action === "task:create") {
      const title = s(body.title, MAX_TITLE).trim();
      if (!title) return NextResponse.json({ error: "Give the task a name." }, { status: 400 });
      const task = await createTask(me.id, title, s(body.blurb, MAX_TEXT));
      return NextResponse.json({ ok: true, task });
    }

    if (action === "task:update") {
      const patch: { title?: string; blurb?: string; note?: string } = {};
      if (body.title != null) patch.title = s(body.title, MAX_TITLE);
      if (body.blurb != null) patch.blurb = s(body.blurb, MAX_TEXT);
      if (body.note != null) patch.note = s(body.note, MAX_NOTE);
      const task = await updateTask(me.id, String(body.taskId), patch);
      if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });
      return NextResponse.json({ ok: true, task });
    }

    if (action === "task:delete") {
      await deleteTask(me.id, String(body.taskId));
      return NextResponse.json({ ok: true });
    }

    if (action === "sub:add") {
      const text = s(body.text, MAX_TEXT).trim();
      if (!text) return NextResponse.json({ error: "Write the step first." }, { status: 400 });
      const task = await addSub(me.id, String(body.taskId), text);
      if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });
      return NextResponse.json({ ok: true, task });
    }

    if (action === "sub:toggle") {
      const task = await toggleSub(me.id, String(body.taskId), String(body.subId), !!body.done);
      if (!task) return NextResponse.json({ error: "Step not found." }, { status: 404 });
      return NextResponse.json({ ok: true, task });
    }

    if (action === "sub:delete") {
      const task = await deleteSub(me.id, String(body.taskId), String(body.subId));
      if (!task) return NextResponse.json({ error: "Step not found." }, { status: 404 });
      return NextResponse.json({ ok: true, task });
    }

    if (action === "reorder") {
      const ids = Array.isArray(body.orderedIds) ? body.orderedIds.map((x) => String(x)) : [];
      await reorderTasks(me.id, ids);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    console.error("builder task action failed", e);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
