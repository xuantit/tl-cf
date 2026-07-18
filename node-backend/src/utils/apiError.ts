import { isCloudflareError, type CloudflareError } from "../services/cloudflare.js";

export interface ApiErrorEnvelope {
  code: string;
  detail: string;
  retryable: boolean;
  retryAfter?: number;
  requiredPermission: string | null;
  planRequirement: string | null;
  cf: {
    status: number;
    errors: Array<{ code?: number; message: string }>;
  } | null;
}

function normalizeCloudflareCode(error: CloudflareError): string {
  if (error.status === 429) return "CLOUDFLARE_RATE_LIMITED";
  if (error.status === 403) return "CLOUDFLARE_FORBIDDEN";
  if (error.status === 401) return "CLOUDFLARE_UNAUTHORIZED";
  return error.code;
}

export function apiErrorEnvelope(error: unknown, fallbackCode: string, fallbackDetail: string): ApiErrorEnvelope {
  if (isCloudflareError(error)) {
    return {
      code: normalizeCloudflareCode(error),
      detail: error.message || fallbackDetail,
      retryable: error.retryable,
      retryAfter: error.retryAfter,
      requiredPermission: null,
      planRequirement: null,
      cf: {
        status: error.status ?? 0,
        errors: error.cfErrors,
      },
    };
  }

  const err = error as Error;
  return {
    code: fallbackCode,
    detail: err?.message || fallbackDetail,
    retryable: false,
    retryAfter: undefined,
    requiredPermission: null,
    planRequirement: null,
    cf: null,
  };
}

export function sendApiError(
  res: any,
  error: unknown,
  options: { status: number; code: string; detail: string }
) {
  const status = isCloudflareError(error) && error.status ? error.status : options.status;
  return res.status(status).json(apiErrorEnvelope(error, options.code, options.detail));
}
