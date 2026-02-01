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

describe("cli txt extra", () => {
  let tempDir = "";

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "file-splitter-cli-txt-"));
  });

  afterAll(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("honors paragraphs and headers", async () => {
    const inputPath = path.join(tempDir, "input.txt");
    const outDir = path.join(tempDir, "out");

    await fs.writeFile(inputPath, "p1\n\npp2", "utf8");
    await fs.mkdir(outDir, { recursive: true });

    await runCli([
      "txt",
      inputPath,
      "--out",
      outDir,
      "--max",
      "2",
      "--by",
      "characters",
      "--paragraphs",
      "--headers",
      "--header-template",
      "[chunk {index}/{total}]\n",
    ]);

    const files = await fs.readdir(outDir);
    expect(files).toEqual(["input_00001.txt", "input_00002.txt"]);

    const first = await fs.readFile(path.join(outDir, files[0]), "utf8");
    const second = await fs.readFile(path.join(outDir, files[1]), "utf8");

    expect(first).toBe("[chunk 1/2]\np1");
    expect(second).toBe("[chunk 2/2]\npp2");
  });
});
