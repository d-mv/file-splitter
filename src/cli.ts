#!/usr/bin/env node
import { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import { splitText } from "./txt/split.js";
import { splitMp3 } from "./mp3/split.js";

const zeroPad = (value: number, length: number): string => {
  return value.toString().padStart(length, "0");
};

const buildOutputPath = (inputPath: string, outDir: string, index: number): string => {
  const ext = path.extname(inputPath);
  const base = path.basename(inputPath, ext);
  return path.join(outDir, `${base}_${zeroPad(index, 5)}${ext}`);
};

const parseNumber = (value: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number: ${value}`);
  }
  return parsed;
};

const ensureOutDir = async (outDir: string) => {
  await fs.mkdir(outDir, { recursive: true });
};

const program = new Command();

program.name("file-splitter").description("Split large files into smaller chunks");

program
  .command("txt")
  .argument("<input>")
  .requiredOption("--out <dir>")
  .requiredOption("--max <value>")
  .requiredOption("--by <mode>", "bytes | characters | lines")
  .option("--paragraphs", "do not split paragraphs")
  .option("--headers", "prepend chunk headers")
  .option("--header-template <template>")
  .action(async (input: string, options) => {
    const max = parseNumber(options.max);
    if (max <= 0) {
      throw new Error("--max must be greater than 0");
    }

    const by = options.by as "bytes" | "characters" | "lines";
    if (!by || !["bytes", "characters", "lines"].includes(by)) {
      throw new Error("--by must be bytes, characters, or lines");
    }

    await ensureOutDir(options.out);

    const content = await fs.readFile(input, "utf8");
    let chunks = splitText(content, {
      max,
      by,
      paragraphs: Boolean(options.paragraphs),
      headers: Boolean(options.headers),
      headerTemplate: options.headerTemplate,
    });

    if (chunks.length === 0) {
      chunks = [options.headers ? `${options.headerTemplate ?? "Chunk {index}/{total}\n"}`.replaceAll("{index}", "1").replaceAll("{total}", "1") : ""];
    }

    await Promise.all(
      chunks.map((chunk, index) =>
        fs.writeFile(buildOutputPath(input, options.out, index + 1), chunk, "utf8"),
      ),
    );
  });

program
  .command("mp3")
  .argument("<input>")
  .requiredOption("--out <dir>")
  .option("--by <mode>", "bytes | minutes")
  .option("--max <value>")
  .option("--respect-silence <seconds>")
  .action(async (input: string, options) => {
    const by = options.by as "bytes" | "minutes" | undefined;
    const respectSilence = options.respectSilence
      ? parseNumber(options.respectSilence)
      : undefined;

    const max = options.max ? parseNumber(options.max) : undefined;

    await splitMp3(input, {
      outDir: options.out,
      by,
      max,
      respectSilence,
    });
  });

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
