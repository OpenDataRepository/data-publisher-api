const request = require("supertest");
const MongoDB = require('../lib/mongoDB');
var { app, init: appInit } = require('../app');
var HelperClass = require('./common_test_operations')
var Helper = new HelperClass(app);

const ValidUUID = "47356e57-eec2-431b-8059-f61d5f9a6bc6";

beforeAll(async () => {
  await appInit();
});

async function clearDatabase() {
  let db = MongoDB.db();
  await db.collection('templates').deleteMany();
  await db.collection('template_fields').deleteMany();
  await db.collection('records').deleteMany();
}

beforeEach(async() => {
  await clearDatabase();
});

afterAll(async () => {
  await clearDatabase();
  await MongoDB.close();
});

const templateLastUpdate = async(uuid) => {
  let response = await request(app)
    .get(`/template/${uuid}/last_update`);
  expect(response.statusCode).toBe(200);
  return response.body;
}

const templatePublish = async (uuid, last_update) => {
  let response = await request(app)
    .post(`/template/${uuid}/publish`)
    .send({last_update})
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);
};

const templateGet = async(uuid) => {
  let response = await request(app)
    .get(`/template/${uuid}/latest_published`)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);
  return response.body;
}

const templateCreateAndPublish = async(template) => {
  let uuid = await Helper.templateCreateAndTest(template);
  let last_update = await templateLastUpdate(uuid);
  await templatePublish(uuid, last_update);
  let published_template = await templateGet(uuid);
  return published_template;
}

const deleteTemplateUpdatedAtValues = async (template) => {
  if(!template) {
    return;
  }  
  delete template.updated_at;
  for(field of template.fields) {
    delete field.updated_at;
  }
  for(template of template.related_templates) {
    deleteTemplateUpdatedAtValues(template);
  }
}

const deleteTemplate_IdValues = async (template) => {
  if(!template) {
    return;
  }  
  delete template._id;
  for(field of template.fields) {
    delete field._id;
  }
  for(template of template.related_templates) {
    deleteTemplate_IdValues(template);
  }
}

const deleteTemplatePublishDateValues = async (template) => {
  if(!template) {
    return;
  }  
  delete template.publish_date;
  for(field of template.fields) {
    delete field.publish_date;
  }
  for(template of template.related_templates) {
    deleteTemplatePublishDateValues(template);
  }
}

const templateUpdate = async (data) => {
  let response = await request(app)
    .put(`/template/${data.uuid}`)
    .send(data)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);

  response = await request(app)
    .get(`/template/${data.uuid}/draft`)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);
  await deleteTemplateUpdatedAtValues(data);
  await deleteTemplateUpdatedAtValues(response.body);
  await deleteTemplate_IdValues(data);
  deleteTemplatePublishDateValues(data);
  expect(response.body).toMatchObject(data);
};

const templateUpdateAndPublish = async(template) => {
  await templateUpdate(template);
  let last_update = await templateLastUpdate(template.uuid);
  await templatePublish(template.uuid, last_update);
  let published_template = await templateGet(template.uuid);
  return published_template;
}

const deleteRecordUpdatedAtValues = async (record) => {
  if(!record) {
    return;
  }  
  delete record.updated_at;
  if(record.related_records) {
    for(record of record.related_records) {
      deleteRecordUpdatedAtValues(record);
    }
  }
}

const recordCreate = async (data) => {
  let response = await request(app)
    .post('/record')
    .send(data)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);
  expect(response.body.inserted_uuid).toBeTruthy();
  return response.body.inserted_uuid;
};

const recordDraftGet = async (uuid) => {
  let response = await request(app)
    .get(`/record/${uuid}/draft`)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);
  return response.body;
};

const recordCreateAndTest = async (data) => {
  let inserted_uuid = await recordCreate(data);

  data.uuid = inserted_uuid;
  
  let record = await recordDraftGet(inserted_uuid);
  expect(record).toMatchObject(data);
  return inserted_uuid;
};

const recordUpdate = async (data, uuid) => {
  let response = await request(app)
    .put(`/record/${uuid}`)
    .send(data)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);
};

