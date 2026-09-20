/* GitHub -> Hexo documentation sync/discovery center. */
(function(){
'use strict';
const KEY='blog_sync_mappings_v1', MAP_PATH='source/_data/sync-mappings.json';
const S={mappings:[],results:[],running:false,mapSha:null,repo:null,tree:[],selected:new Set(),ignored:new Set()};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const token=()=>localStorage.getItem('blog_gh_token')||'';
const load=()=>{try{S.mappings=JSON.parse(localStorage.getItem(KEY)||'[]')}catch{S.mappings=[]}};
const save=()=>localStorage.setItem(KEY,JSON.stringify(S.mappings));
const api=async(path,method='GET',body)=>{const r=await fetch('https://api.github.com/'+path,{method,headers:{Authorization:'Bearer '+token(),Accept:'application/vnd.github+json','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok){let e={};try{e=await r.json()}catch{};throw Error(e.message||r.status+' '+r.statusText)}return r.status===204?null:r.json()};
const dec=s=>{const b=Uint8Array.from(atob(s.replace(/\n/g,'')),c=>c.charCodeAt(0));return new TextDecoder().decode(b)};
const enc=s=>btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const splitFM=t=>{const m=t.match(/^---\n([\s\S]*?)\n---\n(?:\n)?([\s\S]*)$/);return m?{raw:m[1],body:m[2]}:{raw:'',body:t}};
const stripFM=t=>splitFM(t).body;
const parseFM=t=>{const x=splitFM(t);try{return x.raw?((window.jsyaml&&window.jsyaml.load(x.raw))||{}):{}}catch{return{}}};
const fm=meta=>'---\n'+jsyaml.dump(meta,{lineWidth:-1,noRefs:true}).trimEnd()+'\n---\n\n';
const slug=s=>String(s).toLowerCase().replace(/[^\w\u4e00-\u9fff-]+/g,'-').replace(/^-+|-+$/g,'')||'github-doc';
const titleOf=(path,body)=>{const h=body.match(/^#\s+(.+?)\s*#*$/m);return h?h[1].trim():path.split('/').pop().replace(/\.md$/i,'').replace(/[-_]+/g,' ')};
const topics=r=>Array.isArray(r?.topics)?r.topics:[];
function ensure(){load();render()}
async function hydrate(){if(!token())return;try{const r=await api('repos/emoeem/blog-source/contents/'+MAP_PATH);S.mappings=JSON.parse(dec(r.content));S.mapSha=r.sha;save();render()}catch(e){console.warn(e.message)}}
async function persistMappings(){const content=JSON.stringify(S.mappings,null,2)+'\n';const body={message:'chore: update sync mappings',content:enc(content),branch:'main'};if(S.mapSha)body.sha=S.mapSha;const r=await api('repos/emoeem/blog-source/contents/'+MAP_PATH,'PUT',body);S.mapSha=r.content?.sha||r.sha||S.mapSha;save()}
async function discover(url){
 if(!token())throw Error('请先在「设置」中配置 GitHub Token');
 const m=url.trim().match(/^https?:\/\/github\.com\/([^/]+)\/([^/#?]+)(?:\/tree\/([^/#?]+))?/);if(!m)throw Error('请输入 GitHub 仓库地址，例如 https://github.com/emoeem/voicefox');
 const owner=m[1],repo=m[2].replace(/\.git$/,''),branch=m[3]||'main';
 const info=await api('repos/'+owner+'/'+repo),tree=await api('repos/'+owner+'/'+repo+'/git/trees/'+encodeURIComponent(branch)+'?recursive=1');
 if(tree.truncated)throw Error('仓库文件树过大，GitHub 返回了截断结果，请改用较小的 docs 子目录');
 const files=(tree.tree||[]).filter(x=>x.type==='blob'&&/\.md$/i.test(x.path)&&!/(^|\/)(node_modules|vendor|dist|build|target)\//.test(x.path));
 const mapped=new Set(S.mappings.filter(x=>x.owner===owner&&x.repo===repo).map(x=>x.path));
 S.repo={owner,repo,branch,name:info.full_name,topics:topics(info),description:info.description||''};
 S.tree=[];
 for(const f of files){
   let body='';try{const raw=await api('repos/'+owner+'/'+repo+'/contents/'+f.path+'?ref='+encodeURIComponent(branch));body=dec(raw.content)}catch{}
   const existing=S.mappings.find(x=>x.owner===owner&&x.repo===repo&&x.path===f.path);
   S.tree.push({...f,title:titleOf(f.path,body),selected:!!existing,ignored:!existing&&/(^|\/)(CHANGELOG|LICENSE|CODE_OF_CONDUCT|CONTRIBUTING|SECURITY|SUPPORT|THIRD_PARTY|vendor|examples?)\b/i.test(f.path),existing,body,topics:S.repo.topics});
 }
 S.selected=new Set(S.tree.filter(x=>x.selected).map(x=>x.path));S.ignored=new Set(S.tree.filter(x=>x.ignored).map(x=>x.path));render();
}
function defaultTarget(f){return 'source/_posts/'+slug(f.title)+'.md'}
function metadataFor(f){return{title:f.title,categories:'技术',tags:f.topics||[],syncBranch:S.repo.branch,syncSource:S.repo.owner+'/'+S.repo.repo,syncPath:f.path}}
function addSelected(){const chosen=S.tree.filter(f=>S.selected.has(f.path)&&!S.ignored.has(f.path));if(!chosen.length)return toast('请先选择要纳入博客的 Markdown','error');
 for(const f of chosen){const id='github-'+S.repo.owner+'-'+S.repo.repo+'-'+f.path.replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').toLowerCase();if(S.mappings.some(x=>x.id===id))continue;S.mappings.push({id,name:f.title,owner:S.repo.owner,repo:S.repo.repo,branch:S.repo.branch,path:f.path,target:defaultTarget(f),metadata:metadataFor(f),enabled:true})}
 save();persistMappings().then(()=>toast('已建立 '+chosen.length+' 个同步映射')).catch(e=>toast('本地已保存，写回 GitHub 失败：'+e.message,'error'));render()}
async function source(m){const r=await api('repos/'+m.owner+'/'+m.repo+'/contents/'+m.path+'?ref='+encodeURIComponent(m.branch||'main'));if(r.type!=='file')throw Error('源路径不是文件');const cs=await api('repos/'+m.owner+'/'+m.repo+'/commits?path='+encodeURIComponent(m.path)+'&sha='+encodeURIComponent(m.branch||'main')+'&per_page=1');const c=cs[0];return{content:dec(r.content),sha:r.sha,commit:c?.sha||r.sha,date:c?.commit?.committer?.date||new Date().toISOString()}}
async function target(path){try{return await api('repos/emoeem/blog-source/contents/'+path)}catch(e){if(/404/.test(e.message))return null;throw e}}
async function syncOne(m,dry){const src=await source(m),old=await target(m.target),oldFM=old?parseFM(dec(old.content)):{};if(oldFM.syncCommit===src.commit)return{...m,status:'unchanged',commit:src.commit,date:src.date};
 const meta={...oldFM,...(m.metadata||{}),title:(m.metadata?.title||oldFM.title||m.name),lastVerified:src.date,syncSource:m.owner+'/'+m.repo,syncPath:m.path,syncCommit:src.commit,syncBranch:m.branch||'main',syncEditUrl:'https://github.com/'+m.owner+'/'+m.repo+'/edit/'+encodeURIComponent(m.branch||'main')+'/'+m.path.split('/').map(encodeURIComponent).join('/')};
 const content=fm(meta)+stripFM(src.content).replace(/^\n+/,'');if(dry)return{...m,status:'changed',commit:src.commit,date:src.date,content};
 const body={message:'sync: '+meta.title,content:enc(content),branch:'main'};if(old)body.sha=old.sha;await api('repos/emoeem/blog-source/contents/'+m.target,'PUT',body);return{...m,status:'synced',commit:src.commit,date:src.date}}
async function all(dry){if(S.running)return;S.running=true;S.results=[];render();for(const m of S.mappings.filter(x=>x.enabled!==false)){try{S.results.push(await syncOne(m,dry))}catch(e){S.results.push({...m,status:'error',error:e.message})}render()}S.running=false;render()}
function label(r){return r?.status==='synced'?'已同步':r?.status==='changed'?'有更新':r?.status==='unchanged'?'已是最新':r?.status==='error'?'失败':'待检查'}
function renderDiscovery(){
 const v=document.getElementById('sync-discovery');if(!v)return;
 if(!S.repo){v.innerHTML='<div class="sync-empty"><i class="fa fa-github"></i><h3>输入 GitHub 仓库开始</h3><p>系统会自动读取完整 Markdown 文件树、仓库 Topics，并识别已经建立的同步映射。</p></div>';return}
 const groups={};S.tree.forEach(f=>(groups[f.path.includes('/')?f.path.split('/').slice(0,-1).join('/'):'根目录']??=[]).push(f));
 const tree=Object.entries(groups).map(([dir,files])=>'<div class="md-tree-group"><div class="md-tree-dir"><i class="fa fa-folder-o"></i>'+esc(dir)+'</div>'+files.map(f=>'<label class="md-tree-file '+(f.ignored?'ignored':'')+'"><input type="checkbox" data-md="'+esc(f.path)+'" '+(S.selected.has(f.path)&&!f.ignored?'checked':'')+'><i class="fa fa-file-text-o"></i><span>'+esc(f.title)+'</span><small>'+esc(f.path)+'</small>'+(f.existing?'<b>已同步</b>':'')+'</label>').join('')+'</div>').join('');
 v.innerHTML='<div class="sync-repo-head"><div><span class="sync-kicker">GITHUB REPOSITORY</span><h2>'+esc(S.repo.name)+'</h2><p>'+esc(S.repo.description)+'</p><div class="sync-topics">'+S.repo.topics.map(x=>'<span>'+esc(x)+'</span>').join('')+'</div></div><button class="secondary" id="rediscover">重新检索</button></div><div class="sync-tree-toolbar"><span>共 '+S.tree.length+' 个 Markdown</span><button class="text-btn" id="selectAllMd">全选</button><button class="text-btn" id="clearMd">清空</button><button id="addMd">建立同步映射</button></div><div class="md-tree">'+tree+'</div>';
 document.querySelectorAll('[data-md]').forEach(x=>x.onchange=()=>{const p=x.dataset.md;if(x.checked)S.selected.add(p);else S.selected.delete(p);renderDiscovery()});
 $('rediscover').onclick=()=>discover('https://github.com/'+S.repo.owner+'/'+S.repo.repo);
 $('selectAllMd').onclick=()=>{S.tree.forEach(f=>{if(!f.ignored)S.selected.add(f.path)});renderDiscovery()};
 $('clearMd').onclick=()=>{S.selected.clear();renderDiscovery()};$('addMd').onclick=addSelected;
}
function render(){
 const v=document.getElementById('view-sync');if(!v)return;
 const cards=S.mappings.map(m=>{const r=S.results.find(x=>x.id===m.id);return '<article class="sync-card"><div class="sync-main"><div><span class="sync-kicker">'+esc(m.owner+'/'+m.repo)+'</span><h3>'+esc(m.name)+'</h3><p>'+esc(m.path)+' → '+esc(m.target)+'</p></div><span class="sync-status '+(r?.status||'pending')+'">'+label(r)+'</span></div><div class="sync-meta"><span>commit: <code>'+esc((r?.commit||'—').slice(0,12))+'</code></span><span>lastVerified: '+esc(r?.date||'—')+'</span></div><div class="sync-actions"><button class="secondary" data-check="'+esc(m.id)+'">检查</button><button data-sync="'+esc(m.id)+'">立即同步</button></div></article>'}).join('');
 v.innerHTML='<div class="page-head"><div><p class="kicker">DOCUMENTATION PIPELINE</p><h1>同步中心</h1><p>输入任意 GitHub 仓库，自动发现 Markdown；选择后建立映射。标题取 Markdown H1，标签默认取 GitHub Topics，均可在映射中修改。</p></div><div><button class="secondary" id="syncDry">检查全部</button><button id="syncAll">同步全部</button></div></div><div class="sync-import panel"><div class="panel-head"><h2>GitHub 文档发现</h2><span>递归扫描 Markdown</span></div><div class="github-url-row"><input id="githubUrl" placeholder="https://github.com/emoeem/voicefox"><button id="discoverBtn"><i class="fa fa-search"></i> 检索文档</button></div><p class="setting-help">默认忽略常见许可证、贡献指南、变更日志等非文章文档；你仍可自行取消选择。不会自动同步任何 Markdown。</p></div><div id="sync-discovery"></div><div class="sync-list">'+cards+'</div><div class="panel sync-config"><div class="panel-head"><h2>已建立的同步映射</h2></div><div class="mapping-table">'+S.mappings.map(m=>'<div><code>'+esc(m.id)+'</code><span>'+esc(m.owner+'/'+m.repo+'/'+m.path)+'</span><span>→ '+esc(m.target)+'</span><button class="text-btn" data-del="'+esc(m.id)+'">删除</button></div>').join('')+'</div></div>';
 $('discoverBtn').onclick=()=>discover($('githubUrl').value);$('syncAll').onclick=()=>all(false);$('syncDry').onclick=()=>all(true);
 document.querySelectorAll('[data-sync]').forEach(b=>b.onclick=async()=>{const m=S.mappings.find(x=>x.id===b.dataset.sync);try{const r=await syncOne(m,false);S.results=[...S.results.filter(x=>x.id!==m.id),r];render();toast('已同步 '+m.name)}catch(e){toast('同步失败：'+e.message,'error')}});
 document.querySelectorAll('[data-check]').forEach(b=>b.onclick=async()=>{const m=S.mappings.find(x=>x.id===b.dataset.check);try{const r=await syncOne(m,true);S.results=[...S.results.filter(x=>x.id!==m.id),r];render()}catch(e){toast('检查失败：'+e.message,'error')}});
 document.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{if(!confirm('删除这个同步映射？不会删除博客文章。'))return;S.mappings=S.mappings.filter(x=>x.id!==b.dataset.del);save();try{await persistMappings();toast('同步映射已删除')}catch(e){toast('本地已删除，但写入 GitHub 失败：'+e.message,'error')}render()});renderDiscovery();
}
function addUI(){ensure();if(!document.getElementById('view-sync')){const s=document.createElement('section');s.id='view-sync';s.className='view';document.querySelector('.main').appendChild(s)}if(!document.querySelector('[data-view="sync"]')){const b=document.createElement('button');b.className='nav-item';b.dataset.view='sync';b.innerHTML='<i class="fa fa-refresh"></i><span>同步中心</span>';document.querySelector('.sidebar .side-group:last-of-type').before(b);b.onclick=()=>{document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));document.getElementById('view-sync').classList.add('active');document.getElementById('mobileTitle').textContent='同步中心';render()}}render()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{addUI();hydrate()});else{addUI();hydrate()}
})();