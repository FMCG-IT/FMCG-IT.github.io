import {useEffect,useState} from 'react';
import {readCoverageAreas} from './backend';
const defaultOffices=['FMCG','Rangpur Area Office','Khulna Area Office','Kushtia Area Office','Mymensingh Area Office','Mymensing Pharma','32 Bigha Project'] as const;
export function useOffices(){
 const [offices,setOffices]=useState<readonly string[]>(defaultOffices);
 useEffect(()=>{
  let active=true;
  const refresh=()=>void readCoverageAreas().then(rows=>{if(active)setOffices(rows);}).catch(()=>{});
  refresh();window.addEventListener('desk-areas-changed',refresh);
  return ()=>{active=false;window.removeEventListener('desk-areas-changed',refresh);};
 },[]);
 return offices;
}
export function OfficeFields({selected=[]}:{selected?:string[]}){
 const offices=useOffices();
 return <fieldset className="office-fields"><legend>Responsible offices / areas — select one or more</legend>{offices.map(office=><label className="checkbox" key={office}><input type="checkbox" name="offices" value={office} defaultChecked={selected.includes(office)}/>{office}</label>)}</fieldset>;
}
