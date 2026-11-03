import { z } from 'zod';
export const filmIdSchema=z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const filmClipSchema=z.object({assetId:filmIdSchema,takeId:filmIdSchema.optional(),inSeconds:z.number().finite().min(0),outSeconds:z.number().finite().positive()}).strict().refine(clip=>clip.outSeconds>clip.inSeconds,{message:'Clip out point must follow its in point'});
export const filmSourceMomentSchema=z.object({assetId:filmIdSchema,takeId:filmIdSchema.optional(),seconds:z.number().finite().min(0),frameAssetId:filmIdSchema}).strict();
export const filmChoiceSchema=z.object({id:filmIdSchema,label:z.string().trim().min(1).max(120),clip:filmClipSchema}).strict();
export const filmBodySchema=z.object({parentFilmId:filmIdSchema.optional(),name:z.string().trim().min(1).max(180),opening:filmClipSchema,sourceMoment:filmSourceMomentSchema.optional(),choices:z.array(filmChoiceSchema).min(2).max(8)}).strict();
export const branchFilmSchema=filmBodySchema.extend({id:filmIdSchema,createdAt:z.string().datetime(),updatedAt:z.string().datetime()});
export class FilmError extends Error { constructor(message:string,public status=400){super(message);} }
