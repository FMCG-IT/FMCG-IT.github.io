import {useState} from 'react';
import {useOffices} from './offices';
import {addCoverageArea} from './backend';
import {showSuccess} from './success-notice';

export default function CoverageAreas({team,onClose}:{team:{id:string;name:string;offices?:string[]}[];onClose:()=>void}){
 const areas=useOffices();
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 return <div className="overlay"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="coverage-title">
  <div className="section-head"><h2 id="coverage-title">ICT Coverage Areas</h2><button type="button" className="text-button" disabled={busy} onClick={onClose}>Close</button></div>
  <form onSubmit={async e=>{
   e.preventDefault();if(busy)return;
   const form=e.currentTarget;
   const area=String(new FormData(form).get('name')??'');
   setBusy(true);setError('');
   try{await addCoverageArea(area);form.reset();window.dispatchEvent(new Event('desk-areas-changed'));showSuccess('ICT coverage area added successfully');}
   catch(e){setError(e instanceof Error?e.message:'Could not add coverage area.');}
   finally{setBusy(false);}
  }}>
   <label>Area name<input name="name" required maxLength={100}/></label>
   <button className="primary" disabled={busy}>Add area</button>
  </form>
  {error&&<p className="error" role="alert">{error}</p>}
  <div className="table-scroll"><table><thead><tr><th scope="col">Area</th><th scope="col">Assigned to</th></tr></thead><tbody>
   {areas.map(name=><tr key={name}><td>{name}</td><td>{team.filter(o=>o.offices?.includes(name)).map(o=>o.name).join(', ')||'Unassigned'}</td></tr>)}
  </tbody></table></div>
 </section></div>;
}
