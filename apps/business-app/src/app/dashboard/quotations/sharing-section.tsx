import Link from 'next/link';
import { commercialServices } from '../commercial/service';
import { ShareForm } from './share-form';
export async function SharingSection({
  revisionId,
  status,
  page = 1,
}: {
  revisionId: string;
  status: string;
  page?: number;
}) {
  const s = await commercialServices('quotation.view', 'quotation');
  const canShare = s.allowed('quotation.share', 'quotation'),
    canRespond = s.allowed('quotation.customer_response.view', 'quotation');
  if (!canShare && !canRespond) return null;
  const { data: response } = canRespond
    ? await s.client
        .from('quotation_customer_responses')
        .select(
          'action,customer_name,comment,responded_at,accepted_amount,currency',
        )
        .eq('organization_id', s.org)
        .eq('revision_id', revisionId)
        .maybeSingle()
    : { data: null };
  const { data: links, count } = canShare
    ? await s.client
        .from('quotation_share_links')
        .select(
          'id,created_at,expires_at,revoked_at,first_viewed_at,last_viewed_at,view_count',
          { count: 'exact' },
        )
        .eq('organization_id', s.org)
        .eq('revision_id', revisionId)
        .order('created_at', { ascending: false })
        .order('id')
        .range((page - 1) * 25, page * 25 - 1)
    : { data: [], count: 0 };
  return (
    <section className="my-8 rounded border p-5">
      <h2 className="text-2xl font-semibold">Customer share and response</h2>
      {response ? (
        <article>
          <h3 className="text-xl">
            {response.action === 'approved'
              ? 'Commercially accepted'
              : response.action.replaceAll('_', ' ')}
          </h3>
          <p>
            {response.customer_name} ·{' '}
            {new Date(response.responded_at).toLocaleString()}
          </p>
          <p className="whitespace-pre-wrap">{response.comment}</p>
          {response.accepted_amount && (
            <p>
              Accepted amount: {response.currency} {response.accepted_amount}
            </p>
          )}
          {status !== 'issued' && (
            <p>Historical response; this revision is {status}.</p>
          )}
        </article>
      ) : (
        <p>Awaiting customer response.</p>
      )}
      {canShare && status === 'issued' && <ShareForm revisionId={revisionId} />}
      <ul>
        {links?.map((link) => (
          <li className="my-4 border-t pt-4" key={link.id}>
            <p>
              {link.revoked_at
                ? 'Revoked'
                : link.expires_at && new Date(link.expires_at) < new Date()
                  ? 'Expired'
                  : 'Link active'}{' '}
              · Created {new Date(link.created_at).toLocaleString()}
            </p>
            <p>
              Expires:{' '}
              {link.expires_at
                ? new Date(link.expires_at).toLocaleString()
                : 'No expiry'}
            </p>
            <p>
              First viewed:{' '}
              {link.first_viewed_at
                ? new Date(link.first_viewed_at).toLocaleString()
                : 'Not viewed'}{' '}
              · Last viewed:{' '}
              {link.last_viewed_at
                ? new Date(link.last_viewed_at).toLocaleString()
                : 'Not viewed'}{' '}
              · Views {link.view_count}
            </p>
            {!link.revoked_at && (
              <>
                <ShareForm
                  revisionId={revisionId}
                  shareId={link.id}
                  action="revoke"
                />
                {status === 'issued' && (
                  <details>
                    <summary>Rotate and copy a new link</summary>
                    <ShareForm
                      revisionId={revisionId}
                      shareId={link.id}
                      action="rotate"
                    />
                  </details>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      <nav className="flex gap-4">
        {page > 1 && (
          <Link href={'?share_page=' + (page - 1)}>Previous links</Link>
        )}
        {page * 25 < (count ?? 0) && (
          <Link href={'?share_page=' + (page + 1)}>More links</Link>
        )}
      </nav>
    </section>
  );
}