const recordUpdateAndTest = async (record, uuid) => {
  await recordUpdate(record, uuid);
  delete record.updated_at;
  
  let updated_record = await recordDraftGet(uuid);
  deleteRecordUpdatedAtValues(record);
  expect(updated_record).toMatchObject(record);
};

const recordDelete = async (uuid) => {
  let response = await request(app)
    .delete(`/record/${uuid}/draft`)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);
};

const recordPublish = async (uuid, last_update) => {
  let response = await request(app)
    .post(`/record/${uuid}/publish`)
    .send({last_update})
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);
}

const recordLatestPublishedGet = async (uuid) => {
  let response = await request(app)
    .get(`/record/${uuid}/latest_published`)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);
  return response.body;
};

const recordPublishAndTest = async (uuid, data) => {
  let last_update = await recordLastUpdateAndTest(uuid);
  await recordPublish(uuid, last_update);
  let published = await recordLatestPublishedGet(uuid);
  expect(published).toHaveProperty("publish_date");
  deleteRecordUpdatedAtValues(data);
  expect(published).toMatchObject(data);
  return published;
}

const draftExisting = async (uuid) => {
  let response = await request(app)
    .get(`/record/${uuid}/draft_existing`)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);
  return response.body;
}

const recordGetPublishedBeforeTimestamp = async(uuid, time) => {
  let response = await request(app)
    .get(`/record/${uuid}/${time.toISOString()}`)
    .set('Accept', 'application/json');
  return response;
}

const recordLastUpdate = async(uuid) => {
  return await request(app)
    .get(`/record/${uuid}/last_update`);
}

const recordLastUpdateAndTest = async(uuid) => {
  let response = await recordLastUpdate(uuid);
  expect(response.statusCode).toBe(200);
  return new Date(response.body);
}

