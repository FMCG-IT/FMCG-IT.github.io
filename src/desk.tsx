import {readDesk,writeDesk,signOut,trackingUrl} from './backend';
import {useEffect,useState} from 'react';
import {LayoutDashboard,Ticket,Users,Plus,Search,ArrowUpRight,ArrowLeft,Copy,Check,Monitor,Activity,CheckCircle2,LogOut,X,Pencil,Trash2} from 'lucide-react';
import {sections,sectionFor,sectionSlug,type ITSection} from './it-sections';
import {statuses,historicalStatuses} from './ticket-status';
const dhakaTime=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dhaka',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true});
const active=(t:any)=>t.status!=='Closed';
export default function Desk({section,teamPage=false,initialStatus,initialOfficer=''}:{section?:ITSection;teamPage?:boolean;initialStatus?:string;initialOfficer?:string}){const [data,setData]=useState<any>(null),[error,setError]=useState(''),[view,setView]=useState(location.hash==='#/team'?'IT team':initialStatus||initialOfficer||location.hash==='#/tickets'?'All tickets':'Overview'),[filter,setFilter]=useState(initialOfficer),[query,setQuery]=useState(''),[status,setStatus]=useState(initialStatus??'All statuses'),[modal,setModal]=useState(''),[editing,setEditing]=useState<any>(null),[deleting,setDeleting]=useState<any>(null),[selected,setSelected]=useState(''),[busy,setBusy]=useState(false),[copied,setCopied]=useState(false);async function load(){setData(await readDesk())}
useEffect(()=>{load().catch((error:Error)=>setError(error.message))},[]);
async function submit(e:React.FormEvent<HTMLFormElement>,action:string){
 e.preventDefault();setBusy(true);setError('');
 const values=Object.fromEntries(new FormData(e.currentTarget));
 try{await writeDesk({...values,action,id:action==='officer_edit'?editing?.id:action==='officer_delete'?deleting?.id:selected,internal:values.internal==='on'});await load();setModal('')}
 catch(error){setError(error instanceof Error?error.message:'Could not save the ticket.')}
 finally{setBusy(false)}
}
async function rotate(){
 if(!confirm('Replace this tracking link? The old link will stop working.'))return;
 try{await writeDesk({action:'rotate',id:selected});await load();setCopied(false)}
 catch(error){setError(error instanceof Error?error.message:'Could not replace the link.')}
}
async function copy(t:any){try{await navigator.clipboard.writeText(trackingUrl(t.token));setCopied(true);setTimeout(()=>setCopied(false),2500)}catch{setError('Could not copy. Open the tracking page and copy its address.')}}
if(!data)return <div className="loading"><Monitor size={36}/><h2>{error||'Opening your workspace…'}</h2>{error&&<button className="secondary" onClick={()=>void signOut()}>Sign out</button>}</div>;
const allTeam=data.team,team=allTeam.filter((o:any)=>!o.archived),tickets=data.tickets;const members=(group:ITSection)=>team.filter((o:any)=>sectionFor(o.specialty)===group);const sectionOfficers=section?members(section):[];const t=tickets.find((x:any)=>x.id===selected);const count=(s:string)=>tickets.filter((t:any)=>t.status===s).length;
const ticketDetails=selected&&t?<><button className="text-button" onClick={()=>setSelected('')}><ArrowLeft size={16}/> Back to tickets</button><div className="detail-grid"><section className="panel"><div className="section-head"><span className="eyebrow">{t.id}</span><span className="badge">{t.status}</span></div><h2>{t.title}</h2><p className="description">{t.description||'No additional description.'}</p><div className="facts"><span>Employee<b>{t.employee}</b></span><span>Department / location<b>{t.department||'—'}</b></span><span>Category<b>{t.category}</b></span><span>Priority<b>{t.priority}</b></span><span>Assigned to<b>{team.find((o:any)=>o.id===t.assignee)?.name??'Unassigned'}</b></span></div><h3>Activity & updates</h3>{data.updates.filter((u:any)=>u.ticket===t.id).sort((a:any,b:any)=>b.created.localeCompare(a.created)).map((u:any)=><article className="event" key={u.id}><small>{u.author} · {new Date(u.created).toLocaleString()} {u.internal?'· INTERNAL NOTE':'· PUBLIC'}</small><p>{u.body}</p></article>)}</section><section className="panel"><h3>Manage ticket</h3><form key={t.id+'-'+t.status+'-'+t.assignee} onSubmit={e=>submit(e,'update')}><label>Status<select name="status" defaultValue={t.status}>{statuses.map(s=><option key={s}>{s}</option>)}</select></label><label>Assigned officer<select name="assignee" defaultValue={t.assignee}>{team.map((o:any)=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label><label>Write an update<textarea name="body" rows={4} placeholder="What has been done? What happens next?"/></label><label className="checkbox"><input type="checkbox" name="internal"/> Internal note — IT team only</label><button className="primary" disabled={busy}>Save update</button></form><hr/><h3>Employee tracking</h3><p className="muted">Share status and public updates using a private tracking link.</p><button className="secondary" onClick={()=>copy(t)}>{copied?<Check size={16}/>:<Copy size={16}/>} {copied?'Link copied':'Copy tracking link'}</button><a className="text-button" target="_blank" rel="noreferrer" href={trackingUrl(t.token)}>Open tracking page <ArrowUpRight size={15}/></a><button className="text-button" onClick={rotate}>Replace tracking link</button></section></div></>:null;
 const officerNames=new Map<string,string>((section?sectionOfficers:team).map((o:any)=>[o.id,o.name]));
 const scopedTickets=tickets.filter((ticket:any)=>(!section||officerNames.has(ticket.assignee))&&(!filter||ticket.assignee===filter));
 const sectionTicketIds=new Set(scopedTickets.map((ticket:any)=>ticket.id));
 const lastActivity=new Map<string,string>();
 const lastComment=new Map<string,{body:string;created:string;internal:number}>();
 for(const update of data.updates){
  if(!sectionTicketIds.has(update.ticket))continue;
  if(update.created>(lastActivity.get(update.ticket)??''))lastActivity.set(update.ticket,update.created);
  const automatic=!update.internal&&(update.body==='Ticket registered. The IT team will review the issue.'||
   [...statuses,...historicalStatuses].some(status=>update.body.startsWith('Status: '+status+'. Assigned to ')));
  if(!automatic&&update.created>=(lastComment.get(update.ticket)?.created??''))lastComment.set(update.ticket,update);
 }
 const search=query.trim().toLowerCase();
 const visibleTickets=scopedTickets.filter((ticket:any)=>(status==='All statuses'||ticket.status===status)&&(!search||
  [ticket.id,ticket.title,ticket.status,ticket.priority,ticket.employee,ticket.department,officerNames.get(ticket.assignee),lastComment.get(ticket.id)?.body]
   .some(value=>value?.toLowerCase().includes(search))))
  .sort((a:any,b:any)=>(lastActivity.get(b.id)??b.created).localeCompare(lastActivity.get(a.id)??a.created));
 const ticketTable=<section className="ticket-section section-tickets" aria-labelledby="section-tickets-title">
  <div className="section-head section-ticket-heading"><h2 id="section-tickets-title">{section?'Section tickets':filter&&officerNames.has(filter)?officerNames.get(filter)+'’s tickets':initialStatus&&status!=='All statuses'?status+' tickets':'All tickets'}</h2><div className="ticket-table-controls"><label className="search section-ticket-search"><Search size={17} aria-hidden="true"/><input type="search" aria-label={section?'Search section tickets':'Search tickets'} placeholder={section?'Search section tickets…':'Search tickets…'} value={query} onChange={e=>setQuery(e.target.value)}/></label><select className="ticket-table-status" aria-label="Filter status" value={status} onChange={e=>setStatus(e.target.value)}><option>All statuses</option>{statuses.map(s=><option key={s}>{s}</option>)}</select></div></div>
  {filter&&<button className="text-button ticket-scope-clear" onClick={()=>setFilter('')}>Clear officer filter <X size={14}/></button>}
  {visibleTickets.length?<div className="table-scroll"><table>
   <thead><tr><th scope="col">TICKET / ISSUE</th><th scope="col">ASSIGNED TO</th><th scope="col">PRIORITY</th><th scope="col">STATUS</th><th scope="col">LAST UPDATE TIME <span className="muted">(BDT)</span></th><th scope="col">LAST UPDATE COMMENT</th></tr></thead>
   <tbody>{visibleTickets.map((ticket:any)=>{
    const updatedAt=lastActivity.get(ticket.id)??ticket.created;
    const comment=lastComment.get(ticket.id);
    return <tr key={ticket.id} className="ticket-row" onClick={()=>{setError('');setCopied(false);setSelected(ticket.id)}}>
    <td><small>{ticket.id}</small><button className="ticket-title" onClick={e=>{e.stopPropagation();setError('');setCopied(false);setSelected(ticket.id)}}>{ticket.title}</button></td>
    <td>{officerNames.get(ticket.assignee)}</td>
    <td><span className={'priority '+ticket.priority.toLowerCase()}><i className="dot"/>{ticket.priority}</span></td>
    <td><span className={'badge '+ticket.status.toLowerCase().replaceAll(' ','-')}>{ticket.status}</span></td>
    <td><time dateTime={updatedAt}>{dhakaTime.format(new Date(updatedAt))}</time></td>
    <td className="section-ticket-comment">{comment?<>{comment.internal===1&&<small>Internal note</small>}{comment.body}</>:<span className="muted">No comment yet</span>}</td>
   </tr>})}</tbody>
  </table></div>:<p className="muted section-ticket-empty">{(search||status!=='All statuses')&&scopedTickets.length?'No matching tickets.':section?'No tickets assigned to this section yet.':filter?'No tickets assigned to this officer yet.':'No tickets yet.'}</p>}
 </section>;
const modalView=modal&&<div className="overlay" onClick={()=>setModal('')}><section className="dialog" role="dialog" aria-modal="true" aria-label={modal==='create'?'Create ticket':modal==='officer_edit'?'Edit officer':modal==='officer_delete'?'Delete officer':'Add officer'} onClick={e=>e.stopPropagation()}><div className="section-head"><h2>{modal==='create'?'Create a ticket':modal==='officer_edit'?'Edit IT officer':modal==='officer_delete'?'Delete IT officer':'Add IT officer'}</h2><button className="icon-button" aria-label="Close" onClick={()=>setModal('')}><X/></button></div><p className="muted">{modal==='officer_delete'?'Remove team access and transfer assigned tickets. Ticket history is kept.':modal==='create'?'Log the issue, assign an officer, and keep everyone updated.':'Use the email they will sign in with.'}</p><form onSubmit={e=>submit(e,modal)}>{modal==='officer_delete'?<><p>Remove <b>{deleting?.name}</b> from the IT team?</p><label>Transfer tickets to<select name="replacement" defaultValue={data.me.id}>{team.filter((o:any)=>o.id!==deleting?.id).map((o:any)=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label></>:modal==='officer'||modal==='officer_edit'?<><label>Full name<input required name="name" defaultValue={editing&&modal==='officer_edit'?editing.name:''} placeholder="Officer’s full name"/></label><label>Account email<input required type="email" name="email" readOnly={modal==='officer_edit'&&editing?.id===data.me.id} defaultValue={editing&&modal==='officer_edit'?editing.email:''} placeholder="name@company.com"/></label><label>IT section<select name="specialty" defaultValue={modal==='officer_edit'?sectionFor(editing.specialty):section??'Software/System'}>{sections.map(section=><option key={section}>{section}</option>)}</select></label></>:<><label>Issue title<input name="title" required maxLength={200} placeholder="e.g. Accounts printer is not responding"/></label><div className="form-row"><label>Affected employee<input name="employee" required placeholder="Employee name"/></label><label>Department / location<input name="department" placeholder="Accounts · Floor 2"/></label></div><div className="form-row"><label>Category<select name="category">{['Support','Network','Hardware','Software','Email','Access Request','Printer'].map(s=><option key={s}>{s}</option>)}</select></label><label>Priority<select name="priority" defaultValue="Medium">{['Low','Medium','High','Critical'].map(s=><option key={s}>{s}</option>)}</select></label></div><label>Assign to<select name="assignee" defaultValue={filter||data.me.id}>{team.map((o:any)=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label><label>Description<textarea name="description" rows={3} placeholder="Describe the issue and any troubleshooting so far…"/></label></>}{error&&<p className="error">{error}</p>}<button className="primary" disabled={busy}>{busy?'Saving…':modal==='create'?'Create ticket':modal==='officer_edit'?'Save changes':modal==='officer_delete'?'Delete officer':'Add officer'}<ArrowUpRight size={17}/></button></form></section></div>;
const memberCards=<div className="officer-grid">{sectionOfficers.map((o:any)=><article key={o.id} className="member-card">
 <a className="officer" href={'#/officers/'+encodeURIComponent(o.id)}><ArrowUpRight className="officer-arrow" size={14}/><h3>{o.name}</h3><p>{o.specialty}</p>
 <div className="officer-bottom member-statuses">{statuses.map(status=><span key={status}>{status}: <b>{tickets.filter((t:any)=>t.assignee===o.id&&t.status===status).length}</b></span>)}</div></a>
 {teamPage&&data.me.manager===1&&<div className="member-actions"><button className="text-button" onClick={()=>{setEditing(o);setError('');setModal('officer_edit')}}><Pencil size={13}/> Edit</button>{o.id!==data.me.id&&<button className="text-button danger" onClick={()=>{setDeleting(o);setError('');setModal('officer_delete')}}><Trash2 size={13}/> Delete</button>}</div>}
 </article>)}</div>;
if(section){
 return <main className="section-page">
 <a className="text-button" href={teamPage?'#/team':'#/'}><ArrowLeft size={15}/> All IT sections</a>
 <h1>{section}</h1>
 {memberCards}
 {sectionOfficers.length===0&&<p className="muted section-empty">No officers in this section yet.</p>}
 {error&&<p role="alert" className="error">{error}</p>}
 {!teamPage&&(ticketDetails??ticketTable)}
 {modalView}
</main>;}
return <div className="shell"><aside className="sidebar"><div className="brand"><div className="logo"><Monitor size={21}/></div>IT Desk<span className="brand-dot"/></div><nav>{[[LayoutDashboard,'Overview'],[Ticket,'All tickets'],[Users,'IT team']].map(([Icon,label]:any)=><button key={label} className={view===label?'nav active':'nav'} onClick={()=>{if(label==='IT team'){location.hash='/team';return;}if(location.hash==='#/team'){location.hash=label==='All tickets'?'/tickets':'/';return;}setView(label);setSelected('');setFilter('');setStatus('All statuses')}}><Icon size={19}/>{label}{label==='All tickets'&&<span className="nav-count">{tickets.length}</span>}</button>)}</nav><div className="profile"><span className="avatar">{data.me.name.slice(0,2).toUpperCase()}</span><div><b>{data.me.name}</b><small>{data.me.manager?'IT Manager':'IT Officer'}</small></div><button type="button" className="icon-button" onClick={()=>void signOut()} aria-label="Sign out"><LogOut size={17}/></button></div></aside><main className="main"><header className="topbar"><span>Workspace <span className="slash">/</span> <b>{selected?'Ticket details':view}</b></span><span className="secure"><span/> IT SUPPORT PORTAL</span></header><div className="content"><div className={'heading'+(!selected&&view==='Overview'?' overview-actions':'')}>{(selected||view!=='Overview')&&<h1>{selected?'Ticket details':view==='IT team'?'IT team':initialStatus&&status!=='All statuses'?status+' tickets':'All tickets'}</h1>}{(view!=='IT team'||data.me.manager)&&<button className="primary" onClick={()=>{setError('');setModal(view==='IT team'?'officer':'create')}}>{view==='IT team'?<Users size={18}/>:<Plus size={19}/>} {view==='IT team'?'Add IT officer':'Create ticket'}</button>}</div>{error&&<p role="alert" className="error">{error}</p>}
{ticketDetails??<>
{view==='Overview'&&<div className="stats">{[[Ticket,'New ticket',count('New ticket'),'Awaiting action'],[Activity,'In progress',count('In progress'),'Being worked on'],[CheckCircle2,'Closed',count('Closed'),'Issues taken care of']].map(([Icon,label,note,sub]:any,i)=><a className="stat stat-link" href={'#/tickets/'+label.toLowerCase().replaceAll(' ','-')} key={label}><div><span>{label}</span><Icon size={18}/></div><strong>{note.toString().padStart(2,'0')}</strong><small><i className={'dot d'+i}/>{sub}</small></a>)}</div>}
{view!=='All tickets'&&<section className="team-section"><div className="section-head"><div><h2>IT sections <span className="sub-count">{sections.length}</span></h2></div></div><div className="officer-grid">{sections.map(group=>{
 const officers=members(group);
 const ids=new Set(officers.map((o:any)=>o.id));
 const total=tickets.filter((t:any)=>ids.has(t.assignee)&&active(t)).length;
 return <a key={group} className="officer section-card" href={(view==='IT team'?'#/team/':'#/sections/')+sectionSlug(group)}>
 <ArrowUpRight className="officer-arrow" size={14} aria-hidden="true"/>
 <h3>{group}</h3><p>{view==='IT team'?officers.length+' members':total+' active '+(total===1?'ticket':'tickets')}</p>
 </a>;
})}</div></section>}
{view!=='IT team'&&ticketTable}</>}
<footer><span>IT Desk · Built for a smoother workday.</span><span><span className="dot"/> Workspace connected</span></footer></div></main>{modalView}</div>}
