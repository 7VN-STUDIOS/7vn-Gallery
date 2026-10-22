// All API routes. Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY. R2 binding: BUCKET.
const J=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'content-type':'application/json'}});
const enc=encodeURIComponent;
const sb=(env,path,o={})=>fetch(env.SUPABASE_URL+'/rest/v1/'+path,{...o,headers:{apikey:env.SUPABASE_SERVICE_KEY,...(env.SUPABASE_SERVICE_KEY.startsWith('eyJ')?{Authorization:'Bearer '+env.SUPABASE_SERVICE_KEY}:{}),'content-type':'application/json',Prefer:'return=representation'}}).then(async r=>{const t=await r.text();if(!r.ok)throw new Error(t);return t?JSON.parse(t):[]});
const auth=(env,body,path)=>fetch(env.SUPABASE_URL+'/auth/v1/'+path,{method:'POST',headers:{apikey:env.SUPABASE_ANON_KEY,'content-type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json().catch(()=>({})));
const sig=async(env,id)=>{const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.SUPABASE_SERVICE_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']),b=await crypto.subtle.sign('HMAC',k,new TextEncoder().encode('photo:'+id));return btoa(String.fromCharCode(...new Uint8Array(b))).replace(/[+/=]/g,c=>({'+':'-','/':'_','=':''}[c])).slice(0,24)};
const gone=g=>!g||(g.expires_at&&new Date(g.expires_at)<new Date());
const nm=x=>String(x||'').trim().replace(/\s+/g,' ').slice(0,60);
const uniq=a=>{const o=[];(a||[]).forEach(x=>{x=nm(x);if(x&&!o.some(y=>y.toLowerCase()==x.toLowerCase()))o.push(x)});return o};
async function user(req,env){const r=await fetch(env.SUPABASE_URL+'/auth/v1/user',{headers:{apikey:env.SUPABASE_ANON_KEY,Authorization:(req.headers.get('authorization')||'')}});return r.ok?r.json():null}
async function handle(req,env){
 const u=new URL(req.url),p=u.pathname.replace(/^\/api\//,'').split('/'),m=req.method,q=u.searchParams;
 try{
 if(p[0]=='google')return Response.redirect(`${env.SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${enc(u.origin+'/')}`,302);
 if(p[0]=='auth'){const b=await req.json(),ro=enc(u.origin+(b.mode=='recover'?'/reset':'/'));let r;
  if(b.mode=='refresh')r=await auth(env,{refresh_token:b.refresh},'token?grant_type=refresh_token');
  else if(b.mode=='recover'){await auth(env,{email:b.email},'recover?redirect_to='+ro);return J({ok:true})}
  else if(b.mode=='resend'){await auth(env,{type:'signup',email:b.email},'resend?redirect_to='+ro);return J({ok:true})}
  else if(b.mode=='update'){const x=await fetch(env.SUPABASE_URL+'/auth/v1/user',{method:'PUT',headers:{apikey:env.SUPABASE_ANON_KEY,Authorization:'Bearer '+b.token,'content-type':'application/json'},body:JSON.stringify({password:b.password})}),j=await x.json().catch(()=>({}));if(!x.ok)return J({error:j.msg||j.message||'Could not update the password. The link may have expired.'},400);return J({ok:true})}
  else r=await auth(env,{email:b.email,password:b.password},b.mode=='signup'?'signup?redirect_to='+ro:'token?grant_type=password');
  if(!r.access_token){if(b.mode=='signup'&&(r.id||r.user))return J({pending:true});if(r.error_code=='email_not_confirmed')return J({error:'Please confirm your email first. Check your inbox.',unconfirmed:true},400);return J({error:r.msg||r.error_description||r.message||'Could not sign in. Check your details.'},400)}
  return J({token:r.access_token,refresh:r.refresh_token})}
 if(p[0]=='g'){const[g]=await sb(env,`galleries?token=eq.${enc(p[1])}&select=*`);if(gone(g))return J({error:'This gallery is not available.'},404);
  const ph=await sb(env,`photos?gallery_id=eq.${g.id}&select=id,filename,segment&order=filename`),s={};ph.forEach(x=>(s[x.segment]=s[x.segment]||[]).push({id:x.id,name:x.filename}));
  const order=uniq(g.segments).concat(Object.keys(s).filter(n=>n));return J({title:g.title,cover:g.cover_id,segments:[''].concat(order).filter((n,i,a)=>a.indexOf(n)==i&&s[n]).map(name=>({name:name||'Main',photos:s[name]}))})}
 if(p[0]=='share'){const[x]=await sb(env,`photos?id=eq.${enc(q.get('id')||'')}&select=galleries(token,expires_at)`),g=x&&x.galleries;if(gone(g)||g.token!==q.get('t'))return J({error:'Not found'},404);return J({url:`${u.origin}/p/${q.get('id')}.${await sig(env,q.get('id'))}`})}
 if(p[0]=='img'){const[x]=await sb(env,`photos?id=eq.${enc(p[1])}&select=key,filename,thumb,galleries(token,expires_at)`),g=x&&x.galleries;
  if(gone(g)||!(g.token===q.get('t')||(q.get('s')&&q.get('s')===await sig(env,p[1]))))return new Response('Not found',{status:404});
  const th=q.get('thumb')&&x.thumb,o=await env.BUCKET.get(th?x.key+'.t':x.key);if(!o)return new Response('Not found',{status:404});
  const h=new Headers({'content-type':th?'image/jpeg':(o.httpMetadata?.contentType||'image/jpeg'),'cache-control':'private, max-age=86400'});
  if(q.get('dl'))h.set('content-disposition',`attachment; filename*=UTF-8''${enc(x.filename)}`);return new Response(o.body,{headers:h})}
 const me=await user(req,env);if(!me||!me.id)return J({error:'Please sign in again.'},401);
 let[pr]=await sb(env,`profiles?id=eq.${me.id}`);if(!pr)[pr]=await sb(env,'profiles',{method:'POST',body:JSON.stringify({id:me.id,email:me.email})});
 const setUsed=n=>sb(env,`profiles?id=eq.${me.id}`,{method:'PATCH',body:JSON.stringify({used_bytes:Math.max(0,n)})});
 if(p[0]=='me')return J({email:me.email,used:pr.used_bytes,quota:pr.quota_bytes});
 if(p[0]=='galleries'){
  if(m=='GET'&&p[1]){const ph=await sb(env,`photos?gallery_id=eq.${enc(p[1])}&owner=eq.${me.id}&select=id,filename,segment&order=filename`);return J({photos:ph})}
  if(m=='GET'){const gs=await sb(env,`galleries?owner=eq.${me.id}&select=id,title,token,expires_at,segments,cover_id,photos(count)&order=created_at.desc`);return J({galleries:gs.map(g=>({...g,count:g.photos[0].count}))})}
  if(m=='POST'){const b=await req.json(),title=nm(b.title),token=crypto.randomUUID().replace(/-/g,'');if(!title)return J({error:'Please give your gallery a name'},400);const[g]=await sb(env,'galleries',{method:'POST',body:JSON.stringify({owner:me.id,title,segments:uniq(b.segments),token,expires_at:b.days?new Date(Date.now()+b.days*864e5).toISOString():null})});return J({id:g.id,token})}
  if(m=='PATCH'){const[g]=await sb(env,`galleries?id=eq.${enc(p[1])}&owner=eq.${me.id}&select=id,segments`);if(!g)return J({error:'Not found'},404);const b=await req.json(),u={};
   if(b.title!==undefined){u.title=nm(b.title);if(!u.title)return J({error:'Please give your gallery a name'},400)}
   if(b.segments)u.segments=uniq(b.segments);
   if(b.rename){const f=nm(b.rename.from),t=nm(b.rename.to);if(!t)return J({error:'Please enter a name'},400);u.segments=uniq((g.segments||[]).map(x=>x==f?t:x));await sb(env,`photos?gallery_id=eq.${g.id}&segment=eq.${enc(f)}`,{method:'PATCH',body:JSON.stringify({segment:t})})}
   if(b.cover!==undefined){if(b.cover){const[x]=await sb(env,`photos?id=eq.${enc(b.cover)}&gallery_id=eq.${g.id}&select=id`);if(!x)return J({error:'Photo not found'},404)}u.cover_id=b.cover||null}
   const[r]=await sb(env,`galleries?id=eq.${g.id}`,{method:'PATCH',body:JSON.stringify(u)});return J({title:r.title,segments:r.segments||[],cover_id:r.cover_id})}
  if(m=='DELETE'){const[g]=await sb(env,`galleries?id=eq.${enc(p[1])}&owner=eq.${me.id}&select=id`);if(!g)return J({error:'Not found'},404);
   const ph=await sb(env,`photos?gallery_id=eq.${g.id}&select=key,size`);if(ph.length)await env.BUCKET.delete(ph.flatMap(x=>[x.key,x.key+'.t']));
   await sb(env,`galleries?id=eq.${g.id}`,{method:'DELETE'});await setUsed(pr.used_bytes-ph.reduce((a,x)=>a+x.size,0));return J({})}}
 if(p[0]=='photos'&&m=='DELETE'){const[x]=await sb(env,`photos?id=eq.${enc(p[1])}&owner=eq.${me.id}&select=key,size,gallery_id`);if(!x)return J({error:'Not found'},404);
  await env.BUCKET.delete([x.key,x.key+'.t']);await sb(env,`photos?id=eq.${enc(p[1])}`,{method:'DELETE'});await sb(env,`galleries?id=eq.${x.gallery_id}&cover_id=eq.${enc(p[1])}`,{method:'PATCH',body:JSON.stringify({cover_id:null})});await setUsed(pr.used_bytes-x.size);return J({})}
 if(p[0]=='upload'&&m=='POST'){const size=+req.headers.get('content-length');
  if(q.get('thumb')){const[x]=await sb(env,`photos?id=eq.${enc(q.get('thumb'))}&owner=eq.${me.id}&select=key`);if(!x||!(size>0&&size<3e6))return J({error:'Bad thumbnail'},400);
   await env.BUCKET.put(x.key+'.t',req.body);await sb(env,`photos?id=eq.${q.get('thumb')}`,{method:'PATCH',body:JSON.stringify({thumb:true})});return J({})}
  const[g]=await sb(env,`galleries?id=eq.${enc(q.get('g'))}&owner=eq.${me.id}&select=id,segments`);if(!g)return J({error:'Gallery not found'},404);
  if(!(size>0)||size>95e6)return J({error:'Each photo must be under 95 MB'},400);
  if(pr.used_bytes+size>pr.quota_bytes)return J({error:'Storage full: you have used your 5 GB'},413);
  let seg=(q.get('seg')||'').trim().replace(/\s+/g,' ').slice(0,60);const ex=(await sb(env,`photos?gallery_id=eq.${g.id}&select=segment`)).map(x=>x.segment).concat(g.segments||[]);seg=ex.find(s=>s.toLowerCase()==seg.toLowerCase())||seg;
  const id=crypto.randomUUID(),key=`${me.id}/${g.id}/${id}`,o=await env.BUCKET.put(key,req.body,{httpMetadata:{contentType:req.headers.get('x-type')||'image/jpeg'}});
  if(o.size!==size){await env.BUCKET.delete(key);return J({error:'Upload incomplete. Please try again.'},500)}
  await sb(env,'photos',{method:'POST',body:JSON.stringify({id,gallery_id:g.id,owner:me.id,segment:seg,filename:(q.get('name')||'photo.jpg').slice(0,200),key,size})});await setUsed(pr.used_bytes+size);return J({id})}
 return J({error:'Not found'},404)}catch(e){return J({error:'Server error. Please try again.'},500)}}

export default{fetch(req,env){const u=new URL(req.url);
 if(u.pathname.startsWith('/api/'))return handle(req,env);
 if(u.pathname.startsWith('/p/'))return env.ASSETS.fetch(new Request(new URL('/p/',req.url),req));
 if(u.pathname.startsWith('/g/'))return env.ASSETS.fetch(new Request(new URL('/g/',req.url),req));
 return env.ASSETS.fetch(req)}};
