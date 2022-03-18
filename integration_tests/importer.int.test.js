const request = require("supertest");
const fs = require('fs');
const MongoDB = require('../lib/mongoDB');
var { app, init: appInit } = require('../app');
var { PERMISSION_ADMIN, PERMISSION_EDIT, PERMISSION_VIEW } = require('../models/permission_group');
var HelperClass = require('./common_test_operations');
var Helper = new HelperClass(app);


beforeAll(async () => {
  await appInit();
});

beforeEach(async() => {
  await Helper.clearDatabase();
});

afterAll(async () => {
  await Helper.clearDatabase();
  await MongoDB.close();
});

const importTemplate = async (template, curr_user) => {
  return await request(app)
    .post(`/import/template/`)
    .set('Cookie', [`user=${curr_user}`])
    .send(template)
    .set('Accept', 'application/json');
}

const cleanseInputTemplateField = (field) => {
  delete field.internal_id;
  delete field.fieldtype;
  delete field.template_field_uuid;
  delete field._field_metadata;
  delete field._database_metadata;
  delete field.updated_at;
  delete field.render_plugin;
  delete field.is_unique;
  if(field.radio_options) {
    for(let radio_option of field.radio_options) {
      delete radio_option.template_radio_option_uuid;
      delete radio_option.updated_at;
    }
  }
}

const cleanseInputTemplate = (template) => {
  delete template.internal_id;
  delete template.template_uuid;
  delete template.metadata_for_uuid;
  delete template._database_metadata;
  delete template.updated_at;
  for(let field of template.fields) {
    cleanseInputTemplateField(field);
  }
  template.related_templates = template.related_databases;
  delete template.related_databases;
  for(let related_template of template.related_templates) {
    cleanseInputTemplate(related_template);
  }
}

const testTemplateFieldsEqual = (before, after, uuid_mapper) => {
  if(before.template_field_uuid in uuid_mapper) {
    expect(after.uuid).toEqual(uuid_mapper[before.template_field_uuid]);
  } else {
    uuid_mapper[before.template_field_uuid] = after.uuid;
  }
  Helper.testTemplateFieldsEqual(before, after);
}

const testTemplatesEqual = (before, after, uuid_mapper) => {
  if(before.template_uuid in uuid_mapper) {
    expect(after.uuid).toEqual(uuid_mapper[before.template_uuid]);
  } else {
    uuid_mapper[before.template_uuid] = after.uuid;
  }
  if(!before.fields) {
    before.fields = [];
  }
  if(!before.related_databases) {
    before.related_databases = [];
  }
  if(before.name) {
    expect(after.name).toEqual(before.name);
  }
  if(before.description) {
    expect(after.description).toEqual(before.description);
  }
  if(before.name) {
    expect(after.name).toEqual(before.name);
  }
  expect(after.fields.length).toBe(before.fields.length);
  expect(after.related_templates.length + after.subscribed_templates.length).toBe(before.related_databases.length);
  before.fields.sort(Helper.sortArrayByNameProperty);
  after.fields.sort(Helper.sortArrayByNameProperty);
  for(let i = 0; i < before.fields.length; i++) {
    testTemplateFieldsEqual(before.fields[i], after.fields[i], uuid_mapper);
  }
  let all_linked_templates = after.related_templates.concat(after.subscribed_templates);
  before.related_databases.sort(Helper.sortArrayByNameProperty);
  all_linked_templates.sort(Helper.sortArrayByNameProperty);
  for(let i = 0; i < before.related_databases.length; i++) {
    testTemplatesEqual(before.related_databases[i], all_linked_templates[i], uuid_mapper);
  }
}

const importTemplatePersistAndTest = async (template, curr_user) => {
  let response = await importTemplate(template, curr_user);
  expect(response.statusCode).toBe(200);
  let uuid = response.body.new_uuid;

  let new_template = await Helper.templateDraftGetAndTest(uuid, curr_user);
  testTemplatesEqual(template, new_template, {});

  return await Helper.templatePersistAndFetch(uuid, curr_user);
}

const importTemplateDataset = async (template, curr_user) => {
  return await request(app)
    .post(`/import/template_with_dataset/`)
    .set('Cookie', [`user=${curr_user}`])
    .send(template)
    .set('Accept', 'application/json');
}

const importTemplateDatasetTest = async (template, curr_user) => {
  let response = await importTemplateDataset(template, curr_user);
  expect(response.statusCode).toBe(200);
  let template_uuid = response.body.template_uuid;
  let dataset_uuid = response.body.dataset_uuid;
  let new_template = await Helper.templateLatestPersistedAndTest(template_uuid, curr_user);
  let new_dataset = await Helper.datasetDraftGetAndTest(dataset_uuid, curr_user);
  testTemplatesEqual(template, new_template, {});
  return [new_template, new_dataset];
}

const importTemplateDatasetPersistTest = async (template, curr_user) => {
  let new_template, dataset_draft;
  [new_template, dataset_draft] = await importTemplateDatasetTest(template, curr_user);
  let new_dataset = await Helper.datasetPersistAndFetch(dataset_draft.uuid, curr_user);
  return [new_template, new_dataset];
}

const importCombinedDatasetsAndRecords = async (datasets_and_records, curr_user) => {
  return await request(app)
    .post(`/import/datasets_and_records/`)
    .set('Cookie', [`user=${curr_user}`])
    .send({records: datasets_and_records})
    .set('Accept', 'application/json');
}

const recordfieldsEqual = (old_field, new_field, uuid_mapper) => {
  if(old_field.template_field_uuid in uuid_mapper) {
    if(new_field.uuid != uuid_mapper[old_field.template_field_uuid]) {
      return false;
    }
  } else {
    uuid_mapper[old_field.template_field_uuid] = new_field.uuid
  }
  if(old_field.field_name != new_field.name) {
    return false;
  }
  if(typeof(old_field.value) == 'string') {
    if(old_field.value != new_field.value) {
      return false;
    }
  } else {
    if(typeof(old_field.value) != typeof(new_field.values))
    for(let i = 0; i < old_field.value.length; i++) {
      if(old_field.value[i].name != new_field.values[i].name) {
        return false;
      }
    }
    if(old_field.value.name != new_field.value) {
      return false;
    }
  }
  return true;
}

const compareOldAndNewDatabaseAndRecord = async (old_record_and_database, new_dataset, new_record, uuid_mapper) => {
  // Check record_uuid
  if(old_record_and_database.record_uuid in uuid_mapper) {
    if(new_record.uuid != uuid_mapper[old_record_and_database.record_uuid]) {
      return false;
    }
  } else {
    uuid_mapper[old_record_and_database.record_uuid] = new_record.uuid;
  }
  // Check dataset_uuid
  if(new_dataset.uuid != new_record.dataset_uuid) {
    return false;
  }
  if(old_record_and_database.database_uuid in uuid_mapper) {
    if(new_dataset.uuid != uuid_mapper[old_record_and_database.new_dataset]) {
      return false;
    }
  } else {
    uuid_mapper[old_record_and_database.database_uuid] = new_dataset.uuid;
  }
  // Check template_uuid
  if(old_record_and_database.template_uuid in uuid_mapper) {
    if(new_dataset.template_uuid != uuid_mapper[old_record_and_database.template_uuid]) {
      return false;
    }
  } else {
    uuid_mapper[old_record_and_database.template_uuid] = new_dataset.template_uuid;
  }

  if(!old_record_and_database.fields) {
    old_record_and_database.fields = []
  }
  if(!old_record_and_database.records) {
    old_record_and_database.records = []
  }

  if(typeof(old_record_and_database.fields) != typeof(new_record.fields) ||
    old_record_and_database.fields.length != new_record.fields.length ||
    typeof(old_record_and_database.records) != typeof(new_dataset.related_datasets) ||
    old_record_and_database.records.length != new_dataset.related_datasets.length ||
    old_record_and_database.records.length != new_record.related_records.length) {
    return false;
  }
  old_record_and_database.fields.sort(Helper.sortArrayByNameProperty);
  new_record.fields.sort(Helper.sortArrayByNameProperty);
  for(let i = 0; i < old_record_and_database.fields.length; i++) {
    if(!recordfieldsEqual(old_record_and_database.fields[i], new_record.fields[i], uuid_mapper)) {
      return false;
    }
  }
  // TODO: probably need to sort this if this is actually gonna work
  for(let i = 0; i < old_record_and_database.records.length; i++) {
    if(!compareOldAndNewDatabaseAndRecord(old_record_and_database.records[i], new_dataset.related_datasets[i], new_record.related_records[i], uuid_mapper)) {
      return false;
    }
  }

  return true;
}

