import type { Instrumentation } from 'next';
import { validateDeploymentEnvironment } from '@business-os/shared/runtime';
import { requestErrorName, requestLogCategory } from './request-log';

export function register() {
  if (process.env.APP_ENV)
    validateDeploymentEnvironment(process.env, 'business-app');

  // Lets the operator distinguish startup from missing Hostinger log capture.
  if (process.env.NEXT_RUNTIME === 'nodejs')
    console.log(
      '[Business OS] next.instrumentation.ready pid=' +
        process.pid +
        ' node=' +
        process.version,
    );
}

// Next.js 16 captures rendering, API and Server Action exceptions here.
// Intentionally omit raw URLs, headers, error messages and stack traces;
// these can include cookies, customer names or other confidential data.
export const onRequestError: Instrumentation.onRequestError = (
  error,
  _request,
  context,
) => {
  const category = requestLogCategory(context.routePath) ?? 'other';
  const type = ['render', 'route', 'action', 'proxy'].includes(context.routeType)
    ? context.routeType
    : 'other';
  console.error(
    '[Business OS] next.request.error category=' +
      category +
      ' type=' +
      type +
      ' name=' +
      requestErrorName(error),
  );
};
