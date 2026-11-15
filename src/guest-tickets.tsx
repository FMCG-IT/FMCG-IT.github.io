import {useEffect,useState} from 'react';
import {supabase,appUrl} from './backend';
import {offices} from './offices';
import {sections} from './it-sections';
import {teamLabel} from './team-assignment';

export default function GuestTickets({token}:{token?:string}){
 const [key,setKey]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [ticket,setTicket]=useState<{subject:string;status:string;updates:{id:string;body:string}[]}|null>();
 useEffect(()=>{
  if(!token||!supabase)return;
  let active=true;
  void supabase.rpc('desk_guest_ticket',{p_key:token}).then(({data,error})=>{
   if(active){if(error)setError('Could not open this ticket.');else setTicket(data);}
  });
  return ()=>{active=false;};
 },[token]);
 return <main className="content employee-portal">
  <a href="#/">Back to sign in</a>
  <section className="panel"><h1>{token?'Track ticket':'Submit a ticket'}</h1>
   {token?(ticket?<><h2>{ticket.subject}</h2><p>{ticket.status}</p>{ticket.updates.map(update=><article className="event" key={update.id}><p>{update.body}</p></article>)}</>:!error&&<p>{ticket===null?'Ticket unavailable.':'Loading ticket…'}</p>):key?<><p role="status">Ticket submitted successfully.</p><p>Save this private link to follow your ticket.</p><a href={appUrl()+'#/request/'+key}>{appUrl()+'#/request/'+key}</a></>:<form onSubmit={async e=>{
    e.preventDefault();if(busy||!supabase)return;
    const p=Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);setError('');
    try{const {data,error}=await supabase.rpc('desk_submit_guest_ticket',{p});if(error)throw error;setKey(data);}
    catch{setError('Could not submit the ticket. Check the form and try again.');}
    finally{setBusy(false);}
   }}>
    <label>Name<input name="name" required maxLength={200} autoComplete="name"/></label>
    <label>Email<input name="email" type="email" required maxLength={254} autoComplete="email"/></label>
    <label>Subject<input name="subject" required maxLength={200}/></label>
    <label>Description<textarea name="description" required maxLength={10000} rows={4}/></label>
    <label>Team<select name="team" required defaultValue=""><option value="">Select team</option>{sections.map(team=><option key={team} value={team}>{teamLabel(team)}</option>)}</select></label>
    <label>Office / area<select name="office" required defaultValue=""><option value="">Select office / area</option>{offices.map(office=><option key={office}>{office}</option>)}</select></label>
    <button className="primary" disabled={busy}>Submit ticket</button>
   </form>}
   {error&&<p className="error" role="alert">{error}</p>}
  </section>
 </main>;
}
