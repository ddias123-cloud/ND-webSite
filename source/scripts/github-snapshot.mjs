import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

// Exports committed source only. GitHub writes use the connected GitHub tools,
// so this project never needs to store a GitHub token or an expiring Sites token.
const args=process.argv.slice(2);
const options={};
for(let i=0;i<args.length;i+=2){if(!['--commit','--output'].includes(args[i])||!args[i+1])throw new Error('Usage: node scripts/github-snapshot.mjs --commit SHA --output ABSOLUTE_JSON_PATH');options[args[i]]=args[i+1];}
if(!options['--commit']||!options['--output']||!path.isAbsolute(options['--output']))throw new Error('Commit and absolute output path are required');
const git=(...args)=>execFileSync('git',args,{maxBuffer:16*1024*1024,windowsHide:true});
const commit=git('rev-parse','--verify',options['--commit']+'^{commit}').toString().trim();
const config=JSON.parse(git('show',commit+':github-sync.json').toString('utf8'));
const allowedRoot=new Set(['.gitignore','AGENTS.md','README.md','package.json','github-sync.json','.openai/hosting.json']);
const files=[];
for(const item of git('ls-tree','-r','-z',commit).toString('utf8').split('\0').filter(Boolean)){
  const [metadata,name]=item.split('\t');
  const [mode,type,sha]=metadata.split(' ');
  if(type!=='blob'||mode!=='100644')throw new Error('Only regular source files may be synchronized: '+name);
  if(!allowedRoot.has(name)&&!name.match(/^(web|worker|scripts|tests|drizzle)\//))throw new Error('Unapproved source path: '+name);
  if(name.match(/(^|\/)(\.env(?:\.|$)|\.preview|node_modules)|\.(?:sqlite(?:-shm|-wal)?|db|pem|key)$/i)||name==='worker/assets.generated.mjs')throw new Error('Private or generated file blocked: '+name);
  const buffer=git('cat-file','blob',sha);
  const binary=/\.(png|ttf|woff2?|ico)$/i.test(name);
  files.push({path:name,mode:'100644',type:'blob',encoding:binary?'base64':'utf-8',content:buffer.toString(binary?'base64':'utf8'),blob_sha:sha});
}
const result={...config,source_commit:commit,files};
fs.writeFileSync(options['--output'],JSON.stringify(result));
console.log(JSON.stringify({repository:config.repository,branch:config.branch,directory:config.directory,source_commit:commit,files:files.length,output:options['--output']}));
