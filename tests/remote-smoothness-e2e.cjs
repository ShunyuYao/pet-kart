'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process'),crypto=require('node:crypto');
const source=process.env.KART_BASELINE_HTML||path.resolve(__dirname,'../dist/桌宠赛车.html');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kart-motion-artifact-')),out=path.join(dir,'桌宠赛车.html');
fs.writeFileSync(out,require('./motion-artifact.cjs').instrument(fs.readFileSync(source,'utf8')));
const r=spawnSync(process.execPath,[path.join(__dirname,'host-e2e.cjs'),...(process.argv.includes('--relay')?['--relay']:[])],{stdio:'inherit',env:{...process.env,KART_HTML:out,KART_REMOTE_SMOOTHNESS:'1',KART_BASELINE_SHA:crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),...(process.argv.includes('--doll3d')?{KART_EXPECT_3D:'1'}:{})}});process.exit(r.status??1);
