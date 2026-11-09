import {offices} from './offices';
import {useState} from 'react';
import {sections,sectionFor,type ITSection} from './it-sections';
export const teamLabel=(team:string)=>team==='Software/System'?'System/Software':team;
export default function TeamAssignment({officers,initialOfficer,initialTeam,initialOffice=''}:{officers:any[];initialOfficer?:string;initialTeam?:ITSection;initialOffice?:string}){
 const [office,setOffice]=useState(initialOffice);
 const [team,setTeam]=useState<ITSection>(()=>initialTeam??sectionFor(officers.find(o=>o.id===initialOfficer)?.specialty??'Software/System'));
 const [officer,setOfficer]=useState(initialOfficer??'');
 const available=officers.filter(o=>!o.archived&&sectionFor(o.specialty)===team&&office&&(o.offices??[]).includes(office));
 const selected=available.some(o=>o.id===officer)?officer:'';
 return <><label>Office / area<select name="office" required value={office} onChange={e=>{setOffice(e.target.value);setOfficer('')}}><option value="">Select office / area</option>{offices.map(o=><option key={o}>{o}</option>)}</select></label><label>Team<select name="team" value={team} onChange={e=>{setTeam(e.target.value as ITSection);setOfficer('')}}>{sections.map(s=><option key={s} value={s}>{teamLabel(s)}</option>)}</select></label><label>Assigned to<select name="assignee" required value={selected} onChange={e=>setOfficer(e.target.value)}><option value="">{!office?'Select an office first':available.length?'Select an officer':'No dedicated officers'}</option>{available.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select>{!available.length&&<small>Assign this office to an officer in the selected team from IT team first.</small>}</label></>;
}
