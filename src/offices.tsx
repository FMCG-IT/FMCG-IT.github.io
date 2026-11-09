export const offices=['FMCG','Rangpur Area Office','Khulna Area Office','Kushtia Area Office','Mymensingh Area Office','Mymensing Pharma','32 Bigha Project'] as const;
export function OfficeFields({selected=[]}:{selected?:string[]}){
 return <fieldset className="office-fields"><legend>Responsible offices / areas — select one or more</legend>{offices.map(office=><label className="checkbox" key={office}><input type="checkbox" name="offices" value={office} defaultChecked={selected.includes(office)}/>{office}</label>)}</fieldset>;
}
