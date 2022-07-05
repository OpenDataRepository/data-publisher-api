const MongoDB = require('../lib/mongoDB');
const { v4: uuidv4, validate: uuidValidate } = require('uuid');
import { ObjectId } from 'mongodb';
const assert = require('assert');
import * as Util from '../lib/util';
const TemplateFieldModel = require('./template_field');
const TemplateModel = require('./template');
const DatasetModel = require('./dataset');
const UserPermissionsModel = require('./user_permissions');
const PermissionGroupModel = require('./permission_group');
const SharedFunctions = require('./shared_functions');
const LegacyUuidToNewUuidMapperModel = require('./legacy_uuid_to_new_uuid_mapper');
const FileModel = require('./file');
const FieldTypes = TemplateFieldModel.FieldTypes;

const Schema = Object.freeze({
  bsonType: "object",
  required: [ "_id", "uuid", "updated_at", "related_records" ],
  properties: {
    _id: {
      bsonType: "objectId",
      description: "identifies a specific version of the record with this uuid"
    },
    uuid: {
      bsonType: "string",
      description: "identifies the record, but the uuid is common between all versions of said record"
      // uuid should be in a valid uuid format as well
    },
    dataset_uuid: {
      bsonType: "string",
      description: "identifies the dataset this record belongs to. Only used for the record draft"
    },
    dataset_id: {
      bsonType: "objectId",
      description: "identifies the dataset this record belongs to. Only used for a persisted record"
    },
    updated_at: {
      bsonType: "date",
      description: "identifies the last update for this version of this record"
    },
    persist_date: {
      bsonType: "date",
      description: "if persisted, identifies the time of persistance for this version of this record"
    },
    old_system_uuid: {
      bsonType: "string",
      description: "the uuid of this record as imported from the legacy system"
    },
    related_records: {
      bsonType: "array",
      description: "records this record links to",
      uniqueItems: true
    },
    fields: {
      bsonType: "array",
      description: "fields this record includes",
      items: {
        bsonType: "object",
        required: [ "uuid" ],
        properties: {
          uuid: {
            bsonType: "string"
          },
          name: {
            bsonType: "string"
          },
          description: {
            bsonType: "string"
          },
          type: {
            enum: Object.values(TemplateFieldModel.FieldTypes)
          },
          file: {
            bsonType: "object",
            required: [ "uuid" ],
            properties: {
              uuid: {
                bsonType: "string"
              },
              name: {
                bsonType: "string"
              },
              import_url: {
                bsonType: "string"
              }
            },
            additionalProperties: false
          },
          images: {
            bsonType: "array",
            uniqueItems: true,
            items: {
              bsonType: "object",
              required: [ "uuid", "name" ],
              properties: {
                uuid: {
                  bsonType: "string"
                },
                name: {
                  bsonType: "string"
                },
                import_url: {
                  bsonType: "string"
                }
              },
              additionalProperties: false
            }
          },
          values: {
            bsonType: "array"
          },
          value: {
            description: "the value provided by the user for this field"
          }
        },
        additionalProperties: false
      }
    }
  },
  additionalProperties: false
});

var Record;

// Returns a reference to the record Mongo Collection
async function collection() {
  if (Record === undefined) {
    let db = MongoDB.db();
    try {
      await db.createCollection('records', {validator: { $jsonSchema: Schema} });
    } catch(e) {}
    Record = db.collection('records');
  }
  return Record;
}

async function init() {
  Record = await collection();
}

class Model {
  collection = Record;

  constructor(public state){
    this.state = state;
  }


  #fieldsEqual(fields1: Record<string, any>[], fields2: Record<string, any>[]): boolean {
    assert(Array.isArray(fields1) && Array.isArray(fields2), `fieldsEqual: did not provide 2 valid arrays`);
    if(fields1.length != fields2.length) {
      return false;
    }

