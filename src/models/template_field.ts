const MongoDB = require('../lib/mongoDB');
const { v4: uuidv4, validate: uuidValidate } = require('uuid');
import { ObjectId } from 'mongodb';
import * as Util from '../lib/util';
import { AbstractDocument } from './abstract_document';
import { DocumentInterface } from './document_interface';
const { PermissionTypes, model: PermissionModel } = require('./permission');
const LegacyUuidToNewUuidMapperModel = require('./legacy_uuid_to_new_uuid_mapper');

enum FieldTypes {
  File = "File",
  Image = "Image"
};

// Mongodb schema for template_field
const Schema = Object.freeze({
  bsonType: "object",
  required: [ "_id", "uuid", "updated_at" ],
  properties: {
    _id: {
      bsonType: "objectId",
      description: "identifies a specific version of the template_field with this uuid"
    },
    uuid: {
      bsonType: "string",
      description: "identifies the template_field, but the uuid is common between all versions of said template_field"
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
      description: "identifies the last update for this version of this template_field"
    },
    persist_date: {
      bsonType: "date",
      description: "if persisted, identifies the time of persistance for this version of this template_field"
    },
    public_date: {
      bsonType: "date",
      description: "identifies the time specified for this template_field to go public. Note: the public date on the latest version is used for all versions of the template_field"
    },
    type: {
      enum: Object.values(FieldTypes),
      description: "allows user to force the record field type to be in the format of one of the implemented field types"
    },
    old_system_uuid: {
      bsonType: "string",
      description: "the uuid of this template_field as imported from the legacy system"
    },
    duplicated_from: {
      bsonType: "string",
      description: "if this template_field is duplicated from elsewhere, specifies which template_field it was duplicated from"
    },
    options: {
      bsonType: "array",
      description: "allows user to specify a checkbox list of values to select",
      items: {
        bsonType: "object",
        required: ["name"],
        properties: {
          name: {
            bsonType: "string",
            description: "identifies the value of the checkbox"
          },
          // either uuid or options is required
          // options is recursive
          uuid: {
            bsonType: "string",
            description: "maintains the consistency of the checkbox accross versions of the template_field in case the name is changed"
          },
          options: {
            bsonType: "array",
            description: "options is recursive, but there is no way to specify that in the schema, so stop here"
          }
        }
      }
    }
  },
  additionalProperties: false
});

var TemplateField;

async function collection() {
  if (TemplateField === undefined) {
    let db = MongoDB.db();
    try {
      await db.createCollection('template_fields', {validator: { $jsonSchema: Schema} });
      await db.collection('template_fields').createIndex({ uuid: 1 });
    } catch(e) {
      db.command({collMod:'template_fields', validator: { $jsonSchema: Schema }});
    }
    TemplateField = db.collection('template_fields');
  }
  return TemplateField;
}

async function init() {
  return await collection();
}

function collectionExport(){
  return TemplateField
};

class Model extends AbstractDocument implements DocumentInterface {

  static DOCUMENT_TYPE = 'template_field';

  collection = TemplateField;
  permission_model: any;

  constructor(public state){
    super();
    this.state = state;
    this.collection = TemplateField;
    this.permission_model = new PermissionModel(state);
  }

  // Creates a draft from the persisted version.
  #createDraftFromPersisted(persisted: Record<string, any>): Record<string, any> {
    let draft = persisted;

    delete draft._id;
    draft.updated_at = draft.persist_date;
    delete draft.persist_date;

