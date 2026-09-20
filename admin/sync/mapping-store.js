const MAP_KEY='blog_sync_mappings_v2';
const REPO_KEY='blog_sync_repositories_v1';

export function createMappingStore({api,encode,decode}){
  let mappings=[],repositories={},mapSha=null,repoSha=null;
  const local=()=>{try{mappings=JSON.parse(localStorage.getItem(MAP_KEY)||'[]')}catch{mappings=[]}
    try{repositories=JSON.parse(localStorage.getItem(REPO_KEY)||'{}')}catch{repositories={}}};
  const cache=()=>{localStorage.setItem(MAP_KEY,JSON.stringify(mappings));localStorage.setItem(REPO_KEY,JSON.stringify(repositories))};
  async function load(){
    local();
    try{const r=await api.request('repos/emoeem/blog-source/contents/source/_data/sync-mappings.json');
      if(r){mappings=JSON.parse(decode(r.content));mapSha=r.sha}
    }catch{}
    try{const r=await api.request('repos/emoeem/blog-source/contents/source/_data/sync-repositories.json');
      if(r){repositories=JSON.parse(decode(r.content));repoSha=r.sha}
    }catch{}
    cache();return {mappings,repositories};
  }
  async function load(){
    local();
    try{
      const r=await api.request('repos/emoeem/blog-source/contents/source/_data/sync-mappings.json');
      if(r){mappings=JSON.parse(decode(r.content));mapSha=r.sha}
    }catch{}
    try{
      const r=await api.request('repos/emoeem/blog-source/contents/source/_data/sync-repositories.json');
      if(r){repositories=JSON.parse(decode(r.content));repoSha=r.sha}
    }catch{}
    cache();return {mappings,repositories};
  }
  async function put(path,data,sha,message){
    const body={message:message,content:encode(JSON.stringify(data,null,2)+'\n'),branch:'main'};
    if(sha)body.sha=sha;
    return api.request('repos/emoeem/blog-source/contents/'+path,'PUT',body);
  }
  async function save(){
    const a=await put('source/_data/sync-mappings.json',mappings,mapSha,'chore: update sync mappings');
    mapSha=a?.content?.sha||a?.sha||mapSha;
    const b=await put('source/_data/sync-repositories.json',repositories,repoSha,'chore: update sync repositories');
    repoSha=b?.content?.sha||b?.sha||repoSha;cache();
  }
  function repoKey(r){return r.owner+'/'+r.repo}
  function ensureRepository(repo){
    const k=repoKey(repo);
    if(!repositories[k])repositories[k]={owner:repo.owner,repo:repo.repo,branch:repo.branch||'main',ignoredPaths:[],topicMap:{}};
    if(repo.branch)repositories[k].branch=repo.branch;
    return repositories[k];
  }
  function find(owner,repo,path){return mappings.find(x=>x.owner===owner&&x.repo===repo&&x.path===path)}
  function upsert(m){const i=mappings.findIndex(x=>x.id===m.id);if(i<0)mappings.push(m);else mappings[i]=m}
  function remove(id){mappings=mappings.filter(x=>x.id!==id)}
  return {load,save,ensureRepository,find,upsert,remove,repoKey,get mappings(){return mappings},get repositories(){return repositories}};
}
export function mappingId(owner,repo,path){
  return 'github-'+owner+'-'+repo+'-'+path.replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').toLowerCase();
}
