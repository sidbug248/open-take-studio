import {workerData} from 'node:worker_threads';
import {createHash} from 'node:crypto';
if(process.env.COMFY_API_KEY||process.env.OTS_OWNER_PASSWORD_HASH||process.env.OTS_CREDENTIAL_ENCRYPTION_KEY)throw new Error('A worker inherited a server secret');
globalThis.fetch=async(input,options)=>{
  if(!String(input).startsWith('https://api.comfy.org/v2/models/'))throw new Error('Unexpected mocked destination');
  const headers=new Headers(options.headers);
  if(headers.get('Authorization')!==`Bearer ${workerData.apiKey}`)throw new Error('SDK sent the wrong credential');
  if(headers.get('Idempotency-Key')!==workerData.args[2])throw new Error('SDK changed the submission identity');
  await new Promise(resolve=>setTimeout(resolve,20));
  return Response.json({request_id:'mock-'+createHash('sha256').update(workerData.apiKey).digest('hex').slice(0,12)},{status:201});
};
await import('../../server/router-isolate.mjs');
