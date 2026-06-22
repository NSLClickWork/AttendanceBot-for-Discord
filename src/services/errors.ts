export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
  }
}

export function assertFound<T>(value: T | null | undefined, code = "NOT_FOUND"): T {
  if (!value) {
    throw new AppError("Matching data not found.", code);
  }
  return value;
}
