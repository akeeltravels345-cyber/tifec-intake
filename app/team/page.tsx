import { redirect } from "next/navigation";

// /team has no landing of its own — the team area opens on the notice board.
// This redirect makes every link to /team (Today's Team card, the
// needs-attention rows) resolve instead of 404ing.
export default function TeamIndex() {
  redirect("/team/notices");
}
