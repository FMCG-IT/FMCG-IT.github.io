export const sortableColumns=[
 {key:'number',label:'TICKET ID',first:'desc'},
 {key:'title',label:'TICKET / ISSUE',first:'asc'},
 {key:'creator',label:'CREATED BY',first:'asc'},
 {key:'assignee',label:'ASSIGNED TO',first:'asc'},
 {key:'priority',label:'PRIORITY',first:'desc'},
 {key:'status',label:'STATUS',first:'asc'},
 {key:'updated',label:'LAST UPDATE TIME (BDT)',first:'desc'},
 {key:'comment',label:'LAST UPDATE COMMENT',first:'asc'},
] as const;
export function nextTicketSort(current:string,key:string,first:string){return current===key+'_asc'?key+'_desc':current===key+'_desc'?key+'_asc':key+'_'+first;}
