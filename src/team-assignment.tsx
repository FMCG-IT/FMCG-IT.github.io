import {useState} from 'react';
import {sections,sectionFor,type ITSection} from './it-sections';
export const teamLabel=(team:string)=>team==='Software/System'?'System/Software':team;
export default function TeamAssignment({officers,initialOfficer,initialTeam}:{officers:any[];initialOfficer?:string;initialTeam?:ITSection}){
 const [team,setTeam]=useState<ITSection>(()=>initialTeam??sectionFor(officers.find(o=>o.id===initialOfficer)?.specialty??'Software/System'));
 const [officer,setOfficer]=useState(initialOfficer??'');
 const available=officers.filter(o=>!o.archived&&sectionFor(o.specialty)===team);
 const selected=available.some(o=>o.id===officer)?officer:'';
 return <><label>Team<select name="team" value={team} onChange={e=>{setTeam(e.target.value as ITSection);setOfficer('')}}>{sections.map(s=><option key={s} value={s}>{teamLabel(s)}</option>)}</select></label><label>Assigned to<select name="assignee" required value={selected} onChange={e=>setOfficer(e.target.value)}><option value="">{available.length?'Select an officer':'No officers in this team'}</option>{available.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select>{!available.length&&<small>Add an officer to this team from IT team first.</small>}</label></>;
}
