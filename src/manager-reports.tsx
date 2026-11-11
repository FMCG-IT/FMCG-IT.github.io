import {useEffect,useMemo,useState} from 'react';
import ReportsPanel from './reports-panel';
import {readRegularWork} from './backend';
import type {WorkData} from './regular-work';
type Officer={id:string;name:string;email:string;archived:boolean};
type Counts={total:number;done:number;missed:number;pending:number;approved:number;waiting:number};
type History=WorkData['history'][number];
function count(items:History[],today?:string):Counts{
 return items.reduce((s,t)=>({total:s.total+1,done:s.done+Number(t.completed),missed:s.missed+Number(!t.completed&&t.day!==today),pending:s.pending+Number(!t.completed&&t.day===today),approved:s.approved+Number(t.approved),waiting:s.waiting+Number(!t.completed&&t.request==='Pending')}),{total:0,done:0,missed:0,pending:0,approved:0,waiting:0});
}
const dateBDT=(offset:number)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+offset*86400000));
const rate=(s:Counts)=>s.total?((100*s.done/s.total).toFixed(1)+'%'):'—';
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
 const reportRows=useMemo(()=>{
  if(!data)return [];
  const past=data.history.filter(row=>row.day>=range.from&&row.day<=range.to);
  const today=data.today>=range.from&&data.today<=range.to?data.tasks.map(task=>({...task,day:data.today,request:null,reason:null})):[];
  return [...today,...past];
 },[data,range]);
 const byOfficer=useMemo(()=>{const groups=new Map<string,History[]>();for(const row of reportRows){const rows=groups.get(row.officer)??[];rows.push(row);groups.set(row.officer,rows)}return groups},[reportRows]);
 const rows=officer?byOfficer.get(officer.id)??[]:reportRows;
 const totals=count(rows,data?.today);
 return <section className="reports-panel"><h2>{officer?officer.name+' · Regular work report':'Regular work summary'}</h2>
 <form className="panel report-controls" onSubmit={e=>{e.preventDefault();setRange({from,to})}}><label>From — BDT<input type="date" required value={from} max={to} onChange={e=>setFrom(e.target.value)}/></label><label>To — BDT<input type="date" required value={to} min={from} max={dateBDT(0)} onChange={e=>setTo(e.target.value)}/></label><button className="primary" disabled={busy}>{busy?'Loading…':'Generate report'}</button></form>
 {error&&<p role="alert" className="error">{error}</p>}
 {data&&<><p className="muted report-scope">{range.from} → {range.to} · BDT</p><div className="report-summary">
 {([['Scheduled tasks',totals.total],['Completed',totals.done],['Pending today',totals.pending],['Not completed',totals.missed],['Completion rate',rate(totals)]]).map(([label,value])=><article key={label} className="panel"><span>{label}</span><strong>{value}</strong></article>)}</div>
 {officer?<section className="ticket-section report-officers"><div className="section-head"><h2>Daily work history</h2></div><div className="table-scroll"><table><thead><tr><th>DATE</th><th>TASK</th><th>STATUS</th><th>REASON</th></tr></thead><tbody>{rows.length?rows.map(t=><tr key={t.id+t.day}><td>{t.day}</td><td>{t.title}</td><td><b className={'work-status '+(t.completed?'work-done':t.day===data.today?'work-pending':'work-missed')}>{t.completed?'Completed':t.day===data.today?'Pending':'Not completed'}</b>{t.approved&&<small>Manager approved</small>}</td><td>{t.reason??'—'}{t.request&&<small>{t.request}</small>}</td></tr>):<tr><td colSpan={4}>No scheduled tasks in this range.</td></tr>}</tbody></table></div></section>:
 <section className="ticket-section report-officers"><div className="section-head"><h2>Officer performance</h2></div><div className="table-scroll"><table><thead><tr><th>OFFICER</th><th>SCHEDULED</th><th>COMPLETED</th><th>PENDING TODAY</th><th>NOT COMPLETED</th><th>COMPLETION RATE</th><th>APPROVED REASONS</th><th>AWAITING APPROVAL</th></tr></thead><tbody>{team.filter(o=>!o.archived||byOfficer.has(o.id)).map(o=>{const s=count(byOfficer.get(o.id)??[],data.today);return <tr key={o.id}><td>{o.name}{o.archived&&<small>Archived</small>}</td><td>{s.total}</td><td>{s.done}</td><td>{s.pending}</td><td>{s.missed}</td><td>{rate(s)}</td><td>{s.approved}</td><td>{s.waiting}</td></tr>})}</tbody></table></div></section>}</>}
 </section>;
}
export default function ManagerReports({team}:{team:Officer[]}){
 const [kind,setKind]=useState<'ticket'|'work'>(),[selected,setSelected]=useState<string>();
 const activeMembers=team.filter(o=>!o.archived);
 const officer=activeMembers.find(o=>o.id===selected);
 const showReport=selected==='summary'||!!officer;
 const switchKind=(value:'ticket'|'work')=>{if(value!==kind){setKind(value);setSelected(undefined)}};
 return <div className="manager-reports"><div className="report-choices" aria-label="Report type"><button className={kind==='ticket'?'primary':'secondary'} aria-pressed={kind==='ticket'} onClick={()=>switchKind('ticket')}>Ticket report</button><button className={kind==='work'?'primary':'secondary'} aria-pressed={kind==='work'} onClick={()=>switchKind('work')}>Regular work report</button></div>
 {kind&&<div className="report-layout"><aside className="panel report-picker" aria-label="Report selection"><h2>Members</h2><div className="report-member-list"><button className={selected==='summary'?'primary':'secondary'} aria-pressed={selected==='summary'} onClick={()=>setSelected('summary')}>Summary report</button>{activeMembers.map(o=><button title={o.email} key={o.id} className={selected===o.id?'primary':'secondary'} aria-pressed={selected===o.id} onClick={()=>setSelected(o.id)}>{o.name}</button>)}</div></aside>
 <div className="report-result">{showReport?(kind==='ticket'?<ReportsPanel officerId={officer?.id} officerName={officer?.name}/>:<RegularWorkReport officer={officer} team={team}/>):<p className="muted report-empty">Select a member or Summary report.</p>}</div></div>}</div>;
}
