import { routerPort } from '../server/router-port.ts';
import { readFile, writeFile } from 'node:fs/promises';
const rows = JSON.parse(await readFile('artifacts/inspection-build/production/requests.json', 'utf8')), reports = [];
for (const row of rows.filter((item: any) => item.state === 'FAILED' && item.requestId)) {
  try { await routerPort.result(row.body.modelId, row.requestId); reports.push({ key: row.key, note: 'Unexpected successful result; requires reconciliation.' }); }
  catch (error: any) {
    const safe = String(error.message ?? 'No provider detail').replaceAll(process.env.COMFY_API_KEY ?? 'NO_CONFIGURED_KEY', '[redacted]').replace(/https?:\/\/[^\s)]+/g, '[remote URL omitted]').slice(0, 2000);
    reports.push({ key: row.key, requestId: row.requestId, modelId: row.body.modelId, errorType: error.errorType, httpStatus: error.httpStatus, message: safe });
  }
}
await writeFile('artifacts/inspection-build/production/failed-details.json', JSON.stringify(reports, null, 2)); console.log(JSON.stringify(reports));
