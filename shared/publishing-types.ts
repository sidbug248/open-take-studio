export type PublicationState='draft'|'scheduled'|'sending'|'published'|'failed'|'uncertain'|'cancelled';
export type PublicationVisibility='public'|'unlisted'|'private';
export interface PublishingConnection {id:string;projectId:string;provider:'mastodon';origin:string;accountId:string;account:string;connected:boolean;createdAt:string;}
export interface PublicationAsset {assetId:string;sha256:string;name:string;mimeType:string;size:number;alt:string;}
export interface Publication {id:string;projectId:string;connectionId:string;destination:string;caption:string;visibility:PublicationVisibility;dueAt:string;assets:PublicationAsset[];state:PublicationState;fingerprint:string;createdAt:string;updatedAt:string;approvedAt?:string;approvedBy?:string;stage?:'media'|'post';uploaded?:{assetId:string;remoteId:string;ready:boolean}[];remoteId?:string;remoteUrl?:string;publishedAt?:string;error?:string;}
export interface PublicationDraft {connectionId:string;caption:string;visibility:PublicationVisibility;dueAt:string;assetIds:string[];altText?:Record<string,string>;clientRequestId:string;}
