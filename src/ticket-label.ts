export function ticketLabel(ticket:{id:string;ticket_number?:number|string|null}):string{
 const number=Number(ticket.ticket_number);
 return Number.isInteger(number)&&number>=1&&number<=99999999?
  'IT-'+String(number).padStart(8,'0'):ticket.id;
}
