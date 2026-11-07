const path=require('node:path'),fs=require('node:fs/promises'),crypto=require('node:crypto');
const {createServer}=require('./painel-ftp-server.cjs');
const {denied}=require('./painel-ftp-storage.cjs');
(async()=>{
 const blobs=new Map([['/SD/hello.bin',Buffer.from(Array.from({length:300000},(_,i)=>i%251))],['/SD/nome com espaço.txt',Buffer.from('ação\n')],['/Interno/info.txt',Buffer.from('internal read only')]]);
 const directories=new Set(['/','/SD','/Interno']);let busy=false;
 const stat=async p=>directories.has(p)?{type:'directory',size:0}:blobs.has(p)?{type:'file',size:blobs.get(p).length}:Promise.reject(denied('not found'));
 const canUpload=async p=>{if(!p.startsWith('/SD/')||blobs.has(p)||directories.has(p))throw denied('new SD files only');if(!directories.has(path.posix.dirname(p)))throw denied('parent not found');};
 const adapter={scopes:['SD','Interno'],stat,
  list:async p=>{if(!directories.has(p))throw denied('not directory');return [...directories,...blobs.keys()].filter(x=>x!==p&&path.posix.dirname(x)===p).map(x=>({name:path.posix.basename(x),type:directories.has(x)?'directory':'file',size:blobs.get(x)?.length||0}));},
  read:async function*(p,offset){if(busy)throw Error('Native overlap');busy=true;try{const b=blobs.get(p);for(let at=offset;at<b.length;at+=8192){await new Promise(r=>setTimeout(r,1));yield b.subarray(at,at+8192);}}finally{busy=false;}},
  canUpload,mkdir:async p=>{await canUpload(p);directories.add(p);},
  uploadNew:async(p,file,sha,size,journal)=>{await canUpload(p);const b=await fs.readFile(file);if(b.length!==size||crypto.createHash('sha256').update(b).digest('hex')!==sha)throw Error('upload hash');blobs.set(p,b);await fs.writeFile(journal,JSON.stringify({complete:true}));}};
 const upload=process.argv.includes('--upload');
 const server=await createServer(adapter,{upload,staging:process.argv[2],dataTimeout:2000,maxUpload:512000,onFatal:e=>{process.stderr.write(e.message+'\n');}});
 console.log(JSON.stringify({port:server.port}));
 process.stdin.setEncoding('utf8');process.stdin.on('data',async text=>{if(text.includes('stop')){await server.close();process.stdin.pause();}});
})().catch(e=>{console.error(e);process.exitCode=1;});
