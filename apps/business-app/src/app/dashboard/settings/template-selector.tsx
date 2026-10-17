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
      Select from approved designs. Your choice applies only to future sales invoices.</p>
    {canManage && sales.length>0 ? <ActionForm action={selectInvoiceTemplate} label="Save invoice design">
      <label className="us-field"><span>Default sales invoice template</span>
        <select name="template" defaultValue={current?.templateId??''} required>
          <option value="" disabled>Select a design</option>
          {sales.map(t=><option key={t.id} value={t.id}>{t.name} ({t.config.layout})</option>)}
        </select>
      </label>
    </ActionForm> : <p className="us-info">
      {canManage?'No company-selectable templates available.':'An authorized billing manager can change this template.'}
    </p>}
  </div>;
}
