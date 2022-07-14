const request = require("supertest");
const fs = require('fs');
const path = require('path');
var finalhandler = require('finalhandler')
var http = require('http')
var serveStatic = require('serve-static')
import { AddressInfo } from 'net'
const MongoDB = require('../lib/mongoDB');
var { PermissionTypes } = require('../models/permission');
const FieldTypes = require('../models/template_field').FieldTypes;
var appRoot = require('app-root-path');

export = class Helper {
  public constructor(private app) {
    this.app = app;
  };

  private agent;

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
    this.setAgent(this.agent.auth(login_token, { type: 'bearer' }));
    return agent;
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

  // A wrapper function which calls the api callback with the specified args,
  // verifies that the status code is 200, and returns the response
  testAndExtract = async(callback, ...args) => {
    let response = await callback(...args);
    expect(response.statusCode).toBe(200);
    return response.body;
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
        before[i].options = before[i].radio_options;
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
    // So import can also use this function
    if(!before.options) {
      before.options = before.radio_options;
    }
    this.testTemplateFieldOptionsEqual(before.options, after.options);
  }

  templateFieldCreateAndTest = async (field) => {
    let response = await this.templateFieldCreate(field)
    expect(response.statusCode).toBe(200);
    expect(response.body.inserted_uuid).toBeTruthy();
  
    let new_field = await this.testAndExtract(this.templateFieldDraftGet, response.body.inserted_uuid);
    expect(new_field).toMatchObject(field);
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
  }

  templateCreateAndTest = async (template) => {
    let response = await this.templateCreate(template);
    expect(response.statusCode).toBe(200);
    let uuid = response.body.inserted_uuid;
    expect(uuid).toBeTruthy();
  
    let new_draft = await this.testAndExtract(this.templateDraftGet, uuid)
    this.testTemplateDraftsEqual(template, new_draft);
    return new_draft;
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
    this.templateSortFieldsAndRelatedTemplates(template);
    this.templateSortFieldsAndRelatedTemplates(persisted_template);
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

  templateUpdateAndTest = async (template) => {
    let response = await this.templateUpdate(template.uuid, template);
    expect(response.statusCode).toBe(200);
  
    let new_draft = await this.templateDraftGetAndTest(template.uuid);
    this.testTemplateDraftsEqual(template, new_draft);
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
    expect(created.template_id).toBe(original.template_id);
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
  }

  datasetCreateAndTest = async (dataset) => {
    let response = await this.datasetCreate(dataset);
    expect(response.statusCode).toBe(200);
    expect(response.body.inserted_uuid).toBeTruthy();
    let uuid = response.body.inserted_uuid;
    
    let created_dataset = await this.datasetDraftGetAndTest(uuid);

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

  datasetPersistAndFetch = async (uuid) => {
    let last_update = await this.datasetLastUpdateAndTest(uuid);
    let response = await this.datasetPersist(uuid, last_update);
    expect(response.statusCode).toBe(200);
  
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
    expect(response.statusCode).toBe(200);
    
    let updated_dataset = await this.testAndExtract(this.datasetDraftGet, dataset.uuid);
    this.testDatasetDraftsEqual(dataset, updated_dataset);
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

  datasetAllPublicUuids = async () => {
    return await this.agent
      .get(`/dataset/all_public_uuids`);
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
      // must be after.type because the type is stored in the template, not the record
      if(after.type == FieldTypes.File && before.file.uuid == 'new'){
        ;
      } else {
        expect(after.file.uuid).toEqual(before.file.uuid);
      }
      if(after.type == FieldTypes.File) {
        expect(after.file.name).toEqual(before.file.name);
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
      expect(after.fields.length).toBe(before.fields.length);
      before.fields.sort(this.sortArrayByNameProperty);
      after.fields.sort(this.sortArrayByNameProperty);
      for(let i = 0; i < before.fields.length; i++) {
        this.testRecordFieldsEqual(before.fields[i], after.fields[i]);
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
    let uuid = response.body.inserted_uuid;
      
    let created_record = await this.recordDraftGetAndTest(uuid);
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
    
    let updated_record = await this.testAndExtract(this.recordDraftGet, record.uuid);
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
    expect(persisted).toMatchObject(record);
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

  // permission group

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

  // files 

  testDataPath = appRoot + '/test_data'
  dynamicTestFilesPath = appRoot + '/test_data/dynamic_files'
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
    return await this.agent
      .post(`/file/${uuid}/direct`)
      .attach('file', path.join(this.dynamicTestFilesPath, file_name));
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
      .post(`/account/confirm_email/${token}`);
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

