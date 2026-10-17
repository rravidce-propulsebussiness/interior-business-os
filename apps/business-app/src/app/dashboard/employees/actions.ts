'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { activeOrganization, serverServices } from '@business-os/auth/server';
import { DomainError, idSchema, safeFailure } from '@business-os/shared';
import { employeeRepository } from './service';
import { employeeProofKey, uploadEmployeeProof, removeEmployeeProof, MAX_PROOF_BYTES, PROOF_MIME } from './proof-storage';
import { salaryLedger } from '../finance/salary-service';

export type EmployeeActionResult = { ok:boolean; message:string; id?:string };

async function context(permission:string) {
  const org=await activeOrganization();
  if(!org) throw new DomainError('FORBIDDEN');
  const {client,authorization}=await serverServices();
  await authorization.requirePermission(org.organizationId,permission);
  return {client,organizationId:org.organizationId,authorization};
}
const employeeSchema=z.object({
  id:z.union([z.uuid(),z.literal('')]).optional(),
  name:z.string().trim().min(2).max(160),
  role:z.string().trim().min(2).max(100),
  department:z.enum(['Office Staff','Site Team','Management','Other']),
  phone:z.string().trim().max(30),
  email:z.union([z.literal(''),z.email().max(254)]),
  address:z.string().trim().max(500),
  city:z.string().trim().max(120),
  workLocation:z.string().trim().max(200),
  dateOfBirth:z.union([z.iso.date(),z.literal('')]),
  joiningDate:z.union([z.iso.date(),z.literal('')]),
  emergencyName:z.string().trim().max(120),
  emergencyPhone:z.string().trim().max(30),
  salaryType:z.enum(['monthly','daily','hourly']),
  salary:z.union([z.literal(''),z.coerce.number().nonnegative().max(9999999999)]).optional(),
  status:z.enum(['active','inactive']),
}).strict();

export async function saveEmployeeProfile(input:unknown):Promise<EmployeeActionResult> {
  try {
    const parsed=employeeSchema.parse(input);
    const {client,organizationId,authorization}=await context('team.manage');
    const {salary,...rest}=parsed;
    const payload:Record<string,unknown>={...rest};
    if(parsed.id==='') delete payload.id;
    if(salary!==undefined) {
      await authorization.requirePermission(organizationId,'payment.record');
      payload.salary=salary===''?null:salary;
    }
    const id=await employeeRepository(client).save(organizationId,payload);
    revalidatePath('/dashboard/employees');
    return {ok:true,id,message:'Employee details saved.'};
  } catch(error) {
    return {ok:false,message:safeFailure(error).message};
  }
}
export async function saveEmployeeProof(form:FormData):Promise<EmployeeActionResult> {
  let uploadedKey:string|null=null;
  try {
    const {client,organizationId}=await context('team.manage');
    const employeeId=idSchema.parse(form.get('employeeId'));
    const kind=z.enum(['aadhaar','pan','passport','driving_licence','other'])
      .parse(form.get('kind'));
    const file=form.get('file');
    if(!(file instanceof File)||!PROOF_MIME.has(file.type)||
       file.size<1||file.size>MAX_PROOF_BYTES)throw new DomainError('VALIDATION_FAILED');
    const people=await employeeRepository(client).list(organizationId);
    if(!people.some(p=>p.id===employeeId)) throw new DomainError('FORBIDDEN');
    const fileName=file.name.trim().slice(0,200)||'Identity proof';
    uploadedKey=employeeProofKey(organizationId,employeeId,crypto.randomUUID());
    await uploadEmployeeProof(uploadedKey,file);
    const id=await employeeRepository(client).registerProof(
      organizationId,employeeId,kind,fileName,file.type,uploadedKey,
    );
    uploadedKey=null;
    revalidatePath('/dashboard/employees');
    return {ok:true,id,message:'Identity proof uploaded privately. Review and verify it.'};
  }catch(error) {
    if(uploadedKey)await removeEmployeeProof(uploadedKey).catch(()=>undefined);
    return {ok:false,message:safeFailure(error).message};
  }
}
export async function reviewEmployeeProof(id:string,status:string):Promise<EmployeeActionResult> {
  try {
    const {client,organizationId}=await context('team.manage');
    await employeeRepository(client).verifyProof(
      organizationId,idSchema.parse(id),z.enum(['verified','pending','rejected']).parse(status),
    );
    revalidatePath('/dashboard/employees');
    return {ok:true,message:'Document verification updated.'};
  }catch(error){return {ok:false,message:safeFailure(error).message};}
}
export async function recordEmployeeAttendance(input:unknown):Promise<EmployeeActionResult> {
  try {
    const row=z.object({
      employeeId:z.uuid(),date:z.iso.date(),
      status:z.enum(['present','absent','leave','half_day']),
      notes:z.string().trim().max(300),
    }).strict().parse(input);
    const {client,organizationId}=await context('team.manage');
    await employeeRepository(client).recordAttendance(
      organizationId,row.employeeId,row.date,row.status,row.notes,
    );
    revalidatePath('/dashboard/employees');
    return {ok:true,message:'Attendance recorded.'};
  }catch(error){return {ok:false,message:safeFailure(error).message};}
}
export async function recordEmployeeSalary(input:unknown):Promise<EmployeeActionResult> {
  try {
    const request=z.object({
      employeeId:z.uuid(),
      month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    }).strict().parse(input);
    const {client,organizationId,authorization}=await context('team.manage');
    await authorization.requirePermission(organizationId,'payment.record');
    const person=(await employeeRepository(client).list(organizationId))
      .find(p=>p.id===request.employeeId);
    if(!person||person.status!=='active'||!person.salary||person.salary<=0
       ||person.salaryType!=='monthly')throw new DomainError('VALIDATION_FAILED');
    await salaryLedger(client).create(organizationId,{
      employeeName:person.name,salaryMonth:request.month,
      gross:Number(person.salary).toFixed(2),deductions:'0',
      notes:'Payroll entry from '+person.code+'. Confirm payment in Finance.',
    });
    revalidatePath('/dashboard/finance');
    revalidatePath('/dashboard/employees');
    return {ok:true,message:'Salary entry recorded as pending. Open Finance to mark paid after transfer.'};
  }catch(error){return {ok:false,message:safeFailure(error).message};}
}
