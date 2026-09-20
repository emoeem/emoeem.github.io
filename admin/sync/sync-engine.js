import {parseFrontMatter,dumpFrontMatter,parseReferences,resolveRelative,isRelativeAsset,isMarkdownReference,sha256} from './document-parser.js';

export function createSyncEngine({api,store}){
  async function getSource(m){
    const r=await api.request('repos/'+m.owner+'/'+m.repo+'/contents/'+m.path+'?ref='+encodeURIComponent(m.branch));
    const text=api.decode(r.content);
    const commits=await api.request('repos/'+m.owner+'/'+m.repo+'/commits?path='+encodeURIComponent(m.path)+'&sha='+encodeURIComponent(m.branch)+'&per_page=1');
    return {content:text,sha:r.sha,commit:commits?.[0]?.sha||r.sha,date:commits?.[0]?.commit?.committer?.date||new Date().toISOString()};
  }
  async function getTarget(path){
    try{return await api.request('repos/emoeem/blog-source/contents/'+path)}catch(e){if(String(e.message).includes('404'))return null;throw e}
  }
  function defaultTarget(title){return 'source/_posts/'+slug(title)+'.md'}
  function slug(s){return String(s).toLowerCase().replace(/[^\w\u4e00-\u9fff-]+/g,'-').replace(/^-+|-+$/g,'')||'github-doc'}
  async function resolveAssets(m,body,refs){
    let out=body;
    for(const img of refs.images){
      if(!isRelativeAsset(img.url))continue;
      try{
        const path=resolveRelative(m.path,img.url.split('#')[0].split('?')[0]);
        const r=await api.request('repos/'+m.owner+'/'+m.repo+'/contents/'+path+'?ref='+encodeURIComponent(m.branch));
        if(!r?.content)continue;
        const target='source/images/github/'+m.owner+'/'+m.repo+'/'+path;
        await api.request('repos/emoeem/blog-source/contents/'+target,'PUT',{message:'assets: sync '+path,content:r.content,branch:'main'});
        out=out.split(img.url).join('/images/github/'+m.owner+'/'+m.repo+'/'+path);
      }catch{}
    }
    return out;
  }
  async function inspect(m){
    const old=await getTarget(m.target); let src;
    try{src=await getSource(m)}catch(e){if(/404|not found/i.test(String(e.message)))return {...m,status:'source-deleted'};throw e}
    if(old){const parsed=parseFrontMatter(api.decode(old.content)); if(parsed.meta.syncContentHash){const h=await sha256(parsed.body);if(h!==parsed.meta.syncContentHash)return {...m,status:'local-modified',commit:src.commit,date:src.date}} if(parsed.meta.syncCommit===src.commit)return {...m,status:'unchanged',commit:src.commit,date:src.date}}
    return {...m,status:'changed',commit:src.commit,date:src.date};
  }
  async function syncOne(m,force=false){
    const old=await getTarget(m.target); let src;
    try{src=await getSource(m)}catch(e){if(/404|not found/i.test(String(e.message)))return {...m,status:'source-deleted'};throw e}
    const oldParsed=old?parseFrontMatter(api.decode(old.content)):null;
    if(oldParsed?.meta.syncContentHash&&!force){const h=await sha256(oldParsed.body);if(h!==oldParsed.meta.syncContentHash)return {...m,status:'local-modified',commit:src.commit,date:src.date}}
    if(oldParsed?.meta.syncCommit===src.commit)return {...m,status:'unchanged',commit:src.commit,date:src.date};
    const parsed=parseFrontMatter(src.content),refs=parseReferences(parsed.body); let body=parsed.body;
    for(const link of refs.links){if(!isMarkdownReference(link.url)||(link.url.startsWith('http://')||link.url.startsWith('https://')))continue;const tp=resolveRelative(m.path,link.url.split('#')[0].split('?')[0]),tm=store.find(m.owner,m.repo,tp);if(!tm)continue;const tf=await getTarget(tm.target);if(!tf)continue;const tfm=parseFrontMatter(api.decode(tf.content)),d=String(tfm.meta.date||'').slice(0,10).replaceAll('-','/'),u=tfm.meta.permalink||('/'+d+'/'+slug(tfm.meta.title||tm.name)+'/');body=body.split(link.url).join(u+(link.url.includes('#')?'#'+link.url.split('#')[1]:''))}
    for(const img of refs.images){if(!isRelativeAsset(img.url))continue;try{const ap=resolveRelative(m.path,img.url.split('#')[0].split('?')[0]),ar=await api.request('repos/'+m.owner+'/'+m.repo+'/contents/'+ap+'?ref='+encodeURIComponent(m.branch));if(!ar?.content)continue;const at='source/images/github/'+m.owner+'/'+m.repo+'/'+ap;let existing=null;try{existing=await api.request('repos/emoeem/blog-source/contents/'+at)}catch{}const put={message:'assets: sync '+ap,content:ar.content,branch:'main'};if(existing?.sha)put.sha=existing.sha;await api.request('repos/emoeem/blog-source/contents/'+at,'PUT',put);body=body.split(img.url).join('/images/github/'+m.owner+'/'+m.repo+'/'+ap)}catch{}}
    const meta={...(oldParsed?.meta||{}),...(m.metadata||{}),title:m.metadata?.title||parsed.meta.title||m.name,syncSource:m.owner+'/'+m.repo,syncPath:m.path,syncBranch:m.branch,syncCommit:src.commit,lastVerified:src.date,syncContentHash:await sha256(body),syncLinkCount:refs.links.length,syncImageCount:refs.images.length};
    const content=dumpFrontMatter(meta)+body.replace(/^\n+/,'');const put={message:'sync: '+meta.title,content:api.encode(content),branch:'main'};if(old)put.sha=old.sha;await api.request('repos/emoeem/blog-source/contents/'+m.target,'PUT',put);return {...m,status:'synced',commit:src.commit,date:src.date};
  }
  async function checkRepository(repo,mappings){const scan=await scanRepository(api,repo),paths=new Set((scan.tree||[]).filter(x=>x.type==='blob').map(x=>x.path)),relevant=mappings.filter(m=>m.owner===repo.owner&&m.repo===repo.repo),out=[];for(const m of relevant){if(!paths.has(m.path)){out.push({...m,status:'source-deleted'});continue}try{out.push(await inspect(m))}catch(e){out.push({...m,status:'error',error:e.message})}}return {scan,out}}
  async function syncAll(list,checkOnly=false){
    const out=[];
    for(const m of list.filter(x=>x.enabled!==false)){
      try{out.push(checkOnly?await inspect(m):await syncOne(m))}
      catch(e){out.push({...m,status:'error',error:e.message})}
    }
    return out;
  }
  return {inspect,syncOne,syncAll,checkRepository,defaultTarget};
}
