export function splitFrontMatter(text){
  const m=text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  return m?{raw:m[1],body:m[2]}:{raw:'',body:text};
}
export function parseFrontMatter(text){
  const x=splitFrontMatter(text);let meta={};
  try{if(x.raw&&window.jsyaml)meta=window.jsyaml.load(x.raw)||{}}catch{}
  return {meta,body:x.body,raw:x.raw};
}
export function titleFromDocument(path,body,meta={}){
  if(meta.title)return String(meta.title);
  const h=body.match(/^#\s+(.+?)\s*#*$/m);if(h)return h[1].trim();
  return path.split('/').pop().replace(/\.md$/i,'').replace(/[-_]+/g,' ');
}
export function parseReferences(markdown){
  const links=[],images=[];let m;
  const imageRe=/!\[([^\]]*)\]\(([^)]+)\)/g;
  while((m=imageRe.exec(markdown)))images.push({alt:m[1],url:cleanUrl(m[2])});
  const linkRe=/(^|[^!])\[([^\]]+)\]\(([^)]+)\)/g;
  while((m=linkRe.exec(markdown)))links.push({text:m[2],url:cleanUrl(m[3])});
  return {links,images};
}
function cleanUrl(v){return String(v).trim().replace(/^<|>$/g,'').split(/\s+/)[0]}
export function isRelativeAsset(url){return url&&!/^(?:https?:|data:|#|\/)/i.test(url)}
export function isMarkdownReference(url){return /\.md(?:#.*)?$/i.test(url)}
export function resolveRelative(fromPath,target){
  const base=fromPath.split('/');base.pop();
  const parts=base.concat(target.split('/')).filter(Boolean),out=[];
  for(const p of parts){if(p==='..')out.pop();else if(p!=='.')out.push(p)}
  return out.join('/');
}
export async function sha256(text){
  const data=new TextEncoder().encode(text),hash=await crypto.subtle.digest('SHA-256',data);
  return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function dumpFrontMatter(meta){
  return '---\n'+window.jsyaml.dump(meta,{lineWidth:-1,noRefs:true}).trimEnd()+'\n---\n\n';
}
