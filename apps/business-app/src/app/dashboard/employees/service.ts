import 'server-only';
import { DomainError } from '@business-os/shared';
import type { createServerDatabase } from '@business-os/database/server';

type Client = Awaited<ReturnType<typeof createServerDatabase>>;

export type EmployeeDocument = {
  id: string; kind: 'aadhaar' | 'pan' | 'passport' | 'driving_licence' | 'other';
  fileName: string; verification: 'pending' | 'verified' | 'rejected';
  uploadedAt: string;
};
export type EmployeeRecord = {
  id: string; code: string; name: string; role: string;
  department: 'Office Staff' | 'Site Team' | 'Management' | 'Other';
  phone: string; email: string; address: string; city: string;
  workLocation: string; dateOfBirth: string | null; joiningDate: string | null;
  emergencyName: string; emergencyPhone: string; salary: number | null;
  salaryType: 'monthly' | 'daily' | 'hourly'; status: 'active' | 'inactive';
  documents: EmployeeDocument[];
};
export type EmployeeAttendance = {
  employeeId: string; date: string; status: 'present'|'absent'|'leave'|'half_day';
  notes: string;
};
export type ProtectedEmployeeDocument = {
  id: string; employeeId: string; storageKey: string;
  mimeType: string; fileName: string; verification: string;
};
export function employeeRepository(client: Client) {
  const rpc = client.rpc.bind(client) as unknown as
    (name: string, args: Record<string,unknown>) =>
      Promise<{data:unknown,error:{code?:string;message?:string}|null}>;
  async function call<T>(name: string, args: Record<string,unknown>): Promise<T> {
    const { data,error } = await rpc(name,args);
    if (error) {
      throw new DomainError(error.code === '42501' || error.code === 'PGRST301'
        ? 'FORBIDDEN'
        : ['40001','23505'].includes(error.code ?? '') ? 'CONFLICT'
        : ['22023','22P02','23514','23503'].includes(error.code ?? '')
          ? 'VALIDATION_FAILED' : 'INTERNAL_ERROR');
    }
    return data as T;
  }
  return {
    list: (org:string) => call<EmployeeRecord[]>('company_employee_list',{p_org:org}),
    save: (org:string,input:Record<string,unknown>) =>
      call<string>('company_employee_save',{p_org:org,p_input:input}),
    attendance: (org:string,month:string) =>
      call<EmployeeAttendance[]>('company_employee_attendance_list',{
        p_org:org,p_month:month+'-01',
      }),
    recordAttendance: (org:string,employee:string,date:string,status:string,notes:string) =>
      call<void>('company_employee_attendance_save',{
        p_org:org,p_employee:employee,p_date:date,p_status:status,p_notes:notes,
      }),
    registerProof: (org:string,employee:string,kind:string,fileName:string,mime:string,key:string) =>
      call<string>('company_employee_document_register',{
        p_org:org,p_employee:employee,p_kind:kind,p_name:fileName,p_mime:mime,p_key:key,
      }),
    proof: (org:string,id:string) =>
      call<ProtectedEmployeeDocument|null>('company_employee_document_get',{
        p_org:org,p_id:id,
      }),
    verifyProof: (org:string,id:string,status:string) =>
      call<void>('company_employee_document_verify',{
        p_org:org,p_id:id,p_status:status,
      }),
  };
}
