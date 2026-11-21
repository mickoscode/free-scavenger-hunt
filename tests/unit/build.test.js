import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

test("the build produces the pages the CDN depends on", () => {
  for (const page of ["index.html", "404.html", "favicon.svg"]) {
    assert.ok(existsSync(new URL(`../../dist/${page}`, import.meta.url)), `${page} is in dist/`);
  }
});

test("pages are mobile friendly and titled", () => {
  const html = readFileSync(new URL("../../dist/index.html", import.meta.url), "utf8");
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, /<title>[^<]+<\/title>/);
});
