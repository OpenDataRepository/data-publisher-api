const request = require("supertest");
const fs = require('fs');
const MongoDB = require('../lib/mongoDB');
// var { PERMISSION_ADMIN, PERMISSION_EDIT, PERMISSION_VIEW } = require('../models/permission_group');
var { app, init: appInit } = require('../app');
var HelperClass = require('./common_test_operations');
var Helper = new HelperClass(app);
const Util = require('../lib/util');


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

const templateDraftGetAndTest = async (uuid, curr_user) => {
  let response = await Helper.templateDraftGet(uuid, curr_user);
  expect(response.statusCode).toBe(200);
  return response.body;
};

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

const templatefieldsEqual = (before, after, uuid_mapper) => {
  if(before.template_field_uuid in uuid_mapper) {
    if(after.uuid != uuid_mapper[before.template_field_uuid]) {
      return false;
    }
  } else {
    uuid_mapper[before.template_field_uuid] = after.uuid;
  }
  if(after.name != before.name || 
    after.description != before.description ||
     !Util.datesEqual(new Date(after.updated_at), new Date(before.updated_at))
  ) {
    return false;
  }
  if(before.radio_options) {
    if(!after.options ||
       before.radio_options.length != after.options.length) {
      return false;
    }
    before.radio_options.sort((r1, r2) => {return r1.name - r2.name});
    after.options.sort((r1, r2) => {return r1.name - r2.name});
    for(let i = 0; i < before.radio_options.length; i++) {
      if(after.options[i].name != before.radio_options[i].name) {
        return false;
      }
    }
  }
  return true;
}

const templatesEqual = (before, after, uuid_mapper) => {
  if(before.template_uuid in uuid_mapper) {
    if(after.uuid != uuid_mapper[before.template_uuid]) {
      return false;
    }
  } else {
    uuid_mapper[before.template_uuid] = after.uuid;
  }
  if(!before.fields) {
    before.fields = [];
  }
  if(!before.related_databases) {
    before.related_databases = [];
  }
  if(after.name != before.name || 
    after.description != before.description || 
    !Util.datesEqual(new Date(after.updated_at), new Date(before.updated_at)) ||
    after.fields.length != before.fields.length ||
    after.related_templates.length != before.related_databases.length) {
    return false;
  }
  before.fields.sort((f1, f2) => {return f1.name - f2.name});
  after.fields.sort((f1, f2) => {return f1.name - f2.name});
  for(let i = 0; i < before.fields.length; i++) {
    if(!templatefieldsEqual(before.fields[i], after.fields[i], uuid_mapper)) {
      return false;
    }
  }
  before.related_databases.sort((t1, t2) => {return t1.name - t2.name});
  after.related_templates.sort((t1, t2) => {return t1.name - t2.name});
  for(let i = 0; i < before.related_databases.length; i++) {
    if(!templatesEqual(before.related_databases[i], after.related_templates[i], uuid_mapper)) {
      return false;
    }
  }
  return true;
}

const importTemplatePublishAndTest = async (template, curr_user) => {
  let response = await importTemplate(template, curr_user);
  expect(response.statusCode).toBe(200);
  let uuid = response.body.new_uuid;

  let new_template = await templateDraftGetAndTest(uuid, curr_user);
  expect(templatesEqual(template, new_template, {})).toBeTruthy();

  return await Helper.templatePublishAndFetch(uuid, curr_user);
}

const importCombinedDatasetsAndRecords = async (datasets_and_records, curr_user) => {
  return await request(app)
    .post(`/import/datasets_and_records/`)
    .set('Cookie', [`user=${curr_user}`])
    .send({records: datasets_and_records})
    .set('Accept', 'application/json');
}

const recordfieldsEqual = (old_field, new_field, uuid_mapper) => {
  if(!(old_field.template_field_uuid in uuid_mapper)) {
    throw new Error(`uuid ${old_field.template_field_uuid} was never imported and should not be tested`);
  }
  if(new_field.uuid != uuid_mapper[old_field.template_field_uuid]) {
    return false;
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
    uuid_mapper[old_record_and_database.uuid] = new_record.uuid;
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
    if(new_database.template_uuid != uuid_mapper[old_record_and_database.template_uuid]) {
      return false;
    }
  } else {
    uuid_mapper[old_record_and_database.template_uuid] = new_dataset.template_uuid;
  }

  if(typeof(old_record_and_database.fields) != typeof(new_record.fields) ||
    old_record_and_database.fields.length != new_record.fields.length ||
    typeof(old_record_and_database.records) != typeof(new_dataset.related_datasets) ||
    old_record_and_database.records.length != new_dataset.related_datasets.length ||
    old_record_and_database.records.length != new_record.related_records.length) {
    return false;
  }
  old_record_and_database.fields.sort((f1, f2) => {return f1.field_name - f2.field_name});
  new_record.fields.sort((f1, f2) => {return f1.name - f2.name});
  for(let i = 0; i < old_record_and_database.fields.length; i++) {
    if(!recordfieldsEqual(old_record_and_database.fields[i], new_record.fields[i], uuid_mapper)) {
      return false;
    }
  }
  // TODO: probably need to sort this if this is actually gonna work
  for(let i = 0; i < old_record_and_database.related_templates.length; i++) {
    if(!compareOldAndNewDatabaseAndRecord(old_record_and_database.records[i], new_dataset.related_datasets[i], new_record.related_records[i], uuid_mapper)) {
      return false;
    }
  }

  return true;
}

