import {useEffect,useState} from 'react';
import {readStorage} from './backend';

type Usage={used_bytes:number;reference_limit_bytes:number;remaining_estimate_bytes:number;app_bytes:number;ticket_count:number;update_count:number;checked_at:string};
const mb=(bytes:number)=>(bytes/1000000).toLocaleString('en-GB',{maximumFractionDigits:2})+' MB';
export default function StoragePanel(){
 const [usage,setUsage]=useState<Usage>(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function refresh(){setBusy(true);setError('');try{setUsage(await readStorage())}catch(e){setError(e instanceof Error?e.message:'Could not read database usage.')}finally{setBusy(false)}}
 useEffect(()=>{void refresh()},[]);
 const percent=usage?usage.used_bytes/usage.reference_limit_bytes*100:0;
 return <section className="panel storage-panel"><div className="section-head"><h2>Database storage</h2><button className="secondary" disabled={busy} onClick={()=>void refresh()}>{busy?'Checking…':'Refresh usage'}</button></div>
 {error&&<p className="error" role="alert">{error}</p>}
 {usage&&<><div className="storage-metrics"><div><span>Used</span><strong>{mb(usage.used_bytes)}</strong></div><div><span>Remaining — estimate</span><strong>{mb(usage.remaining_estimate_bytes)}</strong></div><div><span>Reference quota</span><strong>{mb(usage.reference_limit_bytes)}</strong></div></div>
 <progress aria-label="Database usage against reference quota" value={Math.min(percent,100)} max={100}/><p>{percent.toFixed(1)}% of the reference quota</p>
 {percent>=80&&<p className="storage-warning">Database usage is approaching or above the reference quota. Review Supabase Usage before adding large amounts of data.</p>}
 <div className="facts"><span>IT Desk tables & indexes<b>{mb(usage.app_bytes)}</b></span><span>Tickets<b>{usage.ticket_count.toLocaleString()}</b></span><span>Activity entries<b>{usage.update_count.toLocaleString()}</b></span><span>Checked — Bangladesh time<b>{new Date(usage.checked_at).toLocaleString('en-GB',{timeZone:'Asia/Dhaka'})}</b></span></div>
 <p className="muted">Measured PostgreSQL database size includes accounts, data and indexes. Remaining space is an estimate against the configured reference quota, not an official Supabase billing or disk-space reading. File storage and monthly data transfer are separate. Check Supabase Usage for plan limits.</p></>}
 </section>;
}
