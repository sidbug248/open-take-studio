import {config,rootDir,safeMessage} from './config.ts';
import express from 'express';
import {createServer} from 'node:http';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {requestOrigin} from './request-origin.ts';
import {createStudioRuntime} from './studio-runtime.ts';
import {createProductionDelivery} from './http-delivery.ts';
import {AuthSessions,createAuthRouter} from './auth-session.ts';
import {securityBoundary} from './runtime-security.ts';
import {WorkspaceBackupService,createRuntimeBackupRouter} from './runtime-backup.ts';
import {ReviewerCredentials} from './reviewer-credentials.ts';
import {createReviewerSystem} from './reviewer-system.ts';
import {createStudioPublicRouter} from './studio-public.ts';

const owner=createStudioRuntime({dataDir:config.dataDir,settings:config});
const backupService=new WorkspaceBackupService(owner.store),sessions=new AuthSessions(owner.store,config);
// Missing encryption configuration disables reviewer entry, never owner-key fallback.
const vault=config.mode==='hosted'&&process.env.OTS_CREDENTIAL_ENCRYPTION_KEY?new ReviewerCredentials(path.join(config.dataDir,'private'),process.env.OTS_CREDENTIAL_ENCRYPTION_KEY):undefined;
const reviewers=vault?createReviewerSystem({vault,owner,settings:config,distDir:path.join(rootDir,'dist')}):undefined;
let shuttingDown=false;
const app=express();app.disable('x-powered-by');app.set('trust proxy',config.trustProxyHops);
app.use((_req,res,next)=>{if(shuttingDown){res.status(503).setHeader('Retry-After','10');res.end('Studio is restarting; saved jobs will recover.');return;}next();});
app.use(securityBoundary(config));
app.get('/api/health',(_req,res)=>res.json(config.mode==='hosted'?{ok:true,version:'0.2.0'}:{ok:true,keyConfigured:config.keyConfigured,version:'0.2.0',storagePath:config.dataDir,sdkVersion:'0.5.0'}));
app.use(sessions.identify());
app.use(createStudioPublicRouter({owner,reviewerRuntime:id=>reviewers?.getRuntime(id)}));
if(reviewers){app.use(reviewers.identify);app.use(reviewers.arrive);app.use(reviewers.router);}
app.use(createAuthRouter(sessions,{reviewerEnabled:!!reviewers}));
if(reviewers)app.use(reviewers.dispatch);
app.use(sessions.gate());
// Owner-only deployment diagnostic: never returns raw IP, cookies or proxy proof.
app.get('/api/runtime/request-context',(req,res)=>{const context=requestOrigin(req),hash=(value:string)=>createHash('sha256').update(value).digest('hex');res.json(context?{origin:context.origin,proxied:context.proxied,ipSource:context.ipSource,clientIpHash:hash(context.clientIp),forwarding:{expressIpHash:hash(req.ip??''),forwardedForHashes:String(req.headers['x-forwarded-for']??'').split(',').map(value=>hash(value.trim())),realIpHash:hash(String(req.headers['x-real-ip']??''))}}:{origin:'local',proxied:false});});
app.get('/api/studio/status',(_req,res)=>{res.setHeader('Cache-Control','no-store');res.json({ok:true,version:'0.2.0',keyConfigured:config.keyConfigured,mode:config.mode,sdkVersion:'0.5.0',accessMode:'owner',workspaceId:'owner'});});
app.use('/api',express.json({limit:'2mb'}),createRuntimeBackupRouter(owner.store,backupService));
app.use(owner.router);
const server=createServer(app);
if(process.argv.includes('--production')||config.mode==='hosted')app.use(createProductionDelivery(path.join(rootDir,'dist'),owner.explore));
else{const {createServer:createViteServer}=await import('vite');const vite=await createViteServer({root:rootDir,server:{middlewareMode:true,ws:{server},allowedHosts:['127.0.0.1','localhost']},appType:'spa'});app.use(vite.middlewares);}
app.use((err:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{if(!res.headersSent)res.status((err as {status?:number}).status||500).json({error:(err as {type?:string}).type==='entity.parse.failed'?'Invalid JSON request.':safeMessage(err)});});
server.maxConnections=100;server.headersTimeout=15000;server.requestTimeout=120000;
server.listen(config.port,config.bindHost,()=>{owner.start();if(config.mode==='hosted')backupService.start();console.log('Open Take Studio: '+(config.publicOrigin||'http://127.0.0.1:'+config.port));console.log(`Router credentials: ${config.keyConfigured?'configured on server':'missing - add COMFY_API_KEY to '+path.join(rootDir,'.env')}`);});
server.on('error',err=>{console.error(safeMessage(err));process.exitCode=1;});
async function close(){if(shuttingDown)return;shuttingDown=true;const connectionsClosed=new Promise<void>(resolve=>server.close(()=>resolve()));const deadline=setTimeout(()=>{console.error('Shutdown deadline reached; persisted jobs will recover on restart.');process.exit(0);},28000);deadline.unref();await backupService.stop().catch(()=>undefined);await Promise.all([reviewers?.close(),owner.close(),connectionsClosed]);vault?.close();clearTimeout(deadline);process.exit(0);}
process.on('SIGINT',close);process.on('SIGTERM',close);
