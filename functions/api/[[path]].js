// All API routes. Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY. R2 binding: BUCKET.
const J=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'content-type':'application/json'}});
const enc=encodeURIComponent;
const sb=(env,path,o={})=>fetch(env.SUPABASE_URL+'/rest/v1/'+path,{...o,headers:{apikey:env.SUPABASE_SERVICE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_KEY,'content-type':'application/json',Prefer:'return=representation'}}).then(async r=>{const t=await r.text();if(!r.ok)throw new Error(t);return t?JSON.parse(t):[]});
const auth=(env,body,path)=>fetch(env.SUPABASE_URL+'/auth/v1/'+path,{method:'POST',headers:{apikey:env.SUPABASE_ANON_KEY,'content-type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json());
const gone=g=>!g||(g.expires_at&&new Date(g.expires_at)<new Date());
async function user(req,env){const r=await fetch(env.SUPABASE_URL+'/auth/v1/user',{headers:{apikey:env.SUPABASE_ANON_KEY,Authorization:(req.headers.get('authorization')||'')}});return r.ok?r.json():null}
export async function onRequest({request:req,env}){
 const u=new URL(req.url),p=u.pathname.replace(/^\/api\//,'').split('/'),m=req.method,q=u.searchParams;
 try{
 if(p[0]=='auth'){const b=await req.json();const r=b.mode=='refresh'?await auth(env,{refresh_token:b.refresh},'token?grant_type=refresh_token'):await auth(env,{email:b.email,password:b.password},b.mode=='signup'?'signup':'token?grant_type=password');
  if(!r.access_token)return J({error:r.msg||r.error_description||r.message||'Could not sign in. Check your details.'},400);return J({token:r.access_token,refresh:r.refresh_token})}
 if(p[0]=='g'){const[g]=await sb(env,`galleries?token=eq.${enc(p[1])}&select=*`);if(gone(g))return J({error:'This gallery is not available.'},404);
  const ph=await sb(env,`photos?gallery_id=eq.${g.id}&select=id,filename,segment&order=filename`),s={};ph.forEach(x=>(s[x.segment]=s[x.segment]||[]).push({id:x.id,name:x.filename}));
  return J({title:g.title,segments:Object.entries(s).map(([name,photos])=>({name:name||'Main',photos}))})}
 if(p[0]=='img'){const[x]=await sb(env,`photos?id=eq.${enc(p[1])}&select=key,filename,thumb,galleries(token,expires_at)`),g=x&&x.galleries;
  if(gone(g)||g.token!==q.get('t'))return new Response('Not found',{status:404});
  const th=q.get('thumb')&&x.thumb,o=await env.BUCKET.get(th?x.key+'.t':x.key);if(!o)return new Response('Not found',{status:404});
  const h=new Headers({'content-type':th?'image/jpeg':(o.httpMetadata?.contentType||'image/jpeg'),'cache-control':'private, max-age=86400'});
  if(q.get('dl'))h.set('content-disposition',`attachment; filename*=UTF-8''${enc(x.filename)}`);return new Response(o.body,{headers:h})}
 const me=await user(req,env);if(!me||!me.id)return J({error:'Please sign in again.'},401);
 let[pr]=await sb(env,`profiles?id=eq.${me.id}`);if(!pr)[pr]=await sb(env,'profiles',{method:'POST',body:JSON.stringify({id:me.id,email:me.email})});
 const setUsed=n=>sb(env,`profiles?id=eq.${me.id}`,{method:'PATCH',body:JSON.stringify({used_bytes:Math.max(0,n)})});
 if(p[0]=='me')return J({email:me.email,used:pr.used_bytes,quota:pr.quota_bytes});
 if(p[0]=='galleries'){
  if(m=='GET'){const gs=await sb(env,`galleries?owner=eq.${me.id}&select=id,title,token,expires_at,photos(count)&order=created_at.desc`);return J({galleries:gs.map(g=>({...g,count:g.photos[0].count}))})}
  if(m=='POST'){const b=await req.json(),token=crypto.randomUUID().replace(/-/g,'');const[g]=await sb(env,'galleries',{method:'POST',body:JSON.stringify({owner:me.id,title:String(b.title||'Untitled').slice(0,80),token,expires_at:b.days?new Date(Date.now()+b.days*864e5).toISOString():null})});return J({id:g.id,token})}
  if(m=='DELETE'){const[g]=await sb(env,`galleries?id=eq.${enc(p[1])}&owner=eq.${me.id}&select=id`);if(!g)return J({error:'Not found'},404);
   const ph=await sb(env,`photos?gallery_id=eq.${g.id}&select=key,size`);if(ph.length)await env.BUCKET.delete(ph.flatMap(x=>[x.key,x.key+'.t']));
   await sb(env,`galleries?id=eq.${g.id}`,{method:'DELETE'});await setUsed(pr.used_bytes-ph.reduce((a,x)=>a+x.size,0));return J({})}}
 if(p[0]=='upload'&&m=='POST'){const size=+req.headers.get('content-length');
  if(q.get('thumb')){const[x]=await sb(env,`photos?id=eq.${enc(q.get('thumb'))}&owner=eq.${me.id}&select=key`);if(!x||!(size>0&&size<3e6))return J({error:'Bad thumbnail'},400);
   await env.BUCKET.put(x.key+'.t',req.body);await sb(env,`photos?id=eq.${q.get('thumb')}`,{method:'PATCH',body:JSON.stringify({thumb:true})});return J({})}
  const[g]=await sb(env,`galleries?id=eq.${enc(q.get('g'))}&owner=eq.${me.id}&select=id`);if(!g)return J({error:'Gallery not found'},404);
  if(!(size>0)||size>95e6)return J({error:'Each photo must be under 95 MB'},400);
  if(pr.used_bytes+size>pr.quota_bytes)return J({error:'Storage full: you have used your 5 GB'},413);
  let seg=(q.get('seg')||'').trim().replace(/\s+/g,' ').slice(0,60);const ex=(await sb(env,`photos?gallery_id=eq.${g.id}&select=segment`)).map(x=>x.segment);seg=ex.find(s=>s.toLowerCase()==seg.toLowerCase())||seg;
  const id=crypto.randomUUID(),key=`${me.id}/${g.id}/${id}`,o=await env.BUCKET.put(key,req.body,{httpMetadata:{contentType:req.headers.get('x-type')||'image/jpeg'}});
  if(o.size!==size){await env.BUCKET.delete(key);return J({error:'Upload incomplete. Please try again.'},500)}
  await sb(env,'photos',{method:'POST',body:JSON.stringify({id,gallery_id:g.id,owner:me.id,segment:seg,filename:(q.get('name')||'photo.jpg').slice(0,200),key,size})});await setUsed(pr.used_bytes+size);return J({id})}
 return J({error:'Not found'},404)}catch(e){return J({error:'Server error. Please try again.'},500)}}
