import {MobileContact} from './contact-mobile';
import {useEffect,useState} from 'react';
import {intakeQueue,readPasswordRequests,writeDesk,type IntakeTicket} from './backend';

export default function StaffRequest({id,kind}:{id:string;kind:'ticket'|'password'}){
 const [ticket,setTicket]=useState<IntakeTicket>();
 const [member,setMember]=useState<{id:string;name:string}>();
 const [loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{
  let active=true;
  const load=async()=>{
   try{
    if(kind==='ticket'){const rows=await intakeQueue();if(active)setTicket(rows.find(row=>String(row.id)===id));}
    else{const rows=await readPasswordRequests();if(active)setMember(rows.find(row=>row.id===id));}
   }catch(e){if(active)setError(e instanceof Error?e.message:'Could not load request.');}
   finally{if(active)setLoaded(true);}
  };
  void load();return ()=>{active=false;};
 },[id,kind]);
 const target=ticket??member;
 return <main className="content employee-portal">
  <a href="#/my">Back to IT Desk</a>
  <section className="panel">
   <h1>{kind==='ticket'?'Ticket details':'Password reset request'}</h1>
   {ticket&&<><h2>{ticket.subject}</h2><p className="description">{ticket.description}</p><div className="facts"><span>Created by<b>{ticket.employee}</b></span><span>Email<b>{ticket.email}</b></span>{ticket.contact_mobile&&<MobileContact number={ticket.contact_mobile}/>}<span>Team<b>{ticket.team}</b></span><span>Office / area<b>{ticket.office}</b></span></div></>}
   {member&&<h2>{member.name}</h2>}
   {!target&&!error&&<p>{loaded?'This request is no longer available.':'Loading request…'}</p>}
   {target&&!message&&<form onSubmit={async e=>{
    e.preventDefault();if(busy)return;
    const data=new FormData(e.currentTarget);
    setBusy(true);setError('');
    try{
     if(ticket)await intakeQueue(ticket.id,String(data.get('assignee')));
     else if(member)await writeDesk({action:'reset_password',officer:member.id,password:String(data.get('password'))});
     const result=ticket?'Ticket assigned successfully':'Password updated successfully';
     sessionStorage.setItem('desk-next-notice',result);location.hash='/my';setMessage(result);
    }catch(e){setError(e instanceof Error?e.message:'Could not save request.');}
    finally{setBusy(false);}
   }}>
    {ticket?<label>Assign to<select name="assignee" required defaultValue=""><option value="">{ticket.officers.length?'Select officer':'No officer covers this team and office'}</option>{ticket.officers.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>:
    <label>New password<input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required/></label>}
    <div className="form-submit-bar"><button className="primary" disabled={busy||!!ticket&&!ticket.officers.length}>{ticket?'Assign ticket':'Set new password'}</button></div>
   </form>}
   {error&&<p className="error" role="alert">{error}</p>}
  </section>
 </main>;
}
