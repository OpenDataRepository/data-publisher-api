const request = require("supertest");
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
    let response = await this.templateFieldDraftGet(uuid, current_user);
    expect(response.statusCode).toBe(200);
    return response.body;
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
  
    response = await this.templateFieldDraftGet(response.body.inserted_uuid, current_user);
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject(field);
    return response.body.uuid;
  };

  templateFieldLastUpdate = async (uuid, current_user) => {
    return await request(this.app)
      .get(`/template_field/${uuid}/last_update`)
      .set('Cookie', [`user=${current_user}`]);
  };

  templateFieldLastUpdateAndTest = async (uuid, current_user) => {
    let response = await this.templateFieldLastUpdate(uuid, current_user);
    expect(response.statusCode).toBe(200);
    return response.body;
  };

  templateFieldPublish = async (uuid, last_update, current_user) => {
    return await request(this.app)
    .post(`/template_field/${uuid}/publish`)
    .set('Cookie', [`user=${current_user}`])
    .send({last_update})
    .set('Accept', 'application/json');
  };
  
  templateFieldPublishAndTest = async (uuid, last_update, current_user) => {
    let response = await this.templateFieldPublish(uuid, last_update, current_user);
    expect(response.statusCode).toBe(200);
  };

  templateFieldLatestPublished = async (uuid, current_user) => {
    return await request(this.app)
    .get(`/template_field/${uuid}/latest_published`)
    .set('Cookie', [`user=${current_user}`]);
  };

  templateFieldLatestPublishedBeforeDate = async (uuid, timestamp, current_user) => {
    return await request(this.app)
      .get(`/template_field/${uuid}/${timestamp}`)
      .set('Cookie', [`user=${current_user}`]);
  };

  templateFieldDraftExisting = async (uuid) => {
    return await request(this.app)
      .get(`/template_field/${uuid}/draft_existing`);
  };
  
  templateFieldDraftExistingAndTest = async (uuid) => {
    let response = await this.templateFieldDraftExisting(uuid);
    expect(response.statusCode).toBe(200);
    return response.body;
  };

  templateFieldPublishAfterCreateOrUpdateThenTest = async (field, current_user) => {
    let uuid = field.uuid;
    let last_update = await this.templateFieldLastUpdateAndTest(uuid, current_user);

    await this.templateFieldPublishAndTest(uuid, last_update, current_user);
  
    // Check that a published version now exists
    let response = await this.templateFieldLatestPublished(uuid, current_user);
    expect(response.statusCode).toBe(200);
    let published = response.body;
    this.testTemplateFieldsEqual(field, published);
    expect(published).toHaveProperty("publish_date");

    // Check that we can still get a new draft if requested
    let new_draft = await this.templateFieldDraftGetAndTest(uuid, current_user);
    this.testTemplateFieldsEqual(field, new_draft);

    return published;
  };

  templateFieldCreatePublishTest = async (field, current_user) => {
    let uuid = await this.templateFieldCreateAndTest(field, current_user);
    field.uuid = uuid;

    return await this.templateFieldPublishAfterCreateOrUpdateThenTest(field, current_user);
  };

  templateFieldUpdatePublishTest = async (field, current_user) => {
    await this.templateFieldUpdateAndTest(field, current_user);
  
    expect(await this.templateFieldDraftExistingAndTest(field.uuid)).toBe(true);
  
    return await this.templateFieldPublishAfterCreateOrUpdateThenTest(field, current_user);
  };

  templateFieldDraftDelete = async (uuid, current_user) => {
    return await request(this.app)
      .delete(`/template_field/${uuid}/draft`)
      .set('Cookie', [`user=${current_user}`]);
  };
  templateFieldDraftDeleteAndTest = async (uuid, current_user) => {
    let response = await this.templateFieldDraftDelete(uuid, current_user);
    expect(response.statusCode).toBe(200);
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
    let response = await this.templateDraftGet(uuid, current_user);
    expect(response.statusCode).toBe(200);
    return response.body;
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

  // TODO: rename v2 to the original and fix everything
  templateCreateAndTest = async (template, current_user) => {
    return (await this.templateCreateAndTestV2(template, current_user)).uuid;
  };
  templateCreateAndTestV2 = async (template, current_user) => {
    let response = await this.templateCreate(template, current_user);
    expect(response.statusCode).toBe(200);
    let uuid = response.body.inserted_uuid;
    expect(uuid).toBeTruthy();
  
    response = await this.templateDraftGet(uuid, current_user)
    expect(response.statusCode).toBe(200);
    this.testTemplateDraftsEqual(template, response.body);
    return response.body;
  };

  templateLastUpdate = async(uuid, curr_user) => {
    return await request(this.app)
      .get(`/template/${uuid}/last_update`)
      .set('Cookie', [`user=${curr_user}`]);
  }
  templateLastUpdateAndTest = async(uuid, curr_user) => {
    let response = await this.templateLastUpdate(uuid, curr_user);
    return response.body;
  }

  templatePublish = async (uuid, last_update, curr_user) => {
    return await request(this.app)
      .post(`/template/${uuid}/publish`)
      .set('Cookie', [`user=${curr_user}`])
      .send({last_update})
      .set('Accept', 'application/json');
  };

  templateLatestPublished = async(uuid, curr_user) => {
    return await request(this.app)
      .get(`/template/${uuid}/latest_published`)
      .set('Cookie', [`user=${curr_user}`])
      .set('Accept', 'application/json');
  }
  templateLatestPublishedBeforeDate = async (uuid, timestamp, curr_user) => {
    return await request(this.app)
      .get(`/template/${uuid}/${timestamp}`)
      .set('Cookie', [`user=${curr_user}`]);
  }

  templateDraftExisting = async (uuid) => {
    return await request(this.app)
      .get(`/template/${uuid}/draft_existing`);
  };
  
  templateDraftExistingAndTest = async (uuid) => {
    let response = await this.templateDraftExisting(uuid);
    expect(response.statusCode).toBe(200);
    return response.body;
  };

  templatePublishAndFetch = async (uuid, curr_user) => {
    let response = await this.templateLastUpdate(uuid, curr_user);
    expect(response.statusCode).toBe(200);
    let last_update = response.body;

    response = await this.templatePublish(uuid, last_update, curr_user);
    expect(response.statusCode).toBe(200);

    response = await this.templateLatestPublished(uuid, curr_user);
    expect(response.statusCode).toBe(200);
    let published_template = response.body;
    expect(published_template).toHaveProperty("publish_date");
    return published_template;
  };

  templateCreatePublishTest = async (template, curr_user) => {
    let created_template = await this.templateCreateAndTestV2(template, curr_user);
    let published_template = await this.templatePublishAndFetch(created_template.uuid, curr_user)
    this.templateSortFieldsAndRelatedTemplates(template);
    this.templateSortFieldsAndRelatedTemplates(published_template);
    this.testTemplateDraftsEqual(template, published_template);
    return published_template;
  };

  templateUpdate = async (uuid, template, curr_user) => {
    return await request(this.app)
      .put(`/template/${uuid}`)
      .send(template)
      .set('Cookie', [`user=${curr_user}`])
      .set('Accept', 'application/json');
  }

  templateCleanseMetadata = (template) => {
    if(!template) {
      return;
    }  
    delete template.updated_at;
    delete template._id;
    delete template.publish_date;
    if(template.fields) {
      for(let field of template.fields) {
        delete field.updated_at;
      }
    }
    if(template.related_templates) {
      for(template of template.related_templates) {
        this.templateCleanseMetadata(template);
      }
    }
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

  templateUpdatePublishTest = async (template, curr_user) => {
    await this.templateUpdateAndTest(template, curr_user);
    let published_template = await this.templatePublishAndFetch(template.uuid, curr_user);
    this.testTemplateDraftsEqual(template, published_template);
    return published_template;
  };

  templateDelete = async (uuid, curr_user) => {
    return await request(this.app)
      .delete(`/template/${uuid}/draft`)
      .set('Cookie', [`user=${curr_user}`]);
  }
  templateDeleteAndTest = async (uuid, current_user) => {
    let response = await this.templateDelete(uuid, current_user);
    expect(response.statusCode).toBe(200);
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

  datasetCreateAndTest = async (dataset, curr_user) => {
    let response = await this.datasetCreate(dataset, curr_user);
    expect(response.statusCode).toBe(200);
    expect(response.body.inserted_uuid).toBeTruthy();
  
    let uuid = response.body.inserted_uuid;
    
    response = await this.datasetDraftGet(uuid, curr_user);
    expect(response.statusCode).toBe(200);
    let created_dataset = response.body;
    this.datasetCleanseMetadata(dataset);
    expect(created_dataset).toMatchObject(dataset);
    return created_dataset.uuid;
  };
  datasetCreateAndTestV2 = async (dataset, curr_user) => {
    let response = await this.datasetCreate(dataset, curr_user);
    expect(response.statusCode).toBe(200);
    expect(response.body.inserted_uuid).toBeTruthy();
  
    let uuid = response.body.inserted_uuid;
    
    response = await this.datasetDraftGet(uuid, curr_user);
    expect(response.statusCode).toBe(200);
    let created_dataset = response.body;
    this.datasetCleanseMetadata(dataset);
    expect(created_dataset).toMatchObject(dataset);
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
    let response = await this.datasetLastUpdate(uuid, curr_user);
    expect(response.statusCode).toBe(200);
    return response.body;
  }

  datasetPublish = async (uuid, last_update, curr_user) => {
    return await request(this.app)
      .post(`/dataset/${uuid}/publish`)
      .set('Cookie', [`user=${curr_user}`])
      .send({last_update})
      .set('Accept', 'application/json');
  };

  datasetLatestPublished = async(uuid, curr_user) => {
    return await request(this.app)
      .get(`/dataset/${uuid}/latest_published`)
      .set('Cookie', [`user=${curr_user}`])
      .set('Accept', 'application/json');
  }
  datasetLatestPublishedBeforeDate = async (uuid, timestamp, curr_user) => {
    return await request(this.app)
      .get(`/dataset/${uuid}/${timestamp}`)
      .set('Cookie', [`user=${curr_user}`]);
  }

  datasetPublishAndFetch = async (uuid, curr_user) => {
    let last_update = await this.datasetLastUpdateAndTest(uuid, curr_user);
    let response = await this.datasetPublish(uuid, last_update, curr_user);
    expect(response.statusCode).toBe(200);
  
    response = await this.datasetLatestPublished(uuid, curr_user);
    expect(response.statusCode).toBe(200);
    let published_template = response.body;
    expect(published_template).toHaveProperty("publish_date");
    return published_template;
  };

  datasetCreatePublishTest = async (dataset, curr_user) => {
    let uuid = await this.datasetCreateAndTest(dataset, curr_user);
    let dataset_published = await this.datasetPublishAndFetch(uuid, curr_user)
    expect(dataset_published).toMatchObject(dataset);
    return dataset_published;
  };

  datasetCleanseMetadata = (dataset) => {
    if(!dataset) {
      return;
    }  
    delete dataset.updated_at;
    delete dataset._id;
    delete dataset.publish_date;
    delete dataset.template_id;
    if(dataset.related_datasets) {
      for(dataset of dataset.related_datasets) {
        this.datasetCleanseMetadata(dataset);
      }
    }
  }

  datasetUpdateAndTest = async (dataset, curr_user) => {
    let response = await this.datasetUpdate(dataset.uuid, dataset, curr_user);
    expect(response.statusCode).toBe(200);
    
    response = await this.datasetDraftGet(dataset.uuid, curr_user);
    expect(response.statusCode).toBe(200);
    let updated_dataset = response.body;
    this.datasetCleanseMetadata(dataset);
    expect(updated_dataset).toMatchObject(dataset);
  };

  datasetUpdatePublishTest = async (dataset, curr_user) => {
    await this.datasetUpdateAndTest(dataset, curr_user);
    let published_dataset = await this.datasetPublishAndFetch(dataset.uuid, curr_user)
    expect(published_dataset).toMatchObject(dataset);
    return published_dataset;
  };

  datasetDelete = async (uuid, curr_user) => {
    return await request(this.app)
      .delete(`/dataset/${uuid}/draft`)
      .set('Cookie', [`user=${curr_user}`]);
  }
  datasetDeleteAndTest = async (uuid, curr_user) => {
    let response = await this.datasetDelete(uuid, curr_user);
    expect(response.statusCode).toBe(200);
  }

  datasetDraftExisting = async (uuid) => {
    return await request(this.app)
      .get(`/dataset/${uuid}/draft_existing`)
      .set('Accept', 'application/json');
  };
  datasetDraftExistingAndTest = async (uuid) => {
    let response = await this.datasetDraftExisting(uuid);
    expect(response.statusCode).toBe(200);
    return response.body;
  }

  datasetDuplicate = async (uuid, curr_user) => {
    return await request(this.app)
      .post(`/dataset/${uuid}/duplicate`)
      .set('Cookie', [`user=${curr_user}`]);
  }

  // record

  recordCleanseMetadata = (record) => {
    if(!record) {
      return;
    }  
    delete record.updated_at;
    delete record._id;
    delete record.publish_date;
    delete record.dataset_id;
    if(record.related_records) {
      for(record of record.related_records) {
        this.recordCleanseMetadata(record);
      }
    }
  }
  
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
    let response = await this.recordDraftGet(uuid, curr_user);
    expect(response.statusCode).toBe(200);
    return response.body;
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
  
  recordCreateAndTest = async (record, curr_user) => {
    let created_record = await this.recordCreateAndTestV2(record, curr_user);
    return created_record.uuid;
  };
  recordCreateAndTestV2 = async (input_record, curr_user) => {
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
    delete record.updated_at;
    
    response = await this.recordDraftGet(record.uuid, curr_user);
    expect(response.statusCode).toBe(200);
    let updated_record = response.body;
    this.recordCleanseMetadata(record);
    expect(updated_record).toMatchObject(record);
  };
  
  recordDelete = async (uuid, curr_user) => {
    return await request(this.app)
      .delete(`/record/${uuid}/draft`)
      .set('Cookie', [`user=${curr_user}`]);
  };
  recordDeleteAndTest = async (uuid, curr_user) => {
    let response = await this.recordDelete(uuid, curr_user);
    expect(response.statusCode).toBe(200);
  };
  
  recordPublish = async (uuid, last_update, curr_user) => {
    return await request(this.app)
      .post(`/record/${uuid}/publish`)
      .send({last_update})
      .set('Cookie', [`user=${curr_user}`]);
  }
  
  recordLatestPublishedGet = async (uuid, curr_user) => {
    return await request(this.app)
      .get(`/record/${uuid}/latest_published`)
      .set('Cookie', [`user=${curr_user}`])
      .set('Accept', 'application/json');
  };
  
  recordPublishAndTest = async (uuid, record, curr_user) => {
    let last_update = await this.recordLastUpdateAndTest(uuid, curr_user);
    let response = await this.recordPublish(uuid, last_update, curr_user);
    expect(response.statusCode).toBe(200);
    response = await this.recordLatestPublishedGet(uuid, curr_user);
    expect(response.statusCode).toBe(200);
    let published = response.body;
    expect(published).toHaveProperty("publish_date");
    this.recordCleanseMetadata(record);
    expect(published).toMatchObject(record);
    return published;
  }
  
  recordCreatePublishTest = async (record, curr_user) => {
    let uuid = await this.recordCreateAndTest(record, curr_user);
    record.uuid = uuid;
    let published = await this.recordPublishAndTest(uuid, record, curr_user)
    expect(published).toMatchObject(record);
    return published;
  };
  
  recordDraftExisting = async (uuid) => {
    let response = await request(this.app)
      .get(`/record/${uuid}/draft_existing`)
      .set('Accept', 'application/json');
    expect(response.statusCode).toBe(200);
    return response.body;
  }
  
  recordGetPublishedBeforeTimestamp = async(uuid, time, curr_user) => {
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
  
  recordPublishAndFetch = async (uuid, curr_user) => {
    let response = await this.recordLastUpdate(uuid, curr_user);
    expect(response.statusCode).toBe(200);
    let last_update = response.body;
  
    response = await this.recordPublish(uuid, last_update, curr_user);
    expect(response.statusCode).toBe(200);
  
    response = await this.recordLatestPublishedGet(uuid, curr_user);
    expect(response.statusCode).toBe(200);
    let published_record = response.body;
    expect(published_record).toHaveProperty("publish_date");
    return published_record;
  };
  
  recordUpdatePublishTest = async (record, curr_user) => {
    await this.recordUpdateAndTest(record, curr_user);
    let published_record = await this.recordPublishAndFetch(record.uuid, curr_user)
    expect(published_record).toMatchObject(record);
    return published_record;
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
}

