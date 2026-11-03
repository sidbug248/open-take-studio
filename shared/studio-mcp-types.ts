export type StudioMcpPermission = 'read' | 'local-write';

export interface StudioMcpToken {
  id: string;
  projectId: string;
  workspaceId: string;
  name: string;
  permissions: StudioMcpPermission[];
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
  lastUsedAt?: string;
}
export interface StudioMcpTokenView extends StudioMcpToken {
  endpoint: string;
  status: 'active' | 'expired' | 'revoked';
}
export interface StudioMcpTokenList {
  tokens: StudioMcpTokenView[];
  workspaceId: string;
  projectId: string;
  maxExpiryHours: number;
}
export interface StudioMcpTokenCreated {
  token: StudioMcpTokenView;
  /** Returned exactly once. The server stores only its SHA-256 digest. */
  bearerToken: string;
}
