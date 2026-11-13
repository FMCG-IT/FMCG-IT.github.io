import {useEffect,useState,useRef} from 'react';
import {readNotifications,writeDesk,readDeleteRequests,writeDeleteAction,readDeleteResults,type DeleteResult,type DeleteRequest,readProjectApprovals,type ProjectApproval} from './backend';
export const overdueDays=(priority:string)=>({Low:30,Medium:10,High:3,Critical:1,Urgent:1}[priority]??10);
export const priorityLabel=(priority:string)=>priority==='Critical'?'Urgent':priority;
export const automaticDueAt=(t:{created:string;priority:string})=>Date.parse(t.created)+overdueDays(t.priority)*24*60*60*1000;
export const overdue=(t:{status:string;created:string;priority:string},now=Date.now())=>t.status!=='Closed'&&Number.isFinite(automaticDueAt(t))&&now>=automaticDueAt(t);
export function Notifications({openTicket,workApprovals=0}:{openTicket:(id:string)=>void;workApprovals?:number}){
 const container=useRef<HTMLDivElement>(null);

 const [data,setData]=useState<Awaited<ReturnType<typeof readNotifications>>>({unread:0,items:[]}),[error,setError]=useState(''),[open,setOpen]=useState(false);
 const [deletions,setDeletions]=useState<DeleteRequest[]>([]);
 const [results,setResults]=useState<DeleteResult[]>([]);
 const [projectRequests,setProjectRequests]=useState<ProjectApproval[]>([]);
 const [reviewing,setReviewing]=useState(false);
 useEffect(()=>{
  let active=true;
  const refresh=()=>{
   void readDeleteRequests().then(rows=>{if(active)setDeletions(rows)}).catch(()=>{});
   void readProjectApprovals().then(rows=>{if(active)setProjectRequests(rows)}).catch(()=>{});
   void readDeleteResults().then(rows=>{if(active)setResults(rows)}).catch(()=>{});
  };
  refresh();const timer=setInterval(refresh,30000);
  return ()=>{active=false;clearInterval(timer)};
 },[]);
 async function review(request:DeleteRequest,action:'approve'|'reject'){
  if(action==='approve'&&!confirm(`Permanently delete this ${request.kind}?`))return;
  setReviewing(true);setError('');
  try{
   await writeDeleteAction({action,id:request.id});
   setDeletions(rows=>rows.filter(row=>row.id!==request.id));
   if(action==='approve')window.location.reload();
  }catch(e){setError(e instanceof Error?e.message:'Could not review request.');}
  finally{setReviewing(false);}
 }
 async function reviewProject(id:number,approve:boolean){
  setReviewing(true);setError('');
  try{setProjectRequests(await readProjectApprovals(id,approve));if(approve)window.location.reload();}
  catch(e){setError(e instanceof Error?e.message:'Could not review project.');}
  finally{setReviewing(false);}
 }
 const total=data.unread+workApprovals+deletions.length+results.length+projectRequests.length;
 useEffect(()=>{let active=true;const refresh=()=>{if(document.visibilityState==='hidden')return;void readNotifications().then(r=>{if(active){setData(r);setError('')}}).catch((e:Error)=>{if(active)setError(e.message)});};refresh();const timer=setInterval(refresh,30000);document.addEventListener('visibilitychange',refresh);return()=>{active=false;clearInterval(timer);document.removeEventListener('visibilitychange',refresh)}},[]);
 useEffect(()=>{
  if(!open)return;
  const dismiss=(event:PointerEvent)=>{if(event.target instanceof Node&&!container.current?.contains(event.target))setOpen(false)};
  document.addEventListener('pointerdown',dismiss,true);
  return ()=>document.removeEventListener('pointerdown',dismiss,true);
 },[open]);
 async function select(item:typeof data.items[number]){openTicket(item.ticket);setOpen(false);try{setData(await readNotifications(item.ticket,item.updated_at))}catch(e){setError(e instanceof Error?e.message:'Could not mark as read')}}
 return <div ref={container} className="notifications"><button className="secondary" aria-expanded={open} onClick={()=>setOpen(!open)}>Notifications {total>0&&<b className="notification-count">({total})</b>}</button>{open&&<section className="panel notification-list"><h3>Notifications</h3>{projectRequests.map(project=><article className="notification-item unread" key={project.id}>
 <details><summary>New project approval · {project.subject}</summary>
 <small>{project.creator} · Assigned to {project.assignee}</small>
 <small>{project.office} · {project.team} · {project.priority} · Deadline {project.deadline}</small>
 <p>{project.description}</p>
 </details>
 <div className="work-actions"><button className="primary" disabled={reviewing} onClick={()=>void reviewProject(project.id,true)}>Approve</button><button className="secondary" disabled={reviewing} onClick={()=>void reviewProject(project.id,false)}>Reject</button></div>
 </article>)}{results.map(result=><article className="notification-item unread" key={result.id}>
 <b>{result.status==='Approved'?'Approved':'Rejected'} delete {result.kind} request</b><small>{result.subject}</small>
 <button type="button" className="text-button" onClick={()=>void readDeleteResults(result.id).then(setResults).catch((e:Error)=>setError(e.message))}>Mark as read</button>
 </article>)}{deletions.map(request=><article className="notification-item unread" key={request.id}>
 <a href={request.kind==='project'?'#/projects/'+encodeURIComponent(request.target):'#/tickets/detail/'+encodeURIComponent(request.target)} onClick={()=>setOpen(false)}><b>Delete {request.kind} request</b><small>{request.subject} · {request.name}</small></a>
 <div className="work-actions"><button className="primary" disabled={reviewing} onClick={()=>void review(request,'approve')}>Approve</button><button className="secondary" disabled={reviewing} onClick={()=>void review(request,'reject')}>Reject</button></div>
 </article>)}{workApprovals>0&&<button type="button" className="notification-item unread" onClick={()=>{
 setOpen(false);
 if(location.hash==='#/regular-work/approvals')document.getElementById('work-approvals')?.scrollIntoView({block:'start'});
 else location.hash='/regular-work/approvals';
 }}>{workApprovals} regular work approval {workApprovals===1?'request':'requests'}</button>}<small>Latest 30 ticket conversations · refreshes every 30 seconds</small>{error&&<p className="error" role="alert">{error}</p>}{!data.items.length&&!error&&!workApprovals&&!deletions.length&&!results.length&&!projectRequests.length&&<p>No notifications yet.</p>}{data.items.map(item=><button key={item.ticket} className={'notification-item'+(!item.read_at?' unread':'')} onClick={()=>void select(item)}>{item.message}<small>{new Date(item.updated_at).toLocaleString('en-GB',{timeZone:'Asia/Dhaka'})} BDT</small></button>)}</section>}</div>;
}
export function ManagerTransfer({team,onDone}:{team:any[];onDone:()=>Promise<void>}){
 const [target,setTarget]=useState(''),[confirmation,setConfirmation]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[open,setOpen]=useState(false);
 const chosen=team.find(o=>o.id===target);
 return <section className="panel manager-transfer"><button className="secondary" onClick={()=>setOpen(!open)}>Transfer Manager access</button>{open&&<form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await writeDesk({action:'manager_transfer',target,confirmation});await onDone()}catch(e){setError(e instanceof Error?e.message:'Transfer failed')}finally{setBusy(false)}}}><h3>Change the Manager account</h3><p>The selected officer gains Manager access. Your account becomes a regular IT member. Tickets and history stay available.</p><label>New Manager<select required value={target} onChange={e=>{setTarget(e.target.value);setConfirmation('')}}><option value="">Select officer</option>{team.map(o=><option key={o.id} value={o.id}>{o.name} — {o.email}</option>)}</select></label>{chosen&&<label>Type {chosen.email} to confirm<input required autoComplete="off" value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label>}{error&&<p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy||!chosen||confirmation!==chosen.email}>{busy?'Transferring…':'Confirm transfer'}</button></form>}</section>;
}
