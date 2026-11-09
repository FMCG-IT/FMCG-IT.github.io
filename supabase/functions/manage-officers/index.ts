import {createClient} from 'npm:@supabase/supabase-js@2.119.0';

type Environment={SUPABASE_URL?:string;SUPABASE_ANON_KEY?:string;SUPABASE_SERVICE_ROLE_KEY?:string;SUPABASE_PUBLISHABLE_KEYS?:string;SUPABASE_SECRET_KEYS?:string;ALLOWED_ORIGIN?:string};
export function createHandler(env:Environment,clientFactory=createClient){
 const defaultKey=(json:string|undefined)=>{try{return JSON.parse(json??'{}').default as string|undefined}catch{return undefined}};
 const publicKey=defaultKey(env.SUPABASE_PUBLISHABLE_KEYS)??env.SUPABASE_ANON_KEY;
 const secretKey=defaultKey(env.SUPABASE_SECRET_KEYS)??env.SUPABASE_SERVICE_ROLE_KEY;
 const allowedOrigin=env.ALLOWED_ORIGIN??'https://fmcg-it.github.io';
 const cors={'Access-Control-Allow-Origin':allowedOrigin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Cache-Control':'no-store'};
 const reply=(status:number,body:Record<string,unknown>)=>Response.json(body,{status,headers:cors});
 return async(request:Request):Promise<Response>=>{
  if(request.headers.get('origin')&&request.headers.get('origin')!==allowedOrigin)return reply(403,{error:'Origin not allowed'});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(request.method!=='POST')return reply(405,{error:'Method not allowed'});
  if(!env.SUPABASE_URL||!publicKey||!secretKey)return reply(500,{error:'Account service is not configured'});
  const authorization=request.headers.get('authorization')??'';
  if(!/^Bearer \S+$/i.test(authorization))return reply(401,{error:'Sign in required'});
  try{
   const caller=clientFactory(env.SUPABASE_URL,publicKey,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
   const {data:identity,error:identityError}=await caller.auth.getUser(authorization.slice(7));
   if(identityError||!identity.user)return reply(401,{error:'Please sign in again'});
   const {data:allowed,error:permissionError}=await caller.rpc('desk_can_manage_accounts');
   if(permissionError||allowed!==true)return reply(403,{error:'Only an IT Manager can create accounts'});
   let values:Record<string,unknown>;
   try{values=await request.json()}catch{return reply(400,{error:'Invalid request'})}
   const email=typeof values.email==='string'?values.email.trim().toLowerCase():'';
   const name=typeof values.name==='string'?values.name.trim():'';
   const password=typeof values.password==='string'?values.password:'';
   const specialty=values.specialty;
   const designation=values.designation??'Officer';
   const offices=values.offices;
   const allowedOffices=['FMCG','Rangpur Area Office','Khulna Area Office','Kushtia Area Office','Mymensingh Area Office','Mymensing Pharma','32 Bigha Project'];
   if(!Array.isArray(offices)||!offices.length||offices.length>7||offices.some(o=>typeof o!=='string'||!allowedOffices.includes(o)))return reply(400,{error:'Select at least one valid responsible office / area'});
   if(!['Officer','Sr. Officer','Executive','Sr. Executive','Asst Manager','Deputy Manager','Manager','AGM','GM','Others'].includes(String(designation)))return reply(400,{error:'Select a designation'});
   if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||email.length>250||!name||name.length>150)return reply(400,{error:'Enter a name and valid email'});
   if(password.length<8||new TextEncoder().encode(password).length>72)return reply(400,{error:'Password must be at least 8 characters and no more than 72 bytes'});
   if(!['Infrastructure','Software/System','SAP'].includes(String(specialty)))return reply(400,{error:'Select an IT section'});
   const admin=clientFactory(env.SUPABASE_URL,secretKey,{auth:{persistSession:false,autoRefreshToken:false}});
   const {data:archivedAccount,error:lookupError}=await admin.rpc('desk_archived_officer_account',{p_actor:identity.user.id,p_email:email});
   if(lookupError)return reply(500,{error:'Could not check the existing account. Apply the restore-officer SQL update first.'});
   let accountId:string;
   if(archivedAccount){
    const {data:restored,error:restoreError}=await admin.auth.admin.updateUserById(archivedAccount,{password,email_confirm:true});
    if(restoreError||!restored.user)return reply(400,{error:restoreError?.message??'Could not restore the login'});
    accountId=restored.user.id;
   }else{
    const {data:created,error:createError}=await admin.auth.admin.createUser({email,password,email_confirm:true});
    if(createError||!created.user)return reply(400,{error:createError?.message??'Could not create the account'});
    accountId=created.user.id;
   }
   const {error:saveError}=await admin.rpc('desk_register_officer_with_offices',{p_actor:identity.user.id,p_account:accountId,p_name:name,p_section:specialty,p_designation:designation,p_offices:[...new Set(offices)]});
   if(saveError){
    if(archivedAccount)return reply(500,{error:'Login password was updated, but team access could not be restored. Ask the project administrator to check the account.'});
    const {error:rollbackError}=await admin.auth.admin.deleteUser(accountId);
    return reply(500,{error:rollbackError?'Account was created but team access could not be saved. Contact the Supabase project administrator.':'Could not save team access. No account was kept; please try again.'});
   }
   return reply(201,{id:accountId,email,restored:Boolean(archivedAccount)});
  }catch{return reply(500,{error:'Could not create the account. Please try again.'})}
 };
}

Deno.serve(createHandler({
 SUPABASE_URL:Deno.env.get('SUPABASE_URL'),
 SUPABASE_PUBLISHABLE_KEYS:Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'),
 SUPABASE_SECRET_KEYS:Deno.env.get('SUPABASE_SECRET_KEYS'),
 SUPABASE_ANON_KEY:Deno.env.get('SUPABASE_ANON_KEY'),
 SUPABASE_SERVICE_ROLE_KEY:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
 ALLOWED_ORIGIN:Deno.env.get('ALLOWED_ORIGIN'),
}));
