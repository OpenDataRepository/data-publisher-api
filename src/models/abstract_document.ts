import { ObjectId } from "mongodb";
import { PermissionTypes, model as PermissionsModel } from "./permission";

// TODO: re-write the whole code base to use this class instead of shared_functions and delete shared_functions

/**
 * Abstract Class Document.
 * Template field, template, dataset and record will all inherit from this class
 *
 * @class AbstractDocument
 */
export class AbstractDocument {
  collection: any;
  state: any;

  constructor() {
    if (this.constructor == AbstractDocument) {
      throw new Error("Abstract classes can't be instantiated.");
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

  async isPublic(uuid: string): Promise<boolean>{
    let latest_persisted = await this.shallowLatestPersisted(uuid);
    if(!latest_persisted) {
      return false;
    }
    return Util.isPublic(latest_persisted.public_date);
  }

  async createDraftFromPersisted(persisted_doc: Record<string, any>): Promise<Record<string, any>> {
    throw new Error('createDraftFromPersisted not implemented');
  }

  async hasPermission(uuid: string, permission_level: PermissionTypes): Promise<boolean> {
    let explicit_permission = await (new PermissionsModel(this.state)).hasExplicitPermission(uuid, permission_level);
    if(permission_level == PermissionTypes.view) {
      return explicit_permission || await this.isPublic(uuid);
    }
    return explicit_permission;
  }
 
  async createAncestorDraftsForDecendantDrafts(uuid: string, id?: ObjectId): Promise<boolean>{
    let draft_already_existing = false;
    let draft_: any = await this.shallowDraft(uuid);
    let persisted_doc = await this.shallowLatestPersisted(uuid);
    if (draft_) {
      draft_already_existing = true;
    } else {
      if(!persisted_doc) {
        return false;
      }
      draft_ = await this.createDraftFromPersisted(persisted_doc);
    }
    if(!(await this.hasPermission(uuid, PermissionTypes.edit))) {
      return false;
    }

    let child_draft_found = false;

    let related_docs = "";
    if(draft_.related_templates) {
      related_docs = "related_templates";
    } else if (draft_.related_datasets) {
      related_docs = "related_datasets";
    } else if (draft_.related_records) {
      related_docs = "related_records";
    } else {
      throw new Error('createAncestorDraftsForDecendantDrafts: not record, dataset or template');
    }
    if(persisted_doc) {
      for(let related_id of persisted_doc[related_docs]) {
        let related_uuid = await this.uuidFor_id(related_id);
        child_draft_found ||= await this.createAncestorDraftsForDecendantDrafts(related_uuid as string, related_id);
      }
    } else {
      for(let related_uuid of draft_[related_docs]) {
        child_draft_found ||= await this.createAncestorDraftsForDecendantDrafts(related_uuid);
      }
    }
    let new_persisted_version = false;
    if(persisted_doc && persisted_doc._id.toString() != id?.toString()) {
      new_persisted_version = true;
    }

    if(!draft_already_existing && child_draft_found) {
      draft_.updated_at = new Date();
      // Create draft for this level
      let response = await this.collection.insertOne(draft_);
      if (!response.acknowledged || !response.insertedId) {
        throw new Error(`createAncestorDraftsForDecendantDrafts: acknowledged: ${response.acknowledged}. insertedId: ${response.insertedId}`);
      } 
    }
    return draft_already_existing || child_draft_found || new_persisted_version;
  }

}