/**
 * RFC 9457 — Problem Details for HTTP APIs
 * ทุก error ที่ออกจาก API ต้องมีรูปแบบนี้ ไม่มีข้อยกเว้น
 */
export interface ProblemDetails {
  /** URI ที่อธิบายประเภทของปัญหา */
  type: string;
  title: string;
  status: number;
  detail?: string;
  /** path ที่เกิดปัญหา */
  instance?: string;
  /** ให้ผู้ใช้ส่งมาให้ dev ตามหา log ได้ */
  traceId?: string;
  errors?: FieldError[];
}

export interface FieldError {
  path: string;
  code: string;
  message: string;
}

export const PROBLEM_BASE_URI = 'https://nosion.dev/errors';

export const ProblemType = {
  validationFailed: `${PROBLEM_BASE_URI}/validation-failed`,
  unauthorized: `${PROBLEM_BASE_URI}/unauthorized`,
  forbidden: `${PROBLEM_BASE_URI}/forbidden`,
  notFound: `${PROBLEM_BASE_URI}/not-found`,
  conflict: `${PROBLEM_BASE_URI}/conflict`,
  versionConflict: `${PROBLEM_BASE_URI}/version-conflict`,
  rateLimited: `${PROBLEM_BASE_URI}/rate-limited`,
  tokenReuse: `${PROBLEM_BASE_URI}/token-reuse-detected`,
  internal: `${PROBLEM_BASE_URI}/internal-error`,
} as const;
