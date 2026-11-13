import {readProjects} from './backend';
import type {Project} from './projects';
import {useEffect,useMemo,useState} from 'react';
import ReportsPanel from './reports-panel';
import {readRegularWork} from './backend';
import {type ScheduledWork,type WorkData} from './regular-work';
type Officer={id:string;name:string;email:string;archived:boolean};
type Counts={total:number;done:number;missed:number;pending:number;approved:number;waiting:number};
type History=WorkData['history'][number]&Partial<Pick<ScheduledWork,'deadline'|'repeat_months'|'completed_at'>>;
function count(items:History[],today?:string):Counts{
 return items.reduce((s,t)=>({total:s.total+1,done:s.done+Number(t.completed),missed:s.missed+Number(!t.completed&&(t.deadline??t.day)<(today??'')),pending:s.pending+Number(!t.completed&&(t.deadline??t.day)>=(today??'')),approved:s.approved+Number(t.approved),waiting:s.waiting+Number(!t.completed&&t.request==='Pending')}),{total:0,done:0,missed:0,pending:0,approved:0,waiting:0});
}
const dateBDT=(offset:number)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+offset*86400000));
const rate=(s:Counts)=>s.total?((100*s.done/s.total).toFixed(1)+'%'):'—';
function OfficerPerformance({columns,rows}:{columns:string[];rows:{id:string;name:string;values:(string|number)[]}[]}){
 return <section className="ticket-section report-officers"><div className="section-head"><h2>Officer performance</h2></div>
  <div className="table-scroll" tabIndex={0} role="region" aria-label="Officer performance"><table>
   <thead><tr><th scope="col">Officer</th>{columns.map(label=><th key={label} scope="col">{label}</th>)}</tr></thead>
   <tbody>{rows.map(row=><tr key={row.id}><td>{row.name}</td>{row.values.map((value,index)=><td key={columns[index]}>{value}</td>)}</tr>)}</tbody>
  </table></div>
 </section>;
}
function RegularWorkReport({officer,team}:{officer?:Officer;team:Officer[]}){
 const [from,setFrom]=useState(()=>dateBDT(-7)),[to,setTo]=useState(()=>dateBDT(0));
 const [range,setRange]=useState(()=>({from,to})),[data,setData]=useState<WorkData>(),[busy,setBusy]=useState(true),[error,setError]=useState('');
 useEffect(()=>{
  let active=true,revision=0;setBusy(true);setError('');setData(undefined);
  const load=()=>{const request=++revision;const yesterday=dateBDT(-1);
   // The existing RPC returns past history and today’s checklist separately.
   const from=range.from>yesterday?yesterday:range.from;
   void readRegularWork(from,range.to).then(result=>{if(active&&request===revision){setData(result);setError('')}})
    .catch((e:Error)=>{if(active&&request===revision)setError(e.message)}).finally(()=>{if(active&&request===revision)setBusy(false)});
  };
  load();const timer=setInterval(load,30000);window.addEventListener('focus',load);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',load)};
 },[range]);
 const reportRows=useMemo<History[]>(()=>{
  if(!data)return [];
  const past=data.history.filter(row=>row.day>=range.from&&row.day<=range.to);
  const today=data.today>=range.from&&data.today<=range.to?data.tasks.map(task=>({...task,day:data.today,request:null,reason:null})):[];
  const scheduled=(data.scheduledHistory??[]).filter(row=>row.day>=range.from&&row.day<=range.to);
  return [...today,...past,...scheduled].sort((a,b)=>b.day.localeCompare(a.day));
 },[data,range]);
 const byOfficer=useMemo(()=>{const groups=new Map<string,History[]>();for(const row of reportRows){const rows=groups.get(row.officer)??[];rows.push(row);groups.set(row.officer,rows)}return groups},[reportRows]);
 const rows=officer?byOfficer.get(officer.id)??[]:reportRows;
 const totals=count(rows,data?.today);
 return <section className="reports-panel"><h2>{officer?officer.name+' · Regular work report':'Regular work summary'}</h2>
 <form className="panel report-controls" onSubmit={e=>{e.preventDefault();setRange({from,to})}}><label>From — BDT<input type="date" required value={from} max={to} onChange={e=>setFrom(e.target.value)}/></label><label>To — BDT<input type="date" required value={to} min={from} max={dateBDT(0)} onChange={e=>setTo(e.target.value)}/></label><button className="primary" disabled={busy}>{busy?'Loading…':'Generate report'}</button></form>
 {error&&<p role="alert" className="error">{error}</p>}
 {data&&<><p className="muted report-scope">{range.from} → {range.to} · BDT</p><div className="report-summary">
 {([['Scheduled tasks',totals.total],['Completed',totals.done],['Pending',totals.pending],['Not completed',totals.missed],['Completion rate',rate(totals)]]).map(([label,value])=><article key={label} className="panel"><span>{label}</span><strong>{value}</strong></article>)}</div>
 <OfficerPerformance columns={['Scheduled','Completed','Pending','Not completed','Completion rate']} rows={(officer?[officer]:team.filter(o=>!o.archived||byOfficer.has(o.id))).map(o=>{
  const stats=count(byOfficer.get(o.id)??[],data.today);
  return {id:o.id,name:o.name,values:[stats.total,stats.done,stats.pending,stats.missed,rate(stats)]};
 })}/>
 </>}
 </section>;
}
function MemberProjectReport({officer,team}:{officer?:Officer;team:Officer[]}){
 const [dates,setDates]=useState({from:'',to:''});
 const [range,setRange]=useState(dates);
 const dateFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'});
 const [projects,setProjects]=useState<Project[]>();
 const [error,setError]=useState('');
 useEffect(()=>{
  let active=true;
  const refresh=()=>void readProjects().then(rows=>{if(active){setProjects(rows);setError('');}}).catch((e:Error)=>{if(active)setError(e.message);});
  refresh();const timer=setInterval(refresh,30000);
  return ()=>{active=false;clearInterval(timer);};
 },[]);
 const status=(p:Project)=>p.approval_status==='Pending'?'Pending approval':p.status;
 const rows=projects?.filter(p=>{
  const day=dateFormat.format(new Date(p.created_at));
  return (!officer||p.assignee===officer.id)&&(!range.from||day>=range.from)&&(!range.to||day<=range.to);
 });
 const metricsFor=(items:Project[])=>[
  ['Total projects',items.length],
  ...['Pending approval','New project','Ongoing project','Completed'].map(label=>[label,items.filter(p=>status(p)===label).length]),
  ['Overdue',items.filter(p=>p.approval_status!=='Pending'&&p.status!=='Completed'&&p.deadline<dateBDT(0)).length],
 ] as [string,number][];
 const metrics=metricsFor(rows??[]);
 return <section className="reports-panel"><h2>{officer?officer.name+' · Project report':'Project summary'}</h2>
  <form className="panel report-controls" onSubmit={e=>{e.preventDefault();setRange({...dates});}}>
   <label>Projects created from — BDT<input type="date" max={dates.to||undefined} value={dates.from} onChange={e=>setDates({...dates,from:e.target.value})}/></label>
   <label>Created to — BDT<input type="date" min={dates.from||undefined} value={dates.to} onChange={e=>setDates({...dates,to:e.target.value})}/></label>
   <button className="primary" disabled={!projects}>Generate report</button>
  </form>
  {projects&&<><p className="muted report-scope">{range.from||range.to?`Projects created: ${range.from||'Any start date'} → ${range.to||'Any end date'} · BDT`:'All creation dates'}</p><div className="report-summary">{metrics.map(([label,value])=><article key={label} className="panel"><span>{label}</span><strong>{value}</strong></article>)}</div>
  <OfficerPerformance columns={metrics.map(([label])=>label)} rows={(officer?[officer]:team.filter(o=>!o.archived||rows?.some(p=>p.assignee===o.id))).map(o=>({
   id:o.id,name:o.name,values:metricsFor(rows?.filter(p=>p.assignee===o.id)??[]).map(([,value])=>value),
  }))}/>
  </>}
  {error&&<p role="alert" className="error">{error}</p>}

 </section>;
}
export default function ManagerReports({team}:{team:Officer[]}){
 const [kind,setKind]=useState<'ticket'|'work'|'project'>(),[selected,setSelected]=useState<string>();
 const activeMembers=team.filter(o=>!o.archived);
 const officer=activeMembers.find(o=>o.id===selected);
 const showReport=selected==='summary'||!!officer;
 const switchKind=(value:'ticket'|'work'|'project')=>{if(value!==kind){setKind(value);setSelected(undefined)}};
 return <div className="manager-reports"><div className="report-layout"><div className="report-navigation"><div className="report-choices" aria-label="Report type"><button className={kind==='ticket'?'primary':'secondary'} aria-pressed={kind==='ticket'} onClick={()=>switchKind('ticket')}>Ticket report</button><button className={kind==='work'?'primary':'secondary'} aria-pressed={kind==='work'} onClick={()=>switchKind('work')}>Regular work report</button><button className={kind==='project'?'primary':'secondary'} aria-pressed={kind==='project'} onClick={()=>switchKind('project')}>Project report</button></div>
 {kind&&<aside className="panel report-picker" aria-label="Report selection"><h2>Members</h2><div className="report-member-list"><button className={selected==='summary'?'primary':'secondary'} aria-pressed={selected==='summary'} onClick={()=>setSelected('summary')}>Summary report</button>{activeMembers.map(o=><button title={o.email} key={o.id} className={selected===o.id?'primary':'secondary'} aria-pressed={selected===o.id} onClick={()=>setSelected(o.id)}>{o.name}</button>)}</div></aside>}</div>
 {kind&&<div className="report-result">{showReport?(kind==='ticket'?<ReportsPanel officerId={officer?.id} officerName={officer?.name}/>:kind==='project'?<MemberProjectReport key={officer?.id??'summary'} officer={officer} team={team}/>:<RegularWorkReport officer={officer} team={team}/>):<p className="muted report-empty">Select a member or Summary report.</p>}</div>}</div></div>;
}
