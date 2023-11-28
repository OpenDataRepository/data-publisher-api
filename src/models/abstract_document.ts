import { ObjectId } from "mongodb";
import { StringLiteralLike } from "typescript";
import { PermissionTypes, model as PermissionsModel } from "./permission";
import * as Util from '../lib/util';
import { BasicAbstractDocument } from "./basic_abstract_document";
const MongoDB = require('../lib/mongoDB');

// TODO: re-write the whole code base to use this class instead of shared_functions and delete shared_functions

/**
 * Abstract Class Document.
 * Template field, template, dataset and record will all inherit from this class
 *
 * @class AbstractDocument
 */
export class AbstractDocument extends BasicAbstractDocument {
  collection: any;
  state: any;

  async executeWithTransaction(callback){
    if(this.state.session) {
      return callback();
    }
    const session = MongoDB.newSession();
    this.state.session = session;
    let result;
    try {
      await session.withTransaction(async () => {
        try {
          result = await callback();
        } catch(err) {
          await session.abortTransaction();
          throw err;
        }
      });
      session.endSession();
      delete this.state.session;
      return result;
    } catch(err) {
      session.endSession();
      delete this.state.session;
      throw err;
    }
  }

  async shallowDraft(uuid: string): Promise<Record<string, any> | null> {
    let cursor = await this.collection.find(
      {uuid, 'persist_date': {'$exists': false}}, 
      {session: this.state?.session}
    ).sort({'updated_at': -1});
  
    if(!(await cursor.hasNext())) {
      return null;
    } 
    let draft = await cursor.next();
    while (await cursor.hasNext()) {
      console.error(`Duplicate draft found and deleted for uuid ${uuid}.`);
      let second_draft = await cursor.next();
      await this.draftDeleteBy_id(second_draft._id);
    }
    return draft;
  }

  async draftDeleteBy_id(_id: ObjectId): Promise<void>{
    await this.collection.deleteMany(
      { _id, persist_date: {'$exists': false} },
      { session: this.state?.session }
    );
  }

  async fetchBy_id(_id: ObjectId): Promise<Record<string, any> | null>{
    let cursor = await this.collection.find(
      {_id}
    );
  
    if(!(await cursor.hasNext())) {
      return null;
    } 
    let draft = await cursor.next();
    return draft;
  }

  async shallowLatestPersisted(uuid: string): Promise<Record<string, any> | null>{
    let cursor = await this.collection.find(
      {"uuid": uuid, 'persist_date': {'$exists': true}}, 
      {session: this.state?.session}
    ).sort({'persist_date': -1})
    .limit(1);
    if (!(await cursor.hasNext())) {
      return null;
    }
    return await cursor.next();
  }

  // Get's latest version of document, whether it's a draft or persisted version
  async shallowLatestDocument(uuid: string): Promise<Record<string, any> | null>{
    let result = await this.shallowDraft(uuid);
    if(result) {
      return result;
    }
    result = await this.shallowLatestPersisted(uuid);
    return result;
  }

  static convertToMongoId(_id: string | ObjectId): ObjectId {
    if(typeof(_id) === 'string') {
      if(!ObjectId.isValid(_id)) {
        throw new Util.InputError(`Invalid _id provided: ${_id}`);
      }
      return new ObjectId(_id);
    } else {
      return _id
    }
  }

  // Finds the uuid of the document with the given _id
  async uuidFor_id(_id: ObjectId): Promise<string | null>{
    _id = AbstractDocument.convertToMongoId(_id);
    let cursor = await this.collection.find(
      {_id}, 
      {session: this.state?.session}
    );
    if (!(await cursor.hasNext())) {
      return null;
    }
    let document = await cursor.next();
    return document.uuid;
  }

  async latestPersisted_idForUuid(uuid: string): Promise<ObjectId | null>{
    let document = await this.shallowLatestPersisted(uuid);
    return document ? document._id : null;
  }

  async latestPersistedTimeForUuid(uuid: string): Promise<Date | null>{
    let document = await this.shallowLatestPersisted(uuid);
    return document ? document.persist_date : null;
  }

  async isPublic(uuid: string): Promise<boolean>{
    let latest_persisted = await this.shallowLatestPersisted(uuid);
    if(!latest_persisted) {
      return false;
    }
    return Util.isPublic(latest_persisted.public_date);
  }

  // Creates a new draft from the latest persisted version
  // Each subclass has own implementation.
  async createDraftFromPersisted(persisted_doc: Record<string, any>): Promise<Record<string, any>> {
    throw new Error('createDraftFromPersisted not implemented');
  }

  async shallowDraftDelete(uuid: string): Promise<void>{
    let response = await this.collection.deleteMany(
      { uuid, persist_date: {'$exists': false} },
      { session: this.state.session }
    );
    if (response.deletedCount > 1) {
      console.error(`draftDelete: Document with uuid '${uuid}' had more than one draft to delete.`);
    }
  }

  relatedDocsType(): string {
    throw new Error('relatedDocsType not implemented');
  }

  // Recursive draft fetch.
  // Each subclass has own implementation.
  async draftFetch(uuid: string, create_from_persisted_if_no_draft?: boolean): Promise<Record<string, any> | null> {
    throw new Error('draftFetch not implemented');
  }

