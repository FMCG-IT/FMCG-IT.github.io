import {useState} from 'react';
import {useOffices} from './offices';
import {addCoverageArea,manageCoverageArea} from './backend';
import {showSuccess} from './success-notice';

export default function CoverageAreas({team,onClose,onChange}:{team:{id:string;name:string;offices?:string[]}[];onClose:()=>void;onChange:()=>Promise<void>}){
 const areas=useOffices();
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [editing,setEditing]=useState<string>();
 async function remove(name:string){
  if(busy||!confirm('Delete '+name+'?'))return;
  setBusy(true);setError('');
  try{await manageCoverageArea(name,null);if(editing===name)setEditing(undefined);window.dispatchEvent(new Event('desk-areas-changed'));showSuccess('ICT coverage area deleted successfully');}
  catch(e){setError(e instanceof Error?e.message:'Could not delete coverage area.');}
  finally{setBusy(false);}
 }
 return <div className="overlay"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="coverage-title">
  <div className="section-head"><h2 id="coverage-title">ICT Coverage Areas</h2><button type="button" className="text-button" disabled={busy} onClick={onClose}>Close</button></div>
  <form key={editing??'new'} onSubmit={async e=>{
   e.preventDefault();if(busy)return;
   const form=e.currentTarget;
   const area=String(new FormData(form).get('name')??'');
   setBusy(true);setError('');
   try{
    if(editing)await manageCoverageArea(editing,area);else await addCoverageArea(area);
    form.reset();setEditing(undefined);window.dispatchEvent(new Event('desk-areas-changed'));
    showSuccess(editing?'ICT coverage area updated successfully':'ICT coverage area added successfully');
    if(editing)await onChange();
   }
   catch(e){setError(e instanceof Error?e.message:'Could not add coverage area.');}
   finally{setBusy(false);}
  }}>
   <label>Area name<input name="name" required maxLength={100} defaultValue={editing}/></label>
   <button className="primary" disabled={busy}>{editing?'Save area':'Add area'}</button>{editing&&<button type="button" className="secondary" disabled={busy} onClick={()=>setEditing(undefined)}>Cancel</button>}
  </form>
  {error&&<p className="error" role="alert">{error}</p>}
  <div className="table-scroll"><table><thead><tr><th scope="col">Area</th><th scope="col">Assigned to</th><th scope="col">Actions</th></tr></thead><tbody>
   {areas.map(name=><tr key={name}><td>{name}</td><td>{team.filter(o=>o.offices?.includes(name)).map(o=>o.name).join(', ')||'Unassigned'}</td><td><div className="work-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>{setError('');setEditing(name);}}>Edit</button><button type="button" className="secondary danger" disabled={busy} onClick={()=>void remove(name)}>Delete</button></div></td></tr>)}
  </tbody></table></div>
 </section></div>;
}
