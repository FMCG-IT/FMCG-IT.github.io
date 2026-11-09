import {useState} from 'react';
import {priorityLabel} from './operations';
export default function PrioritySelect({initial='Medium'}:{initial?:string}){
 const [value,setValue]=useState(initial);
 return <select name="priority" className={'priority-select tone-'+value.toLowerCase()} value={value} onChange={e=>setValue(e.target.value)}>{['Low','Medium','High','Critical'].map(p=><option className={'tone-'+p.toLowerCase()} key={p} value={p}>{priorityLabel(p)}</option>)}</select>;
}
