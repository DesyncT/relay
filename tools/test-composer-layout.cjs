const fs=require('fs'),path=require('path'),os=require('os'),{spawnSync}=require('child_process'),electron=require('electron');
const out=fs.mkdtempSync(path.join(os.tmpdir(),'relay-composer-'));
const fx=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/react.json')));
fx.__storage={'relay.theme.v1':{id:'midnight'},'relay.background.v1':{effect:'ascii',strength:60,speed:50,interactive:true},'relay.draft.s1':'Draft with an image','relay.draftFiles.s1':[{path:path.join(__dirname,'../assets/complete-badge.png'),name:'screenshot.png',type:'image/png',size:4096}]};
fx['chat:history'].push({from:'codex',route:{model:'gpt-6.1-sol',effort:'low'},text:'A message with a clear provider, model, and effort.',at:Date.now()});
const fixture=path.join(out,'fixtures.json');fs.writeFileSync(fixture,JSON.stringify(fx));
for(const size of ['1280x800','860x760']){
 const result=spawnSync(electron,['tools/harness.cjs','--dir','renderer-dist','--fixtures',fixture,'--eval','tools/composer-layout-check.js','--wait','2000','--size',size,'--out',path.join(out,size+'.png')],{encoding:'utf8',timeout:30000});
 process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
 if(result.error||result.status!==0){console.error(result.error?.message||'Composer/background regression failed');process.exit(1);}
}
console.log('Composer, background controls and message-header checks passed: '+out);