    // Don't need to check fields changing order because the record always preserves the field order of the template fields
    for(let i = 0; i < fields1.length; i++) {
      let field1 = fields1[i];
      let field2 = fields2[i];
      if (field1.name != field2.name || field1.description != field2.description || field1.type != field2.type) {
        return false;
      }
      const sortArrayByUuidProperty = (o1, o2) => {
        let n1 = o1.uuid;
        let n2 = o2.uuid;
        if(n1 < n2) {
          return -1;
        }
        if(n1 > n2) {
          return 1;
        }
        return 0;
      }
      if(field1.type == FieldTypes.File) {
        let file1 = field1.file;
        let file2 = field2.file;
        if(file1.uuid != file2.uuid || file1.name != file2.name) {
          return false;
        } 
      } else if(field1.type == FieldTypes.Image) {
        assert(Array.isArray(field1.images) && Array.isArray(field2.images), `fieldsEqual: did not provide 2 valid image arrays`);
        if(field1.images.length != field2.images.length) {
          return false;
        }
        field1.images.sort(sortArrayByUuidProperty);
        field2.images.sort(sortArrayByUuidProperty);
        for(let j = 0; j < field1.images.length; j++) {
          let image1 = field1.images[i];
          let image2 = field2.images[i];
          if(image1.uuid != image2.uuid || image1.name != image2.name) {
            return false;
          } 
        }
      } else if (field1.values) {
        if(field1.values.length != field2.values.length) {
          return false;
        }
        field1.values.sort(sortArrayByUuidProperty);
        field2.values.sort(sortArrayByUuidProperty);
        for(let j = 0; j < field1.values.length; j++) {
          if(field1.values[j].uuid != field2.values[j].uuid) {
            return false;
          } 
        }
      } else {
        if(field1.value != field2.value) {
          return false;
        }
      }

    }
    return true;
  }

  // Creates a draft from the persisted version.
  async #createDraftFromPersisted(persisted: Record<string, any>): Promise<Record<string, any>> {

    // Create a copy of persisted
    let draft = Object.assign({}, persisted);

    delete draft._id;
    draft.updated_at = draft.persist_date;
    delete draft.persist_date;
    draft.dataset_uuid = await SharedFunctions.uuidFor_id(DatasetModel.collection(), draft.dataset_id, this.state.session);
    delete draft.dataset_id;

    // Replace each of the related_record _ids with uuids. 
    let related_records: string[] = [];
    for(let _id of persisted.related_records) {
      let uuid = await SharedFunctions.uuidFor_id(Record, _id, this.state.session);
      if(uuid) {
        related_records.push(uuid);
      } else {
        console.log(`Failed to find a record with internal id ${_id}. Therefore, removing the reference to it from record with uuid ${draft.uuid}`);
      }
    }
    draft.related_records = related_records;

    return draft;

  }

  // Fetches a record draft 
  // If it does not exist, it creates a draft from the latest persisted.
  // Does not lookup related_records
  async #fetchDraftOrCreateFromPersisted(uuid: string) {
    let record_draft = await SharedFunctions.draft(Record, uuid, this.state.session);
    if(record_draft) {
      return record_draft;
    }

    let persisted_record = await SharedFunctions.latestPersisted(Record, uuid, this.state.session);
    if(!persisted_record) {
      return null;
    }
    record_draft = await this.#createDraftFromPersisted(persisted_record);

    return record_draft;
  }

  #draftsEqual(draft1: Record<string, any>, draft2: Record<string, any>): boolean {
    return draft1.uuid == draft2.uuid &&
          draft1.dataset_uuid == draft2.dataset_uuid &&
          Util.datesEqual(draft1.public_date, draft2.public_date) &&
          this.#fieldsEqual(draft1.fields, draft2.fields) &&
          Util.arrayEqual(draft1.related_records, draft2.related_records);
  }

  // Returns true if the draft has any changes from it's previous persisted version
  async #draftDifferentFromLastPersisted(draft: Record<string, any>): Promise<boolean> {
    // If there is no persisted version, obviously there are changes
    let latest_persisted = await SharedFunctions.latestPersisted(Record, draft.uuid, this.state.session);
    if(!latest_persisted) {
      return true;
    }

    // If the properties have changed since the last persisting
    let latest_persisted_as_draft = await this.#createDraftFromPersisted(latest_persisted);
    if (!this.#draftsEqual(draft, latest_persisted_as_draft)) {
      return true;
    }

    // if the dataset version has changed since this record was last persisted
    let latest_dataset_id = await SharedFunctions.latest_persisted_id_for_uuid(DatasetModel.collection(), latest_persisted_as_draft.dataset_uuid);
    if(!latest_persisted.dataset_id.equals(latest_dataset_id)) {
      return true;
    }

    // Finally, if any of the dependencies have been persisted more recently than this record, then there are changes
    for(let related_record of draft.related_records) {
      let related_record_last_persisted = (await SharedFunctions.latestPersisted(Record, related_record, this.state.session)).persist_date;
      if (Util.compareTimeStamp(related_record_last_persisted, latest_persisted.persist_date) > 0) {
        return true;
      }
    }

    return false;
  }

  async #createOutputFileFromInputFile(input_file: Record<string, any>, record_uuid: string, 
  field_uuid: string): Promise<Record<string, any>> {
    let output_file: any = {};
    if(!Util.isObject(input_file)) {
      throw new Util.InputError(`Each file/image supplied in record field must be an object`);
    }
    if(input_file.uuid == 'new') {
      // newFile should only ever be called right here, and with the transaction session
      // Therefore, if record changes fail, file changes should be deleted
      // This works for import as well, since import also needs to upload the files separately (since they can be huge)
      output_file.uuid = await FileModel.newFile(record_uuid, field_uuid, this.state.session);
      // Next 2 if cases refer to import
      if(input_file.import_url) {
        output_file.import_url = input_file.import_url;
      }
      if(input_file.import_uuid) {
        await (new LegacyUuidToNewUuidMapperModel.model(this.state)).create_document_with_old_and_new(input_file.import_uuid, output_file.uuid);
      }
    } else {
      let file_uuid = input_file.uuid;
      if(!await FileModel.existsWithParams(file_uuid, record_uuid, field_uuid, this.state.session)) {
        throw new Util.InputError(`Record ${record_uuid} cannot attach file/image ${file_uuid} for field ${field_uuid}. 
        Either this file/image does not exist or it belongs to a different record+field.`);
      }
      output_file.uuid = file_uuid;
    }
    if(input_file.name) {
      output_file.name = input_file.name;
    }
    return output_file;
  }

  async #createRecordFieldsFromTemplateFieldsAndMap(template_fields: Record<string, any>[], 
  record_field_map: Record<string, any>, record_uuid: string): Promise<Record<string, any>[]> {
    let result_fields: any[] = [];

    for (let field of template_fields) {
      let field_uuid = field.uuid;
      let field_object: any = {
        uuid: field_uuid,
        name: field.name,
        description: field.description,
      };
      let record_field_data = record_field_map[field_uuid];
      if(field.type && field.type == TemplateFieldModel.FieldTypes.File) {
        field_object.type = TemplateFieldModel.FieldTypes.File;
        if(record_field_data) {
          // Convert import format to standard format
          if(!record_field_data.file && record_field_data.files && record_field_data.files.length > 0) {
            record_field_data.file = record_field_data.files[0];
          }
          if(record_field_data.file) {
            field_object.file = await this.#createOutputFileFromInputFile(record_field_data.file, record_uuid, field_uuid);
          }
        } 
      } else if(field.type && field.type == TemplateFieldModel.FieldTypes.Image) {
        field_object.type = TemplateFieldModel.FieldTypes.Image;
        if(record_field_data) {
          // Convert import format to standard format
          if(!record_field_data.images && record_field_data.files) {
            record_field_data.images = record_field_data.files;
          }
          if(record_field_data.images) {
            let input_images = record_field_data.images;
            if(!Array.isArray(input_images)) {
              throw new Util.InputError(`images property in record field must be an array`);
            }
            let output_images: any[] = [];
            field_object.images = output_images;
            for(let input_image of input_images) {
              output_images.push(await this.#createOutputFileFromInputFile(input_image, record_uuid, field_uuid));
            }
          }
        } 
      } else if(field.options) {
        if(record_field_data && record_field_data.option_uuids) {
          field_object.values = (new TemplateFieldModel.model(this.state)).optionUuidsToValues(field.options, record_field_data.option_uuids);
        } else {
          field_object.values = [];
        }
      } else {
        if(record_field_data) {
          field_object.value = record_field_data.value;
        }
      }

      result_fields.push(field_object);
    }

    // Any file uuids that were in the old record fields but aren't anymore need to be deleted
    let previous_record_draft = await SharedFunctions.draft(Record, record_uuid, this.state.session);
    if(previous_record_draft) {
      await this.#deleteLostFiles(previous_record_draft.fields, result_fields);
    }

    return result_fields;
  }

  async #deleteDraftFiles(draft: Record<string, any>): Promise<void> {
    let file_uuids: any[] = [];
    for(let field of draft.fields) {
      if(field.file) {
        file_uuids.push(field.file.uuid);
      }
      if(field.images) {
        for(let image of field.images) {
          file_uuids.push(image.uuid);
        }
      }
    }
    try {
      await this.#deleteFilesWithUUids(file_uuids);
    } catch(err) {
      console.log(`deleteDraftFiles: failed with err: ${err}`);
    }
  }

  // For each lost file, try to delete it. Of course, if it hasn't been persisted, it won't work
  async #deleteFilesWithUUids(file_uuids: string[]): Promise<void> {
    for(let file_uuid of file_uuids) {
      try{
        await FileModel.delete(file_uuid, this.state.session);
      } catch(err) {
        if(err instanceof Util.InputError || err instanceof Util.NotFoundError) {
          ;
        } else {
          throw err;
        }
      }
    }
  }

  async #deleteLostFiles(old_fields: Record<string, any>[], new_fields: Record<string, any>[]): Promise<void> {
    // First find the file uuids that have been lost
    let old_file_uuids = new Set<string>();
    for(let field of old_fields) {
      if(field.type && field.type == FieldTypes.File && field.file) {
        old_file_uuids.add(field.file.uuid);
      }
      if(field.type && field.type == FieldTypes.Image && field.images) {
        for(let image of field.images) {
          old_file_uuids.add(image.uuid);
        }
      }
    }
    let new_file_uuids = new Set<string>();
    for(let field of new_fields) {
      if(field.type && field.type == FieldTypes.File && field.file) {
        new_file_uuids.add(field.file.uuid);
      }
      if(field.type && field.type == FieldTypes.Image && field.images) {
        for(let image of field.images) {
          old_file_uuids.add(image.uuid);
        }
      }
    }

    // set difference
    let lost_file_uuids: string[] = [...old_file_uuids].filter(x => !new_file_uuids.has(x));
    
    // then delete them
    await this.#deleteFilesWithUUids(lost_file_uuids);

  }

  async #createRecordFieldsFromInputRecordAndTemplate(record_fields: Record<string, any>[], 
  template_fields: Record<string, any>[], record_uuid: string): Promise<Record<string, any>[]> {
    if(!record_fields) {
      record_fields = [];
    }
    if (!Array.isArray(record_fields)){
      throw new Util.InputError('fields property must be of type array');
    }
    // Create a map of records to fields
    let record_field_map = {};
    for (let field of record_fields) {
      if(!Util.isObject(field)) {
        throw new Util.InputError(`Each field in the record must be a json object`);
      }
      if(!field.uuid) {
        throw new Util.InputError(`Each field in the record must supply a template_field uuid`);
      }
      if (record_field_map[field.uuid]) {
        throw new Util.InputError(`A record can only supply a single value for each field`);
      }
      let record_field_data: any = {};
      if(field.value) {
        record_field_data.value = field.value;
      }
      if(field.file) {
        record_field_data.file = field.file;
      }
      if(field.images) {
        record_field_data.images = field.images;
      }
      if(field.values) {
        record_field_data.option_uuids = field.values.map(obj => obj.uuid);
      }
      record_field_map[field.uuid] = record_field_data;
    }

    let result_fields = await this.#createRecordFieldsFromTemplateFieldsAndMap(template_fields, record_field_map, record_uuid);

    return result_fields;
  }

  // For each field, converts import record to the format of a normal input record, 
  // then calls a function which creates a new record from field + record
  async #createRecordFieldsFromImportRecordAndTemplate(record_fields: Record<string, any>[], 
  template_fields: Record<string, any>[], record_uuid: string): Promise<Record<string, any>[]> {
    let uuid_mapper_model_instance = new LegacyUuidToNewUuidMapperModel.model(this.state);

    // Fields are a bit more complicated
    if(!record_fields) {
      record_fields = [];
    }
    if (!Array.isArray(record_fields)){
      throw new Util.InputError('fields property must be of type array');
    }
    // Create a map of records to fields
    let record_field_map: Record<string, any> = {};
    for (let field of record_fields) {
      if(!Util.isObject(field)) {
        throw new Util.InputError(`Each field in the record must be a json object`);
      }
      let old_field_uuid = field.field_uuid;
      if(!old_field_uuid) {
        old_field_uuid = field.template_field_uuid;
      }
      if(!old_field_uuid) {
        throw new Util.InputError(`Each field in the record must supply a field_uuid/template_field_uuid`);
      }
      let field_uuid = await uuid_mapper_model_instance.get_new_uuid_from_old(old_field_uuid);
      if (record_field_map[field_uuid]) {
        throw new Util.InputError(`A record can only supply a single value for each field`);
      }
      let record_field_data: any = {value: field.value};
      if(field.files) {
        record_field_data.files = [];
        for(let input_file of field.files) {
          let output_file: any = {};
          let old_file_uuid = input_file.file_uuid;
          let new_file_uuid = await uuid_mapper_model_instance.get_new_uuid_from_old(old_file_uuid);
          if(new_file_uuid) {
            output_file.uuid = new_file_uuid;
          } else {
            output_file.uuid = "new";
            output_file.import_uuid = old_file_uuid;
          }
          output_file.import_url = input_file.href;
          output_file.name = input_file.original_name;
          record_field_data.files.push(output_file);
        }
      } 
      if(field.value && Array.isArray(field.value)) {
        record_field_data.option_uuids = 
          await Promise.all(
            field.value.map(obj => 
              uuid_mapper_model_instance.get_new_uuid_from_old(obj.template_radio_option_uuid)
            )
          );
      }
      record_field_map[field_uuid] = record_field_data;
    }

    return await this.#createRecordFieldsFromTemplateFieldsAndMap(template_fields, record_field_map, record_uuid);
  }

  // TODO: add updated_at to the state
  async #extractRelatedRecordsFromCreateOrUpdate(input_related_records: Record<string, any>[], 
  related_datasets: Record<string, any>[], template: Record<string, any>, updated_at: Date, seen_uuids: Set<string>)
  : Promise<[string[], boolean]> {
    let return_record_uuids: string[] = [];
    let changes = false;
    // Recurse into related_records
    if(!input_related_records) {
      input_related_records = [];
    }
    if (!Array.isArray(input_related_records)){
      throw new Util.InputError('related_records property must be of type array');
    }
    // Requirements:
    // - related_records is a set, so there can't be any duplicates
    // - Every related_record must point to a related_dataset supported by the dataset
    // Plan: Create a dataset_uuid to dataset map. At the end, check related_records for duplicates
    let related_dataset_map = {};
    for (let related_dataset of related_datasets) {
      related_dataset_map[related_dataset.uuid] = related_dataset;
    }
    let related_template_map = {};
    for (let related_template of template.related_templates) {
      related_template_map[related_template._id.toString()] = related_template;
    }
    for(let subscribed_template of template.subscribed_templates) {
      related_template_map[subscribed_template._id.toString()] = subscribed_template;
    }
    for (let related_record of input_related_records) {
      if(!Util.isObject(related_record)) {
        throw new Util.InputError(`Each related_record in the record must be a json object`);
      }
      if(!related_record.dataset_uuid) {
        throw new Util.InputError(`Each related_record in the record must supply a dataset_uuid`);
      }
      if(!(related_record.dataset_uuid in related_dataset_map)) {
        throw new Util.InputError(`Each related_record in the record must link to a related_dataset supported by the dataset`);
      } 
      let related_dataset = related_dataset_map[related_record.dataset_uuid];
      let related_template = related_template_map[related_dataset.template_id];
      let related_record_uuid: string;
      try {
        let new_changes;
        [new_changes, related_record_uuid] = await this.#validateAndCreateOrUpdateRecurser(related_record, related_dataset, related_template, updated_at, seen_uuids);
        changes = changes || new_changes;
      } catch(err) {
        if (err instanceof Util.NotFoundError) {
          throw new Util.InputError(err.message);
        } else if (err instanceof Util.PermissionDeniedError) {
          // If we don't have admin permissions to the related_record, don't try to update/create it. Just link it
          related_record_uuid = related_record.uuid;
        } else {
          throw err;
        }
      }
      // After validating and updating the related_record, replace the related_record with a uuid reference
      return_record_uuids.push(related_record_uuid);
    }
    // Related_records is really a set, not a list. But Mongo doesn't store sets well, so have to manage it ourselves.
    if(Util.anyDuplicateInArray(return_record_uuids)) {
      throw new Util.InputError(`Each record may only have one instance of every related_record.`);
    }
    return [return_record_uuids, changes];
  }

  // A recursive helper for validateAndCreateOrUpdate.
  async #validateAndCreateOrUpdateRecurser(input_record: Record<string, any>, dataset: Record<string, any>, 
  template: Record<string, any>, updated_at: Date, seen_uuids: Set<string>): Promise<[boolean, string]> {

    // Record must be an object or valid uuid
    if (!Util.isObject(input_record)) {
      throw new Util.InputError(`record provided is not an object: ${input_record}`);
    }

    let uuid;
    // If a record uuid is provided, this is an update
    if (input_record.uuid) {
      // Record must have a valid uuid. 
      if (!uuidValidate(input_record.uuid)) {
        throw new Util.InputError("each record must have a valid uuid property");
      }
      
      // Record uuid must exist
      if (!(await SharedFunctions.exists(Record, input_record.uuid, this.state.session))) {
        throw new Util.NotFoundError(`No record exists with uuid ${input_record.uuid}`);
      }

      uuid = input_record.uuid;
    }
    // Otherwise, this is a create, so generate a new uuid
    else {
      uuid = uuidv4();
    }

    // verify that this user is in the 'edit' permission group
    if (!(await (new UserPermissionsModel.model(this.state)).has_permission(this.state.user_id, dataset.uuid, PermissionGroupModel.PermissionTypes.edit))) {
      throw new Util.PermissionDeniedError(`Do not have edit permissions required to create/update records in dataset ${dataset.uuid}`);
    }

    // each record only updates once per update, even if it shows up multiple times in the json input
    if(seen_uuids.has(uuid)) {
      return [false, uuid];
    } else {
      seen_uuids.add(uuid);
    }
    
    // Make sure no record switches datasets
    let latest_persisted_record = await SharedFunctions.latestPersisted(Record, uuid, this.state.session);
    if (latest_persisted_record) {
      if(input_record.dataset_uuid != latest_persisted_record.dataset_uuid) {
        throw new Util.InputError(`Record ${uuid} expected dataset ${latest_persisted_record.dataset_uuid}, but received ${input_record.dataset_uuid}. Once a record is persisted, it's dataset may never be changed.`);
      }
    }

    // Verify that the dataset uuid specified by the record matches the dataset uuid of the dataset
    if(input_record.dataset_uuid != dataset.uuid) {
      throw new Util.InputError(`The dataset uuid provided by the record: ${input_record.dataset_uuid} does not correspond to the dataset uuid expected by the dataset: ${dataset.uuid}`);
    }

    // Now process the record data provided
    let new_record: any = {
      uuid,
      dataset_uuid: input_record.dataset_uuid,
      updated_at,
      related_records: []
    };

    if (input_record.public_date) {
      if (!Date.parse(input_record.public_date)){
        throw new Util.InputError('record public_date property must be in valid date format');
      }
      new_record.public_date = new Date(input_record.public_date);
    }

    let old_system_uuid = await (new LegacyUuidToNewUuidMapperModel.model(this.state)).get_old_uuid_from_new(uuid);
    if(old_system_uuid) {
      new_record.old_system_uuid = old_system_uuid;
    }

    new_record.fields = await this.#createRecordFieldsFromInputRecordAndTemplate(input_record.fields, template.fields, uuid);

    // Need to determine if this draft is any different from the persisted one.
    let changes;

    [new_record.related_records, changes] = await this.#extractRelatedRecordsFromCreateOrUpdate(input_record.related_records, dataset.related_datasets, template, updated_at, seen_uuids);

    // If this draft is identical to the latest persisted, delete it.
    // The reason to do so is so when a change is submitted, we won't create drafts of sub-records.
    if (!changes) {
      changes = await this.#draftDifferentFromLastPersisted(new_record);
      if (!changes) {
        // Delete the current draft
        try {
          await SharedFunctions.draftDelete(Record, uuid, this.state.session);
        } catch (err) {
          if (!(err instanceof Util.NotFoundError)) {
            throw err;
          }
        }
        return [false, uuid];
      }
    }

    // If a draft of this record already exists: overwrite it, using it's same uuid
    // If a draft of this record doesn't exist: create a new draft
    // Fortunately both cases can be handled with a single MongoDB UpdateOne query using upsert: true
    let session = this.state.session;
    let response = await Record.updateOne(
      {uuid, 'persist_date': {'$exists': false}}, 
      {$set: new_record}, 
      {'upsert': true, session}
    );
    if (response.upsertedCount != 1 && response.matchedCount != 1) {
      throw new Error(`Record.validateAndCreateOrUpdate: Upserted: ${response.upsertedCount}. Matched: ${response.matchedCount}`);
    } 

    // If successfull, return the uuid of the created / updated record
    return [true, uuid];

  }

  // If a uuid is provided, update the record with the provided uuid.
  // Otherwise, create a new record.
  // If the updated record is the same as the last persisted, delete the draft instead of updating. 
  // In both cases, validate the given record as well, making sure it adheres to the latest public template
  // Return:
  // 1. A boolean indicating true if there were changes from the last persisted.
  // 2. The uuid of the record created / updated
  async #validateAndCreateOrUpdate(record: Record<string, any>): Promise<[boolean, string]>  {

    // Record must be an object
    if (!Util.isObject(record)) {
      throw new Util.InputError(`record provided is not an object: ${record}`);
    }

    let dataset;
    try {
      dataset = await (new DatasetModel.model(this.state)).latestPersistedWithoutPermissions(record.dataset_uuid);
    } catch(error) {
      if(error instanceof Util.InputError) {
        throw new Util.InputError(`a valid dataset_uuid was not provided for record ${record.uuid}`);
      } else {
        throw error;
      }
    }
    if(!dataset) {
      throw new Util.InputError(`a valid dataset_uuid was not provided for record ${record.uuid}`);
    }
    let template = await (new TemplateModel.model(this.state)).persistedByIdWithoutPermissions(SharedFunctions.convertToMongoId(dataset.template_id));

    let updated_at = new Date();

    return await this.#validateAndCreateOrUpdateRecurser(record, dataset, template, updated_at, new Set());

  }

  // Fetches the record draft with the given uuid, recursively looking up related_records.
  // If a draft of a given template doesn't exist, a new one will be generated using the last persisted record.
  async #draftFetchOrCreate(uuid: string): Promise<Record<string, any> | null> {

    // See if a draft of this template exists. 
    let record_draft = await this.#fetchDraftOrCreateFromPersisted(uuid);
    if (!record_draft) {
      return null;
    }

    // Make sure this user has a permission to be working with drafts
    if (!(await (new UserPermissionsModel.model(this.state)).has_permission(this.state.user_id, record_draft.dataset_uuid, PermissionGroupModel.PermissionTypes.edit))) {
      throw new Util.PermissionDeniedError(`You do not have the edit permissions required to view draft ${uuid}`);
    }

    // Now recurse into each related_record, replacing each uuid with an imbedded object
    let related_records: any[] = [];
    for(let i = 0; i < record_draft.related_records.length; i++) {
      let related_record;
      try{
        related_record = await this.#draftFetchOrCreate(record_draft.related_records[i]);
      } catch (err) {
        if (err instanceof Util.PermissionDeniedError) {
          // If we don't have permission for the draft, get the latest persisted instead
          try {
            related_record = await this.#latestPersistedWithJoinsAndPermissions(record_draft.related_records[i]);
          } catch (err) {
            if (err instanceof Util.PermissionDeniedError || err instanceof Util.NotFoundError) {
              // If we don't have permission for the persisted version, or a persisted version doesn't exist, just attach a uuid and a flag marking no_permissions
              related_record = await this.#fetchDraftOrCreateFromPersisted(record_draft.related_records[i]);
              related_record = {uuid: related_record.uuid, dataset_uuid: related_record.dataset_uuid, no_permissions: true};
            } 
            else {
              throw err;
            }
          }
        } else {
          throw err;
        }
      }
      if (!related_record) {
        related_record = {uuid: record_draft.related_records[i], deleted: true};
      } 
      related_records.push(related_record);
    }

    record_draft.related_records = related_records;
    delete record_draft._id;
    delete record_draft.dataset_id;

    return record_draft;

  }

  async #persistRelatedRecords(related_record_uuids: string[], related_datasets: Record<string, any>[], 
  template: Record<string, any>): Promise<ObjectId[]> {
    let return_record_ids: any[] = [];
    // For each records's related_records, persist that related_record, then replace the uuid with the internal_id.
    // It is possible there weren't any changes to persist, so keep track of whether we actually persisted anything.
    // Requirements: 
    // - Each related_record must point to a related_dataset supported by the dataset
    let related_dataset_map = {};
    for (let related_dataset of related_datasets) {
      related_dataset_map[related_dataset.uuid] = related_dataset;
    }
    let related_template_map = {};
    for (let related_template of template.related_templates) {
      related_template_map[related_template._id.toString()] = related_template;
    }
    for(let subscribed_template of template.subscribed_templates) {
      related_template_map[subscribed_template._id.toString()] = subscribed_template;
    }
    for(let related_record_uuid of related_record_uuids) {
      let related_record_document = await SharedFunctions.latestDocument(Record, related_record_uuid, this.state.session);
      if(!related_record_document) {
        throw new Util.InputError(`Cannut persist record. One of it's related_references does not exist and was probably deleted after creation.`);
      }
      let related_dataset = related_dataset_map[related_record_document.dataset_uuid];
      if(!related_dataset) {
        throw new Util.InputError(`Cannot persist related_record pointing to related_dataset not supported by the dataset. 
        Dataset may have been persisted since last record update.`);
      }
      let related_template = related_template_map[related_dataset.template_id.toString()];
      try {
        let related_record_id = await this.#persistRecurser(related_record_uuid, related_dataset, related_template);
        return_record_ids.push(related_record_id);
      } catch(err) {
        if (err instanceof Util.NotFoundError) {
          throw new Util.InputError(`Internal reference within this draft is invalid. Fetch/update draft to cleanse it.`);
        } else if (err instanceof Util.PermissionDeniedError) {
          // If the user doesn't have permissions, assume they want to link the persisted version of the record
          // But before we can link the persisted version of the record, we must make sure it exists
          let related_record_persisted = await SharedFunctions.latestPersisted(Record, related_record_uuid, this.state.session);
          if(!related_record_persisted) {
            throw new Util.InputError(`invalid link to record ${related_record_uuid}, which has no persisted version to link`);
          }
          return_record_ids.push(related_record_persisted._id);
        } else {
          throw err;
        }
      }
    } 
    return return_record_ids;
  }

  async #persistRecurser(uuid: string, dataset: Record<string, any>, template: Record<string, any>): Promise<ObjectId> {

    let persisted_record = await SharedFunctions.latestPersisted(Record, uuid, this.state.session);

    // Check if a draft with this uuid exists
    let record_draft = await SharedFunctions.draft(Record, uuid, this.state.session);
    if(!record_draft) {
      // There is no draft of this uuid. Return the latest persisted record instead.
      if (!persisted_record) {
        throw new Util.NotFoundError(`Record ${uuid} does not exist`);
      }
      return persisted_record._id;
    }

    // verify that this user is in the 'edit' permission group
    if (!(await (new UserPermissionsModel.model(this.state)).has_permission(this.state.user_id, dataset.uuid, PermissionGroupModel.PermissionTypes.edit))) {
      throw new Util.PermissionDeniedError(`Do not have edit permissions required to persist records in dataset ${dataset.uuid}`);
    }

    // check that the draft update is more recent than the last dataset persist
    if ((await SharedFunctions.latest_persisted_time_for_uuid(DatasetModel.collection(), record_draft.dataset_uuid)) > record_draft.updated_at) {
      throw new Util.InputError(`Record ${record_draft.uuid}'s dataset has been persisted more recently than when the record was last updated. 
      Update the record again before persisting.`);
    }

    // verify that the dataset uuid on the record draft and the expected dataset uuid match
    // This check should never fail, unless there is a bug in my code. Still, it doesn't hurt to be safe.
    assert(record_draft.dataset_uuid == dataset.uuid, 
      `The record draft ${record_draft} does not reference the dataset required ${dataset.uuid}. Cannot persist.`);

    for(let field of record_draft.fields) {
      if(field.type == TemplateFieldModel.FieldTypes.File && field.file && field.file.uuid) {
        delete field.file.import_url;  // Import_url is only for the initial import. It shouldn't be persisted
        await FileModel.markPersisted(field.file.uuid);
      }
      if(field.type == TemplateFieldModel.FieldTypes.Image && field.images) {
        for(let image of field.images) {
          if(image.uuid) {
            delete image.import_url;
            await FileModel.markPersisted(image.uuid);
          }
        }
      }
    }

    var last_persisted_time = 0;
    if(persisted_record) {
      last_persisted_time = persisted_record.persist_date;
    }  

    let related_records = await this.#persistRelatedRecords(record_draft.related_records, dataset.related_datasets, template);


    let persist_time = new Date();
    let session = this.state.session;
    let response = await Record.updateOne(
      {"_id": record_draft._id},
      {'$set': {'updated_at': persist_time, 'persist_date': persist_time, fields: record_draft.fields, related_records, 'dataset_id': dataset._id}},
      {session}
    )
    if (response.modifiedCount != 1) {
      throw new Error(`Record.persist: should be 1 modified document. Instead: ${response.modifiedCount}`);
    }
    return record_draft._id;
  }

  // Persistes the record with the provided uuid
  // Input: 
  //   uuid: the uuid of a record to be persisted
  //   session: the mongo session that must be used to make transactions atomic
  //   last_update: the timestamp of the last known update by the user. Cannot persist if the actual last update and that expected by the user differ.
  async #persist(record_uuid: string, last_update: Date): Promise<void> {

    let record = await SharedFunctions.draft(Record, record_uuid, this.state.session);
    if (!record) {
      record = await SharedFunctions.latestPersisted(Record, record_uuid, this.state.session);
      if (!record) {
        throw new Util.NotFoundError(`Record ${record_uuid} does not exist`);
      } 
      throw new Util.InputError('No changes to persist');
    }

    // If the last update provided doesn't match to the last update found in the db, fail.
    let db_last_update = new Date(await this.lastUpdate(record_uuid));
    if(last_update.getTime() != db_last_update.getTime()) {
      throw new Util.InputError(`The last update submitted ${last_update.toISOString()} does not match that found in the db ${db_last_update.toISOString()}. 
      Fetch the draft again to get the latest update before attempting to persist again.`);
    }
    
    let dataset;
    try {
      dataset = await (new DatasetModel.model(this.state)).latestPersistedWithoutPermissions(record.dataset_uuid);
    } catch(error) {
      if(error instanceof Util.NotFoundError || error instanceof Util.InputError) {
        throw new Util.InputError(`a valid dataset_uuid was not provided for record ${record.uuid}`);
      } else {
        throw error;
      }
    }
    let template = await (new TemplateModel.model(this.state)).persistedByIdWithoutPermissions(dataset.template_id);

    await this.#persistRecurser(record_uuid, dataset, template);

  }

  async #latestPersistedBeforeDateWithJoins(uuid: string, date: Date): Promise<Record<string, any> | null> {
    // Construct a mongodb aggregation pipeline that will recurse into related records up to 5 levels deep.
    // Thus, the tree will have a depth of 6 nodes
    let pipeline = [
      {
        '$match': { 
          'uuid': uuid,
          'persist_date': {'$lte': date}
        }
      },
      {
        '$sort' : { 'persist_date' : -1 }
      },
      {
        '$limit' : 1
      }
    ]

    let current_pipeline: any[] = pipeline;

    let pipeline_addons: any[] = [
      {
        '$lookup': {
          'from': "records",
          'let': { 'ids': "$related_records"},
          'pipeline': [
            { 
              '$match': { 
                '$expr': { 
                  '$and': [
                    { '$in': [ "$_id",  "$$ids" ] },
                  ]
                }
              }
            }
          ],
          'as': "related_records_objects"
        }
      },
      {
        "$addFields": {
          "related_records_objects_ids": { 
            "$map": {
              "input": "$related_records_objects",
              "in": "$$this._id"
            }
          }
        }
      },
      {
        "$addFields": {
          "related_records": { 
            "$map": {
              "input": "$related_records",
              "in": {"$arrayElemAt":[
                "$related_records_objects",
                {"$indexOfArray":["$related_records_objects_ids","$$this"]}
              ]}
            }
          }
        }
      },
      {"$project":{"related_records_objects":0,"related_records_objects_ids":0}}
    ];

    for(let i = 0; i < 5; i++) {
      // go one level deeper into related_records
      current_pipeline.push(...pipeline_addons);
      current_pipeline = pipeline_addons[0]['$lookup']['pipeline'];
      // create a copy
      pipeline_addons = JSON.parse(JSON.stringify(pipeline_addons));
    }
    let session = this.state.session;
    let response = await Record.aggregate(pipeline, {session});
    if (await response.hasNext()){
      return await response.next();
    } else {
      return null;
    }
  }

  // This function will provide the timestamp of the last update made to this record and all of it's related_records
  async lastUpdate(uuid: string): Promise<Date> {

    let user_permissions_model_instance = new UserPermissionsModel.model(this.state);

    let draft = await this.#fetchDraftOrCreateFromPersisted(uuid);
    if(!draft) {
      throw new Util.NotFoundError();
    }

    let edit_permission = await user_permissions_model_instance.has_permission(this.state.user_id, draft.dataset_uuid, PermissionGroupModel.PermissionTypes.edit);
    let view_permission = await user_permissions_model_instance.has_permission(this.state.user_id, draft.dataset_uuid, PermissionGroupModel.PermissionTypes.view);
    let persisted = await SharedFunctions.latestPersisted(Record, uuid, this.state.session);

    if(!edit_permission) {
      if(!persisted) {
        throw new Util.PermissionDeniedError(`record ${uuid}: do not have edit permissions for draft, and no persisted version exists`);
      }
      if(!view_permission) {
        throw new Util.PermissionDeniedError(`record ${uuid}: do not have view or admin permissions`);
      }
      return persisted.updated_at;
    }

    let last_update = draft.updated_at;
    for(uuid of draft.related_records) {
      try {
        let update = await this.lastUpdate(uuid);
        if (update > last_update){
          last_update = update;
        }
      } catch (err) {
        if (err instanceof Util.NotFoundError || err instanceof Util.PermissionDeniedError) {
          //
        } else {
          throw err;
        }
      }
    }

    return last_update;

  }

  async #userHasAccessToPersistedRecord(record: Record<string, any>): Promise<boolean> {
    let dataset = await SharedFunctions.latestPersisted(DatasetModel.collection(), record.dataset_uuid, this.state.session);
    // If both the dataset and the record are public, then everyone has view access
    if (Util.isPublic(dataset.public_date) 
        //&& Util.isPublic(record.public_date)
    ){
      return true;
    }

    // Otherwise, check if we have view permissions
    return await (new UserPermissionsModel.model(this.state)).has_permission(this.state.user_id, dataset.uuid, PermissionGroupModel.PermissionTypes.view);
  }

  async #filterPersistedForPermissionsRecursor(record: Record<string, any>): Promise<void> {
    for(let i = 0; i < record.related_records.length; i++) {
      if(!(await this.#userHasAccessToPersistedRecord(record.related_records[i]))) {
        record.related_records[i] = {uuid: record.related_records[i].uuid};
      } else {
        await this.#filterPersistedForPermissionsRecursor(record.related_records[i]);
      }
    }
  }

  // Ignore record specific permissions until I remember how they work
  async #filterPersistedForPermissions(record: Record<string, any>): Promise<void> {
    if(!(await this.#userHasAccessToPersistedRecord(record))) {
      throw new Util.PermissionDeniedError(`Do not have view access to records in dataset ${record.dataset_uuid}`);
    }
    await this.#filterPersistedForPermissionsRecursor(record);
  }

  async #latestPersistedBeforeDateWithJoinsAndPermissions(uuid: string, date: Date): Promise<Record<string, any> | null> {
    let record = await this.#latestPersistedBeforeDateWithJoins(uuid, date);
    if(!record) {
      return null;
    }
    await this.#filterPersistedForPermissions(record);
    return record;
  } 

  // Fetches the last persisted record with the given uuid. 
  // Also recursively looks up related_datasets.
  async #latestPersistedWithJoinsAndPermissions(uuid: string): Promise<Record<string, any> | null> {
    return await this.#latestPersistedBeforeDateWithJoinsAndPermissions(uuid, new Date());
  }

  async #importRecordFromCombinedRecursor(input_record: Record<string, any>, dataset: Record<string, any>, 
  template: Record<string, any>, updated_at: Date): Promise<[boolean, string]> {
    let uuid_mapper_model_instance = new LegacyUuidToNewUuidMapperModel.model(this.state);

    if(!Util.isObject(input_record)) {
      throw new Util.InputError('Record to import must be a json object.');
    }
    if(!input_record.record_uuid || typeof(input_record.record_uuid) !== 'string') {
      throw new Util.InputError(`Each record to be imported must have a record uuid, which is a string.`);
    }

    // Now get the matching database uuid for the imported database uuid
    let old_dataset_uuid = input_record.database_uuid;
    let new_dataset_uuid = await uuid_mapper_model_instance.get_new_uuid_from_old(old_dataset_uuid);
    let old_record_uuid = input_record.record_uuid;
    let new_record_uuid = await uuid_mapper_model_instance.get_new_uuid_from_old(old_record_uuid);
    // If the uuid is found, then this has already been imported. Import again if we have edit permissions
    if(new_record_uuid) {
      if(!(await (new UserPermissionsModel.model(this.state)).has_permission(this.state.user_id, new_dataset_uuid, PermissionGroupModel.PermissionTypes.admin))) {
        throw new Util.PermissionDeniedError(`You do not have edit permissions required to import record ${old_record_uuid}. It has already been imported.`);
      }
    } else {
      new_record_uuid = await uuid_mapper_model_instance.create_new_uuid_for_old(old_record_uuid);
    }

    // Build object to create/update
    let new_record: any = {
      uuid: new_record_uuid,
      dataset_uuid: new_dataset_uuid,
      updated_at,
      related_records: []
    };

    if (input_record._record_metadata && Util.isObject(input_record._record_metadata) && 
    input_record._record_metadata._public_date && Date.parse(input_record._record_metadata._public_date)) {
      new_record.public_date = new Date(input_record._record_metadata._public_date);
    }

    // Need to determine if this draft is any different from the persisted one.
    let changes = false;

    new_record.fields = await this.#createRecordFieldsFromImportRecordAndTemplate(input_record.fields, template.fields, new_record_uuid);

    // Requirements:
    // - related_records is a set, so there can't be any duplicates
    // - Every related_record must point to a related_dataset supported by the dataset
    // Plan: Create a dataset_uuid to dataset map. At the end, check related_records for duplicates
    let related_dataset_map = {};
    for (let related_dataset of dataset.related_datasets) {
      related_dataset_map[related_dataset.uuid] = related_dataset;
    }
    let related_template_map = {};
    for (let related_template of template.related_templates) {
      related_template_map[related_template.uuid] = related_template;
    }
    for (let related_record of input_record.records) {
      // Special import case. If template_uuid is not provided, just skip this part
      if(!related_record.template_uuid ||  related_record.template_uuid == "") {
        continue;
      } 
      let related_dataset_uuid = await uuid_mapper_model_instance.get_new_uuid_from_old(related_record.database_uuid);
      let related_dataset = related_dataset_map[related_dataset_uuid];
      if(!related_dataset) {
        console.log(`related_dataset_uuid: ${related_dataset_uuid}, related_dataset: ${related_dataset}`);
      }
      let related_template = related_template_map[related_dataset.template_uuid];
      try {
        let new_changes;
        [new_changes, related_record] = await this.#importRecordFromCombinedRecursor(related_record, related_dataset, related_template, updated_at);
        changes = changes || new_changes;
      } catch(err) {
        if (err instanceof Util.NotFoundError) {
          throw new Util.InputError(err.message);
        } else if (err instanceof Util.PermissionDeniedError) {
          // If we don't have admin permissions to the related_dataset, don't try to update/create it. Just link it
          related_record = await uuid_mapper_model_instance.get_new_uuid_from_old(related_record.record_uuid);
        } else {
          throw err;
        }
      }
      // After validating and updating the related_record, replace the related_record with a uuid reference
      new_record.related_records.push(related_record);
    }
    // Related_records is really a set, not a list. But Mongo doesn't store sets well, so have to manage it ourselves.
    if(Util.anyDuplicateInArray(new_record.related_records)) {
      throw new Util.InputError(`Each record may only have one instance of every related_record.`);
    }

    // If this draft is identical to the latest persisted, delete it.
    // The reason to do so is so when an update to a dataset is submitted, we won't create drafts of sub-datasets that haven't changed.
    if (!changes) {
      changes = await this.#draftDifferentFromLastPersisted(new_record);
      if (!changes) {
        // Delete the current draft
        try {
          await SharedFunctions.draftDelete(Record, new_record_uuid, this.state.session);
        } catch (err) {
          if (!(err instanceof Util.NotFoundError)) {
            throw err;
          }
        }
        return [false, new_record_uuid];
      }
    }  
    
    // If a draft of this record already exists: overwrite it, using it's same uuid
    // If a draft of this record doesn't exist: create a new draft
    // Fortunately both cases can be handled with a single MongoDB UpdateOne query using upsert: true
    let session = this.state.session;
    let response = await Record.updateOne(
      {"uuid": new_record_uuid, 'persist_date': {'$exists': false}}, 
      {$set: new_record}, 
      {'upsert': true, session}
    );
    if (response.upsertedCount != 1 && response.matchedCount != 1) {
      throw new Error(`Record.importRecordFromCombinedRecursor: Upserted: ${response.upsertedCount}. Matched: ${response.matchedCount}`);
    } 

    // If successfull, return the uuid of the created / updated dataset
    return [true, new_record_uuid];

  }

  async #importDatasetAndRecord(record: Record<string, any>): Promise<string> {
    // If importing dataset and record together, import dataset and persist it before importing the record draft

    // A couple options here:
    // 1. Do dataset and records at the same time
    // 2. Do dataset first, persist it, then record. 
    // Second one makes more sense, so we only need to persist once
    // I guess first one might be a bit easier to code, but I think the second makes the most sense abstractly. Let's try the second first

    let uuid_mapper_model_instance = new LegacyUuidToNewUuidMapperModel.model(this.state);
    let template_model_instance = new TemplateModel.model(this.state);
    let dataset_model_instance = new DatasetModel.model(this.state);


    if(!Util.isObject(record)) {
      throw new Util.InputError('Record to import must be a json object.');
    }

    // Template must have already been imported
    if(!record.template_uuid || typeof(record.template_uuid) !== 'string') {
      throw new Util.InputError('Record provided to import must have a template_uuid, which is a string.');
    }
    let new_template_uuid = await uuid_mapper_model_instance.get_new_uuid_from_old(record.template_uuid);
    if(!new_template_uuid) {
      throw new Util.InputError('the template_uuid linked in the record you wish to import has not yet been imported.');
    }
    // template must be persisted and user must have read access
    let template = await template_model_instance.latestPersisted(new_template_uuid);
    if(!template) {
      throw new Util.InputError(`Template ${new_template_uuid} must be persisted before it's dataset/record can be imported`);
    }

    // Import dataset
    let [changes, dataset_uuid] = await dataset_model_instance.importDatasetFromCombinedRecursor(record, template, new Date());
    // Persist dataset
    if(changes) {
      await dataset_model_instance.persistWithoutChecks(dataset_uuid, template);
    }
    let dataset = await dataset_model_instance.latestPersisted(dataset_uuid);
    // Import record
    let new_record_uuid = (await this.#importRecordFromCombinedRecursor(record, dataset, template, new Date()))[1];
    return new_record_uuid;
  }

  async #importDatasetsAndRecords(records: Record<string, any>[]): Promise<string[]> {
    if(!Array.isArray(records)) {
      throw new Util.InputError(`'records' must be a valid array`);
    }

    let result_uuids: any[] = [];
    for(let record of records) {
      result_uuids.push(await this.#importDatasetAndRecord(record));
    }
    return result_uuids;
  }

  async #importRelatedRecordsUuidsFromRecord(input_record: Record<string, any>, dataset: Record<string, any>, 
  template: Record<string, any>, updated_at: Date, seen_uuids: Set<string>): Promise<string[]> {
    let uuid_mapper_model_instance = new LegacyUuidToNewUuidMapperModel.model(this.state);

    if(!input_record.records) {
      return [];
    }
    if(!Array.isArray(input_record.records)) {
      throw new Util.InputError(`Records object in record to import must be an array`);
    }
    let result_record_uuids: string[] = [];
    // Requirements:
    // - related_records is a set, so there can't be any duplicates
    // - Every related_record must point to a related_dataset supported by the dataset
    // Plan: Create a dataset_uuid to dataset map. At the end, check related_records for duplicates
    let related_dataset_map = {};
    for (let related_dataset of dataset.related_datasets) {
      related_dataset_map[related_dataset.uuid] = related_dataset;
    }
    let related_template_map = {};
    for (let related_template of template.related_templates) {
      related_template_map[related_template._id] = related_template;
    }
    for (let subscribed_template of template.subscribed_templates) {
      related_template_map[subscribed_template._id] = subscribed_template;
    }
    for (let related_record of input_record.records) {
      let related_dataset_uuid = await uuid_mapper_model_instance.get_secondary_uuid_from_old(related_record.database_uuid);
      let related_dataset = related_dataset_map[related_dataset_uuid];
      if(!related_dataset) {
        throw new Util.InputError(`Record linking unexpected dataset/database: ${related_record.database_uuid}`);
      }
      let related_template = related_template_map[related_dataset.template_id];
      try {
        related_record = await this.#importRecordRecursor(related_record, related_dataset, related_template, updated_at, seen_uuids);
      } catch(err) {
        if (err instanceof Util.NotFoundError) {
          throw new Util.InputError(err.message);
        } else if (err instanceof Util.PermissionDeniedError) {
          // If we don't have admin permissions to the related_dataset, don't try to update/create it. Just link it
          related_record = await uuid_mapper_model_instance.get_new_uuid_from_old(related_record.record_uuid);
        } else {
          throw err;
        }
      }
      // After validating and updating the related_record, replace the related_record with a uuid reference
      result_record_uuids.push(related_record);
    }
    // Related_records is really a set, not a list. But Mongo doesn't store sets well, so have to manage it ourselves.
    if(Util.anyDuplicateInArray(result_record_uuids)) {
      throw new Util.InputError(`Each record may only have one instance of every related_record.`);
    }
    return result_record_uuids;
  }

  async #importRecordRecursor(input_record: Record<string, any>, dataset: Record<string, any>, 
  template: Record<string, any>, updated_at: Date, seen_uuids: Set<string>): Promise<string> {
    let uuid_mapper_model_instance = new LegacyUuidToNewUuidMapperModel.model(this.state);

    if(!Util.isObject(input_record)) {
      throw new Util.InputError('Record to import must be a json object.');
    }
    
    // Now get the matching database uuid for the imported database uuid
    let old_template_uuid = input_record.database_uuid;
    if(!old_template_uuid || typeof(old_template_uuid) !== 'string') {
      throw new Util.InputError(`Each record to be imported must have a database_uuid, which is a string.`);
    }
    let new_dataset_uuid = await uuid_mapper_model_instance.get_secondary_uuid_from_old(old_template_uuid);
    if(!new_dataset_uuid) {
      throw new Util.InputError(`Template/dataset with uuid ${old_template_uuid} has not been imported, so no record linking it may be imported.`);
    }
    if(new_dataset_uuid != dataset.uuid) {
      throw new Util.InputError(`Dataset expects related dataset with uuid ${dataset.uuid}, but record has ${new_dataset_uuid}`);
    }
    
    let old_record_uuid = input_record.record_uuid;
    if(!old_record_uuid || typeof(old_record_uuid) !== 'string') {
      throw new Util.InputError(`Each record to be imported must have a record uuid, which is a string.`);
    }
    let new_record_uuid = await uuid_mapper_model_instance.get_new_uuid_from_old(old_record_uuid);
    // If the uuid is found, then this has already been imported. Import again if we have edit permissions
    if(new_record_uuid) {
      if(!(await (new UserPermissionsModel.model(this.state)).has_permission(this.state.user_id, new_dataset_uuid, PermissionGroupModel.PermissionTypes.edit))) {
        throw new Util.PermissionDeniedError(`You do not have edit permissions required to import record ${old_record_uuid}. It has already been imported.`);
      }
    } else {
      new_record_uuid = await uuid_mapper_model_instance.create_new_uuid_for_old(old_record_uuid);
    }

    // each record only updates once per update, even if it shows up multiple times in the json input
    if(seen_uuids.has(new_record_uuid)) {
      return new_record_uuid;
    } else {
      seen_uuids.add(new_record_uuid);
    }

    // Build object to create/update
    let new_record: any = {
      uuid: new_record_uuid,
      old_system_uuid: old_record_uuid,
      dataset_uuid: new_dataset_uuid,
      updated_at,
      related_records: []
    };

    new_record.fields = await this.#createRecordFieldsFromImportRecordAndTemplate(input_record.fields, template.fields, new_record_uuid);

    new_record.related_records = await this.#importRelatedRecordsUuidsFromRecord(input_record, dataset, template, updated_at, seen_uuids)

    // If a draft of this record already exists: overwrite it, using it's same uuid
    // If a draft of this record doesn't exist: create a new draft
    // Fortunately both cases can be handled with a single MongoDB UpdateOne query using upsert: true
    let session = this.state.session;
    let response = await Record.updateOne(
      {"uuid": new_record_uuid, 'persist_date': {'$exists': false}}, 
      {$set: new_record}, 
      {'upsert': true, session}
    );
    if (response.upsertedCount != 1 && response.matchedCount != 1) {
      throw new Error(`Record.importRecordFromCombinedRecursor: Upserted: ${response.upsertedCount}. Matched: ${response.matchedCount}`);
    } 

    // If successfull, return the uuid of the created / updated dataset
    return new_record_uuid;
  }

  async #importRecord(record: Record<string, any>, updated_at: Date, seen_uuids: Set<string>): Promise<string> {
    if(!Util.isObject(record)) {
      throw new Util.InputError('Record to import must be a json object.');
    }

    // Template must have already been imported
    if(!record.database_uuid || typeof(record.database_uuid) !== 'string') {
      throw new Util.InputError('Record provided to import must have a database_uuid, which is a string.');
    }
    let dataset_uuid = await (new LegacyUuidToNewUuidMapperModel.model(this.state)).get_secondary_uuid_from_old(record.database_uuid);
    if(!dataset_uuid) {
      throw new Util.InputError(`the dataset/template uuid (${record.database_uuid}) linked in the record you wish to import has not yet been imported.`);
    }

    // dataset must be persisted and user must have read access
    let dataset = await (new DatasetModel.model(this.state)).latestPersisted(dataset_uuid);
    if(!dataset) {
      throw new Util.InputError(`Dataset ${dataset_uuid} must be persisted before any record using it can be imported`);
    }

    let template = await (new TemplateModel.model(this.state)).persistedByIdWithoutPermissions(dataset.template_id);

    return this.#importRecordRecursor(record, dataset, template, updated_at, seen_uuids);
  }

  async #importRecords(records: Record<string, any>[]): Promise<string[]> {
    if(!Array.isArray(records)) {
      throw new Util.InputError(`'records' must be a valid array`);
    }

    let updated_at = new Date();

    let seen_uuids = new Set<string>();

    let result_uuids: string[] = [];
    for(let record of records) {
      result_uuids.push(await this.#importRecord(record, updated_at, seen_uuids));
    }
    return result_uuids;
  }

  // Wraps the actual request to create with a transaction
  async create(record: Record<string, any>): Promise<string> {
    let callback = async () => {
      let results = await this.#validateAndCreateOrUpdate(record);
      let inserted_uuid = results[1];
      return inserted_uuid;
    };
    return await SharedFunctions.executeWithTransaction(this.state, callback);
  }

  draftGet = this.#draftFetchOrCreate;

  // Wraps the actual request to update with a transaction
  update = async function(record: Record<string, any>): Promise<void> {
    let callback = async () => {
      await this.#validateAndCreateOrUpdate(record);
    };
    await SharedFunctions.executeWithTransaction(this.state, callback);
  }

  // Wraps the actual request to persist with a transaction
  persist = async function(uuid: string, last_update: Date): Promise<void> {
    let callback = async () => {
      await this.#persist(uuid, last_update);
    };
    await SharedFunctions.executeWithTransaction(this.state, callback);
  }

  // Fetches the last persisted record with the given uuid. 
  // Also recursively looks up related_templates.
  latestPersisted = this.#latestPersistedWithJoinsAndPermissions;

  // Fetches the last record with the given uuid persisted before the provided timestamp. 
  // Also recursively looks up related_templates.
  persistedBeforeDate = this.#latestPersistedBeforeDateWithJoinsAndPermissions;

  async draftDelete(uuid: string): Promise<void> {
    // if draft doesn't exist, return not found
    let draft = await SharedFunctions.draft(Record, uuid, this.state.session);
    if(!draft) {
      throw new Util.NotFoundError(`No draft exists with uuid ${uuid}`);
    }
    // if don't have admin permissions, return no permissions
    if(!(await (new UserPermissionsModel.model(this.state)).has_permission(this.state.user_id, draft.dataset_uuid, PermissionGroupModel.PermissionTypes.edit))) {
      throw new Util.PermissionDeniedError(`You do not have edit permissions for dataset ${draft.dataset_uuid}.`);
    }

    await SharedFunctions.draftDelete(Record, uuid, this.state.session);

    await this.#deleteDraftFiles(draft);
  }

  async draftExisting(uuid: string): Promise<boolean> {
    return (await SharedFunctions.draft(Record, uuid, this.state.session)) ? true : false;
  }

  async userHasPermissionsTo(record_uuid: string, permissionLevel, user: ObjectId): Promise<boolean> {
    let record = await SharedFunctions.latestDocument(Record, record_uuid, this.state.session);
    return await (new UserPermissionsModel.model(this.state)).has_permission(user, record.dataset_uuid, permissionLevel);
  }

  // Just ignore this for now
  async updateFileName(record_uuid, field_uuid, file_uuid, file_name) {
    // I can update the whole record. Just fetch the record, find the given field_uuid, update only change the file_name
    // and voila
    // The catch with this method is that if the user has different permissions, they will alter other parts of the record

    // Another method is just to fetch the fields and update those only. In fact, that is probably better. But the updated_at also needs to be updated

    // But that won't work if there is no current draft. So it really does need to be a full update
    // Ugh, but a full update is so ugly if we only want to change the file name. 



  }

  // Wraps the actual request to importDatasetsAndRecords with a transaction
  async importDatasetsAndRecords(records: Record<string, any>[]): Promise<string[]> {
    let callback = async () => {
      return await this.#importDatasetsAndRecords(records);
    };
    return await SharedFunctions.executeWithTransaction(this.state, callback);
  }

  // Wraps the actual request to importRecords with a transaction
  async importRecords(records: Record<string, any>[]): Promise<string[]> {
    let callback = async () => {
      return await this.#importRecords(records);
    };
    return await SharedFunctions.executeWithTransaction(this.state, callback);
  }

  // At some point for optimization, could modify this query to accept a timestamp and filter further based on that
  async uniqueUuidsInDataset(dataset_uuid: string): Promise<string[]> {
    return await Record.distinct(
      "uuid",
      {dataset_uuid}
    );
  }

};

export {init, Model as model};