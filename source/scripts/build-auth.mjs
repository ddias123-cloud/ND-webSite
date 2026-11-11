import fs from 'node:fs';
import path from 'node:path';

const project = process.cwd();
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8'};
const assets={};
function collect(dir) {
  for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const filename=path.join(dir,entry.name);
    if(entry.isDirectory()) collect(filename);
    else assets['/'+path.relative(path.join(project,'web'),filename).replaceAll('\\','/')]={type:mime[path.extname(filename)]||'application/octet-stream',data:fs.readFileSync(filename).toString('base64')};
  }
}
collect(path.join(project,'web'));
fs.writeFileSync('worker/assets.generated.mjs','export const assets = '+JSON.stringify(assets)+';\n');
const dist=path.resolve(project,'dist');
if(path.dirname(dist)!==fs.realpathSync(project)) throw new Error('Unexpected build target');
if(!fs.existsSync(path.join(project,'web/index.html'))) throw new Error('Missing source assets');
// Remove only the checked project build directory: no legacy static copy may
// bypass the Worker authentication boundary.
fs.rmSync(dist,{recursive:true,force:true});
fs.mkdirSync(path.join(dist,'server'),{recursive:true});
const worker=fs.readFileSync('worker/index.mjs','utf8').replace("import {auth,identity,session} from './auth.mjs';",fs.readFileSync('worker/auth.mjs','utf8').replaceAll('export ',''))
 .replace("import {assets} from './assets.generated.mjs';",fs.readFileSync('worker/assets.generated.mjs','utf8').replace('export const assets','const assets'));
fs.writeFileSync(path.join(dist,'server/index.js'),worker);
fs.mkdirSync(path.join(dist,'.openai'),{recursive:true});
fs.copyFileSync('.openai/hosting.json',path.join(dist,'.openai/hosting.json'));
console.log('Built authenticated Worker with '+Object.keys(assets).length+' bundled assets.');
