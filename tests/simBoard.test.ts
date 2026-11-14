import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// The board simulator must never stream to a real hat by accident (QA #17).
const SIM = fileURLToPath(new URL("../hardware/sim-board.mjs", import.meta.url));
const run = (...args: string[]) =>
  spawnSync(process.execPath, [SIM, ...args], {
    encoding: "utf8",
    timeout: 10_000,
    env: { PATH: process.env.PATH ?? "" } as unknown as NodeJS.ProcessEnv, // no keys, no network target
  });

describe("hardware/sim-board.mjs", () => {
  it("--help prints usage and exits 0 without sending anything", () => {
    const r = run("--help");
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/usage/i);
    expect(r.stdout).toContain("--hat");
  });

  it("refuses to start without an explicit --hat", () => {
    const r = run("--image", "public/demo/menu.jpg");
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/--hat/);
  });

  it("no longer defaults to hat-01", () => {
    const r = run("--frames", "1");
    expect(r.stderr + r.stdout).not.toMatch(/hat-01 .*sending|sending .*hat-01/i);
    expect(r.status).not.toBe(0);
  });
});
