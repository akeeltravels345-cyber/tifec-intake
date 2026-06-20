"use client";

export default function LogoutButton() {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }
  return (
    <button
      onClick={logout}
      style={{
        background: "transparent",
        border: "1px solid var(--line)",
        borderRadius: 8,
        padding: "6px 14px",
        cursor: "pointer",
        fontSize: 13,
        color: "var(--muted)",
      }}
    >
      Sign out
    </button>
  );
}
