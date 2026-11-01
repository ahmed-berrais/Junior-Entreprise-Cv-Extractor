import { test } from "node:test";
import assert from "node:assert/strict";
import { canAccess, pageRedirect } from "@/lib/access";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config } from "@/proxy";

test("admins inspect profiles and the CV list, but not private company areas", () => {
  for (const path of ["/p", "/p/abc123", "/company/cvs", "/company/cvs/abc123"]) {
    assert.equal(canAccess(path, "admin"), true);
    assert.equal(pageRedirect(path, "admin"), null);
    assert.equal(canAccess(path, "candidate"), false);
    assert.equal(canAccess(path, null), false);
  }
  for (const path of ["/company", "/company/profile", "/company/settings", "/company/cvs-private", "/api/company/account"]) {
    assert.equal(canAccess(path, "admin"), false, path);
    assert.equal(pageRedirect(path, "admin"), "/admin");
    assert.equal(canAccess(path, "company"), true);
  }
});
test("protected image-suffix URLs still run proxy; framework assets do not", () => {
  const matches = (url: string) => unstable_doesMiddlewareMatch({ config, nextConfig: {}, url });
  for (const url of ["/favicon.ico", "/_next/static/chunk.js", "/_next/image?url=%2Flogo.png"]) assert.equal(matches(url), false, url);
  for (const url of ["/p/private.png", "/company/cvs/private.jpg", "/admin/export.svg", "/api/admin/export.png", "/candidate/profile.jpeg"]) assert.equal(matches(url), true, url);
});
