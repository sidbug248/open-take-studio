import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Asset } from '../shared/types.ts';
import { SYNC_DURATION_MODEL, syncDurationSelection, type SyncDurationCheck, type SyncDurationReceipt, type SyncDurationRequest } from '../shared/sync-duration.ts';
import type { Store } from './store.ts';
import type { LocalFileStorage } from './media.ts';
import { mediaToolPaths, runMediaTool } from './film-media.ts';
import { validateSupportedSettings } from './model-registry.ts';

const CONFIRMATION_LIFETIME_MS = 15 * 60_000;
// Allow only encoder/frame-boundary rounding, not a meaningful missing speech tail.
const TIMING_TOLERANCE_SECONDS = .05;
export class SyncDurationConfirmationRequired extends Error {
  readonly code = 'duration_confirmation_required';
  constructor(readonly check: SyncDurationCheck) {
    super('The speech is longer than the performance video. Review the measured durations and explicitly confirm cutting the speech short, or choose another duration mode.');
  }
}
type Measured = { check: SyncDurationCheck; binding: string; video: Asset; audio: Asset };
/** Checks local immutable media; never contacts Comfy or uploads an input. */
export class SyncDurationGuard {
  private readonly secret = randomBytes(32);
  constructor(private readonly store: Store, private readonly media: LocalFileStorage, private readonly now: () => number = Date.now) {}
  private async seconds(asset: Asset, kind: 'video' | 'audio'): Promise<number> {
    const bytes = await this.media.read(asset);
    if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error('A saved input has changed on disk. Reimport the original media before generating.');
    const { ffprobe } = mediaToolPaths();
    const raw = await runMediaTool(ffprobe, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-select_streams', kind === 'video' ? 'v:0' : 'a:0', '-show_streams', '-show_format', '-of', 'json', this.media.path(asset)], 1024 * 1024, 30_000);
    const result = JSON.parse(raw.toString('utf8')), stream = result.streams?.[0];
    if (!stream || stream.codec_type !== kind) throw new Error('The selected ' + kind + ' input has no readable ' + kind + ' stream.');
    // For a video containing a longer soundtrack, the container duration must
    // not disguise the earlier end of the actual performance video.
    const timeBase = String(stream.time_base ?? '').split('/').map(Number);
    const streamSeconds = Number(stream.duration), ticksSeconds = Number(stream.duration_ts) * timeBase[0] / timeBase[1];
    const measured = Number.isFinite(streamSeconds) && streamSeconds > 0 ? streamSeconds : ticksSeconds;
    const duration = Number.isFinite(measured) && measured > 0 ? measured : kind === 'audio' ? Number(result.format?.duration) : NaN;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('The selected ' + kind + ' duration could not be verified. Re-export it before generating.');
    return duration;
  }
  private async measure(request: SyncDurationRequest): Promise<Measured> {
    if (request.modelId !== SYNC_DURATION_MODEL) throw new Error('Duration review is available for Sync 3.');
    if (!this.store.getProject(request.projectId)) throw new Error('Project not found.');
    const settings = validateSupportedSettings(request.modelId, request.settings);
    const get = (key: 'video' | 'audio'): Asset => {
      const id = request.inputAssetIds[key], asset = typeof id === 'string' ? this.store.getAsset(id) : undefined;
      if (!asset || asset.projectId !== request.projectId || asset.kind !== key) throw new Error('Choose a saved ' + key + ' from this project.');
      return asset;
    };
    const video = get('video'), audio = get('audio');
    if (video.mimeType !== 'video/mp4') throw new Error('Sync 3 requires an MP4 video input.');
    const [videoSeconds, audioSeconds] = await Promise.all([this.seconds(video, 'video'), this.seconds(audio, 'audio')]);
    const syncMode = String(settings.sync_mode);
    const truncatedSeconds = syncMode === 'cut_off' ? Math.max(0, audioSeconds - videoSeconds) : 0;
    const check: SyncDurationCheck = { videoAssetId: video.id, audioAssetId: audio.id, videoSeconds, audioSeconds, syncMode, truncatedSeconds, requiresConfirmation: truncatedSeconds > TIMING_TOLERANCE_SECONDS };
    const binding = syncDurationSelection({ ...request, settings }) + JSON.stringify({ videoSha256: video.sha256, audioSha256: audio.sha256, videoSeconds, audioSeconds });
    return { check, binding, video, audio };
  }
  private sign(binding: string, expires: number): string {
    return createHmac('sha256', this.secret).update(binding + '\n' + expires).digest('hex');
  }
  private withToken(measured: Measured): SyncDurationCheck {
    if (!measured.check.requiresConfirmation) return measured.check;
    const expires = this.now() + CONFIRMATION_LIFETIME_MS;
    return { ...measured.check, confirmationToken: String(expires) + '.' + this.sign(measured.binding, expires), expiresAt: new Date(expires).toISOString() };
  }
  async review(request: SyncDurationRequest): Promise<SyncDurationCheck> {
    return this.withToken(await this.measure(request));
  }
  async validate(request: SyncDurationRequest, confirmation?: string): Promise<SyncDurationReceipt> {
    const measured = await this.measure(request);
    if (measured.check.requiresConfirmation) {
      const match = /^(\d{13})\.([a-f0-9]{64})$/.exec(confirmation ?? '');
      const expires = Number(match?.[1]), now = this.now();
      const valid = !!match && expires > now && expires <= now + CONFIRMATION_LIFETIME_MS && timingSafeEqual(Buffer.from(match[2], 'hex'), Buffer.from(this.sign(measured.binding, expires), 'hex'));
      if (!valid) throw new SyncDurationConfirmationRequired(this.withToken(measured));
    }
    const { confirmationToken: _token, expiresAt: _expiry, requiresConfirmation, videoAssetId: _videoId, audioAssetId: _audioId, ...check } = measured.check;
    return { ...check, videoSha256: measured.video.sha256, audioSha256: measured.audio.sha256, cutoffConfirmed: requiresConfirmation, checkedAt: new Date(this.now()).toISOString() };
  }
}
