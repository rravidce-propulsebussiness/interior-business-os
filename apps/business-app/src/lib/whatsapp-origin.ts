function firstHeaderValue(value: string | null) {
  return value?.split(',')[0]?.trim() ?? '';
}

export function validSameOrigin(request: Request) {
  const originHeader = request.headers.get('origin');
  if (!originHeader) return false;

  let origin: URL;
  try {
    origin = new URL(originHeader);
  } catch {
    return false;
  }
  if (origin.protocol !== 'https:' && origin.protocol !== 'http:') return false;

  const configuredOrigin = process.env.APP_ORIGIN?.trim();
  if (configuredOrigin) {
    try {
      return origin.origin === new URL(configuredOrigin).origin;
    } catch {
      return false;
    }
  }

  try {
    const requestUrl = new URL(request.url);
    const forwardedHost = firstHeaderValue(
      request.headers.get('x-forwarded-host'),
    );
    const requestHost = firstHeaderValue(request.headers.get('host'));
    const forwardedProtocol = firstHeaderValue(
      request.headers.get('x-forwarded-proto'),
    );
    const expectedHost = forwardedHost || requestHost || requestUrl.host;
    const expectedProtocol = forwardedProtocol
      ? `${forwardedProtocol.replace(/:$/, '')}:`
      : requestUrl.protocol;
    return (
      origin.host.toLowerCase() === expectedHost.toLowerCase() &&
      origin.protocol === expectedProtocol.toLowerCase()
    );
  } catch {
    return false;
  }
}
