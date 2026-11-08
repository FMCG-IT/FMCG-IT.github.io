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
  const {data,error}=await supabase.functions.invoke('manage-officers',{body:{name:payload.name,email:payload.email,password:payload.password,specialty:payload.specialty,designation:payload.designation}});
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

export async function readTickets(options:{search:string;status:string;assignee:string|null;section:string|null;page:number}){
 if(!supabase)throw Error('Supabase is not configured.');
 const {data,error}=await supabase.rpc('desk_ticket_list',{p_search:options.search,p_status:options.status==='All statuses'?null:options.status,p_assignee:options.assignee,p_section:options.section,p_offset:options.page*25,p_limit:25});
 if(error)throw Error(error.message);
 return data as {items:any[];total:number};
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
