import {ticketLabel} from './ticket-label';
import {useEffect,useState,type FormEvent} from 'react';
import {createRoot} from 'react-dom/client';
import {Monitor} from 'lucide-react';
import type {Session} from '@supabase/supabase-js';
import Desk from './desk';
import {appUrl,supabase} from './backend';
import {sections,sectionSlug} from './it-sections';
import {statuses} from './ticket-status';
import './globals.css';

type Mode='login'|'forgot'|'reset';
function Auth({mode,setMode}:{mode:Mode;setMode:(m:Mode)=>void}){
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!supabase)return;
  const values=new FormData(event.currentTarget),email=String(values.get('email')??''),password=String(values.get('password')??'');
  setBusy(true);setMessage('');
  try{
   if(mode==='forgot'){
    const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:appUrl()+'?reset=1'});
    if(error)throw error;setMessage('If the account exists, a reset link will arrive by email.');
   }else if(mode==='reset'){
    const {error}=await supabase.auth.updateUser({password});if(error)throw error;
    await supabase.auth.signOut();setMode('login');setMessage('Password updated. Sign in with your new password.');
   }else{
    const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;
   }
  }catch(error){setMessage(error instanceof Error?error.message:'Something went wrong. Try again.');}
  finally{setBusy(false);}
 }
 const label={login:'Sign in',forgot:'Send reset email',reset:'Save new password'}[mode];
 return <main className="setup"><div className="logo"><Monitor size={20}/></div><p className="eyebrow">IT DESK</p><h1>{label}</h1>
 <form onSubmit={submit}>
 {mode!=='reset'&&<label>Email<input type="email" name="email" required autoComplete="email"/></label>}
 {mode!=='forgot'&&<label>Password<input type="password" name="password" required minLength={mode==='login'?undefined:8} autoComplete={mode==='login'?'current-password':'new-password'}/></label>}
 <button className="primary" disabled={busy}>{busy?'Please wait…':label}</button>
 </form>
 {message&&<p role="status">{message}</p>}
 {mode==='login'?<div className="auth-actions"><button className="text-button" onClick={()=>{setMessage('');setMode('forgot')}}>Forgot password?</button></div>:<button className="text-button" onClick={()=>{setMessage('');setMode('login')}}>Back to sign in</button>}
 </main>;
}

type Tracking={id:string;ticket_number?:number;title:string;status:string;officer:string;total:number;updates:{id:string;created:string;author:string;body:string}[]};
function Track({token}:{token:string}){
 const [result,setResult]=useState<Tracking|null>(),[failed,setFailed]=useState(false),[loadingMore,setLoadingMore]=useState(false),[moreError,setMoreError]=useState('');
 useEffect(()=>{let cancelled=false;void (async()=>{try{
  const {data,error}=await supabase!.rpc('desk_track_page',{p_token:token,p_offset:0});
  if(error)throw error;if(!cancelled)setResult(data);
 }catch{if(!cancelled)setFailed(true);}})();return ()=>{cancelled=true};},[token]);
 async function more(){
  if(!result||loadingMore)return;
  setLoadingMore(true);setMoreError('');
  try{const {data,error}=await supabase!.rpc('desk_track_page',{p_token:token,p_offset:result.updates.length});if(error)throw error;
   if(!data){setResult(null);return;}
   setResult(previous=>{if(!previous)return previous;const ids=new Set(previous.updates.map(u=>u.id));return {...data,updates:[...previous.updates,...data.updates.filter((u:{id:string})=>!ids.has(u.id))]};});
  }catch{setMoreError('Could not load older updates. Please try again.');}finally{setLoadingMore(false)}
 }
 if(failed)return <main className="tracking"><h1>Could not load tracking</h1><p>Try refreshing the page.</p></main>;
 if(result===undefined)return <main className="tracking"><h1>Loading ticket…</h1></main>;
 if(!result)return <main className="tracking"><h1>Tracking link unavailable</h1><p>Contact your IT team for a valid link.</p></main>;
 return <main className="tracking"><div className="brand">IT Desk <span>SUPPORT TRACKING</span></div><p className="eyebrow">{ticketLabel(result)}</p><h1>{result.title}</h1><span className={'badge '+result.status.toLowerCase().replaceAll(' ','-')}>{result.status}</span><p>Your IT officer: <b>{result.officer}</b></p><h2>Progress updates</h2>
 {result.updates.map(u=><article className="event" key={u.id}><small>{new Date(u.created).toLocaleString('en-GB',{timeZone:'Asia/Dhaka'})} · {u.author}</small><p>{u.body}</p></article>)}
 {moreError&&<p role="alert" className="error">{moreError}</p>}
 {result.updates.length<result.total&&<button className="secondary" disabled={loadingMore} onClick={()=>void more()}>{loadingMore?'Loading…':'Load older updates'}</button>}
 </main>;
}

function App(){
 const [route,setRoute]=useState(location.hash.slice(1)||'/'),[mode,setMode]=useState<Mode>('login'),[session,setSession]=useState<Session|null|undefined>(),[callbackError,setCallbackError]=useState('');
 useEffect(()=>{
  const handleRoute=()=>setRoute(location.hash.slice(1)||'/');
  window.addEventListener('hashchange',handleRoute);
  if(!supabase)return ()=>window.removeEventListener('hashchange',handleRoute);
  const client=supabase;
  const {data:{subscription}}=client.auth.onAuthStateChange((event,next)=>{
   setSession(next);
   if(event==='PASSWORD_RECOVERY')setMode('reset');
  });
  const params=new URLSearchParams(location.search),code=params.get('code');
  if(code)void client.auth.exchangeCodeForSession(code).then(({data,error})=>{
   history.replaceState(null,'',appUrl()+'#/');
   if(error)setCallbackError(error.message);
   else{setSession(data.session);if(params.get('reset')==='1')setMode('reset');}
  });
  return ()=>{window.removeEventListener('hashchange',handleRoute);subscription.unsubscribe();};
 },[]);
 if(!supabase)return <main className="setup"><h1>Set up IT Desk</h1><p>Configure the Supabase URL and publishable key, then rebuild.</p></main>;
 if(route.startsWith('/track/'))return <Track key={route} token={route.slice(7)}/>;
 if(session===undefined)return <main className="loading">Loading IT Desk…</main>;
 if(!session||mode==='reset')return <>{callbackError&&<p role="alert" className="error">{callbackError}</p>}<Auth mode={mode} setMode={setMode}/></>;
 const teamPage=route.startsWith('/team/');
 const section=sections.find(s=>route===(teamPage?'/team/':'/sections/')+sectionSlug(s));
 const initialOfficer=route.match(/^\/officers\/([0-9a-f-]{36})$/i)?.[1];
 const portalPage=route==='/'||route==='/my'||route.startsWith('/my/');
 const initialStatus=statuses.find(status=>route===(portalPage?'/my/':'/tickets/')+status.toLowerCase().replaceAll(' ','-'));
 return <Desk key={route} section={section} teamPage={teamPage} storagePage={route==='/storage'} reportsPage={route==='/reports'} workPage={route==='/regular-work'||route==='/regular-work/report'} portalPage={portalPage} initialStatus={initialStatus} initialOfficer={initialOfficer}/>;
}
createRoot(document.getElementById('root')!).render(<App/>);
