import { Db, ObjectId } from "mongodb";

export interface DocumentInterface {

  collection: Db;

  // Input: the document to create
  // Output: the UUID of the created document
  create: (document: Record<string, any>) => Promise<string>;

  // Input: the UUID of the document to update
  update: (document: Record<string, any>) => Promise<void>;

  // Inputs: 
  //  - uuid: the UUID of the document to fetch
  //  - create_from_persisted_if_no_draft: set to true if you want a draft to automatically be generated 
  //    from the latest persisted document in the case that no draft currently exists.
  //    create_from_persisted_if_no_draft by default is set to false while providing the option of being set to true, 
  //    but see comments per implementation as each implementation may handle this differently
  // Output: the document if it exists; otherwise null
  draftGet: (uuid: string, create_from_persisted_if_no_draft?: boolean) => Promise<Record<string, any> | null>;

  // Input: the UUID of the document draft to delete
  draftDelete: (uuid: string) => Promise<void>;

  // Input: the UUID of the document whose latest update time is to be fetched
  // Output: the latest update time of the document if it exists; otherwise null
  lastUpdate: (uuid: string) => Promise<Date | null>;

  // Inputs: 
  // - uuid: the UUID of the document whose draft is to be persisted
  // - last_update: the last update time of the document. This is to ensure that the document trying to be persisted is the one the user thinks it is
  //   last_update is optional, as internally sometimes we just want to persist. 
  persist: (uuid: string, last_update?: Date) => Promise<ObjectId>;

  // Input: the UUID of the document whose latest persisted version is to be fetched
  // Output: the latest persisted version of the document if it exists; otherwise null
  latestPersisted: (uuid: string) => Promise<Record<string, any> | null>;

  // Inputs:
  // - uuid: the UUID of the document to be fetched
  // - date: the date spedifying the document is to be fetched as it existed at that time, aka, the document's last persisted version before that date
  // Output: the document as it existed at the specified date if it exists; otherwise null
  latestPersistedBeforeTimestamp: (uuid: string, date: Date) => Promise<Record<string, any> | null>;

  // Input: the UUID of the document whose draft is to be checked for existence
  // Output: true if the document draft exists; otherwise false
  draftExisting: (uuid: string) => Promise<boolean>;

}