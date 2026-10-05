import { brochureServices } from '../../service';
import { BrochureStudio } from '../../studio';
export default async function Editor({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const s = await brochureServices('brochure.view', true);
  const [b, data, assets] = await Promise.all([
    s.brochure.read(id),
    s.brochure.list(),
    s.allowed('brochure.media.manage')
      ? s.brochure.assets()
      : Promise.resolve([]),
  ]);
  return (
    <BrochureStudio
      id={id}
      initial={b.document}
      initialVersion={b.version}
      status={b.status}
      kit={data.kit}
      canEdit={
        s.allowed('brochure.manage') &&
        !['archived', 'suspended'].includes(b.status)
      }
      canPublish={s.allowed('brochure.publish')}
      assets={assets.map((a) => ({
        id: String(a.id),
        name: String(a.name),
        width: Number(a.width) || null,
        height: Number(a.height) || null,
      }))}
    />
  );
}
