/** Standalone review shell. User supplied values enter the DOM through textContent only. */
export function reviewPage(workspaceId: string, boardId: string, nonce: string) {
  const config = JSON.stringify({ base: '/api/shared-review/' + encodeURIComponent(workspaceId) + '/' + encodeURIComponent(boardId) }).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Review · Open Take Studio</title>
<style nonce="${nonce}">
:root{color-scheme:dark;font:15px/1.55 system-ui,sans-serif;background:#0c0911;color:#f7f1ff}*{box-sizing:border-box}body{margin:0}button,input,textarea{font:inherit}button,a{touch-action:manipulation}button{border:1px solid #5a456d;border-radius:10px;padding:9px 14px;background:#261a34;color:#f4e9ff;cursor:pointer}button:disabled{opacity:.5;cursor:wait}button.primary{background:#c9a9ff;color:#1b0e30;border-color:transparent}button:hover,a:hover{filter:brightness(1.15)}a{color:#d9bfff}header{display:flex;gap:20px;align-items:center;justify-content:space-between;padding:22px 32px;border-bottom:1px solid #33273e}header strong{letter-spacing:.12em;font-size:13px}main{max-width:1360px;margin:auto;padding:32px}h1{font-size:clamp(26px,4vw,42px);line-height:1.1;margin:0 0 14px}h2{font-size:20px}.muted{color:#b5a6c6;font-size:13px}.layout{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(280px,1fr);gap:28px}.stage{min-height:340px;background:#050407;border:1px solid #34273e;border-radius:18px;display:grid;place-items:center;overflow:hidden}.stage img,.stage video{width:100%;height:min(64vh,650px);object-fit:contain}.stage audio{width:90%}.files{display:flex;gap:8px;overflow:auto;margin:14px 0}.files button{min-width:145px;max-width:220px;text-align:left}.files button.active{outline:2px solid #c9a9ff}.files small{display:block;color:#b5a6c6}textarea,input{width:100%;background:#17101f;color:#faf7ff;border:1px solid #534162;border-radius:9px;padding:10px}textarea{min-height:90px;resize:vertical}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.row input{max-width:120px}label{display:block;margin:10px 0 5px}#status{min-height:25px;color:#f4c9a2}article{border:1px solid #44324e;border-radius:12px;padding:14px;margin:12px 0;background:#17101f}article.resolved{opacity:.65}article p{white-space:pre-wrap;overflow-wrap:anywhere}.reply{border-left:2px solid #715482;padding:1px 0 1px 12px;margin:12px 0 0 12px}.tag{display:inline-block;border-radius:8px;padding:3px 8px;background:#30213f;font-size:12px}.decisions{margin:14px 0}.decisions p{margin:6px 0;overflow-wrap:anywhere}.foot{margin-top:25px;border-top:1px solid #32243d;padding-top:16px}.hidden{display:none!important}button:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid #d9bfff;outline-offset:3px}@media(max-width:850px){main{padding:20px}.layout{grid-template-columns:1fr}header{padding:18px}.stage{min-height:220px}}
</style></head><body>
<header><strong>OPEN TAKE STUDIO / REVIEW</strong><button id="refresh" type="button">Refresh</button></header><main><h1 id="title">Open your review invitation</h1><p id="subtitle" class="muted">Loading this shared version…</p><p id="status" role="status" aria-live="polite"></p>
<div id="review" class="layout hidden"><section><div id="stage" class="stage"></div><div id="files" class="files" aria-label="Selected review assets"></div><div class="row"><strong id="asset-name"></strong><a id="download">Download this version</a></div><p id="asset-version" class="muted"></p><div id="decisions" class="decisions"></div><div id="decision-controls" class="hidden"><label for="decision-note">Decision note</label><textarea id="decision-note" maxlength="2000" placeholder="What is ready, or what should change?"></textarea><div class="row"><button id="approve" class="primary">Approve this asset version</button><button id="changes">Request changes</button></div></div></section>
<aside><h2>Conversation</h2><div id="comment-controls" class="hidden"><p id="reply-label" class="muted"></p><textarea id="comment" aria-label="Review comment" maxlength="4000" placeholder="Leave specific feedback on this version…"></textarea><div id="timing" class="row"><label for="seconds">Time in seconds</label><input id="seconds" type="number" min="0" max="86400" step="0.1" placeholder="Optional"><button id="playhead">Use playhead</button></div><div class="row"><button id="send" class="primary">Add comment</button><button id="cancel-reply" class="hidden">Cancel reply</button></div></div><div id="threads"></div></aside></div><p class="muted foot">This invitation grants access only to the selected saved assets in its version. The invitation label identifies this link; it does not verify a person's email or identity. New versions require their own invitation. No generation credits are needed to review.</p></main>
<script nonce="${nonce}">
'use strict';
const config=${config}, el=id=>document.getElementById(id);
let state, selected, replyId, shown, busy=false;
const text=(tag,value,cls)=>{const n=document.createElement(tag);n.textContent=value;if(cls)n.className=cls;return n;};
const api=async(path='',method='GET',body)=>{const response=await fetch(config.base+path,{method,headers:{'Content-Type':'application/json','X-Review-Request':'1'},body:body===undefined?undefined:JSON.stringify(body)});const result=await response.json().catch(()=>({error:'Review connection failed.'}));if(!response.ok)throw Object.assign(new Error(result.error||'Review request failed.'),{status:response.status});return result;};
function status(message){el('status').textContent=message;}
function current(){return state&&state.version.assets.find(asset=>asset.assetId===selected);}
function choose(id){selected=id;replyId=undefined;el('reply-label').textContent='';el('cancel-reply').classList.add('hidden');render();}
function versionBody(){const asset=current();if(!asset)throw new Error('Choose a saved asset first.');return{revision:state.revision,version:state.version.number,assetId:asset.assetId,assetSha256:asset.sha256};}
async function load(){state=await api();if(!state.version.assets.some(asset=>asset.assetId===selected))selected=state.version.assets[0]?.assetId;render();}
async function perform(work){if(busy)return;busy=true;status('Saving…');try{await work();status('Saved.');}catch(error){status(error.message);if(error.status===409){try{await load();}catch{}}}finally{busy=false;}}
function render(){
 el('review').classList.remove('hidden');el('title').textContent=state.title;
 el('subtitle').textContent=state.version.label+' · '+state.invitation.label+' · '+state.invitation.role+' · expires '+new Date(state.invitation.expiresAt).toLocaleString();
 const asset=current(), files=el('files');files.replaceChildren();
 for(const item of state.version.assets){const b=text('button',item.name,item.assetId===selected?'active':'');b.append(text('small',item.kind+' · '+Math.round(item.size/1024)+' KB'));b.addEventListener('click',()=>choose(item.assetId));files.append(b);}
 if(!asset)return;
 const url=config.base+'/assets/'+encodeURIComponent(asset.assetId),stage=el('stage');
 if(shown!==asset.assetId){shown=asset.assetId;stage.replaceChildren();let player;
 if(asset.kind==='image'){player=document.createElement('img');player.alt=asset.name;player.src=url;}
 else if(asset.kind==='video'||asset.kind==='audio'){player=document.createElement(asset.kind);player.controls=true;player.preload='metadata';player.src=url;if(asset.kind==='video')player.playsInline=true;}
 else{player=text('p',asset.kind==='3d'?'3D asset · download this GLB to inspect the complete object.':'Saved document · download the selected file.');}
 stage.append(player);}
 el('asset-name').textContent=asset.name;el('download').href=url+'?download=1';
 el('asset-version').textContent='Saved fingerprint '+asset.sha256.slice(0,16)+' · '+state.version.label;
 const canComment=state.invitation.role!=='viewer',canApprove=state.invitation.role==='approver';
 el('comment-controls').classList.toggle('hidden',!canComment);el('decision-controls').classList.toggle('hidden',!canApprove);
 el('timing').classList.toggle('hidden',!['video','audio'].includes(asset.kind));
 const decisions=el('decisions');decisions.replaceChildren();
 const latest=new Map();for(const d of state.decisions.filter(d=>d.assetId===selected))latest.set(d.author.id,d);
 for(const d of latest.values()){const p=text('p',d.author.label+': '+(d.decision==='approved'?'Approved':'Changes requested'),'tag');if(d.note)p.append(text('span',' — '+d.note));decisions.append(p);}
 const threads=el('threads');threads.replaceChildren();
 const selectedComments=state.comments.filter(c=>c.assetId===selected);
 for(const c of selectedComments.filter(c=>!c.parentId)){const article=document.createElement('article');if(c.resolvedAt)article.className='resolved';
 article.append(text('strong',c.author.label),text('div',new Date(c.createdAt).toLocaleString()+(c.timeSeconds!==undefined?' · '+c.timeSeconds+'s':''),'muted'),text('p',c.text));
 const controls=document.createElement('div');controls.className='row';
 if(c.timeSeconds!==undefined){const seek=text('button','Go to '+c.timeSeconds+'s');seek.onclick=()=>{const player=stage.querySelector('video,audio');if(player)player.currentTime=c.timeSeconds;};controls.append(seek);}
 if(canComment){const reply=text('button','Reply');reply.onclick=()=>{replyId=c.id;el('reply-label').textContent='Replying to '+c.author.label;el('cancel-reply').classList.remove('hidden');el('comment').focus();};controls.append(reply);
 if(canApprove||c.author.id===state.invitation.id){const resolve=text('button',c.resolvedAt?'Reopen':'Resolve');resolve.onclick=()=>perform(async()=>{state=await api('/comments/'+c.id,'PATCH',{revision:state.revision,resolved:!c.resolvedAt});render();});controls.append(resolve);}}
 if(c.resolvedAt)controls.append(text('span','Resolved','tag'));article.append(controls);
 for(const r of selectedComments.filter(r=>r.parentId===c.id)){const response=document.createElement('div');response.className='reply';response.append(text('strong',r.author.label),text('span',' · '+new Date(r.createdAt).toLocaleString(),'muted'),text('p',r.text));article.append(response);}
 threads.append(article);}
 if(!selectedComments.length)threads.append(text('p','No feedback on this version yet.','muted'));
}
el('send').onclick=()=>perform(async()=>{const message=el('comment').value.trim();if(!message)throw new Error('Write a comment first.');const raw=el('seconds').value,asset=current();const body={...versionBody(),text:message};if(replyId)body.parentId=replyId;if(raw!==''&&['video','audio'].includes(asset.kind))body.timeSeconds=Number(raw);state=await api('/comments','POST',body);el('comment').value='';el('seconds').value='';replyId=undefined;el('reply-label').textContent='';el('cancel-reply').classList.add('hidden');render();});
el('cancel-reply').onclick=()=>{replyId=undefined;el('reply-label').textContent='';el('cancel-reply').classList.add('hidden');};
el('playhead').onclick=()=>{const player=el('stage').querySelector('video,audio');if(player)el('seconds').value=player.currentTime.toFixed(1);};
function decision(value){return perform(async()=>{state=await api('/decisions','POST',{...versionBody(),decision:value,note:el('decision-note').value});el('decision-note').value='';render();});}
el('approve').onclick=()=>decision('approved');el('changes').onclick=()=>decision('changes-requested');
el('refresh').onclick=async()=>{try{await load();status('Review refreshed.');}catch(error){status(error.message);}};
(async()=>{const invitation=new URLSearchParams(location.hash.slice(1)).get('invite');if(location.hash)history.replaceState(null,'',location.pathname+location.search);try{if(invitation)await api('/session','POST',{token:invitation});await load();status('');}catch(error){el('subtitle').textContent='Use the complete invitation link supplied by the project owner.';status(error.message);}})();
</script></body></html>`;
}
