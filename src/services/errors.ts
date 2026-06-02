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
    throw new AppError("Không tìm thấy dữ liệu phù hợp.", code);
  }
  return value;
}
