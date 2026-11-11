import http from 'node:http';
import fs from 'node:fs';
import {database} from './local-db.mjs';
import worker from '../dist/server/index.js';

fs.mkdirSync('.preview',{recursive:true});
const db=database('.preview/auth.sqlite');
fs.mkdirSync('.preview/avatars',{recursive:true});
// Isolated local stand-in for the production private R2 binding.
const bucket={
  async put(key,bytes,metadata){const path='.preview/avatars/'+encodeURIComponent(key);fs.writeFileSync(path,bytes);fs.writeFileSync(path+'.json',JSON.stringify(metadata.httpMetadata));},
  async get(key){const path='.preview/avatars/'+encodeURIComponent(key);if(!fs.existsSync(path))return null;return {body:fs.readFileSync(path),httpMetadata:JSON.parse(fs.readFileSync(path+'.json','utf8'))};},
  async delete(key){const path='.preview/avatars/'+encodeURIComponent(key);for(const item of [path,path+'.json'])if(fs.existsSync(item))fs.unlinkSync(item);}
};
const server=http.createServer(async(req,res)=>{
  try{
    const chunks=[];for await (const chunk of req)chunks.push(chunk);
    const headers=new Headers(req.headers);
    // Local preview only, never a production fallback or client-controlled field.
    headers.set('oai-authenticated-user-id','local-preview-owner');
    headers.set('oai-authenticated-user-email','preview@example.test');
    const request=new Request('http://127.0.0.1:8788'+req.url,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
    const response=await worker.fetch(request,{DB:db,BUCKET:bucket},{});
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500);res.end('Preview error');}
});
server.listen(8788,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:8788 (isolated test account)'));
process.on('SIGINT',()=>server.close(()=>{db.close();process.exit(0);}));
