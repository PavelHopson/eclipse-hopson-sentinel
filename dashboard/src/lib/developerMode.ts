export const DEVELOPER_APPROVAL_SCHEMA = 'eclipse.ultron.developer-approval.v1';

export interface DeveloperWorkspace {
  id: string;
  name: string;
  files: number;
  truncated: boolean;
  openedAt: string;
}

export interface DeveloperProposal {
  schemaVersion: string;
  requestId: string;
  workspaceId: string;
  workspaceName: string;
  summary: string;
  assumptions: string[];
  risks: string[];
  changes: Array<{ path: string; expectedSha256: string; afterSha256: string; diff: string }>;
  createdAt: string;
  expiresAt: string;
}

export interface DeveloperReceipt {
  schemaVersion: string;
  receiptId: string;
  requestId?: string;
  workspaceId: string;
  workspaceName: string;
  status: 'applied' | 'rolled-back';
  files: Array<{ path: string; beforeSha256: string; afterSha256: string } | string>;
  appliedAt?: string;
  rolledBackAt?: string;
  rollbackAvailable?: boolean;
}

export interface RollbackPreview {
  schemaVersion: string;
  requestId: string;
  receiptId: string;
  workspaceId: string;
  files: Array<{ path: string; restoreSha256: string; currentSha256: string }>;
  expiresAt: string;
}

type BridgeResult<T> = { ok: true } & T | { ok: false; canceled?: boolean; error?: { code: string; message: string } };

interface DeveloperBridge {
  selectWorkspace(): Promise<BridgeResult<{ workspace: DeveloperWorkspace }>>;
  propose(task: string): Promise<BridgeResult<{ model: string; proposal: DeveloperProposal }>>;
  cancel(): Promise<boolean>;
  apply(approval: DeveloperApproval): Promise<BridgeResult<{ receipt: DeveloperReceipt }>>;
  previewRollback(): Promise<BridgeResult<{ preview: RollbackPreview }>>;
  rollback(approval: DeveloperApproval): Promise<BridgeResult<{ receipt: DeveloperReceipt }>>;
}

interface DeveloperApproval {
  schemaVersion: typeof DEVELOPER_APPROVAL_SCHEMA;
  requestId: string;
  workspaceId: string;
  confirmed: true;
}

declare global {
  interface Window { ultronDeveloper?: DeveloperBridge }
}

const unavailable = (): BridgeResult<never> => ({
  ok: false,
  error: { code: 'DEVELOPER_DESKTOP_REQUIRED', message: 'Developer Mode доступен в установленном Eclipse Ultron.' },
});

export const createDeveloperApproval = (requestId: string, workspaceId: string): DeveloperApproval => ({
  schemaVersion: DEVELOPER_APPROVAL_SCHEMA,
  requestId,
  workspaceId,
  confirmed: true,
});

export const selectDeveloperWorkspace = () => window.ultronDeveloper?.selectWorkspace() ?? Promise.resolve(unavailable());
export const requestDeveloperProposal = (task: string) => window.ultronDeveloper?.propose(task) ?? Promise.resolve(unavailable());
export const cancelDeveloperProposal = () => window.ultronDeveloper?.cancel() ?? Promise.resolve(false);
export const applyDeveloperProposal = (proposal: DeveloperProposal) => window.ultronDeveloper?.apply(createDeveloperApproval(proposal.requestId, proposal.workspaceId)) ?? Promise.resolve(unavailable());
export const previewDeveloperRollback = () => window.ultronDeveloper?.previewRollback() ?? Promise.resolve(unavailable());
export const executeDeveloperRollback = (preview: RollbackPreview) => window.ultronDeveloper?.rollback(createDeveloperApproval(preview.requestId, preview.workspaceId)) ?? Promise.resolve(unavailable());
