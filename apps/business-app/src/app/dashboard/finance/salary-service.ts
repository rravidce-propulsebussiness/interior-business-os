import 'server-only';
import { createServerDatabase } from '@business-os/database/server';
import { DomainError } from '@business-os/shared';

export type SalaryRow = {
 id:string;employeeName:string;salaryMonth:string;gross:number;deductions:number;
 net:number;status:'pending'|'paid';paymentMethod:string|null;
 paymentReference:string;paidAt:string|null;notes:string;
};
export function salaryLedger(client:Awaited<ReturnType<typeof createServerDatabase>>) {
 const rpc=client.rpc.bind(client) as unknown as
  (name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:{code?:string}|null}>;
 async function invoke<T>(name:string,args:Record<string,unknown>):Promise<T> {
   const {data,error}=await rpc(name,args);
   if(error)throw new DomainError(error.code==='42501'?'FORBIDDEN':
     ['23505','40001'].includes(error.code??'')?'CONFLICT':
     ['22023','22P02','23514'].includes(error.code??'')?'VALIDATION_FAILED':'INTERNAL_ERROR');
   return data as T;
 }
 return {
  list:(org:string,month:string)=>invoke<SalaryRow[]>('company_salary_list',{
   p_org:org,p_month:month,
  }),
  create:(org:string,input:Record<string,string>)=>invoke<string>('company_salary_create',{
   p_org:org,p_input:input,
  }),
  markPaid:(org:string,id:string,method:string,reference:string)=>
   invoke<void>('company_salary_mark_paid',{
    p_org:org,p_id:id,p_method:method,p_reference:reference,
   }),
 };
}
