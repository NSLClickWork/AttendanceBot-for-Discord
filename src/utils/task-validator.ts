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
      lineErrors.push("too short (needs at least 20 characters to be clear)");
    }

    if (!deadlineRegex.test(line)) {
      lineErrors.push("missing deadline (e.g. '17:00' or 'by 18:30')");
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
  let message = "⚠️ **Your task does not match the SMART format!**\n\n";
  
  errors.forEach((err) => {
    message += `Line ${err.lineIndex}: "${err.line}"\n`;
    message += `👉 Error: ${err.reasons.join(", ")}\n\n`;
  });

  message += "*Please include what, how much, where, and by when (e.g. \"Design 2 thumbnails for Instagram by 16:30\").*";
  
  return message;
}
