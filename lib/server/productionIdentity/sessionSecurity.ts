export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 5;

export const validateSameOriginMutation = (request: Request): boolean => {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
};
