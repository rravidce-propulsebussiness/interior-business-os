import { createGstTemplatesRepository } from '@business-os/database/gst-templates';
import { pageServices } from '@business-os/auth/server';
import { ActionForm } from '@business-os/ui/action-form';
import { selectInvoiceTemplate } from './template-actions';

export async function InvoiceTemplateSelector({
  organizationId,canManage,
}:{organizationId:string;canManage:boolean}) {
  const {client}=await pageServices();
  const templates=createGstTemplatesRepository(client);
  const [choices,current]=await Promise.all([
    templates.tenantList(organizationId).catch(()=>[]),
    templates.standard(organizationId).catch(()=>null),
  ]);
  const sales=choices.filter(t=>t.kind==='sales_invoice'&&t.status==='active');
  return <div className="us-invoice-form">
    <p className="us-info">Current template: <strong>{current?.name ?? 'Platform default'}</strong>.
      Update the design for new sales invoices only. Issued invoices retain their existing appearance.</p>
    {canManage && sales.length>0 ? <ActionForm action={selectInvoiceTemplate} label="Save invoice design">
      <label className="us-field"><span>Default sales invoice template</span>
        <select name="template" defaultValue={current?.templateId??''} required>
          <option value="" disabled>Select a design</option>
          {sales.map(t=><option key={t.id} value={t.id}>{t.name} ({t.config.layout})</option>)}
        </select>
      </label>
      <label className="us-field"><span>Design mode</span>
        <select name="mode" defaultValue="preset">
          <option value="preset">Use selected template design</option>
          <option value="custom">Customize selected template using fields below</option>
        </select>
      </label>
      <div className="us-grid">
        <label className="us-field"><span>Layout</span>
          <select name="layout" defaultValue={current?.config.layout ?? 'modern'}>
            <option value="modern">Modern</option>
            <option value="classic">Classic</option>
            <option value="minimal">Minimal</option>
          </select>
        </label>
        <label className="us-field"><span>Accent color</span>
          <input type="color" name="accent" defaultValue={current?.config.accent ?? '#fe5105'}/>
        </label>
        <label className="us-field"><span>Invoice subtitle</span>
          <input name="subtitle" maxLength={120} defaultValue={current?.config.subtitle ?? ''}/>
        </label>
        <label className="us-field"><span>Blank item rows</span>
          <input type="number" name="blankRows" min={1} max={10}
            defaultValue={current?.config.blankRows ?? 1}/>
        </label>
        <label className="us-field us-full"><span>Footer message</span>
          <textarea name="footer" rows={2} maxLength={400}
            defaultValue={current?.config.footer ?? ''}/>
        </label>
        <label className="us-field"><span>
          <input type="checkbox" name="showUnit" defaultChecked={current?.config.showUnit ?? true}/> Show units
        </span></label>
        <label className="us-field"><span>
          <input type="checkbox" name="showDiscount" defaultChecked={current?.config.showDiscount ?? true}/> Show discounts
        </span></label>
      </div>
      <p className="us-info">Choose “Customize” to apply color, layout, header and footer edits. Choose “Use selected template” to restore its preset appearance.</p>
    </ActionForm> : <p className="us-info">
      {canManage?'No company-selectable templates available.':'An authorized billing manager can change this template.'}
    </p>}
  </div>;
}
