const $=s=>document.querySelector(s);
async function api(path,o={}){let t=localStorage.t;const go=()=>fetch('/api/'+path,{...o,headers:{...o.headers,authorization:'Bearer '+t}});let r=await go();
 if(r.status==401&&localStorage.r){const n=await fetch('/api/auth',{method:'POST',body:JSON.stringify({mode:'refresh',refresh:localStorage.r})}).then(x=>x.json());if(n.token){localStorage.t=t=n.token;localStorage.r=n.refresh;r=await go()}}
 const j=await r.json();if(!r.ok){if(r.status==401){localStorage.clear();location='/'}throw new Error(j.error||'Something went wrong')}return j}
