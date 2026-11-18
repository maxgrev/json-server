import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, test } from "node:test";

describe("bin: port validation", () => {
  function runPort(argv: string[], env: Record<string, string> = {}) {
    const childEnv = { ...process.env };
    delete childEnv["PORT"];
    return spawnSync(
      process.execPath,
      ["--experimental-strip-types", "src/bin.ts", ...argv, "fixtures/db.json"],
      { encoding: "utf-8", env: { ...childEnv, ...env }, timeout: 10000 },
    );
  }

  function assertInvalid(result: ReturnType<typeof runPort>, value: string) {
    assert.equal(result.status, 2);
    assert.match(
      result.stderr,
      new RegExp(`Error: invalid port "${value}", must be a number between 0 and 65535`),
    );
    assert.equal(result.stdout, "");
  }

  test("rejects -p abc", () => {
    assertInvalid(runPort(["-p", "abc"]), "abc");
  });

  test("rejects -p 3000abc", () => {
    assertInvalid(runPort(["-p", "3000abc"]), "3000abc");
  });

  test("rejects -p 70000", () => {
    assertInvalid(runPort(["-p", "70000"]), "70000");
  });

  test("rejects PORT=abc from env when -p is absent", () => {
    assertInvalid(runPort([], { PORT: "abc" }), "abc");
  });

  test("does not reject a valid port", () => {
    // Missing db file makes the process exit without starting a server,
    // so only the port validation is exercised.
    const result = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "src/bin.ts", "-p", "3000", "fixtures/does-not-exist.json"],
      { encoding: "utf-8", timeout: 10000 },
    );
    assert.doesNotMatch(result.stderr, /invalid port/);
  });
});
