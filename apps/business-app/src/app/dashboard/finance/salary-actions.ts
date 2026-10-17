'use server';
import { revalidatePath } from 'next/cache';
import { activeOrganization, serverServices } from '@business-os/auth/server';
import { safeFailure, idSchema } from '@business-os/shared';
import { z } from 'zod';
import { salaryLedger } from './salary-service';
type FormResult={message:string};
const input=z.object({
 employeeName:z.string().trim().min(2).max(160),
 salaryMonth:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
 gross:z.coerce.number().positive().max(999999999999),
 deductions:z.coerce.number().min(0).max(999999999999),
 notes:z.string().max(800),
}).refine(row=>row.deductions<=row.gross);
export async function saveEmployeeSalary(_previous:FormResult,data:FormData):Promise<FormResult> {
 try {
  const ctx=await activeOrganization();
  if(!ctx)return{message:'Choose a company first'};
  const {authorization,client}=await serverServices();
  await authorization.requirePermission(ctx.organizationId,'payment.record');
  const parsed=input.parse(Object.fromEntries(['employeeName','salaryMonth','gross','deductions','notes'].map(key=>[key,data.get(key)??''])));
  await salaryLedger(client).create(ctx.organizationId,{
   employeeName:parsed.employeeName,salaryMonth:parsed.salaryMonth,
   gross:parsed.gross.toFixed(2),deductions:parsed.deductions.toFixed(2),notes:parsed.notes,
  });
  revalidatePath('/dashboard/finance');
  return{message:'Salary entry recorded. Mark it paid only after completing the transfer.'};
 }catch(error){return{message:safeFailure(error).message};}
}
export async function payEmployeeSalary(_previous:FormResult,data:FormData):Promise<FormResult> {
 try {
  const ctx=await activeOrganization();
  if(!ctx)return{message:'Choose a company first'};
  const {authorization,client}=await serverServices();
  await authorization.requirePermission(ctx.organizationId,'payment.record');
  const id=idSchema.parse(data.get('id'));
  const method=z.enum(['cash','upi','bank_transfer','cheque','other']).parse(data.get('method'));
  const reference=z.string().max(120).parse(data.get('reference')??'');
  await salaryLedger(client).markPaid(ctx.organizationId,id,method,reference);
  revalidatePath('/dashboard/finance');
  return{message:'Salary payment confirmed.'};
 }catch(error){return{message:safeFailure(error).message};}
}
