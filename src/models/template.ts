const MongoDB = require('../lib/mongoDB');
const { v4: uuidv4, validate: uuidValidate } = require('uuid');
import * as Util from '../lib/util';
import { ObjectId } from 'mongodb';
const TemplateFieldModel = require('./template_field');
const PermissionModel = require('./permission');
const SharedFunctions = require('./shared_functions');
const LegacyUuidToNewUuidMapperModel = require('./legacy_uuid_to_new_uuid_mapper');

const Schema = Object.freeze({
  bsonType: "object",
  required: [ "_id", "uuid", "updated_at", "fields", "related_templates", "subscribed_templates" ],
  properties: {
    _id: {
      bsonType: "objectId",
      description: "identifies a specific version of the template with this uuid"
    },
    uuid: {
      bsonType: "string",
      description: "identifies the template, but the uuid is common between all versions of said template"
      // uuid should be in a valid uuid format as well
    },
    name: {
      bsonType: "string"
    },
    description: {
      bsonType: "string"
    },
    updated_at: {
      bsonType: "date",
      description: "identifies the last update for this version of this template"
    },
    persist_date: {
      bsonType: "date",
      description: "if persisted, identifies the time of persistance for this version of this template"
    },
    public_date: {
      bsonType: "date",
      description: "identifies the time specified for this template to go public. Note: the public date on the latest version is used for all versions of the template"
    },
    old_system_uuid: {
      bsonType: "string",
      description: "the uuid of this template as imported from the legacy system"
    },
    duplicated_from: {
      bsonType: "string",
      description: "if this template is duplicated from elsewhere, specifies which template it was duplicated from"
    },
    fields: {
      bsonType: "array",
      description: "fields this template links to",
      uniqueItems: true
    },
    related_templates: {
      bsonType: "array",
      description: "templates this template links to",
      uniqueItems: true
    },
    subscribed_templates: {
      bsonType: "array",
      description: "templates this template subscribes to",
      uniqueItems: true,
      items: {
        bsonType: "objectId"
      }
    }
  },
  additionalProperties: false
});

var Template;
var TemplateField;

// Returns a reference to the template Mongo Collection
async function collection() {
  if (Template === undefined) {
    let db = MongoDB.db();
    try {
      await db.createCollection('templates', {validator: { $jsonSchema: Schema} });
      await db.collection('templates').createIndex({ uuid: 1 });
    } catch(e) {}
    Template = db.collection('templates');
  }
  return Template;
}

async function init() {
  Template = await collection();
  TemplateField = await TemplateFieldModel.init();
}

function collectionExport() {
  return Template;
}

class Model {

  collection = Template;

  constructor(public state){
    this.state = state;
  }

  // Creates a draft from the persisted version.
  async #createDraftFromPersisted(persisted: Record<string, any>): Promise<Record<string, any>> {

    // Create a copy of persisted
    let draft = Object.assign({}, persisted);

    delete draft._id;
    draft.updated_at = draft.persist_date;
    delete draft.persist_date;

    // Replace each of the field _ids with uuids.
    let fields: any[] = [];
    for(let _id of persisted.fields) {
      let uuid = await SharedFunctions.uuidFor_id(TemplateField, _id, this.state.session);
      if(uuid) {
        fields.push(uuid);
      } else {
        console.log(`Failed to find a template field with internal id ${_id}. Therefore, removing the reference to it from template with uuid ${draft.uuid}`);
      }
    }
    draft.fields = fields;

    // Replace each of the related_template _ids with uuids. 
    let related_templates: string[] = [];
    for(let _id of persisted.related_templates) {
      let uuid = await SharedFunctions.uuidFor_id(Template, _id, this.state.session);
      if(uuid) {
        related_templates.push(uuid);
      } else {
        console.log(`Failed to find a template with internal id ${_id}. Therefore, removing the reference to it from template with uuid ${draft.uuid}`);
      }
    }
    draft.related_templates = related_templates;

