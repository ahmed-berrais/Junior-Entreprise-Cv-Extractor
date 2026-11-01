import { after, test } from "node:test";
import assert from "node:assert/strict";
import { admin, APP_URL, createUser, deleteTestUsers } from "./helpers";
after(deleteTestUsers);
test("company login accepts a code pasted with spaces and a newline", async () => {
  const company = await createUser("company");
  const inserted = await admin.from("companies").insert({ user_id: company.id, name: "Pasted code test" });
  assert.equal(inserted.error, null);
  const response = await fetch(`${APP_URL}/api/company/auth`, { method: "POST", headers: { origin: APP_URL, "content-type": "application/json" }, body: JSON.stringify({ email: company.email, password: ` \n${company.password}\t ` }) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).redirect, "/company/cvs");
});
