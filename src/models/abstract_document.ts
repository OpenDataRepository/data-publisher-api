import { ObjectId } from "mongodb";
import { PermissionTypes, model as PermissionsModel } from "./permission";
import * as Util from '../lib/util';
import { BasicAbstractDocument } from "./basic_abstract_document";

/**
 * Abstract Class Document.
 * Template field, template, dataset and record will all inherit from this class
 *
 * @class AbstractDocument
 */
export class AbstractDocument extends BasicAbstractDocument {

  permission_model: PermissionsModel;

  constructor(state) {
    super(state);
    if (this.constructor == AbstractDocument) {
      throw new Error("Abstract classes can't be instantiated.");
    }
    this.permission_model = new PermissionsModel(state);
  }

  throwNotImplementedError(): never {
    throw new Error(arguments.callee.caller + ' not implemented in ' + this.constructor.name);
  }

  // TODO: make many of these functions protected functions

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

  async shallowLatestPersistedBeforeTimestamp(uuid: string, timestamp: Date): Promise<Record<string, any> | null>{
    let cursor = await this.collection.find(
      {"uuid": uuid, 'persist_date': {'$lte': timestamp}}, 
      {session: this.state?.session}
    ).sort({'persist_date': -1})
    .limit(1);
    if (!(await cursor.hasNext())) {
      return null;
    }
    return await cursor.next();
  }

  async shallowLatestPersisted(uuid: string): Promise<Record<string, any> | null>{
    return await this.shallowLatestPersistedBeforeTimestamp(uuid, new Date());
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
  // Finds the uuid of the document with the given _id
  async uuidFor_id(_id: ObjectId): Promise<string | null>{
    _id = Util.convertToMongoId(_id);
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
    this.throwNotImplementedError();
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
    this.throwNotImplementedError();
  }

  // Recursive draft fetch.
  // Each subclass has own implementation.
  async draftFetch(uuid: string, create_from_persisted_if_no_draft?: boolean): Promise<Record<string, any> | null> {
    this.throwNotImplementedError();
  }


  // TODO: this function can not be commonized entirely, but I think it can be commonized significantly. Give it a try
  async persistedWithJoins(pipelineMatchConditions: Record<string, any>): Promise<Record<string, any> | null> {
    this.throwNotImplementedError();
  }

  async latestPersistedBeforeTimestampWithJoins(uuid: string, date: Date): Promise<Record<string, any> | null> {
    let pipelineMatchConditions = { 
      uuid,
      'persist_date': {'$lte': date}
    };

    return await this.persistedWithJoins(pipelineMatchConditions);
  }

  async filterPersistedForPermissions(document: Record<string, any>): Promise<void> {
    this.throwNotImplementedError();
  }

  async latestPersistedBeforeTimestampWithJoinsAndPermissions(uuid: string, date: Date): Promise<Record<string, any> | null> {
    let document = await this.latestPersistedBeforeTimestampWithJoins(uuid, date);
    if(!document) {
      return null;
    }
    await this.filterPersistedForPermissions(document);
    return document;
  } 

  // TODO: template_field shouldn't have this function. Options:
  // 1. Just let it have access and trust the programmer to not use it
  // 2. Have template_field overwrite it with a function that throws an error
  // 3. Move this to a subclass of AbstractDocument that template_field doesn't inherit from. Like LinkingAbstractDocument or something

  // Fetches the last persisted document with the given uuid. 
  // Also recursively looks up linked resources.
  async latestPersistedWithJoinsAndPermissions(uuid: string): Promise<Record<string, any> | null> {
    return await this.latestPersistedBeforeTimestampWithJoinsAndPermissions(uuid, new Date());
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
    this.throwNotImplementedError();
  }

  async shallowCreateDraftFromPersistedAndUpdatedGodfather(persisted_doc: Record<string, any>, updated_godfather: Record<string, any>): Promise<Record<string, any>> {
    this.throwNotImplementedError();
  }

  async hasPermission(uuid: string, permission_level: PermissionTypes): Promise<boolean> {
    let explicit_permission = await this.permission_model.hasExplicitPermission(uuid, permission_level);
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
      let response = await this.collection.insertOne(draft_, {session: this.state?.session});
      if (!response.acknowledged || !response.insertedId) {
        throw new Error(`repairDraft: acknowledged: ${response.acknowledged}. insertedId: ${response.insertedId}`);
      }
    }
    return draft_already_existing || related_doc_changes || new_persisted_version || !!updated_godfather;
  }

