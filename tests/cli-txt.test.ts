import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, beforeAll, afterAll } from "vitest";

const execFileAsync = promisify(execFile);
const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");
const cliPath = path.join(process.cwd(), "src", "cli.ts");

const runCli = async (args: string[]) => {
  return execFileAsync(tsxBin, [cliPath, ...args], { encoding: "utf8" });
};

describe("cli txt", () => {
  let tempDir = "";

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "file-splitter-cli-"));
  });

  afterAll(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("writes a single empty chunk for empty input", async () => {
    const inputPath = path.join(tempDir, "empty.txt");
    const outDir = path.join(tempDir, "out");

    await fs.writeFile(inputPath, "", "utf8");
    await fs.mkdir(outDir, { recursive: true });

    await runCli([
      "txt",
      inputPath,
      "--out",
      outDir,
      "--max",
      "10",
      "--by",
      "characters",
    ]);

    const files = await fs.readdir(outDir);
    expect(files).toEqual(["empty_00001.txt"]);

    const content = await fs.readFile(path.join(outDir, files[0]), "utf8");
    expect(content).toBe("");
  });
});
