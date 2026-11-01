import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { parseQuestionImport } from "@/lib/parse-questions";

describe("parseQuestionImport", () => {
  it("reads the checked-in sample pack", () => {
    const text = fs.readFileSync(path.join(process.cwd(), "data", "sample-questions.csv"), "utf8");
    const questions = parseQuestionImport(text);
    expect(questions.length).toBeGreaterThanOrEqual(12);
    expect(questions[0].prompt).toMatch(/comfort food/);
    expect(questions.find((question) => question.prompt === "Coffee, tea, or neither?")).toMatchObject({
      category: "food",
    });
  });

  it("keeps commas in pasted lines and splits an optional category on a pipe", () => {
    const questions = parseQuestionImport(
      "Coffee, tea, or neither?\nWhat song do they sing in the car? | music\n\n",
    );
    expect(questions).toEqual([
      { prompt: "Coffee, tea, or neither?", category: null },
      { prompt: "What song do they sing in the car?", category: "music" },
    ]);
  });

  it("parses a csv header", () => {
    const questions = parseQuestionImport('prompt,category\n"What, exactly, is dinner?",food\n');
    expect(questions).toEqual([{ prompt: "What, exactly, is dinner?", category: "food" }]);
  });
});