describe("create (and get draft)", () => {
  describe("Success cases", () => {

    test("No fields or related records", async () => {

      let template = {
        "name":"create template",
        "description":"a template to test a create"
      };
      let template_uuid = await Helper.templateCreateAndTest(template);
      let last_update = await templateLastUpdate(template_uuid);
      await templatePublish(template_uuid, last_update);

      let record = {
        template_uuid
      };

      await recordCreateAndTest(record);

    });
    test("Fields but no related records", async () => {

      let name_field = {
        "name": "name",
        "description": "the name of the person"
      };

      let color_field = {
        "name": "favorite color",
        "description": "the person's favorite color in the whole world"
      }

      let template = {
        "name":"create template",
        "description":"a template to test a create",
        "fields":[name_field, color_field],
        "related_templates":[]
      };
      let template_uuid = await Helper.templateCreateAndTest(template);
      let last_update = await templateLastUpdate(template_uuid);
      await templatePublish(template_uuid, last_update);

      name_field.value = "Caleb";
      color_field.value = "yellow - like the sun";

      let record = {
        template_uuid,
        fields: [name_field, color_field]
      };

      await recordCreateAndTest(record);

    });

    test("Fields and one related record", async () => {

      let name_field = {
        "name": "name",
        "description": "the name of the person"
      };

      let color_field = {
        "name": "favorite color",
        "description": "the person's favorite color in the whole world"
      }

      let related_template = {
        "name":"2",
        "fields":[color_field]
      };

      let template = {
        "name":"1",
        "fields":[name_field],
        "related_templates":[related_template]
      };
      let template_uuid = await Helper.templateCreateAndTest(template);
      let last_update = await templateLastUpdate(template_uuid);
      await templatePublish(template_uuid, last_update);

      template = await templateGet(template_uuid);
      let related_template_uuid = template.related_templates[0].uuid;

      name_field.value = "Caleb";
      color_field.value = "yellow - like the sun";

      let record = {
        template_uuid,
        fields: [name_field],
        related_records: [{
          template_uuid: related_template_uuid,
          fields: [color_field]
        }]
      };

      await recordCreateAndTest(record);

    });

    test("Create record with related records going 6 nodes deep", async () => {
  
      let template = { 
        "name": "t1",
        "related_templates": [
          { 
            "name": "t2",
            "related_templates": [
              { 
                "name": "t3",
                "related_templates": [
                  { 
                    "name": "t4",
                    "related_templates": [
                      { 
                        "name": "t5",
                        "related_templates": [
                          { 
                            "name": "t6",
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      };
      let template_uuid = await Helper.templateCreateAndTest(template);
      let last_update = await templateLastUpdate(template_uuid);
      await templatePublish(template_uuid, last_update);

      template = await templateGet(template_uuid);

      let record = { 
        "template_uuid": template.uuid,
        "related_records": [
          { 
            "template_uuid": template.related_templates[0].uuid,
            "related_records": [
              { 
                "template_uuid": template.related_templates[0].related_templates[0].uuid,
                "related_records": [
                  { 
                    "template_uuid": template.related_templates[0].related_templates[0].related_templates[0].uuid,
                    "related_records": [
                      { 
                        "template_uuid": template.related_templates[0].related_templates[0].related_templates[0].related_templates[0].uuid,
                        "related_records": [
                          { 
                            "template_uuid": template.related_templates[0].related_templates[0].related_templates[0].related_templates[0].related_templates[0].uuid,
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      };

      await recordCreateAndTest(record);

    });

    test("Fields and one related record, which exists previously and is only a link", async () => {

      let related_template = {
        "name":"2"
      };

      let template = {
        "name":"1",
        "related_templates":[related_template]
      };
      let template_uuid = await Helper.templateCreateAndTest(template);
      let last_update = await templateLastUpdate(template_uuid);
      await templatePublish(template_uuid, last_update);

      template = await templateGet(template_uuid);
      let related_template_uuid = template.related_templates[0].uuid;

      let related_record = {
        "template_uuid": related_template_uuid
      }

      let related_record_uuid = await recordCreateAndTest(related_record);

      let record = {
        template_uuid,
        related_records: [related_record_uuid]
      };

      let uuid = await recordCreate(record);
      let draft = await recordDraftGet(uuid);

      related_record.uuid = related_record_uuid;
      record.related_records[0] = related_record;
      expect(draft).toMatchObject(record);

    });

  });

  describe("Failure cases", () => {

    const failureTest = async (data, responseCode) => {
      let response = await request(app)
        .post('/record')
        .send(data)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(responseCode);
    };

    test("Input must be an object", async () => {
      let data = [];
      await failureTest(data, 400);
    })

    test("Template uuid must be a real template", async () => {

      let record = {
        template_uuid: 6
      };

      await failureTest(record, 400);

      record = {
        template_uuid: ValidUUID
      };

      await failureTest(record, 400);

    });

    test("Fields and related_templates must be arrays", async () => {

      let template = {
        "name":"1"
      };

      let template_uuid = await Helper.templateCreateAndTest(template);
      let last_update = await templateLastUpdate(template_uuid);
      await templatePublish(template_uuid, last_update);

      let record = {
        template_uuid,
        fields: ""
      };
      await failureTest(record, 400);

      record = {
        template_uuid,
        related_records: ""
      };
      await failureTest(record, 400);
    })

    test("Related record must point to the correct template uuid", async () => {

      let related_template = {
        "name":"2"
      };

      let template = {
        "name":"1",
        "related_templates":[related_template]
      };

      let other_template = {
        "name": "incorrect"
      }

      let other_template_uuid = await Helper.templateCreateAndTest(other_template);
      let last_update = await templateLastUpdate(other_template_uuid);
      await templatePublish(other_template_uuid, last_update);

      let template_uuid = await Helper.templateCreateAndTest(template);
      last_update = await templateLastUpdate(template_uuid);
      await templatePublish(template_uuid, last_update);

      let record = {
        template_uuid,
        related_records: [{
          template_uuid: other_template_uuid
        }]
      };

      await failureTest(record, 400);

    });

    test("Create record with related records going 6 nodes deep, but 2nd-to last record is invalid", async () => {
  
      let template = { 
        "name": "t1",
        "related_templates": [
          { 
            "name": "t2",
            "related_templates": [
              { 
                "name": "t3",
                "related_templates": [
                  { 
                    "name": "t4",
                    "related_templates": [
                      { 
                        "name": "t5",
                        "related_templates": [
                          { 
                            "name": "t6",
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      };
      let template_uuid = await Helper.templateCreateAndTest(template);
      let last_update = await templateLastUpdate(template_uuid);
      await templatePublish(template_uuid, last_update);

      template = await templateGet(template_uuid);

      let record = { 
        "template_uuid": template.uuid,
        "related_records": [
          { 
            "template_uuid": template.related_templates[0].uuid,
            "related_records": [
              { 
                "template_uuid": template.related_templates[0].related_templates[0].uuid,
                "related_records": [
                  { 
                    "template_uuid": template.related_templates[0].related_templates[0].related_templates[0].uuid,
                    "related_records": [
                      { 
                        "template_uuid": template.related_templates[0].related_templates[0].related_templates[0].uuid,
                        "related_records": [
                          { 
                            "template_uuid": template.related_templates[0].related_templates[0].related_templates[0].related_templates[0].related_templates[0].uuid,
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      };

      await failureTest(record, 400);

    });

  });
});

const populateWithDummyTemplateAndRecord = async () => {
  let f1 = {
    "name": "f1"
  }

  let f2 = {
    "name": "f2"
  }

  template = { 
    "name": "t1",
    "fields": [f1],
    "related_templates": [
      { 
        "name": "t2",
        "fields": [f2]
      }
    ]
  };
  template = await templateCreateAndPublish(template);
  let related_template_uuid = template.related_templates[0].uuid;

  f1.value = "happy";
  f2.value = "strawberry";

  record = {
    template_uuid: template.uuid,
    fields: [f1],
    related_records: [{
      template_uuid: related_template_uuid,
      fields: [f2]
    }]
  };

  let record_uuid = await recordCreateAndTest(record);
  record = await recordDraftGet(record_uuid);
  return [template, record];
};

describe("update", () => {
  let template;
  let record;
  beforeEach(async() => {
    [template, record] = await populateWithDummyTemplateAndRecord();
  });

  describe("Success cases", () => {

    test("Basic update - change a field", async () => {
      record.fields[0].value = "sad";
      record.related_records = [];
      await recordUpdateAndTest(record, record.uuid);
    });

    test("updating a related_record creates drafts of parents but not children", async () => {
      // Create and publish template
      let template = {
        "name":"1",
        "related_templates":[{
          "name": "2",
          "related_templates":[{
            "name": "3",
            "fields": [{"name": "f1"}],
            "related_templates":[{
              "name": "4"
            }]
          }]
        }]
      };
      template = await templateCreateAndPublish(template);

      let record = {
        template_uuid: template.uuid,
        related_records: [{
          template_uuid: template.related_templates[0].uuid,
          related_records: [{
            template_uuid: template.related_templates[0].related_templates[0].uuid,
            fields: [{name: "f1", value: "strawberry"}],
            related_records: [{
              template_uuid: template.related_templates[0].related_templates[0].related_templates[0].uuid,
            }]
          }]
        }]
      };

      let record_uuid = await recordCreateAndTest(record);
      record = await recordDraftGet(record_uuid);

      // Publish the first time
      await recordPublishAndTest(record_uuid, record);

      //  Submit an update on the 3rd layer
      record = await recordDraftGet(record_uuid);
      record.related_records[0].related_records[0].fields[0].value = "banana";
      await recordUpdateAndTest(record, record.uuid);

      // The first 3 layers, but not the fourth layer, should have drafts
      expect(await draftExisting(record.uuid)).toBeTruthy();
      expect(await draftExisting(record.related_records[0].uuid)).toBeTruthy();
      expect(await draftExisting(record.related_records[0].related_records[0].uuid)).toBeTruthy();
      expect(await draftExisting(record.related_records[0].related_records[0].related_records[0].uuid)).toBeFalsy();

    });

    test("if update includes no change since last published, no draft is created", async () => {
      await recordPublishAndTest(record.uuid, record);
      await recordUpdateAndTest(record, record.uuid);
      expect(await draftExisting(record.uuid)).toBeFalsy();
      expect(await draftExisting(record.related_records[0].uuid)).toBeFalsy();
    });

    test("if update includes no changes since last published but a new template has been published, a new draft is created", async () => {

      // Modify the related template and publish it, then change it back and publish it again. 
      // Then updating the record should create a draft just by the fact that it is a new template.

      await recordPublishAndTest(record.uuid, record);
      template.fields[0].description = "field 1";
      await templateUpdateAndPublish(template);
      template.fields[0].description = "";
      await templateUpdateAndPublish(template);
      await recordUpdateAndTest(record, record.uuid);
      expect(await draftExisting(record.uuid)).toBeTruthy();
      expect(await draftExisting(record.related_records[0].uuid)).toBeFalsy();
    });

    test("if update includes no changes except that a new version of a related_record has been published, a new draft is created", async () => {

      await recordPublishAndTest(record.uuid, record);
      template.fields[0].description = "field 1";

      let related_record = record.related_records[0];
      related_record.fields[0].value = "new value";
      await recordUpdateAndTest(related_record, related_record.uuid);
      await recordPublishAndTest(related_record.uuid, related_record);

      await recordUpdateAndTest(record, record.uuid);
      expect(await draftExisting(record.uuid)).toBeTruthy();
      expect(await draftExisting(record.related_records[0].uuid)).toBeFalsy();
    });

  });

  describe("Failure cases", () => {

    const failureTest = async (data, uuid, responseCode) => {
      let response = await request(app)
        .put(`/record/${uuid}`)
        .send(data)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(responseCode);
    };

    test("uuid in request and in object must match", async () => {

      await failureTest(record, ValidUUID, 400);

    });

    test("uuid must exist", async () => {

      record.uuid = ValidUUID;

      await failureTest(record, ValidUUID, 404);

    });

    test("template uuid must not change", async () => {

      record.template_uuid = record.related_records[0].template_uuid;

      await failureTest(record, record.uuid, 400);

    });

  });

});

describe("delete", () => {
  let template;
  let record;
  beforeEach(async() => {
    [template, record] = await populateWithDummyTemplateAndRecord();
  });

  test("basic delete", async () => {

    // Delete the parent record
    await recordDelete(record.uuid);

    // The parent record should no longer exist
    let response = await request(app)
      .get(`/record/${record.uuid}/draft`)
      .set('Accept', 'application/json');
    expect(response.statusCode).toBe(404);

    // But the child still should
    response = await request(app)
      .get(`/record/${record.related_records[0].uuid}/draft`)
      .set('Accept', 'application/json');
    expect(response.statusCode).toBe(200);

  });
});

describe("publish (and get published)", () => {

  describe("Success cases", () => {
    test("Simple publish - no fields and no related records", async () => {
      let template = { 
        "name": "t1"
      };
      template = await templateCreateAndPublish(template);
      let record = {
        template_uuid: template.uuid
      }

      let record_uuid = await recordCreateAndTest(record);

      await recordPublishAndTest(record_uuid, record);
      
    });

    test("Complex publish - with nested fields and related templates to publish", async () => {
      let template, record;
      [template, record] = await populateWithDummyTemplateAndRecord();

      await recordPublishAndTest(record.uuid, record);

    });

    test("Complex publish - changes in a nested property result in publishing for all parent properties", async () => {
      // Create and publish template
      let template = {
        "name":"1",
        "related_templates":[{
          "name": "2",
          "related_templates":[{
            "name": "3",
            "fields": [{"name": "f1"}],
            "related_templates":[{
              "name": "4"
            }]
          }]
        }]
      };
      template = await templateCreateAndPublish(template);

      let record = {
        template_uuid: template.uuid,
        related_records: [{
          template_uuid: template.related_templates[0].uuid,
          related_records: [{
            template_uuid: template.related_templates[0].related_templates[0].uuid,
            fields: [{name: "f1", value: "strawberry"}],
            related_records: [{
              template_uuid: template.related_templates[0].related_templates[0].related_templates[0].uuid,
            }]
          }]
        }]
      };

      let record_uuid = await recordCreateAndTest(record);
      record = await recordDraftGet(record_uuid);

      // Publish the first time
      await recordPublishAndTest(record_uuid, record);

      // Edit the third record
      record = await recordDraftGet(record_uuid);
      record.related_records[0].related_records[0].fields[0].value = "banana";
      await recordUpdateAndTest(record, record.uuid);

      // Record the date before we publish a second time
      let intermediate_publish_date = (new Date()).getTime();

      // Now publish the record again
      let published = await recordPublishAndTest(record_uuid, record);

      // On the third node and above, the publish date should be newer than the intermediate_publish_date. 
      // The fourth should be older
      
      expect(new Date(published.publish_date).getTime()).toBeGreaterThan(intermediate_publish_date);
      expect(new Date(published.related_records[0].publish_date).getTime()).toBeGreaterThan(intermediate_publish_date);
      expect(new Date(published.related_records[0].related_records[0].publish_date).getTime()).toBeGreaterThan(intermediate_publish_date);
      expect(new Date(published.related_records[0].related_records[0].related_records[0].publish_date).getTime()).toBeLessThan(intermediate_publish_date);
    });

  });

  describe("Failure cases", () => {

    const publishFailureTest = async (uuid, responseCode, last_update) => {
      if(!last_update) {
        last_update = await recordLastUpdateAndTest(uuid);
      }
      let response = await request(app)
        .post(`/record/${uuid}/publish`)
        .send({last_update})
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(responseCode);
    };

    let template;
    let record;
    beforeEach(async() => {
      [template, record] = await populateWithDummyTemplateAndRecord();
    });

    test("Record with uuid does not exist", async () => {
      await publishFailureTest(ValidUUID, 404, new Date());
    });

    test("No changes to publish", async () => {
      await recordPublishAndTest(record.uuid, record);
      await publishFailureTest(record.uuid, 400);
    });

    test("A new template has been published since this record was last updated", async () => {
      // publish original data
      await recordPublishAndTest(record.uuid, record);
      // update record
      record.fields[0].value = "waffle";
      await recordUpdateAndTest(record, record.uuid);
      // update template and publish
      template.fields[0].description = "new description";
      await templateUpdateAndPublish(template);
      // fail to publish record because it's template was just published
      await publishFailureTest(record.uuid, 400);
      // update record again and this time succeed in publishing 
      // This description isn't used by record update, but it is used by the test to verify the result of update
      record.fields[0].description = "new description";
      await recordUpdateAndTest(record, record.uuid);
      await recordPublishAndTest(record.uuid, record);
    });

    test("Last update provided must match to actual last update in the database", async () => {
      await publishFailureTest(record.uuid, 400, new Date());
    });

    test("Last update provided must match to actual last update in the database, also if sub-property is updated later", async () => {
      let parent_update = await recordLastUpdateAndTest(record.uuid);
      let related_record = record.related_records[0];
      related_record.fields[0].value = "this programmer just ate a pear";
      await recordUpdateAndTest(related_record, related_record.uuid);

      await publishFailureTest(record.uuid, 400, parent_update);

      await recordPublishAndTest(record.uuid, record);
    });

  });
});

test("get published for a certain date", async () => {
  let template, record;
  [template, record] = await populateWithDummyTemplateAndRecord();

  let publish0 = new Date();

  await recordPublishAndTest(record.uuid, record);

  let publish1 = new Date();

  record.fields[0].value = '2';
  await recordUpdateAndTest(record, record.uuid);
  await recordPublishAndTest(record.uuid, record);

  let publish2 = new Date();

  record.fields[0].value = '3';
  await recordUpdateAndTest(record, record.uuid);
  await recordPublishAndTest(record.uuid, record);

  let publish3 = new Date();

  // Now we have published 3 times. Search for versions based on timestamps.

  let response = await recordGetPublishedBeforeTimestamp(record.uuid, publish0);
  expect(response.statusCode).toEqual(404);

  response = await recordGetPublishedBeforeTimestamp(record.uuid, publish1);
  expect(response.statusCode).toEqual(200);
  expect(response.body.fields[0].value).toEqual(expect.stringMatching("happy"));

  response = await recordGetPublishedBeforeTimestamp(record.uuid, publish2);
  expect(response.statusCode).toEqual(200);
  expect(response.body.fields[0].value).toEqual(expect.stringMatching("2"));

  response = await recordGetPublishedBeforeTimestamp(record.uuid, publish3);
  expect(response.statusCode).toEqual(200);
  expect(response.body.fields[0].value).toEqual(expect.stringMatching("3"));
});

describe("recordLastUpdate", () => {

  describe("success", () => {
    test("basic draft, no fields or related templates", async () => {
      let template = {
        "name":"1"
      };
      template = await templateCreateAndPublish(template);

      let record = {
        template_uuid: template.uuid
      };

      let before_update = new Date();

      let record_uuid = await recordCreateAndTest(record);

      let last_update = await recordLastUpdateAndTest(record_uuid);
      expect(last_update.getTime()).toBeGreaterThan(before_update.getTime());
    });

    test("sub record updated later than parent record", async () => {
      let template, record;
      [template, record] = await populateWithDummyTemplateAndRecord();

      let related_record = record.related_records[0];

      let between_updates = new Date();

      await recordUpdateAndTest(related_record, related_record.uuid);

      let last_update = await recordLastUpdateAndTest(record.uuid);
      expect(last_update.getTime()).toBeGreaterThan(between_updates.getTime());
    });

  });

  describe("failure", () => {
    test("invalid uuid", async () => {
      let response = await recordLastUpdate("18");
      expect(response.statusCode).toBe(400);

      response = await recordLastUpdate(ValidUUID);
      expect(response.statusCode).toBe(404);
    })
  });
})

test("full range of operations with big data", async () => {

  let t1f1 = {name: "t1f1"};
  let t1f2 = {name: "t1f2"};
  let t1f3 = {name: "t1f3"};
  let t3_1f1 = {name: "t3.1f1"};
  let t3_1f2 = {name: "t3.1f2"};
  let t4_1f1 = {name: "t4.1f1"};
  let t4_1f2 = {name: "t4.1f2"};
  let t3_2f1 = {name: "t3.2f1"};
  let t3_2f2 = {name: "t3.2f2"};
  let t4_3f1 = {name: "t4.3f1"};
  let t4_3f2 = {name: "t4.3f2"};

  let template = {
    name: "1",
    fields: [t1f1, t1f2, t1f3],
    related_templates: [
      {
        name: "2.1",
        related_templates: [
          {
            name: "3.1",
            fields: [t3_1f1, t3_1f2],
            related_templates: [
              {
                name: "4.1",
                fields: [t4_1f1, t4_1f2]
              },
              {
                name: "4.2"
              }
            ]
          },
          {
            name: "3.2",
            fields: [t3_2f1, t3_2f2],
            related_templates: [
              {
                name: "4.3",
                fields: [t4_3f1, t4_3f2]
              },
              {
                name: "4.4"
              }
            ]
          }
        ]
      }
    ]
  }

  template = await templateCreateAndPublish(template);

  t1f1.value = "pumpkin";
  t3_1f2.value = "friend";
  t4_3f1.value = "mango";

  let record = {
    template_uuid: template.uuid,
    fields: [t1f1, t1f2, t1f3],
    related_records: [
      {
        template_uuid: template.related_templates[0].uuid,
        related_records: [
          {
            template_uuid: template.related_templates[0].related_templates[0].uuid,
            fields: [t3_1f1, t3_1f2],
            related_records: [
              {
                template_uuid: template.related_templates[0].related_templates[0].related_templates[0].uuid,
                fields: [t4_1f1, t4_1f2]
              },
              {
                template_uuid: template.related_templates[0].related_templates[0].related_templates[1].uuid
              }
            ]
          },
          {
            template_uuid: template.related_templates[0].related_templates[1].uuid,
            fields: [t3_2f1, t3_2f2],
            related_records: [
              {
                template_uuid: template.related_templates[0].related_templates[1].related_templates[0].uuid,
                fields: [t4_3f1, t4_3f2]
              },
              {
                template_uuid: template.related_templates[0].related_templates[1].related_templates[1].uuid
              }
            ]
          }
        ]
      }
    ]
  };

  let record_uuid = await recordCreateAndTest(record);

  record = await recordDraftGet(record_uuid);
  await recordPublishAndTest(record_uuid, record);

});