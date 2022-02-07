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

  // testTemplateFieldDraftsEqual = (original, created) => {
  //   if(original.uuid) {
  //     expect(created.uuid).toBe(original.uuid);
  //   }
  //   if(original.name) {
  //     expect(created.name).toEqual(original.name);
  //   }
  //   if(original.description) {
  //     expect(created.description).toEqual(original.description);
  //   }
  // }

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

  templateFieldPublish = async (uuid, last_update, current_user) => {
    return await request(this.app)
    .post(`/template_field/${uuid}/publish`)
    .set('Cookie', [`user=${current_user}`])
    .send({last_update})
    .set('Accept', 'application/json');
  };

  templateFieldLatestPublished = async (uuid, current_user) => {
    return await request(this.app)
    .get(`/template_field/${uuid}/latest_published`)
    .set('Cookie', [`user=${current_user}`]);
  };

  templateFieldCreatePublishTest = async (field, current_user) => {
    let uuid = await this.templateFieldCreateAndTest(field, current_user);

    let response = await this.templateFieldLastUpdate(uuid, current_user);
    expect(response.statusCode).toBe(200);
    let last_update = response.body;

    response = await this.templateFieldPublish(uuid, last_update, current_user);
    expect(response.statusCode).toBe(200);
  
    // Check that a published version now exists
    response = await this.templateFieldLatestPublished(uuid, current_user);
    expect(response.statusCode).toBe(200);
    let published = response.body;
    expect(published).toMatchObject(field);
    expect(published).toHaveProperty("publish_date");

    // Check that we can still get a draft version
    response = await this.templateFieldDraftGet(uuid, current_user);
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject(field);

    return published;
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
      for(let i = 0; i < original.fields.length; i++) {
        expect(created.fields[i]).toMatchObject(original.fields[i]);
        // TODO: at some point, use this instead
        // testTemplateFieldDraftsEqual(original.fields[i], created.fields[i]);
      }
    }
    if(original.related_templates) {
      expect(created.related_templates.length).toBe(original.related_templates.length);
      for(let i = 0; i < original.related_templates.length; i++) {
        this.testTemplateDraftsEqual(original.related_templates[i], created.related_templates[i]);
      }
    }
    if(original.subscribed_templates) {
      expect(created.subscribed_templates.length).toBe(original.subscribed_templates.length);
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
    expect(published_template).toMatchObject(template);
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
      template.fields.sort((f1, f2) => {f1.name > f2.name});
    } 
    if(template.related_templates) {
      template.related_templates.sort((t1, t2) => {t1.name > t2.name});
      for(let related_template of template.related_templates) {
        this.templateSortFieldsAndRelatedTemplates(related_template);
      }
    }
  }

  templateUpdateAndTest = async (template, curr_user) => {
    this.templateCleanseMetadata(template);
    let response = await this.templateUpdate(template.uuid, template, curr_user);
    expect(response.statusCode).toBe(200);
  
    response = await this.templateDraftGet(template.uuid, curr_user);
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject(template);
  }

  templateUpdatePublishTest = async (template, curr_user) => {
    await this.templateUpdateAndTest(template, curr_user);
    let published_template = await this.templatePublishAndFetch(template.uuid, curr_user);
    expect(published_template).toMatchObject(template);
    return published_template;
  };

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

  // record

  recordDraftGet = async (uuid, curr_user) => {
    return await request(this.app)
      .get(`/record/${uuid}/draft`)
      .set('Cookie', [`user=${curr_user}`])
      .set('Accept', 'application/json');
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
}

