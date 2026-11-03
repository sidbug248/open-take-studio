import type {Asset,Take} from './types';
import type {SpatialSceneDocument,Vec3} from './spatial-types';
export interface ObjectRoomView {id:string;name:string;annotation:string;cameraViewId:string;hotspot?:Vec3;imageAssetId?:string;audioAssetId?:string;}
export interface ObjectRoomDocument {version:1;name:string;description:string;sceneAssetId:string;startViewId:string;views:ObjectRoomView[];accent:string;}
export interface ObjectRoomSaved {asset:Asset;take:Take;document:ObjectRoomDocument;scene:SpatialSceneDocument;}
export interface ObjectRoomPlayerManifest {format:'open-take-object-room';version:1;document:ObjectRoomDocument;scene:SpatialSceneDocument;assets:Pick<Asset,'id'|'name'|'kind'|'mimeType'|'sha256'|'size'|'url'|'provenance'>[];credits:{assetId:string;name:string;provenance:string;modelId?:string;provider?:string}[];}
