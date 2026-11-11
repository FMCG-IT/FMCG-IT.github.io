import {useEffect,useState,type FormEvent} from 'react';
import {Download,BarChart3} from 'lucide-react';
import {readReport} from './backend';
import type {TicketReportData} from './report-types';

const today=()=>{
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const part=(name:string)=>parts.find(p=>p.type===name)!.value;
 return part('year')+'-'+part('month')+'-'+part('day');
};
export const hours=(value:number|null)=>value===null?'Not recorded':Number(value).toLocaleString('en-GB',{maximumFractionDigits:2})+' h';
const dateTime=(value:string)=>new Date(value).toLocaleString('en-GB',{timeZone:'Asia/Dhaka'});
export default function ReportsPanel({officerId,officerName}:{officerId?:string;officerName?:string}){
 const [from,setFrom]=useState(()=>today().slice(0,7)+'-01'),[to,setTo]=useState(today);
 const [report,setReport]=useState<TicketReportData>(),[busy,setBusy]=useState(true),[exporting,setExporting]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;void readReport(from,to).then(value=>{if(active)setReport(value)}).catch((e:Error)=>{if(active)setError(e.message)}).finally(()=>{if(active)setBusy(false)});return ()=>{active=false};},[]);
 async function generate(event:FormEvent){
  event.preventDefault();if(busy||exporting)return;
  if(from&&to&&from>to){setError('From date must be before or equal to to date.');return;}
  setBusy(true);setError('');
  try{setReport(await readReport(from||null,to||null))}catch(e){setError(e instanceof Error?e.message:'Could not generate the report.')}finally{setBusy(false)}
 }
 async function download(){
  if(!report||busy||exporting)return;
  setExporting(true);setError('');
  try{
   const snapshot=await readReport(report.from,report.to,true);
   const {downloadReport}=await import('./report-export');
   await downloadReport(snapshot);
   setReport({...snapshot,tickets:[]});
  }catch(e){setError(e instanceof Error?e.message:'Could not export the report.')}finally{setExporting(false)}
 }
 const summary=report?.summary;
 const officer=report?.officers.find(o=>o.id===officerId);
 return <section className="reports-panel">
 {officerName&&<h2>{officerName} · Ticket report</h2>}
 <form className="panel report-controls" onSubmit={generate}><label>Tickets created from — BDT<input type="date" value={from} max={to||undefined} disabled={busy||exporting} onChange={e=>setFrom(e.target.value)}/></label><label>Created to — BDT<input type="date" value={to} min={from||undefined} disabled={busy||exporting} onChange={e=>setTo(e.target.value)}/></label>
 <button className="primary" disabled={busy||exporting}><BarChart3 size={16}/>{busy?'Generating…':'Generate report'}</button>{!officerId&&<button className="secondary" type="button" disabled={!report||busy||exporting} onClick={()=>void download()}><Download size={16}/>{exporting?'Exporting…':'Export Excel'}</button>}</form>
 {error&&<p role="alert" className="error">{error}</p>}
 {report&&summary&&<><p className="muted report-scope">Tickets created: <b>{report.from??'All dates'} → {report.to??'All dates'}</b> · Snapshot: {dateTime(report.generated_at)}</p>
 <div className="report-summary">{officerId?<>{[['Created',officer?.created_count],['Worked',officer?.worked_count],['Assigned now',officer?.assigned_count],['Closed',officer?.closed_count]].map(([label,value])=><article className="panel" key={label}><span>{label}</span><strong>{value??0}</strong></article>)}</>:<>
  <article className="panel"><span>Total tickets</span><strong>{summary.total}</strong><small>{summary.new_count} new · {summary.progress_count} in progress</small></article>
  <article className="panel"><span>Closed</span><strong>{summary.closed_count}</strong><small>{summary.total?((summary.closed_count/summary.total)*100).toFixed(1)+'% of selected tickets':'No tickets in this range'}</small></article>
  <article className="panel"><span>Average response time</span><strong>{hours(summary.average_response_hours)}</strong><small>{summary.response_samples} measured tickets</small></article>
  <article className="panel"><span>Average closing time</span><strong>{hours(summary.average_closing_hours)}</strong><small>{summary.closing_samples} measured closed tickets</small></article>
 </>}</div>
 <section className="ticket-section report-officers"><div className="section-head"><h2>Officer performance</h2></div><div className="table-scroll"><table><thead><tr><th>OFFICER</th><th>CREATED</th><th>WORKED</th><th>ASSIGNED NOW</th><th>CLOSED</th><th>AVG RESPONSE</th><th>AVG CLOSING</th></tr></thead>
 <tbody>{officerId&&!officer&&<tr><td colSpan={7}>No recorded activity in this range.</td></tr>}{report.officers.filter(o=>!officerId||o.id===officerId).map(officer=><tr key={officer.id}><td>{officer.name}<small>{officer.designation} · {officer.section}{officer.archived?' · Archived':''}</small><small>{officer.email}</small></td><td>{officer.created_count}</td><td>{officer.worked_count}</td><td>{officer.assigned_count}</td><td>{officer.closed_count}</td><td>{hours(officer.average_response_hours)}<small>{officer.response_samples} measured</small></td><td>{hours(officer.average_closing_hours)}<small>{officer.closing_samples} measured</small></td></tr>)}</tbody></table></div></section>

 </>}
 </section>;
}
