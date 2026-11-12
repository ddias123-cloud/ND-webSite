import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
if(!fs.existsSync('web/index.html')||!fs.existsSync('worker/cloudflare.mjs'))throw Error('Run from the N&D Cloudflare project directory.');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8'};
const assets={};
function collect(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())collect(f);else assets['/'+path.relative(path.join(root,'web'),f).replaceAll('\\','/')]={type:mime[path.extname(f)]||'application/octet-stream',data:fs.readFileSync(f).toString('base64')};}}
collect(path.join(root,'web'));
const moduleSource=name=>fs.readFileSync('worker/'+name+'.mjs','utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('export ','');
const inner=fs.readFileSync('worker/index.mjs','utf8')
 .replace("import {auth,identity,session} from './auth.mjs';",moduleSource('auth'))
 .replace("import {workspace} from './workspace.mjs';",moduleSource('workspace'))
 .replace("import {emailAuth} from './mail.mjs';",moduleSource('mail'))
 .replace("import {assets} from './assets.generated.mjs';",'const assets = '+JSON.stringify(assets)+';')
 .replace('export default {','const portal = {');
const adapter=fs.readFileSync('worker/cloudflare.mjs','utf8').replace(/^import .*;\r?\n/gm,'');
fs.mkdirSync('dist/server',{recursive:true});fs.writeFileSync('dist/server/index.js',inner+'\n'+adapter);
fs.writeFileSync('dist/server/portal-test.js',inner+'\nexport default portal;\n');
fs.writeFileSync('worker/assets.generated.mjs','export const assets = '+JSON.stringify(assets)+';\n');
console.log('Built private N&D Cloudflare Worker.');
