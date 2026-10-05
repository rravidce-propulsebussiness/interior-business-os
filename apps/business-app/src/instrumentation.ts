import { validateDeploymentEnvironment } from '@business-os/shared/runtime';

export function register() {
  if (process.env.APP_ENV)
    validateDeploymentEnvironment(process.env, 'business-app');
}
