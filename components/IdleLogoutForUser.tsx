import { getCurrentClinician } from "@/lib/auth";
import { getIdleMinutes, IDLE_MINUTES_DEFAULT } from "@/lib/users";
import IdleLogout from "./IdleLogout";

// Server wrapper: reads the signed-in user's chosen auto-logout window and hands
// it to the client-side idle timer. Keeps automatic logoff on for everyone (a
// HIPAA safeguard); users just pick how long from a capped set in their account.
export default async function IdleLogoutForUser() {
  const me = await getCurrentClinician();
  const minutes = me ? await getIdleMinutes(me.id) : IDLE_MINUTES_DEFAULT;
  return <IdleLogout minutes={minutes} />;
}
