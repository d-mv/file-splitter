import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { buildSegmentArgs, buildSliceArgs, splitMp3 } from "../src/mp3/split.js";

const execFileAsync = promisify(execFile);

const run = async (cmd: string, args: string[]) => {
  await execFileAsync(cmd, args, { stdio: "inherit" });
};

const probeTags = async (filePath: string): Promise<Record<string, string>> => {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format_tags=title,artist",
      "-of",
      "default=nw=1",
      filePath,
    ],
    { encoding: "utf8" },
  );

  const tags: Record<string, string> = {};
  for (const line of stdout.split("\n")) {
    if (!line.includes("=")) continue;
    const [rawKey, value] = line.split("=");
    if (rawKey && value) {
      const key = rawKey.trim().replace(/^TAG:/, "");
      tags[key] = value.trim();
    }
  }
  return tags;
};

const hasAttachedPicture = async (filePath: string): Promise<boolean> => {
  const { stdout } = await execFileAsync(
    "ffprobe",
    ["-v", "error", "-show_streams", "-of", "json", filePath],
    { encoding: "utf8" },
  );

  const data = JSON.parse(stdout) as {
    streams?: Array<{ disposition?: { attached_pic?: number } }>;
  };

  return data.streams?.some((stream) => stream.disposition?.attached_pic === 1) ?? false;
};

describe("splitMp3", () => {
  let tempDir = "";
  let inputPath = "";

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "file-splitter-"));
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
      "-metadata",
      "title=TestTitle",
      "-metadata",
      "artist=TestArtist",
      inputPath,
    ]);
  });

  afterAll(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("splits by minutes into multiple chunks", async () => {
    const outDir = path.join(tempDir, "minutes");
    await fs.mkdir(outDir, { recursive: true });

    const outputs = await splitMp3(inputPath, {
      outDir,
      by: "minutes",
      max: 0.03,
    });

    expect(outputs.length).toBe(2);
  });

  it("splits by bytes into multiple chunks", async () => {
    const outDir = path.join(tempDir, "bytes");
    await fs.mkdir(outDir, { recursive: true });

    const stats = await fs.stat(inputPath);
    const outputs = await splitMp3(inputPath, {
      outDir,
      by: "bytes",
      max: Math.max(1, Math.floor(stats.size / 2)),
    });

    expect(outputs.length).toBeGreaterThanOrEqual(2);
  });

  it("splits on silence when respect-silence is enabled", async () => {
    const outDir = path.join(tempDir, "silence");
    await fs.mkdir(outDir, { recursive: true });

    const outputs = await splitMp3(inputPath, {
      outDir,
      respectSilence: 0.5,
    });

    expect(outputs.length).toBe(2);
  });

  it("preserves metadata tags in output chunks", async () => {
    const outDir = path.join(tempDir, "tags");
    await fs.mkdir(outDir, { recursive: true });

    const outputs = await splitMp3(inputPath, {
      outDir,
      by: "minutes",
      max: 0.03,
    });

    const tags = await probeTags(outputs[0]);
    expect(tags.title).toBe("TestTitle");
    expect(tags.artist).toBe("TestArtist");
  });

  it("preserves embedded artwork in output chunks", async () => {
    const outDir = path.join(tempDir, "artwork");
    await fs.mkdir(outDir, { recursive: true });

    const imagePath = path.join(tempDir, "cover.jpg");
    await run("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=64x64",
      "-frames:v",
      "1",
      imagePath,
    ]);

    const inputWithArt = path.join(tempDir, "input-with-art.mp3");
    await run("ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-i",
      imagePath,
      "-map",
      "0:a",
      "-map",
      "1:v",
      "-c:a",
      "libmp3lame",
      "-c:v",
      "mjpeg",
      "-id3v2_version",
      "3",
      "-disposition:v",
      "attached_pic",
      inputWithArt,
    ]);

    const outputs = await splitMp3(inputWithArt, {
      outDir,
      by: "minutes",
      max: 0.03,
    });

    const hasArt = await hasAttachedPicture(outputs[0]);
    expect(hasArt).toBe(true);
  });

  it("builds segment args that map audio only", () => {
    const args = buildSegmentArgs({
      inputPath: "input.mp3",
      outputPattern: "out_%05d.mp3",
      seconds: 30,
      tags: { title: "Title", artist: "Artist" },
    });

    const mapIndex = args.findIndex((value) => value === "-map");
    expect(mapIndex).toBeGreaterThanOrEqual(0);
    expect(args[mapIndex + 1]).toBe("0:a");
    expect(args.includes("0:v")).toBe(false);
  });

  it("builds slice args that map audio only", () => {
    const args = buildSliceArgs({
      inputPath: "input.mp3",
      outputPath: "chunk.mp3",
      start: 10,
      duration: 5,
      tags: { title: "Title", artist: "Artist" },
    });

    const mapIndex = args.findIndex((value) => value === "-map");
    expect(mapIndex).toBeGreaterThanOrEqual(0);
    expect(args[mapIndex + 1]).toBe("0:a");
    expect(args.includes("0:v")).toBe(false);
  });

  it("throws when both by minutes and respect-silence are provided", async () => {
    await expect(
      splitMp3(inputPath, {
        outDir: tempDir,
        by: "minutes",
        max: 0.03,
        respectSilence: 0.5,
      }),
    ).rejects.toThrow();
  });
});