const importDatasetsRecordsTest = async (datasets_and_records, curr_user) => {
  let uuid_mapper = {};
  let response = await importCombinedDatasetsAndRecords(datasets_and_records, curr_user);
  expect(response.statusCode).toBe(200);
  let record_uuids = response.body.record_uuids;
  expect(record_uuids.length).toBe(datasets_and_records.length);
  for(let i = 0; i < datasets_and_records.length; i++) {

    let new_record_uuid = record_uuids[i];
    let response = await Helper.recordDraftGet(new_record_uuid, curr_user);
    expect(response.statusCode).toBe(200);
    let new_record = response.body;
    let new_dataset_uuid = new_record.dataset_uuid;
    response = await Helper.datasetLatestPersisted(new_dataset_uuid, curr_user);
    expect(response.statusCode).toBe(200);
    let new_dataset = response.body;
    let old_record_and_database = datasets_and_records[i];

    compareOldAndNewDatabaseAndRecord(old_record_and_database, new_dataset, new_record, uuid_mapper);
  }
}

const sanitizeInputDatasetsAndRecords = (input_datasets_and_records) => {
  let output_datasets_and_records = [];
  for(let record of input_datasets_and_records) {
    if(record.template_uuid == "") {
      continue;
    }
    record.records = sanitizeInputDatasetsAndRecords(record.records);
    output_datasets_and_records.push(record);
  }
  return output_datasets_and_records;
}

const reformatInputRecordField = (input_field) => {
  input_field.name = input_field.field_name;
  // delete input_field.field_name;
  if(!input_field.name) {
    input_field.name = "";
  }

  input_field.uuid = input_field.field_uuid;
  // delete input_field.field_uuid;
}

const reformatInputRecord = (input_record) => {
  input_record.name = input_record.record_name;
  // delete input_record.record_name;
  if(!input_record.name) {
    input_record.name = "";
  }

  input_record.related_records = input_record.records;
  // delete input_record.records;
  if(!input_record.related_records) {
    input_record.related_records = [];
  }

  if(!input_record.fields) {
    input_record.fields = [];
  }

  input_record.uuid = input_record.record_uuid;
  // delete input_record.record_uuid;

  input_record.dataset_uuid = input_record.database_uuid;
  // delete input_record.database_uuid;

  for(let field of input_record.fields) {
    reformatInputRecordField(field);
  }
  for(let related_record of input_record.related_records) {
    reformatInputRecord(related_record);
  }
}

const importRecords = async (records, curr_user) => {
  return await request(app)
    .post(`/import/records/`)
    .set('Cookie', [`user=${curr_user}`])
    .send({records})
    .set('Accept', 'application/json');
}

const testOldAndNewFieldEqual = (old_field, new_field, uuid_mapper) => {
  if(old_field.uuid in uuid_mapper) {
    expect(new_field.uuid).toEqual(uuid_mapper[old_field.uuid])
  } else {
    uuid_mapper[old_field.uuid] = new_field.uuid
  }
  expect(new_field.name).toEqual(old_field.name);
  if(typeof(old_field.value) == 'string') {
    expect(new_field.value).toEqual(old_field.value);
  } else {
    if(Array.isArray(old_field.value)) {
      for(let i = 0; i < old_field.value.length; i++) {
        expect(new_field.values[i].name).toEqual(old_field.value[i].name);
      }
    } else if(!old_field.value) {
      expect(new_field.value).toBeFalsy();
    }else {
      expect(new_field.value).toEqual(old_field.value);
    }
  }
}

const testOldAndNewRecordEqual = (old_record, new_record, uuid_mapper) => {
  // Check record_uuid
  if(old_record.uuid in uuid_mapper) {
    expect(new_record.uuid).toEqual(uuid_mapper[old_record.uuid]);
  } else {
    uuid_mapper[old_record.uuid] = new_record.uuid;
  }
  // Check dataset uuid
  if(old_record.dataset_uuid in uuid_mapper) {
    expect(new_record.dataset_uuid).toEqual(uuid_mapper[old_record.dataset_uuid]);
  } else {
    uuid_mapper[old_record.dataset_uuid] = new_record.dataset_uuid;
  }

  if(!old_record.fields) {
    old_record.fields = []
  }
  if(!old_record.records) {
    old_record.records = []
  }

  expect(typeof(old_record.fields)).toEqual(typeof(new_record.fields));
  // the case where the input record doesn't include a field the template requires and thus inserts automatically
  expect(new_record.fields.length).toBeGreaterThanOrEqual(old_record.fields.length);
  expect(new_record.related_records.length).toBe(old_record.related_records.length);

  // Create a map of new field uuid -> new field
  let new_record_field_map = {};
  for(field of new_record.fields) {
    new_record_field_map[field.name] = field;
  }
  for(let old_field of old_record.fields) {
    testOldAndNewFieldEqual(old_field, new_record_field_map[old_field.name], uuid_mapper);
  }

  // TODO: I think I need to create a map. I can't sort by name property. Some records have the same name
  // But how do I create a map? I should probably have a link from the new record to the old record uuid
  // And do the same for templates and datasets and such
  for(let related_record of old_record.records) {
    related_record.name = related_record.record_name;
  }
  old_record.related_records.sort(Helper.sortArrayByNameProperty);
  new_record.related_records.sort(Helper.sortArrayByNameProperty);

  for(let i = 0; i < old_record.related_records.length; i++) {
    testOldAndNewRecordEqual(old_record.related_records[i], new_record.related_records[i], uuid_mapper)
  }
}

const importRecordsTest = async (records, curr_user) => {

  let uuid_mapper = {};
  let response = await importRecords(records, curr_user);
  expect(response.statusCode).toBe(200);
  let record_uuids = response.body.record_uuids;
  expect(record_uuids.length).toBe(records.length);

  for(let record of records) {
    reformatInputRecord(record);
  }
  
  for(let i = 0; i < records.length; i++) {

    let new_record_uuid = record_uuids[i];
    let new_record = await Helper.recordDraftGetAndTest(new_record_uuid, curr_user);
    let old_record = records[i];

    testOldAndNewRecordEqual(old_record, new_record, uuid_mapper);
  }

  return record_uuids;
}

const importRecordsPersistTest = async (records, curr_user) => {

  let record_uuids = await importRecordsTest(records, curr_user);
  let persisted_records = [];
  for(let record_uuid of record_uuids) {
    persisted_records.push(await Helper.recordPersistAndFetch(record_uuid, curr_user));
  }
  return persisted_records;
}


