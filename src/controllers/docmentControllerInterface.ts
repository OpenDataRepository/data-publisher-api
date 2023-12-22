export interface DocumentControllerInterface {
  create: (req, res, next) => Promise<void>;
  update: (req, res, next)=> Promise<void>;
  draft: (req, res, next) => Promise<void>;
  deleteDraft: (req, res, next) => Promise<void>;
  lastUpdate: (req, res, next) => Promise<void>;
  persist: (req, res, next) => Promise<void>;
  latestPersisted: (req, res, next) => Promise<void>;
  persistedBeforeTimestamp: (req, res, next) => Promise<void>;
  draftExisting: (req, res, next) => Promise<void>;
}