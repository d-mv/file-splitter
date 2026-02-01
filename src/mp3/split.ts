import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

type SplitBy = "bytes" | "minutes";

type SplitMp3Options = {
  outDir: string;
  by?: SplitBy;
  max?: number;
  respectSilence?: number;
};

const execFileAsync = promisify(execFile);

const run = async (cmd: string, args: string[]): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${cmd} exited with code ${code ?? "unknown"}`));
    });
  });
};

const probeNumber = async (filePath: string, entry: string): Promise<number> => {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      `format=${entry}`,
      "-of",
      "default=nw=1",
      filePath,
    ],
    { encoding: "utf8" },
  );

  const line = stdout.trim();
  const [, value] = line.split("=");
  return Number(value);
};

const hasAttachedPicture = async (filePath: string): Promise<boolean> => {
  const { stdout } = await execFileAsync(
    "ffprobe",
    ["-v", "error", "-show_entries", "stream=disposition", "-of", "json", filePath],
    { encoding: "utf8" },
  );

  const data = JSON.parse(stdout) as {
    streams?: Array<{ disposition?: { attached_pic?: number } }>;
  };

  return data.streams?.some((stream) => stream.disposition?.attached_pic === 1) ?? false;
};

const zeroPad = (value: number, length: number): string => {
  return value.toString().padStart(length, "0");
};

const listMp3Files = async (dirPath: string): Promise<string[]> => {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".mp3"))
    .map((entry) => path.join(dirPath, entry.name))
    .sort((a, b) => a.localeCompare(b));
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

const buildOutputPattern = (inputPath: string, outDir: string): string => {
  const base = path.basename(inputPath, path.extname(inputPath));
  return path.join(outDir, `${base}_%05d.mp3`);
};

const attachArtwork = async (sourcePath: string, targetPath: string): Promise<void> => {
  const tempPath = `${targetPath}.art.mp3`;
  await run("ffmpeg", [
    "-y",
    "-i",
    targetPath,
    "-i",
    sourcePath,
    "-map",
    "0:a",
    "-map",
    "1:v",
    "-c",
    "copy",
    "-id3v2_version",
    "3",
    "-write_id3v1",
    "1",
    "-disposition:v",
    "attached_pic",
    tempPath,
  ]);
  await fs.rename(tempPath, targetPath);
};

const segmentByTime = async (
  inputPath: string,
  outDir: string,
  seconds: number,
  tags: Record<string, string>,
) => {
  const outputPattern = buildOutputPattern(inputPath, outDir);
  const args = [
    "-y",
    "-i",
    inputPath,
  ];

  if (tags.title) {
    args.push("-metadata", `title=${tags.title}`);
  }
  if (tags.artist) {
    args.push("-metadata", `artist=${tags.artist}`);
  }

  args.push(
    "-id3v2_version",
    "3",
    "-write_id3v1",
    "1",
    "-c:a",
    "libmp3lame",
    "-f",
    "segment",
    "-segment_time",
    String(seconds),
    "-reset_timestamps",
    "1",
    outputPattern,
  );

  await run("ffmpeg", args);
};

const splitOnSilence = async (
  inputPath: string,
  outDir: string,
  minSeconds: number,
  tags: Record<string, string>,
): Promise<void> => {
  const result = await execFileAsync(
    "ffmpeg",
    [
      "-i",
      inputPath,
      "-af",
      `silencedetect=n=-30dB:d=${minSeconds}`,
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8" },
  ).catch((error) => {
    return { stderr: String(error.stderr ?? "") };
  });

  const log = result.stderr ?? "";
  const starts: number[] = [];
  const ends: number[] = [];

  for (const line of log.split("\n")) {
    const startMatch = line.match(/silence_start: ([0-9.]+)/);
    if (startMatch) {
      starts.push(Number(startMatch[1]));
      continue;
    }
    const endMatch = line.match(/silence_end: ([0-9.]+)/);
    if (endMatch) {
      ends.push(Number(endMatch[1]));
    }
  }

  const boundaries = (starts.length > 0 ? starts : ends).filter((point) => point > 0);
  if (boundaries.length === 0) {
    await segmentByTime(inputPath, outDir, 999999, tags);
    return;
  }

  const base = path.basename(inputPath, path.extname(inputPath));
  let start = 0;
  let index = 1;

  for (const end of boundaries) {
    const duration = Math.max(0.01, end - start);
    const outputPath = path.join(outDir, `${base}_${zeroPad(index, 5)}.mp3`);
    const args = [
      "-y",
      "-i",
      inputPath,
    ];
    if (tags.title) {
      args.push("-metadata", `title=${tags.title}`);
    }
    if (tags.artist) {
      args.push("-metadata", `artist=${tags.artist}`);
    }
    args.push(
      "-id3v2_version",
      "3",
      "-write_id3v1",
      "1",
      "-ss",
      String(start),
      "-t",
      String(duration),
      "-c:a",
      "libmp3lame",
      outputPath,
    );
    await run("ffmpeg", args);
    start = end;
    index += 1;
  }

  const totalDuration = await probeNumber(inputPath, "duration");
  if (totalDuration > start) {
    const outputPath = path.join(outDir, `${base}_${zeroPad(index, 5)}.mp3`);
    const args = [
      "-y",
      "-i",
      inputPath,
    ];
    if (tags.title) {
      args.push("-metadata", `title=${tags.title}`);
    }
    if (tags.artist) {
      args.push("-metadata", `artist=${tags.artist}`);
    }
    args.push(
      "-id3v2_version",
      "3",
      "-write_id3v1",
      "1",
      "-ss",
      String(start),
      "-t",
      String(totalDuration - start),
      "-c:a",
      "libmp3lame",
      outputPath,
    );
    await run("ffmpeg", args);
  }
};

const segmentByBytes = async (
  inputPath: string,
  outDir: string,
  maxBytes: number,
  tags: Record<string, string>,
): Promise<void> => {
  const bitrate = await probeNumber(inputPath, "bit_rate");
  const seconds = Math.max(0.1, (maxBytes * 8) / bitrate);
  await segmentByTime(inputPath, outDir, seconds, tags);
};

export const splitMp3 = async (
  inputPath: string,
  options: SplitMp3Options,
): Promise<string[]> => {
  if (options.by === "minutes" && options.respectSilence) {
    throw new Error("respect-silence cannot be used with by minutes");
  }

  await fs.mkdir(options.outDir, { recursive: true });

  const tags = await probeTags(inputPath);

  if (options.respectSilence) {
    await splitOnSilence(inputPath, options.outDir, options.respectSilence, tags);
  } else if (options.by === "minutes") {
    if (!options.max || options.max <= 0) {
      throw new Error("max is required for by minutes");
    }
    const seconds = options.max * 60;
    await segmentByTime(inputPath, options.outDir, seconds, tags);
  } else if (options.by === "bytes") {
    if (!options.max || options.max <= 0) {
      throw new Error("max is required for by bytes");
    }
    await segmentByBytes(inputPath, options.outDir, options.max, tags);
  } else {
    throw new Error("by minutes/bytes or respect-silence is required");
  }

  const outputs = await listMp3Files(options.outDir);
  const shouldAttach = await hasAttachedPicture(inputPath);
  if (shouldAttach) {
    for (const output of outputs) {
      await attachArtwork(inputPath, output);
    }
  }
  return outputs;
};