describe("template", () => {

  describe("success", () => {

    test("basic", async () => {
      let template = {
        template_uuid: "1", 
        name: "naruto", 
        description: "awesome", 
        updated_at: (new Date()).toISOString(),
        fields: [],
        related_databases: []
      };
      let response = await importTemplate(template, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let uuid = response.body.new_uuid;
  
      let new_template = await Helper.templateDraftGetAndTest(uuid, Helper.DEF_CURR_USER);
      testTemplatesEqual(template, new_template, {});
    });
  
    test("includes fields and related databases 1 level deep", async () => {
      let name = "";
      let description = "";
      let updated_at = (new Date()).toISOString();
      let template = {
        template_uuid: "t1", 
        name, description, updated_at,
        fields: [{
          template_field_uuid: "t1f1",
          name, description, updated_at
        }],
        related_databases: [{
          template_uuid: "t1.1",
          name, description, updated_at
        }]
      };
      let response = await importTemplate(template, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let uuid = response.body.new_uuid;
  
      let new_template = await Helper.templateDraftGetAndTest(uuid, Helper.DEF_CURR_USER);
      testTemplatesEqual(template, new_template, {});
    });

    test("multiple fields and related databases", async () => {
      let template_uuid = "t1";
      let related_template_uuid_1 = "t1.1";
      let related_template_uuid_2 = "t1.2";
      let field_uuid_1 = "t1f1";
      let field_uuid_2 = "t1f2";

      let template = {
        template_uuid, 
        fields: [
          {template_field_uuid: field_uuid_1, name: field_uuid_1},
          {template_field_uuid: field_uuid_2, name: field_uuid_2}
        ],
        related_databases: [
          {template_uuid: related_template_uuid_1, name: related_template_uuid_1},
          {template_uuid: related_template_uuid_2, name: related_template_uuid_2}
        ]
      };
      await importTemplatePersistAndTest(template, Helper.DEF_CURR_USER);
    });
  
    test("includes fields and related databases 2 levels deed", async () => {
      let name = "";
      let description = "";
      let updated_at = (new Date()).toISOString();
      let template = {
        template_uuid: "t1", 
        name, description, updated_at,
        fields: [{
          template_field_uuid: "t1f1",
          name, description, updated_at
        }],
        related_databases: [{
          template_uuid: "t1.1",
          name, description, updated_at,
          fields: [{
            template_field_uuid: "t1.1f1",
            name, description, updated_at
          }],
          related_databases: [{
            template_uuid: "t1.1.1", 
            name, description, updated_at
          }]
        }]
      };
      let response = await importTemplate(template, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let uuid = response.body.new_uuid;
  
      let new_template = await Helper.templateDraftGetAndTest(uuid, Helper.DEF_CURR_USER);
      testTemplatesEqual(template, new_template, {});
    });
  
    test("can import same template and field a second time as long as you have edit permissions", async () => {
      let template = {
        template_uuid: "t1", 
        name: "naruto", 
        description: "awesome", 
        updated_at: (new Date()).toISOString(),
        fields: [{
          template_field_uuid: "t1f1",
          name: "hi",
          description: "hello"
        }],
        related_databases: []
      };
  
      // Import first time
  
      let response = await importTemplate(template, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let uuid = response.body.new_uuid;
  
      let new_template = await Helper.templateDraftGetAndTest(uuid, Helper.DEF_CURR_USER);
      testTemplatesEqual(template, new_template, {});
  
      // Import second time
    
      response = await importTemplate(template, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let uuid2 = response.body.new_uuid;

      expect(uuid).toEqual(uuid2);

      let new_template_2 = await Helper.templateDraftGetAndTest(uuid, Helper.DEF_CURR_USER);
      testTemplatesEqual(template, new_template_2, {});
    })

    test("field has options to pick from", async () => {
      let template_uuid = "t1";
      let field_uuid = "t1f1"

      let template = {
        template_uuid, 
        name: "naruto", 
        description: "awesome", 
        updated_at: (new Date()).toISOString(),
        fields: [
          {
            template_field_uuid: field_uuid,
            radio_options: [
              {template_radio_option_uuid: "toad", name: "toad"}
            ]
          }
        ]
      };
      await importTemplatePersistAndTest(template, Helper.DEF_CURR_USER);

      template = {
        template_uuid, 
        name: "naruto", 
        description: "awesome", 
        updated_at: (new Date()).toISOString(),
        fields: [
          {
            template_field_uuid: field_uuid,
            radio_options: [
              {template_radio_option_uuid: "toad", name: "toad"},
              {name: "ninjuitsu", radio_options: [
                {
                  name: 'sexy jiutsu', template_radio_option_uuid: "sexy jiutsu"
                }
              ]}
            ]
          }
        ]
      };
      await importTemplatePersistAndTest(template, Helper.DEF_CURR_USER);
    });
  
    test("import template with real data", async () => {
      let rawdata = fs.readFileSync(__dirname + '/test_data/template.txt');
      let old_template = JSON.parse(rawdata);
    
      let response = await importTemplate(old_template, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let uuid = response.body.new_uuid;
    
      let new_template = await Helper.templateDraftGetAndTest(uuid, Helper.DEF_CURR_USER);
    
      testTemplatesEqual(old_template, new_template, {});
    
      // cleanseInputTemplate(old_template);
      // expect(new_template).toMatchObject(old_template);
    
      // Helper.templateCleanseMetadata(new_template);
      // let persisted_template = await Helper.templatePersistAndFetch(new_template.uuid, Helper.DEF_CURR_USER);
      // expect(persisted_template).toMatchObject(new_template);
    });

  });

  describe("failure", () => {

    const failureTest = async (template, curr_user, responseCode) => {
      let response = await importTemplate(template, curr_user);
      expect(response.statusCode).toBe(responseCode);
    };

    test("Input must be an object", async () => {
      let template = [];
      await failureTest(template, Helper.DEF_CURR_USER, 400);
    });

    test("Template must include a template_uuid, which is a string", async () => {
      let template = {};
      await failureTest(template, Helper.DEF_CURR_USER, 400);

      template = {template_uuid: 5};
      await failureTest(template, Helper.DEF_CURR_USER, 400);
    });

    test("Must have edit permissions to import a second time", async () => {
      let template = {
        template_uuid: "1", 
        name: "naruto", 
        description: "awesome", 
        updated_at: (new Date()).toISOString(),
        fields: [],
        related_databases: []
      };
  
      // Import first time
  
      let response = await importTemplate(template, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let uuid = response.body.new_uuid;
  
      let new_template = await Helper.templateDraftGetAndTest(uuid, Helper.DEF_CURR_USER);
      testTemplatesEqual(template, new_template, {});
  
      // Import second time
  
      await failureTest(template, Helper.USER_2, 401);
    });

    test("Fields and related_templates must be arrays", async () => {
      let invalidFields = {
        template_uuid: "1",
        fields: ""
      };
      let invalidRelatedTemplates = {
        template_uuid: "2",
        related_databases: {}
      };
      await failureTest(invalidFields, Helper.DEF_CURR_USER, 400);
      await failureTest(invalidRelatedTemplates, Helper.DEF_CURR_USER, 400);
    });

    test("Each of fields and related_templates must be valid", async () => {
      let invalidFields = { 
        template_uuid: "1",
        "fields": [
          { 
            "name": 5
          }
        ]
      };
      let invalidRelatedTemplates = { 
        template_uuid: "1",
        "related_databases": [
          { 
            "name": 5
          }
        ]
      };
      await failureTest(invalidFields, Helper.DEF_CURR_USER, 400);
      await failureTest(invalidRelatedTemplates, Helper.DEF_CURR_USER, 400);
    });

  });

});

describe("template and dataset", () => {

  describe("success", () => {

    test("basic", async () => {
      let template = {
        template_uuid: "1", 
        name: "naruto", 
        description: "awesome", 
        updated_at: (new Date()).toISOString(),
        fields: [],
        related_databases: []
      };
      await importTemplateDatasetTest(template, Helper.DEF_CURR_USER);
    });
  
    test("includes fields and related databases 1 level deep", async () => {
      let name = "";
      let description = "";
      let updated_at = (new Date()).toISOString();
      let template = {
        template_uuid: "t1", 
        name, description, updated_at,
        fields: [{
          template_field_uuid: "t1f1",
          name, description, updated_at
        }],
        related_databases: [{
          template_uuid: "t1.1",
          name, description, updated_at
        }]
      };
      await importTemplateDatasetTest(template, Helper.DEF_CURR_USER);
    });

    test("multiple fields and related databases", async () => {
      let template_uuid = "t1";
      let related_template_uuid_1 = "t1.1";
      let related_template_uuid_2 = "t1.2";
      let field_uuid_1 = "t1f1";
      let field_uuid_2 = "t1f2";

      let template = {
        template_uuid, 
        fields: [
          {template_field_uuid: field_uuid_1, name: field_uuid_1},
          {template_field_uuid: field_uuid_2, name: field_uuid_2}
        ],
        related_databases: [
          {template_uuid: related_template_uuid_1, name: related_template_uuid_1},
          {template_uuid: related_template_uuid_2, name: related_template_uuid_2}
        ]
      };
      await importTemplateDatasetTest(template, Helper.DEF_CURR_USER);
    });
  
    test("includes fields and related databases 2 levels deed", async () => {
      let name = "";
      let description = "";
      let updated_at = (new Date()).toISOString();
      let template = {
        template_uuid: "t1", 
        name, description, updated_at,
        fields: [{
          template_field_uuid: "t1f1",
          name, description, updated_at
        }],
        related_databases: [{
          template_uuid: "t1.1",
          name, description, updated_at,
          fields: [{
            template_field_uuid: "t1.1f1",
            name, description, updated_at
          }],
          related_databases: [{
            template_uuid: "t1.1.1", 
            name, description, updated_at
          }]
        }]
      };
      await importTemplateDatasetTest(template, Helper.DEF_CURR_USER);
    });
  
    test("can import same template/dataset and field a second time as long as you have edit permissions", async () => {
      let template = {
        template_uuid: "t1", 
        name: "naruto", 
        description: "awesome", 
        updated_at: (new Date()).toISOString(),
        fields: [{
          template_field_uuid: "t1f1",
          name: "hi",
          description: "hello"
        }],
        related_databases: []
      };
  
      // Import first time

      let template_1, dataset_1;
      [template_1, dataset_1] = await importTemplateDatasetTest(template, Helper.DEF_CURR_USER);
  
      // Import second time

      template.description = "new description";
    
      let template_2, dataset_2;
      [template_2, dataset_2] = await importTemplateDatasetTest(template, Helper.DEF_CURR_USER);

      expect(template_2.uuid).toEqual(template_1.uuid);
      expect(dataset_2.uuid).toEqual(dataset_1.uuid);
    })

    test("field has options to pick from", async () => {
      let template_uuid = "t1";
      let field_uuid = "t1f1"

      let template = {
        template_uuid, 
        name: "naruto", 
        description: "awesome", 
        updated_at: (new Date()).toISOString(),
        fields: [
          {
            template_field_uuid: field_uuid,
            radio_options: [
              {template_radio_option_uuid: "toad", name: "toad"}
            ]
          }
        ]
      };
      await importTemplateDatasetTest(template, Helper.DEF_CURR_USER);

      template = {
        template_uuid, 
        name: "naruto", 
        description: "awesome", 
        updated_at: (new Date()).toISOString(),
        fields: [
          {
            template_field_uuid: field_uuid,
            radio_options: [
              {template_radio_option_uuid: "toad", name: "toad"},
              {name: "ninjuitsu", radio_options: [
                {
                  name: 'sexy jiutsu', template_radio_option_uuid: "sexy jiutsu"
                }
              ]}
            ]
          }
        ]
      };
      await importTemplateDatasetTest(template, Helper.DEF_CURR_USER);
    });

    test("includes subscribed template", async () => {
      let name = "";
      let description = "";
      let updated_at = (new Date()).toISOString();
      let template = {
        template_uuid: "t1", 
        name, description, updated_at,
        related_databases: [{
          template_uuid: "t1.1",
          subscribed: true,
          name, description, updated_at
        }]
      };
      await importTemplateDatasetTest(template, Helper.DEF_CURR_USER);

      template.name = "name";
      await importTemplateDatasetTest(template, Helper.DEF_CURR_USER);
    });

    test("import template with link to an isLink template, aka we don't have edit permissions to it", async () => {
      let name = "";
      let description = "";
      let updated_at = (new Date()).toISOString();

      let related_template_uuid = "t1.1";
      let related_template = {
        template_uuid: related_template_uuid, 
        name, description, updated_at
      };
      let new_related_template, new_related_dataset;
      [new_related_template, new_related_dataset] = await importTemplateDatasetPersistTest(related_template, Helper.USER_2);
      await Helper.testAndExtract(Helper.updatePermissionGroup, Helper.USER_2, new_related_template.uuid, PERMISSION_VIEW, [Helper.DEF_CURR_USER]);
      await Helper.testAndExtract(Helper.updatePermissionGroup, Helper.USER_2, new_related_dataset.uuid, PERMISSION_VIEW, [Helper.DEF_CURR_USER]);

      let template = {
        template_uuid: "t1", 
        name, description, updated_at,
        related_databases: [{
          template_uuid: related_template_uuid,
          name, description, updated_at
        }]
      };
      await importTemplateDatasetTest(template, Helper.DEF_CURR_USER);

      template.name = "name";
      await importTemplateDatasetTest(template, Helper.DEF_CURR_USER);
    });

  });

  test("import chemin template", async () => {
    let rawdata = fs.readFileSync(__dirname + '/test_data/chemin_template.json');
    let old_template = JSON.parse(rawdata);
  
    await importTemplateDatasetTest(old_template, Helper.DEF_CURR_USER);
  });

  test("import rruff template", async () => {
    let rruff_imalist_template_raw_data = fs.readFileSync(__dirname + '/test_data/rruff_imalist_template.json');
    let imalist_template = JSON.parse(rruff_imalist_template_raw_data);
    let ima_list_template, ima_list_dataset;
    [ima_list_template, ima_list_dataset] = await importTemplateDatasetPersistTest(imalist_template, Helper.USER_2);

    await Helper.testAndExtract(Helper.updatePermissionGroup, Helper.USER_2, ima_list_template.uuid, PERMISSION_VIEW, [Helper.DEF_CURR_USER]);
    await Helper.testAndExtract(Helper.updatePermissionGroup, Helper.USER_2, ima_list_dataset.uuid, PERMISSION_VIEW, [Helper.DEF_CURR_USER]);

    let rawdata = fs.readFileSync(__dirname + '/test_data/rruff_sample_template.json');
    let old_template = JSON.parse(rawdata);
    await importTemplateDatasetTest(old_template, Helper.DEF_CURR_USER);
  });

});

describe("records", () => {

  describe("success", () => {

    test("basic - no fields or related records", async () => {
      let template_uuid = "t1";
      let template = {
        template_uuid, 
        name: "naruto", 
        description: "awesome", 
        updated_at: (new Date()).toISOString(),
        fields: [],
        related_databases: []
      };

      await importTemplateDatasetPersistTest(template, Helper.DEF_CURR_USER);

      let record = {
        record_uuid: "r1",
        database_uuid: template_uuid,
        fields: [],
        records: []
      };
      await importRecordsTest([record], Helper.DEF_CURR_USER);
    });

    test("one field and one related record", async () => {
      let template_uuid = "t1";
      let related_template_uuid = "t1.1";
      let field_uuid = "t1f1";

      let template = {
        template_uuid, 
        name: "naruto", 
        description: "awesome", 
        updated_at: (new Date()).toISOString(),
        fields: [{
          template_field_uuid: field_uuid
        }],
        related_databases: [{
          template_uuid: related_template_uuid,
          name: "sasuke"
        }]
      };
      await importTemplateDatasetPersistTest(template, Helper.DEF_CURR_USER);

      let record = {
        record_uuid: "r1",
        database_uuid: template_uuid,
        fields: [{
          template_field_uuid: field_uuid,
          value: "peach"
        }],
        records: [{
          record_uuid: "r1.1",
          database_uuid: related_template_uuid
        }]
      };
      await importRecordsTest([record], Helper.DEF_CURR_USER);
    });

    test("multiple fields and multiple related records", async () => {
      let template_uuid = "t1";
      let related_template_uuid_1 = "t1.1";
      let related_template_uuid_2 = "t1.2";
      let field_uuid_1 = "t1f1";
      let field_uuid_2 = "t1f2";

      let template = {
        template_uuid, 
        fields: [
          {template_field_uuid: field_uuid_1, name: field_uuid_1},
          {template_field_uuid: field_uuid_2, name: field_uuid_2}
        ],
        related_databases: [
          {template_uuid: related_template_uuid_1, name: related_template_uuid_1},
          {template_uuid: related_template_uuid_2, name: related_template_uuid_2}
        ]
      };
      await importTemplateDatasetPersistTest(template, Helper.DEF_CURR_USER);

      let record = {
        record_uuid: "r1",
        database_uuid: template_uuid,
        fields: [
          {field_name: field_uuid_1, field_uuid: field_uuid_1, value: "peach"},
          {field_name: field_uuid_2, field_uuid: field_uuid_2, value: "daisy"}
        ],
        records: [
          {record_uuid: "r1.1", database_uuid: related_template_uuid_1},
          {record_uuid: "r1.2", database_uuid: related_template_uuid_2}
        ]
      };
      await importRecordsTest([record], Helper.DEF_CURR_USER);
    });

    test("shared related_records", async () => {
      let template_uuid = "t1";
      let shared_related_template_uuid = "organization";

      let template = {
        template_uuid, 
        related_databases: [{
          template_uuid: shared_related_template_uuid, 
          name: shared_related_template_uuid
        }]
      };
      await importTemplateDatasetPersistTest(template, Helper.DEF_CURR_USER);

      let record = {
        record_uuid: "r1",
        database_uuid: template_uuid,
        records: [
          {record_uuid: "r1.1", database_uuid: shared_related_template_uuid},
          {record_uuid: "r1.2", database_uuid: shared_related_template_uuid}
        ]
      };
      await importRecordsTest([record], Helper.DEF_CURR_USER);
    });

    test("related records going 2 levels deep", async () => {
      let template_1_uuid = "t1";
      let template_11_uuid = "t1.1";
      let template_111_uuid = "t1.1.1";

      let template = {
        template_uuid: template_1_uuid, 
        related_databases: [{
          template_uuid: template_11_uuid,
          related_databases: [{
            template_uuid: template_111_uuid
          }]
        }]
      };
      await importTemplateDatasetPersistTest(template, Helper.DEF_CURR_USER);

      let record = {
        record_uuid: "r1",
        database_uuid: template_1_uuid,
        records: [{
          record_uuid: "r1.1",
          database_uuid: template_11_uuid,
          records: [{
            record_uuid: "r1.1.1",
            database_uuid: template_111_uuid,
          }]
        }]
      };
      await importRecordsTest([record], Helper.DEF_CURR_USER);
    });

    test("field has options to pick from. Can pick nested or non-nested option, or both, or none", async () => {
      let template_uuid = "t1";
      let field_uuid = "t1f1";

      let option_uuid_1 = "toad";
      let option_uuid_2 = "sexy jiutsu";

      let template = {
        template_uuid, 
        name: "naruto", 
        description: "awesome", 
        updated_at: (new Date()).toISOString(),
        fields: [
          {
            template_field_uuid: field_uuid,
            radio_options: [
              {template_radio_option_uuid: option_uuid_1, name: option_uuid_1},
              {name: "ninjuitsu", radio_options: [
                {
                  name: option_uuid_2, template_radio_option_uuid: option_uuid_2
                }
              ]}
            ]
          }
        ]
      };
      await importTemplateDatasetPersistTest(template, Helper.DEF_CURR_USER);

      let record = {
        record_uuid: "r1",
        database_uuid: template_uuid,
        fields: [{
          field_uuid: field_uuid,
          value: [{name: option_uuid_1, template_radio_option_uuid: option_uuid_1}]
        }]
      };
      await importRecordsTest([record], Helper.DEF_CURR_USER);

      record = {
        record_uuid: "r1",
        database_uuid: template_uuid,
        fields: [{
          field_uuid: field_uuid,
          value: [{name: option_uuid_2, template_radio_option_uuid: option_uuid_2}]
        }]
      };
      await importRecordsTest([record], Helper.DEF_CURR_USER);

      record = {
        record_uuid: "r1",
        database_uuid: template_uuid,
        fields: [{
          field_uuid: field_uuid,
          value: [
            {name: option_uuid_1, template_radio_option_uuid: option_uuid_1},
            {name: option_uuid_2, template_radio_option_uuid: option_uuid_2}
          ]
        }]
      };
      await importRecordsTest([record], Helper.DEF_CURR_USER);

      record = {
        record_uuid: "r1",
        database_uuid: template_uuid,
        fields: [{
          field_uuid: field_uuid
        }]
      };
      await importRecordsTest([record], Helper.DEF_CURR_USER);
    });

    test("import multiple records at once", async () => {
      let template_uuid = "t1";
      let template = {
        template_uuid, 
        name: "naruto", 
        description: "awesome", 
        updated_at: (new Date()).toISOString(),
        fields: [],
        related_databases: []
      };
      await importTemplateDatasetPersistTest(template, Helper.DEF_CURR_USER);

      let records = [
        {
          record_uuid: "r1",
          database_uuid: template_uuid,
          fields: [],
          records: []
        },
        {
          record_uuid: "r2",
          database_uuid: template_uuid,
          fields: [],
          records: []
        } 
      ];
      await importRecordsTest(records, Helper.DEF_CURR_USER);
    });

    test("If dataset/record doesn't supply a related_dataset for a related_template, we provide one", async () => {
      let template_uuid = "t1";
      let related_template_uuid = "t1.1";
      let field_uuid = "t1f1";

      let template = {
        template_uuid, 
        name: "naruto", 
        description: "awesome", 
        updated_at: (new Date()).toISOString(),
        fields: [{
          template_field_uuid: field_uuid
        }],
        related_databases: [{
          template_uuid: related_template_uuid,
          name: "sasuke"
        }]
      };
      await importTemplateDatasetPersistTest(template, Helper.DEF_CURR_USER);

      let record = {
        record_uuid: "r1",
        database_uuid: template_uuid,
        fields: [
          {
            field_uuid: field_uuid,
            value: "peach"
          }
        ],
        records: []
      };
      await importRecordsTest([record], Helper.DEF_CURR_USER);
    });

    test("includes subscribed template", async () => {
      let name = "";
      let description = "";
      let updated_at = (new Date()).toISOString();

      let parent_template_uuid = "t1";
      let child_template_uuid = "t1.1";

      let template = {
        template_uuid: parent_template_uuid, 
        name, description, updated_at,
        related_databases: [{
          template_uuid: child_template_uuid,
          subscribed: true,
          name, description, updated_at
        }]
      };
      await importTemplateDatasetPersistTest(template, Helper.DEF_CURR_USER);

      let record = {
        record_uuid: "r1",
        database_uuid: parent_template_uuid,
        records: [{
          record_uuid: "r1.1",
          database_uuid: child_template_uuid,
          records: []
        }]
      };
      await importRecordsTest([record], Helper.DEF_CURR_USER);
    });

    test("import records with links to records we only have view permissions to", async () => {
      let name = "";
      let description = "";
      let updated_at = (new Date()).toISOString();

      let related_template_uuid = "t1.1";
      let related_template = {
        template_uuid: related_template_uuid, 
        name, description, updated_at
      };
      let new_related_template, new_related_dataset;
      [new_related_template, new_related_dataset] = await importTemplateDatasetPersistTest(related_template, Helper.USER_2);
      await Helper.testAndExtract(Helper.updatePermissionGroup, Helper.USER_2, new_related_template.uuid, PERMISSION_VIEW, [Helper.DEF_CURR_USER]);
      await Helper.testAndExtract(Helper.updatePermissionGroup, Helper.USER_2, new_related_dataset.uuid, PERMISSION_VIEW, [Helper.DEF_CURR_USER]);

      let related_record = {
        record_uuid: "r1.1", 
        database_uuid: related_template_uuid
      };
      // TODO: get the record out of this test, publish it, give view permissions to it, and then import a parent record linking it
      await importRecordsPersistTest([related_record], Helper.USER_2);

      let template_uuid = "t1";
      let template = {
        template_uuid: template_uuid, 
        name, description, updated_at,
        related_databases: [{
          template_uuid: related_template_uuid,
          name, description, updated_at
        }]
      };
      await importTemplateDatasetPersistTest(template, Helper.DEF_CURR_USER);

      let record = {
        record_uuid: "r1",
        database_uuid: template_uuid,
        records: [related_record]
      };

      await importRecordsPersistTest([record], Helper.DEF_CURR_USER);

    });

  });

  test("with Chemin data", async () => {

    let raw_template = fs.readFileSync(__dirname + '/test_data/chemin_template.json');
    let old_template = JSON.parse(raw_template);
  
    await importTemplateDatasetPersistTest(old_template, Helper.DEF_CURR_USER);

    let raw_records = fs.readFileSync(__dirname + '/test_data/chemin_data.json');
    let old_records = JSON.parse(raw_records).records;

    await importRecordsTest(old_records, Helper.DEF_CURR_USER);
  });

  // TODO: the user should only have VIEW access to the ima-list template, dataset and record
  test("with rruff data", async () => {

    let raw_template = fs.readFileSync(__dirname + '/test_data/rruff_sample_template.json');
    let old_template = JSON.parse(raw_template);
  
    await importTemplateDatasetPersistTest(old_template, Helper.DEF_CURR_USER);

    let raw_records = fs.readFileSync(__dirname + '/test_data/rruff_samples.json');
    let old_records = JSON.parse(raw_records).records;

    await importRecordsTest(old_records, Helper.DEF_CURR_USER);
  });

  describe("failure", () => {

    const failureTest = async (records, curr_user, responseCode) => {
      let response = await importRecords(records, curr_user);
      expect(response.statusCode).toBe(responseCode);
    };

    test("Input must be a list", async () => {
      let records = {};
      await failureTest(records, Helper.DEF_CURR_USER, 400);
    });

    test("Record must include a database_uuid and a record_uuid, which are strings", async () => {
      let template_uuid = "t1";
      let template = {
        template_uuid, 
        name: "naruto", 
        description: "awesome", 
        updated_at: (new Date()).toISOString(),
        fields: [],
        related_databases: []
      };
      await importTemplateDatasetPersistTest(template, Helper.DEF_CURR_USER);

      let record = {
        database_uuid: template_uuid,
        fields: [],
        records: []
      };
      await failureTest([record], Helper.DEF_CURR_USER, 400);

      record = {
        record_uuid: "r1",
        fields: [],
        records: []
      };
      await failureTest([record], Helper.DEF_CURR_USER, 400);

    });

    test("Record must reference a valid database_uuid, which has already been imported", async () => {
      let template_uuid = "t1";

      let record = {
        record_uuid: "r1",
        database_uuid: template_uuid,
        fields: [],
        records: []
      };
      await failureTest([record], Helper.DEF_CURR_USER, 400);
    });

    test("Database/record format must match the format of the template", async () => {
      let template_uuid = "t1";
      let related_template_uuid = "t1.1";
      let field_uuid = "t1f1";

      let template = {
        template_uuid, 
        name: "naruto", 
        description: "awesome", 
        updated_at: (new Date()).toISOString(),
        fields: [{
          template_field_uuid: field_uuid
        }],
        related_databases: [{
          template_uuid: related_template_uuid,
          name: "sasuke"
        }]
      };
      await importTemplateDatasetPersistTest(template, Helper.DEF_CURR_USER);

      let record = {
        record_uuid: "r1",
        database_uuid: template_uuid,
        fields: [
          {
            template_field_uuid: field_uuid,
            value: "peach"
          },
          {
            template_field_uuid: field_uuid,
            value: "peach"
          }
        ],
        records: [{
          record_uuid: "r1.1",
          database_uuid: related_template_uuid
        }]
      };
      await failureTest([record], Helper.DEF_CURR_USER, 400);

      record = {
        record_uuid: "r1",
        database_uuid: template_uuid,
        fields: [
          {
            template_field_uuid: field_uuid,
            value: "peach"
          }
        ],
        records: [
          {
            record_uuid: "r1.1",
            database_uuid: related_template_uuid
          },
          {
            record_uuid: "r1.1",
            database_uuid: related_template_uuid
          }
        ]
      };
      await failureTest([record], Helper.DEF_CURR_USER, 400);
    });

    test("field has options to pick from. Option picked must be valid", async () => {
      let template_uuid = "t1";
      let field_uuid = "t1f1";

      let option_uuid_1 = "toad";
      let option_uuid_2 = "sexy jiutsu";

      let template = {
        template_uuid, 
        name: "naruto", 
        description: "awesome", 
        updated_at: (new Date()).toISOString(),
        fields: [
          {
            template_field_uuid: field_uuid,
            radio_options: [
              {template_radio_option_uuid: option_uuid_1, name: option_uuid_1},
              {name: "ninjuitsu", radio_options: [
                {
                  name: option_uuid_2, template_radio_option_uuid: option_uuid_2
                }
              ]}
            ]
          }
        ]
      };
      await importTemplateDatasetPersistTest(template, Helper.DEF_CURR_USER);

      let record = {
        record_uuid: "r1",
        database_uuid: template_uuid,
        fields: [{
          template_field_uuid: field_uuid,
          value: [{template_radio_option_uuid: "invalid"}]
        }]
      };
      await failureTest([record], Helper.DEF_CURR_USER, 400);

      record = {
        record_uuid: "r1",
        database_uuid: template_uuid,
        fields: [{
          template_field_uuid: field_uuid,
          value: [{template_radio_option_uuid: option_uuid_2}, {template_radio_option_uuid: "invalid"}]
        }]
      };
      await failureTest([record], Helper.DEF_CURR_USER, 400);
    });

  });
});




// describe("comebineddatasetsandrecords", () => {

//   describe("success", () => {

//     test("basic - no fields or related datasets/records", async () => {
//       let template_uuid = "t1";
//       let template = {
//         template_uuid, 
//         name: "naruto", 
//         description: "awesome", 
//         updated_at: (new Date()).toISOString(),
//         fields: [],
//         related_databases: []
//       };
//       await importTemplatePersistAndTest(template, Helper.DEF_CURR_USER);

//       let record = {
//         record_uuid: "r1",
//         database_uuid: "d1",
//         template_uuid,
//         fields: [],
//         records: []
//       };
//       await importDatasetsRecordsTest([record], Helper.DEF_CURR_USER);
//     });

//     test("one field and one related dataset/record", async () => {
//       let template_uuid = "t1";
//       let related_template_uuid = "t1.1";
//       let field_uuid = "t1f1";

//       let template = {
//         template_uuid, 
//         name: "naruto", 
//         description: "awesome", 
//         updated_at: (new Date()).toISOString(),
//         fields: [{
//           template_field_uuid: field_uuid
//         }],
//         related_databases: [{
//           template_uuid: related_template_uuid,
//           name: "sasuke"
//         }]
//       };
//       await importTemplatePersistAndTest(template, Helper.DEF_CURR_USER);

//       let record = {
//         record_uuid: "r1",
//         database_uuid: "d1",
//         template_uuid,
//         fields: [{
//           template_field_uuid: field_uuid,
//           value: "peach"
//         }],
//         records: [{
//           record_uuid: "r1.1",
//           database_uuid: "d1.1",
//           template_uuid: related_template_uuid
//         }]
//       };
//       await importDatasetsRecordsTest([record], Helper.DEF_CURR_USER);
//     });

//     test("multiple fields and multiple related dataset/record", async () => {
//       let template_uuid = "t1";
//       let related_template_uuid_1 = "t1.1";
//       let related_template_uuid_2 = "t1.2";
//       let field_uuid_1 = "t1f1";
//       let field_uuid_2 = "t1f2";

//       let template = {
//         template_uuid, 
//         fields: [
//           {template_field_uuid: field_uuid_1, name: field_uuid_1},
//           {template_field_uuid: field_uuid_2, name: field_uuid_2}
//         ],
//         related_databases: [
//           {template_uuid: related_template_uuid_1, name: related_template_uuid_1},
//           {template_uuid: related_template_uuid_2, name: related_template_uuid_2}
//         ]
//       };
//       await importTemplatePersistAndTest(template, Helper.DEF_CURR_USER);

//       let record = {
//         record_uuid: "r1",
//         database_uuid: "d1",
//         template_uuid,
//         fields: [
//           {template_field_uuid: field_uuid_1, value: "peach"},
//           {template_field_uuid: field_uuid_2, value: "daisy"}
//         ],
//         records: [
//           {record_uuid: "r1.1", database_uuid: "d1.1", template_uuid: related_template_uuid_1},
//           {record_uuid: "r1.2", database_uuid: "d1.2", template_uuid: related_template_uuid_2}
//         ]
//       };
//       await importDatasetsRecordsTest([record], Helper.DEF_CURR_USER);
//     });

//     test("related datasets/records going 2 levels deep", async () => {
//       let template_1_uuid = "t1";
//       let template_11_uuid = "t1.1";
//       let template_111_uuid = "t1.1.1";

//       let template = {
//         template_uuid: template_1_uuid, 
//         related_databases: [{
//           template_uuid: template_11_uuid,
//           related_databases: [{
//             template_uuid: template_111_uuid
//           }]
//         }]
//       };
//       await importTemplatePersistAndTest(template, Helper.DEF_CURR_USER);

//       let record = {
//         record_uuid: "r1",
//         database_uuid: "d1",
//         template_uuid: template_1_uuid,
//         records: [{
//           record_uuid: "r1.1",
//           database_uuid: "d1.1",
//           template_uuid: template_11_uuid,
//           records: [{
//             record_uuid: "r1.1.1",
//             database_uuid: "d1.1.1",
//             template_uuid: template_111_uuid,
//           }]
//         }]
//       };
//       await importDatasetsRecordsTest([record], Helper.DEF_CURR_USER);
//     });

//     test("field has options to pick from. Can pick nested or non-nested option, or both, or none", async () => {
//       let template_uuid = "t1";
//       let field_uuid = "t1f1";

//       let option_uuid_1 = "toad";
//       let option_uuid_2 = "sexy jiutsu";

//       let template = {
//         template_uuid, 
//         name: "naruto", 
//         description: "awesome", 
//         updated_at: (new Date()).toISOString(),
//         fields: [
//           {
//             template_field_uuid: field_uuid,
//             radio_options: [
//               {template_radio_option_uuid: option_uuid_1, name: option_uuid_1},
//               {name: "ninjuitsu", radio_options: [
//                 {
//                   name: option_uuid_2, template_radio_option_uuid: option_uuid_2
//                 }
//               ]}
//             ]
//           }
//         ]
//       };
//       await importTemplatePersistAndTest(template, Helper.DEF_CURR_USER);

//       let record = {
//         record_uuid: "r1",
//         database_uuid: "d1",
//         template_uuid,
//         fields: [{
//           template_field_uuid: field_uuid,
//           value: [{template_radio_option_uuid: option_uuid_1}]
//         }]
//       };
//       await importDatasetsRecordsTest([record], Helper.DEF_CURR_USER);

//       record = {
//         record_uuid: "r1",
//         database_uuid: "d1",
//         template_uuid,
//         fields: [{
//           template_field_uuid: field_uuid,
//           value: [{template_radio_option_uuid: option_uuid_2}]
//         }]
//       };
//       await importDatasetsRecordsTest([record], Helper.DEF_CURR_USER);

//       record = {
//         record_uuid: "r1",
//         database_uuid: "d1",
//         template_uuid,
//         fields: [{
//           template_field_uuid: field_uuid,
//           value: [
//             {template_radio_option_uuid: option_uuid_1},
//             {template_radio_option_uuid: option_uuid_2}
//           ]
//         }]
//       };
//       await importDatasetsRecordsTest([record], Helper.DEF_CURR_USER);

//       record = {
//         record_uuid: "r1",
//         database_uuid: "d1",
//         template_uuid,
//         fields: [{
//           template_field_uuid: field_uuid
//         }]
//       };
//       await importDatasetsRecordsTest([record], Helper.DEF_CURR_USER);
//     });

//     test("import multiple datasets/records at once", async () => {
//       let template_uuid = "t1";
//       let template = {
//         template_uuid, 
//         name: "naruto", 
//         description: "awesome", 
//         updated_at: (new Date()).toISOString(),
//         fields: [],
//         related_databases: []
//       };
//       await importTemplatePersistAndTest(template, Helper.DEF_CURR_USER);

//       let records = [
//         {
//           record_uuid: "r1",
//           database_uuid: "d1",
//           template_uuid,
//           fields: [],
//           records: []
//         },
//         {
//           record_uuid: "r2",
//           database_uuid: "d2",
//           template_uuid,
//           fields: [],
//           records: []
//         } 
//       ];
//       await importDatasetsRecordsTest(records, Helper.DEF_CURR_USER);
//     });

//     test("If dataset/record doesn't supply a related_dataset for a related_template, we provide one", async () => {
//       let template_uuid = "t1";
//       let related_template_uuid = "t1.1";
//       let field_uuid = "t1f1";

//       let template = {
//         template_uuid, 
//         name: "naruto", 
//         description: "awesome", 
//         updated_at: (new Date()).toISOString(),
//         fields: [{
//           template_field_uuid: field_uuid
//         }],
//         related_databases: [{
//           template_uuid: related_template_uuid,
//           name: "sasuke"
//         }]
//       };
//       await importTemplatePersistAndTest(template, Helper.DEF_CURR_USER);

//       let record = {
//         record_uuid: "r1",
//         database_uuid: "d1",
//         template_uuid,
//         fields: [
//           {
//             template_field_uuid: field_uuid,
//             value: "peach"
//           }
//         ],
//         records: []
//       };
//       await importDatasetsRecordsTest([record], Helper.DEF_CURR_USER);
//     });

//     test("If a template uuid is not provided, just skip over the database/record", async () => {
//       let template_uuid = "t1";
//       let related_template_uuid = "t1.1";
//       let field_uuid = "t1f1";

//       let template = {
//         template_uuid, 
//         name: "naruto", 
//         description: "awesome", 
//         updated_at: (new Date()).toISOString(),
//         fields: [{
//           template_field_uuid: field_uuid
//         }],
//         related_databases: [{
//           template_uuid: related_template_uuid,
//           name: "sasuke"
//         }]
//       };
//       await importTemplatePersistAndTest(template, Helper.DEF_CURR_USER);

//       let record = {
//         record_uuid: "r1",
//         database_uuid: "d1",
//         template_uuid,
//         fields: [
//           {
//             template_field_uuid: field_uuid,
//             value: "peach"
//           }
//         ],
//         records: [{
//           record_uuid: "r1.1",
//           database_uuid: "d1.1",
//           template_uuid: ""
//         }]
//       };
//       await importDatasetsRecordsTest([record], Helper.DEF_CURR_USER);
//     });

//     test("with real data", async () => {

//       let raw_template = fs.readFileSync(__dirname + '/test_data/template.txt');
//       let old_template = JSON.parse(raw_template);
    
//       await importTemplatePersistAndTest(old_template, Helper.DEF_CURR_USER);

//       let raw_datasets_and_records = fs.readFileSync(__dirname + '/test_data/datasets_and_records.txt');
//       let old_datasets_and_records = JSON.parse(raw_datasets_and_records).records;
//       let cleansed_datasets_and_records = sanitizeInputDatasetsAndRecords(old_datasets_and_records);

//       await importDatasetsRecordsTest(cleansed_datasets_and_records, Helper.DEF_CURR_USER);
//     });

//     test("with Chemin data", async () => {

//       let raw_template = fs.readFileSync(__dirname + '/test_data/template.txt');
//       let old_template = JSON.parse(raw_template);
    
//       await importTemplateAndDatasetAndTest(old_template, Helper.DEF_CURR_USER);

//       let raw_records = fs.readFileSync(__dirname + '/test_data/chemin_data.txt');
//       let old_records = JSON.parse(raw_records).records;

//       await importRecordsTest(old_records, Helper.DEF_CURR_USER);
//     });

//   });

//   describe("failure", () => {

//     const failureTest = async (databases_records, curr_user, responseCode) => {
//       let response = await importCombinedDatasetsAndRecords(databases_records, curr_user);
//       expect(response.statusCode).toBe(responseCode);
//     };

//     test("Input must be a list", async () => {
//       let databases_records = {};
//       await failureTest(databases_records, Helper.DEF_CURR_USER, 400);
//     });

//     test("Database/record must include a database_uuid, a record_uuid and a template_uuid, which are strings", async () => {
//       let template_uuid = "t1";
//       let template = {
//         template_uuid, 
//         name: "naruto", 
//         description: "awesome", 
//         updated_at: (new Date()).toISOString(),
//         fields: [],
//         related_databases: []
//       };
//       await importTemplatePersistAndTest(template, Helper.DEF_CURR_USER);

//       let record = {
//         database_uuid: "d1",
//         template_uuid,
//         fields: [],
//         records: []
//       };
//       await failureTest([record], Helper.DEF_CURR_USER, 400);

//       record = {
//         record_uuid: "r1",
//         template_uuid,
//         fields: [],
//         records: []
//       };
//       await failureTest([record], Helper.DEF_CURR_USER, 400);

//       record = {
//         record_uuid: "r1",
//         database_uuid: "d1",
//         fields: [],
//         records: []
//       };
//       await failureTest([record], Helper.DEF_CURR_USER, 400);


//     });

//     test("Database/record must reference a valid template_uuid, which has already been imported", async () => {
//       let template_uuid = "t1";

//       let record = {
//         record_uuid: "r1",
//         database_uuid: "d1",
//         template_uuid,
//         fields: [],
//         records: []
//       };
//       await failureTest([record], Helper.DEF_CURR_USER, 400);
//     });

//     test("Database/record format must match the format of the template", async () => {
//       let template_uuid = "t1";
//       let related_template_uuid = "t1.1";
//       let field_uuid = "t1f1";

//       let template = {
//         template_uuid, 
//         name: "naruto", 
//         description: "awesome", 
//         updated_at: (new Date()).toISOString(),
//         fields: [{
//           template_field_uuid: field_uuid
//         }],
//         related_databases: [{
//           template_uuid: related_template_uuid,
//           name: "sasuke"
//         }]
//       };
//       await importTemplatePersistAndTest(template, Helper.DEF_CURR_USER);

//       let record = {
//         record_uuid: "r1",
//         database_uuid: "d1",
//         template_uuid,
//         fields: [
//           {
//             template_field_uuid: field_uuid,
//             value: "peach"
//           },
//           {
//             template_field_uuid: field_uuid,
//             value: "peach"
//           }
//         ],
//         records: [{
//           record_uuid: "r1.1",
//           database_uuid: "d1.1",
//           template_uuid: related_template_uuid
//         }]
//       };
//       await failureTest([record], Helper.DEF_CURR_USER, 400);

//       record = {
//         record_uuid: "r1",
//         database_uuid: "d1",
//         template_uuid,
//         fields: [
//           {
//             template_field_uuid: field_uuid,
//             value: "peach"
//           }
//         ],
//         records: [
//           {
//             record_uuid: "r1.1",
//             database_uuid: "d1.1",
//             template_uuid: related_template_uuid
//           },
//           {
//             record_uuid: "r1.1",
//             database_uuid: "d1.1",
//             template_uuid: related_template_uuid
//           }
//         ]
//       };
//       await failureTest([record], Helper.DEF_CURR_USER, 400);
//     });

//     test("field has options to pick from. Option picked must be valid", async () => {
//       let template_uuid = "t1";
//       let field_uuid = "t1f1";

//       let option_uuid_1 = "toad";
//       let option_uuid_2 = "sexy jiutsu";

//       let template = {
//         template_uuid, 
//         name: "naruto", 
//         description: "awesome", 
//         updated_at: (new Date()).toISOString(),
//         fields: [
//           {
//             template_field_uuid: field_uuid,
//             radio_options: [
//               {template_radio_option_uuid: option_uuid_1, name: option_uuid_1},
//               {name: "ninjuitsu", radio_options: [
//                 {
//                   name: option_uuid_2, template_radio_option_uuid: option_uuid_2
//                 }
//               ]}
//             ]
//           }
//         ]
//       };
//       await importTemplatePersistAndTest(template, Helper.DEF_CURR_USER);

//       let record = {
//         record_uuid: "r1",
//         database_uuid: "d1",
//         template_uuid,
//         fields: [{
//           template_field_uuid: field_uuid,
//           value: [{template_radio_option_uuid: "invalid"}]
//         }]
//       };
//       await failureTest([record], Helper.DEF_CURR_USER, 400);

//       record = {
//         record_uuid: "r1",
//         database_uuid: "d1",
//         template_uuid,
//         fields: [{
//           template_field_uuid: field_uuid,
//           value: [{template_radio_option_uuid: option_uuid_2}, {template_radio_option_uuid: "invalid"}]
//         }]
//       };
//       await failureTest([record], Helper.DEF_CURR_USER, 400);
//     });

//   });
// });