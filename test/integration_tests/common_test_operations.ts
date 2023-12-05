const request = require("supertest");
const fs = require('fs');
const path = require('path');
var { MongoMemoryReplSet } = require('mongodb-memory-server');
var finalhandler = require('finalhandler')
var http = require('http')
var serveStatic = require('serve-static')
import { AddressInfo } from 'net'
const src_path = '../../src'
const MongoDB = require(src_path + '/lib/mongoDB');
const ElasticDB = require(src_path +  '/lib/elasticDB');
var { PermissionTypes } = require(src_path +  '/models/permission');
const FieldTypes = require(src_path +  '/models/template_field').FieldTypes;
var appRoot = require('app-root-path');
const Util = require(src_path + '/lib/util');

const dynamicTestFilesPath = appRoot + '/test_data/dynamic_files'
// Necessary because empty folders like dynamic_tests don't get included with git
try {
  fs.mkdirSync(dynamicTestFilesPath);
} catch (err){}

export = class Helper {
  public constructor(private app) {
    this.app = app;
  };

  private agent;

  // Create an in-memory db with a repl set, which is needed for tests with transactions
  // wiredTiger is the default storage engine for MongoDB. It is needed for multi-document transaction
  // https://github.com/nodkz/mongodb-memory-server/blob/master/docs/guides/quick-start-guide.md#replicaset
  setupDB = async () => {
    let replset = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger'} });
    let uri = replset.getUri();
    return [uri, replset];
  }

  // Required to set agent in app before making api calls
  setAgent = (agent) => {
    this.agent = agent
  }

  createAgentRegisterLogin = async (email, password) => {
    let agent = request.agent(this.app);
    this.setAgent(agent);
    let body = await this.testAndExtract(this.register, email, password);
    let email_token = body.token;
    await this.testAndExtract(this.confirmEmail, email_token);
    body = await this.testAndExtract(this.login, email, password);
    let login_token = body.token.split(" ")[1];

    agent.latest_login_token = login_token;
    this.setAgent(this.agent.auth(login_token, { type: 'bearer' }));
    return agent;
  }

  logout() {
    this.agent = request.agent(this.app);
  }

  VALID_UUID = "47356e57-eec2-431b-8059-f61d5f9a6bc6";
  DEF_EMAIL = "a@a.com";
  DEF_PASSWORD = "waffle";
  EMAIL_2 = "b@b.com";

  clearDatabase = async () => {
    await this.clearDatabaseExceptForUsers();
    let db = MongoDB.db();
    await db.collection('users').deleteMany();
    await db.collection('user_permissions').deleteMany();

  };

  clearElasticSearchDatabase = async () => {
    const client = ElasticDB.getClient();
    await client.delete(process.env.elasticsearchIndexPrefix + '*');
  };

  refreshElasticIndexForSearching = async (index) => {
    const client = ElasticDB.getClient();
    await client.indices.refresh(index);
  }

  clearDatabaseExceptForUsers = async () => {
    let db = MongoDB.db();
    await db.collection('templates').deleteMany();
    await db.collection('template_fields').deleteMany();
    await db.collection('datasets').deleteMany();
    await db.collection('records').deleteMany();
    await db.collection('permissions').deleteMany();
    await db.collection('legacy_uuid_to_new_uuid_mapper').deleteMany();
    await db.collection('files').deleteMany();
  };

  sortArrayByNameProperty = (o1, o2) => {
    let n1 = o1.name;
    let n2 = o2.name;
    if(n1 < n2) {
      return -1;
    }
    if(n1 > n2) {
      return 1;
    }
    return 0;
  }
  sortArrayBy_idProperty = (o1, o2) => {
    let n1 = o1._id;
    let n2 = o2._id;
    if(n1 < n2) {
      return -1;
    }
    if(n1 > n2) {
      return 1;
    }
    return 0;
  }
  sortArrayByUuidProperty = (o1, o2) => {
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
  sortArrayByTemplate_idProperty = (o1, o2) => {
    let n1 = o1.template_id;
    let n2 = o2.template_id;
    if(n1 < n2) {
      return -1;
    }
    if(n1 > n2) {
      return 1;
    }
    return 0;
  }

  redirect = (path) => {
    return this.agent
      .get(path);
  }

  // A wrapper function which calls the api callback with the specified args,
  // verifies that the status code is 200, and returns the response
  testAndExtract = async(callback, ...args) => {
    let response = await callback(...args);
    expect(response.statusCode).toBeGreaterThanOrEqual(200);
    expect(response.statusCode).toBeLessThan(400);
    return response.body;
  }

  logResponseErrorMessage = (response) => {
    console.log(response.error.text);
  }

  // template field

  templateFieldCreate = async (field) => {
    return await this.agent
      .post(`/template_field`)
      .send(field)
      .set('Accept', 'application/json');
  };

  templateFieldDraftGet = async (uuid) => {
    return await this.agent
      .get(`/template_field/${uuid}/draft`)
      .set('Accept', 'application/json');
  };
  templateFieldDraftGetAndTest = async (uuid) => {
    return await this.testAndExtract(this.templateFieldDraftGet, uuid);
  };

  templateFieldUpdate = async (uuid, field) => {
    return await this.agent
      .put(`/template_field/${uuid}`)
      .send(field)
      .set('Accept', 'application/json');
  };
  templateFieldUpdateAndTest = async (template_field) => {
    delete template_field.updated_at
    let response = await this.templateFieldUpdate(template_field.uuid, template_field);
    expect(response.statusCode).toBe(200);
  
    let new_draft = await this.templateFieldDraftGetAndTest(template_field.uuid);
    this.testTemplateFieldsEqual(template_field, new_draft);
    return new_draft;
  }

  testTemplateFieldOptionsEqual = (before, after) => {
    if(!before) {
      return;
    }
    expect(after).toBeTruthy();
    expect(before.length).toBe(after.length);
    before.sort(this.sortArrayByNameProperty);
    after.sort(this.sortArrayByNameProperty);
    for(let i = 0; i < before.length; i++) {
      expect(after[i].name).toEqual(before[i].name);
      // So import can also use this function
      if(!before[i].options) {
        before[i].options = before[i].radio_options ? before[i].radio_options : before[i].children;
      }
      this.testTemplateFieldOptionsEqual(before[i].options, after[i].options)
    }
  }
  testTemplateFieldsEqual = (before, after) => {
    if(before.name) {
      expect(after.name).toEqual(before.name);
    }
    if(before.description) {
      expect(after.description).toEqual(before.description);
    }
    if(before.public_date) {
      expect(after.public_date).toEqual(before.public_date);
    }
    if(before.type) {
      expect(after.type).toEqual(before.type);
    }
    // So import can also use this function
    if(!before.options) {
      if(before.radio_options) {
        before.options = before.radio_options;
      }
      if(before.fieldtype == "Tags") {
        before.options = before.value;
      }
    }
    this.testTemplateFieldOptionsEqual(before.options, after.options);
  }

  templateFieldCreateAndTest = async (input_field) => {
    let response = await this.templateFieldCreate(input_field)
    expect(response.statusCode).toBe(303);
  
    let new_field = await this.testAndExtract(this.redirect, response.header.location);
    expect(new_field).toMatchObject(input_field);
    return new_field.uuid;
  };

  templateFieldLastUpdate = async (uuid) => {
    return await this.agent
      .get(`/template_field/${uuid}/last_update`);
  };

  templateFieldLastUpdateAndTest = async (uuid) => {
    return await this.testAndExtract(this.templateFieldLastUpdate, uuid);
  };

  templateFieldPersist = async (uuid, last_update) => {
    return await this.agent
    .post(`/template_field/${uuid}/persist`)
    .send({last_update})
    .set('Accept', 'application/json');
  };
  
  templateFieldPersistAndTest = async (uuid, last_update) => {
    await this.testAndExtract(this.templateFieldPersist, uuid, last_update);
  };

  templateFieldLatestPersisted = async (uuid) => {
    return await this.agent
    .get(`/template_field/${uuid}/latest_persisted`);
  };

  templateFieldLatestPersistedBeforeDate = async (uuid, timestamp) => {
    return await this.agent
      .get(`/template_field/${uuid}/${timestamp}`);
  };

  templateFieldDraftExisting = async (uuid) => {
    return await this.agent
      .get(`/template_field/${uuid}/draft_existing`);
  };
  
  templateFieldDraftExistingAndTest = async (uuid) => {
    return await this.testAndExtract(this.templateFieldDraftExisting, uuid);
  };

  templateFieldPersistAfterCreateOrUpdateThenTest = async (field) => {
    let uuid = field.uuid;
    let last_update = await this.templateFieldLastUpdateAndTest(uuid);

    await this.templateFieldPersistAndTest(uuid, last_update);
  
    // Check that a persisted version now exists
    let persisted = await this.testAndExtract(this.templateFieldLatestPersisted, uuid);
    this.testTemplateFieldsEqual(field, persisted);
    expect(persisted).toHaveProperty("persist_date");

    // Check that we can still get a new draft if requested
    let new_draft = await this.templateFieldDraftGetAndTest(uuid);
    this.testTemplateFieldsEqual(field, new_draft);

    return persisted;
  };

  templateFieldCreatePersistTest = async (field) => {
    let uuid = await this.templateFieldCreateAndTest(field);
    field.uuid = uuid;

    return await this.templateFieldPersistAfterCreateOrUpdateThenTest(field);
  };

  templateFieldUpdatePersistTest = async (field) => {
    await this.templateFieldUpdateAndTest(field);
  
    expect(await this.templateFieldDraftExistingAndTest(field.uuid)).toBe(true);
  
    return await this.templateFieldPersistAfterCreateOrUpdateThenTest(field);
  };

  templateFieldDraftDelete = async (uuid) => {
    return await this.agent
      .delete(`/template_field/${uuid}/draft`);
  };
  templateFieldDraftDeleteAndTest = async (uuid) => {
    await this.testAndExtract(this.templateFieldDraftDelete, uuid);
  };

  allPublicTemplateFields = async () => {
    return await this.agent
      .get(`/template_field/all_public_fields`);
  }

  // template

  templateCreate = (template) => {
    return this.agent
      .post('/template')
      .send(template)
      .set('Accept', 'application/json');
  };

  templateDraftGet = (uuid) => {
    return this.agent
      .get(`/template/${uuid}/draft`)
      .set('Accept', 'application/json');
  };
  templateDraftGetAndTest = async (uuid) => {
    return await this.testAndExtract(this.templateDraftGet, uuid);
  };

  testTemplateDraftsEqual = (original, created) => {
    if(original.uuid) {
      expect(created.uuid).toBe(original.uuid);
    }
    if(original.name) {
      expect(created.name).toEqual(original.name);
    }
    if(original.description) {
      expect(created.description).toEqual(original.description);
    }
    if(original.public_date) {
      expect(created.public_date).toEqual(original.public_date);
    }
    if(original.fields) {
      expect(created.fields.length).toBe(original.fields.length);
      original.fields.sort(this.sortArrayByNameProperty);
      created.fields.sort(this.sortArrayByNameProperty);
      for(let i = 0; i < original.fields.length; i++) {
        this.testTemplateFieldsEqual(original.fields[i], created.fields[i]);
      }
    }
    if(original.related_templates) {
      expect(created.related_templates.length).toBe(original.related_templates.length);
      original.related_templates.sort(this.sortArrayByNameProperty);
      created.related_templates.sort(this.sortArrayByNameProperty);
      for(let i = 0; i < original.related_templates.length; i++) {
        this.testTemplateDraftsEqual(original.related_templates[i], created.related_templates[i]);
      }
    }
    if(original.subscribed_templates) {
      expect(created.subscribed_templates.length).toBe(original.subscribed_templates.length);
      original.subscribed_templates.sort(this.sortArrayBy_idProperty);
      created.subscribed_templates.sort(this.sortArrayBy_idProperty);
      for(let i = 0; i < original.subscribed_templates.length; i++) {
        expect(created.subscribed_templates[i]._id).toEqual(original.subscribed_templates[i]._id);
      }
    }
    if(original.plugins) {
      expect(Util.objectsEqual(original.plugins, created.plugins)).toBeTruthy();
    }
    if(original.view_settings) {
      expect(Util.objectsEqual(original.view_settings, created.view_settings)).toBeTruthy();
    }
  }

  templateCreateAndTest = async (input_template) => {
    let response = await this.templateCreate(input_template);
    expect(response.statusCode).toBe(303);
  
    let created_template = await this.testAndExtract(this.redirect, response.header.location);

    this.testTemplateDraftsEqual(input_template, created_template);
    return created_template;
  }; 

  templateLastUpdate = async(uuid) => {
    return await this.agent
      .get(`/template/${uuid}/last_update`);
  }
  templateLastUpdateAndTest = async(uuid) => {
    return await this.testAndExtract(this.templateLastUpdate, uuid);
  }

  templatePersist = async (uuid, last_update) => {
    return await this.agent
      .post(`/template/${uuid}/persist`)
      .send({last_update})
      .set('Accept', 'application/json');
  };

  templateLatestPersisted = async(uuid) => {
    return await this.agent
      .get(`/template/${uuid}/latest_persisted`)
      .set('Accept', 'application/json');
  }
  templateLatestPersistedAndTest = async(uuid) => {
    return await this.testAndExtract(this.templateLatestPersisted, uuid);
  }
  templateLatestPersistedBeforeDate = async (uuid, timestamp) => {
    return await this.agent
      .get(`/template/${uuid}/${timestamp}`);
  }
  templatePersistedVersion = async (_id) => {
    return await this.agent
      .get(`/template/persisted_version/${_id}`);
  }

  templateVersion = async (_id) => {
    return await this.agent
      .get(`/template/version/${_id}`);
  }

  templateDraftExisting = async (uuid) => {
    return await this.agent
      .get(`/template/${uuid}/draft_existing`);
  };
  
  templateDraftExistingAndTest = async (uuid) => {
    return await this.testAndExtract(this.templateDraftExisting, uuid);
  };

  templatePersistAndFetch = async (uuid) => {
    let last_update = await this.testAndExtract(this.templateLastUpdate, uuid);

    let response = await this.templatePersist(uuid, last_update);
    expect(response.statusCode).toBe(200);

    let persisted_template = await this.testAndExtract(this.templateLatestPersisted, uuid);
    expect(persisted_template).toHaveProperty("persist_date");
    return persisted_template;
  };

  templateCreatePersistTest = async (template) => {
    let created_template = await this.templateCreateAndTest(template);
    let persisted_template = await this.templatePersistAndFetch(created_template.uuid)
    this.testTemplateDraftsEqual(template, persisted_template);
    return persisted_template;
  };

  templateUpdate = (uuid, template) => {
    return this.agent
      .put(`/template/${uuid}`)
      .send(template)
      .set('Accept', 'application/json');
  }

  templateSortFieldsAndRelatedTemplates = (template) => {
    if(!template) {
      return;
    } 
    if(template.fields) {
      template.fields.sort(this.sortArrayByNameProperty);
    } 
    if(template.related_templates) {
      template.related_templates.sort(this.sortArrayByNameProperty);
      for(let related_template of template.related_templates) {
        this.templateSortFieldsAndRelatedTemplates(related_template);
      }
    }
  }

  templateLatestDraftOrPersisted = async (uuid)  => {
    let response = await this.templateDraftGet(uuid);
    if(response.statusCode == 404) {
      return await this.templateLatestPersisted(uuid);
    }
    return response;
  }

  templateUpdateAndTest = async (template) => {
    let response = await this.templateUpdate(template.uuid, template);
    expect(response.statusCode).toBe(200);
  
    let new_draft = await this.testAndExtract(this.templateLatestDraftOrPersisted, template.uuid);
    this.testTemplateDraftsEqual(template, new_draft);
    return new_draft;
  }

  templateUpdatePersistTest = async (template) => {
    await this.templateUpdateAndTest(template);
    let persisted_template = await this.templatePersistAndFetch(template.uuid);
    this.testTemplateDraftsEqual(template, persisted_template);
    return persisted_template;
  };

  templateDelete = async (uuid) => {
    return await this.agent
      .delete(`/template/${uuid}/draft`);
  }
  templateDeleteAndTest = async (uuid) => {
    await this.testAndExtract(this.templateDelete, uuid);
  };

  templateDuplicate = async (uuid) => {
    return await this.agent
      .post(`/template/${uuid}/duplicate`);
  }

  // dataset

  datasetCreate = async (dataset) => {
    return await this.agent
      .post(`/dataset`)
      .send(dataset)
      .set('Accept', 'application/json');
  }

  datasetDraftGet = async (uuid) => {
    return await this.agent
      .get(`/dataset/${uuid}/draft`)
      .set('Accept', 'application/json');
  };
  datasetDraftGetAndTest = async (uuid) => {
    return await this.testAndExtract(this.datasetDraftGet, uuid);
  };

  testDatasetDraftsEqual = (original, created) => {
    if(original.uuid) {
      expect(created.uuid).toBe(original.uuid);
    }
    if(created.no_permissions) {
      return;
    }
    expect(created.template_id).toBe(original.template_id);
    expect(created).toHaveProperty("template_uuid");
    if(original.public_date) {
      expect(created.public_date).toEqual(original.public_date);
    }
    if(original.related_datasets) {
      expect(created.related_datasets.length).toBe(original.related_datasets.length);
      original.related_datasets.sort(this.sortArrayByTemplate_idProperty);
      created.related_datasets.sort(this.sortArrayByTemplate_idProperty);
      for(let i = 0; i < original.related_datasets.length; i++) {
        this.testDatasetDraftsEqual(original.related_datasets[i], created.related_datasets[i]);
      }
    }
    if(original.name) {
      expect(created.name).toEqual(original.name);
    }
    if(original.group_uuid) {
      expect(created.group_uuid).toBe(original.group_uuid);
    }
    if(original.plugins) {
      expect(Util.objectsEqual(original.plugins, created.plugins)).toBeTruthy();
    }
    if(original.view_settings) {
      expect(Util.objectsEqual(original.view_settings, created.view_settings)).toBeTruthy();
    }
  }

  datasetCreateAndTest = async (dataset) => {
    let response = await this.datasetCreate(dataset);
    expect(response.statusCode).toBe(303);

    let created_dataset = await this.testAndExtract(this.redirect, response.header.location);

    this.testDatasetDraftsEqual(dataset, created_dataset);
    return created_dataset;
  };

  datasetUpdate = async (uuid, dataset) => {
    return await this.agent
      .put(`/dataset/${uuid}`)
      .send(dataset);
  };

  datasetLastUpdate = async(uuid) => {
    return await this.agent
      .get(`/dataset/${uuid}/last_update`);
  }
  datasetLastUpdateAndTest = async(uuid) => {
    return await this.testAndExtract(this.datasetLastUpdate, uuid);
  }

  datasetPersist = async (uuid, last_update) => {
    return await this.agent
      .post(`/dataset/${uuid}/persist`)
      .send({last_update})
      .set('Accept', 'application/json');
  };
  datasetPersistAndTest = async (uuid) => {
    let last_update = await this.datasetLastUpdateAndTest(uuid);
    let response = await this.datasetPersist(uuid, last_update);
    expect(response.statusCode).toBe(200);
  };

  datasetLatestPersisted = async(uuid) => {
    return await this.agent
      .get(`/dataset/${uuid}/latest_persisted`)
      .set('Accept', 'application/json');
  }
  datasetLatestPersistedAndTest = async(uuid) => {
    return await this.testAndExtract(this.datasetLatestPersisted, uuid);
  }
  datasetLatestPersistedBeforeDate = async (uuid, timestamp) => {
    return await this.agent
      .get(`/dataset/${uuid}/${timestamp}`);
  }

  datasetPersistedVersion = async (_id) => {
    return await this.agent
      .get(`/dataset/persisted_version/${_id}`);
  }

  datasetPersistAndFetch = async (uuid) => {
    await this.datasetPersistAndTest(uuid);
  
    let persisted_template = await this.testAndExtract(this.datasetLatestPersisted, uuid);
    expect(persisted_template).toHaveProperty("persist_date");
    return persisted_template;
  };

  datasetCreatePersistTest = async (dataset) => {
    let created_dataset = await this.datasetCreateAndTest(dataset);
    let dataset_persisted = await this.datasetPersistAndFetch(created_dataset.uuid)
    this.testDatasetDraftsEqual(dataset, dataset_persisted);
    return dataset_persisted;
  };

  datasetUpdateAndTest = async (dataset) => {
    let response = await this.datasetUpdate(dataset.uuid, dataset);
    expect(response.statusCode).toBe(303);

    let updated_dataset = await this.testAndExtract(this.redirect, response.header.location);
    this.testDatasetDraftsEqual(dataset, updated_dataset);
    return updated_dataset;
  };

  datasetUpdatePersistTest = async (dataset) => {
    await this.datasetUpdateAndTest(dataset);
    let persisted_dataset = await this.datasetPersistAndFetch(dataset.uuid)
    this.testDatasetDraftsEqual(dataset, persisted_dataset);
    return persisted_dataset;
  };

  datasetDelete = async (uuid) => {
    return await this.agent
      .delete(`/dataset/${uuid}/draft`);
  }
  datasetDeleteAndTest = async (uuid) => {
    await this.testAndExtract(this.datasetDelete, uuid);
  }

  datasetDraftExisting = async (uuid) => {
    return await this.agent
      .get(`/dataset/${uuid}/draft_existing`)
      .set('Accept', 'application/json');
  };
  datasetDraftExistingAndTest = async (uuid) => {
    return await this.testAndExtract(this.datasetDraftExisting, uuid);
  }

  datasetRecords = async (uuid) => {
    return await this.agent
      .get(`/dataset/${uuid}/records`)
      .set('Accept', 'application/json');
  }

  datasetDuplicate = async (uuid) => {
    return await this.agent
      .post(`/dataset/${uuid}/duplicate`);
  }

  newDatasetForTemplate = async (template_uuid) => {
    return await this.agent
      .get(`/dataset/new_dataset_for_template/${template_uuid}`)
      .set('Accept', 'application/json');
  }
  newDatasetForTemplateAndTest = async (template_uuid) => {
    return await this.testAndExtract(this.newDatasetForTemplate, template_uuid);
  }

  datasetPublish = async (uuid, name) => {
    return await this.agent
      .post(`/dataset/${uuid}/publish`)
      .send({name})
      .set('Accept', 'application/json');
  };

  datasetPublished = async (uuid, name) => {
    return await this.agent
      .get(`/dataset/${uuid}/published/${name}`);
  }

  datasetPublishedRecords = async (uuid, name) => {
    return await this.agent
      .get(`/dataset/${uuid}/published/${name}/records`);
  }

  datasetPublishedSearchRecords = async (uuid, name, search_params) => {
    let url = `/dataset/${uuid}/published/${name}/search_records?`;
    for(let key in search_params) {
      let value = search_params[key];
      url += key + "=" + value + "&";
    }
    url = url.slice(0, url.length-1);
    return await this.agent
      .get(url);
  }

  datasetAllPublicUuids = async () => {
    return await this.agent
      .get(`/dataset/all_public_uuids`);
  }

  datasetAllViewableUuids = async () => {
    return await this.agent
      .get(`/dataset/all_viewable_uuids`);
  }

  allPublicDatasets = async () => {
    return await this.agent
      .get(`/dataset/all_public_datasets`);
  }

  // record
  
  recordCreate = async (record) => {
    return await this.agent
      .post('/record')
      .send(record);
  };
  
  recordDraftGet = async (uuid) => {
    return await this.agent
      .get(`/record/${uuid}/draft`)
      .set('Accept', 'application/json');
  };
  recordDraftGetAndTest = async (uuid) => {
    return await this.testAndExtract(this.recordDraftGet, uuid);
  };

  recordNewDraftFromLatestPersisted = async (uuid) => {
    return await this.agent
      .get(`/record/${uuid}/new_draft_from_latest_persisted`)
      .set('Accept', 'application/json');
  };
  
  testRecordFieldsEqual = (before, after) => {
    if(before.uuid) {
      expect(after.uuid).toEqual(before.uuid);
    }
    if(before.name) {
      expect(after.name).toEqual(before.name);
    }
    if(before.public_date) {
      expect(after.public_date).toEqual(before.public_date);
    }
    if(before.type) {
      expect(after.type).toEqual(before.type);
    }
    if(before.file) {
      expect(after).toHaveProperty("file");
      // must be after.type because the type is stored in the template, not the record
      if(after.type == FieldTypes.File) {
        expect(after.file.name).toEqual(before.file.name);
        if(before.file.uuid != 'new') {
          expect(after.file.uuid).toEqual(before.file.uuid);
        }
      }
    }
    if(before.values) {
      expect(after.values.length).toBe(before.values.length);
      before.values.sort(this.sortArrayByNameProperty);
      after.values.sort(this.sortArrayByNameProperty);
      for(let i = 0; i < before.values.length; i++) {
        expect(before.values[i].uuid).toEqual(after.values[i].uuid);
      }
    }
  }
  testRecordsEqual = (before, after) => {
    if(before.uuid) {
      expect(after.uuid).toEqual(before.uuid);
    }
    expect(after.dataset_uuid).toEqual(before.dataset_uuid);
    if(before.public_date) {
      expect(after.public_date).toEqual(before.public_date);
    }
    if(before.fields) {
      let after_field_map: any = {};
      for(let field in after.fields) {
        after_field_map[(field as any).uuid] = field;
      }
      for(let field in before.fields) {
        this.testRecordFieldsEqual(field, after_field_map[(field as any).uuid]);
      }
    }
    if(before.related_records) {
      expect(after.related_records.length).toBe(before.related_records.length);
      before.related_records.sort(this.sortArrayByNameProperty);
      after.related_records.sort(this.sortArrayByNameProperty);
      for(let i = 0; i < before.related_records.length; i++) {
        this.testRecordsEqual(before.related_records[i], after.related_records[i]);
      }
    }
  }
  
  recordCreateAndTest = async (input_record) => {
    let response = await this.recordCreate(input_record);
    expect(response.statusCode).toBe(200);
      
    let created_record = response.body.record;
    this.testRecordsEqual(input_record, created_record);
    return created_record;
  };
  
  recordUpdate = async (record, uuid) => {
    return await this.agent
      .put(`/record/${uuid}`)
      .send(record);
  };
  
  recordUpdateAndTest = async (record) => {
    let response = await this.recordUpdate(record, record.uuid);
    expect(response.statusCode).toBe(200);
    
    let updated_record = response.body.record;
    this.testRecordsEqual(record, updated_record);
    return updated_record;
  };
  
  recordDelete = async (uuid) => {
    return await this.agent
      .delete(`/record/${uuid}/draft`);
  };
  recordDeleteAndTest = async (uuid) => {
    await this.testAndExtract(this.recordDelete, uuid);
  };
  
  recordPersist = async (uuid, last_update) => {
    return await this.agent
      .post(`/record/${uuid}/persist`)
      .send({last_update});
  }
  
  recordLatestPersistedGet = async (uuid) => {
    return await this.agent
      .get(`/record/${uuid}/latest_persisted`)
      .set('Accept', 'application/json');
  };
  
  recordPersistAndTest = async (record) => {
    let uuid = record.uuid;
    let last_update = await this.recordLastUpdateAndTest(uuid);
    let response = await this.recordPersist(uuid, last_update);
    expect(response.statusCode).toBe(200);
    let persisted = await this.testAndExtract(this.recordLatestPersistedGet, uuid);
    expect(persisted).toHaveProperty("persist_date");
    this.testRecordsEqual(record, persisted);
    return persisted;
  }
  
  recordCreatePersistTest = async (record) => {
    let created_record = await this.recordCreateAndTest(record);
    let persisted = await this.recordPersistAndTest(created_record)
    this.testRecordsEqual(record, persisted);
    return persisted;
  };
  
  recordDraftExisting = async (uuid) => {
    let response = await this.agent
      .get(`/record/${uuid}/draft_existing`)
      .set('Accept', 'application/json');
    expect(response.statusCode).toBe(200);
    return response.body;
  }
  
  recordGetPersistedBeforeTimestamp = async(uuid, time) => {
    let response = await this.agent
      .get(`/record/${uuid}/${time.toISOString()}`)
      .set('Accept', 'application/json');
    return response;
  }
  
  recordLastUpdate = async(uuid) => {
    return await this.agent
      .get(`/record/${uuid}/last_update`);
  }
  
  recordLastUpdateAndTest = async(uuid) => {
    let response = await this.recordLastUpdate(uuid);
    expect(response.statusCode).toBe(200);
    return new Date(response.body);
  }
  
  recordPersistAndFetch = async (uuid) => {
    let response = await this.recordLastUpdate(uuid);
    expect(response.statusCode).toBe(200);
    let last_update = response.body;
  
    response = await this.recordPersist(uuid, last_update);
    expect(response.statusCode).toBe(200);
  
    response = await this.recordLatestPersistedGet(uuid);
    expect(response.statusCode).toBe(200);
    let persisted_record = response.body;
    expect(persisted_record).toHaveProperty("persist_date");
    return persisted_record;
  };
  
  recordUpdatePersistTest = async (record) => {
    await this.recordUpdateAndTest(record);
    let persisted_record = await this.recordPersistAndFetch(record.uuid);
    this.testRecordsEqual(record, persisted_record);
    return persisted_record;
  };

  // permission

  getPermission = async (uuid, category) => {
    return await this.agent
      .get(`/permission/${uuid}/${category}`)
      .set('Accept', 'application/json');
  };

  updatePermission = async (uuid, category, users) => {
    return await this.agent
      .put(`/permission/${uuid}/${category}`)
      .send({users})
      .set('Accept', 'application/json');
  }

  testPermission = async (uuid, category, statusCode, users) => {
    let response = await this.getPermission(uuid, category);
    if(!statusCode) {
      statusCode = 200;
    }
    expect(response.statusCode).toBe(statusCode);
    if(statusCode == 200) {
      expect(response.body).toEqual(users);
    }
  };

  testPermissionsInitializedFor = async (uuid, user) => {
    if(!user) {
      user = this.DEF_EMAIL;
    }
    await this.testPermission(uuid, PermissionTypes.admin, 200, [user]);
    await this.testPermission(uuid, PermissionTypes.edit, 200, []);
    await this.testPermission(uuid, PermissionTypes.view, 200, []);
  }

  currentUserHasPermission = async (uuid, category) => {
    return await this.agent
      .get(`/permission/current_user_has_permission/${uuid}/${category}`)
      .set('Accept', 'application/json');
  };

  // files 

  testDataPath = appRoot + '/test_data'
  dynamicTestFilesPath = dynamicTestFilesPath
  uploadsDirectoryPath = appRoot + "/uploads_testing"

  clearFilesAtPath = (directory) => {
    fs.readdir(directory, (err, files) => {
      if (err) throw err;
    
      for (let file of files) {
        fs.unlinkSync(path.join(directory, file));
      }
    });
  };

  createFile = (file_name, contents) => {
    let new_file_path = path.join(this.dynamicTestFilesPath, file_name);
    fs.writeFileSync(new_file_path, contents);
  }

  uploadFileDirect = async (uuid, file_name) => {
    const file_path = path.join(this.dynamicTestFilesPath, file_name)
    const stats = fs.statSync(file_path);
    const file_size = stats.size;
    const file_data = fs.readFileSync(file_path);
    return await this.agent
      .post(`/file/${uuid}/direct`)
      .set('size', file_size)
      .set('x-start-byte', 0)
      .send(file_data);
  }
  uploadFileDataDirect = async (uuid, file_data, start_byte, file_size) => {
    return await this.agent
      .post(`/file/${uuid}/direct`)
      .set('size', file_size)
      .set('x-start-byte', start_byte)
      .send(file_data);
  }
  fileDirectUploadStatus = async (uuid, file_size) => {
    return await this.agent
      .get(`/file/${uuid}/directUploadStatus`)
      .set('size', file_size)
  }
  uploadFileFromUrl = async (uuid, url) => {
    return await this.agent
      .post(`/file/${uuid}/fromUrl`)
      .send({url});
  }
  getFile = async (uuid) => {
    return await this.agent
      .get(`/file/${uuid}`);
  }

  // account

  register = async (email, password) => {
    return await this.agent
      .post(`/account/register`)
      .send({email, password});
  }

  confirmEmail = async (token) => {
    return await this.agent
      .get(`/account/confirm_email/${token}`);
  }
  
  login = async (email, password) => {
    return await this.agent
      .post(`/account/login`)
      .send({email, password});
  }

  accountPermissions = async () => {
    return await this.agent
      .get(`/account/permissions`);
  }

  accountSuspend = (password) => {
    return this.agent
      .post(`/account/suspend`)
      .send({password});
  }

  accountUpdate = async (update_properties, password) => {
    update_properties.verification_password = password;
    return await this.agent
      .post(`/account/update`)
      .send(update_properties);
  }

  accountGet = async () => {
    return await this.agent
      .get(`/account`);
  }

  accountGetDatasets = async () => {
    return await this.agent
      .get(`/account/datasets`);
  }

  accountGetTemplateFields = async () => {
    return await this.agent
      .get(`/account/template_fields`);
  }

  changeEmail = async (new_email, password) => {
    return await this.agent
      .post(`/account/change_email`)
      .send({new_email, verification_password: password});
  }

  get_test_unprotected_route = async () => {
    return await this.agent
      .get(`/account/test-unprotected-route`);
  };

  userTestingSetAdmin = async () => {
    return await this.agent
      .post(`/account/testing_set_admin`);
  }

  userTestingSetSuper = async () => {
    return await this.agent
      .post(`/account/testing_set_super`);
  }


  // users

  otherUserPermissions = async (email) => {
    return await this.agent
      .get(`/user/${email}/permissions`);
  }

  otherUserSuspend = (email) => {
    return this.agent
      .post(`/user/${email}/suspend`);
  }

  otherUserUpdate = async (update_properties, email) => {
    update_properties;
    return await this.agent
      .post(`/user/${email}/update`)
      .send(update_properties);
  }

  userGetByEmail = async (email) => {
    return await this.agent
      .get(`/user/${email}`);
  }

  otherUserChangeEmail = async (new_email, email) => {
    return await this.agent
      .post(`/user/${email}/change_email`)
      .send({new_email});
  }

  // import 

  importTemplate = async (template) => {
    return await this.agent
      .post(`/import/template/`)
      .send(template)
      .set('Accept', 'application/json');
  }

  importTemplateDataset = async (template) => {
    return await this.agent
      .post(`/import/template_with_dataset/`)
      .send(template)
      .set('Accept', 'application/json');
  }

  importRecords = async (records) => {
    return await this.agent
      .post(`/import/records/`)
      .send({records})
      .set('Accept', 'application/json');
  }

  // serving files

  basicServerSetup = () => {
    // Serve up public/ftp folder
    var serve = serveStatic(this.dynamicTestFilesPath);
    // Create server
    let server = http.createServer(function onRequest (req, res) {
    serve(req, res, finalhandler(req, res))
    });
    // Listen
    server.listen(0);
  
    let serverUrl = "http://localhost:" + (server.address() as AddressInfo).port + "/";
    return [server, serverUrl];
  }

  // other

  actAs = (req, user_email) => {
    return req.query({ user_email });
  }

}
