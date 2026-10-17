'use client';

import { useActionState, useMemo, useState, type ReactNode } from 'react';
import { OwnerIcon } from '../../owner-shell';
import {
  changeMembershipRole, changeMembershipStatus, createCustomRole,
  createRoleFromPreset, inviteEmployeeByEmail, resendEmployeeEmail, revokeEmployeeEmail,
} from './actions';
import { rolePresets } from './presets';
import './team-access.css';

type Role={id:string;key:string;name:string;is_owner:boolean};
type Member={id:string;userId:string;name:string;branchId:string|null;status:string;protected:boolean;owner:boolean};
type Branch={id:string;name:string};
type Permission={id:string;key:string;description:string|null};
type Grant={roleId:string;permissionId:string};
type Assignment={membershipId:string;roleId:string;branchId:string|null};
type Invitation={id:string;email:string;status:string;mailStatus:string;expiresAt:string;roleIds:string[]};
type Tab='members'|'invitations'|'roles';
type Action=(state:{message:string},form:FormData)=>Promise<{message:string}>;

function ActionPanel({action,label,children,compact=false}:{
 action:Action;label:string;children:ReactNode;compact?:boolean;
}) {
 const [state,submit,pending]=useActionState(action,{message:''});
 return <form className={'team-action-form '+(compact?'team-action-compact':'')} action={submit}>
  {children}
  <button type="submit" className="team-primary" disabled={pending}>
   {pending?'Saving…':label}
  </button>
  {state.message&&<p role="status" className="team-form-result">{state.message}</p>}
 </form>;
}
const pretty=(status:string)=>status.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
const initial=(name:string)=>name.split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0]?.toUpperCase()).join('')||'?';
const date=(value:string)=>{const day=new Date(value);return Number.isNaN(day.getTime())?'—':day.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});};
function Status({value}: {value:string}) {
 return <span className={'team-state team-state-'+value.toLowerCase().replace(/[^a-z]/g,'')}>{pretty(value)}</span>;
}
function Field({label,children}: {label:string;children:ReactNode}) {
 return <label className="team-field"><span>{label}</span>{children}</label>;
}
export function TeamAccessWorkspace({members,branches,roles,permissions,grants,assignments,invitations,
 canViewTeam,canViewRoles,canChangeStatus,canRemove,canAssign,canInvite,canCreateRoles,organizationId,
 canOpenEmployees}: {
 members:Member[];branches:Branch[];roles:Role[];permissions:Permission[];
 grants:Grant[];assignments:Assignment[];invitations:Invitation[];organizationId:string;
 canViewTeam:boolean;canViewRoles:boolean;canChangeStatus:boolean;canRemove:boolean;
 canAssign:boolean;canInvite:boolean;canCreateRoles:boolean;canOpenEmployees:boolean;
}) {
 const [tab,setTab]=useState<Tab>(canViewTeam?'members':'roles');
 const [selected,setSelected]=useState(members[0]?.id??'');
 const [query,setQuery]=useState('');
 const [status,setStatus]=useState('all');
 const [roleFilter,setRoleFilter]=useState('all');
 const [inviteOpen,setInviteOpen]=useState(false);
 const [roleEditor,setRoleEditor]=useState(false);
 const [editingRole,setEditingRole]=useState<Role|null>(null);
 const [presetOpen,setPresetOpen]=useState(false);
 const [detailTab,setDetailTab]=useState<'access'|'permissions'>('access');
 const [mobileDetail,setMobileDetail]=useState(false);
 const [page,setPage]=useState(1);
 const person=members.find(m=>m.id===selected)??members[0];
 const assigned=(id:string)=>assignments.filter(a=>a.membershipId===id);
 const roleNames=(id:string)=>assigned(id).map(a=>roles.find(r=>r.id===a.roleId)?.name??'Assigned role');
 const active=members.filter(m=>m.status==='active').length;
 const pending=invitations.filter(i=>i.status==='pending').length;
 const filtered=useMemo(()=>members.filter(m=>{
  const hay=[m.name,m.userId,...roleNames(m.id)].join(' ').toLowerCase();
  return hay.includes(query.trim().toLowerCase())&&
   (status==='all'||m.status===status)&&
   (roleFilter==='all'||assigned(m.id).some(a=>a.roleId===roleFilter));
 // member/assignment data is immutable in this render
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }),[members,assignments,roles,query,status,roleFilter]);
 const countPages=Math.max(1,Math.ceil(filtered.length/8));
 const visible=filtered.slice((Math.min(page,countPages)-1)*8,Math.min(page,countPages)*8);
 const choose=(id:string)=>{setSelected(id);setDetailTab('access');setMobileDetail(true);};
 const installed=new Set(roles.map(r=>r.key));
 const shownRoles=roles.filter(r=>!query||[r.name,r.key].some(s=>s.toLowerCase().includes(query.toLowerCase())));
 const exportCsv=()=>{
  const columns=['Name','Member ID','Status','Roles','Scope'];
  const rows=filtered.map(m=>[m.name,m.userId,m.status,roleNames(m.id).join('; '),
   m.branchId?branches.find(b=>b.id===m.branchId)?.name??'Branch':'Company-wide']);
  const escape=(s:string)=>{
   const safe=/^[\s\u0000-\u001f]*[=+\-@]/.test(s)?"'"+s:s;
   return '"'+safe.replaceAll('"','""')+'"';
  };
  const file=new Blob(['\uFEFF'+[columns,...rows].map(r=>r.map(escape).join(',')).join('\r\n')],
   {type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(file);
  const link=document.createElement('a');link.href=url;link.download='company-team-access.csv';link.click();
  URL.revokeObjectURL(url);
 };
 return <main id="main-content" className="team-access">
  <div className="team-header">
   <div className="team-heading">
    <span className="team-heading-icon"><OwnerIcon name="team" size={25}/></span>
    <div><h1>Company Team</h1><p>Manage team access, invitations, roles and permissions.</p></div>
   </div>
   <div className="team-heading-actions">
    {canOpenEmployees&&<a className="team-outline" href="/dashboard/employees">Employee records <span aria-hidden="true">↗</span></a>}
    {canInvite&&<button className="team-primary" onClick={()=>setInviteOpen(true)} type="button">
     <OwnerIcon name="plus" size={16}/> Invite Member
    </button>}
   </div>
  </div>
  <section className="team-stats" aria-label="Team summary">
   {([
    {name:'Team Members',value:members.length,sub:'Company account memberships',icon:'team' as const,theme:'orange'},
    {name:'Active Access',value:active,sub:'Can access their permitted modules',icon:'check' as const,theme:'green'},
    {name:'Pending Invites',value:pending,sub:'Awaiting verified email acceptance',icon:'calendar' as const,theme:'amber'},
    {name:'Company Roles',value:roles.length,sub:'Configured access roles',icon:'settings' as const,theme:'purple'},
   ]).map(s=><article className="team-stat" key={s.name}>
    <span className={'team-stat-icon '+s.theme}><OwnerIcon name={s.icon} size={22}/></span>
    <div><span>{s.name}</span><strong>{s.value}</strong><small>{s.sub}</small></div>
   </article>)}
  </section>
  <div className="team-body">
   <section className="team-directory" aria-label="Team workspace">
    <div className="team-tabs" role="tablist" aria-label="Team sections">
     {canViewTeam&&<button role="tab" aria-selected={tab==='members'} className={tab==='members'?'active':''}
      onClick={()=>{setTab('members');setQuery('');setPage(1);}}>Members <span>{members.length}</span></button>}
     {canInvite&&<button role="tab" aria-selected={tab==='invitations'} className={tab==='invitations'?'active':''}
      onClick={()=>{setTab('invitations');setQuery('');}}>Invitations <span>{pending}</span></button>}
     {canViewRoles&&<button role="tab" aria-selected={tab==='roles'} className={tab==='roles'?'active':''}
      onClick={()=>{setTab('roles');setQuery('');}}>Roles &amp; Permissions <span>{roles.length}</span></button>}
    </div>
    <div className="team-toolbar">
     <label className="team-search"><OwnerIcon name="search" size={17}/>
      <input value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}}
       placeholder={tab==='members'?'Search member name, ID or role...':
        tab==='invitations'?'Search invitations...':'Search roles...'} aria-label="Search team"/>
     </label>
     {tab==='members'&&<>
      <select aria-label="Filter by role" value={roleFilter}
       onChange={e=>{setRoleFilter(e.target.value);setPage(1);}}>
       <option value="all">All Roles</option>{roles.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      <select aria-label="Filter by access status" value={status}
       onChange={e=>{setStatus(e.target.value);setPage(1);}}>
       <option value="all">All Status</option><option value="active">Active</option>
       <option value="suspended">Suspended</option><option value="revoked">Revoked</option>
      </select>
      <button className="team-outline team-export" onClick={exportCsv} type="button">
       <OwnerIcon name="reports" size={16}/> Export</button>
     </>}
     {tab==='invitations'&&canInvite&&<button className="team-outline" onClick={()=>setInviteOpen(true)}>+ Invite</button>}
     {tab==='roles'&&canCreateRoles&&<button className="team-primary team-role-new"
      onClick={()=>{setEditingRole(null);setRoleEditor(true);}}><OwnerIcon name="plus" size={14}/> Create Role</button>}
    </div>
    {tab==='members'&&canViewTeam&&<div className="team-panel">
     <div className="team-table-wrap"><table className="team-table">
      <thead><tr><th>Member</th><th>Access Roles</th><th>Scope</th><th>Status</th><th>Manage</th></tr></thead>
      <tbody>{visible.map(m=><tr key={m.id} className={m.id===person?.id?'selected':''}>
       <td><button className="team-table-person" onClick={()=>choose(m.id)}>
        <span className="team-avatar">{initial(m.name)}</span>
        <span><b>{m.name}</b><small>{m.userId.slice(0,8)}…</small></span>
       </button></td>
       <td><span className="team-role-pills">{roleNames(m.id).length?
        roleNames(m.id).map((r,i)=><span className="team-role-pill" key={r+i}>{r}</span>):
        <span className="team-muted">No roles</span>}</span></td>
       <td>{m.branchId?branches.find(b=>b.id===m.branchId)?.name??'Branch-scoped':'Company-wide'}</td>
       <td><Status value={m.status}/></td>
       <td><button className="team-more" type="button" onClick={()=>choose(m.id)}
        aria-label={'Manage '+m.name}>···</button></td>
      </tr>)}</tbody></table></div>
     <div className="team-mobile-members">{visible.map(m=><button key={m.id} type="button"
      className={'team-mobile-member '+(m.id===person?.id?'selected':'')} onClick={()=>choose(m.id)}>
      <span className="team-avatar">{initial(m.name)}</span>
      <span className="team-mobile-member-data"><b>{m.name}</b>
       <small>{roleNames(m.id).join(' · ')||'No role assigned'}</small>
       <small>{m.branchId?branches.find(b=>b.id===m.branchId)?.name??'Branch':'Company-wide'}</small></span>
      <Status value={m.status}/><span className="team-chevron">›</span>
     </button>)}</div>
     {!visible.length&&<div className="team-empty">
      <OwnerIcon name="team" size={28}/><h3>No team members found</h3>
      <p>{members.length?'Try another filter.':'Invite a colleague to join your company workspace.'}</p>
     </div>}
     <footer className="team-pagination"><span>Showing {filtered.length?Math.min(page,countPages)*8-7:0}–{Math.min(Math.min(page,countPages)*8,filtered.length)} of {filtered.length}</span>
      <div><button onClick={()=>setPage(x=>Math.max(1,x-1))} disabled={page<=1}>‹</button>
       <strong>{Math.min(page,countPages)}</strong><button onClick={()=>setPage(x=>Math.min(countPages,x+1))} disabled={page>=countPages}>›</button>
      </div></footer>
    </div>}
    {tab==='invitations'&&canInvite&&<div className="team-invites">
     {invitations.filter(i=>i.email.toLowerCase().includes(query.toLowerCase())).map(i=><article className="team-invite" key={i.id}>
      <span className="team-invite-icon"><OwnerIcon name="calendar" size={18}/></span>
      <div><b>{i.email}</b><p>{i.roleIds.length} assigned {i.roleIds.length===1?'role':'roles'} · Expires {date(i.expiresAt)}</p>
       <small>Email {pretty(i.mailStatus)}</small></div>
      <Status value={i.status}/>
      {['pending','expired'].includes(i.status)&&<div className="team-invite-actions">
       <ActionPanel action={resendEmployeeEmail} label="Resend" compact>
        <input type="hidden" name="organizationId" value={organizationId}/>
        <input type="hidden" name="inviteId" value={i.id}/>
       </ActionPanel>
       <ActionPanel action={revokeEmployeeEmail} label="Revoke" compact>
        <input type="hidden" name="organizationId" value={organizationId}/>
        <input type="hidden" name="inviteId" value={i.id}/>
       </ActionPanel>
      </div>}
     </article>)}
     {!invitations.length&&<div className="team-empty"><OwnerIcon name="calendar" size={28}/>
      <h3>No invitations yet</h3><p>Invitations will be tracked here until accepted or revoked.</p>
     </div>}
    </div>}
    {tab==='roles'&&canViewRoles&&<div className="team-roles">
     <div className="team-roles-top"><div><h2>Company roles</h2><p>Grant permissions only to authorized members.</p></div>
      {canCreateRoles&&<button className="team-outline" onClick={()=>setPresetOpen(x=>!x)}>
       {presetOpen?'Hide presets':'Role presets'}</button>}</div>
     {presetOpen&&canCreateRoles&&<div className="team-presets">
      <h3>Install a suggested role</h3>
      {rolePresets.some(r=>!installed.has(r.key))&&<ActionPanel action={createRoleFromPreset} label="Install role preset">
       <input type="hidden" name="organizationId" value={organizationId}/>
       <Field label="Preset role"><select required name="presetKey">
        {rolePresets.filter(r=>!installed.has(r.key)).map(r=><option key={r.key} value={r.key}>
         {r.name} · {r.industries.join(' / ')}</option>)}
       </select></Field>
      </ActionPanel>}
      {!rolePresets.some(r=>!installed.has(r.key))&&<p>All suggested roles are already installed.</p>}
     </div>}
     <div className="team-role-grid">{shownRoles.map(r=>{
      const granted=grants.filter(g=>g.roleId===r.id).map(g=>permissions.find(p=>p.id===g.permissionId)?.key).filter((v):v is string=>Boolean(v));
      const users=members.filter(m=>assigned(m.id).some(a=>a.roleId===r.id)).length;
      return <article className="team-role-card" key={r.id}>
       <div><span className="team-role-icon"><OwnerIcon name="team" size={18}/></span>
        <div><h3>{r.name}</h3><p>{r.is_owner?'Protected owner role':r.key}</p></div>
        <span className="team-role-count">{users} members</span></div>
       <p className="team-role-permission-label">Granted permissions</p>
       <div className="team-permission-pills">{granted.length?granted.slice(0,7).map(key=>
        <span key={key}>{key}</span>):<span>No extra permissions</span>}
        {granted.length>7&&<span>+{granted.length-7} more</span>}</div>
       {canCreateRoles&&!r.is_owner&&<button className="team-role-edit" type="button"
        onClick={()=>{setEditingRole(r);setRoleEditor(true);}}>Edit permissions</button>}
      </article>;
     })}</div>
     {!shownRoles.length&&<div className="team-empty">No matching roles.</div>}
    </div>}
   </section>
   {tab==='members'&&canViewTeam&&<aside className={'team-detail '+(mobileDetail?'team-detail-mobile-open':'')} aria-label="Selected member access">
    {person?<><div className="team-detail-header">
     <button className="team-detail-back" onClick={()=>setMobileDetail(false)} type="button">‹ Back to members</button>
     <div className="team-detail-person"><span className="team-avatar team-avatar-large">{initial(person.name)}</span>
      <div><h2>{person.name}</h2><p>Workspace member</p><Status value={person.status}/></div></div>
    </div>
    <nav className="team-detail-tabs">
     <button className={detailTab==='access'?'active':''} onClick={()=>setDetailTab('access')}>Access</button>
     <button className={detailTab==='permissions'?'active':''} onClick={()=>setDetailTab('permissions')}>Permissions</button>
    </nav>
    {detailTab==='access'&&<div className="team-detail-body">
     <section className="team-detail-section"><h3>Member information</h3>
      <dl><div><dt>Account ID</dt><dd title={person.userId}>{person.userId.slice(0,13)}…</dd></div>
       <div><dt>Membership</dt><dd><Status value={person.status}/></dd></div>
       <div><dt>Default scope</dt><dd>{person.branchId?branches.find(b=>b.id===person.branchId)?.name??'Branch':'Company-wide'}</dd></div>
      </dl></section>
     <section className="team-detail-section"><h3>Assigned roles</h3>
      {assigned(person.id).length?assigned(person.id).map(a=><div className="team-assigned" key={a.roleId+'-'+(a.branchId??'')}>
       <span className="team-role-pill">{roles.find(r=>r.id===a.roleId)?.name??'Assigned role'}</span>
       <small>{a.branchId?branches.find(b=>b.id===a.branchId)?.name??'Branch-scoped':'Organization-wide'}</small>
      </div>):<p className="team-muted">No roles currently assigned.</p>}
     </section>
     {person.protected&&<p className="team-protected"><OwnerIcon name="check" size={17}/>
      {person.owner?'Owner-protected account. Role and access changes are restricted.':
       'Your own account must be managed by another authorized administrator.'}</p>}
     {!person.protected&&canChangeStatus&&<section className="team-detail-section">
      <h3>Update member access</h3><ActionPanel action={changeMembershipStatus} label="Save access status">
       <input type="hidden" name="organizationId" value={organizationId}/>
       <input type="hidden" name="membershipId" value={person.id}/>
       <Field label="Account status"><select name="status" defaultValue={person.status} key={person.id+person.status}>
        <option value="active">Active</option><option value="suspended">Suspended</option>
        <option value="revoked" disabled={!canRemove}>Revoked</option>
       </select></Field>
      </ActionPanel>
     </section>}
     {!person.protected&&canAssign&&roles.length>0&&<section className="team-detail-section">
      <h3>Assign or remove role</h3>
      <ActionPanel action={changeMembershipRole} label="Apply role change">
       <input type="hidden" name="organizationId" value={organizationId}/>
       <input type="hidden" name="membershipId" value={person.id}/>
       <Field label="Role"><select name="roleId" required>
        {roles.filter(r=>!r.is_owner).map(r=><option value={r.id} key={r.id}>{r.name}</option>)}
       </select></Field>
       <Field label="Access scope"><select name="branchId" defaultValue="">
        <option value="">Company-wide</option>{branches.map(b=><option value={b.id} key={b.id}>{b.name}</option>)}
       </select></Field>
       <Field label="Change"><select name="remove"><option value="false">Grant role</option>
        <option value="true">Remove role at selected scope</option></select></Field>
      </ActionPanel>
     </section>}
    </div>}
    {detailTab==='permissions'&&<div className="team-detail-body"><section className="team-detail-section">
     <h3>Effective role grants</h3>
     {Array.from(new Set(assigned(person.id).flatMap(a=>grants.filter(g=>g.roleId===a.roleId)
      .map(g=>permissions.find(p=>p.id===g.permissionId)?.key).filter((s):s is string=>Boolean(s)))))
      .map(key=><div className="team-permission-row" key={key}><OwnerIcon name="check" size={15}/>{key}</div>)}
     {!assigned(person.id).length&&<p className="team-muted">Assign a role to view its grants.</p>}
     <p className="team-help">Role access is further restricted by subscription, branch and project assignments.</p>
    </section></div>}
    <footer className="team-detail-footer">
     {canOpenEmployees&&<a href="/dashboard/employees" className="team-outline">
      Employee HR profiles <span aria-hidden="true">↗</span></a>}
    </footer>
    </>:<div className="team-empty">Choose a member to review access.</div>}
   </aside>}
  </div>
  {inviteOpen&&<div className="team-modal-layer" onMouseDown={e=>{if(e.currentTarget===e.target)setInviteOpen(false);}}>
   <div className="team-modal" role="dialog" aria-modal="true" aria-labelledby="team-invite-title">
    <header><div><small>Company team</small><h2 id="team-invite-title">Invite team member</h2>
     <p>Send an invitation to a verified email address.</p></div>
     <button aria-label="Close invitation" type="button" onClick={()=>setInviteOpen(false)}>×</button>
    </header>
    <ActionPanel action={inviteEmployeeByEmail} label="Send invitation">
     <input type="hidden" name="organizationId" value={organizationId}/>
     <Field label="Work email"><input type="email" name="email" required maxLength={254}
      autoComplete="email" placeholder="teammate@company.com"/></Field>
     <Field label="Branch / Access scope"><select name="branchId" defaultValue="">
      <option value="">Organization-wide</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
     </select></Field>
     <fieldset className="team-checkbox-group"><legend>Choose roles</legend>
      {roles.filter(r=>!r.is_owner).map(r=><label key={r.id}><input type="checkbox" name="roleIds" value={r.id}/>{r.name}</label>)}
     </fieldset>
     <p className="team-help">The invitation grants no access until the recipient signs in with the matching verified email.</p>
    </ActionPanel>
   </div>
  </div>}
  {roleEditor&&<div className="team-modal-layer" onMouseDown={e=>{if(e.currentTarget===e.target)setRoleEditor(false);}}>
   <div className="team-modal team-modal-large" role="dialog" aria-modal="true" aria-labelledby="team-role-title">
    <header><div><small>Permissions</small><h2 id="team-role-title">{editingRole?'Edit role permissions':'Create custom role'}</h2>
     <p>Choose only the capabilities this role needs.</p></div>
     <button type="button" aria-label="Close role creator" onClick={()=>{setRoleEditor(false);setEditingRole(null);}}>×</button></header>
    <ActionPanel key={editingRole?.id??'new'} action={createCustomRole} label={editingRole?'Save role changes':'Save custom role'}>
     <input type="hidden" name="organizationId" value={organizationId}/>
     {editingRole&&<input type="hidden" name="roleId" value={editingRole.id}/>}
     <div className="team-field-columns">
      <Field label="Role key"><input required name="key" minLength={2} maxLength={64}
       pattern="[a-z][a-z0-9_]*" defaultValue={editingRole?.key??''} placeholder="project_coordinator"/></Field>
      <Field label="Display name"><input required name="name" maxLength={100} defaultValue={editingRole?.name??''} placeholder="Project Coordinator"/></Field>
     </div>
     <fieldset className="team-checkbox-group team-permission-checks"><legend>Allowed permissions</legend>
      {permissions.map(p=><label key={p.id}><input name="permissions" type="checkbox" value={p.key}
        defaultChecked={Boolean(editingRole&&grants.some(g=>g.roleId===editingRole.id&&g.permissionId===p.id))}/>
       <span><strong>{p.key}</strong><small>{p.description}</small></span></label>)}
     </fieldset>
    </ActionPanel>
   </div>
  </div>}
 </main>;
}
