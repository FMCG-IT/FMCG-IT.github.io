import {showSuccess} from './success-notice';
import DeleteItem from './delete-item';
import {useEffect,useState} from 'react';
import {offices} from './offices';
import {sections,sectionFor,type ITSection} from './it-sections';
import {teamLabel} from './team-assignment';
import PrioritySelect from './priority-select';
import {priorityLabel} from './operations';
import {ArrowLeft} from 'lucide-react';
import {readProjects,saveProject,readProjectHistory,type ProjectUpdate} from './backend';

const phases=['New project','Ongoing project','Completed'] as const;
const filters=['New project','Ongoing project','Completed','All projects'] as const;
const labels=['New project','Ongoing project','Completed projects','All projects'];
export type Project={
 office:string|null;team:ITSection|null;priority:string;description:string;
 approval_status?:'Approved'|'Pending';
 id:number; subject:string; created_by:string; creator_name:string; created_at:string;
 assignee:string; assignee_name:string; deadline:string; latest_update:string; status:typeof phases[number];
};
type Officer={id:string;name:string;specialty:string};
const projectLabel=(id:number)=>'PRJ-'+String(id).padStart(6,'0');
const createdDate=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dhaka',dateStyle:'medium',timeStyle:'short'});

export default function Projects({me,team}:{me:Officer&{manager:number};team:Officer[]}){
 const [projects,setProjects]=useState<Project[]>(),[filter,setFilter]=useState<typeof filters[number]>('All projects');
 const [updateDraft,setUpdateDraft]=useState('');
 const [formRevision,setFormRevision]=useState(0);
 const [selectedId,setSelectedId]=useState<number>();
 const [assignment,setAssignment]=useState({team:'' as ITSection|'',officer:''});
 const [editing,setEditing]=useState<Project|'new'>(),[error,setError]=useState(''),[formError,setFormError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{
  let active=true;
  void readProjects().then(rows=>{if(active){
   setProjects(rows);
   const id=location.hash.match(/^#\/projects\/(\d+)$/)?.[1];
   if(id){const match=rows.find(row=>String(row.id)===id);if(match)showProject(match);else setError('Project no longer exists.');}
  }}).catch((e:Error)=>{if(active)setError(e.message)});
  const refresh=()=>void readProjects().then(rows=>{if(active)setProjects(rows)}).catch(()=>{});
  window.addEventListener('desk-items-changed',refresh);
  return ()=>{active=false;window.removeEventListener('desk-items-changed',refresh);};
 },[]);
 const rows=projects?.filter(p=>filter==='All projects'||p.status===filter);
 useEffect(()=>{
  if(!projects?.some(p=>p.approval_status==='Pending'))return;
  let active=true;
  const refresh=()=>void readProjects().then(rows=>{if(active)setProjects(rows)}).catch(()=>{});
  const timer=setInterval(refresh,15000);
  return ()=>{active=false;clearInterval(timer);};
 },[projects]);
 const project=editing==='new'?undefined:editing;
 const selected=projects?.find(p=>p.id===selectedId);
 const [history,setHistory]=useState<{id:number;rows?:ProjectUpdate[];error?:string}>();
 const [historyRevision,setHistoryRevision]=useState(0);
 const historyProject=selected?.approval_status==='Pending'?undefined:selected?.id;
 useEffect(()=>{
  if(historyProject===undefined)return;
  let active=true;
  void readProjectHistory(historyProject).then(rows=>{if(active)setHistory({id:historyProject,rows});})
   .catch((error:Error)=>{if(active)setHistory({id:historyProject,error:error.message});});
  return ()=>{active=false;};
 },[historyProject,historyRevision]);
 const canEdit=(p:Project)=>p.approval_status!=='Pending'&&(me.manager===1||me.id===p.created_by||me.id===p.assignee);
 const open=(value:Project|'new')=>{
  const officer=value==='new'?'':value.assignee;
  const member=team.find(o=>o.id===officer);
  setAssignment({team:value==='new'?'':value.team??sectionFor(member?.specialty??''),officer});
  setFormError('');setUpdateDraft('');setDeadline(value==='new'?'':value.deadline);setEditing(value);setFormRevision(n=>n+1);
 };
 const showProject=(p:Project)=>{setSelectedId(p.id);setError('');if(canEdit(p))open(p);};
 const eligible=team.filter(o=>sectionFor(o.specialty)===assignment.team);
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const [deadline,setDeadline]=useState('');
 const projectForm=editing&&(<form key={formRevision} onSubmit={async e=>{
    e.preventDefault();
    if(busy)return;
    if(deadline<today&&deadline!==project?.deadline){setFormError('Project deadline must be today or later (BDT).');return;}
    const fields=Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);setFormError('');setError('');
    try{await saveProject({...fields,id:project?.id});}
    catch(err){setFormError(err instanceof Error?err.message:'Could not save project.');setBusy(false);return;}
    setUpdateDraft('');
    if(project)setHistoryRevision(value=>value+1);
    showSuccess(project?'Project updated successfully':'Project submitted for Manager approval');
    if(!project)setEditing(undefined);
    try{const updated=await readProjects();setProjects(updated);const saved=updated.find(row=>row.id===project?.id);if(saved)setEditing(saved);}
    catch(err){setError(err instanceof Error?err.message:'Could not reload projects.');}
    finally{setBusy(false);}
   }}>
    <label>Subject<input name="subject" defaultValue={project?.subject} required maxLength={200}/></label>
    <div className="form-row">
     <label>Office / area<select name="office" required={!project||!!project.office} defaultValue={project?.office??''}><option value="">Select office / area</option>{offices.map(office=><option key={office}>{office}</option>)}</select></label>
     <label>Team<select name="team" required value={assignment.team} onChange={e=>setAssignment({team:e.target.value as ITSection|'',officer:''})}><option value="">Select team</option>{sections.map(section=><option key={section} value={section}>{teamLabel(section)}</option>)}</select></label>
     <label>Assigned to<select name="assignee" required value={assignment.officer} onChange={e=>setAssignment({...assignment,officer:e.target.value})}><option value="">{!assignment.team?'Select a team first':eligible.length?'Select an officer':'No active officers'}</option>{project&&assignment.officer===project.assignee&&!team.some(o=>o.id===project.assignee)&&<option value={project.assignee}>{project.assignee_name}</option>}{eligible.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
     <label>Priority<PrioritySelect initial={project?.priority}/></label>
    </div>
    <label>Deadline (BDT)<input type="date" name="deadline" value={deadline} min={project?.deadline===deadline&&deadline<today?deadline:today} onChange={e=>setDeadline(e.target.value)} required/></label>
    {project&&<label>Status<select name="status" defaultValue={project.status}>{phases.map(phase=><option key={phase}>{phase}</option>)}</select></label>}
    {!project&&<label>Description<textarea name="description" required maxLength={10000} rows={3}/></label>}
    {project&&<label>Update<textarea name="latest_update" value={updateDraft} onChange={e=>setUpdateDraft(e.target.value)} maxLength={2000} rows={3}/></label>}
    {formError&&<p className="error" role="alert">{formError}</p>}
    <div className="work-actions"><button className="primary" disabled={busy}>Save project</button><button type="button" className="secondary" disabled={busy} onClick={()=>project?open(project):setEditing(undefined)}>{project?'Reset':'Cancel'}</button></div>
   </form>);
 return <div className="project-page">
  <div className="heading"><h1>{selected?'Project details':'Project'}</h1>{!selected&&<button className="primary" disabled={!projects} onClick={()=>open('new')}>Add project</button>}</div>
  {selectedId!==undefined&&!selected&&!error&&<p role="status">Project is no longer listed.</p>}
  {selected?<div className="project-detail">
   <button className="text-button" disabled={busy} onClick={()=>{setEditing(undefined);setSelectedId(undefined)}}><ArrowLeft size={16}/> Back to projects</button>
   <div className="detail-grid">
    <section className="panel"><div className="section-head"><span className="eyebrow">{projectLabel(selected.id)}</span><span className="badge">{selected.approval_status==='Pending'?'Pending approval':selected.status}</span></div>
     <h2>{selected.subject}</h2><p className="description">{selected.description||'No additional description.'}</p>
     <div className="facts">
      <span>Office / area<b>{selected.office??'—'}</b></span><span>Team<b>{teamLabel(selected.team??sectionFor(team.find(o=>o.id===selected.assignee)?.specialty??''))}</b></span>
      <span>Assigned to<b>{selected.assignee_name}</b></span><span>Priority<b>{priorityLabel(selected.priority)}</b></span>
      <span>Created by<b>{selected.creator_name}</b></span><span>Created date (BDT)<b>{createdDate.format(new Date(selected.created_at))}</b></span>
      <span>Deadline (BDT)<b>{selected.deadline}</b></span>
     </div>
     <h3>Activity &amp; updates</h3>
     {selected.approval_status==='Pending'?<p className="muted">No updates yet.</p>:history?.id!==selected.id?<p role="status">Loading updates…</p>:history.error?<p className="error" role="alert">{history.error}</p>:history.rows?.length?history.rows.map(update=><article className="event" key={update.id}>
      <small>{update.author??'Saved update'}{update.created_at?' · '+createdDate.format(new Date(update.created_at))+' BDT':''}</small>
      <p>{update.body}</p>
     </article>):<p className="muted">No updates yet.</p>}
    </section>
    {selected.approval_status==='Pending'&&<section className="panel"><h3>Pending approval</h3><p>Update and status changes are available after Manager approval.</p></section>}
    {canEdit(selected)&&project?.id!==selected.id&&<section className="panel"><h3>Manage project</h3><button className="secondary" onClick={()=>open(selected)}>Edit project and status</button></section>}
    {canEdit(selected)&&project?.id===selected.id&&<section className="panel"><h3>Manage project</h3>{projectForm}<DeleteItem key={selected.id} kind="project" id={selected.id} manager={me.manager===1} onDelete={()=>{setProjects(previous=>previous?.filter(p=>p.id!==selected.id));setEditing(undefined);setSelectedId(undefined)}}/>{error&&<p className="error" role="alert">{error}</p>}</section>}
   </div>
  </div>:<>
  <div className="project-filters" aria-label="Filter projects">{filters.map((value,index)=><button key={value} className={filter===value?'primary':'secondary'} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{labels[index]}</button>)}</div>
  {error&&<p className="error" role="alert">{error}</p>}
  <section className="ticket-section project-table"><div className="table-scroll ticket-fit-region" tabIndex={0} role="region" aria-label="Projects"><table>
   <thead><tr>{['Project ID','Subject','Created by','Created date (BDT)','Assigned to','Deadline (BDT)','Update',...(filter==='All projects'?['Status']:[])].map(label=><th key={label} scope="col">{label}</th>)}</tr></thead>
   <tbody>{rows?.length?rows.map(p=><tr key={p.id} className="ticket-row" onClick={()=>showProject(p)}>
    <td className="ticket-id">{projectLabel(p.id)}</td>
    <td><button className="ticket-title" onClick={e=>{e.stopPropagation();showProject(p)}}>{p.subject}</button>{filter!=='All projects'&&p.approval_status==='Pending'&&<small>Pending approval</small>}</td>
    <td>{p.creator_name}</td><td><time dateTime={p.created_at}>{createdDate.format(new Date(p.created_at))}</time></td>
    <td>{p.assignee_name}</td><td><time dateTime={p.deadline}>{p.deadline}</time></td><td className="project-update">{p.latest_update||'—'}</td>
    {filter==='All projects'&&<td>{p.approval_status==='Pending'?'Pending approval':p.status}</td>}
   </tr>):<tr><td colSpan={filter==='All projects'?8:7}>{error?'Projects could not be loaded.':projects?'No projects in this view.':'Loading projects…'}</td></tr>}</tbody>
  </table></div></section></>}
  {!selected&&editing==='new'&&<div className="overlay"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="project-form-title">
   <h2 id="project-form-title">Add project</h2>
   {projectForm}
  </section></div>}
 </div>;
}
