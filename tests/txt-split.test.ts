import { describe, expect, it } from "vitest";
import { splitText } from "../src/txt/split.js";

describe("splitText", () => {
  it("splits by bytes into max-sized chunks", () => {
    const chunks = splitText("abcdefghij", { max: 4, by: "bytes" });
    expect(chunks).toEqual(["abcd", "efgh", "ij"]);
  });

  it("splits by characters into max-sized chunks", () => {
    const chunks = splitText("abcdef", { max: 2, by: "characters" });
    expect(chunks).toEqual(["ab", "cd", "ef"]);
  });

  it("splits by lines into max-sized chunks", () => {
    const input = "a\nb\nc\nd\n";
    const chunks = splitText(input, { max: 2, by: "lines" });
    expect(chunks).toEqual(["a\nb\n", "c\nd\n"]);
  });

  it("does not split inside a paragraph when paragraphs mode is on", () => {
    const input = "paragraph-one";
    const chunks = splitText(input, { max: 4, by: "characters", paragraphs: true });
    expect(chunks).toEqual(["paragraph-one"]);
  });

  it("splits only between paragraphs when paragraphs mode is on", () => {
    const input = "p1\n\np2\n\np3";
    const chunks = splitText(input, { max: 2, by: "characters", paragraphs: true });
    expect(chunks).toEqual(["p1", "p2", "p3"]);
  });

  it("adds headers when enabled with a template", () => {
    const chunks = splitText("aaabbb", {
      max: 3,
      by: "characters",
      headers: true,
      headerTemplate: "[chunk {index}/{total}]\n",
    });

    expect(chunks).toEqual(["[chunk 1/2]\naaa", "[chunk 2/2]\nbbb"]);
  });
});
