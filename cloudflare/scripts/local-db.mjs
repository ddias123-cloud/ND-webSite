import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';

// Test/preview adapter only. Production uses the provisioned D1 binding.
export function database(filename=':memory:') {
  const sqlite = new DatabaseSync(filename);
  sqlite.exec('PRAGMA foreign_keys = ON');
  const exists=sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='nd_accounts'").get();
  if(!exists) sqlite.exec(fs.readFileSync('drizzle/0000_private_auth.sql','utf8'));
  const members=sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='nd_members'").get();
  if(!members) sqlite.exec(fs.readFileSync('drizzle/0001_email_registration.sql','utf8'));
  const profiles=sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='nd_profiles'").get();
  if(!profiles) sqlite.exec(fs.readFileSync('drizzle/0002_workspace.sql','utf8'));
  function statement(sql,args=[]) {
    return {
      bind(...params){return statement(sql,params);},
      async first(){return sqlite.prepare(sql).get(...args)||null;},
      async all(){return {results:sqlite.prepare(sql).all(...args)};},
      async run(){const r=sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:r.changes}};},
      execute(){return sqlite.prepare(sql).run(...args);}
    };
  }
  return {sqlite,prepare:statement,async batch(items){sqlite.exec('BEGIN');try{const result=items.map(s=>s.execute());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}},close(){sqlite.close();}};
}