  // Recursive fetch.
  // Each subclass has own implementation.
  async latestPersistedWithJoinsAndPermissions(uuid: string): Promise<Record<string, any> | null> {
    throw new Error('latestPersistedWithJoinsAndPermissions not implemented');
  }

  // Recursive fetch.
  // All subclasses fetch first the draft if avaialabe, then the latest persisted version if the draft is unavailable.
  async fetchLatestDraftOrPersisted(uuid, create_from_persisted_if_no_draft?){
    let draft;
    if(create_from_persisted_if_no_draft) {
      draft = await this.draftFetch(uuid, create_from_persisted_if_no_draft);
    } else {
      draft = await this.draftFetch(uuid);
    }
    if(draft) {
      return draft;
    }
    return this.latestPersistedWithJoinsAndPermissions(uuid);
  }

  async godfatherUpdated(uuid: string): Promise<Record<string, any> | null> {
    return Promise.resolve(null);
  }

  async anyFieldUpdated(field_uuids: string[], persisted_template_update: Date): Promise<boolean> {
    return false;
  }

  async shallowUpdateDraftWithUpdatedGodfather(draft: Record<string, any>, updated_godfather: Record<string, any>): Promise<Record<string, any>> {
    throw new Error('updateDraftWithUpdatedGodfather not implemented')
  }

  async shallowCreateDraftFromPersistedAndUpdatedGodfather(persisted_doc: Record<string, any>, updated_godfather: Record<string, any>): Promise<Record<string, any>> {
    throw new Error('shallowCreateDraftFromPersistedAndUpdatedGodfather not implemented')
  }

  async hasPermission(uuid: string, permission_level: PermissionTypes): Promise<boolean> {
    let explicit_permission = await (new PermissionsModel(this.state)).hasExplicitPermission(uuid, permission_level);
    if(permission_level == PermissionTypes.view) {
      return explicit_permission || await this.isPublic(uuid);
    }
    return explicit_permission;
  }
 
  // When changes happen to godparents or children, a document can get out of sync / out of date. This function repairs the document.
  // 1. Creating drafts for descendant drafts or new descendant versions
  // 2. Creating a draft if the godfather has a new version
  // 3. Updating the draft if the godfather has a new version
  // 4. Create template draft if field is updated
  async repairDraft(uuid: string, id?: ObjectId): Promise<boolean>{
    let draft_already_existing = false;
    let draft_: any = await this.shallowDraft(uuid);
    let persisted_doc = await this.shallowLatestPersisted(uuid);

    // TODO: at some point, implement this for dataset as well
    const updated_godfather = await this.godfatherUpdated(uuid);

    if (draft_) {
      draft_already_existing = true;
      // If a draft is already existing, but the godfather (record's dataset or dataset's template) has been updated, modify the reference to it
      if(updated_godfather) {
        draft_ = await this.shallowUpdateDraftWithUpdatedGodfather(draft_, updated_godfather);
      }
    } else {
      // doc doesn't exist: return
      if(!persisted_doc) {
        return false;
      }
      // Create draft based on new godfather version
      if(updated_godfather) {
        draft_ = await this.shallowCreateDraftFromPersistedAndUpdatedGodfather(persisted_doc, updated_godfather);
      } else {
        draft_ = await this.createDraftFromPersisted(persisted_doc);
      }
    }
    // don't have permissions, don't do anything
    if(!(await this.hasPermission(uuid, PermissionTypes.edit))) {
      return false;
    }

    let related_doc_changes = false;

    let related_docs = this.relatedDocsType();

    // If we already have a draft, use the draft related_docs
    // Otherwise, use latest persisted related_docs (include the _ids in case a related_doc has a new version)
    if(draft_already_existing) {
      for(let related_uuid of draft_[related_docs]) {
        related_doc_changes ||= await this.repairDraft(related_uuid);
      }
    } else if(persisted_doc) {
      for(let related_id of persisted_doc[related_docs]) {
        let related_uuid = await this.uuidFor_id(related_id);
        related_doc_changes ||= await this.repairDraft(related_uuid as string, related_id);
      }
    } else {
      throw "repairDraft: this line should be impossible to reach";
    }

    // handle fields - only for template
    if(!related_doc_changes) {
      let persisted_template_update = persisted_doc ? persisted_doc.updated_at : new Date(0);
      related_doc_changes ||= await this.anyFieldUpdated(draft_['fields'], persisted_template_update);
    }

    let new_persisted_version = false;
    if(persisted_doc && persisted_doc._id.toString() != id?.toString()) {
      new_persisted_version = true;
    }

    // There is an update
    if(!draft_already_existing && (related_doc_changes || updated_godfather)) {
      draft_.updated_at = this.state.updated_at;
      // Create draft for this level
      // Only need to insert because references are just uuids, and those don't change
      // Only thing that might change is godfather _id, which is handled separately
      let response = await this.collection.insertOne(draft_);
      if (!response.acknowledged || !response.insertedId) {
        throw new Error(`repairDraft: acknowledged: ${response.acknowledged}. insertedId: ${response.insertedId}`);
      }
    }
    return draft_already_existing || related_doc_changes || new_persisted_version || !!updated_godfather;
  }

}