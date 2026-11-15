import {useEffect,useState} from 'react';
import {employeeTickets,signOut,type EmployeeTicket} from './backend';
import {useOffices} from './offices';
import {sections} from './it-sections';
import {teamLabel} from './team-assignment';

export default function EmployeePortal(){
 const offices=useOffices();
 const [tickets,setTickets]=useState<EmployeeTicket[]>();
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{
  let active=true;
  const refresh=()=>void employeeTickets().then(rows=>{if(active)setTickets(rows);}).catch(e=>{if(active)setError(e.message);});
  refresh();const timer=setInterval(refresh,30000);
  return ()=>{active=false;clearInterval(timer);};
 },[]);
 useEffect(()=>{
  if(!notice)return;
  const timer=setTimeout(()=>setNotice(''),5000);
  return ()=>clearTimeout(timer);
 },[notice]);
 return <main className="content employee-portal">
  <header className="heading"><h1>IT Desk</h1><button className="secondary" onClick={()=>void signOut()}>Logout</button></header>
  <section className="panel"><h2>Create ticket</h2>
   <form onSubmit={async e=>{
    e.preventDefault();
    if(busy)return;
    const form=e.currentTarget;
    setBusy(true);setError('');setNotice('');
    try{setTickets(await employeeTickets(Object.fromEntries(new FormData(form))));form.reset();setNotice('Ticket submitted successfully');}
    catch(e){setError(e instanceof Error?e.message:'Could not submit ticket');}
    finally{setBusy(false);}
   }}>
    <label>Subject<input required name="subject" maxLength={200}/></label>
    <label>Description<textarea required name="description" rows={4} maxLength={10000}/></label>
    <div className="form-row">
     <label>Team<select name="team" required defaultValue=""><option value="">Select team</option>{sections.map(team=><option key={team} value={team}>{teamLabel(team)}</option>)}</select></label>
     <label>Office / area<select name="office" required defaultValue=""><option value="">Select office / area</option>{offices.map(office=><option key={office}>{office}</option>)}</select></label>
    </div>
    <button className="primary" disabled={busy}>Submit ticket</button>
   </form>
   {error&&<p className="error" role="alert">{error}</p>}
  </section>
  <section className="panel"><h2>My tickets</h2>
   {tickets?.length?tickets.map(ticket=><details className="event" key={ticket.id}>
    <summary>{ticket.ticket!==null?'IT-'+String(ticket.ticket).padStart(8,'0')+' · ':''}{ticket.subject} · {ticket.status}</summary>
    <p>{ticket.description}</p><small>{teamLabel(ticket.team)} · {ticket.office}</small>
    {ticket.updates.map(update=><article className="event" key={update.id}><small>{new Date(update.created).toLocaleString('en-GB',{timeZone:'Asia/Dhaka'})} BDT</small><p>{update.body}</p></article>)}
   </details>):<p>{tickets?'No tickets yet.':'Loading tickets…'}</p>}
  </section>
  {notice&&<div className="creation-success" role="status">{notice}</div>}
 </main>;
}
