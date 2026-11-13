import {useState} from 'react';
import {writeDeleteAction} from './backend';

export default function DeleteItem({kind,id,manager,onDelete}:{kind:'ticket'|'project';id:string|number;manager:boolean;onDelete:()=>void}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 return <div className="delete-item">
  <button type="button" className="text-button danger" disabled={busy} onClick={async()=>{
   if(!confirm(manager?`Permanently delete this ${kind}?`:`Request Manager approval to delete this ${kind}?`))return;
   setBusy(true);setMessage('');
   try{
    await writeDeleteAction({action:'delete',kind,target:String(id)});
    if(manager)onDelete();
    else setMessage('Delete request sent to Manager.');
   }catch(e){setMessage(e instanceof Error?e.message:'Could not process deletion.');}
   finally{setBusy(false);}
  }}>{manager?'Delete':'Request delete'} {kind}</button>
  {message&&<p role="status">{message}</p>}
 </div>;
}