const importDatasetsRecordsTest = async (datasets_and_records, curr_user, uuid_mapper) => {
  let response = await importCombinedDatasetsAndRecords(datasets_and_records, curr_user);
  expect(response.statusCode).toBe(200);
  let record_uuids = response.body.record_uuids;
  expect(record_uuids.length).toBe(datasets_and_records.length);
  for(let i = 0; i < datasets_and_records.length; i++) {

    let new_record_uuid = record_uuids[i];
    let new_record = await Helper.recordDraftGet(new_record_uuid, curr_user);
    let new_dabase_uuid = new_record.database_uuid;
    let new_database = await Helper.datasetLatestPublished(new_dabase_uuid, curr_user);
    let old_record_and_database = datasets_and_records[i];

    compareOldAndNewDatabaseAndRecord(old_record_and_database, new_database, new_record, uuid_mapper);
  }
};


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
  
      let new_template = await templateDraftGetAndTest(uuid, Helper.DEF_CURR_USER);
      expect(templatesEqual(template, new_template, {})).toBeTruthy();
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
  
      let new_template = await templateDraftGetAndTest(uuid, Helper.DEF_CURR_USER);
      expect(templatesEqual(template, new_template, {})).toBeTruthy();
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
  
      let new_template = await templateDraftGetAndTest(uuid, Helper.DEF_CURR_USER);
      expect(templatesEqual(template, new_template, {})).toBeTruthy();
    });
  
    test("import the same template twice", async () => {
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
  
      let new_template = await templateDraftGetAndTest(uuid, Helper.DEF_CURR_USER);
      expect(templatesEqual(template, new_template, {})).toBeTruthy();
  
      // Import second time
  
      response = await importTemplate(template, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      uuid = response.body.new_uuid;
      new_template = await templateDraftGetAndTest(uuid, Helper.DEF_CURR_USER);
      expect(templatesEqual(template, new_template, {})).toBeTruthy();  
    })
  
    test("can import same template a second time as long as you have edit permissions", async () => {
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
  
      let new_template = await templateDraftGetAndTest(uuid, Helper.DEF_CURR_USER);
      expect(templatesEqual(template, new_template, {})).toBeTruthy();
  
      // Import second time
    
      response = await importTemplate(template, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let uuid2 = response.body.new_uuid;

      expect(uuid).toEqual(uuid2);

      let new_template_2 = await templateDraftGetAndTest(uuid, Helper.DEF_CURR_USER);
      expect(templatesEqual(template, new_template_2, {})).toBeTruthy();
    })
  
    test("import template with real data", async () => {
      let rawdata = fs.readFileSync(__dirname + '/test_data/template.txt');
      let old_template = JSON.parse(rawdata);
    
      let response = await importTemplate(old_template, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let uuid = response.body.new_uuid;
    
      let new_template = await templateDraftGetAndTest(uuid, Helper.DEF_CURR_USER);
    
      expect(templatesEqual(old_template, new_template, {})).toBeTruthy();
    
      // cleanseInputTemplate(old_template);
      // expect(new_template).toMatchObject(old_template);
    
      Helper.templateCleanseMetadata(new_template);
      let published_template = await Helper.templatePublishAndFetch(new_template.uuid, Helper.DEF_CURR_USER);
      expect(published_template).toMatchObject(new_template);
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
  
      let new_template = await templateDraftGetAndTest(uuid, Helper.DEF_CURR_USER);
      expect(templatesEqual(template, new_template, {})).toBeTruthy();
  
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

describe("comebineddatasetsandrecords", () => {

  describe("success", () => {

    test("basic", async () => {
      let template_uuid = "t1";
      let template = {
        template_uuid, 
        name: "naruto", 
        description: "awesome", 
        updated_at: (new Date()).toISOString(),
        fields: [],
        related_databases: []
      };
      await importTemplatePublishAndTest(template, Helper.DEF_CURR_USER);

      let record = {
        record_uuid: "r1",
        database_uuid: "d1",
        template_uuid,
        fields: [],
        records: []
      };
      await importDatasetsRecordsTest([record], Helper.DEF_CURR_USER, {});
    });

  });
});