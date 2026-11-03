import dotenv from 'dotenv';
import path from 'node:path';
import {readRuntimeConfig} from './runtime-config.ts';
// Workspace .env takes precedence over inherited shell values, BEFORE SDK config.
export const rootDir = path.resolve(import.meta.dirname, '..');
export const envPath = path.join(rootDir, '.env');
dotenv.config({ path: envPath, override: true, quiet: true });
export const config = {
  ...readRuntimeConfig(process.env,rootDir),
  keyConfigured: Boolean(process.env.COMFY_API_KEY?.trim()),
};
export function safeMessage(value: unknown): string {
  let message = value instanceof Error ? value.message : String(value);
  for(const secret of [process.env.COMFY_API_KEY,process.env.OTS_OWNER_PASSWORD_HASH])if(secret)message=message.split(secret).join('[redacted]');
  return message.replace(/comfyui-[A-Za-z0-9_-]+/g, '[redacted]').slice(0, 1500);
}
