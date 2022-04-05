const request = require("supertest");
const fs = require('fs');
const path = require('path');
const MongoDB = require('../lib/mongoDB');
var { PERMISSION_ADMIN, PERMISSION_EDIT, PERMISSION_VIEW } = require('../models/permission_group');

module.exports = class Helper {
  constructor(app) {
    this.app = app;
  };

  VALID_UUID = "47356e57-eec2-431b-8059-f61d5f9a6bc6";
  DEF_CURR_USER = 'caleb';
  USER_2 = 'naruto';

  clearDatabase = async () => {
    let db = MongoDB.db();
    await db.collection('templates').deleteMany();
    await db.collection('template_fields').deleteMany();
    await db.collection('datasets').deleteMany();
    await db.collection('records').deleteMany();
    await db.collection('permission_groups').deleteMany();
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

  templateFieldCreate = async (field, current_user) => {
    return await request(this.app)
      .post(`/template_field`)
      .set('Cookie', [`user=${current_user}`])
      .send(field)
      .set('Accept', 'application/json');
  };

  templateFieldDraftGet = async (uuid, current_user) => {
    return await request(this.app)
      .get(`/template_field/${uuid}/draft`)
      .set('Cookie', [`user=${current_user}`])
      .set('Accept', 'application/json');
  };
  templateFieldDraftGetAndTest = async (uuid, current_user) => {
    return await this.testAndExtract(this.templateFieldDraftGet, uuid, current_user);
  };

  templateFieldUpdate = async (uuid, field, current_user) => {
    return await request(this.app)
      .put(`/template_field/${uuid}`)
      .set('Cookie', [`user=${current_user}`])
      .send(field)
      .set('Accept', 'application/json');
  };
  templateFieldUpdateAndTest = async (template_field, curr_user) => {
    delete template_field.updated_at
    let response = await this.templateFieldUpdate(template_field.uuid, template_field, curr_user);
    expect(response.statusCode).toBe(200);
  
    let new_draft = await this.templateFieldDraftGetAndTest(template_field.uuid, curr_user);
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

  templateFieldCreateAndTest = async (field, current_user) => {
    let response = await this.templateFieldCreate(field, current_user)
    expect(response.statusCode).toBe(200);
    expect(response.body.inserted_uuid).toBeTruthy();
  
    let new_field = await this.testAndExtract(this.templateFieldDraftGet, response.body.inserted_uuid, current_user);
    expect(new_field).toMatchObject(field);
    return new_field.uuid;
  };

  templateFieldLastUpdate = async (uuid, current_user) => {
    return await request(this.app)
      .get(`/template_field/${uuid}/last_update`)
      .set('Cookie', [`user=${current_user}`]);
  };

  templateFieldLastUpdateAndTest = async (uuid, current_user) => {
    return await this.testAndExtract(this.templateFieldLastUpdate, uuid, current_user);
  };

  templateFieldPersist = async (uuid, last_update, current_user) => {
    return await request(this.app)
    .post(`/template_field/${uuid}/persist`)
    .set('Cookie', [`user=${current_user}`])
    .send({last_update})
    .set('Accept', 'application/json');
  };
  
  templateFieldPersistAndTest = async (uuid, last_update, current_user) => {
    await this.testAndExtract(this.templateFieldPersist, uuid, last_update, current_user);
  };

  templateFieldLatestPersisted = async (uuid, current_user) => {
    return await request(this.app)
    .get(`/template_field/${uuid}/latest_persisted`)
    .set('Cookie', [`user=${current_user}`]);
  };

  templateFieldLatestPersistedBeforeDate = async (uuid, timestamp, current_user) => {
    return await request(this.app)
      .get(`/template_field/${uuid}/${timestamp}`)
      .set('Cookie', [`user=${current_user}`]);
  };

  templateFieldDraftExisting = async (uuid) => {
    return await request(this.app)
      .get(`/template_field/${uuid}/draft_existing`);
  };
  
  templateFieldDraftExistingAndTest = async (uuid) => {
    return await this.testAndExtract(this.templateFieldDraftExisting, uuid);
  };

  templateFieldPersistAfterCreateOrUpdateThenTest = async (field, current_user) => {
    let uuid = field.uuid;
    let last_update = await this.templateFieldLastUpdateAndTest(uuid, current_user);

    await this.templateFieldPersistAndTest(uuid, last_update, current_user);
  
    // Check that a persisted version now exists
    let persisted = await this.testAndExtract(this.templateFieldLatestPersisted, uuid, current_user);
    this.testTemplateFieldsEqual(field, persisted);
    expect(persisted).toHaveProperty("persist_date");

    // Check that we can still get a new draft if requested
    let new_draft = await this.templateFieldDraftGetAndTest(uuid, current_user);
    this.testTemplateFieldsEqual(field, new_draft);

    return persisted;
  };

  templateFieldCreatePersistTest = async (field, current_user) => {
    let uuid = await this.templateFieldCreateAndTest(field, current_user);
    field.uuid = uuid;

    return await this.templateFieldPersistAfterCreateOrUpdateThenTest(field, current_user);
  };

  templateFieldUpdatePersistTest = async (field, current_user) => {
    await this.templateFieldUpdateAndTest(field, current_user);
  
    expect(await this.templateFieldDraftExistingAndTest(field.uuid)).toBe(true);
  
    return await this.templateFieldPersistAfterCreateOrUpdateThenTest(field, current_user);
  };

  templateFieldDraftDelete = async (uuid, current_user) => {
    return await request(this.app)
      .delete(`/template_field/${uuid}/draft`)
      .set('Cookie', [`user=${current_user}`]);
  };
  templateFieldDraftDeleteAndTest = async (uuid, current_user) => {
    await this.testAndExtract(this.templateFieldDraftDelete, uuid, current_user);
  };

  // template

  templateCreate = async (template, current_user) => {
    return await request(this.app)
      .post('/template')
      .set('Cookie', [`user=${current_user}`])
      .send(template)
      .set('Accept', 'application/json');
  };

  templateDraftGet = async (uuid, current_user) => {
    return await request(this.app)
      .get(`/template/${uuid}/draft`)
      .set('Cookie', [`user=${current_user}`])
      .set('Accept', 'application/json');
  };
  templateDraftGetAndTest = async (uuid, current_user) => {
    return await this.testAndExtract(this.templateDraftGet, uuid, current_user);
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

  templateCreateAndTest = async (template, current_user) => {
    let response = await this.templateCreate(template, current_user);
    expect(response.statusCode).toBe(200);
    let uuid = response.body.inserted_uuid;
    expect(uuid).toBeTruthy();
  
    let new_draft = await this.testAndExtract(this.templateDraftGet, uuid, current_user)
    this.testTemplateDraftsEqual(template, new_draft);
    return new_draft;
  };

  templateLastUpdate = async(uuid, curr_user) => {
    return await request(this.app)
      .get(`/template/${uuid}/last_update`)
      .set('Cookie', [`user=${curr_user}`]);
  }
  templateLastUpdateAndTest = async(uuid, curr_user) => {
    return await this.testAndExtract(this.templateLastUpdate, uuid, curr_user);
  }

  templatePersist = async (uuid, last_update, curr_user) => {
    return await request(this.app)
      .post(`/template/${uuid}/persist`)
      .set('Cookie', [`user=${curr_user}`])
      .send({last_update})
      .set('Accept', 'application/json');
  };

  templateLatestPersisted = async(uuid, curr_user) => {
    return await request(this.app)
      .get(`/template/${uuid}/latest_persisted`)
      .set('Cookie', [`user=${curr_user}`])
      .set('Accept', 'application/json');
  }
  templateLatestPersistedAndTest = async(uuid, curr_user) => {
    return await this.testAndExtract(this.templateLatestPersisted, uuid, curr_user);
  }
  templateLatestPersistedBeforeDate = async (uuid, timestamp, curr_user) => {
    return await request(this.app)
      .get(`/template/${uuid}/${timestamp}`)
      .set('Cookie', [`user=${curr_user}`]);
  }

  templateDraftExisting = async (uuid) => {
    return await request(this.app)
      .get(`/template/${uuid}/draft_existing`);
  };
  
  templateDraftExistingAndTest = async (uuid) => {
    return await this.testAndExtract(this.templateDraftExisting, uuid);
  };

  templatePersistAndFetch = async (uuid, curr_user) => {
    let response = await this.templateLastUpdate(uuid, curr_user);
    expect(response.statusCode).toBe(200);
    let last_update = response.body;

    response = await this.templatePersist(uuid, last_update, curr_user);
    expect(response.statusCode).toBe(200);

    response = await this.templateLatestPersisted(uuid, curr_user);
    expect(response.statusCode).toBe(200);
    let persisted_template = response.body;
    expect(persisted_template).toHaveProperty("persist_date");
    return persisted_template;
  };

  templateCreatePersistTest = async (template, curr_user) => {
    let created_template = await this.templateCreateAndTest(template, curr_user);
    let persisted_template = await this.templatePersistAndFetch(created_template.uuid, curr_user)
    this.templateSortFieldsAndRelatedTemplates(template);
    this.templateSortFieldsAndRelatedTemplates(persisted_template);
    this.testTemplateDraftsEqual(template, persisted_template);
    return persisted_template;
  };

  templateUpdate = async (uuid, template, curr_user) => {
    return await request(this.app)
      .put(`/template/${uuid}`)
      .send(template)
      .set('Cookie', [`user=${curr_user}`])
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

  templateUpdateAndTest = async (template, curr_user) => {
    let response = await this.templateUpdate(template.uuid, template, curr_user);
    expect(response.statusCode).toBe(200);
  
    let new_draft = await this.templateDraftGetAndTest(template.uuid, curr_user);
    this.testTemplateDraftsEqual(template, new_draft);
  }

  templateUpdatePersistTest = async (template, curr_user) => {
    await this.templateUpdateAndTest(template, curr_user);
    let persisted_template = await this.templatePersistAndFetch(template.uuid, curr_user);
    this.testTemplateDraftsEqual(template, persisted_template);
    return persisted_template;
  };

  templateDelete = async (uuid, curr_user) => {
    return await request(this.app)
      .delete(`/template/${uuid}/draft`)
      .set('Cookie', [`user=${curr_user}`]);
  }
  templateDeleteAndTest = async (uuid, current_user) => {
    await this.testAndExtract(this.templateDelete, uuid, current_user);
  };

  templateDuplicate = async (uuid, curr_user) => {
    return await request(this.app)
      .post(`/template/${uuid}/duplicate`)
      .set('Cookie', [`user=${curr_user}`]);
  }

  // dataset

  datasetCreate = async (dataset, curr_user) => {
    return await request(this.app)
      .post(`/dataset`)
      .set('Cookie', [`user=${curr_user}`])
      .send(dataset)
      .set('Accept', 'application/json');
  }

  datasetDraftGet = async (uuid, curr_user) => {
    return await request(this.app)
      .get(`/dataset/${uuid}/draft`)
      .set('Cookie', [`user=${curr_user}`])
      .set('Accept', 'application/json');
  };
  datasetDraftGetAndTest = async (uuid, curr_user) => {
    return await this.testAndExtract(this.datasetDraftGet, uuid, curr_user);
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

  datasetCreateAndTest = async (dataset, curr_user) => {
    let response = await this.datasetCreate(dataset, curr_user);
    expect(response.statusCode).toBe(200);
    expect(response.body.inserted_uuid).toBeTruthy();
    let uuid = response.body.inserted_uuid;
    
    let created_dataset = await this.datasetDraftGetAndTest(uuid, curr_user);

    this.testDatasetDraftsEqual(dataset, created_dataset);
    return created_dataset;
  };

  datasetUpdate = async (uuid, dataset, curr_user) => {
    return await request(this.app)
      .put(`/dataset/${uuid}`)
      .send(dataset)
      .set('Cookie', [`user=${curr_user}`])
  };

  datasetLastUpdate = async(uuid, curr_user) => {
    return await request(this.app)
      .get(`/dataset/${uuid}/last_update`)
      .set('Cookie', [`user=${curr_user}`]);
  }
  datasetLastUpdateAndTest = async(uuid, curr_user) => {
    return await this.testAndExtract(this.datasetLastUpdate, uuid, curr_user);
  }

  datasetPersist = async (uuid, last_update, curr_user) => {
    return await request(this.app)
      .post(`/dataset/${uuid}/persist`)
      .set('Cookie', [`user=${curr_user}`])
      .send({last_update})
      .set('Accept', 'application/json');
  };

  datasetLatestPersisted = async(uuid, curr_user) => {
    return await request(this.app)
      .get(`/dataset/${uuid}/latest_persisted`)
      .set('Cookie', [`user=${curr_user}`])
      .set('Accept', 'application/json');
  }
  datasetLatestPersistedAndTest = async(uuid, curr_user) => {
    return await this.testAndExtract(this.datasetLatestPersisted, uuid, curr_user);
  }
  datasetLatestPersistedBeforeDate = async (uuid, timestamp, curr_user) => {
    return await request(this.app)
      .get(`/dataset/${uuid}/${timestamp}`)
      .set('Cookie', [`user=${curr_user}`]);
  }

  datasetPersistAndFetch = async (uuid, curr_user) => {
    let last_update = await this.datasetLastUpdateAndTest(uuid, curr_user);
    let response = await this.datasetPersist(uuid, last_update, curr_user);
    expect(response.statusCode).toBe(200);
  
    response = await this.datasetLatestPersisted(uuid, curr_user);
    expect(response.statusCode).toBe(200);
    let persisted_template = response.body;
    expect(persisted_template).toHaveProperty("persist_date");
    return persisted_template;
  };

  datasetCreatePersistTest = async (dataset, curr_user) => {
    let created_dataset = await this.datasetCreateAndTest(dataset, curr_user);
    let dataset_persisted = await this.datasetPersistAndFetch(created_dataset.uuid, curr_user)
    this.testDatasetDraftsEqual(dataset, dataset_persisted);
    return dataset_persisted;
  };

  datasetUpdateAndTest = async (dataset, curr_user) => {
    let response = await this.datasetUpdate(dataset.uuid, dataset, curr_user);
    expect(response.statusCode).toBe(200);
    
    let updated_dataset = await this.testAndExtract(this.datasetDraftGet, dataset.uuid, curr_user);
    this.testDatasetDraftsEqual(dataset, updated_dataset);
  };

  datasetUpdatePersistTest = async (dataset, curr_user) => {
    await this.datasetUpdateAndTest(dataset, curr_user);
    let persisted_dataset = await this.datasetPersistAndFetch(dataset.uuid, curr_user)
    this.testDatasetDraftsEqual(dataset, persisted_dataset);
    return persisted_dataset;
  };

  datasetDelete = async (uuid, curr_user) => {
    return await request(this.app)
      .delete(`/dataset/${uuid}/draft`)
      .set('Cookie', [`user=${curr_user}`]);
  }
  datasetDeleteAndTest = async (uuid, curr_user) => {
    await this.testAndExtract(this.datasetDelete, uuid, curr_user);
  }

  datasetDraftExisting = async (uuid) => {
    return await request(this.app)
      .get(`/dataset/${uuid}/draft_existing`)
      .set('Accept', 'application/json');
  };
  datasetDraftExistingAndTest = async (uuid) => {
    return await this.testAndExtract(this.datasetDraftExisting, uuid);
  }

  datasetDuplicate = async (uuid, curr_user) => {
    return await request(this.app)
      .post(`/dataset/${uuid}/duplicate`)
      .set('Cookie', [`user=${curr_user}`]);
  }

  newDatasetForTemplate = async (template_uuid, curr_user) => {
    return await request(this.app)
      .get(`/dataset/new_dataset_for_template/${template_uuid}`)
      .set('Cookie', [`user=${curr_user}`])
      .set('Accept', 'application/json');
  }
  newDatasetForTemplateAndTest = async (template_uuid, curr_user) => {
    return await this.testAndExtract(this.newDatasetForTemplate, template_uuid, curr_user);
  }

  datasetPublish = async (uuid, name, curr_user) => {
    return await request(this.app)
      .post(`/dataset/${uuid}/publish`)
      .set('Cookie', [`user=${curr_user}`])
      .send({name})
      .set('Accept', 'application/json');
  };

  datasetPublished = async (uuid, name, curr_user) => {
    return await request(this.app)
      .get(`/dataset/${uuid}/published/${name}`)
      .set('Cookie', [`user=${curr_user}`]);
  }

  // record
  
  recordCreate = async (record, curr_user) => {
    return await request(this.app)
      .post('/record')
      .send(record)
      .set('Cookie', [`user=${curr_user}`]);
  };
  
  recordDraftGet = async (uuid, curr_user) => {
    return await request(this.app)
      .get(`/record/${uuid}/draft`)
      .set('Cookie', [`user=${curr_user}`])
      .set('Accept', 'application/json');
  };
  recordDraftGetAndTest = async (uuid, curr_user) => {
    return await this.testAndExtract(this.recordDraftGet, uuid, curr_user);
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
    if(before.value) {
      if(after.type == 'file' && before.value == 'new'){
        ;
      } else {
        expect(after.value).toEqual(before.value);
      }
    }
    if(before.values) {
      expect(after.values.length).toBe(before.values.length);
      before.values.sort(Helper.sortArrayByUuidProperty);
      after.values.sort(Helper.sortArrayByUuidProperty);
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
      before.fields.sort(Helper.sortArrayByNameProperty);
      after.fields.sort(Helper.sortArrayByNameProperty);
      for(let i = 0; i < before.fields.length; i++) {
        this.testRecordFieldsEqual(before.fields[i], after.fields[i]);
      }
    }
    if(before.related_records) {
      expect(after.related_records.length).toBe(before.related_records.length);
      before.related_records.sort(Helper.sortArrayByNameProperty);
      after.related_records.sort(Helper.sortArrayByNameProperty);
      for(let i = 0; i < before.related_records.length; i++) {
        this.testRecordsEqual(before.related_records[i], after.related_records[i]);
      }
    }
  }
  
  recordCreateAndTest = async (input_record, curr_user) => {
    let response = await this.recordCreate(input_record, curr_user);
    expect(response.statusCode).toBe(200);
    let uuid = response.body.inserted_uuid;
  
    input_record.uuid = uuid;
    
    let created_record = await this.recordDraftGetAndTest(uuid, curr_user);
    this.testRecordsEqual(input_record, created_record);
    return created_record;
  };
  
  recordUpdate = async (record, uuid, curr_user) => {
    return await request(this.app)
      .put(`/record/${uuid}`)
      .send(record)
      .set('Cookie', [`user=${curr_user}`]);
  };
  
  recordUpdateAndTest = async (record, curr_user) => {
    let response = await this.recordUpdate(record, record.uuid, curr_user);
    expect(response.statusCode).toBe(200);
    
    let updated_record = await this.testAndExtract(this.recordDraftGet, record.uuid, curr_user);
    this.testRecordsEqual(record, updated_record);
    return updated_record;
  };
  
  recordDelete = async (uuid, curr_user) => {
    return await request(this.app)
      .delete(`/record/${uuid}/draft`)
      .set('Cookie', [`user=${curr_user}`]);
  };
  recordDeleteAndTest = async (uuid, curr_user) => {
    await this.testAndExtract(this.recordDelete, uuid, curr_user);
  };
  
  recordPersist = async (uuid, last_update, curr_user) => {
    return await request(this.app)
      .post(`/record/${uuid}/persist`)
      .send({last_update})
      .set('Cookie', [`user=${curr_user}`]);
  }
  
  recordLatestPersistedGet = async (uuid, curr_user) => {
    return await request(this.app)
      .get(`/record/${uuid}/latest_persisted`)
      .set('Cookie', [`user=${curr_user}`])
      .set('Accept', 'application/json');
  };
  
  recordPersistAndTest = async (record, curr_user) => {
    let uuid = record.uuid;
    let last_update = await this.recordLastUpdateAndTest(uuid, curr_user);
    let response = await this.recordPersist(uuid, last_update, curr_user);
    expect(response.statusCode).toBe(200);
    let persisted = await this.testAndExtract(this.recordLatestPersistedGet, uuid, curr_user);
    expect(persisted).toHaveProperty("persist_date");
    this.testRecordsEqual(record, persisted);
    return persisted;
  }
  
  recordCreatePersistTest = async (record, curr_user) => {
    let created_record = await this.recordCreateAndTest(record, curr_user);
    let persisted = await this.recordPersistAndTest(created_record, curr_user)
    expect(persisted).toMatchObject(record);
    return persisted;
  };
  
  recordDraftExisting = async (uuid) => {
    let response = await request(this.app)
      .get(`/record/${uuid}/draft_existing`)
      .set('Accept', 'application/json');
    expect(response.statusCode).toBe(200);
    return response.body;
  }
  
  recordGetPersistedBeforeTimestamp = async(uuid, time, curr_user) => {
    let response = await request(this.app)
      .get(`/record/${uuid}/${time.toISOString()}`)
      .set('Cookie', [`user=${curr_user}`])
      .set('Accept', 'application/json');
    return response;
  }
  
  recordLastUpdate = async(uuid, curr_user) => {
    return await request(this.app)
      .get(`/record/${uuid}/last_update`)
      .set('Cookie', [`user=${curr_user}`]);
  }
  
  recordLastUpdateAndTest = async(uuid, curr_user) => {
    let response = await this.recordLastUpdate(uuid, curr_user);
    expect(response.statusCode).toBe(200);
    return new Date(response.body);
  }
  
  recordPersistAndFetch = async (uuid, curr_user) => {
    let response = await this.recordLastUpdate(uuid, curr_user);
    expect(response.statusCode).toBe(200);
    let last_update = response.body;
  
    response = await this.recordPersist(uuid, last_update, curr_user);
    expect(response.statusCode).toBe(200);
  
    response = await this.recordLatestPersistedGet(uuid, curr_user);
    expect(response.statusCode).toBe(200);
    let persisted_record = response.body;
    expect(persisted_record).toHaveProperty("persist_date");
    return persisted_record;
  };
  
  recordUpdatePersistTest = async (record, curr_user) => {
    await this.recordUpdateAndTest(record, curr_user);
    let persisted_record = await this.recordPersistAndFetch(record.uuid, curr_user);
    this.testRecordsEqual(record, persisted_record);
    return persisted_record;
  };

  // permission group

  getPermissionGroup = async (uuid, category) => {
    return await request(this.app)
      .get(`/permission_group/${uuid}/${category}`)
      .set('Accept', 'application/json');
  };

  updatePermissionGroup = async (current_user, uuid, category, users) => {
    return await request(this.app)
      .put(`/permission_group/${uuid}/${category}`)
      .set('Cookie', [`user=${current_user}`])
      .send({users})
      .set('Accept', 'application/json');
  }

  testPermissionGroup = async (uuid, category, statusCode, users) => {
    let response = await this.getPermissionGroup(uuid, category);
    if(!statusCode) {
      statusCode = 200;
    }
    expect(response.statusCode).toBe(statusCode);
    if(statusCode == 200) {
      expect(response.body).toEqual(users);
    }
  };

  testPermissionGroupsInitializedFor = async (uuid, user) => {
    if(!user) {
      user = Helper.DEF_CURR_USER;
    }
    await this.testPermissionGroup(uuid, PERMISSION_ADMIN, 200, [user]);
    await this.testPermissionGroup(uuid, PERMISSION_EDIT, 200, []);
    await this.testPermissionGroup(uuid, PERMISSION_VIEW, 200, []);
  }

  permissionGroupTestingInitialize = async (uuid, current_user) => {
    return await request(this.app)
      .post(`/permission_group/${uuid}/testing_initialize`)
      .set('Cookie', [`user=${current_user}`])
      .set('Accept', 'application/json');
  }
  
  permissionGroupTestingHasPermission = async (uuid, category, current_user) => {
    return await request(this.app)
      .post(`/permission_group/${uuid}/${category}/testing_has_permission`)
      .set('Cookie', [`user=${current_user}`])
      .set('Accept', 'application/json');
  }

  // files 

  dynamicTestFilesPath = __dirname + '/test_data/dynamic_files'
  uploadsDirectoryPath = __dirname + "/../uploads"

  clearFilesAtPath = (directory) => {
    fs.readdir(directory, (err, files) => {
      if (err) throw err;
    
      for (let file of files) {
        fs.unlink(path.join(directory, file), err => {
          if (err) throw err;
        });
      }
    });
  };

  createFile = (file_name, contents) => {
    let new_file_path = path.join(this.dynamicTestFilesPath, file_name);
    fs.writeFileSync(new_file_path, contents);
  }

  uploadFileDirect = async (uuid, file_name, curr_user) => {
    return await request(this.app)
      .post(`/file/${uuid}/direct`)
      .set('Cookie', [`user=${curr_user}`])
      .attach('file', path.join(this.dynamicTestFilesPath, file_name));
  }
  uploadFileFromUrl = async (uuid, url, curr_user) => {
    return await request(this.app)
      .post(`/file/${uuid}/fromUrl`)
      .set('Cookie', [`user=${curr_user}`])
      .send({url});
  }
  getFile = async (uuid, curr_user) => {
    return await request(this.app, curr_user)
      .get(`/file/${uuid}`)
      .set('Cookie', [`user=${curr_user}`]);
  }

}

