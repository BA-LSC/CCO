/** Inline head bootstrap so update checks run before React hydrates. */
export function appUpdateBootstrapScript(clientVersion: string): string {
  if (!clientVersion || clientVersion === "dev") return "";

  const versionLiteral = JSON.stringify(clientVersion);

  return `(function(){try{
var CLIENT=${versionLiteral};
var applying=false;
function overlay(){
  if(document.getElementById("cco-app-update-overlay"))return;
  var el=document.createElement("div");
  el.id="cco-app-update-overlay";
  el.className="app-update-overlay";
  el.setAttribute("role","alert");
  el.setAttribute("aria-live","assertive");
  el.innerHTML='<div class="loading-screen loading-screen-page" aria-label="Updating CCO"><div class="loading-screen-content"><div class="spinner" aria-hidden="true"></div><p class="loading-screen-label">Updating CCO…</p></div></div>';
  (document.body||document.documentElement).appendChild(el);
}
function applyUpdate(){
  if(applying||window.__ccoApplyingUpdate)return;
  applying=true;
  window.__ccoApplyingUpdate=true;
  overlay();
  setTimeout(function(){location.reload()},900);
}
function check(){
  if(applying||window.__ccoApplyingUpdate)return;
  fetch("/api/app-version",{cache:"no-store",headers:{"Cache-Control":"no-cache",Pragma:"no-cache"}})
    .then(function(r){return r.ok?r.json():null})
    .then(function(d){
      if(!d||!d.version||d.version===CLIENT)return;
      applyUpdate();
    })
    .catch(function(){});
}
function start(){
  document.addEventListener("visibilitychange",function(){
    if(document.visibilityState==="visible")check();
  });
  window.addEventListener("pageshow",check);
  window.addEventListener("focus",check);
  setInterval(check,15000);
  setTimeout(check,500);
}
if(document.body){start();}
else{document.addEventListener("DOMContentLoaded",start);}
}catch(e){}})();`;
}
