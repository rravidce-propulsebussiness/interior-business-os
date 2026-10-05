// Local SQL/bootstrap/race fixtures must never be pointed at hosted databases.
export function assertLocalTestDatabase(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('LOCAL_TEST_DATABASE_REQUIRED');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    !/^\/[a-zA-Z0-9_]+$/.test(url.pathname) ||
    url.hash ||
    [...url.searchParams.keys()].some((key) => key !== 'sslmode')
  )
    throw new Error('LOCAL_TEST_DATABASE_REQUIRED');
  return value;
}
