export type CapabilityReadiness = 'ready' | 'needs-input' | 'experimental' | 'planned';
export type CapabilityFamilyId = 'images-design' | 'cast-continuity' | 'cinema-video' | 'performance-dialogue' | 'music-motion' | 'stories-comics' | 'products-campaigns' | '3d-spatial' | 'playables-interactive' | 'recipes-workflows' | 'projects-collaboration' | 'automation-integrations';
export interface CapabilityFamily { id: CapabilityFamilyId; name: string; description: string; }
export interface CapabilityExample { projectId: string; takeId: string; assetId: string; name: string; kind: string; url: string; requestId?: string; provenance: 'generated' | 'imported' | 'local-edit'; }
export interface CapabilityRecord {
  id: string; name: string; family: CapabilityFamilyId; description: string;
  readiness: CapabilityReadiness; inputs: string[]; outputs: string[]; modelIds: string[];
  inputModalities: MediaModality[]; outputModalities: MediaModality[];
  route: { kind: 'router' | 'local' | 'comfy-workflow' | 'reference' | 'planned'; modelId?: string; toolView?: string; endpoint?: string; settings?: Record<string, string | number | boolean> };
  requirements: string[]; limitations: string[]; sources: { label: string; url: string }[];
  alternatives?: { capabilityId: string; label: string; description: string }[];
  lastVerified?: { at: string; kind: 'live-generation' | 'local-validation' | 'schema'; requestId?: string };
  examples: CapabilityExample[]; demonstrations: CatalogueDemonstrationView[]; tags: string[];
}
export interface DirectoryModel {
  id: string; name: string; provider: string; inputModalities: MediaModality[]; outputModalities: MediaModality[];
  description: string; documentation: string; schemaUrl: string; readiness: CapabilityReadiness;
  adapterAvailable: boolean; capabilityIds: string[]; schemaVerifiedAt?: string;
  source: 'comfy-router'; chargesOnPolicyRejection?: string;
}
export interface CatalogueResponse {
  snapshot: { date: string; fetchedAt: string; modelCount: number; source: string };
  families: CapabilityFamily[]; capabilities: CapabilityRecord[]; models: DirectoryModel[];
  counts: { capabilities: number; models: number; ready: number; needsInput: number; experimental: number; planned: number };
}
export const CAPABILITY_FAMILIES: CapabilityFamily[] = [
  { id: 'images-design', name: 'Images & design', description: 'Create, edit, isolate and finish still imagery.' },
  { id: 'cast-continuity', name: 'Cast & continuity', description: 'Reuse people, places, products and approved references.' },
  { id: 'cinema-video', name: 'Cinema & video', description: 'Direct shots, animate frames and finish moving images.' },
  { id: 'performance-dialogue', name: 'Performance & dialogue', description: 'Speech, faces, motion transfer and timed captions.' },
  { id: 'music-motion', name: 'Music & motion design', description: 'Sound beds, waveforms and graphic motion.' },
  { id: 'stories-comics', name: 'Stories & comics', description: 'Scenes, shot boards, pages and film structure.' },
  { id: 'products-campaigns', name: 'Products & campaigns', description: 'Product scenes, reusable visual kits and format variants.' },
  { id: '3d-spatial', name: '3D & spatial', description: 'Meshes, textures, rigs, animation and scene inspection.' },
  { id: 'playables-interactive', name: 'Playables & interactive', description: 'Branching films and portable browser experiences.' },
  { id: 'recipes-workflows', name: 'Recipes & workflows', description: 'Reusable inputs, production chains and readable provenance.' },
  { id: 'projects-collaboration', name: 'Projects & collaboration', description: 'Durable workspaces, takes, review and handoff.' },
  { id: 'automation-integrations', name: 'Automation & integrations', description: 'Recoverable jobs, project packages and controlled automation.' },
];
import type { CatalogueDemonstrationView, MediaModality } from './catalogue-types';
