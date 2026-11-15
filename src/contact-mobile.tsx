export function MobileField({initial}:{initial?:string}){
 return <label>Contact mobile number <small>(optional)</small>
  <input type="tel" name="contact_mobile" autoComplete="tel" maxLength={30} defaultValue={initial} placeholder="e.g. 01XXXXXXXXX"/>
 </label>;
}

export function MobileContact({number}:{number:string}){
 return <span>Contact mobile number<b><a href={'tel:'+number.replace(/[^+0-9]/g,'')}>{number}</a></b></span>;
}
