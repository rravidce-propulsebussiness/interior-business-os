'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { removeProjectKeepQuotations } from './project-removal-actions';

export function ProjectRemovalButton({
  id,name,version,
}: {id:string;name:string;version:number}) {
  const [pending,setPending]=useState(false);
  const [confirmation,setConfirmation]=useState('');
  const [message,setMessage]=useState('');
  const dialog=useRef<HTMLDialogElement>(null);
  const router=useRouter();

  return <span className="proj-permanent-delete-wrap">
    <button type="button" className="proj-permanent-delete"
      disabled={pending} title={'Remove '+name+' from Projects'}
      onClick={(event)=>{
        event.stopPropagation();
        setConfirmation('');setMessage('');
        dialog.current?.showModal();
      }}>
      Delete Project
    </button>
    <dialog ref={dialog} className="proj-delete-dialog"
      aria-labelledby={'project-delete-heading-'+id}
      onCancel={event=>{if(pending)event.preventDefault();}}>
      <h2 id={'project-delete-heading-'+id}>Delete this project?</h2>
      <p><strong>{name}</strong> will be removed from Projects. It will not be moved to the Inactive stage.</p>
      <p>Any linked quotations will remain unchanged and retain a hidden quotation-history reference.
        Projects with no quotation history will be permanently deleted.</p>
      <p>Invoices, contracts or site work will still block removal to protect those records.</p>
      <label htmlFor={'project-delete-confirm-'+id}>
        Type <strong>DELETE</strong> to confirm
      </label>
      <input id={'project-delete-confirm-'+id} autoComplete="off"
        value={confirmation} disabled={pending} maxLength={6}
        onChange={e=>setConfirmation(e.target.value)}
        placeholder="DELETE" />
      {message&&<p role="alert" className="proj-delete-error">{message}</p>}
      <div className="proj-delete-dialog-actions">
        <button type="button" disabled={pending}
          onClick={()=>dialog.current?.close()}>Cancel</button>
        <button type="button" disabled={pending||confirmation!=='DELETE'}
          className="proj-delete-confirm" onClick={async()=>{
            setPending(true);setMessage('');
            try{
              const result=await removeProjectKeepQuotations(id,version,confirmation);
              if(!result.ok){setMessage(result.message);return;}
              dialog.current?.close();
              router.refresh();
            }catch{setMessage('Unable to delete project. Please retry.');}
            finally{setPending(false);}
          }}>
          {pending?'Removing…':'Delete Project'}
        </button>
      </div>
    </dialog>
  </span>;
}
