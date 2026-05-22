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
var wired=false;
var OVERLAY_ID="cco-app-update-overlay";
var STYLE_ID="cco-app-update-overlay-style";
var CHECK_MS=5000;
var DEPLOY_CHECK_MS=750;
var OVERLAY_MS=2500;
var SEND_WAIT_MS=8000;
var DEPLOY_SEND_WAIT_MS=1500;
function ensureStyle(){
  if(document.getElementById(STYLE_ID))return;
  var s=document.createElement("style");
  s.id=STYLE_ID;
  s.textContent=STYLE;
  (document.head||document.documentElement).appendChild(s);
}
function mountRoot(){
  return document.body||document.documentElement;
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
    mountRoot().appendChild(el);
  }else{
    el.hidden=false;
  }
  window.__ccoApplyingUpdate=true;
  try{window.dispatchEvent(new Event("cco:app-updating"));}catch(e){}
}
function hideOverlay(){
  var el=document.getElementById(OVERLAY_ID);
  if(el)el.remove();
}
function markDeployPending(){
  deployPending=true;
  window.__ccoDeployPending=true;
  overlay();
  if(deployPollId)return;
  deployPollId=setInterval(check,DEPLOY_CHECK_MS);
}
function clearDeployPending(){
  deployPending=false;
  window.__ccoDeployPending=false;
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
function sendIdle(){
  return !window.__ccoSendInFlight;
}
function waitForSendIdle(cb,maxMs){
  var limit=maxMs||SEND_WAIT_MS;
  var started=Date.now();
  (function poll(){
    if(sendIdle()||Date.now()-started>=limit){
      cb();
      return;
    }
    setTimeout(poll,100);
  })();
}
function reloadAfterOverlay(){
  requestAnimationFrame(function(){
    requestAnimationFrame(function(){
      setTimeout(function(){location.reload()},OVERLAY_MS);
    });
  });
}
function applyUpdate(fromDeploy){
  if(applying)return;
  applying=true;
  deployPending=false;
  window.__ccoDeployPending=false;
  if(deployPollId){
    clearInterval(deployPollId);
    deployPollId=null;
  }
  overlay();
  waitForSendIdle(function(){
    if(fromDeploy){
      location.reload();
      return;
    }
    reloadAfterOverlay();
  },fromDeploy?DEPLOY_SEND_WAIT_MS:SEND_WAIT_MS);
}
function handleVersionPayload(d){
  if(d.updating){
    markDeployPending();
    return;
  }
  if(deployPending){
    if(d.version&&d.version!==CLIENT){
      applyUpdate(true);
      return;
    }
    if(d.version===CLIENT){
      clearDeployPending();
    }
    return;
  }
  if(d.version&&d.version!==CLIENT){
    applyUpdate(false);
  }
}
function check(){
  if(applying)return;
  fetch("/api/app-version",{cache:"no-store",headers:{"Cache-Control":"no-cache",Pragma:"no-cache"}})
    .then(function(r){
      if(isDeployStatus(r.status)){
        if(deployPending)overlay();
        return null;
      }
      if(!r.ok)return null;
      return r.json();
    })
    .then(function(d){
      if(!d)return;
      if(!d.version)return;
      handleVersionPayload(d);
    })
    .catch(function(){
      if(deployPending)overlay();
    });
}
function wire(){
  if(wired)return;
  wired=true;
  document.addEventListener("visibilitychange",function(){
    if(document.visibilityState==="visible")check();
  });
  window.addEventListener("pageshow",check);
  window.addEventListener("focus",check);
  setInterval(check,CHECK_MS);
}
wire();
check();
}catch(e){}})();`;
}
