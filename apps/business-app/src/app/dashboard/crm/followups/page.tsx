import { SalesQueue } from '../queue';
import type { Params } from '../lookups';
export default async function Followups({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  return <SalesQueue params={await searchParams} />;
}
