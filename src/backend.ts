import {TICKET_FETCH_LIMIT} from './pagination';
import {createClient} from '@supabase/supabase-js';

const url=import.meta.env.VITE_SUPABASE_URL;
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase=url&&key?.startsWith('sb_publishable_')?
 createClient(url,key,{auth:{flowType:'pkce',detectSessionInUrl:false}}):null;
export const appUrl=()=>location.origin+location.pathname;
export const trackingUrl=(token:string)=>appUrl()+'#/track/'+encodeURIComponent(token);
export async function readDesk(){
 if(!supabase)throw Error('Supabase is not configured.');
 const {data,error}=await supabase.rpc('desk_bootstrap');
 if(error)throw Error(error.message);
 return data;
}
export async function writeDesk(payload:Record<string,unknown>){
 if(!supabase)throw Error('Supabase is not configured.');
 if(payload.action==='officer'){
  const {data,error}=await supabase.functions.invoke('manage-officers',{body:{name:payload.name,email:payload.email,password:payload.password,specialty:payload.specialty,designation:payload.designation,offices:payload.offices}});
  if(error){
   let message=error.message;
   if('context' in error && error.context instanceof Response){
    const detail=await error.context.json().catch(()=>null);
    if(detail?.error)message=detail.error;
   }
   throw Error(message);
  }
  if(data?.error)throw Error(data.error);
  return;
 }
 const {error}=await supabase.rpc('desk_write',{p:payload});
 if(error)throw Error(error.message);
}
export async function signOut(){await supabase?.auth.signOut();}

export async function readTickets(options:{search:string;status:string;assignee:string|null;section:string|null;priority:string|null;createdFrom:string|null;createdTo:string|null;sort:string},signal:AbortSignal){
 if(!supabase)throw Error('Supabase is not configured.');
 const items:any[]=[];
 const seen=new Set<string>();
 let offset=0;
 while(!signal.aborted){
  const {data,error}=await supabase.rpc('desk_ticket_list_filtered',{p_search:options.search,p_status:options.status==='All statuses'?null:options.status,p_assignee:options.assignee,p_section:options.section,p_offset:offset,p_limit:TICKET_FETCH_LIMIT,p_priority:options.priority,p_created_from:options.createdFrom,p_created_to:options.createdTo,p_sort:options.sort}).abortSignal(signal);
  if(error)throw Error(error.message);
  const batch=data as {items:any[];total:number};
  for(const item of batch.items){
   if(seen.has(item.id))continue;
   seen.add(item.id);
   items.push(item);
  }
  offset+=batch.items.length;
  if(batch.items.length===0||offset>=batch.total)break;
 }
 return items;
}
export async function readTicket(id:string){
 if(!supabase)throw Error('Supabase is not configured.');
 const {data,error}=await supabase.rpc('desk_ticket_detail',{p_id:id});
 if(error)throw Error(error.message);
 return data;
}
export async function readHistory(id:string,offset:number){
 if(!supabase)throw Error('Supabase is not configured.');
 const {data,error}=await supabase.rpc('desk_ticket_history',{p_id:id,p_offset:offset});
 if(error)throw Error(error.message);
 return data;
}
export async function readStorage(){
 if(!supabase)throw Error('Supabase is not configured.');
 const {data,error}=await supabase.rpc('desk_storage_usage');
 if(error)throw Error(error.message);
 return data;
}

export async function readReport(from:string|null,to:string|null,includeTickets=false){
 if(!supabase)throw Error('Supabase is not configured.');
 const {data,error}=await supabase.rpc('desk_report',{p_from:from,p_to:to,p_export:includeTickets});
 if(error)throw Error(error.message);
 return data as import('./report-types').TicketReportData;
}
export async function readNotifications(ticket:string|null=null,seenAt:string|null=null){
 if(!supabase)throw Error('Supabase is not configured.');
 const {data,error}=await supabase.rpc('desk_notifications',{p_ticket:ticket,p_seen_at:seenAt});
 if(error)throw Error(error.message);return data as {unread:number;items:{ticket:string;message:string;updated_at:string;read_at:string|null}[]};
}

async function deskRpc<T>(name:string,args?:Record<string,unknown>):Promise<T>{
 if(!supabase)throw Error('Supabase is not configured.');
 const {data,error}=await supabase.rpc(name,args);
 if(error)throw Error(error.message);
 return data as T;
}
export const readWorkSummary=()=>deskRpc<{today:string;count:number;approvals:number}>('desk_regular_work_summary');
export const readRegularWork=(from:string|null,to:string|null)=>deskRpc<import('./regular-work').WorkData>('desk_regular_work_read',{p_from:from,p_to:to});
export const writeRegularWork=(p:Record<string,unknown>)=>deskRpc<void>('desk_regular_work_write',{p});

export const readProjectCount=()=>deskRpc<number>('desk_projects',{p_count_only:true});
export const readProjects=()=>deskRpc<import('./projects').Project[]>('desk_projects');
export const saveProject=(p:Record<string,unknown>)=>deskRpc<void>('desk_save_project',{p});

export type DeleteRequest={id:string;kind:'ticket'|'project';subject:string;name:string;target:string};
export const readDeleteRequests=()=>deskRpc<DeleteRequest[]>('desk_delete_requests');
export const writeDeleteAction=(p:Record<string,unknown>)=>deskRpc<void>('desk_delete_action',{p});

export type DeleteResult=Pick<DeleteRequest,'id'|'kind'|'subject'>&{status:'Approved'|'Rejected'};
export const readDeleteResults=(id?:string)=>deskRpc<DeleteResult[]>('desk_delete_results',{p_read:id??null});

export type ProjectApproval={id:number;subject:string;creator:string;assignee:string;deadline:string;description:string;team:string;office:string;priority:string};
export const readProjectApprovals=(id?:number,approve?:boolean)=>deskRpc<ProjectApproval[]>('desk_project_approvals',{p_id:id??null,p_approve:approve??null});
