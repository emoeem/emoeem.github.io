import {createGithubApi,parseGithubUrl,isMarkdown,ignoredByDefault,excludedDir,scanRepository} from './sync/github-api.js';
import {parseFrontMatter,titleFromDocument,parseReferences} from './sync/document-parser.js';
import {createMappingStore,mappingId} from './sync/mapping-store.js';
import {createSyncEngine} from './sync/sync-engine.js';

(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api=createGithubApi();
const store=createMappingStore({api,encode:api.encode,decode:api.decode});
const engine=createSyncEngine({api,store});
const S={repo:null,tree:[],selected:new Set(),open:new Set(),active:null,configs:{},results:[],running:false,detailToken:0};

function toast(t,type='success'){if(window.toast)window.toast(t,type);else console[type==='error'?'error':'log'](t)}
function connectionLabel(){const st=api.status();if(!st.online)return '<span class="sync-connection offline">● GitHub API 离线 · 使用缓存</span>';if(st.usingCache)return '<span class="sync-connection cached">● GitHub API · ETag/缓存</span>';return '<span class="sync-connection online">● GitHub API 在线</span>'}
function lineDiff(a,b){
  const A=String(a||'').split('\n'),B=String(b||'').split('\n');
  if(A.length>2200||B.length>2200||A.length*B.length>4000000)return {large:true,rows:[...A.slice(0,120).map(x=>({type:'del',text:x})),{type:'meta',text:`文档较大，已省略中间内容（源 ${A.length} 行 / 本地 ${B.length} 行）`},...B.slice(-120).map(x=>({type:'add',text:x}))]};
  const dp=Array.from({length:A.length+1},()=>new Uint16Array(B.length+1));
  for(let i=A.length-1;i>=0;i--)for(let j=B.length-1;j>=0;j--)dp[i][j]=A[i]===B[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
  const rows=[];let i=0,j=0;
  while(i<A.length||j<B.length){
    if(i<A.length&&j<B.length&&A[i]===B[j]){rows.push({type:'same',text:A[i]});i++;j++;continue}
    if(j<B.length&&(i===A.length||dp[i][j+1]>=dp[i+1][j])){rows.push({type:'add',text:B[j++]});continue}
    if(i<A.length){rows.push({type:'del',text:A[i++]});continue}
  }
  return {large:false,rows};
}
async function showDiff(id){
  const m=store.mappings.find(x=>x.id===id);if(!m)return;
  const modal=$('sync-diff-modal'),body=$('sync-diff-body');if(!modal||!body)return;
  body.innerHTML='<div class="sync-empty">正在读取 GitHub 与博客版本…</div>';modal.hidden=false;
  try{const d=await engine.diffOne(m),diff=lineDiff(d.target,d.source);body.innerHTML='<div class="sync-diff-head"><div><strong>'+esc(m.name)+'</strong><span>'+esc(m.owner+'/'+m.repo+'/'+m.path)+' → '+esc(m.target)+'</span></div><div class="sync-diff-commits"><span>源 '+esc((d.sourceCommit||'').slice(0,12))+'</span><span>本地 '+esc(String(d.targetMeta?.syncCommit||'').slice(0,12)||'—')+'</span></div></div><div class="sync-diff-legend"><span class="diff-add">+ GitHub</span><span class="diff-del">− 本地</span><span>· 未变化</span></div><div class="sync-diff-lines">'+diff.rows.map((r,i)=>'<div class="diff-line '+(r.type==='add'?'diff-add-bg':r.type==='del'?'diff-del-bg':r.type==='meta'?'diff-meta':'')+'"><span>'+String(i+1)+'</span><code>'+esc(r.type==='add'?'+ '+r.text:r.type==='del'?'- '+r.text:'  '+r.text)+'</code></div>').join('')+'</div>'}catch(e){body.innerHTML='<div class="sync-empty">Diff 读取失败：'+esc(e.message)+'</div>'}
}
function closeDiff(){const m=$('sync-diff-modal');if(m)m.hidden=true}
async function toggleRepository(key){const r=store.repositories[key];if(!r)return;r.enabled=r.enabled===false;try{await store.save();toast(r.enabled===false?'仓库已暂停':'仓库已恢复')}catch(e){toast('仓库状态保存失败：'+e.message,'error')}render()}
async function rescanRepository(key){const r=store.repositories[key];if(!r)return;try{await discover('https://github.com/'+r.owner+'/'+r.repo);toast('已重新扫描 '+r.owner+'/'+r.repo)}catch(e){toast('重新扫描失败：'+e.message,'error')}}
function renderRepositories(){
  const v=$('sync-repositories');if(!v)return;const repos=Object.values(store.repositories);
  if(!repos.length){v.innerHTML='';return}
  v.innerHTML='<section class="sync-repositories panel"><div class="panel-head"><h2>Repository Management</h2><span>'+repos.length+' 个已注册仓库</span></div><div class="sync-repo-list">'+repos.map(r=>{const key=store.repoKey(r),docs=Object.values(r.documents||{}),mapped=docs.filter(x=>x.mapped).length,pending=S.results.filter(x=>x.owner===r.owner&&x.repo===r.repo&&['changed','conflict','local-modified','unmapped','source-deleted','error'].includes(x.status)).length;return '<article class="sync-repo-card"><div><span class="sync-kicker">GITHUB REPOSITORY</span><h3>'+esc(r.owner+'/'+r.repo)+'</h3><p>branch: '+esc(r.branch||'main')+' · '+docs.length+' 个 Registry 文档 · '+mapped+' 个已映射 · '+pending+' 个待处理</p></div><div class="sync-repo-card-meta"><span class="sync-status '+(r.enabled===false?'new':'unchanged')+'">'+(r.enabled===false?'已暂停':'运行中')+'</span><button class="secondary" data-repo-scan="'+esc(key)+'">重新扫描</button><button class="text-btn" data-repo-toggle="'+esc(key)+'">'+(r.enabled===false?'恢复':'暂停')+'</button></div></article>'}).join('')+'</div></section>';
  v.querySelectorAll('[data-repo-scan]').forEach(b=>b.onclick=()=>rescanRepository(b.dataset.repoScan));
  v.querySelectorAll('[data-repo-toggle]').forEach(b=>b.onclick=()=>toggleRepository(b.dataset.repoToggle));
}
function defaultTarget(title){return 'source/_posts/'+String(title).toLowerCase().replace(/[^\w\u4e00-\u9fff-]+/g,'-').replace(/^-+|-+$/g,'')+'.md'}
function repoState(){return store.ensureRepository(S.repo)}
function configFor(f){
  if(S.configs[f.path])return S.configs[f.path];
  const old=store.find(S.repo.owner,S.repo.repo,f.path),meta=old?.metadata||{};
  S.configs[f.path]={title:meta.title||f.title,summary:meta.summary||S.repo.description||'',tags:[...(meta.tags||S.repo.topics||[])],category:meta.categories||'技术',target:old?.target||defaultTarget(meta.title||f.title)};
  return S.configs[f.path];
}
async function discover(url){
  const parsed=parseGithubUrl(url),found=await scanRepository(api,parsed);
  S.repo={owner:parsed.owner,repo:parsed.repo,branch:found.branch,name:found.info.full_name,description:found.info.description||'',topics:Array.isArray(found.info.topics)?found.info.topics:[]};
  const rs=repoState();rs.branch=found.branch;
  const docs=[];
  for(const f of found.tree.filter(x=>x.type==='blob'&&isMarkdown(x.path)&&!excludedDir(x.path))){
    const old=store.find(S.repo.owner,S.repo.repo,f.path),registry=store.getDocument(S.repo,f.path);
    const title=registry?.title||old?.metadata?.title||f.path.split('/').pop().replace(/\.md$/i,'');
    const ignored=rs.ignoredPaths.includes(f.path)||ignoredByDefault(f.path),mapped=!!old;const nextDoc={title,sha:f.sha,size:f.size,ignored,mapped,status:ignored?'ignored':mapped?'mapped':'unmapped'};if(!registry||registry.sha!==f.sha)nextDoc.lastSeen=new Date().toISOString();store.upsertDocument(S.repo,f.path,nextDoc);
    docs.push({...f,title,body:'',meta:{},existing:old,ignored:rs.ignoredPaths.includes(f.path)||ignoredByDefault(f.path)});
  }
  await store.save();
  S.tree=docs;S.selected=new Set(docs.filter(x=>x.existing&&!x.ignored).map(x=>x.path));
  S.active=docs[0]?.path||null;render();
}
function folderFiles(dir){return S.tree.filter(f=>f.path===dir||f.path.startsWith(dir+'/'))}
function folderState(dir){
  const fs=folderFiles(dir).filter(f=>!f.ignored),n=fs.filter(f=>S.selected.has(f.path)).length;
  return n===0?'empty':n===fs.length?'full':'partial';
}
function toggleFolder(dir){
  const fs=folderFiles(dir).filter(f=>!f.ignored),state=folderState(dir);
  fs.forEach(f=>state==='full'?S.selected.delete(f.path):S.selected.add(f.path));renderTree();
}
function toggleFile(path,checked){if(checked)S.selected.add(path);else S.selected.delete(path);renderTree()}
function toggleDir(dir){S.open.has(dir)?S.open.delete(dir):S.open.add(dir);renderTree()}
function treeModel(){
  const roots=[],dirs=new Set();
  for(const f of S.tree){const parts=f.path.split('/');if(parts.length===1)roots.push({type:'file',file:f});else dirs.add(parts[0])}
  return {roots,dirs:[...dirs].sort()};
}
function renderBranch(prefix,depth=0){
  const immediate=S.tree.filter(f=>{const p=f.path.split('/');const pre=prefix?prefix.split('/').length:0;return f.path.startsWith(prefix?(prefix+'/'):'')&&p.length===pre+1});
  const base=prefix?prefix.split('/').length:0,dirs=new Set();
  S.tree.forEach(f=>{if(!f.path.startsWith(prefix?(prefix+'/'):''))return;const rest=f.path.slice((prefix?prefix+'/':'').length).split('/');if(rest.length>1)dirs.add(rest[0])});
  let html='';
  for(const dir of [...dirs].sort()){
    const path=prefix?prefix+'/'+dir:dir,state=folderState(path),open=S.open.has(path);
    html+='<div class="sync-dir"><div class="sync-dir-row" data-toggle-dir="'+esc(path)+'"><button class="tree-chevron">'+(open?'▾':'▸')+'</button><input type="checkbox" class="folder-check" data-folder="'+esc(path)+'" '+(state==='full'?'checked':'')+'><i class="fa fa-folder-o"></i><strong>'+esc(dir)+'</strong><span>'+folderFiles(path).length+'</span></div>';
    if(open)html+='<div class="sync-children">'+renderBranch(path,depth+1)+'</div></div>';
  }
  for(const f of immediate){
    html+='<label class="md-tree-file '+(f.ignored?'ignored ':'')+(S.active===f.path?'active':'')+'" data-file-row="'+esc(f.path)+'"><input type="checkbox" data-file="'+esc(f.path)+'" '+(S.selected.has(f.path)&&!f.ignored?'checked':'')+' '+(f.ignored?'disabled':'')+'><i class="fa fa-file-text-o"></i><span>'+esc(f.path.split('/').pop())+'</span><small>'+esc(f.path)+'</small><em class="doc-state '+(f.ignored?'ignored':f.existing?'synced':S.results.find(x=>x.path===f.path)?.status||'new')+'">'+(f.ignored?'忽略':f.existing?'已同步':'未导入')+'</em></label>';
  }
  return html;
}
function renderTree(){
  const v=$('sync-tree');if(!v)return;
  v.innerHTML=renderBranch('');
  v.querySelectorAll('[data-file]').forEach(x=>x.onchange=e=>toggleFile(x.dataset.file,e.target.checked));
  v.querySelectorAll('[data-file-row]').forEach(x=>x.onclick=e=>{if(e.target.tagName==='INPUT')return;S.active=x.dataset.file;renderDetails()});
  v.querySelectorAll('[data-toggle-dir]').forEach(x=>x.onclick=e=>{if(e.target.tagName==='INPUT')return;toggleDir(x.dataset.toggleDir)});
  v.querySelectorAll('[data-folder]').forEach(x=>{x.onclick=e=>e.stopPropagation();x.onchange=e=>toggleFolder(x.dataset.folder)});
  v.querySelectorAll('.folder-check').forEach(x=>{const s=folderState(x.dataset.folder);x.indeterminate=s==='partial'});
}
async function renderDetails(){
  const token=++S.detailToken;const v=$('sync-details'),f=S.tree.find(x=>x.path===S.active);if(!v)return;
  if(!f){v.innerHTML='<div class="sync-empty">选择一个 Markdown 查看配置</div>';return}
  if(!f.body){try{const r=await api.request('repos/'+S.repo.owner+'/'+S.repo.repo+'/contents/'+f.path+'?ref='+encodeURIComponent(S.repo.branch));f.body=api.decode(r.content);const fm=parseFrontMatter(f.body);f.meta=fm.meta;f.title=titleFromDocument(f.path,fm.body,fm.meta)}catch(e){f.body='';}}
  if(token!==S.detailToken)return;
  const c=configFor(f),refs=parseReferences(f.body);
  const missing=refs.links.filter(x=>/\.md(?:#|$)/i.test(x.url)).map(x=>x.url).filter(url=>{
    const clean=url.split('#')[0].split('?')[0],target=S.tree.find(x=>x.path.endsWith('/'+clean)||x.path===clean);return !target||(!target.existing&&!S.selected.has(target.path));
  });
  v.innerHTML='<div class="sync-detail-head"><div><span class="sync-kicker">DOCUMENT CONFIGURATION</span><h2>'+esc(f.title)+'</h2><p>'+esc(f.path)+'</p></div><div><button class="secondary" id="ignoreDoc">'+(f.ignored?'取消忽略':'忽略文档')+'</button></div></div>'+
    '<div class="sync-form-grid"><label>标题<input id="docTitle" value="'+esc(c.title)+'"></label><label>分类<input id="docCategory" value="'+esc(c.category)+'"></label><label class="wide">简介 <small>默认使用 GitHub About / Description，可修改</small><input id="docSummary" value="'+esc(c.summary||'')+'"></label><label class="wide">标签 <small>用逗号分隔，可覆盖 GitHub Topics</small><input id="docTags" value="'+esc(c.tags.join(', '))+'"></label><label class="wide">目标文章<input id="docTarget" value="'+esc(c.target)+'"></label></div>'+
    '<div class="sync-graph"><div><strong>Markdown 引用</strong><span>'+refs.links.length+' 个链接 · '+missing.length+' 个未导入引用</span></div><div class="graph-items">'+(refs.links.length?refs.links.map(x=>'<span class="'+(missing.includes(x.url)?'missing':'')+'">'+esc(x.text)+' → '+esc(x.url)+'</span>').join(''):'<small>没有 Markdown 链接</small>')+'</div></div>'+
    '<div class="sync-graph"><div><strong>图片 / 附件</strong><span>'+refs.images.length+' 个图片引用</span></div><div class="graph-items">'+(refs.images.length?refs.images.map(x=>'<span>'+esc(x.url)+'</span>').join(''):'<small>没有图片引用</small>')+'</div></div>'+
    '<div class="sync-detail-foot"><span>正文 '+f.body.length.toLocaleString()+' 字符</span><button id="saveDocConfig">保存文档配置</button></div>';
  $('saveDocConfig').onclick=async()=>{
    const n={title:$('docTitle').value.trim()||f.title,category:$('docCategory').value.trim()||'技术',summary:$('docSummary').value.trim(),tags:$('docTags').value.split(',').map(x=>x.trim()).filter(Boolean),target:$('docTarget').value.trim()||defaultTarget(f.title)};
    S.configs[f.path]=n;S.selected.add(f.path);renderDetails();renderTree();toast('文档配置已更新');
  };
  $('ignoreDoc').onclick=async()=>{
    const rs=repoState();if(f.ignored){rs.ignoredPaths=rs.ignoredPaths.filter(x=>x!==f.path);f.ignored=false}else{rs.ignoredPaths=[...new Set([...rs.ignoredPaths,f.path])];f.ignored=true;S.selected.delete(f.path)}
    await store.save();render();toast(f.ignored?'已加入忽略列表':'已取消忽略');
  };
}
async function establish(){
  const chosen=S.tree.filter(f=>S.selected.has(f.path)&&!f.ignored);
  if(!chosen.length)return toast('请先选择要纳入博客的 Markdown','error');
  for(const f of chosen){
    const c=configFor(f),old=store.find(S.repo.owner,S.repo.repo,f.path);
    const id=old?.id||mappingId(S.repo.owner,S.repo.repo,f.path);
    store.upsert({id,name:c.title,owner:S.repo.owner,repo:S.repo.repo,branch:S.repo.branch,path:f.path,target:c.target,
      metadata:{title:c.title,summary:c.summary,categories:c.category,tags:c.tags},enabled:true});
  }
  try{await store.save();toast('已建立 '+chosen.length+' 个同步映射')}catch(e){toast('本地状态已更新，但写回 GitHub 失败：'+e.message,'error')}
  render();
}
function deletedMappings(){
  if(!S.repo)return [];
  const paths=new Set(S.tree.map(x=>x.path));
  return store.mappings.filter(m=>m.owner===S.repo.owner&&m.repo===S.repo.repo&&!paths.has(m.path));
}
async function checkAll(){
  if(S.running)return;S.running=true;renderButtons();
  try{const results=[];for(const repo of Object.values(store.repositories)){if(repo.enabled===false)continue;const r=await engine.checkRepository(repo,store.mappings);results.push(...r.out);const live=new Set((r.scan.tree||[]).filter(x=>x.type==='blob'&&isMarkdown(x.path)&&!excludedDir(x.path)).map(x=>x.path));for(const f of (r.scan.tree||[]).filter(x=>x.type==='blob'&&isMarkdown(x.path)&&!excludedDir(x.path))){const prior=store.getDocument(repo,f.path),mapped=!!store.find(repo.owner,repo.repo,f.path),ignored=store.getDocument(repo,f.path)?.ignored===true,nextDoc={sha:f.sha,size:f.size,mapped,status:ignored?'ignored':mapped?'mapped':'unmapped'};if(!prior||prior.sha!==f.sha)nextDoc.lastSeen=new Date().toISOString();delete nextDoc.sourceDeletedAt;store.upsertDocument(repo,f.path,nextDoc)}for(const [path,doc] of Object.entries(repo.documents||{})){if(!live.has(path)&&doc.status!=='source-deleted'){doc.status='source-deleted';doc.sourceDeletedAt=new Date().toISOString()}}}S.results=results;for(const r of results){const m=store.mappings.find(x=>x.id===r.id);if(m){m.syncStatus=r.status;if(r.status==='source-deleted'){m.sourceDeletedAt ||= new Date().toISOString()}else{delete m.sourceDeletedAt}if(r.commit)m.syncCommit=r.commit;if(r.date)m.lastVerified=r.date}}await store.save()}catch(e){toast('检查全部失败：'+e.message,'error')}finally{S.running=false;render()}
}
async function syncAll(){
  if(S.running)return;S.running=true;renderButtons();
  try{
    const enabled=new Set(Object.values(store.repositories).filter(r=>r.enabled!==false).map(r=>store.repoKey(r)));
    S.results=await engine.syncAll(store.mappings.filter(m=>enabled.has(m.owner+'/'+m.repo)),false);
    for(const r of S.results){const m=store.mappings.find(x=>x.id===r.id);if(!m)continue;m.syncStatus=r.status;if(r.commit)m.syncCommit=r.commit;if(r.date)m.lastVerified=r.date}
    await store.save();
  }catch(e){toast('批量同步失败：'+e.message,'error')}
  finally{S.running=false;render()}
}
async function syncOne(id,force=false){
  const m=store.mappings.find(x=>x.id===id);if(!m)return;
  try{const r=force?await engine.syncOne(m,true):await engine.syncOne(m);m.syncStatus=r.status;if(r.commit)m.syncCommit=r.commit;if(r.date)m.lastVerified=r.date;await store.save();S.results=[...S.results.filter(x=>x.id!==id),r];render()}
  catch(e){toast('同步失败：'+e.message,'error')}
}
async function deleteMapping(id){
  if(!confirm('删除同步映射？不会删除现有博客文章。'))return;
  store.remove(id);try{await store.save();toast('同步映射已删除')}catch(e){toast('本地已删除，但写回 GitHub 失败：'+e.message,'error')}render();
}
function statusText(s){return {synced:'已同步',unchanged:'已是最新',changed:'有更新',conflict:'同步冲突','local-modified':'本地有修改','source-deleted':'源文件已删除',unmapped:'未建立映射',error:'失败',new:'未导入'}[s]||'待检查'}
function statusClass(s){return s||'new'}
function renderButtons(){['discoverBtn','checkAllBtn','syncAllBtn','establishBtn'].forEach(id=>{const b=$(id);if(b)b.disabled=S.running})}
function renderDiscovery(){
  const v=$('sync-discovery');if(!v)return;
  if(!S.repo){v.innerHTML='<div class="sync-empty"><i class="fa fa-github"></i><h3>输入 GitHub 仓库开始</h3><p>扫描仓库元数据与 Markdown 文件树；不会自动导入正文。</p></div>';return}
  const selected=S.tree.filter(f=>S.selected.has(f.path)&&!f.ignored).length;
  v.innerHTML='<div class="sync-repo-head"><div><span class="sync-kicker">GITHUB REPOSITORY</span><h2>'+esc(S.repo.name)+'</h2><p>'+esc(S.repo.description)+'</p><div class="sync-topics">'+S.repo.topics.map(x=>'<span>'+esc(x)+'</span>').join('')+'</div></div><div class="repo-meta"><b>'+esc(S.repo.branch)+'</b><small>default branch</small><button class="secondary" id="rediscover">重新检索</button></div></div>'+
    '<div class="sync-tree-toolbar"><span>共 '+S.tree.length+' 个 Markdown · 已选择 '+selected+'</span><button class="text-btn" id="selectAllMd">全选</button><button class="text-btn" id="clearMd">清空</button><button class="secondary" id="establishBtn">仅建立映射</button><button id="importBtn">导入所选文章</button></div><div id="sync-tree" class="md-tree"></div>';
  renderTree();
  $('rediscover').onclick=()=>discover('https://github.com/'+S.repo.owner+'/'+S.repo.repo);
  const countEl=$('syncCount'); if(countEl) countEl.textContent=String(store.mappings.filter(m=>m.owner===S.repo.owner&&m.repo===S.repo.repo).length);
  $('selectAllMd').onclick=()=>{S.tree.forEach(f=>{if(!f.ignored)S.selected.add(f.path)});renderTree();renderDetails()};
  $('clearMd').onclick=()=>{S.selected.clear();renderTree();renderDetails()};
  $('establishBtn').onclick=establish;
  $('importBtn').onclick=async()=>{await establish(); if(S.running)return; const chosen=S.tree.filter(f=>S.selected.has(f.path)&&!f.ignored); if(!chosen.length)return; S.running=true;renderButtons(); try{S.results=await engine.syncAll(store.mappings.filter(m=>m.owner===S.repo.owner&&m.repo===S.repo.repo&&chosen.some(f=>f.path===m.path)),false);for(const r of S.results){const m=store.mappings.find(x=>x.id===r.id);if(m){m.syncStatus=r.status;if(r.commit)m.syncCommit=r.commit;if(r.date)m.lastVerified=r.date}}await store.save();toast('已导入 '+chosen.length+' 篇文章并建立同步关系');}catch(e){toast('导入失败：'+e.message,'error')} finally{S.running=false;render()}};
}
function renderMappings(){
  const list=store.mappings.map(m=>{
    const r=S.results.find(x=>x.id===m.id)||{status:m.syncStatus||'new',commit:m.syncCommit,date:m.lastVerified};
    const actions=(r.status==='local-modified'||r.status==='conflict')?'<button data-diff="'+esc(m.id)+'">查看 Diff</button><button data-force="'+esc(m.id)+'">覆盖本地</button>':r.status==='changed'?'<button data-diff="'+esc(m.id)+'">查看 Diff</button><button data-sync="'+esc(m.id)+'">立即同步</button>':'<button data-sync="'+esc(m.id)+'">立即同步</button>';
    return '<article class="sync-card"><div class="sync-main"><div><span class="sync-kicker">'+esc(m.owner+'/'+m.repo)+'</span><h3>'+esc(m.name)+'</h3><p>'+esc(m.path)+' → '+esc(m.target)+'</p></div><span class="sync-status '+statusClass(r.status)+'">'+statusText(r.status)+'</span></div><div class="sync-meta"><span>commit: <code>'+esc((r.commit||'—').slice(0,12))+'</code></span><span>lastVerified: '+esc(r.date||'—')+'</span></div><div class="sync-actions"><button class="secondary" data-check="'+esc(m.id)+'">检查</button>'+actions+'<button class="text-btn" data-del="'+esc(m.id)+'">删除映射</button></div></article>';
  }).join('');
  const unmapped=S.results.filter(r=>r.status==='unmapped');
  const unmappedHtml=unmapped.map(r=>'<article class="sync-card unmapped-card"><div class="sync-main"><div><span class="sync-kicker">'+esc(r.owner+'/'+r.repo)+'</span><h3>'+esc(r.name)+'</h3><p>'+esc(r.path)+'</p></div><span class="sync-status unmapped">未建立映射</span></div><div class="sync-actions"><button class="secondary" data-discover-path="'+esc(r.owner+'/'+r.repo+'/'+r.path)+'">去仓库检索并建立映射</button></div></article>').join('');
  const deleted=deletedMappings().filter(m=>!S.results.find(x=>x.id===m.id));
  const delHtml=deleted.map(m=>'<article class="sync-card deleted-card"><div><strong>⚠ 源文件已删除</strong><p>'+esc(m.owner+'/'+m.repo+'/'+m.path)+' → '+esc(m.target)+'</p></div><div class="sync-actions"><button class="secondary" data-del="'+esc(m.id)+'">停止同步（保留文章）</button></div></article>').join('');
  $('sync-list').innerHTML=unmappedHtml+delHtml+list;
  document.querySelectorAll('[data-discover-path]').forEach(b=>b.onclick=()=>{const parts=b.dataset.discoverPath.split('/');discover('https://github.com/'+parts[0]+'/'+parts[1]).catch(e=>toast(e.message,'error'))});
  document.querySelectorAll('[data-check]').forEach(b=>b.onclick=()=>checkMapping(b.dataset.check));
  document.querySelectorAll('[data-sync]').forEach(b=>b.onclick=()=>syncOne(b.dataset.sync));
  document.querySelectorAll('[data-diff]').forEach(b=>b.onclick=()=>showDiff(b.dataset.diff));
  document.querySelectorAll('[data-force]').forEach(b=>b.onclick=()=>{if(confirm('确认用 GitHub 源文档覆盖博客本地修改？'))syncOne(b.dataset.force,true)});
  document.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>deleteMapping(b.dataset.del));
}
async function checkMapping(id){
  const m=store.mappings.find(x=>x.id===id);if(!m)return;
  try{const r=await engine.inspect(m);S.results=[...S.results.filter(x=>x.id!==id),r];render()}
  catch(e){toast('检查失败：'+e.message,'error')}
}
function render(){
  const v=$('view-sync');if(!v)return;
  v.innerHTML='<div class="page-head"><div><p class="kicker">DOCUMENTATION PIPELINE</p><h1>GitHub 文档同步</h1><p>Repository → Document Registry → Article Mapping。扫描只发现文件；正文只在预览 / 同步时读取。</p><div id="syncConnection">'+connectionLabel()+'</div></div><div class="sync-head-actions"><button class="secondary" id="checkAllBtn">检查全部</button><button id="syncAllBtn">同步全部</button></div></div>'+
    '<div class="sync-import panel"><div class="panel-head"><h2>Repository Discovery</h2><span>默认分支自动识别 · ETag 缓存</span></div><div class="github-url-row"><input id="githubUrl" value="'+esc(S.repo?'https://github.com/'+S.repo.owner+'/'+S.repo.repo:'')+'" placeholder="https://github.com/emoeem/voicefox"><button id="discoverBtn"><i class="fa fa-search"></i> 检索文档</button></div><p class="setting-help">支持 https://github.com/owner/repo 和 /tree/branch；不会把缺失文档自动删除，忽略状态保存到同步注册表。</p></div>'+
    '<div id="sync-discovery"></div><div id="sync-repositories"></div><div class="sync-detail panel" id="sync-details"></div><div class="sync-list" id="sync-list"></div><div id="sync-diff-modal" class="sync-diff-modal" hidden><div class="sync-diff-dialog"><div class="sync-diff-toolbar"><strong>文档 Diff</strong><button class="text-btn" id="closeDiffBtn">关闭</button></div><div id="sync-diff-body"></div></div></div>';
  $('discoverBtn').onclick=()=>discover($('githubUrl').value).catch(e=>toast(e.message,'error'));
  $('checkAllBtn').onclick=checkAll;$('syncAllBtn').onclick=syncAll;renderDiscovery();renderRepositories();renderDetails();renderMappings();renderButtons();if($('closeDiffBtn'))$('closeDiffBtn').onclick=closeDiff;
}
async function init(){
  if(!document.getElementById('view-sync')){const s=document.createElement('section');s.id='view-sync';s.className='view';document.querySelector('.main').appendChild(s)}
  try{await store.load()}catch(e){console.warn(e)}
  render();
}
window.addEventListener('load',init);
})();
