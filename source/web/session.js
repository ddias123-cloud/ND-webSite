'use strict';
(() => {
  let checking=false;
  async function check(){
    if(checking||document.visibilityState==='hidden')return;
    checking=true;
    try{const response=await fetch('/api/auth/status',{cache:'no-store'});const data=await response.json();if(!response.ok||!data.authenticated)location.replace('./');}catch{}finally{checking=false;}
  }
  document.addEventListener('click',async event=>{
    const button=event.target.closest('#nd-logout');if(!button)return;
    button.disabled=true;
    try{const response=await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!response.ok)throw new Error('Logout failed');location.replace('./');}
    catch{button.disabled=false;button.title='Қайта көр / Попробуй ещё раз';}
  });
  window.addEventListener('pageshow',check);
  document.addEventListener('visibilitychange',check);
  setInterval(check,60000);
})();