    return draft;

  }

  // async fetchPersistAndConvertToDraft(uuid, session) {
  //   let persisted_template = await SharedFunctions.latestPersisted(Template, uuid, session);
  //   if(!persisted_template) {
  //     return null;
  //   }

  //   return (await this.#createDraftFromPersisted(persisted_template));
  // }

  // Fetches a template draft 
  // If it does not exist, it creates a draft from the latest persisted.
  // Does not lookup fields or related_templates
  async #fetchDraftOrCreateFromPersisted(uuid: string): Promise<Record<string, any> | null> {
    let template_draft = await SharedFunctions.draft(Template, uuid, this.state.session);
    if(template_draft) {
      return template_draft;
    }

    let persisted_template = await SharedFunctions.latestPersisted(Template, uuid, this.state.session);
    if(!persisted_template) {
      return null;
    }
    template_draft = await this.#createDraftFromPersisted(persisted_template);

    return template_draft;
  }

  #convertObjectIdArrayToStringArray(object_ids: ObjectId[]): string[] {
    let string_array: any[] = [];
    for(let object_id of object_ids) {
      string_array.push(object_id.toString())
    }
    return string_array;
  }

  // Returns true if the provided templates are equal
  #equals(template_1: Record<string, any>, template_2: Record<string, any>): boolean {
    return template_1.uuid == template_2.uuid && 
          template_1.name == template_2.name &&
          template_1.description == template_2.description &&
          Util.datesEqual(template_1.public_date, template_2.public_date) &&
          Util.arrayEqual(template_1.fields, template_2.fields) &&
          Util.arrayEqual(template_1.related_templates, template_2.related_templates) &&
          Util.arrayEqual(
            this.#convertObjectIdArrayToStringArray(template_1.subscribed_templates), 
            this.#convertObjectIdArrayToStringArray(template_2.subscribed_templates));
  }

  // Returns true if the draft has any changes from it's previous persisted version
  async #draftDifferentFromLastPersisted(draft: Record<string, any>): Promise<boolean> {
    // If there is no persisted version, obviously there are changes
    let latest_persisted = await SharedFunctions.latestPersisted(Template, draft.uuid);
    if(!latest_persisted) {
      return true;
    }

    // If the properties have changed since the last persisting
    let latest_persist_as_draft = await this.#createDraftFromPersisted(latest_persisted);
    if (!this.#equals(draft, latest_persist_as_draft)) {
      return true;
    }

    // Finally, if any of the dependencies have been persisted more recently than this template, then there are changes
    let last_persist_date = latest_persisted.persist_date;
    for(let field of draft.fields) {
      let field_last_persisted = (await (new TemplateFieldModel.model(this.state)).latestPersistedWithoutPermissions(field)).persist_date;
      if (Util.compareTimeStamp(field_last_persisted, last_persist_date) > 0) {
        return true;
      }
    }

    for(let related_template of draft.related_templates) {
      let related_template_last_persisted = (await SharedFunctions.latestPersisted(Template, related_template)).persist_date;
      if (Util.compareTimeStamp(related_template_last_persisted, last_persist_date) > 0) {
        return true;
      }
    }

    return false;
  }

  async #templateUUIDsThatReference(uuid: string, templateOrField: string): Promise<string[]> {
    // Get the last 3 _ids associated with this uuid. Then use those _ids to find the uuids of the templates referencing this template.

    // First, get the three _ids last persisted by this uuid
    let pipeline: any[] = [
      {
        '$match': { 
          uuid,
          "persist_date": {"$exists": true}
        }
      },
      {
        '$sort' : { 'persist_date' : -1}
      },
      {
        '$limit' : 3
      },
      {
        '$group' : { '_id': null, 'ids' : { "$push": "$_id"}}
      }
    ]
    let response;
    if (templateOrField == 'template') {
      response = (await Template.aggregate(pipeline).toArray());
    } else if (templateOrField == 'template_field') {
      response = (await TemplateField.aggregate(pipeline).toArray());
    } else {
      throw new Error(`templateUUIDsThatReference: templateOrField value is invalid: ${templateOrField}`);
    }
    let ids;
    try {
      ids = response[0].ids;
    } catch(error) {
      return [];
    }

    // Look for the uuids of the templates that reference those _ids
    let property;
    if (templateOrField == 'template') {
      property = 'related_templates';
    } else if (templateOrField == 'template_field') {
      property = 'fields';
    } else {
      throw new Error(`templateUUIDsThatReference: templateOrField value is invalid: ${templateOrField}`);
    }
    pipeline = [
      {
        '$match': { 
          [property]: {"$in": ids}
        }
      },
      {
        '$project' : { 'uuid' : true, "_id": false }
      },
      {
        '$group' : { '_id' : "$uuid"}
      },
      {
        '$group' : { '_id': null, 'uuids' : { "$push": "$_id"}}
      }
    ]
    response = (await Template.aggregate(pipeline).toArray());
    let uuids;
    try {
      uuids = response[0].uuids;
    } catch(error) {
      return [];
    }
    return uuids;
  }

  async #createDraftFromLastPersisted(uuid: string): Promise<void> {
    let draft = await this.#draftFetchOrCreate(uuid);
    if(!draft) {
      throw new Util.NotFoundError();
    }
    this.state.updated_at = new Date();
    this.state.ancestor_uuids = new Set();
    await this.#validateAndCreateOrUpdate(draft);
  }

  async #createDraftFromLastPersistedWithSession(uuid: string): Promise<void> {
    let callback = async () => {
      await this.#createDraftFromLastPersisted(uuid);
    }
    await SharedFunctions.executeWithTransaction(this.state, callback);
  }

  #initializeNewDraftWithPropertiesSharedWithImport(input_template: Record<string, any>, uuid: string): Record<string, any> {
    let output_template = {
      uuid, 
      name: "",
      description: "",
      updated_at: this.state.updated_at,
      fields: [],
      related_templates: [],
      subscribed_templates: []
    };
    if (input_template.name) {
      if (typeof(input_template.name) !== 'string'){
        throw new Util.InputError('name property must be of type string');
      }
      output_template.name = input_template.name
    }
    if (input_template.description) {
      if (typeof(input_template.description) !== 'string'){
        throw new Util.InputError(`template description property (${input_template.description}) must be of type string.`);
      }
      output_template.description = input_template.description
    }
    return output_template;
  }

  async #initializeNewDraftWithProperties(input_template: Record<string, any>, uuid: string): Promise<Record<string, any>> {
    let output_template: any = this.#initializeNewDraftWithPropertiesSharedWithImport(input_template, uuid);
    if (input_template.public_date) {
      if (!Date.parse(input_template.public_date)){
        throw new Util.InputError('template public_date property must be in valid date format');
      }
      output_template.public_date = new Date(input_template.public_date);
    }
    let old_system_uuid = await (new LegacyUuidToNewUuidMapperModel.model(this.state)).get_old_uuid_from_new(uuid);
    if(old_system_uuid) {
      output_template.old_system_uuid = old_system_uuid;
    }
    return output_template;
  }

  #initializeNewImportedDraftWithProperties(input_template: Record<string, any>, uuid: string): Record<string, any> {
    let output_template: any = this.#initializeNewDraftWithPropertiesSharedWithImport(input_template, uuid);
    if (input_template._database_metadata && Util.isObject(input_template._database_metadata) && 
        input_template._database_metadata._public_date && Date.parse(input_template._database_metadata._public_date)) {
      output_template.public_date = new Date(input_template.public_date);
    }
    output_template.old_system_uuid = input_template.template_uuid;
    return output_template;
  }

  async #getUuidFromCreateOrUpdate(input_template: Record<string, any>): Promise<string> {
    let uuid;
    let permissions_model_instance = new PermissionModel.model(this.state);
    // If a template uuid is provided, this is an update
    if (input_template.uuid) {
      // Template must have a valid uuid. 
      if (!uuidValidate(input_template.uuid)) {
        throw new Util.InputError("each template must have a valid uuid property");
      }
      
      // Template uuid must exist
      if (!(await SharedFunctions.exists(Template, input_template.uuid, this.state.session))) {
        throw new Util.NotFoundError(`No template exists with uuid ${input_template.uuid}`);
      }
      
      // verify that this user is in the 'edit' permission group
      if (!(await permissions_model_instance.hasPermission(input_template.uuid, PermissionModel.PermissionTypes.edit))) {
        throw new Util.PermissionDeniedError(`Do not have edit permissions for template uuid: ${input_template.uuid}`);
      }

      uuid = input_template.uuid;
    }
    // Otherwise, this is a create
    else {
      // Generate a uuid for the new template
      uuid = uuidv4();
      // create a permissions group for the new template
      await permissions_model_instance.initializePermissionsFor(uuid);
    }
    return uuid;
  }

  async #extractFieldsFromCreateOrUpdate(input_fields: Record<string, any>[]): Promise<[Record<string, any>[], boolean]> {
    let return_fields: any[] = [];
    let changes = false;
    if (input_fields === undefined) {
      return [return_fields, changes];
    }
    if (!Array.isArray(input_fields)){
      throw new Util.InputError('fields property must be of type array');
    }
    for (let field of input_fields) {
      let field_uuid;
      try {
        [changes, field_uuid] = await (new TemplateFieldModel.model(this.state)).validateAndCreateOrUpdate(field);
      } catch(err) {
        if (err instanceof Util.NotFoundError) {
          throw new Util.InputError(err.message);
        } else if (err instanceof Util.PermissionDeniedError) {
          field_uuid = field.uuid;
        } else {
          throw err;
        }
      }
      // After validating and updating the field, replace the imbedded field with a uuid reference
      return_fields.push(field_uuid);
    }
    // It is a requirement that no field be repeated. Verify this
    if(Util.anyDuplicateInArray(return_fields)) {
      throw new Util.InputError(`Each template may only have one instance of any template field.`);
    }
    return [return_fields, changes];
  }

  async #extractRelatedTemplatesFromCreateOrUpdate(input_related_templates: Record<string, any>[]): Promise<[any[], boolean]> {
    let return_related_templates: any[] = [];
    let changes = false;
    if (input_related_templates === undefined) {
      return [return_related_templates, changes];
    }
    if (!Array.isArray(input_related_templates)){
      throw new Util.InputError('related_templates property must be of type array');
    }
    for (let related_template of input_related_templates) {
      let related_template_uuid;
      try {
        [changes, related_template_uuid] = await this.#validateAndCreateOrUpdate(related_template);
      } catch(err) {
        if (err instanceof Util.NotFoundError) {
          throw new Util.InputError(err.message);
        } else if (err instanceof Util.PermissionDeniedError) {
          // If the user doesn't have edit permissions, assume they want to link the persisted version of the template, or keep something another editor added
          related_template_uuid = related_template.uuid;
        } else {
          throw err;
        }
      }
      // After validating and updating the related_template, replace the imbedded related_template with a uuid reference
      return_related_templates.push(related_template_uuid);
    }
    // Related_templates is really a set, not a list. But Mongo doesn't store sets well, so have to manage it ourselves.
    if(Util.anyDuplicateInArray(return_related_templates)) {
      throw new Util.InputError(`Each template may only have one instance of every related_template.`);
    }
    return [return_related_templates, changes];
  }

  #buildUuidSetForPublishedTemplate(template: Record<string, any>, uuidSet: Set<string>): void {
    uuidSet.add(template.uuid);
    for(let related_template of template.related_templates) {
      this.#buildUuidSetForPublishedTemplate(related_template, uuidSet);
    }
    for(let subscribed_template of template.subscribed_templates) {
      this.#buildUuidSetForPublishedTemplate(subscribed_template, uuidSet);
    }
  }
  #createUuidSetForPublishedTemplate(template: Record<string, any>): Set<string> {
    let uuidSet = new Set<string>();
    this.#buildUuidSetForPublishedTemplate(template, uuidSet);
    return uuidSet;
  }

  async #extractSubscribedTemplateFromCreateOrUpdate(input_subscribed_template: Record<string, any>, previous_subscribed_template_ids: Set<ObjectId>, seen_uuids: Set<string>): Promise<ObjectId> {
    if(!Util.isObject(input_subscribed_template)) {
      throw new Util.InputError("Each entry in subscribed_templates must be an object");
    }
    let subscribed_id;
    try {
      subscribed_id = SharedFunctions.convertToMongoId(input_subscribed_template._id);
    } catch (err) {
      throw new Util.InputError(`Each entry in subscribed_templates must have a valid _id property.`)
    }

    let subscribed_uuid = await SharedFunctions.uuidFor_id(Template, subscribed_id);
    if(!subscribed_uuid) {
      throw new Util.InputError(`subscribed template provided with _id ${subscribed_id} does not exist`);
    }

    // Either subscribed_id had to have been on the list before before, or it has to be the latest persisted version of subscribed_uuid
    if(!previous_subscribed_template_ids.has(input_subscribed_template._id)) {
      let latest_persisted_id = await SharedFunctions.latest_persisted_id_for_uuid(Template, subscribed_uuid);
      if(!subscribed_id.equals(latest_persisted_id)) {
        throw new Util.InputError(`subscribed_template ${subscribed_id} is required to be the same _id as previously or the latest persisted version`);
      }
    }

    // Check that there is only one of each uuid subscribed
    if(seen_uuids.has(subscribed_uuid)) {
      throw new Util.InputError(`each template can only be subscribed to once by any template. 
      template with uuid ${subscribed_uuid} is subscribed twice`);
    }
    seen_uuids.add(subscribed_uuid);

    // circulary dependencies are not permitted. 
    // Use a helper function getting all uuids recursively for the subscribed template
    // Do a set intersection to see if there are any overlapping
    let subscribed_template = await this.#persistedByIdWithJoins(subscribed_id);
    let subscribed_template_id_set = this.#createUuidSetForPublishedTemplate(subscribed_template as Record<string, any>);
    let intersection = [...subscribed_template_id_set].filter(i => this.state.ancestor_uuids.has(i));
    if(intersection.length > 0) {
      throw new Util.InputError(`Circular reference ${intersection[0]} is not permitted.`);
    }

    return subscribed_id;

  }

  // Rules: can only subscribe to the latest version or maintain the version we were subscribing to. 
  // The output will of course just be that version of the persisted template fetched.
  // How will the input indicate if it wants to update? It will submit the latest persisted version of that template
  async #extractSubscribedTemplatesFromCreateOrUpdate(input_subscribed_templates: Record<string, any>[], parent_uuid: string): Promise<Record<string, any>[]> {
    let return_subscribed_templates: any[] = [];
    if (input_subscribed_templates === undefined) {
      return return_subscribed_templates;
    }
    if (!Array.isArray(input_subscribed_templates)){
      throw new Util.InputError('subscribed_templates property must be of type array');
    }

    // build previous_subscribed_ids from last persisted / last draft
    let previous_subscribed_ids: Set<ObjectId> = new Set();
    let previous_parent_persisted = await SharedFunctions.latestPersisted(Template, parent_uuid);
    if(previous_parent_persisted) {
      for(let _id of previous_parent_persisted.subscribed_templates) {
        previous_subscribed_ids.add(_id.toString());
      }
    }
    let previous_parent_draft = await SharedFunctions.draft(Template, parent_uuid);
    if(previous_parent_draft) {
      for(let _id of previous_parent_draft.subscribed_templates) {
        previous_subscribed_ids.add(_id.toString());
      }
    }

    let seen_subscribed_uuids: Set<string> = new Set();

    for (let subscribed_template of input_subscribed_templates) {
      let subscribed_template_id =  await this.#extractSubscribedTemplateFromCreateOrUpdate(subscribed_template, previous_subscribed_ids, seen_subscribed_uuids);
      // After validating and updating the related_template, replace the imbedded related_template with a uuid reference
      return_subscribed_templates.push(subscribed_template_id);
    }
    return return_subscribed_templates;
  }

  // If a uuid is provided, update the template with the provided uuid.
  // Otherwise, create a new template.
  // If the updated template is the same as the last persisted, delete the draft instead of updating. 
  // In both cases, validate the given template as well.
  // Return:
  // 1. A boolean indicating true if there were changes from the last persisted.
  // 2. The uuid of the template created / updated
  async #validateAndCreateOrUpdate(input_template: Record<string, any>): Promise<[boolean, string]> {

    // Template must be an object
    if (!Util.isObject(input_template)) {
      throw new Util.InputError(`template provided is not an object: ${input_template}`);
    }

    let uuid = await this.#getUuidFromCreateOrUpdate(input_template);
    if(this.state.ancestor_uuids.has(uuid)) {
      throw new Util.InputError(`Cannot include circlular references in the template. Template ${uuid} is circular`);
    } else {
      this.state.ancestor_uuids.add(uuid);
    }

    // Populate template properties
    let new_template = await this.#initializeNewDraftWithProperties(input_template, uuid);

    // Need to determine if this draft is any different from the persisted one.
    let changes;

    [new_template.fields, changes] = await this.#extractFieldsFromCreateOrUpdate(input_template.fields);

    let more_changes = false;
    [new_template.related_templates, more_changes] = await this.#extractRelatedTemplatesFromCreateOrUpdate(input_template.related_templates);
    changes = changes || more_changes;

    new_template.subscribed_templates = await this.#extractSubscribedTemplatesFromCreateOrUpdate(input_template.subscribed_templates, uuid);
    changes = changes || more_changes;
    

    // If this draft is identical to the latest persisted, delete it.
    // The reason to do so is so when a change is submitted, we won't create drafts of sub-templates.
    // Only create drafts for the templates that actually have changes
    if (!changes) {
      changes = await this.#draftDifferentFromLastPersisted(new_template);
      if (!changes) {
        // Delete the current draft
        try {
          await SharedFunctions.draftDelete(Template, uuid);
        } catch (err) {
          if (!(err instanceof Util.NotFoundError)) {
            throw err;
          }
        }
        this.state.ancestor_uuids.delete(uuid);
        return [false, uuid];
      }
    }

    // If a draft of this template already exists: overwrite it, using it's same uuid
    // If a draft of this template doesn't exist: create a new draft
    // Fortunately both cases can be handled with a single MongoDB UpdateOne query using upsert: true
    let session = this.state.session;
    let response = await Template.updateOne(
      {uuid, 'persist_date': {'$exists': false}}, 
      {$set: new_template}, 
      {'upsert': true, session}
    );
    if (response.upsertedCount != 1 && response.matchedCount != 1) {
      throw new Error(`Template.validateAndCreateOrUpdate: Upserted: ${response.upsertedCount}. Matched: ${response.matchedCount}`);
    } 

    // If successfull, return the uuid of the created / updated template
    this.state.ancestor_uuids.delete(uuid);
    return [true, uuid];

  }

  async #persistFields(input_field_uuids: string[]): Promise<ObjectId[]> {
    let return_field_ids: ObjectId[] = [];
    // For each template field, persist that field, then replace the uuid with the internal_id.
    // It is possible there weren't any changes to persist, so keep track of whether we actually persisted anything.
    let template_field_model_instance = new TemplateFieldModel.model(this.state);
    for (let field_uuid of input_field_uuids) {
      if(!await SharedFunctions.draft(TemplateField, field_uuid, this.state.session)) {
        let latest_persisted_field = await SharedFunctions.latestPersisted(TemplateField, field_uuid, this.state.session);
        if(!latest_persisted_field) {
          throw new Util.InputError(`Field with uuid ${field_uuid} does not exist`);
        } 
        return_field_ids.push(latest_persisted_field._id);
        continue;
      }
      try {
        let field_id = await template_field_model_instance.persistField(field_uuid);
        return_field_ids.push(field_id);
      } catch(err) {
        if (err instanceof Util.NotFoundError) {
          throw new Util.InputError("Internal reference within this draft is invalid. Fetch/update draft to cleanse it.");
        } else if (err instanceof Util.PermissionDeniedError) {
          // If the user doesn't have permissions, assume they want to link the persisted version of the field
          // But before we can link the persisted version of the field, we must make sure it exists and we have view access
          let persisted_field = await template_field_model_instance.latestPersistedWithoutPermissions(field_uuid);
          if(!persisted_field) {
            throw new Util.InputError(`you do not have edit permissions to the draft of template_field ${field_uuid}, and a persisted version does not exist.`);
          }
          return_field_ids.push(persisted_field._id);
        } else {
          throw err;
        }
      }
    } 
    return return_field_ids;
  }

  async #persistRelatedTemplates(input_related_templates_uuids: string[]): Promise<ObjectId[]> {
    let result_related_templates_ids: ObjectId[] = [];
    // For each template's related_templates, persist that related_template, then replace the uuid with the internal_id.
    // It is possible there weren't any changes to persist, so keep track of whether we actually persisted anything.
    for(let related_template_uuid of input_related_templates_uuids) {
      try {
        let related_template_id = await this.#persistRecursor(related_template_uuid);
        result_related_templates_ids.push(related_template_id);
      } catch(err) {
        if (err instanceof Util.NotFoundError) {
          throw new Util.InputError("Internal reference within this draft is invalid. Fetch/update draft to cleanse it.");
        } else if (err instanceof Util.PermissionDeniedError) {
          // If the user doesn't have permissions, assume they want to link the persisted version of the template
          // But before we can link the persisted version of the template, we must make sure it exists
          let related_template_persisted = await SharedFunctions.latestPersisted(Template, related_template_uuid, this.state.session);
          if(!related_template_persisted) {
            throw new Util.InputError(`persisted template does not exist with uuid ${related_template_uuid}`);
          }
          result_related_templates_ids.push(related_template_persisted._id);
        } else {
          throw err;
        }
      }
    }
    return result_related_templates_ids;
  }

  // Persistes the template with the provided uuid
  //   If a draft exists of the template, the user has edit permissions, and the draft has some changes, persist it
  //   If a draft doesn't exist, doesn't have changes, or the user doesn't have edit permissions, return the latest persisted instead
  //   If a draft doesn't exist or the user doesn't have edit permissions, then ensure they have view permissions for the persisted template
  // Input: 
  //   uuid: the uuid of a template to be persisted
  //   session: the mongo session that must be used to make transactions atomic
  // Returns:
  //   internal_id: the internal id of the persisted template
  async #persistRecursor(uuid: string): Promise<ObjectId> {

    var return_id;

    let persisted_template = await SharedFunctions.latestPersisted(Template, uuid, this.state.session);

    let template_draft = await SharedFunctions.draft(Template, uuid, this.state.session);

    let permissions_model_instance = new PermissionModel.model(this.state);

    // If a draft of this template doesn't exist, we'll use the persisted template instead
    if(!template_draft) {
      // There is no draft of this uuid. Return the latest persisted template instead.
      if (!persisted_template) {
        throw new Util.NotFoundError(`Template with uuid ${uuid} does not exist`);
      }
      if(!(await permissions_model_instance.hasPermission(uuid, PermissionModel.PermissionTypes.view, Template))) {
        throw new Util.PermissionDeniedError(`cannot link template with uuid ${uuid}. Requires at least view permissions.`);
      }
      return persisted_template._id;
    }

    // If a user doesn't have edit access to this template, we'll use the persisted template instead
    if(!(await permissions_model_instance.hasPermission(uuid, PermissionModel.PermissionTypes.edit))) {
      // There is no draft of this uuid. Return the latest persisted template instead.
      if (!persisted_template) {
        throw new Util.InputError(`Do not have access to template draft with uuid ${uuid}, and no persisted version exists`);
      }
      if(!(await permissions_model_instance.hasPermission(uuid, PermissionModel.PermissionTypes.view, Template))) {
        throw new Util.PermissionDeniedError(`cannot link template with uuid ${uuid}. Requires at least view permissions.`);
      }
      return persisted_template._id;
    }

    let fields = await this.#persistFields(template_draft.fields);

    let related_templates = await this.#persistRelatedTemplates(template_draft.related_templates);

    // If there are changes, persist the current draft
    let persist_time = new Date();
    let session = this.state.session;
    let response = await Template.updateOne(
      {"_id": template_draft._id},
      {'$set': {'updated_at': persist_time, 'persist_date': persist_time, 
        fields, related_templates, subscribed_templates: template_draft.subscribed_templates}},
      {session}
    )
    if (response.modifiedCount != 1) {
      throw `Template.persist: should be 1 modified document. Instead: ${response.modifiedCount}`;
    }
    return_id = template_draft._id;

    return return_id;

  }

  // Persistes the template with the provided uuid
  // Input: 
  //   uuid: the uuid of a template to be persisted
  //   session: the mongo session that must be used to make transactions atomic
  //   last_update: the timestamp of the last known update by the user. Cannot persist if the actual last update and that expected by the user differ.
  async #persist(uuid: string, last_update: Date): Promise<void> {

    // Check if a draft with this uuid exists
    let template_draft = await SharedFunctions.draft(Template, uuid, this.state.session);
    let last_persisted = await SharedFunctions.latestPersisted(Template, uuid, this.state.session);
    if(!template_draft) {
      if(last_persisted) {
        throw new Util.InputError('No changes to persist');
      } else {
        throw new Util.NotFoundError(`Template with uuid ${uuid} does not exist`);
      }
    }

    if(!(await (new PermissionModel.model(this.state)).hasPermission(uuid, PermissionModel.PermissionTypes.edit))) {
      throw new Util.PermissionDeniedError(`You do not have the edit permissions required to persist ${uuid}`);
    }

    // If the last update provided doesn't match to the last update found in the db, fail.
    let db_last_update = new Date(await this.#lastUpdateFor(uuid));
    if(last_update.getTime() != db_last_update.getTime()) {
      throw new Util.InputError(`The last update submitted ${last_update.toISOString()} does not match that found in the db ${db_last_update.toISOString()}. 
      Fetch the draft again to get the latest update before attempting to persist again.`);
    }

    // Recursively persist template, it's fields and related templates
    await this.#persistRecursor(uuid);
  }

  #recursiveBuildPersistedQuery(current_pipeline: Record<string, any>[], count: number): void {
    if(count >= 5) {
      return;
    }
    count += 1;

    let pipeline_related_templates_addon = {
      '$lookup': {
        'from': "templates",
        'let': { 'ids': "$related_templates"},
        'pipeline': [
          { 
            '$match': { 
              '$expr': { 
                '$and': [
                  { '$in': [ "$_id",  "$$ids" ] },
                ]
              }
            }
          },
          {
            '$lookup': {
              'from': "template_fields",
              'foreignField': "_id",
              'localField': "fields",
              'as': "fields"
            },
          }
        ],
        'as': "related_templates"
      }
    };

    let pipeline_subscribed_templates_addon = {
      '$lookup': {
        'from': "templates",
        'let': { 'ids': "$subscribed_templates"},
        'pipeline': [
          { 
            '$match': { 
              '$expr': { 
                '$and': [
                  { '$in': [ "$_id",  "$$ids" ] },
                ]
              }
            }
          },
          {
            '$lookup': {
              'from': "template_fields",
              'foreignField': "_id",
              'localField': "fields",
              'as': "fields"
            },
          }
        ],
        'as': "subscribed_templates"
      }
    };

    current_pipeline.push(pipeline_related_templates_addon);
    this.#recursiveBuildPersistedQuery(pipeline_related_templates_addon['$lookup']['pipeline'], count);

    current_pipeline.push(pipeline_subscribed_templates_addon);
    this.#recursiveBuildPersistedQuery(pipeline_subscribed_templates_addon['$lookup']['pipeline'], count);

  }

  // Fetches the template with the specified match conditions, including fetching fields and related_records
  async #persistedWithJoins(pipelineMatchConditions: Record<string, any>): Promise<Record<string, any> | null> {
    // Construct a mongodb aggregation pipeline that will recurse into related templates up to 5 levels deep.
    // Thus, the tree will have a depth of 6 nodes
    let pipeline = [
      {
        '$match': pipelineMatchConditions
      },
      {
        '$sort' : { 'persist_date' : -1 }
      },
      {
        '$limit' : 1
      },
      {
        '$lookup': {
          'from': "template_fields",
          'foreignField': "_id",
          'localField': "fields",
          'as': "fields"
        }
      }
    ]

    this.#recursiveBuildPersistedQuery(pipeline, 0);

    let session = this.state.session;
    let response = await Template.aggregate(pipeline, {session});
    if (await response.hasNext()){
      return await response.next();
    } else {
      return null;
    }
  }

  // Fetches the last template with the given _id
  async #persistedByIdWithJoins(_id: ObjectId): Promise<Record<string, any> | null> {

    let pipelineMatchConditions = { 
      _id
    };

    return await this.#persistedWithJoins(pipelineMatchConditions);
  }

  // Fetches the last template with the given uuid persisted before the given date. 
  // Also recursively looks up fields and related_templates.
  async #latestPersistedBeforeDateWithJoins(uuid: string, date: Date): Promise<Record<string, any> | null> {
    let pipelineMatchConditions = { 
      uuid,
      'persist_date': {'$lte': date}
    };

    return await this.#persistedWithJoins(pipelineMatchConditions);
  }

  async #filterPersistedTemplateForPermissionsRecursor(template: Record<string, any>): Promise<void> {
    let permissions_model_instance = new PermissionModel.model(this.state);
    for(let i = 0; i < template.fields.length; i++) {
      if(!(await permissions_model_instance.hasPermission(template.fields[i].uuid, PermissionModel.PermissionTypes.view, TemplateField))) {
        template.fields[i] = {uuid: template.fields[i].uuid};
      }
    }
    for(let i = 0; i < template.related_templates.length; i++) {
      if(!(await permissions_model_instance.hasPermission(template.related_templates[i].uuid, PermissionModel.PermissionTypes.view, Template))) {
        template.related_templates[i] = {uuid: template.related_templates[i].uuid};
      } else {
        await this.#filterPersistedTemplateForPermissionsRecursor(template.related_templates[i]);
      }
    }
  }

  async #filterPersistedTemplateForPermissions(template: Record<string, any>): Promise<void> {
    if(!(await (new PermissionModel.model(this.state)).hasPermission(template.uuid, PermissionModel.PermissionTypes.view, Template))) {
      throw new Util.PermissionDeniedError(`Do not have view access to template ${template.uuid}`);
    }
    await this.#filterPersistedTemplateForPermissionsRecursor(template);
  }

  async #persistedByIdWithJoinsAndPermissions(_id: ObjectId): Promise<Record<string, any> | null> {
    let template = await this.#persistedByIdWithJoins(_id);
    if(!template) {
      return null;
    }
    await this.#filterPersistedTemplateForPermissions(template);
    return template;
  } 

  async #latestPersistedBeforeDateWithJoinsAndPermissions(uuid: string, date: Date): Promise<Record<string, any> | null> {
    let template = await this.#latestPersistedBeforeDateWithJoins(uuid, date);
    if(!template) {
      return null;
    }
    await this.#filterPersistedTemplateForPermissions(template);
    return template;
  } 

  // Fetches the last persisted template with the given uuid. 
  // Also recursively looks up fields and related_templates.
  async #latestPersistedWithJoinsAndPermissions(uuid: string): Promise<Record<string, any> | null> {
    return await this.#latestPersistedBeforeDateWithJoinsAndPermissions(uuid, new Date());
  }

  async #draftFetchFields(input_field_uuids: string[]): Promise<[Record<string, any>[], string[]]> {
    let fields: Record<string, any>[] = [];
    let field_uuids: string[] = [];
    let template_field_model_instance = new TemplateFieldModel.model(this.state);
    for(let field_uuid of input_field_uuids) {
      let field;
      try {
        // First try to get the draft of the field
        field = await template_field_model_instance.draft(field_uuid);
      } catch (err) {
        if (err instanceof Util.PermissionDeniedError) {
          // If we don't have permission for the draft, get the latest persisted instead
          try {
            field = await template_field_model_instance.latestPersisted(field_uuid)
            if(!field) {
              field = {uuid: field_uuid}
            }
          } catch(err) {
            if (err instanceof Util.PermissionDeniedError) {
              field = {uuid: field_uuid, no_permissions: true}
            } else {
              throw err;
            }
          }
        } else {
          throw err;
        }
      }
      if (field) {
        fields.push(field);
        field_uuids.push(field.uuid);
      } 
    }
    return [fields, field_uuids];
  }

  async #draftFetchRelatedTemplates(input_related_template_uuids: string[]): Promise<[Record<string, any>[], string[]]> {
    let related_templates: Record<string, any>[] = [];
    let related_template_uuids: string[] = [];
    for(let related_template_uuid of input_related_template_uuids) {
      let related_template;
      try {
        // First try to get the draft of the related_template
        related_template = await this.#draftFetchOrCreate(related_template_uuid);
      } catch (err) {
        if (err instanceof Util.PermissionDeniedError) {
          // If we don't have permission for the draft, get the latest persisted instead
          try {
            related_template = await this.#latestPersistedWithJoinsAndPermissions(related_template_uuid);
            if(!related_template) {
              // If a persisted version doesn't exist, just attach a uuid
              related_template = {uuid: related_template_uuid};
            }
          } catch (err) {
            if (err instanceof Util.PermissionDeniedError || err instanceof Util.NotFoundError) {
              // If we don't have permission for the persisted version
              related_template = {uuid: related_template_uuid, no_permissions: true};
            } else {
              throw err;
            }
          }
        } else {
          throw err;
        }
      }
      if (related_template) {
        related_templates.push(related_template);
        related_template_uuids.push(related_template.uuid);
      } else {
        console.log(`Failed to find a template with uuid ${related_template_uuid}. Therefore, removing the reference to it`);
      }
    }
    return [related_templates, related_template_uuids];
  }

  // Fetches the template draft with the given uuid, recursively looking up fields and related_templates.
  // If a draft of a given template doesn't exist, a new one will be generated using the last persisted template.
  async #draftFetchOrCreate(uuid: string): Promise<Record<string, any> | null> {

    // See if a draft of this template exists. 
    let template_draft = await this.#fetchDraftOrCreateFromPersisted(uuid);
    if (!template_draft) {
      return null;
    }

    // Make sure this user has a permission to be working with drafts
    if (!(await (new PermissionModel.model(this.state)).hasPermission(uuid, PermissionModel.PermissionTypes.edit))) {
      throw new Util.PermissionDeniedError(`You don't have edit permissions required to view template ${uuid}`);
    }

    let fields, field_uuids;
    [fields, field_uuids] = await this.#draftFetchFields(template_draft.fields);

    // Now recurse into each related_template, replacing each uuid with an imbedded object
    let related_templates, related_template_uuids;
    [related_templates, related_template_uuids] = await this.#draftFetchRelatedTemplates(template_draft.related_templates);

    let subscribed_templates: any[] = [];
    for(let subscribed_id of template_draft.subscribed_templates) {
      let subscribed_template = await this.#persistedByIdWithJoinsAndPermissions(subscribed_id);
      subscribed_templates.push(subscribed_template);
    }

    // Any existing references that are bad pointers need to be removed
    let update: any = {};
    if(template_draft.fields.length != field_uuids.length) {
      update.fields = field_uuids;
    } 
    if (template_draft.related_templates.length != related_template_uuids.length) {
      update.related_templates = related_template_uuids;
    }
    if(update.fields || update.related_templates) {
      template_draft.updated_at = new Date()
      update.updated_at = template_draft.updated_at;
      let session = this.state.session;
      let response = await Template.updateOne(
        {'_id': template_draft._id},
        {
          '$set': update
        },
        {session}
      );
      if (response.modifiedCount != 1) {
        throw `Template.draftFetchOrCreate: should be 1 modified document. Instead: ${response.modifiedCount}`;
      }
    }

    template_draft.fields = fields;
    template_draft.related_templates = related_templates;
    template_draft.subscribed_templates = subscribed_templates;
    delete template_draft._id;

    return template_draft;

  }

  // This function will provide the timestamp of the last update made to this template and all of it's sub-properties
  async #lastUpdateFor(uuid: string): Promise<Date> {

    let template_draft = await this.#fetchDraftOrCreateFromPersisted(uuid);
    let permissions_model_instance = new PermissionModel.model(this.state);
    let template_persisted = await SharedFunctions.latestPersisted(Template, uuid, this.state.session);
    let edit_permission = await permissions_model_instance.hasPermission(uuid, PermissionModel.PermissionTypes.edit);
    let view_permission = await permissions_model_instance.hasPermission(uuid, PermissionModel.PermissionTypes.view, Template);

    if(!template_draft) {
      throw new Util.NotFoundError(`No template  exists with uuid ${uuid}`);
    }

    if(!edit_permission) {
      if(!template_persisted) {
        throw new Util.PermissionDeniedError(`template ${uuid}: do not permissions for draft, and no persisted version exists`);
      }
      if(!view_permission) {
        throw new Util.PermissionDeniedError(`template ${uuid}: do not have view or edit permissions`);
      }
      return template_persisted.updated_at;
    }

    let last_update = template_draft.updated_at;
    let template_field_model_instance = new TemplateFieldModel.model(this.state);
    for(let uuid of template_draft.fields) {
      try {
        let update = await template_field_model_instance.lastUpdate(uuid);
        if (update > last_update){
          last_update = update;
        }
      } catch (err) {
        if (!(err instanceof Util.NotFoundError || err instanceof Util.PermissionDeniedError)) {
          throw err;
        }
      }
    }
    for(let uuid of template_draft.related_templates) {
      try {
        let update = await this.#lastUpdateFor(uuid);
        if (update > last_update){
          last_update = update;
        }
      } catch (err) {
        if (!(err instanceof Util.NotFoundError || err instanceof Util.PermissionDeniedError)) {
          throw err;
        }
      }
    }

    return last_update;

  }

  async #duplicateRecursor(template: Record<string, any>): Promise<string> {
    let permissions_model_instance = new PermissionModel.model(this.state);
    let template_field_model_instance = new TemplateFieldModel.model(this.state);

    // 1. Error checking
    if(!template) {
      throw new Util.NotFoundError();
    }
    if(!(await permissions_model_instance.hasPermission(template.uuid, PermissionModel.PermissionTypes.view, Template))) {
      throw new Util.PermissionDeniedError();
    }

    // 2. Create new everything copying the original template, but make it a draft and create a new uuid
    template.duplicated_from = template.uuid;
    template.uuid = uuidv4();
    delete template._id;
    delete template.updated_at;
    delete template.persist_date;
    delete template.public_date;
    await permissions_model_instance.initializePermissionsFor(template.uuid);

    // 3. For templates and fields, recurse. If they throw an error, just remove them from the copy.
    let fields: any[] = [];
    let related_templates: any[] = [];
    let subscribed_templates: any[] = [];
    for(let field of template.fields) {
      try {
        field = await template_field_model_instance.duplicate(field);
        fields.push(field);
      } catch(err) {
        if(!(err instanceof Util.NotFoundError || err instanceof Util.PermissionDeniedError)) {
          throw err;
        }
      }
    }
    for(let related_template of template.related_templates) {
      try {
        related_template = await this.#duplicateRecursor(related_template);
        related_templates.push(related_template);
      } catch(err) {
        if(!(err instanceof Util.NotFoundError || err instanceof Util.PermissionDeniedError)) {
          throw err;
        }
      }
    }
    for(let subscribed_template of template.subscribed_templates) {
      subscribed_templates.push(subscribed_template._id);
    }
    template.fields = fields;
    template.related_templates = related_templates;
    template.subscribed_templates = subscribed_templates;

    template.updated_at = new Date();
    let session = this.state.session;
    let response = await Template.insertOne(
      template, 
      {session}
    );
    if (!response.acknowledged) {
      throw new Error(`Template.duplicate: Failed to insert duplicate of ${template.uuid}`);
    }
    
    return template.uuid
  }

  async #duplicate(uuid: string): Promise<string> {
    let template = await this.#latestPersistedBeforeDateWithJoins(uuid, new Date());
    if(!template) {
      throw new Util.NotFoundError(`Persisted template ${uuid} does not exist`);
    }
    if(!(await (new PermissionModel.model(this.state)).hasPermission(template.uuid, PermissionModel.PermissionTypes.view, Template))) {
      throw new Util.PermissionDeniedError(`You do not have view permissions required to duplicate template ${uuid}.`);
    }
    return await this.#duplicateRecursor(template)
  }

  // TODO: as of now, import doesn't include group_uuids at all
  async #importTemplate(template: Record<string, any>): Promise<[boolean, string]> {
    let permissions_model_instance = new PermissionModel.model(this.state);
    let uuid_mapper_model_instance = new LegacyUuidToNewUuidMapperModel.model(this.state);

    if(!Util.isObject(template)) {
      throw new Util.InputError('Template to import must be a json object.');
    }
    if(!template.template_uuid || typeof(template.template_uuid) !== 'string') {
      throw new Util.InputError('Template provided to import must have a template_uuid, which is a string.');
    }
    // Now get the matching uuid for the imported uuid
    let old_uuid = template.template_uuid;
    let uuid = await uuid_mapper_model_instance.get_new_uuid_from_old(old_uuid);
    // If the uuid is found, then this has already been imported. Import again if we have edit permissions
    if(uuid) {
      if(!(await permissions_model_instance.hasPermission(uuid, PermissionModel.PermissionTypes.edit))) {
        throw new Util.PermissionDeniedError(`You do not have edit permissions required to import template ${old_uuid}. It has already been imported.`);
      }
    } else {
      uuid = await uuid_mapper_model_instance.create_new_uuid_for_old(old_uuid);
      await permissions_model_instance.initializePermissionsFor(uuid);
    }

    // Populate template properties
    let new_template: any = this.#initializeNewImportedDraftWithProperties(template, uuid);

    // Need to determine if this draft is any different from the persisted one.
    let changes = false;

    // Recursively handle each of the fields
    if (template.fields !== undefined) {
      if (!Array.isArray(template.fields)){
        throw new Util.InputError('fields property must be of type array');
      }
      for (let field of template.fields) {
        let field_uuid;
        try {
          let more_changes: boolean;
          [more_changes, field_uuid] = await (new TemplateFieldModel.model(this.state)).importField(field);
          changes ||= more_changes;
        } catch(err) {
          if (err instanceof Util.PermissionDeniedError) {
            field_uuid = await uuid_mapper_model_instance.get_new_uuid_from_old(field.template_field_uuid);
          } else {
            throw err;
          }
        }
        // After validating and updating the field, replace the imbedded field with a uuid reference
        new_template.fields.push(field_uuid);
      }
      // It is a requirement that no field be repeated. Verify this
      if(Util.anyDuplicateInArray(new_template.fields)) {
        throw new Util.InputError(`Each template may only have one instance of any template field.`);
      }
    }
    // Reursively handle each of the related_templates
    if (template.related_databases !== undefined) {
      if (!Array.isArray(template.related_databases)){
        throw new Util.InputError('related_templates property must be of type array');
      }
      for (let related_template of template.related_databases) {
        let related_template_uuid;
        let more_changes;
        try {
          [more_changes, related_template_uuid] = await this.#importTemplate(related_template);
          changes ||= more_changes;
        } catch(err) {
          if (err instanceof Util.PermissionDeniedError) {
            // If the user doesn't have edit permissions, assume they want to link the persisted version of the template, or keep something another editor added
            related_template_uuid = await uuid_mapper_model_instance.get_new_uuid_from_old(related_template.template_uuid);;
          } else {
            throw err;
          }
        }
        // If this is a subscribed template
        if(related_template.subscribed) {
          // If the template is different from the previously imported, publish it and return it's _id
          if(more_changes) {
            let created_template = await SharedFunctions.draft(Template, related_template_uuid, this.state.session);
            await this.#persist(related_template_uuid, created_template.updated_at);
          } 
          let published_template = await SharedFunctions.latestPersisted(Template, related_template_uuid, this.state.session);
          new_template.subscribed_templates.push(published_template._id);
        } else {
          // This is the normal case: not a subscribed template. Just a related_template
          // After validating and updating the related_template, replace the imbedded related_template with a uuid reference
          new_template.related_templates.push(related_template_uuid);
        }
      }
    }

    // If this draft is identical to the latest persisted, delete it.
    // The reason to do so is so when a change is submitted, we won't create drafts of sub-templates.
    // Only create drafts for the templates that actually have changes
    if (!changes) {
      changes = await this.#draftDifferentFromLastPersisted(new_template);
      if (!changes) {
        // Delete the current draft
        try {
          await SharedFunctions.draftDelete(Template, uuid);
        } catch (err) {
          if (!(err instanceof Util.NotFoundError)) {
            throw err;
          }
        }
        return [false, uuid];
      }
    }

    let session = this.state.session;
    let response = await Template.updateOne(
      {"uuid": new_template.uuid, 'persist_date': {'$exists': false}}, 
      {$set: new_template}, 
      {'upsert': true, session}
    );
    if (response.upsertedCount != 1 && response.matchedCount != 1) {
      throw new Error(`Template.importTemplate: Upserted: ${response.upsertedCount}. Matched: ${response.matchedCount}`);
    } 

    return [changes, uuid];
  }

  // Public facing functions

  // Wraps the actual request to create with a transaction
  async create(template: Record<string, any>): Promise<string> {
    let callback = async () => {
      this.state.updated_at = new Date();
      this.state.ancestor_uuids = new Set();
      let results = await this.#validateAndCreateOrUpdate(template);
      let inserted_uuid = results[1];
      return inserted_uuid;
    };
    return await SharedFunctions.executeWithTransaction(this.state, callback);
  }

  // Wraps the actual request to update with a transaction
  async update(template: Record<string, any>): Promise<void> {
    let callback = async () => {
      this.state.updated_at = new Date();
      this.state.ancestor_uuids = new Set();
      await this.#validateAndCreateOrUpdate(template);
    };
    await SharedFunctions.executeWithTransaction(this.state, callback);
  }

  // Wraps the actual request to get with a transaction
  async draftGet(uuid: string): Promise<Record<string, any> | null> {
    let callback = async () => {
      return await this.#draftFetchOrCreate(uuid);
    };
    return await SharedFunctions.executeWithTransaction(this.state, callback);
  }

  // Wraps the actual request to persist with a transaction
  async persist(uuid: string, last_update: Date): Promise<void> {
    let callback = async () => {
      await this.#persist(uuid, last_update);
    };
    if(this.state.session) {
      await callback();
    } else {
      await SharedFunctions.executeWithTransaction(this.state, callback);
    }
  }

  // Wraps the actual request to getUpdate with a transaction
  async lastUpdate(uuid: string): Promise<Date> {
    let callback = async () => {
      return await this.#lastUpdateFor(uuid);
    };
    if(this.state.session) {
      return await callback();
    } else {
      return await SharedFunctions.executeWithTransaction(this.state, callback);
    }
  }

  // Parents 2+ levels up are not updated
  async updateTemplatesThatReference(uuid: string, templateOrField: string): Promise<void> {
    // Get a list of templates that reference them.
    let uuids = await this.#templateUUIDsThatReference(uuid, templateOrField);
    // For each template, create a draft if it doesn't exist
    for(uuid of uuids) {
      // when time starts being a problem, move this into a queue OR just remove the await statement.
      try {
        await this.#createDraftFromLastPersistedWithSession(uuid);
      } catch(err) {
        console.error(err);
      }
    }

  }

  async draftExisting(uuid: string): Promise<boolean> {
    return (await SharedFunctions.draft(Template, uuid, this.state.session)) ? true : false;
  }

  latestPersisted = this.#latestPersistedWithJoinsAndPermissions;
  persistedBeforeDate = this.#latestPersistedBeforeDateWithJoinsAndPermissions;

  async latestPersistedWithoutPermissions(uuid: string): Promise<Record<string, any> | null> {
    return await this.#latestPersistedBeforeDateWithJoins(uuid, new Date());
  }

  persistedByIdWithoutPermissions = this.#persistedByIdWithJoins;

  async draftDelete(uuid: string): Promise<void> {

    if(!(await SharedFunctions.draft(Template, uuid, this.state.session))) {
      throw new Util.NotFoundError(`No draft exists with uuid ${uuid}`);
    }

    if(!(await (new PermissionModel.model(this.state)).hasPermission(uuid, PermissionModel.PermissionTypes.edit))) {
      throw new Util.PermissionDeniedError(`You do not have edit permissions for template ${uuid}.`);
    }

    await SharedFunctions.draftDelete(Template, uuid, this.state.session);
  };

  async latest_persisted_id_for_uuid(uuid: string): Promise<boolean> {
    let template = await SharedFunctions.latestPersisted(Template, uuid, this.state.session);
    return template ? template._id : null;
  }
  async latest_persisted_time_for_uuid(uuid: string): Promise<Record<string, any> | null> {
    let template = await SharedFunctions.latestPersisted(Template, uuid, this.state.session);
    return template ? template.persist_date : null;
  }

  // Wraps the actual request to duplicate with a transaction
  async duplicate(uuid: string): Promise<string> {
    let callback = async () => {
      return await this.#duplicate(uuid);
    };
    return await SharedFunctions.executeWithTransaction(this.state, callback);
  }

  // Wraps the actual request to import with a transaction
  async importTemplate(template: Record<string, any>): Promise<string> {
    let callback = async () => {
      this.state.updated_at = new Date();
      let results = await this.#importTemplate(template);
      let new_template_uuid = results[1];
      return new_template_uuid;
    };
    if(this.state.session) {
      return await callback();
    } else {
      return await SharedFunctions.executeWithTransaction(this.state, callback);
    }
  }

};

export {
  init,
  collectionExport as collection,
  Model as model
};