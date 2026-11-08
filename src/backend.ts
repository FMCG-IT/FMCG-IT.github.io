import {createClient} from '@supabase/supabase-js';

const url=import.meta.env.VITE_SUPABASE_URL;
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase=url&&key?.startsWith('sb_publishable_')?
 createClient(url,key,{auth:{flowType:'pkce',detectSessionInUrl:false}}):null;
export const appUrl=()=>location.origin+location.pathname;
export const trackingUrl=(token:string)=>appUrl()+'#/track/'+encodeURIComponent(token);
export async function readDesk(){
 if(!supabase)throw Error('Supabase is not configured.');
 const {data,error}=await supabase.rpc('desk_read');
 if(error)throw Error(error.message);
 return data;
}
export async function writeDesk(payload:Record<string,unknown>){
 if(!supabase)throw Error('Supabase is not configured.');
 const {error}=await supabase.rpc('desk_write',{p:payload});
 if(error)throw Error(error.message);
}
export async function signOut(){await supabase?.auth.signOut();}
