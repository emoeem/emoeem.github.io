/* GitHub -> Hexo documentation sync engine. */
(function(){
'use strict';
const KEY='blog_sync_mappings_v1';
const MAP_PATH='source/_data/sync-mappings.json';
const S={mappings:[],results:[],running:false,mapSha:null};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const token=()=>localStorage.getItem('blog_gh_token')||'';
const load=()=>{try{S.mappings=JSON.parse(localStorage.getItem(KEY)||'[]')}catch{S.mappings=[]}};
const save=()=>localStorage.setItem(KEY,JSON.stringify(S.mappings));
const api=async(path,method='GET',body)=>{
 const r=await fetch('https://api.github.com/'+path,{method,headers:{Authorization:'Bearer '+token(),Accept:'application/vnd.github+json','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 if(!r.ok){let e={};try{e=await r.json()}catch{};throw Error(e.message||r.status+' '+r.statusText)}
 return r.status===204?null:r.json()
};
const dec=s=>{const b=Uint8Array.from(atob(s.replace(/\n/g,'')),c=>c.charCodeAt(0));return new TextDecoder().decode(b)};
const enc=s=>btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const splitFM=t=>{const m=t.match(/^---\n([\s\S]*?)\n---\n(?:\n)?([\s\S]*)$/);return m?{raw:m[1],body:m[2]}:{raw:'',body:t}};
const stripFM=t=>splitFM(t).body;
const parseFM=t=>{const x=splitFM(t);try{return x.raw?((window.jsyaml&&window.jsyaml.load(x.raw))||{}):{}}catch(e){console.warn('frontmatter parse failed',e);return{}}};
const defaults=()=>[
{id:'fish',name:'Fish 配置',enabled:false,owner:'',repo:'',branch:'main',path:'',target:'source/_posts/CachyOS-Fish-终端完全配置指南.md',metadata:{title:'CachyOS Fish 终端完全配置指南',categories:'技术',tags:['Fish','Linux','Shell','配置优化'],environment:'CachyOS / Fish',series:'配置指南',seriesOrder:1}},
{id:'neovim',name:'Neovim 配置',owner:'emoeem',repo:'neovim',branch:'main',path:'NVIM_CONFIG.md',target:'source/_posts/nvim配置.md',metadata:{title:'Neovim 配置',categories:'技术',tags:['Neovim','Linux','配置优化'],environment:'CachyOS / Neovim',series:'配置指南',seriesOrder:2}},
{id:'yazi',name:'Yazi 配置',owner:'emoeem',repo:'yazi',branch:'main',path:'README.md',target:'source/_posts/yazi配置.md',metadata:{title:'Yazi 配置',categories:'技术',tags:['Yazi','Linux','文件管理','配置优化'],environment:'CachyOS / Yazi',series:'配置指南',seriesOrder:3}}
];
function ensure(){load();if(!S.mappings.length){S.mappings=defaults();save()}}
async function hydrate(){if(!token())return;try{const r=await api('repos/emoeem/blog-source/contents/'+MAP_PATH);S.mappings=JSON.parse(dec(r.content));S.mapSha=r.sha;save();render()}catch(e){console.warn('sync mapping file unavailable:',e.message)}}
async function persistMappings(){const content=JSON.stringify(S.mappings,null,2)+'\\n';const body={message:'chore: update sync mappings',content:enc(content),branch:'main'};if(S.mapSha)body.sha=S.mapSha;const r=await api('repos/emoeem/blog-source/contents/'+MAP_PATH,'PUT',body);S.mapSha=r.content?.sha||r.sha||S.mapSha;save()}
function fm(meta){return '---\n'+jsyaml.dump(meta,{lineWidth:-1,noRefs:true}).trimEnd()+'\n---\n\n'}
async function source(m){const r=await api('repos/'+m.owner+'/'+m.repo+'/contents/'+m.path+'?ref='+encodeURIComponent(m.branch||'main'));if(r.type!=='file')throw Error('源路径不是文件');const cs=await api('repos/'+m.owner+'/'+m.repo+'/commits?path='+encodeURIComponent(m.path)+'&sha='+encodeURIComponent(m.branch||'main')+'&per_page=1');const c=cs[0];return{content:dec(r.content),sha:r.sha,commit:c?.sha||r.sha,date:c?.commit?.committer?.date||c?.commit?.author?.date||new Date().toISOString()}}
async function target(path){try{return await api('repos/emoeem/blog-source/contents/'+path)}catch(e){if(/404/.test(e.message))return null;throw e}}
async function syncOne(m,dry){
 const src=await source(m),old=await target(m.target),oldFM=old?parseFM(dec(old.content)):{};
 if(oldFM.syncCommit&&oldFM.syncCommit===src.commit)return{...m,status:'unchanged',commit:src.commit,date:src.date};
 const meta={...oldFM,...(m.metadata||{}),title:(m.metadata?.title||oldFM.title||m.name),lastVerified:src.date,syncSource:m.owner+'/'+m.repo,syncPath:m.path,syncCommit:src.commit,syncEditUrl:'https://github.com/'+m.owner+'/'+m.repo+'/edit/'+encodeURIComponent(m.branch||'main')+'/'+m.path.split('/').map(encodeURIComponent).join('/')};
 const content=fm(meta)+stripFM(src.content).replace(/^\n+/,'');
 if(dry)return{...m,status:'changed',commit:src.commit,date:src.date,content};
 const body={message:'sync: '+meta.title,content:enc(content),branch:'main'};if(old)body.sha=old.sha;
 await api('repos/emoeem/blog-source/contents/'+m.target,'PUT',body);
 return{...m,status:'synced',commit:src.commit,date:src.date}
}
async function all(dry){if(S.running)return;S.running=true;S.results=[];render();for(const m of S.mappings){if(m.enabled===false){S.results.push({...m,status:'pending'});continue}try{S.results.push(await syncOne(m,dry))}catch(e){S.results.push({...m,status:'error',error:e.message})}render()}S.running=false;render()}
function label(r){return r?.status==='synced'?'已同步':r?.status==='changed'?'有更新':r?.status==='unchanged'?'已是最新':r?.status==='error'?'失败':r?.status==='pending'?'待配置':'待检查'}
function render(){
 const v=document.getElementById('view-sync');if(!v)return;
 const cards=S.mappings.map(m=>{const r=S.results.find(x=>x.id===m.id);return '<article class="sync-card"><div class="sync-main"><div><span class="sync-kicker">'+esc(m.owner+'/'+m.repo)+'</span><h3>'+esc(m.name)+'</h3><p>'+esc(m.path)+' → '+esc(m.target)+'</p></div><span class="sync-status '+(r?.status||'pending')+'">'+label(r)+'</span></div><div class="sync-meta"><span>commit: <code>'+esc((r?.commit||'—').slice(0,12))+'</code></span><span>lastVerified: '+esc(r?.date||'—')+'</span></div><div class="sync-actions"><button class="secondary" data-check="'+esc(m.id)+'">检查</button><button data-sync="'+esc(m.id)+'">立即同步</button></div></article>'}).join('');
 v.innerHTML='<div class="page-head"><div><p class="kicker">DOCUMENTATION PIPELINE</p><h1>同步中心</h1><p>GitHub Markdown 是配置文档源，Hexo 文章保留博客元数据。同步记录源 commit，并自动更新 lastVerified。</p></div><div><button class="secondary" id="syncDry">检查全部</button><button id="syncAll">同步全部</button></div></div><div class="sync-note"><i class="fa fa-info-circle"></i>第一批映射：Fish / Neovim / Yazi。首次同步先检查源路径。</div><div class="sync-list">'+cards+'</div><div class="panel sync-config"><div class="panel-head"><h2>同步映射</h2><button class="secondary" id="addSync">添加映射</button></div><div class="sync-form" id="syncForm" hidden><input id="smId" placeholder="ID"><input id="smName" placeholder="名称"><input id="smOwner" placeholder="owner"><input id="smRepo" placeholder="repo"><input id="smBranch" placeholder="branch"><input id="smPath" placeholder="GitHub Markdown 路径"><input id="smTarget" placeholder="Hexo 文章路径"><input id="smTitle" placeholder="博客标题（可选）"><input id="smEnv" placeholder="environment（可选）"><button id="saveSync">保存映射</button></div><div class="mapping-table">'+S.mappings.map(m=>'<div><code>'+esc(m.id)+'</code><span>'+esc(m.owner+'/'+m.repo+'/'+m.path)+'</span><span>→ '+esc(m.target)+'</span><button class="text-btn" data-del="'+esc(m.id)+'">删除</button></div>').join('')+'</div></div>';
 document.getElementById('syncAll').onclick=()=>all(false);document.getElementById('syncDry').onclick=()=>all(true);
 document.querySelectorAll('[data-sync]').forEach(b=>b.onclick=async()=>{const m=S.mappings.find(x=>x.id===b.dataset.sync);try{const r=await syncOne(m,false);S.results=[...S.results.filter(x=>x.id!==m.id),r];render();toast('已同步 '+m.name)}catch(e){toast('同步失败：'+e.message,'error')}});
 document.querySelectorAll('[data-check]').forEach(b=>b.onclick=async()=>{const m=S.mappings.find(x=>x.id===b.dataset.check);try{const r=await syncOne(m,true);S.results=[...S.results.filter(x=>x.id!==m.id),r];render()}catch(e){toast('检查失败：'+e.message,'error')}});
 document.getElementById('addSync').onclick=()=>document.getElementById('syncForm').hidden=false;document.getElementById('saveSync').onclick=saveMap;
 document.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{if(!confirm('删除这个同步映射？'))return;S.mappings=S.mappings.filter(x=>x.id!==b.dataset.del);save();try{await persistMappings();toast('同步映射已删除')}catch(e){toast('本地已删除，但写入 GitHub 失败：'+e.message,'error')}render()})
}
async function saveMap(){const g=id=>document.getElementById(id).value.trim(),id=g('smId'),name=g('smName'),owner=g('smOwner'),repo=g('smRepo'),path=g('smPath'),target=g('smTarget');if(!id||!name||!owner||!repo||!path||!target)return toast('请填写完整映射','error');S.mappings=[...S.mappings.filter(x=>x.id!==id),{id,name,owner,repo,branch:g('smBranch')||'main',path,target,metadata:{title:g('smTitle')||undefined,environment:g('smEnv')||undefined}}];save();try{await persistMappings();toast('同步映射已保存')}catch(e){toast('本地已保存，但写入 GitHub 失败：'+e.message,'error')}render()}
function addUI(){ensure();if(!document.getElementById('view-sync')){const s=document.createElement('section');s.id='view-sync';s.className='view';document.querySelector('.main').appendChild(s)}if(!document.querySelector('[data-view="sync"]')){const b=document.createElement('button');b.className='nav-item';b.dataset.view='sync';b.innerHTML='<i class="fa fa-refresh"></i><span>同步中心</span>';document.querySelector('.sidebar .side-group:last-of-type').before(b);b.onclick=()=>{document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));document.getElementById('view-sync').classList.add('active');document.getElementById('mobileTitle').textContent='同步中心';render()}}render()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{addUI();hydrate()});else{addUI();hydrate()}
})();
