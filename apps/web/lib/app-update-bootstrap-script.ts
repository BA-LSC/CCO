import {
  APP_UPDATE_OVERLAY_INNER_HTML,
  APP_UPDATE_OVERLAY_STYLE_CSS,
} from "@/lib/app-update-overlay";

/** Inline head bootstrap so update checks run before React hydrates. */
export function appUpdateBootstrapScript(clientVersion: string): string {
  if (!clientVersion || clientVersion === "dev") return "";

  const versionLiteral = JSON.stringify(clientVersion);
  const styleLiteral = JSON.stringify(APP_UPDATE_OVERLAY_STYLE_CSS);
  const innerHtmlLiteral = JSON.stringify(APP_UPDATE_OVERLAY_INNER_HTML);

  return `(function(){try{
var CLIENT=${versionLiteral};
var STYLE=${styleLiteral};
var INNER=${innerHtmlLiteral};
var applying=false;
var deployPending=false;
var deployPollId=null;
var OVERLAY_ID="cco-app-update-overlay";
var STYLE_ID="cco-app-update-overlay-style";
function ensureStyle(){
  if(document.getElementById(STYLE_ID))return;
  var s=document.createElement("style");
  s.id=STYLE_ID;
  s.textContent=STYLE;
  (document.head||document.documentElement).appendChild(s);
}
function overlay(){
  ensureStyle();
  var el=document.getElementById(OVERLAY_ID);
  if(!el){
    el=document.createElement("div");
    el.id=OVERLAY_ID;
    el.className="app-update-overlay";
    el.setAttribute("role","alert");
    el.setAttribute("aria-live","assertive");
    el.innerHTML=INNER;
    (document.body||document.documentElement).appendChild(el);
    return;
  }
  el.hidden=false;
}
function hideOverlay(){
  var el=document.getElementById(OVERLAY_ID);
  if(el)el.remove();
}
function markDeployPending(){
  deployPending=true;
  window.__ccoApplyingUpdate=true;
  overlay();
  if(deployPollId)return;
  deployPollId=setInterval(check,2000);
}
function clearDeployPending(){
  deployPending=false;
  window.__ccoApplyingUpdate=false;
  hideOverlay();
  if(deployPollId){
    clearInterval(deployPollId);
    deployPollId=null;
  }
}
function isDeployStatus(status){
  return status===502||status===503||status===504;
}
function applyUpdate(){
  if(applying)return;
  applying=true;
  deployPending=false;
  if(deployPollId){
    clearInterval(deployPollId);
    deployPollId=null;
  }
  window.__ccoApplyingUpdate=true;
  overlay();
  requestAnimationFrame(function(){
    requestAnimationFrame(function(){
      setTimeout(function(){location.reload()},1200);
    });
  });
}
function check(){
  if(applying)return;
  fetch("/api/app-version",{cache:"no-store",headers:{"Cache-Control":"no-cache",Pragma:"no-cache"}})
    .then(function(r){
      if(isDeployStatus(r.status)){
        markDeployPending();
        return null;
      }
      if(!r.ok){
        markDeployPending();
        return null;
      }
      return r.json();
    })
    .then(function(d){
      if(!d){
        return;
      }
      if(!d.version){
        markDeployPending();
        return;
      }
      if(d.version===CLIENT){
        if(deployPending)clearDeployPending();
        return;
      }
      applyUpdate();
    })
    .catch(function(){
      markDeployPending();
    });
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
