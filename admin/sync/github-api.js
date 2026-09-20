export function createGithubApi() {
  const etags=new Map(JSON.parse(localStorage.getItem('blog_sync_etags')||'[]')); const payloads=new Map(JSON.parse(localStorage.getItem('blog_sync_payloads')||'[]'));
  const state={online:true,lastSuccessAt:null,lastError:null,cacheHits:0,usingCache:false};
  const save=()=>{localStorage.setItem('blog_sync_etags',JSON.stringify([...etags]));localStorage.setItem('blog_sync_payloads',JSON.stringify([...payloads]));};
  const request=async(path,method='GET',body)=>{
    const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
    if(body) headers['Content-Type']='application/json';
    const key=method+':'+path;
    if(method==='GET'&&etags.has(key)) headers['If-None-Match']=etags.get(key);
    const base=window.ADMIN_API_BASE||'';
    let r;try{r=await fetch(base+'/api/github?path='+encodeURIComponent(path),{method,headers,credentials:'include',body:body?JSON.stringify(body):undefined})}catch(e){state.online=false;state.usingCache=true;state.lastError=e.message;throw e}
    if(r.status===304){state.online=true;state.cacheHits++;state.usingCache=true;return payloads.get(key)||null;}
    if(r.headers.get('etag')&&method==='GET')etags.set(key,r.headers.get('etag'));
    state.online=true;state.usingCache=false;state.lastSuccessAt=new Date().toISOString();state.lastError=null;
    if(!r.ok){state.online=true;state.lastError=r.status+' '+r.statusText;let e={};try{e=await r.json()}catch{};const reset=r.headers.get('x-ratelimit-reset');
      throw Error((e.message||r.status+' '+r.statusText)+(reset?' · rate reset '+new Date(+reset*1000).toLocaleTimeString():''));}
    if(r.status===204)return null; const data=await r.json(); if(method==='GET'){payloads.set(key,data);save()} return data;
  };
  const encode=s=>btoa(String.fromCharCode(...new TextEncoder().encode(s)));
  const decode=s=>{const b=Uint8Array.from(atob(s.replace(/\n/g,'')),c=>c.charCodeAt(0));return new TextDecoder().decode(b)};
  const resolvePermalinks=async items=>{
    const r=await fetch((window.ADMIN_API_BASE||'')+'/api/permalink',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({items})});
    const data=await r.json().catch(()=>({message:'Invalid permalink API response'}));
    if(!r.ok)throw Error(data.message||r.status+' '+r.statusText);
    return data.items||[];
  };
  const status=()=>({...state}); const setUsingCache=v=>{state.usingCache=!!v};
  return {request,encode,decode,resolvePermalinks,status,setUsingCache};
}
export function parseGithubUrl(input){
  const u=input.trim().replace(/\.git$/,'').replace(/\/$/,'');
  const m=u.match(/^https?:\/\/github\.com\/([^/]+)\/([^/#?]+)(?:\/tree\/([^/#?]+))?$/);
  if(!m)throw Error('请输入 GitHub 仓库地址，例如 https://github.com/emoeem/voicefox');
  return {owner:m[1],repo:m[2],branch:m[3]||null};
}
export function isMarkdown(path){return /\.md$/i.test(path)}
export function ignoredByDefault(path){return /(^|\/)(CHANGELOG|LICENSE|CODE_OF_CONDUCT|CONTRIBUTING|SECURITY|SUPPORT|THIRD_PARTY)(\.md)?$/i.test(path)}
export function excludedDir(path){return /(^|\/)(node_modules|vendor|dist|build|target)\//i.test(path)}
export async function scanRepository(api,repo){
  const info=await api.request('repos/'+repo.owner+'/'+repo.repo);
  const branch=repo.branch||info.default_branch;
  const root=await api.request('repos/'+repo.owner+'/'+repo.repo+'/git/trees/'+encodeURIComponent(branch)+'?recursive=1');
  if(root?.truncated)return {info,branch,tree:await scanTreeFallback(api,repo.owner,repo.repo,branch)};
  return {info,branch,tree:(root?.tree||[])};
}
async function scanTreeFallback(api,owner,repo,branch){
  const root=await api.request('repos/'+owner+'/'+repo+'/git/trees/'+encodeURIComponent(branch));
  const out=[];
  async function walk(items){for(const item of items){if(item.type==='blob')out.push(item);else if(item.type==='tree'){
    const t=await api.request('repos/'+owner+'/'+repo+'/git/trees/'+item.sha);await walk(t?.tree||[]);
  }}}
  await walk(root?.tree||[]);return out;
}