    return draft;
  }

  // Fetches the latest persisted field with the given uuid. 
  async #latestPersistedBeforeDate(uuid: string, date: Date): Promise<Record<string, any> | null> {
    let session = this.state.session;
    let cursor = await TemplateField.find(
      {"uuid": uuid, 'persist_date': {'$lte': date}},
      {session}
    ).sort({'persist_date': -1})
    .limit(1);
    if (!(await cursor.hasNext())) {
      return null;
    }
    return await cursor.next();
  }

  // Fetches the latest persisted field with the given uuid. 
  async #latestPersisted(uuid: string): Promise<Record<string, any> | null> {
    return await this.#latestPersistedBeforeDate(uuid, new Date());
  }

  async #latestPersistedBeforeDateWithPermissions(uuid: string, date: Date): Promise<Record<string, any> | null> {
    let field = await this.#latestPersistedBeforeDate(uuid, date);
    if(!field) {
      return null;
    }

    // Ensure user has permission to view
    if (!(await this.hasViewPermissionToPersisted(uuid))) {
      throw new Util.PermissionDeniedError(`Do not have permission to view template field with uuid ${uuid}`);
    }

    return field;
  }

  async #fetchPersistedAndConvertToDraft(uuid: string): Promise<Record<string, any> | null> {
    let persisted_field = await this.#latestPersisted(uuid);
    if(!persisted_field) {
      return null;
    }

    return (await this.#createDraftFromPersisted(persisted_field));
  }

  async #draftDelete(uuid: string): Promise<void> {

    let response = await TemplateField.deleteMany({ uuid, persist_date: {'$exists': false} });
    if (!response.deletedCount) {
      throw new Util.NotFoundError();
    }
    if (response.deletedCount > 1) {
      console.error(`templateDraftDelete: Template with uuid '${uuid}' had more than one draft to delete.`);
    }
  }

  #optionsEqual(options1: Record<string, any>[], options2: Record<string, any>[]): boolean {
    if(!options1 && !options2) {
      return true;
    }
    if(!(Array.isArray(options1) && Array.isArray(options2))) {
      return false;
    }
    if(options1.length != options2.length) {
      return false;
    }
    let options_2_map = {};
    for(let option of options2) {
      options_2_map[option.name] = option;
    }
    for(let option1 of options1) {
      if(!(option1.name in options_2_map)) {
        return false;
      }
      let option2 = options_2_map[option1.name];
      if(option1.uuid != option2.uuid) {
        return false;
      }
      if(!this.#optionsEqual(option1.options, option2.options)) {
        return false;
      }
    }
    return true;
  }

  #fieldEquals(field1: Record<string, any>, field2: Record<string, any>): boolean {
    return field1.name == field2.name && 
            field1.description == field2.description && 
            field1.type == field2.type && 
            Util.datesEqual(field1.public_date, field2.public_date) &&
            this.#optionsEqual(field1.options, field2.options);
  }

  // Important to note here that Typescript can only check compile time issues. If any of these arguments are different
  // at run time, Typescript won't catch that
  #parseOptions(options: Record<string, any>[], previous_options_uuids: Set<string>, current_options_uuids: Set<string>): Record<string, any> {
    if(!Array.isArray(options)) {
      throw new Util.InputError(`options must be an array.`);
    }
    let return_options: any[] = [];
    for(let option of options) {
      if(!Util.isObject(option)) {
        throw new Util.InputError(`Each option in the field must be a json object`);
      }
      let cleansed_option: any = {};
      if (!option.name) {
        throw new Util.InputError('each option must have a name');
      }
      if (typeof(option.name) !== 'string'){
        throw new Util.InputError('each option name must be of type string');
      }
      cleansed_option.name = option.name;
      
      if(option.options) {
        cleansed_option.options = this.#parseOptions(option.options, previous_options_uuids, current_options_uuids);
      } else {
        if (option.uuid) {
          if(!previous_options_uuids.has(option.uuid)) {
            throw new Util.InputError(`Cannot provide option uuid ${option.uuid}. May only specify uuids that already exist.`);
          }
          if(current_options_uuids.has(option.uuid)) {
            throw new Util.InputError(`Option uuid ${option.uuid} duplicated. Each option may only be supplied once`);
          }
          current_options_uuids.add(option.uuid);
          cleansed_option.uuid = option.uuid;
        } else {
          cleansed_option.uuid = uuidv4();
        }
      }
      return_options.push(cleansed_option)
    }
    return return_options;
  }

  #buildOptionSet(options: Record<string, any>[], set: Set<string>): void {
    for(let option of options) {
      if(option.uuid) {
        set.add(option.uuid);
      }
      if(option.options) {
        this.#buildOptionSet(option.options, set);
      }
    }
  }

  #buildOptionMap(options: Record<string, any>[], map: Record<string, any>): void {
    for(let option of options) {
      if(option.uuid) {
        map[option.uuid] = option.name
      }
      if(option.options) {
        this.#buildOptionMap(option.options, map);
      }
    }
  }

  #findOptionValue(options, uuid) {
    for(let option of options) {
      if(option.uuid == uuid) {
        return option.name;
      }
      if(option.options) {
        let value = this.#findOptionValue(option.options, uuid);
        if(value) {
          return value;
        }
      }
    }
    return undefined;
  }

  optionUuidsToValues(options: Record<string, any>[], uuids: string[]): Record<string, any>[] {
    // First build a map of uuid -> value
    // Then, for each uuid, attach an object with the uuids + values
    let uuid_to_value_map = {};
    this.#buildOptionMap(options, uuid_to_value_map);

    let values: any[] = [];
    for(let uuid of uuids) {
      if(!(uuid in uuid_to_value_map)) {
        throw new Util.InputError(`Option uuid ${uuid} is not an option uuid provided by the template`);
      }
      values.push({uuid, name: uuid_to_value_map[uuid]});
    }

    return values;
  }

  // TODO: add radio_options and check-box options to types
  // TODO: support radio options

  async #importRadioOptions(radio_options: Record<string, any>[]): Promise<Record<string, any>[]> {
    if(!Array.isArray(radio_options)) {
      throw new Util.InputError(`Radio options must be an array.`);
    }
    let return_options: any[] = [];
    for(let radio_option of radio_options) {
      if(!Util.isObject(radio_option)) {
        throw new Util.InputError(`Each radio_option in the field must be a json object`);
      }
      let cleansed_option: any = {};
      if (!radio_option.name || typeof(radio_option.name) !== 'string') {
        throw new Util.InputError('each radio option must have a name of type string ');
      }
      cleansed_option.name = radio_option.name;
      
      if(radio_option.radio_options || radio_option.children) {
        let options = radio_option.radio_options ? radio_option.radio_options : radio_option.children;
        cleansed_option.options = await this.#importRadioOptions(options);
      } else {
        if (!radio_option.template_radio_option_uuid && !radio_option.template_tag_uuid) {
          throw new Util.InputError(`All radio_options / tags must include a radio_option_uuid or template_tag_uuid unless it recurses to further radio options`);
        }
        // Map old radio option to new. If old has been seen before, that's an error
        let old_uuid = radio_option.template_radio_option_uuid ? radio_option.template_radio_option_uuid : radio_option.template_tag_uuid;
        // let uuid_mapper_model_instance = new LegacyUuidToNewUuidMapperModel.model(this.state);
        // let uuid = await uuid_mapper_model_instance.get_new_uuid_from_old(old_uuid);
        // if(!uuid) {
        //   uuid = await uuid_mapper_model_instance.create_new_uuid_for_old(old_uuid);
        // }
        // cleansed_option.uuid = uuid;
        // cleansed_option.old_system_uuid = old_uuid;
        // Actually, for some instances it's easier just to keep the old_uuid, so that is what we're doing
        cleansed_option.uuid = old_uuid;
      }
      return_options.push(cleansed_option);
    }
    return return_options;
  }

  #initializeNewDraftWithPropertiesSharedWithImport(input_field: Record<string, any>, uuid: string): Record<string, any> {
    let output_field = {
      uuid, 
      name: "",
      description: "",
      updated_at: this.state.updated_at
    };
    if (input_field.name) {
      if (typeof(input_field.name) !== 'string'){
        throw new Util.InputError('name property must be of type string');
      }
      output_field.name = input_field.name
    }
    if (input_field.description) {
      if (typeof(input_field.description) !== 'string'){
        throw new Util.InputError(`field description property (${input_field.description}) must be of type string.`);
      }
      output_field.description = input_field.description
    }
    return output_field;
  }

  async #initializeNewDraftWithProperties(input_field: Record<string, any>, uuid: string): Promise<Record<string, any>> {
    let output_field: any = this.#initializeNewDraftWithPropertiesSharedWithImport(input_field, uuid);
    if (input_field.public_date) {
      if (!Util.isDateValid(input_field.public_date)){
        throw new Util.InputError(`template field (uuid: ${uuid}) public_date property must be in valid date format`);
      }
      output_field.public_date = new Date(input_field.public_date);
    }
    if(input_field.type && input_field.type == "file") {
      if(input_field.options) {
        throw new Util.InputError('Options are not supported for field type file');
      }
      output_field.type = "file";
    }
    if(input_field.options) {
      let latest_field = await this.shallowLatestDocument(uuid);
      let previous_options_uuids = new Set<string>();
      if(latest_field && latest_field.options) {
        this.#buildOptionSet(latest_field.options, previous_options_uuids);
      }
      output_field.options = this.#parseOptions(input_field.options, previous_options_uuids, new Set());
    }
    let old_system_uuid = await (new LegacyUuidToNewUuidMapperModel.model(this.state)).get_old_uuid_from_new(uuid);
    if(old_system_uuid) {
      output_field.old_system_uuid = old_system_uuid;
    }
    if (input_field.type) {
      if(!FieldTypes.hasOwnProperty(input_field.type)) {
        throw new Util.InputError(`Field type supplied invalid: ${input_field.type}`);
      }
      output_field.type = input_field.type;
    }
    return output_field;
  }

  async #initializeNewImportedDraftWithProperties(input_field: Record<string, any>, uuid: string): Promise<Record<string, any>> {
    let output_field: any = this.#initializeNewDraftWithPropertiesSharedWithImport(input_field, uuid);
    if (input_field._field_metadata && Util.isObject(input_field._field_metadata) && input_field._field_metadata._public_date) {
      if (Util.isDateValid(input_field._field_metadata._public_date)){
        output_field.public_date = new Date(input_field.public_date);
      }
    }
    if(input_field.radio_options) {
      output_field.options = await this.#importRadioOptions(input_field.radio_options);
    }
    if(input_field.fieldtype == 'Tags') {
      output_field.options = await this.#importRadioOptions(input_field.value);
    }
    output_field.old_system_uuid = input_field.template_field_uuid;
    let type = input_field.fieldtype;
    if (type && FieldTypes.hasOwnProperty(type)) {
      output_field.type = type;
    }
    return output_field;
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

  // If input_field has a uuid, updates the field with that uuid. Otherwise, creates a new field
  // Also validate input. 
  // Return:
  // 1. A boolean: true if there were changes from the last persisted.
  // 2. The uuid of the template field created / updated
  async validateAndCreateOrUpdate(input_field: Record<string, any>): Promise<[boolean, string]> {

    // Field must be an object
    if (!Util.isObject(input_field)) {
      throw new Util.InputError(`field provided is not an object: ${input_field}`);
    }

    let uuid;
    // If a field uuid is provided, this is an update
    if (input_field.uuid) {
      // Field uuid must be a valid uuid
      if (!uuidValidate(input_field.uuid)) {
        throw new Util.InputError("uuid must conform to standard uuid format");
      }

      // Field uuid must exist
      if (!(await this.exists(input_field.uuid))) {
        throw new Util.NotFoundError(`No field exists with uuid ${input_field.uuid}`);
      }

      // verify that this user is in the 'edit' permission group
      if (!(await this.permission_model.hasExplicitPermission(input_field.uuid, PermissionTypes.edit))) {
        throw new Util.PermissionDeniedError();
      }

      uuid = input_field.uuid;
    } 
    // Otherwise, this is a create
    else {
      // Generate a uuid for the new template_field
      uuid = uuidv4();
      // initialize permissions for the new template_field
      await this.permission_model.initializePermissionsFor(uuid);
    }

    // Populate field properties
    let new_field = await this.#initializeNewDraftWithProperties(input_field, uuid);

    // If this draft is identical to the latest persisted, delete it.
    let old_field = await this.#fetchPersistedAndConvertToDraft(uuid);
    if (old_field) {
      let changes = !this.#fieldEquals(new_field, old_field);
      if (!changes) {
        // Delete the current draft
        try {
          await this.#draftDelete(uuid);
        } catch(err) {
          if (!(err instanceof Util.NotFoundError)) {
            throw err;
          }
        }
        return [false, uuid];
      }
    }

    let mongoUpdateProperties: Record<string, any> = {$set: new_field};
    if(!new_field.type) {
      mongoUpdateProperties['$unset'] = {type: ""}
    }

    // If a draft of this field already exists: overwrite it, using it's same uuid
    // If a draft of this field doesn't exist: create a new draft
    // Fortunately both cases can be handled with a single MongoDB UpdateOne query using 'upsert: true'
    let session = this.state.session;
    let response = await TemplateField.updateOne(
      {uuid, 'persist_date': {'$exists': false}}, 
      mongoUpdateProperties, 
      {'upsert': true, session}
    );
    if (response.upsertedCount != 1 && response.matchedCount != 1) {
      throw new Error(`TemplateField.validateAndCreateOrUpdateTemplateField: Modified: ${response.upsertedCount}. Matched: ${response.matchedCount}`);
    } 
    return [true, uuid];
  }

  // Fetches a draft if there is one already existing, or creates it if not.
  async #draftFetchOrCreate(uuid: string): Promise<Record<string, any> | null> {
    
    // See if a draft of this template field exists. 
    let template_field_draft = await this.shallowDraft(uuid);

    // If a draft of this template field already exists, return it.
    if (template_field_draft) {
      // Make sure this user has a permission to be working with drafts
      if (!(await this.permission_model.hasExplicitPermission(uuid, PermissionTypes.edit))) {
        throw new Util.PermissionDeniedError();
      }
      delete template_field_draft._id;
      return template_field_draft;
    }

    // If a draft of this template field does not exist, create a new template_field_draft from the last persisted
    template_field_draft = await this.#latestPersisted(uuid);
    // If not even a persisted version of this template field was found, return null
    if(!template_field_draft) {
      return null;
    } else {
      // Make sure this user has a permission to be working with drafts
      if (!(await this.permission_model.hasExplicitPermission(uuid, PermissionTypes.edit))) {
        throw new Util.PermissionDeniedError();
      }
    }

    // Remove the internal_id and persist_date
    delete template_field_draft._id;
    template_field_draft.updated_at = template_field_draft.persist_date;
    delete template_field_draft.persist_date;

    return template_field_draft;

  }

  // Persistes the field with the provided uuid. Returns the _id of the newly persisted version.
  async persistField(uuid: string, last_update: Date): Promise<ObjectId> {
    var return_id;

    let field_draft = await this.shallowDraft(uuid);
    let last_persisted = await this.#latestPersisted(uuid);

    // Check if a draft with this uuid exists
    if(!field_draft) {
      if(last_persisted) {
        throw new Util.InputError('No changes to persist');
      } else {
        throw new Util.NotFoundError(`Field with uuid ${uuid} does not exist`);
      }
    }

    // if the user doesn't have edit permissions, throw a permission denied error
    let has_permission = await this.permission_model.hasExplicitPermission(uuid, PermissionTypes.edit);
    if(!has_permission) {
      throw new Util.PermissionDeniedError();
    }

    if (last_update) {
      // If the last update provided doesn't match to the last update found in the db, fail.
      let db_last_update = new Date(field_draft.updated_at);
      if(last_update.getTime() != db_last_update.getTime()) {
        throw new Util.InputError(`The last update submitted ${last_update.toISOString()} does not match that found in the db ${db_last_update.toISOString()}. 
        Fetch the draft again to get the latest update before attempting to persist again.`);
      }
    }

    // If there are changes, persist the current draft
    let persist_time = new Date();
    let session = this.state.session;
    let response = await TemplateField.updateOne(
      {"_id": field_draft._id},
      {'$set': {'updated_at': persist_time, 'persist_date': persist_time}},
      {session}
    )
    if (response.modifiedCount != 1) {
      throw new Error(`TemplateField.persistField: should be 1 updated document. Instead: ${response.modifiedCount}`);
    }
    return_id = field_draft._id;
    return return_id;
  }

  async lastupdateFor(uuid: string): Promise<Date> {
    let draft = await this.#draftFetchOrCreate(uuid);
    if(!draft) {
      throw new Util.NotFoundError();
    }
    return draft.updated_at;
  }

  draft = this.#draftFetchOrCreate;
  latestPersistedWithoutPermissions = this.#latestPersisted;

  // TODO: can I remove all of these wrappers somehow?
  // TODO: Standardize the format between all of the standard document functions. 
  // Should probably make use of abstract document

  // Wraps the request to create with a transaction
  async create(field: Record<string, any>): Promise<string> {
    let callback = async () => {
      this.state.updated_at = new Date();
      return await this.validateAndCreateOrUpdate(field);
    };
    let result = await this.executeWithTransaction(callback);
    let inserted_uuid = result[1];
    return inserted_uuid;
  }

  // Wraps the request to get with a transaction. Since fetching a draft creates one if it doesn't already exist
  async draftGet(uuid: string): Promise<Record<string, any>> {
    let callback = async () => {
      return await this.#draftFetchOrCreate(uuid);
    };
    return await this.executeWithTransaction(callback);
  }

  // Wraps the request to update with a transaction
  async update(field: Record<string, any>): Promise<void> {
    let callback = async () => {
      this.state.updated_at = new Date();
      return await this.validateAndCreateOrUpdate(field);
    };
    await this.executeWithTransaction(callback);
  }

  // Wraps the request to persist with a transaction
  async persist(uuid: string, last_update: Date): Promise<void> {
    let callback = async () => {
      return await this.persistField(uuid, last_update);
    };
    await this.executeWithTransaction(callback);
  }

  async latestPersisted(uuid: string): Promise<Record<string, any> | null> {
    return await this.#latestPersistedBeforeDateWithPermissions(uuid, new Date());
  }

  latestPersistedBeforeTimestamp = this.#latestPersistedBeforeDateWithPermissions;

  async draftDelete(uuid: string): Promise<void> {

    let field = await this.shallowDraft(uuid);
    if(!field) {
      throw new Util.NotFoundError();
    }

    // user must have edit access to see this endpoint
    if (!await this.permission_model.hasExplicitPermission(uuid, PermissionTypes.edit)) {
      throw new Util.PermissionDeniedError();
    }

    let response = await TemplateField.deleteMany({ uuid, persist_date: {'$exists': false} }, this.state.session);
    if (response.deletedCount > 1) {
      console.error(`template field draftDelete: Template Field with uuid '${uuid}' had more than one draft to delete.`);
    }
  }

  async lastUpdate(uuid: string): Promise<Date> {

    let field_draft = await this.shallowDraft(uuid);
    let field_persisted = await this.#latestPersisted(uuid);
    let edit_permission = await this.permission_model.hasExplicitPermission(uuid, PermissionTypes.edit);
    let view_permission = await this.hasViewPermissionToPersisted(uuid);

    // Get the lat update for the draft if the user has permission to the draft. Otherwise, the last persisted.
    if(!field_draft) {
      if(!field_persisted) {
        throw new Util.NotFoundError(`No template field exists with uuid ${uuid}`);
      }
      if(!view_permission) {
        throw new Util.PermissionDeniedError(`field ${uuid}: no draft exists and do not have view permissions for persisted`);
      }
      return field_persisted.updated_at;
    }

    if(!edit_permission) {
      if(!field_persisted) {
        throw new Util.PermissionDeniedError(`field ${uuid}: do not permissions for draft, and no persisted version exists`);
      }
      if(!view_permission) {
        throw new Util.PermissionDeniedError(`field ${uuid}: do not have view or edit permissions`);
      }
      return field_persisted.updated_at;
    }

    return field_draft.updated_at;
  }

  async draftExisting(uuid: string): Promise<boolean> {
    return (await this.shallowDraft(uuid)) ? true : false;
  }

  async duplicate(field: Record<string, any>): Promise<string> {
    // 1. Error checking
    if(!field) {
      throw new Util.NotFoundError();
    }
    if(!(await this.hasViewPermissionToPersisted(field.uuid))) {
      throw new Util.PermissionDeniedError();
    }

    // 2. Create new everything copying the original field, but make it a draft and create a new uuid
    field.duplicated_from = field.uuid;
    field.uuid = uuidv4();
    delete field._id;
    delete field.updated_at;
    delete field.persist_date;
    delete field.public_date;
    await this.permission_model.initializePermissionsFor(field.uuid);


    // 3. Actually create everything
    field.updated_at = new Date();
    let session = this.state.session;
    let response = await TemplateField.insertOne(
      field, 
      {session}
    );
    if (!response.acknowledged) {
      throw new Error(`TemplateField.duplicate: Failed to insert duplicate of ${field.uuid}`);
    } 
    return field.uuid;
  }

  async importField(field: Record<string, any>): Promise<[boolean, string]> {
    if(!Util.isObject(field)) {
      throw new Util.InputError('Field to import must be a json object.');
    }
    if(!field.template_field_uuid || typeof(field.template_field_uuid) !== 'string') {
      throw new Util.InputError('Field provided to import must have a template_field_uuid, which is a string.');
    }
    let uuid_mapper_model_instance = new LegacyUuidToNewUuidMapperModel.model(this.state);
    // Now get the matching uuid for the imported uuid
    let uuid = await uuid_mapper_model_instance.get_new_uuid_from_old(field.template_field_uuid);
    // If the uuid is found, then this has already been imported. Import again if we have edit permissions
    if(uuid) {
      if(!this.permission_model.hasExplicitPermission(uuid, PermissionTypes.edit)) {
        throw new Util.PermissionDeniedError(`You do not have edit permissions required to import template field ${field.template_field_uuid}. It has already been imported.`);
      }
    } else {
      uuid = await uuid_mapper_model_instance.create_new_uuid_for_old(field.template_field_uuid);
      await this.permission_model.initializePermissionsFor(uuid);
    }

    let new_field = await this.#initializeNewImportedDraftWithProperties(field, uuid);

    // If this draft is identical to the latest persisted, delete it.
    let old_field = await this.#fetchPersistedAndConvertToDraft(uuid);
    if (old_field) {
      let changes = !this.#fieldEquals(new_field, old_field);
      if (!changes) {
        // Delete the current draft
        try {
          await this.#draftDelete(uuid);
        } catch(err) {
          if (!(err instanceof Util.NotFoundError)) {
            throw err;
          }
        }
        return [false, uuid];
      }
    }

    let session = this.state.session;
    let response = await TemplateField.updateOne(
      {"uuid": new_field.uuid, 'persist_date': {'$exists': false}}, 
      {$set: new_field}, 
      {'upsert': true, session}
    );
    if (response.upsertedCount != 1 && response.matchedCount != 1) {
      throw new Error(`TemplateField.importField: Upserted: ${response.upsertedCount}. Matched: ${response.matchedCount}`);
    } 
    return [true, uuid];
  }

};

export {
  init,
  collectionExport as collection,
  Model as model,
  FieldTypes
}