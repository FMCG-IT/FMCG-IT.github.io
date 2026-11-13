import {showSuccess} from './success-notice';
import {useEffect,useState} from 'react';
import {readRegularWork,writeRegularWork} from './backend';
type Task={id:string;title:string;officer:string;name:string;completed:boolean;approved:boolean;ends?:string|null};
type History=Task&{day:string;request:string|null;reason:string|null};
export type ScheduledWork=History&{repeat_months:number;deadline:string;completed_at:string|null};
export const repeatLabel=(months:number)=>months===12?'Yearly':months===1?'Every month':`Every ${months} months`;
const scheduleDate=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dhaka',dateStyle:'medium',timeStyle:'short'});
type Request={id:string;task:string;kind:string;title:string;name:string;body:string;day:string|null;status:string};
export type WorkData={today:string;tasks:Task[];history:History[];scheduled?:ScheduledWork[];scheduledHistory?:ScheduledWork[];requests:Request[]};
type Member={id:string;name:string;manager:number;archived:boolean};
type Action={action:string;task:string;day?:string;title:string};
const showStatus=(t:Task,missed=false)=><b className={'work-status '+(t.completed?'work-done':missed?'work-missed':'work-pending')}>{t.completed?'Completed':missed?'Not completed':'Pending'}</b>;
export default function RegularWork({me,team,onChange}:{me:Member;team:Member[];onChange:()=>void}){
 const [data,setData]=useState<WorkData>(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[range,setRange]=useState({from:'',to:''}),[applied,setApplied]=useState({from:'',to:''}),[action,setAction]=useState<Action>(),[scope,setScope]=useState(()=>location.hash==='#/regular-work/report'?'all':'mine'),[showAll,setShowAll]=useState(false),[repeat,setRepeat]=useState(0);
 const manager=me.manager===1;
 async function refresh(){setData(await readRegularWork(applied.from||null,applied.to||null))}
 useEffect(()=>{let live=true;const load=()=>{void readRegularWork(applied.from||null,applied.to||null).then(d=>{if(live)setData(d)}).catch((e:Error)=>{if(live)setError(e.message)});};load();const timer=setInterval(load,60000);return()=>{live=false;clearInterval(timer)}},[applied]);
 async function save(payload:Record<string,unknown>,form?:HTMLFormElement){
  if(busy)return;
  setBusy(true);setError('');
  try{await writeRegularWork(payload);showSuccess(({add:'Task added successfully',complete:'Task completed successfully',approve:'Request approved successfully',reject:'Request rejected successfully',reason:'Reason submitted successfully',edit:manager?'Task updated successfully':'Edit request submitted successfully',delete:manager?'Task removed successfully':'Delete request submitted successfully',transfer:'Task transferred successfully'} as Record<string,string>)[String(payload.action)]??'Saved successfully');setAction(undefined);if(form){form.reset();setRepeat(0);}await refresh();onChange()}
  catch(e){setError(e instanceof Error?e.message:'Could not save regular work.')}
  finally{setBusy(false)}
 }
 const visible=(t:Task)=>!manager||scope==='all'||t.officer===me.id;
 const tasks=data?.tasks.filter(visible)??[];
 const scheduled=data?.scheduled?.filter(visible)??[];
 const today=data?.today??'';
 const history=data?.history.filter(t=>(manager||t.officer===me.id)&&(showAll||!t.completed||t.approved))??[];
 useEffect(()=>{
  const section=location.hash==='#/regular-work/approvals'?'work-approvals':location.hash==='#/regular-work/report'?'work-report':null;
  if(section&&data?.today)document.getElementById(section)?.scrollIntoView({block:'start'});
 },[data?.today]);
 return <div className="regular-work">
 {error&&<p className="error" role="alert">{error}</p>}
 <section className="panel"><h2>Add regular work</h2><form className="work-form" onSubmit={e=>{e.preventDefault();const form=e.currentTarget;void save({action:'add',...Object.fromEntries(new FormData(form))},form)}}>
 <label>Task<input name="body" required maxLength={200} placeholder="e.g. Check backup status"/></label>
 <label>Repeat<select name="repeat_months" value={repeat} onChange={e=>setRepeat(Number(e.target.value))}><option value={0}>Daily</option>{[1,3,6,12].map(months=><option key={months} value={months}>{repeatLabel(months)}</option>)}</select></label>
 {repeat>0&&<label>First start date (BDT)<input type="date" name="first_due" required min={data?.today} defaultValue={data?.today}/></label>}
 {manager&&<label>Assigned to<select name="officer" defaultValue={me.id}>{team.filter(o=>!o.archived).map(o=><option key={o.id} value={o.id}>{o.name}</option>)}<option value="all">All active members</option></select></label>}
 <button className="primary" disabled={busy}>Add task</button></form>{repeat>0&&<small>Each occurrence is open for 14 days, including its start date.</small>}</section>
 {manager&&<section id="work-approvals" className="panel"><h2>Approval requests ({data?.requests.filter(r=>r.status==='Pending').length??0})</h2>{data?.requests.filter(r=>r.status==='Pending').map(r=><article key={r.id} className="work-row"><div><b>{r.title}</b><small>{r.name} · {r.kind==='reason'?'Missed-work reason':r.kind==='edit'?'Edit request':'Delete request'}{r.day?' · '+r.day:''}</small><p>{r.body}</p></div><div className="work-actions"><button className="primary" disabled={busy} onClick={()=>void save({action:'approve',request:r.id})}>Approve</button><button className="secondary" disabled={busy} onClick={()=>void save({action:'reject',request:r.id})}>Reject</button></div></article>)}</section>}
 <section className="panel"><div className="section-head"><h2>Daily work ({tasks.length})</h2><span>{data?.today} · BDT</span></div>
 {manager&&<label>Show<select value={scope} onChange={e=>setScope(e.target.value)}><option value="mine">My work</option><option value="all">All members</option></select></label>}
 {!data?<p>Loading work…</p>:!tasks.length?<p className="muted">No tasks for today.</p>:tasks.map(t=><article className="work-row" key={t.id}><div><label className="checkbox"><input type="checkbox" checked={t.completed} disabled={busy||t.completed||t.officer!==me.id} onChange={()=>void save({action:'complete',task:t.id,day:data.today})}/><b>{t.title}</b></label>{manager&&<small>{t.name}</small>}{t.ends&&<small>Schedule changes tomorrow</small>}</div><div className="work-actions">{showStatus(t)}{!t.ends&&<><button className="text-button" onClick={()=>setAction({action:'edit',task:t.id,title:t.title})}>{manager?'Edit':'Request edit'}</button><button className="text-button" onClick={()=>setAction({action:'delete',task:t.id,title:t.title})}>{manager?'Delete':'Request delete'}</button>{manager&&<button className="text-button" onClick={()=>setAction({action:'transfer',task:t.id,title:t.title})}>Transfer</button>}</>}</div></article>)}
 </section>
 <section className="panel"><h2>Scheduled work</h2>
 {(['Open','Upcoming','Overdue'] as const).map(group=>{
  const rows=scheduled.filter(t=>group==='Upcoming'?t.day>today:group==='Overdue'?t.deadline<today:t.day<=today&&t.deadline>=today);
  return <div key={group}><h3>{group} ({rows.length})</h3>{rows.length===0&&<p className="muted">No {group.toLowerCase()} tasks.</p>}
  {rows.map(t=><article className={'work-row'+(group==='Overdue'?' work-row-overdue':'')} key={t.id+t.day}><div>
   <label className="checkbox">{group==='Open'&&<input type="checkbox" checked={t.completed} disabled={busy||t.completed||t.officer!==me.id} onChange={()=>void save({action:'complete',task:t.id,day:t.day})}/>}<b>{t.title}</b></label>
   <small>{repeatLabel(t.repeat_months)} · {t.day} to {t.deadline} (BDT){manager?' · '+t.name:''}</small>
   {t.completed_at&&<small>Completed {scheduleDate.format(new Date(t.completed_at))} (BDT)</small>}
   {t.request&&<small>Reason: {t.request}</small>}
  </div><div className="work-actions">
   {group==='Open'&&showStatus(t)}
   {group==='Overdue'&&<><b className="work-status work-missed">Overdue</b>{t.officer===me.id&&t.request!=='Pending'&&<button className="secondary" onClick={()=>setAction({action:'reason',task:t.id,day:t.day,title:t.title})}>{t.request==='Rejected'?'Resubmit reason':'Submit reason'}</button>}</>}
   {group==='Upcoming'&&<><button className="text-button" onClick={()=>setAction({action:'edit',task:t.id,title:t.title})}>{manager?'Edit':'Request edit'}</button><button className="text-button" onClick={()=>setAction({action:'delete',task:t.id,title:t.title})}>{manager?'Delete':'Request delete'}</button>{manager&&<button className="text-button" onClick={()=>setAction({action:'transfer',task:t.id,title:t.title})}>Transfer</button>}</>}
  </div></article>)}</div>;
 })}
 </section>
 {action&&<div className="overlay"><section className="dialog" role="dialog" aria-modal="true" aria-label="Regular work request"><h2>{action.action==='reason'?'Reason for missed work':action.action==='transfer'?'Permanently transfer task':action.action==='edit'?'Edit task':'Delete task'}</h2><p>{action.title}{action.day?' · '+action.day:''}</p><form onSubmit={e=>{e.preventDefault();void save({...action,...Object.fromEntries(new FormData(e.currentTarget))})}}>
 {action.action==='edit'&&<label>New title<input name="body" required maxLength={200} defaultValue={action.title}/></label>}
 {action.action==='reason'&&<label>Reason<textarea name="body" required maxLength={2000} rows={4}/></label>}
 {action.action==='transfer'&&<label>New officer<select required name="officer" defaultValue=""><option value="">Select officer</option>{team.filter(o=>!o.archived&&o.id!==[...(data?.tasks??[]),...scheduled].find(t=>t.id===action.task)?.officer).map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
 {action.action!=='reason'&&<p className="muted">Changes take effect tomorrow (BDT){manager?'':' after Manager approval'}. For scheduled work, changes apply to future occurrences.</p>}
 {error&&<p className="error" role="alert">{error}</p>}<div className="work-actions"><button className="primary" disabled={busy}>Confirm</button><button type="button" className="secondary" disabled={busy} onClick={()=>{setAction(undefined);setError('')}}>Cancel</button></div></form></section></div>}
 {!manager&&!!data?.requests.length&&<section className="panel"><h2>My change requests</h2>{data.requests.map(r=><div className="work-row" key={r.id}><span>{r.title} · {r.kind}</span><b>{r.status}</b></div>)}</section>}
 <section id="work-report" className="panel"><h2>{manager?'Daily work report':'Past work & missed tasks'}</h2><form className="work-form" onSubmit={e=>{e.preventDefault();setError('');setApplied({...range})}}><label>From<input type="date" value={range.from} onChange={e=>setRange({...range,from:e.target.value})}/></label><label>To<input type="date" value={range.to} onChange={e=>setRange({...range,to:e.target.value})}/></label><button className="secondary">Apply dates</button></form><label className="checkbox"><input type="checkbox" checked={showAll} onChange={e=>setShowAll(e.target.checked)}/> Include all completed work</label>
 {!history.length&&<p className="muted">No matching records. Default range: past 7 days.</p>}
 {history.map(t=><article key={t.id+t.day} className={'work-row'+(!t.completed?' work-row-overdue':'')}><div><b>{t.title}</b><small>{t.day}{manager?' · '+t.name:''}{t.approved?' · Manager approved':''}</small>{t.reason&&<p>{t.reason}</p>}{t.request&&<small>Reason: {t.request}</small>}</div><div className="work-actions">{showStatus(t,true)}{!t.completed&&t.officer===me.id&&t.request!=='Pending'&&<button className="secondary" onClick={()=>setAction({action:'reason',task:t.id,day:t.day,title:t.title})}>{t.request==='Rejected'?'Resubmit reason':'Submit reason'}</button>}</div></article>)}</section>
 </div>;
}
