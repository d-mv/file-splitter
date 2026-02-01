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

const run = async (cmd: string, args: string[]) => {
  await execFileAsync(cmd, args, { stdio: "inherit" });
};

describe("cli mp3 extra", () => {
  let tempDir = "";
  let inputPath = "";

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "file-splitter-cli-mp3-extra-"));
    inputPath = path.join(tempDir, "input.mp3");

    await run("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=1000:duration=1",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=44100:d=1",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=1000:duration=1",
      "-filter_complex",
      "[0:a][1:a][2:a]concat=n=3:v=0:a=1",
      inputPath,
    ]);
  });

  afterAll(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("splits by minutes via CLI", async () => {
    const outDir = path.join(tempDir, "minutes");
    await fs.mkdir(outDir, { recursive: true });

    await runCli([
      "mp3",
      inputPath,
      "--out",
      outDir,
      "--by",
      "minutes",
      "--max",
      "0.03",
    ]);

    const files = await fs.readdir(outDir);
    expect(files.length).toBe(2);
  });

  it("splits by bytes via CLI", async () => {
    const outDir = path.join(tempDir, "bytes");
    await fs.mkdir(outDir, { recursive: true });

    const stats = await fs.stat(inputPath);
    await runCli([
      "mp3",
      inputPath,
      "--out",
      outDir,
      "--by",
      "bytes",
      "--max",
      String(Math.max(1, Math.floor(stats.size / 2))),
    ]);

    const files = await fs.readdir(outDir);
    expect(files.length).toBeGreaterThanOrEqual(2);
  });
});
