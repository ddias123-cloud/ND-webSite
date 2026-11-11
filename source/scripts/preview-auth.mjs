import http from 'node:http';
import fs from 'node:fs';
import {database} from './local-db.mjs';
import worker from '../dist/server/index.js';

fs.mkdirSync('.preview',{recursive:true});
const db=database('.preview/auth.sqlite');
const server=http.createServer(async(req,res)=>{
  try{
    const chunks=[];for await (const chunk of req)chunks.push(chunk);
    const headers=new Headers(req.headers);
    // Local preview only, never a production fallback or client-controlled field.
    headers.set('oai-authenticated-user-id','local-preview-owner');
    headers.set('oai-authenticated-user-email','preview@example.test');
    const request=new Request('http://127.0.0.1:8788'+req.url,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
    const response=await worker.fetch(request,{DB:db},{});
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500);res.end('Preview error');}
});
server.listen(8788,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:8788 (isolated test account)'));
process.on('SIGINT',()=>server.close(()=>{db.close();process.exit(0);}));
