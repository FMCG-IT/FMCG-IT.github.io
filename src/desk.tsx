import DeleteItem from './delete-item';
import Projects from './projects';
import {readProjectCount} from './backend';
import RegularWork from './regular-work';
import {readWorkSummary} from './backend';
import {sortableColumns,nextTicketSort} from './ticket-sorting';
import {OfficeFields} from './offices';
import PrioritySelect from './priority-select';
import TeamAssignment,{teamLabel} from './team-assignment';
import {Notifications,ManagerTransfer,overdue,automaticDueAt,overdueDays,priorityLabel} from './operations';
import ManagerReports from './manager-reports';
import {designations} from './designations';
import {ticketLabel} from './ticket-label';
import StoragePanel from './storage-panel';
import {readDesk,readTickets,readTicket,readHistory,writeDesk,signOut,trackingUrl} from './backend';
import {useEffect,useState} from 'react';
import {LayoutDashboard,Ticket,Users,UserRound,Plus,Search,ArrowUpRight,ArrowLeft,Copy,Check,Monitor,Activity,CheckCircle2,LogOut,X,Pencil,Trash2,HardDrive,BarChart3,ListChecks,FolderKanban} from 'lucide-react';
import {sections,sectionFor,sectionSlug,type ITSection} from './it-sections';
import {statuses} from './ticket-status';
const dhakaTime=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dhaka',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true});
export default function Desk({section,teamPage=false,portalPage=false,storagePage=false,reportsPage=false,workPage=false,projectPage=false,initialStatus,initialOfficer=''}:{section?:ITSection;teamPage?:boolean;portalPage?:boolean;storagePage?:boolean;reportsPage?:boolean;workPage?:boolean;projectPage?:boolean;initialStatus?:string;initialOfficer?:string}){const [data,setData]=useState<any>(null),[error,setError]=useState(''),[view,setView]=useState(projectPage?'Project':workPage?'Regular work':reportsPage?'Reports':storagePage?'Storage':portalPage?'My portal':location.hash==='#/team'?'IT team':initialStatus||initialOfficer||location.hash==='#/tickets'?'All tickets':'Overview'),[filter,setFilter]=useState(initialOfficer),[query,setQuery]=useState(''),[status,setStatus]=useState(initialStatus??'All statuses'),[modal,setModal]=useState(''),[editing,setEditing]=useState<any>(null),[deleting,setDeleting]=useState<any>(null),[selected,setSelected]=useState(()=>{const match=location.hash.match(/^#\/tickets\/detail\/([^/]+)$/);return match?decodeURIComponent(match[1]):''}),[busy,setBusy]=useState(false),[copied,setCopied]=useState(false);const [revision,setRevision]=useState(0),[visibleTickets,setVisibleTickets]=useState<any[]>([]),[listLoading,setListLoading]=useState(false),[listError,setListError]=useState(''),[debouncedQuery,setDebouncedQuery]=useState(query),[detail,setDetail]=useState<any>(null),[detailError,setDetailError]=useState(''),[historyBusy,setHistoryBusy]=useState(false);const [sort,setSort]=useState('updated_desc');const [,setClock]=useState(0);useEffect(()=>{const timer=setInterval(()=>setClock(v=>v+1),60000);return()=>clearInterval(timer)},[]);
const [success,setSuccess]=useState<{message:string}>();
useEffect(()=>{
 if(!success)return;
 const timer=setTimeout(()=>setSuccess(undefined),5000);
 return ()=>clearTimeout(timer);
},[success]);
const [workSummary,setWorkSummary]=useState({today:'',count:0,approvals:0});
function refreshWork(){void readWorkSummary().then(setWorkSummary).catch(()=>{});}
useEffect(()=>{refreshWork();const timer=setInterval(refreshWork,30000);return()=>clearInterval(timer)},[]);
const [projectCount,setProjectCount]=useState<number>();
useEffect(()=>{
 if(view!=='Overview'&&view!=='My portal')return;
 let active=true;
 const refresh=()=>void readProjectCount().then(count=>{if(active)setProjectCount(count)}).catch(()=>{});
 refresh();const timer=setInterval(refresh,30000);
 return ()=>{active=false;clearInterval(timer)};
},[view]);
const listAssignee=view==='My portal'?data?.me.id:filter||null;
const listSection=section??null;
async function load(){setData(await readDesk());setRevision(value=>value+1)}
useEffect(()=>{const timer=setTimeout(()=>setDebouncedQuery(query.trim().slice(0,200)),350);return ()=>clearTimeout(timer)},[query]);
useEffect(()=>{
 if(!data?.me||view==='IT team'||view==='Storage'||view==='Reports'||view==='Regular work'||view==='Project'||teamPage)return;
 const controller=new AbortController();
 setListLoading(true);setListError('');
 void readTickets({search:debouncedQuery,status,assignee:listAssignee??null,section:listSection,priority:null,createdFrom:null,createdTo:null,sort},controller.signal)
  .then(items=>{if(!controller.signal.aborted)setVisibleTickets(items);})
  .catch((e:Error)=>{if(!controller.signal.aborted)setListError(e.message);})
  .finally(()=>{if(!controller.signal.aborted)setListLoading(false);});
 return ()=>controller.abort();
},[data?.me.id,view,teamPage,listSection,listAssignee,status,debouncedQuery,revision,sort]);
useEffect(()=>{
 if(!selected){setDetail(null);return;}
 let cancelled=false;setDetail(null);setDetailError('');
 void readTicket(selected).then(result=>{if(!cancelled)setDetail(result)}).catch((e:Error)=>{if(!cancelled)setDetailError(e.message)});
 return ()=>{cancelled=true};
},[selected,revision]);
async function loadMoreHistory(){
 if(!detail||historyBusy)return;
 const id=detail.ticket.id;setHistoryBusy(true);
 try{const result=await readHistory(id,detail.updates.length);setDetail((previous:any)=>{
  if(previous?.ticket.id!==id)return previous;
  const seen=new Set(previous.updates.map((u:any)=>u.id));
  return {...previous,updates:[...previous.updates,...result.updates.filter((u:any)=>!seen.has(u.id))],update_total:result.total};
 });}catch(e){setError(e instanceof Error?e.message:'Could not load older updates.')}finally{setHistoryBusy(false)}
}
useEffect(()=>{load().catch((error:Error)=>setError(error.message))},[]);
useEffect(()=>{if(!data?.me.id)return;let active=true;const refresh=()=>{if(document.visibilityState==='hidden')return;void readDesk().then(result=>{if(active)setData(result)}).catch(()=>{});};const timer=setInterval(refresh,60000);window.addEventListener('focus',refresh);return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh)}},[data?.me.id]);
async function submit(e:React.FormEvent<HTMLFormElement>,action:string){
 e.preventDefault();setBusy(true);setError('');
 const form=e.currentTarget;const formData=new FormData(form);const values:Record<string,any>=Object.fromEntries(formData);if(action==='officer'||action==='officer_edit'){values.offices=formData.getAll('offices');if(!values.offices.length){setError('Select at least one responsible office / area.');setBusy(false);return;}}if(action==='ticket_edit'&&t)values.due_at=new Date(automaticDueAt({...t,priority:String(values.priority)})).toISOString();
 try{await writeDesk({...values,action,id:action==='officer_edit'?editing?.id:action==='officer_delete'?deleting?.id:selected,internal:values.internal==='on'});if(action==='officer')form.reset();setModal('');if(action==='create')setSuccess({message:'Ticket created successfully'});await load()}
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
const allTeam=data.team,team=allTeam.filter((o:any)=>!o.archived);
const members=(group:ITSection)=>team.filter((o:any)=>sectionFor(o.specialty)===group);
const sectionOfficers=section?members(section):[];
const t=detail?.ticket.id===selected?detail.ticket:null;
const memberCount=(id:string,status:string)=>Number(data.counts.byOfficer[id]?.[status]??0);
const activeCount=(id:string)=>memberCount(id,'New ticket')+memberCount(id,'In progress');
const count=(status:string)=>view==='My portal'?memberCount(data.me.id,status):Number(data.counts.statuses[status]??0);
const ticketDetails=selected&&t?<><button className="text-button" onClick={()=>setSelected('')}><ArrowLeft size={16}/> Back to tickets</button><div className="detail-grid"><section className="panel"><div className="section-head"><span className="eyebrow">{ticketLabel(t)}</span><span className={'badge '+t.status.toLowerCase().replaceAll(' ','-')}>{t.status}</span></div><h2>{t.title}</h2><p className="description">{t.description||'No additional description.'}</p><div className="facts"><span>Office / area<b>{t.office??'Not set'}</b></span><span>Employee<b>{t.employee}</b></span><span>Department / location<b>{t.department||'—'}</b></span><span>Team<b>{teamLabel(sectionFor(allTeam.find((o:any)=>o.id===t.assignee)?.specialty??''))}</b></span><span>Priority<b><span className={'priority '+t.priority.toLowerCase()}>{priorityLabel(t.priority)}</span></b></span><span>Assigned to<b>{team.find((o:any)=>o.id===t.assignee)?.name??'Unassigned'}</b></span></div><h3>Activity & updates</h3>{detail.updates.sort((a:any,b:any)=>b.created.localeCompare(a.created)).map((u:any)=><article className="event" key={u.id}><small>{u.author} · {new Date(u.created).toLocaleString()} {u.internal?'· INTERNAL NOTE':'· PUBLIC'}</small><p>{u.body}</p></article>)}{detail.updates.length<detail.update_total&&<button className="secondary" disabled={historyBusy} onClick={()=>void loadMoreHistory()}>{historyBusy?'Loading…':'Load older updates'}</button>}</section><section className="panel"><h3>Manage ticket</h3>{(data.me.manager===1||t.created_by===data.me.id||t.assignee===data.me.id)&&<DeleteItem key={t.id} kind="ticket" id={t.id} manager={data.me.manager===1} onDelete={()=>{setSelected('');void load().catch((e:Error)=>setError(e.message))}}/>}<button className="secondary" onClick={()=>{setError('');setModal('ticket_edit')}}><Pencil size={14}/> Edit ticket details</button><p className={overdue(t)?'overdue-label':'muted'}>{'Automatic overdue: '+dhakaTime.format(new Date(automaticDueAt(t)))+(overdue(t)?' · Overdue':'')+' · '+overdueDays(t.priority)+' days from creation'}</p><form key={t.id+'-'+t.status+'-'+t.assignee} onSubmit={e=>submit(e,'update')}><label>Status<select name="status" defaultValue={t.status}>{statuses.map(s=><option key={s}>{s}</option>)}</select></label><TeamAssignment key={t.id+'-'+t.assignee} officers={team} initialOfficer={t.assignee} initialOffice={t.office??''}/><label>Write an update<textarea name="body" rows={4} placeholder="What has been done? What happens next?"/></label><label className="checkbox"><input type="checkbox" name="internal"/> Internal note — IT team only</label><button className="primary" disabled={busy}>Save update</button></form><hr/><h3>Employee tracking</h3><p className="muted">Share status and public updates using a private tracking link.</p><button className="secondary" onClick={()=>copy(t)}>{copied?<Check size={16}/>:<Copy size={16}/>} {copied?'Link copied':'Copy tracking link'}</button><a className="text-button" target="_blank" rel="noreferrer" href={trackingUrl(t.token)}>Open tracking page <ArrowUpRight size={15}/></a><button className="text-button" onClick={rotate}>Replace tracking link</button></section></div></>:null;
 const detailView=selected?(ticketDetails??<section className="panel"><button className="text-button" onClick={()=>setSelected('')}><ArrowLeft size={16}/> Back to tickets</button><p role="status">{detailError||'Loading ticket…'}</p></section>):null;
 const officerNames=new Map<string,string>(allTeam.map((o:any)=>[o.id,o.name]));
 const ticketTable=<section className="ticket-section section-tickets" aria-labelledby="section-tickets-title">
  <div className="section-head section-ticket-heading"><h2 id="section-tickets-title">{section?'Section tickets':view==='My portal'?(status==='All statuses'?'My tickets':status+' tickets'):filter&&officerNames.has(filter)?officerNames.get(filter)+'’s tickets':initialStatus&&status!=='All statuses'?status+' tickets':'All tickets'}</h2><div className="ticket-table-controls"><label className="search section-ticket-search"><Search size={17} aria-hidden="true"/><input type="search" aria-label={section?'Search section tickets':'Search tickets'} placeholder={section?'Search section tickets…':'Search tickets…'} value={query} maxLength={200} onChange={e=>setQuery(e.target.value)}/></label><select className="ticket-table-status" aria-label="Filter status" value={status} onChange={e=>setStatus(e.target.value)}><option>All statuses</option>{statuses.map(s=><option key={s}>{s}</option>)}</select></div></div>
  {filter&&<button className="text-button ticket-scope-clear" onClick={()=>setFilter('')}>Clear officer filter <X size={14}/></button>}
  {listError&&<p className="error" role="alert">{listError}</p>}
  {listError?null:listLoading?<p className="muted section-ticket-empty" role="status">Loading tickets…</p>:visibleTickets.length?<div className="table-scroll ticket-fit-region" tabIndex={0} role="region" aria-label="Ticket table"><table>
   <thead><tr>{sortableColumns.map(column=>{const active=sort.startsWith(column.key+'_');const direction=active?(sort.endsWith('_asc')?'ascending':'descending'):'none';return <th scope="col" key={column.key} aria-sort={direction}><button type="button" className={'column-sort'+(active?' active':'')} onClick={()=>setSort(nextTicketSort(sort,column.key,column.first))}>{column.label}<span aria-hidden="true">{active?(direction==='ascending'?'↑':'↓'):'↕'}</span></button></th>})}</tr></thead>
   <tbody>{visibleTickets.map((ticket:any)=>{
    const updatedAt=ticket.last_update_at??ticket.created;
    const comment=ticket.last_comment;
    return <tr key={ticket.id} className={'ticket-row'+(overdue(ticket)?' ticket-overdue':'')} onClick={()=>{setError('');setCopied(false);setSelected(ticket.id)}}>
    <td className="ticket-id">{ticketLabel(ticket)}</td>
    <td><button className="ticket-title" onClick={e=>{e.stopPropagation();setError('');setCopied(false);setSelected(ticket.id)}}>{ticket.title}</button>{overdue(ticket)&&<small className="overdue-label">Overdue · {dhakaTime.format(new Date(automaticDueAt(ticket)))}</small>}</td>
    <td>{ticket.creator_name??'—'}</td>
    <td>{ticket.assignee_name??officerNames.get(ticket.assignee)}</td>
    <td><span className={'priority '+ticket.priority.toLowerCase()}><i className="dot"/>{priorityLabel(ticket.priority)}</span></td>
    <td><span className={'badge '+ticket.status.toLowerCase().replaceAll(' ','-')}>{ticket.status}</span></td>
    <td><time dateTime={ticket.created}>{dhakaTime.format(new Date(ticket.created))}</time></td>
    <td><time dateTime={updatedAt}>{dhakaTime.format(new Date(updatedAt))}</time></td>
    <td className="section-ticket-comment">{comment?comment.body:<span className="muted">No comment yet</span>}</td>
   </tr>})}</tbody>
  </table></div>:<p className="muted section-ticket-empty">{(debouncedQuery||status!=='All statuses')?'No matching tickets.':section?'No tickets assigned to this section yet.':view==='My portal'?'No tickets assigned to you yet.':filter?'No tickets assigned to this officer yet.':'No tickets yet.'}</p>}

 </section>;
const modalView=modal&&<div className="overlay" onClick={()=>setModal('')}><section className="dialog" role="dialog" aria-modal="true" aria-label={modal==='ticket_edit'?'Edit ticket':modal==='create'?'Create ticket':modal==='officer_edit'?'Edit officer':modal==='officer_delete'?'Delete officer':'Add officer'} onClick={e=>e.stopPropagation()}><div className="section-head"><h2>{modal==='ticket_edit'?'Edit ticket details':modal==='create'?'Create a ticket':modal==='officer_edit'?'Edit IT officer':modal==='officer_delete'?'Delete IT officer':'Add IT officer'}</h2><button className="icon-button" aria-label="Close" onClick={()=>setModal('')}><X/></button></div><p className="muted">{modal==='ticket_edit'?'Update ticket details. Overdue from creation: Low 30 days, Medium 10 days, High 3 days, Urgent 1 day.':modal==='officer_delete'?'Remove team access and transfer assigned tickets. Ticket history is kept.':modal==='create'?'Log the issue, assign an officer, and keep everyone updated.':modal==='officer'?'Set the email and password the officer will use to sign in.':'Use the email they will sign in with.'}</p><form onSubmit={e=>submit(e,modal)}>{modal==='officer_delete'?<><p>Remove <b>{deleting?.name}</b> from the IT team?</p><label>Transfer tickets to<select name="replacement" defaultValue={data.me.id}>{team.filter((o:any)=>o.id!==deleting?.id).map((o:any)=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label></>:modal==='officer'||modal==='officer_edit'?<><label>Full name<input required name="name" defaultValue={editing&&modal==='officer_edit'?editing.name:''} placeholder="Officer’s full name"/></label><label>Account email<input required type="email" name="email" readOnly={modal==='officer_edit'&&editing?.id===data.me.id} defaultValue={editing&&modal==='officer_edit'?editing.email:''} placeholder="name@company.com"/></label>{modal==='officer'&&<label>Login password<input name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" placeholder="Set the officer’s password"/></label>}<label>Designation<select name="designation" defaultValue={modal==='officer_edit'?(editing.designation??(editing.manager===1?'Manager':'Officer')):'Officer'}>{designations.map(designation=><option key={designation}>{designation}</option>)}</select></label><label>IT section<select name="specialty" defaultValue={modal==='officer_edit'?sectionFor(editing.specialty):section??'Software/System'}>{sections.map(section=><option key={section}>{section}</option>)}</select></label><OfficeFields key={modal+'-'+(editing?.id??'new')} selected={modal==='officer_edit'?editing?.offices??[]:[]}/></>:<><label>Issue title<input name="title" required maxLength={200} defaultValue={modal==='ticket_edit'?t?.title:''} placeholder="e.g. Accounts printer is not responding"/></label><div className="form-row"><label>Affected employee<input name="employee" required maxLength={200} defaultValue={modal==='ticket_edit'?t?.employee:''} placeholder="Employee name"/></label><label>Department / location<input name="department" maxLength={200} defaultValue={modal==='ticket_edit'?t?.department:''} placeholder="Accounts · Floor 2"/></label></div><div className="form-row"><TeamAssignment key={modal+'-'+(t?.id??'new')} officers={team} initialOfficer={modal==='ticket_edit'?t?.assignee:filter||data.me.id} initialTeam={modal==='create'?section:undefined} initialOffice={modal==='ticket_edit'?t?.office??'':''}/><label>Priority<PrioritySelect key={modal+'-'+(t?.id??'new')} initial={modal==='ticket_edit'?t?.priority:'Medium'}/></label></div><label>Description<textarea name="description" rows={3} maxLength={10000} defaultValue={modal==='ticket_edit'?t?.description:''} placeholder="Describe the issue and any troubleshooting so far…"/></label></>}{error&&<p className="error">{error}</p>}<button className="primary" disabled={busy}>{busy?'Saving…':modal==='ticket_edit'?'Save ticket':modal==='create'?'Create ticket':modal==='officer_edit'?'Save changes':modal==='officer_delete'?'Delete officer':'Add officer'}<ArrowUpRight size={17}/></button></form></section></div>;
const memberCards=<div className="officer-grid">{sectionOfficers.map((o:any)=><article key={o.id} className="member-card">
 <a className="officer" href={'#/officers/'+encodeURIComponent(o.id)}><ArrowUpRight className="officer-arrow" size={14}/><h3>{o.name}</h3><p>{o.designation??(o.manager===1?'Manager':'Officer')}</p>
 <p className="member-offices">{o.offices?.length?o.offices.join(' · '):'No offices assigned'}</p><div className="officer-bottom member-statuses">{statuses.map(status=><span className={'member-status status-'+status.toLowerCase().replaceAll(' ','-')} key={status}>{status}: <b>{memberCount(o.id,status)}</b></span>)}</div></a>
 {teamPage&&data.me.manager===1&&<div className="member-actions"><button className="text-button" onClick={()=>{setEditing(o);setError('');setModal('officer_edit')}}><Pencil size={13}/> Edit</button>{o.id!==data.me.id&&<button className="text-button danger" onClick={()=>{setDeleting(o);setError('');setModal('officer_delete')}}><Trash2 size={13}/> Delete</button>}</div>}
 </article>)}</div>;
const sectionContent=section?<><div className="heading section-heading">
 <h1>{selected?'Ticket details':section}</h1>
 <a className="text-button" href={teamPage?'#/team':'#/overview'}><ArrowLeft size={15}/> All IT sections</a>
 </div>
 {error&&<p role="alert" className="error">{error}</p>}
 {detailView??<>{memberCards}{sectionOfficers.length===0&&<p className="muted section-empty">No officers in this section yet.</p>}{!teamPage&&ticketTable}</>}
</>:null;
const activeView=section?(teamPage?'IT team':'Overview'):view;
const freezeTicketList=!selected&&(section?!teamPage:view==='Overview'||view==='All tickets'||view==='My portal');
return <div className={'shell'+(freezeTicketList||view==='Reports'||(view==='Project'&&!selected)?' overview-frozen':'')+(view==='Reports'?' reports-frozen':'')}><aside className="sidebar"><a className="brand brand-home" href="#/overview" aria-label="IT Desk home" onClick={()=>{setSelected('');setView('Overview')}}><div className="logo"><Monitor size={21}/></div>IT Desk<span className="brand-dot"/></a><nav>{[[UserRound,'My portal'],[LayoutDashboard,'Overview'],[Ticket,'All tickets'],[Users,'IT team'],...(data.me.manager===1?[[BarChart3,'Reports'],[HardDrive,'Storage']]:[])].map(([Icon,label]:any)=><button key={label} className={activeView===label?'nav active':'nav'} onClick={()=>{setView(label);setSelected('');setFilter('');setQuery('');setStatus('All statuses');location.hash=label==='My portal'?'/my':label==='Overview'?'/overview':label==='IT team'?'/team':label==='Storage'?'/storage':label==='Reports'?'/reports':'/tickets'}}><Icon size={19}/>{label}{label==='All tickets'&&<span className="nav-count">{data.counts.total}</span>}</button>)}</nav><div className="profile"><span className="avatar">{data.me.name.slice(0,2).toUpperCase()}</span><div><b>{data.me.name}</b><small>{data.me.designation??(data.me.manager===1?'Manager':'Officer')}</small></div><button type="button" className="icon-button" onClick={()=>void signOut()} aria-label="Sign out"><LogOut size={17}/><span>Logout</span></button></div></aside><main className="main"><header className="topbar"><Notifications workApprovals={workSummary.approvals} openTicket={id=>{setView('All tickets');setSelected(id)}}/>{freezeTicketList&&<button className="primary" onClick={()=>{setError('');setModal('create')}}><Plus size={16}/> Create ticket</button>}</header><div className="content">{sectionContent??(view==='Project'&&!selected?<Projects me={data.me} team={team} onCreated={()=>setSuccess({message:'Project submitted for Manager approval'})}/>:<><div className={'heading'+(!selected&&view==='Overview'?' overview-actions':'')}>{(selected||view!=='Overview')&&<h1>{selected?'Ticket details':view==='Regular work'?'Regular work':view==='Reports'?'Reports':view==='Storage'?'Storage':view==='IT team'?'IT team':view==='My portal'?'My portal':initialStatus&&status!=='All statuses'?status+' tickets':'All tickets'}</h1>}{(!freezeTicketList&&view!=='Storage'&&view!=='Reports'&&view!=='Regular work'&&(view!=='IT team'||data.me.manager===1))&&<button className="primary" onClick={()=>{setError('');setModal(view==='IT team'?'officer':'create')}}>{view==='IT team'?<Users size={18}/>:<Plus size={19}/>} {view==='IT team'?'Add IT officer':'Create ticket'}</button>}</div>{error&&<p role="alert" className="error">{error}</p>}
{view==='Regular work'?<RegularWork me={data.me} team={team} onChange={refreshWork}/>:view==='Reports'?(data.me.manager===1?<ManagerReports team={allTeam}/>:<p className="error">Manager access required.</p>):view==='Storage'?(data.me.manager===1?<StoragePanel/>:<p className="error">Manager access required.</p>):detailView??<>
{(view==='Overview'||view==='My portal')&&<div className="stats stats-with-project">{[[Ticket,'New ticket',count('New ticket'),'Awaiting action'],[Activity,'In progress',count('In progress'),'Being worked on'],[CheckCircle2,'Closed',count('Closed'),'Issues taken care of']].map(([Icon,label,note,sub]:any,i)=><a className={'stat stat-link status-'+label.toLowerCase().replaceAll(' ','-')} href={(view==='My portal'?'#/my/':'#/tickets/')+label.toLowerCase().replaceAll(' ','-')} key={label}><div><span>{label}</span><Icon size={18}/></div><strong>{note.toString().padStart(2,'0')}</strong><small><i className={'dot d'+i}/>{sub}</small></a>)}<a className="stat stat-link regular-work-stat" href="#/regular-work"><div><span>Regular work</span><ListChecks size={16}/></div><strong>{workSummary.count.toString().padStart(2,'0')}</strong><small>My tasks today</small></a><a className="stat stat-link project-stat" href="#/projects"><div><span>Project</span><FolderKanban size={16}/></div><strong>{projectCount?.toString().padStart(2,'0')??'—'}</strong><small>New + ongoing projects</small></a></div>}
{(view==='Overview'||view==='IT team')&&<section className="team-section"><div className="section-head"><div><h2>IT sections <span className="sub-count">{sections.length}</span></h2></div></div><div className="officer-grid">{sections.map(group=>{
 const officers=members(group);
 const stats=data.counts.sectionAlerts?.[group];
 const total=Number(stats?.active??officers.reduce((sum:number,o:any)=>sum+activeCount(o.id),0));
 const hasOverdue=!!stats?.earliest_due&&Date.parse(stats.earliest_due)<=Date.now();
 const needsAttention=total>50||hasOverdue;
 return <a key={group} className={'officer section-card'+(needsAttention?' section-alert':'')+(hasOverdue?' section-overdue':'')} title={needsAttention?[(total>50?'More than 50 active tickets':''),(hasOverdue?'Overdue ticket present':'')].filter(Boolean).join(' · '):undefined} href={(view==='IT team'?'#/team/':'#/sections/')+sectionSlug(group)}>
 <ArrowUpRight className="officer-arrow" size={14} aria-hidden="true"/>
 <h3>{group}</h3><p>{view==='IT team'?officers.length+' members':total+' active '+(total===1?'ticket':'tickets')}</p>
 </a>;
})}</div></section>}
{view==='IT team'&&data.me.manager===1&&<ManagerTransfer team={team.filter((o:any)=>o.id!==data.me.id)} onDone={load}/>}
{view!=='IT team'&&ticketTable}</>}
</>)}</div></main>{modalView}{success&&<div key={success.message} className="creation-success" role="status"><Check size={18}/>{success.message}</div>}</div>}
