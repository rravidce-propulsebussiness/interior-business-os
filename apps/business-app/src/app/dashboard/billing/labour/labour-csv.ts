import type { LabourDisbursement } from '@business-os/database/labour-disbursements';

const fields=[
  'Worker / Contractor','Project','Work description','Work from','Work to',
  'Gross amount (INR)','Deductions (INR)','Net amount (INR)','Status',
  'Payment method','Payment reference','Paid at','Internal notes',
] as const;

export function labourCsvCell(value: unknown): string {
  if(value===null||value===undefined)return '""';
  const text=String(value);
  const safe=/^[\s]*[=+\-@\t\r]/.test(text)?"'"+text:text;
  return '"'+safe.replace(/"/g,'""')+'"';
}
export function labourDisbursementsCsv(rows:LabourDisbursement[]):string {
  const values=rows.map(row=>[
    row.payeeName,row.projectName??'',row.workDescription,row.workFrom,row.workTo,
    Number(row.grossAmount).toFixed(2),Number(row.deductions).toFixed(2),
    Number(row.netAmount).toFixed(2),row.status,row.paymentMethod??'',
    row.paymentReference,row.paidAt??'',row.notes,
  ]);
  return '\uFEFF'+[fields.map(labourCsvCell).join(','),
    ...values.map(row=>row.map(labourCsvCell).join(','))].join('\r\n')+'\r\n';
}
