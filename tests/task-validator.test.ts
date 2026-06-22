import { describe, expect, it } from "vitest";
import { validateTaskLines } from "../src/utils/task-validator";

describe("task validator", () => {
  it("should return valid for empty input", () => {
    const result = validateTaskLines("");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should return valid for correct SMART inputs", () => {
    const inputs = [
      "Design 2 thumbnails for Instagram by 17:00",
      "Write 1 TikTok script by 18h30",
      "Review PR code trước 15:00",
      "Họp team meeting lúc 10h",
      "Deadline 12:00 for the project presentation",
      "Upload 5 videos to Drive before 23:59",
    ];

    inputs.forEach((input) => {
      const result = validateTaskLines(input);
      expect(result.valid).toBe(true);
    });
  });

  it("should return invalid if task is too short", () => {
    const result = validateTaskLines("làm bài 10h");
    expect(result.valid).toBe(false);
    expect(result.errors[0].reasons[0]).toContain("quá ngắn");
  });

  it("should return invalid if task is missing deadline", () => {
    const result = validateTaskLines("Design 2 thumbnails for Instagram");
    expect(result.valid).toBe(false);
    expect(result.errors[0].reasons[0]).toContain("thiếu mốc thời gian");
  });

  it("should validate multiple lines and report specific lines", () => {
    const input = "Design 2 thumbnails for Instagram by 17:00\ncontent\nWrite 1 TikTok script by 18h30";
    const result = validateTaskLines(input);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].lineIndex).toBe(2);
    expect(result.errors[0].line).toBe("content");
    expect(result.errors[0].reasons).toHaveLength(2); // Too short AND missing deadline
  });
});
