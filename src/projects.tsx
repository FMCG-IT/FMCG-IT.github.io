import {useEffect,useState} from 'react';
import {offices} from './offices';
import {sections,sectionFor,type ITSection} from './it-sections';
import {teamLabel} from './team-assignment';
import PrioritySelect from './priority-select';
import {priorityLabel} from './operations';
import {ArrowLeft,Pencil} from 'lucide-react';
import {readProjects,saveProject} from './backend';

const phases=['New project','Ongoing project','Completed'] as const;
const filters=['New project','Ongoing project','Completed','All projects'] as const;
const labels=['New project','Ongoing project','Completed projects','All projects'];
export type Project={
 office:string|null;team:ITSection|null;priority:string;description:string;
 id:number; subject:string; created_by:string; creator_name:string; created_at:string;
 assignee:string; assignee_name:string; deadline:string; latest_update:string; status:typeof phases[number];
};
type Officer={id:string;name:string;specialty:string};
const projectLabel=(id:number)=>'PRJ-'+String(id).padStart(6,'0');
const createdDate=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dhaka',dateStyle:'medium',timeStyle:'short'});

export default function Projects({me,team}:{me:Officer&{manager:number};team:Officer[]}){
 const [projects,setProjects]=useState<Project[]>(),[filter,setFilter]=useState<typeof filters[number]>('All projects');
 const [selectedId,setSelectedId]=useState<number>();
 const [assignment,setAssignment]=useState({team:'' as ITSection|'',officer:''});
 const [editing,setEditing]=useState<Project|'new'>(),[error,setError]=useState(''),[formError,setFormError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{
  let active=true;
  void readProjects().then(rows=>{if(active)setProjects(rows)}).catch((e:Error)=>{if(active)setError(e.message)});
  return ()=>{active=false};
 },[]);
 const rows=projects?.filter(p=>filter==='All projects'||p.status===filter);
 const project=editing==='new'?undefined:editing;
 const selected=projects?.find(p=>p.id===selectedId);
 const canEdit=(p:Project)=>me.manager===1||me.id===p.created_by||me.id===p.assignee;
 const open=(value:Project|'new')=>{
  const officer=value==='new'?'':value.assignee;
  const member=team.find(o=>o.id===officer);
  setAssignment({team:value==='new'?'':value.team??sectionFor(member?.specialty??''),officer});
  setFormError('');setEditing(value);
 };
 const eligible=team.filter(o=>sectionFor(o.specialty)===assignment.team);
 return <div className="project-page">
  <div className="heading"><h1>{selected?'Project details':'Project'}</h1>{!selected&&<button className="primary" disabled={!projects} onClick={()=>open('new')}>Add project</button>}</div>
  {selected?<div className="project-detail">
   <button className="text-button" onClick={()=>setSelectedId(undefined)}><ArrowLeft size={16}/> Back to projects</button>
   <div className="detail-grid">
    <section className="panel"><div className="section-head"><span className="eyebrow">{projectLabel(selected.id)}</span><span className="badge">{selected.status}</span></div>
     <h2>{selected.subject}</h2><p className="description">{selected.description||'No additional description.'}</p>
     <div className="facts">
      <span>Office / area<b>{selected.office??'—'}</b></span><span>Team<b>{teamLabel(selected.team??sectionFor(team.find(o=>o.id===selected.assignee)?.specialty??''))}</b></span>
      <span>Assigned to<b>{selected.assignee_name}</b></span><span>Priority<b>{priorityLabel(selected.priority)}</b></span>
      <span>Created by<b>{selected.creator_name}</b></span><span>Created date (BDT)<b>{createdDate.format(new Date(selected.created_at))}</b></span>
      <span>Deadline (BDT)<b>{selected.deadline}</b></span>
     </div>
     <h3>Latest update</h3><p className="description">{selected.latest_update||'No updates yet.'}</p>
    </section>
    {canEdit(selected)&&<section className="panel"><h3>Manage project</h3><button className="secondary" onClick={()=>open(selected)}><Pencil size={14}/> Edit project and status</button></section>}
   </div>
  </div>:<>
  <div className="project-filters" aria-label="Filter projects">{filters.map((value,index)=><button key={value} className={filter===value?'primary':'secondary'} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{labels[index]}</button>)}</div>
  {error&&<p className="error" role="alert">{error}</p>}
  <section className="ticket-section project-table"><div className="table-scroll ticket-fit-region" tabIndex={0} role="region" aria-label="Projects"><table>
   <thead><tr>{['Project ID','Subject','Created by','Created date (BDT)','Assigned to','Deadline (BDT)','Update',...(filter==='All projects'?['Status']:[])].map(label=><th key={label} scope="col">{label}</th>)}</tr></thead>
   <tbody>{rows?.length?rows.map(p=><tr key={p.id} className="ticket-row" onClick={()=>setSelectedId(p.id)}>
    <td className="ticket-id">{projectLabel(p.id)}</td>
    <td><button className="ticket-title" onClick={e=>{e.stopPropagation();setSelectedId(p.id)}}>{p.subject}</button></td>
    <td>{p.creator_name}</td><td><time dateTime={p.created_at}>{createdDate.format(new Date(p.created_at))}</time></td>
    <td>{p.assignee_name}</td><td><time dateTime={p.deadline}>{p.deadline}</time></td><td className="project-update">{p.latest_update||'—'}</td>
    {filter==='All projects'&&<td>{p.status}</td>}
   </tr>):<tr><td colSpan={filter==='All projects'?8:7}>{error?'Projects could not be loaded.':projects?'No projects in this view.':'Loading projects…'}</td></tr>}</tbody>
  </table></div></section></>}
  {editing&&<div className="overlay"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="project-form-title">
   <h2 id="project-form-title">{project?'Update project':'Add project'}</h2>
   <form onSubmit={async e=>{
    e.preventDefault();
    const fields=Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);setFormError('');setError('');
    try{await saveProject({...fields,id:project?.id});}
    catch(err){setFormError(err instanceof Error?err.message:'Could not save project.');setBusy(false);return;}
    setEditing(undefined);
    try{setProjects(await readProjects());}
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
    <label>Deadline (BDT)<input type="date" name="deadline" defaultValue={project?.deadline} required/></label>
    {project&&<label>Status<select name="status" defaultValue={project.status}>{phases.map(phase=><option key={phase}>{phase}</option>)}</select></label>}
    <label>Description<textarea name="description" defaultValue={project?.description} maxLength={10000} rows={3}/></label>
    <label>Update<textarea name="latest_update" defaultValue={project?.latest_update} maxLength={2000} rows={3}/></label>
    {formError&&<p className="error" role="alert">{formError}</p>}
    <div className="work-actions"><button className="primary" disabled={busy}>Save project</button><button type="button" className="secondary" disabled={busy} onClick={()=>setEditing(undefined)}>Cancel</button></div>
   </form>
  </section></div>}
 </div>;
}
