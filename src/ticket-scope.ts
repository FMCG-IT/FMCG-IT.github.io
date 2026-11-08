export function assignedTo<T extends {assignee:string}>(tickets:T[],officerId:string):T[]{
 return tickets.filter(ticket=>ticket.assignee===officerId);
}