  async latestShallowDocumentsForUuids(uuids: string[]){
    let unfiltered_docs = await this.collection.find({"uuid": {"$in": uuids}})
      .sort({'updated_at': -1})
      .toArray();
    let docs: Record<string, any>[] = [];
    // after getting results, use a set to only keep the latest version of each uuid
    let seen_uuids = new Set();
    for(let doc of unfiltered_docs) {
      if(!seen_uuids.has(doc.uuid)) {
        seen_uuids.add(doc.uuid);
        docs.push(doc);
      }
    }
    return docs;
  }

  async latestPublicDocuments(){
    let all_public_uuids = await this.allPublicPersistedUuids();
    let unfiltered_docs = await this.collection.find({"uuid": {"$in": all_public_uuids}})
      .sort({'persist_date': -1})
      .toArray();
    let docs: Record<string, any>[] = [];
    // after getting results, use a set to only keep the latest version of each uuid
    // also only keep it if the latest version is public
    let seen_uuids = new Set();
    for(let doc of unfiltered_docs) {
      if(!seen_uuids.has(doc.uuid)) {
        if(doc.public_date && Util.isTimeAAfterB(new Date(), doc.public_date)) {
          docs.push(doc);
        }
        seen_uuids.add(doc.uuid);
      }
    }
    return docs;
  }
  
  async allPublicPersistedUuids(): Promise<string[]>{
    return await this.collection.distinct(
      "uuid",
      {public_date: {$exists: true, $lte: new Date()}, persist_date: {$exists: true}}
    );
  }

  async uuidsInThisCollection(uuids: string[]): Promise<string[]>{
    return await this.collection.distinct(
      "uuid",
      {"uuid": {$in: uuids}}
    );
  }

  async allDocumentUuidsAbovePermissionLevel(permission_level: PermissionTypes): Promise<string[]> {
    let uuids_all_collections = await new PermissionsModel(this.state).allDocumentsAllUuidsAbovePermissionLevel(permission_level);
    return await this.uuidsInThisCollection(uuids_all_collections);
  }

  async onlyDraftDelete(uuid: string): Promise<void> {
    // if draft doesn't exist, return not found
    if(!(await this.shallowDraft(uuid))) {
      throw new Util.NotFoundError(`No draft exists with uuid ${uuid}`);
    }
    // if don't have admin permissions, return no permissions
    if(!(await (new PermissionsModel(this.state)).hasExplicitPermission(uuid, PermissionTypes.edit))) {
      throw new Util.PermissionDeniedError(`You do not have edit permissions ${uuid}.`);
    }

    await this.shallowDraftDelete(uuid);
  }

  async deleteDraftWithPermissions(uuid: string): Promise<void> {
    const callback = async () => {
      await this.onlyDraftDelete(uuid);
      if( !(await this.shallowLatestPersisted(uuid)) ) {
        await (new PermissionsModel(this.state)).documentDeletePermissions(uuid);
      }
    }
    await Util.executeWithTransaction(this.state, callback);
  }

  async draftExisting(uuid: string): Promise<boolean> {
    return (await this.shallowDraft(uuid)) ? true : false;
  }

  async hasViewPermissionToPersisted(document_uuid: string, user_id = this.state.user_id): Promise<boolean> {
    if(await this.permission_model.hasExplicitPermission(document_uuid, PermissionTypes.view, user_id)) {
      return true;
    }

    if(await this.isPublic(document_uuid)) {
      return true;
    }

    return false;
  }

  async validateAndCreateOrUpdate(input_document: Record<string, any>): Promise<[boolean, string]> {
    this.throwNotImplementedError();
  }

  async persistImplementation(uuid: string, last_update?: Date): Promise<ObjectId> {
    this.throwNotImplementedError();
  }

  async latestPersistedBeforeTimestampWithPermissions(uuid: string, date: Date): Promise<Record<string, any> | null> {
    this.throwNotImplementedError();
  }

  // Core API functions shared by subclasses and called by the respective controllers
  // They mostly just wrap the actual function with a transaction, sometimes doing a bit of prep work as well

  async create(document: Record<string, any>): Promise<string> {
    let callback = async () => {
      this.state.updated_at = new Date();
      return await this.validateAndCreateOrUpdate(document);
    };
    let result = await this.executeWithTransaction(callback);
    let inserted_uuid = result[1];
    return inserted_uuid;
  }

  async update(document: Record<string, any>): Promise<void> {
    let callback = async () => {
      this.state.updated_at = new Date();
      return await this.validateAndCreateOrUpdate(document);
    };
    await this.executeWithTransaction(callback);
  }

  // The external facing api requires last_update to be provided to ensure the user has the latest change, but internally it's easier to ignore it
  async persist(uuid: string, last_update?: Date): Promise<ObjectId> {
    let callback = async () => {
      return await this.persistImplementation(uuid, last_update);
    };
    return await this.executeWithTransaction(callback);
  }

  async draftDelete(uuid: string): Promise<void> {
    await this.deleteDraftWithPermissions(uuid);
  }

}
