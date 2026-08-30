"use client";

import { useEffect, useState } from "react";
import type { BuilderTask } from "@/lib/builderTasks";

const TASK_LIMIT = 6; // fold the list past this many tasks (house rule: >6 rows collapse)

type Status = "todo" | "prog" | "done";
const LABEL: Record<Status, string> = { todo: "Not started", prog: "In progress", done: "Done" };

function statusOf(t: BuilderTask): Status {
  const live = t.subs.filter((s) => !s.archived); // archived tasks are put away
  const required = live.filter((s) => !s.optional);
  const base = required.length ? required : live;
  if (base.length === 0) return "todo";
  const done = base.filter((s) => s.done).length;
  if (done === 0) return "todo";
  if (done === base.length) return "done";
  return "prog";
}
const caymanDay = (iso: string) => {
  try { return new Intl.DateTimeFormat("en-GB", { timeZone: "America/Cayman", day: "numeric", month: "short" }).format(new Date(iso)); }
  catch { return ""; }
};

// The system admin's private worklist, shown on Today. Optimistic: each change
// updates the on-screen list right away and posts to /api/builder-tasks in the
// background, replacing the task with the server's copy when it returns.
export default function Worklist({ initial, title = "My worklist", chip = "Admin only" }: { initial: BuilderTask[]; title?: string; chip?: string }) {
  const [tasks, setTasks] = useState<BuilderTask[]>(initial);
  const [openId, setOpenId] = useState<string | null>(() => {
    const prog = initial.find((t) => statusOf(t) === "prog");
    return prog ? prog.id : null;
  });
  const [newTask, setNewTask] = useState("");
  const [subDraft, setSubDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // First-run tutorial nudging the user to add their own task. Shown once (per
  // browser) until they add a task or dismiss it.
  const [showAll, setShowAll] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [openArchSubs, setOpenArchSubs] = useState<Set<string>>(new Set());
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [coach, setCoach] = useState(false);
  useEffect(() => {
    try { if (!localStorage.getItem("wl-coach-seen")) setCoach(true); } catch { /* storage off */ }
  }, []);
  const dismissCoach = () => {
    setCoach(false);
    try { localStorage.setItem("wl-coach-seen", "1"); } catch { /* storage off */ }
  };

  const replace = (task: BuilderTask) => setTasks((ts) => ts.map((t) => (t.id === task.id ? task : t)));

  async function post(action: string, payload: Record<string, unknown>): Promise<BuilderTask | null> {
    setErr("");
    try {
      const res = await fetch("/api/builder-tasks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "Something went wrong."); return null; }
      return (data.task as BuilderTask) ?? null;
    } catch { setErr("Could not reach the server."); return null; }
  }

  function toggleSub(task: BuilderTask, subId: string, done: boolean) {
    replace({ ...task, subs: task.subs.map((s) => (s.id === subId ? { ...s, done } : s)) });
    post("sub:toggle", { taskId: task.id, subId, done }).then((t) => t && replace(t));
  }

  async function addSub(task: BuilderTask) {
    const text = (subDraft[task.id] || "").trim();
    if (!text) return;
    setSubDraft((d) => ({ ...d, [task.id]: "" }));
    const t = await post("sub:add", { taskId: task.id, text });
    if (t) replace(t);
  }

  function deleteSub(task: BuilderTask, subId: string) {
    replace({ ...task, subs: task.subs.filter((s) => s.id !== subId) });
    post("sub:delete", { taskId: task.id, subId }).then((t) => t && replace(t));
  }

  async function addTask() {
    const title = newTask.trim();
    if (!title || busy) return;
    setBusy(true);
    const t = await post("task:create", { title });
    setBusy(false);
    if (t) { setTasks((ts) => [...ts, t]); setNewTask(""); setOpenId(t.id); dismissCoach(); }
  }

  function removeTask(task: BuilderTask) {
    if (!confirm(`Remove the heading "${task.title}" and its tasks?`)) return;
    setTasks((ts) => ts.filter((t) => t.id !== task.id));
    post("task:delete", { taskId: task.id });
  }

  function archiveTask(task: BuilderTask, archived: boolean) {
    replace({ ...task, archived });
    post("task:archive", { taskId: task.id, archived }).then((t) => t && replace(t));
  }
  function archiveSub(task: BuilderTask, subId: string, archived: boolean) {
    replace({ ...task, subs: task.subs.map((s) => (s.id === subId ? { ...s, archived } : s)) });
    post("sub:archive", { taskId: task.id, subId, archived }).then((t) => t && replace(t));
  }
  const toggleArchSubs = (id: string) => setOpenArchSubs((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  function startRename(task: BuilderTask) { setEditId(task.id); setEditTitle(task.title); }
  async function saveRename(task: BuilderTask) {
    const title = editTitle.trim();
    setEditId(null);
    if (!title || title === task.title) return;
    replace({ ...task, title });
    const updated = await post("task:update", { taskId: task.id, title });
    if (updated) replace(updated);
  }

  function move(task: BuilderTask, dir: -1 | 1) {
    const i = tasks.findIndex((t) => t.id === task.id);
    const j = i + dir;
    if (j < 0 || j >= tasks.length) return;
    const next = tasks.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setTasks(next);
    post("reorder", { orderedIds: next.map((t) => t.id) });
  }

  const activeTasks = tasks.filter((t) => !t.archived);
  const archivedTasks = tasks.filter((t) => t.archived);
  const liveSubs = (t: BuilderTask) => t.subs.filter((s) => !s.archived);
  const totalSteps = activeTasks.reduce((n, t) => n + liveSubs(t).length, 0);
  const doneSteps = activeTasks.reduce((n, t) => n + liveSubs(t).filter((s) => s.done).length, 0);
  const pct = totalSteps ? Math.round((doneSteps / totalSteps) * 100) : 0;

  return (
    <div className="wl">
      <div className="wl-secrow">
        <span className="bo-lab">{title}</span>
        {chip && <span className="wl-admin">{chip}</span>}
        <span className="wl-sp" />
        <div className="wl-prog">
          <div className="wl-track"><i style={{ width: `${pct}%` }} /></div>
          <span className="wl-pct">{pct}% &middot; {doneSteps} of {totalSteps} tasks</span>
        </div>
      </div>

      {err && <p className="wl-err">{err}</p>}

      <section className="wl-panel">
        <div className="wl-list">
        {(showAll ? activeTasks : activeTasks.slice(0, TASK_LIMIT)).map((t, i) => {
          const st = statusOf(t);
          const subsActive = t.subs.filter((s) => !s.archived);
          const subsArchived = t.subs.filter((s) => s.archived);
          const total = subsActive.length;
          const done = subsActive.filter((s) => s.done).length;
          const p = total ? Math.round((done / total) * 100) : 0;
          const open = openId === t.id;
          return (
            <div key={t.id} className={`wl-task s-${st} ${open ? "open" : ""}`}>
              <div className="wl-row" onClick={() => (editId === t.id ? null : setOpenId(open ? null : t.id))}>
                <span className="wl-dot" />
                <div className="wl-main">
                  {editId === t.id ? (
                    <input className="wl-rename" autoFocus value={editTitle}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveRename(t); if (e.key === "Escape") setEditId(null); }}
                      onBlur={() => saveRename(t)} />
                  ) : (
                    <>
                      <div className="wl-name">{t.title}</div>
                      {t.blurb && <div className="wl-blurb">{t.blurb}</div>}
                    </>
                  )}
                </div>
                <div className="wl-rowacts" onClick={(e) => e.stopPropagation()}>
                  <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(t, -1)}>↑</button>
                  <button type="button" aria-label="Move down" disabled={i === activeTasks.length - 1} onClick={() => move(t, 1)}>↓</button>
                  <button type="button" aria-label="Rename heading" onClick={() => startRename(t)}>✎</button>
                  <button type="button" aria-label="Archive heading" title="Archive heading" onClick={() => archiveTask(t, true)}>⤓</button>
                  <button type="button" className="del" aria-label="Delete heading" onClick={() => removeTask(t)}>×</button>
                </div>
                <span className="wl-pill">{LABEL[st]}</span>
                <div className="wl-mini">
                  <div className="wl-mt"><i style={{ width: `${p}%` }} /></div>
                  <div className="wl-mc">{done}/{total}</div>
                </div>
                <span className="wl-chev">▸</span>
              </div>

              <div className="wl-subs">
                {subsActive.map((s) => (
                  <div key={s.id} className={`wl-sub ${s.done ? "done" : ""}`}>
                    <input type="checkbox" className="wl-cb" checked={s.done} onChange={(e) => toggleSub(t, s.id, e.target.checked)} id={`wl-${s.id}`} />
                    <label htmlFor={`wl-${s.id}`}>{s.text}{s.optional && <span className="wl-opt">optional</span>}</label>
                    {s.done && <button type="button" className="wl-subarch" aria-label="Archive task" title="Archive this task" onClick={() => archiveSub(t, s.id, true)}>⤓</button>}
                    <button type="button" className="wl-del" aria-label="Remove task" onClick={() => deleteSub(t, s.id)}>×</button>
                  </div>
                ))}
                {subsArchived.length > 0 && (
                  <div className="wl-archsubs">
                    <button type="button" className="wl-archtoggle" onClick={() => toggleArchSubs(t.id)}>
                      {openArchSubs.has(t.id) ? "Hide" : "Show"} {subsArchived.length} archived {subsArchived.length === 1 ? "task" : "tasks"}
                    </button>
                    {openArchSubs.has(t.id) && subsArchived.map((s) => (
                      <div key={s.id} className="wl-sub done archived">
                        <span className="wl-archdot">✓</span>
                        <label>{s.text}</label>
                        <button type="button" className="wl-restore" onClick={() => archiveSub(t, s.id, false)}>Restore</button>
                        <button type="button" className="wl-del" aria-label="Remove task" onClick={() => deleteSub(t, s.id)}>×</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="wl-add">
                  <input type="text" placeholder="Add a task under this heading…" value={subDraft[t.id] || ""}
                    onChange={(e) => setSubDraft((d) => ({ ...d, [t.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") addSub(t); }} />
                  <button type="button" onClick={() => addSub(t)}>Add</button>
                </div>
                <div className="wl-foot">
                  <span>Updated {caymanDay(t.updatedAt)}</span>
                  <span className="wl-footacts">
                    <button type="button" className="wl-remove" onClick={() => archiveTask(t, true)}>Archive</button>
                    <button type="button" className="wl-remove danger" onClick={() => removeTask(t)}>Remove heading</button>
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        {activeTasks.length > TASK_LIMIT && (
          <button type="button" className="wl-showall" onClick={() => setShowAll((s) => !s)}>
            {showAll ? "Show fewer" : `Show all ${activeTasks.length} headings`}
            <span className={`wl-showchev ${showAll ? "up" : ""}`} aria-hidden="true">▾</span>
          </button>
        )}
        </div>

        {archivedTasks.length > 0 && (
          <div className="wl-archived">
            <button type="button" className="wl-archhead" onClick={() => setShowArchived((s) => !s)}>
              <span className={`wl-showchev ${showArchived ? "up" : ""}`} aria-hidden="true">▸</span>
              Archived <span className="wl-archcount">{archivedTasks.length}</span>
            </button>
            {showArchived && archivedTasks.map((t) => (
              <div key={t.id} className="wl-archrow">
                <span className="wl-archname">{t.title}</span>
                <span className="wl-archmeta">{t.subs.filter((s) => s.done).length}/{t.subs.length} done</span>
                <button type="button" className="wl-restore" onClick={() => archiveTask(t, false)}>Restore</button>
                <button type="button" className="wl-del" aria-label="Delete heading" onClick={() => removeTask(t)}>×</button>
              </div>
            ))}
          </div>
        )}

        {coach && (
          <div className="wl-coach">
            <span className="wl-coach-ico">👋</span>
            <span className="wl-coach-txt">This is your worklist. Add a <b>heading</b> below (a group), then open it to add tasks underneath. It saves automatically.</span>
            <button type="button" className="wl-coach-x" onClick={dismissCoach} aria-label="Dismiss tip">✕</button>
          </div>
        )}
        <div className={`wl-addtask ${coach ? "wl-cued" : ""}`}>
          <input type="text" placeholder="Add a heading (tasks go under it)…" value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addTask(); }} />
          <button type="button" onClick={addTask} disabled={busy || !newTask.trim()}>Add</button>
        </div>
      </section>
    </div>
  );
}
