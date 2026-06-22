export interface TaskValidationResult {
  valid: boolean;
  errors: TaskValidationError[];
}

export interface TaskValidationError {
  lineIndex: number;
  line: string;
  reasons: string[];
}

export function validateTaskLines(rawInput: string): TaskValidationResult {
  const lines = rawInput.split("\n").map((t) => t.trim()).filter(Boolean);
  const errors: TaskValidationError[] = [];

  const deadlineRegex = /(?:\b(?:by|before|trước|deadline)\s+)?(\d{1,2})[h:.](\d{2})?\b/i;

  lines.forEach((line, index) => {
    const lineErrors: string[] = [];

    if (line.length < 20) {
      lineErrors.push("quá ngắn (cần ít nhất 20 ký tự để mô tả rõ ràng)");
    }

    if (!deadlineRegex.test(line)) {
      lineErrors.push("thiếu mốc thời gian hoàn thành (ví dụ: '17:00' hoặc 'by 18:30')");
    }

    if (lineErrors.length > 0) {
      errors.push({
        lineIndex: index + 1, // 1-indexed for user display
        line,
        reasons: lineErrors,
      });
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function formatValidationError(errors: TaskValidationError[]): string {
  let message = "⚠️ **Báo cáo của bạn chưa đúng định dạng SMART!**\n\n";
  
  errors.forEach((err) => {
    message += `Dòng ${err.lineIndex}: "${err.line}"\n`;
    message += `👉 Lỗi: ${err.reasons.join(", ")}\n\n`;
  });

  message += "*Vui lòng viết rõ làm gì, bao nhiêu, ở đâu và trước mấy giờ (Ví dụ: \"Design 2 thumbnails for Instagram by 16:30\").*";
  
  return message;
}
