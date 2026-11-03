// Ends the session, whatever the role (POST /api/candidate/auth with "logout", S1-26).
// Shared by the header's user menu and the company space, so logging out works the same everywhere.
export async function logOut() {
  await fetch("/api/candidate/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "logout" }),
  }).catch(() => null);
}
