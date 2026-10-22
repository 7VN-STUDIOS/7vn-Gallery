const IOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
function toast(msg,label,fn){let t=document.getElementById('toast');if(!t){t=document.createElement('div');t.id='toast';document.body.append(t)}
 t.textContent=msg;clearTimeout(t.h);if(!msg){t.style.display='none';return}
 if(label){const b=document.createElement('button');b.textContent=label;b.onclick=()=>{t.style.display='none';fn()};t.append(b)}else t.h=setTimeout(()=>t.style.display='none',2500);t.style.display='flex'}
async function saveToPhotos(url,name){try{toast('Preparing your photo…');const b=await (await fetch(url)).blob(),f=new File([b],name,{type:b.type||'image/jpeg'});
 if(!(navigator.canShare&&navigator.canShare({files:[f]}))){toast('');return location.href=url+'&dl=1'}
 try{await navigator.share({files:[f]});toast('')}catch(e){if(e.name=='AbortError')return toast('');toast('Your photo is ready','Save to Photos',()=>navigator.share({files:[f]}).catch(()=>{}))}}
 catch(e){toast('Could not prepare the photo. Please try again.')}}
function dlClick(e,url,name){if(IOS&&navigator.canShare){e.preventDefault();saveToPhotos(url,name)}}
