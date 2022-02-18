const request = require("supertest");
const MongoDB = require('../lib/mongoDB');
var { app, init: appInit } = require('../app');
var HelperClass = require('./common_test_operations')
var Helper = new HelperClass(app);
var { PERMISSION_ADMIN, PERMISSION_EDIT, PERMISSION_VIEW } = require('../models/permission_group');

// TODO: figure out and resolve the socket hang up problem I get at random points. 
// Reference this: https://stackoverflow.com/questions/16995184/nodejs-what-does-socket-hang-up-actually-mean 

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

// TODO: I think all of these functions should probably just be moved to the helper class
const recordCleanseMetadata = async (record) => {
  if(!record) {
    return;
  }  
  delete record.updated_at;
  delete record._id;
  delete record.publish_date;
  delete record.dataset_id;
  if(record.related_records) {
    for(record of record.related_records) {
      recordCleanseMetadata(record);
    }
  }
}

const recordCreate = async (data, curr_user) => {
  return await request(app)
    .post('/record')
    .send(data)
    .set('Cookie', [`user=${curr_user}`]);
};

const recordDraftGet = async (uuid, curr_user) => {
  return await request(app)
    .get(`/record/${uuid}/draft`)
    .set('Cookie', [`user=${curr_user}`])
    .set('Accept', 'application/json');
};
const recordDraftGetAndTest = async (uuid, curr_user) => {
  let response = await recordDraftGet(uuid, curr_user);
  expect(response.statusCode).toBe(200);
  return response.body;
};

const testRecordFieldsEqual = (before, after) => {
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

const testRecordsEqual = (before, after) => {
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
      testRecordFieldsEqual(before.fields[i], after.fields[i]);
    }
  }
  if(before.related_records) {
    expect(after.related_records.length).toBe(before.related_records.length);
    before.related_records.sort(Helper.sortArrayByNameProperty);
    after.related_records.sort(Helper.sortArrayByNameProperty);
    for(let i = 0; i < before.related_records.length; i++) {
      testRecordsEqual(before.related_records[i], after.related_records[i]);
    }
  }
}

const recordCreateAndTest = async (data, curr_user) => {
  let record = await recordCreateAndTestV2(data, curr_user);
  return record.uuid;
};
const recordCreateAndTestV2 = async (data, curr_user) => {
  let response = await recordCreate(data, curr_user);
  expect(response.statusCode).toBe(200);
  let uuid = response.body.inserted_uuid;

  data.uuid = uuid;
  
  let record = await recordDraftGetAndTest(uuid, curr_user);
  testRecordsEqual(data, record);
  return record;
};

const recordUpdate = async (record, uuid, curr_user) => {
  return await request(app)
    .put(`/record/${uuid}`)
    .send(record)
    .set('Cookie', [`user=${curr_user}`]);
};

const recordUpdateAndTest = async (record, curr_user) => {
  let response = await recordUpdate(record, record.uuid, curr_user);
  expect(response.statusCode).toBe(200);
  delete record.updated_at;
  
  response = await recordDraftGet(record.uuid, curr_user);
  expect(response.statusCode).toBe(200);
  let updated_record = response.body;
  recordCleanseMetadata(record);
  expect(updated_record).toMatchObject(record);
};

const recordDelete = async (uuid, curr_user) => {
  return await request(app)
    .delete(`/record/${uuid}/draft`)
    .set('Cookie', [`user=${curr_user}`]);
};
const recordDeleteAndTest = async (uuid, curr_user) => {
  let response = await recordDelete(uuid, curr_user);
  expect(response.statusCode).toBe(200);
};

const recordPublish = async (uuid, last_update, curr_user) => {
  return await request(app)
    .post(`/record/${uuid}/publish`)
    .send({last_update})
    .set('Cookie', [`user=${curr_user}`]);
}

const recordLatestPublishedGet = async (uuid, curr_user) => {
  return await request(app)
    .get(`/record/${uuid}/latest_published`)
    .set('Cookie', [`user=${curr_user}`])
    .set('Accept', 'application/json');
};

const recordPublishAndTest = async (uuid, record, curr_user) => {
  let last_update = await recordLastUpdateAndTest(uuid, curr_user);
  let response = await recordPublish(uuid, last_update, curr_user);
  expect(response.statusCode).toBe(200);
  response = await recordLatestPublishedGet(uuid, curr_user);
  expect(response.statusCode).toBe(200);
  let published = response.body;
  expect(published).toHaveProperty("publish_date");
  recordCleanseMetadata(record);
  expect(published).toMatchObject(record);
  return published;
}

const recordCreatePublishTest = async (record, curr_user) => {
  let uuid = await recordCreateAndTest(record, curr_user);
  record.uuid = uuid;
  let published = await recordPublishAndTest(uuid, record, curr_user)
  expect(published).toMatchObject(record);
  return published;
};

const draftExisting = async (uuid) => {
  let response = await request(app)
    .get(`/record/${uuid}/draft_existing`)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);
  return response.body;
}

const recordGetPublishedBeforeTimestamp = async(uuid, time, curr_user) => {
  let response = await request(app)
    .get(`/record/${uuid}/${time.toISOString()}`)
    .set('Cookie', [`user=${curr_user}`])
    .set('Accept', 'application/json');
  return response;
}

const recordLastUpdate = async(uuid, curr_user) => {
  return await request(app)
    .get(`/record/${uuid}/last_update`)
    .set('Cookie', [`user=${curr_user}`]);
}

const recordLastUpdateAndTest = async(uuid, curr_user) => {
  let response = await recordLastUpdate(uuid, curr_user);
  expect(response.statusCode).toBe(200);
  return new Date(response.body);
}

const recordPublishAndFetch = async (uuid, curr_user) => {
  let response = await recordLastUpdate(uuid, curr_user);
  expect(response.statusCode).toBe(200);
  let last_update = response.body;

  response = await recordPublish(uuid, last_update, curr_user);
  expect(response.statusCode).toBe(200);

  response = await recordLatestPublishedGet(uuid, curr_user);
  expect(response.statusCode).toBe(200);
  let published_record = response.body;
  expect(published_record).toHaveProperty("publish_date");
  return published_record;
};

const recordUpdatePublishTest = async (record, curr_user) => {
  await recordUpdateAndTest(record, curr_user);
  let published_record = await recordPublishAndFetch(record.uuid, curr_user)
  expect(published_record).toMatchObject(record);
  return published_record;
};

describe("create (and get draft)", () => {
  describe("Success cases", () => {

    test("No fields or related records", async () => {

      let template = {
        name:"t1"
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        template_uuid: template.uuid
      };
      dataset = await Helper.datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      let record = {
        dataset_uuid: dataset.uuid
      };
      await recordCreateAndTest(record, Helper.DEF_CURR_USER);

    });
    test("Fields but no related records", async () => {

      let name_field = {
        name: "name",
        description: "someone's name"
      };
      let color_field = {
        name: "favorite color",
        description: "their favorite color in the whole world"
      }
      let template = {
        "name":"t1",
        "fields":[name_field, color_field]
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      if(template.fields[0].name == 'name') {
        name_field.uuid = template.fields[0].uuid;
        color_field.uuid = template.fields[1].uuid;
      } else {
        name_field.uuid = template.fields[1].uuid;
        color_field.uuid = template.fields[0].uuid;
      }
      name_field.value = "Caleb";
      color_field.value = "yellow - like the sun";

      let dataset = {
        template_uuid: template.uuid
      };
      dataset = await Helper.datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      let record = {
        dataset_uuid: dataset.uuid,
        fields: [name_field, color_field]
      };
      await recordCreateAndTest(record, Helper.DEF_CURR_USER);

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
        "name":"1.1",
        "fields":[color_field]
      };

      let template = {
        "name":"1",
        "fields":[name_field],
        "related_templates":[related_template]
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        template_uuid: template.uuid,
        related_datasets: [{
          template_uuid: template.related_templates[0].uuid
        }]
      };
      dataset = await Helper.datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      name_field.uuid = template.fields[0].uuid;
      name_field.value = "Caleb";
      color_field.uuid = template.related_templates[0].fields[0].uuid;
      color_field.value = "yellow - like the sun";

      let record = {
        dataset_uuid: dataset.uuid,
        fields: [name_field],
        related_records: [{
          dataset_uuid: dataset.related_datasets[0].uuid,
          fields: [color_field]
        }]
      };

      await recordCreateAndTest(record, Helper.DEF_CURR_USER);

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
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = { 
        template_uuid: template.uuid,
        related_datasets: [
          { 
            template_uuid: template.related_templates[0].uuid,
            related_datasets: [
              { 
                template_uuid: template.related_templates[0].related_templates[0].uuid,
                related_datasets: [
                  { 
                    template_uuid: template.related_templates[0].related_templates[0].related_templates[0].uuid,
                    related_datasets: [
                      { 
                        template_uuid: template.related_templates[0].related_templates[0].related_templates[0].related_templates[0].uuid,
                        related_datasets: [
                          { 
                            template_uuid: template.related_templates[0].related_templates[0].related_templates[0].related_templates[0].related_templates[0].uuid,
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
      dataset = await Helper.datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      let record = { 
        "dataset_uuid": dataset.uuid,
        "related_records": [
          { 
            "dataset_uuid": dataset.related_datasets[0].uuid,
            "related_records": [
              { 
                "dataset_uuid": dataset.related_datasets[0].related_datasets[0].uuid,
                "related_records": [
                  { 
                    "dataset_uuid": dataset.related_datasets[0].related_datasets[0].related_datasets[0].uuid,
                    "related_records": [
                      { 
                        "dataset_uuid": dataset.related_datasets[0].related_datasets[0].related_datasets[0].related_datasets[0].uuid,
                        "related_records": [
                          { 
                            "dataset_uuid": dataset.related_datasets[0].related_datasets[0].related_datasets[0].related_datasets[0].related_datasets[0].uuid,
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

      await recordCreateAndTest(record, Helper.DEF_CURR_USER);

    });

    test("one related record, which already exists", async () => {

      let template = {
        name:"t1",
        related_templates:[{
          name: "t2"
        }]
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        template_uuid: template.uuid,
        related_datasets:[{
          template_uuid: template.related_templates[0].uuid 
        }]
      };
      dataset = await Helper.datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      let related_record = {
        dataset_uuid: dataset.related_datasets[0].uuid
      };

      let related_record_uuid = await recordCreateAndTest(related_record, Helper.DEF_CURR_USER);

      related_record.uuid = related_record_uuid;

      let record = {
        dataset_uuid: dataset.uuid,
        related_records: [related_record]
      };

      await recordCreateAndTest(record, Helper.DEF_CURR_USER);

    });

    test("link one related record user only has view permissions for, and one the user has no permissions for", async () => {

      let template = {
        name:"t1",
        related_templates:[
          {
            name: "t1.1"
          },
          {
            name: "t1.2"
          }
        ]
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        template_uuid: template.uuid,
        related_datasets:[
          {
            template_uuid: template.related_templates[0].uuid
          },
          {
            template_uuid: template.related_templates[1].uuid
          }
        ]
      };
      dataset = await Helper.datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      let related_record_1 = {
        dataset_uuid: dataset.related_datasets[0].uuid
      };
      let related_record_2 = {
        dataset_uuid: dataset.related_datasets[1].uuid
      };

      let related_record_1_published = await recordCreatePublishTest(related_record_1, Helper.DEF_CURR_USER);
      let related_record_2_published = await recordCreatePublishTest(related_record_2, Helper.DEF_CURR_USER);

      related_record_1.uuid = related_record_1_published.uuid;
      related_record_2.uuid = related_record_2_published.uuid;

      let both_users = [Helper.DEF_CURR_USER, Helper.USER_2];
      let response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, template.uuid, PERMISSION_EDIT, both_users);
      expect(response.statusCode).toBe(200);
      response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, dataset.uuid, PERMISSION_EDIT, both_users);
      expect(response.statusCode).toBe(200);
      response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, template.related_templates[0].uuid, PERMISSION_VIEW, both_users);
      expect(response.statusCode).toBe(200);
      response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, related_record_1.dataset_uuid, PERMISSION_VIEW, both_users);
      expect(response.statusCode).toBe(200);

      // response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, template.uuid, PERMISSION_VIEW, view_users);
      // expect(response.statusCode).toBe(200);

      let record = {
        dataset_uuid: dataset.uuid,
        related_records: [related_record_1, {uuid: related_record_2_published.uuid, dataset_uuid: related_record_2_published.dataset_uuid}]
      };

      await recordCreateAndTest(record, Helper.USER_2);

    });

    test("2 related records, but only 1 supplied", async () => {

      let template1 = {
        "name":"1",
        "fields":[],
        "related_templates":[{"name":"1.1"}, {"name":"1.2"}]
      };
      template1 = await Helper.templateCreatePublishTest(template1, Helper.DEF_CURR_USER);

      let dataset = {
        template_uuid: template1.uuid,
        related_datasets: [
          {
            template_uuid: template1.related_templates[0].uuid
          },
          {
            template_uuid: template1.related_templates[1].uuid
          }
        ]
      };
      dataset = await Helper.datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      let record = {
        dataset_uuid: dataset.uuid,
        related_records: [{
          dataset_uuid: dataset.related_datasets[1].uuid,
        }]
      };

      await recordCreateAndTest(record, Helper.DEF_CURR_USER);

    });

    test("With options", async () => {

      let field = {
        name: "f1",
        public_date: (new Date()).toISOString(),
        options: [
          {
            name: "naruto"
          },
          {
            name: "sasuke"
          },
          {
            name: "sakura"
          },
          {
            name: "caleb",
            options: [
              {
                name: "super_duper"
              }
            ]
          }
        ]
      };
      let template = {
        "name":"t1",
        "fields":[field]
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      field.uuid = template.fields[0].uuid;
      field.options = template.fields[0].options;

      let dataset = {
        template_uuid: template.uuid
      };
      dataset = await Helper.datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      // The tests automatically sort by name. So options[0] is 'caleb' and options[1] is 'naruto'
      let option_uuid_1 = field.options[1].uuid;
      let option_uuid_2 = field.options[0].options[0].uuid;

      field.values = [{uuid: option_uuid_1}];
      delete field.options;
      delete field.public_date;

      let record = {
        dataset_uuid: dataset.uuid,
        fields: [field]
      };
      let uuid = await recordCreateAndTest(record, Helper.DEF_CURR_USER);
      let response = await recordDraftGet(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect(response.body.fields[0].values).toEqual([{uuid: option_uuid_1, name: "naruto"}]);

      record.fields[0].values = [{uuid: option_uuid_1}, {uuid: option_uuid_2}];
      uuid = await recordCreateAndTest(record, Helper.DEF_CURR_USER);
      response = await recordDraftGet(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect(response.body.fields[0].values).toEqual([
        {uuid: option_uuid_1, name: "naruto"},
        {uuid: option_uuid_2, name: "super_duper"}
      ]);

      delete record.fields[0].values;
      uuid = await recordCreateAndTest(record, Helper.DEF_CURR_USER);
      response = await recordDraftGet(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect(response.body.fields[0].values).toEqual([]);

    });

    test("record not required to supply related_record for each related_dataset", async () => {

      let name_field = {
        "name": "name",
        "description": "the name of the person"
      };

      let color_field = {
        "name": "favorite color",
        "description": "the person's favorite color in the whole world"
      }

      let related_template = {
        "name":"1.1",
        "fields":[color_field]
      };

      let template = {
        "name":"1",
        "fields":[name_field],
        "related_templates":[related_template]
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      name_field.uuid = template.fields[0].uuid;

      let dataset = {
        template_uuid: template.uuid,
        related_datasets: [{
          template_uuid: template.related_templates[0].uuid
        }]
      };
      dataset = await Helper.datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      let record = {
        dataset_uuid: dataset.uuid,
        fields: [name_field],
        related_records: []
      };

      await recordCreateAndTest(record, Helper.DEF_CURR_USER);

    });

  });

  describe("Failure cases", () => {

    test("Input must be an object", async () => {
      let record = [];
      let response = await recordCreate(record, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);
    })

    test("Dataset uuid must be a real dataset", async () => {

      let record = {
        dataset_uuid: 6
      };

      let response = await recordCreate(record, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

      record = {
        dataset_uuid: Helper.VALID_UUID
      };

      response = await recordCreate(record, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

    });

    test("Fields and related_records must be arrays", async () => {

      let template = {
        "name":"t1"
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        template_uuid: template.uuid
      };
      dataset = await Helper.datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      let record = {
        dataset_uuid: dataset.uuid,
        fields: 7
      };
      let response = await recordCreate(record, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

      record = {
        dataset_uuid: dataset.uuid,
        related_records: 9
      };
      response = await recordCreate(record, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);
    })

    test("related_record can only point to a related_dataset supported by the dataset", async () => {

      let template = {
        "name":"t1",
        "related_templates":[{name: "t1.1"}]
      };

      let other_template = {
        "name": "incorrect"
      }

      other_template = await Helper.templateCreatePublishTest(other_template, Helper.DEF_CURR_USER);

      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        template_uuid: template.uuid,
        related_datasets: [{
          template_uuid: template.related_templates[0].uuid
        }]
      }
      dataset = await Helper.datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      let other_dataset = {
        template_uuid: other_template.uuid
      }
      other_dataset = await Helper.datasetCreatePublishTest(other_dataset, Helper.DEF_CURR_USER);

      let record = {
        dataset_uuid: dataset.uuid,
        related_records: [{
          dataset_uuid: other_dataset.uuid
        }]
      };
      response = await recordCreate(record, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

    });

    test("Create record with related_records going 6 nodes deep, but 2nd-to last record is invalid", async () => {
  
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
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = { 
        template_uuid: template.uuid,
        related_datasets: [
          { 
            template_uuid: template.related_templates[0].uuid,
            related_datasets: [
              { 
                template_uuid: template.related_templates[0].related_templates[0].uuid,
                related_datasets: [
                  { 
                    template_uuid: template.related_templates[0].related_templates[0].related_templates[0].uuid,
                    related_datasets: [
                      { 
                        template_uuid: template.related_templates[0].related_templates[0].related_templates[0].related_templates[0].uuid,
                        related_datasets: [
                          { 
                            template_uuid: template.related_templates[0].related_templates[0].related_templates[0].related_templates[0].related_templates[0].uuid,
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
      dataset = await Helper.datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      let record = { 
        "dataset_uuid": dataset.uuid,
        "related_records": [
          { 
            "dataset_uuid": dataset.related_datasets[0].uuid,
            "related_records": [
              { 
                "dataset_uuid": dataset.related_datasets[0].related_datasets[0].uuid,
                "related_records": [
                  { 
                    "dataset_uuid": dataset.related_datasets[0].related_datasets[0].related_datasets[0].uuid,
                    "related_records": [
                      { 
                        "dataset_uuid": dataset.related_datasets[0].related_datasets[0].related_datasets[0].uuid,
                        "related_records": [
                          { 
                            "dataset_uuid": dataset.related_datasets[0].related_datasets[0].related_datasets[0].related_datasets[0].related_datasets[0].uuid,
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

      response = await recordCreate(record, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

    });

    test("Must have edit permissions on the dataset", async () => {
      let template = {
        name:"t1"
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        template_uuid: template.uuid
      };
      dataset = await Helper.datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      let both_users = [Helper.DEF_CURR_USER, Helper.USER_2];
      let response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, template.uuid, PERMISSION_VIEW, both_users);
      expect(response.statusCode).toBe(200);
      response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, dataset.uuid, PERMISSION_VIEW, both_users);
      expect(response.statusCode).toBe(200);

      let record = {
        dataset_uuid: dataset.uuid
      };
      response = await recordCreate(record, Helper.USER_2);
      expect(response.statusCode).toBe(401);
    })

    test("Each field in the record must supply a template_field uuid", async () => {

      let name_field = {
        name: "name",
        description: "someone's name"
      };
      let template = {
        "name":"t1",
        "fields":[name_field]
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      name_field.uuid = template.fields[0].uuid;
      name_field.value = "Caleb";

      let dataset = {
        template_uuid: template.uuid
      };
      dataset = await Helper.datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      delete name_field.uuid;
      let record = {
        dataset_uuid: dataset.uuid,
        fields: [name_field]
      };
      let response = await recordCreate(record, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

    });

    test("A record can only supply a single value for each field", async () => {

      let name_field = {
        name: "name",
        description: "someone's name"
      };
      let template = {
        "name":"t1",
        "fields":[name_field]
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      name_field.uuid = template.fields[0].uuid;
      name_field.value = "Caleb";

      let dataset = {
        template_uuid: template.uuid
      };
      dataset = await Helper.datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      let record = {
        dataset_uuid: dataset.uuid,
        fields: [name_field, name_field]
      };
      let response = await recordCreate(record, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

    });

    test("record cannot take related_record not accepted by template/dataset", async () => {

      let template1 = {
        "name":"1",
        "fields":[],
        "related_templates":[{"name":"1.1"}, {"name":"1.2"}]
      };
      template1 = await Helper.templateCreatePublishTest(template1, Helper.DEF_CURR_USER);

      let dataset = {
        template_uuid: template1.uuid,
        related_datasets: [
          {
            template_uuid: template1.related_templates[0].uuid
          },
          {
            template_uuid: template1.related_templates[1].uuid
          }
        ]
      };
      let dataset1 = await Helper.datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);
      let dataset2 = await Helper.datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      // Try to create a record with a related_record using an invalid dataset_uuid
      let record = {
        dataset_uuid: dataset1.uuid,
        related_records: [
          {
            dataset_uuid: dataset2.related_datasets[0].uuid
          }
        ]
      };
      let response = await recordCreate(record, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

    });

    test("options invalid", async () => {

      let field = {
        name: "f1",
        public_date: (new Date()).toISOString(),
        options: [
          {
            name: "naruto"
          },
          {
            name: "sasuke"
          },
          {
            name: "sakura"
          }
        ]
      };
      let template = {
        "name":"t1",
        "fields":[field]
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      field.uuid = template.fields[0].uuid;
      field.options = template.fields[0].options;

      let dataset = {
        template_uuid: template.uuid
      };
      dataset = await Helper.datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      // option_uuid supplied not supported
      field.values = [{uuid: "invalid"}];
      let record = {
        dataset_uuid: dataset.uuid,
        fields: [field]
      };
      let response = await recordCreate(record, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

    });

    test("related_records is a set and no related_record can be repeated", async () => {

      let template = {
        name:"t1",
        related_templates:[{
          name: "t2"
        }]
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        template_uuid: template.uuid,
        related_datasets:[{
          template_uuid: template.related_templates[0].uuid 
        }]
      };
      dataset = await Helper.datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      let related_record = {
        dataset_uuid: dataset.related_datasets[0].uuid
      };

      let related_record_uuid = await recordCreateAndTest(related_record, Helper.DEF_CURR_USER);

      related_record.uuid = related_record_uuid;

      let record = {
        dataset_uuid: dataset.uuid,
        related_records: [related_record, related_record]
      };

      let response = await recordCreate(record, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

    });

  });
});

const populateWithDummyTemplateAndRecord = async () => {
  let f1 = {
    "name": "t1f1"
  }

  let f2 = {
    "name": "t1.1f1"
  }

  let template = { 
    "name": "t1",
    public_date: (new Date()).toISOString(),
    "fields": [f1],
    "related_templates": [
      { 
        "name": "t1.1",
        "fields": [f2]
      }
    ]
  };
  template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

  let dataset = {
    template_uuid: template.uuid,
    related_datasets: [{
        template_uuid: template.related_templates[0].uuid
      }
    ]
  };
  dataset = await Helper.datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

  f1.uuid = template.fields[0].uuid;
  f1.value = "happy";
  f2.uuid = template.related_templates[0].fields[0].uuid;
  f2.value = "strawberry";

  let record = {
    dataset_uuid: dataset.uuid,
    fields: [f1],
    related_records: [{
      dataset_uuid: dataset.related_datasets[0].uuid,
      fields: [f2]
    }]
  };

  let record_uuid = await recordCreateAndTest(record, Helper.DEF_CURR_USER);
  let response = await recordDraftGet(record_uuid, Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(200);
  record = response.body
  return [template, dataset, record];
};

describe("update", () => {
  let template;
  let dataset;
  let record;
  beforeEach(async() => {
    [template, dataset, record] = await populateWithDummyTemplateAndRecord();
  });

  describe("Success cases", () => {

    test("Basic update - change a field", async () => {
      record.fields[0].value = "sad";
      await recordUpdateAndTest(record, Helper.DEF_CURR_USER);
    });

  });

  describe("Failure cases", () => {

    test("uuid in request and in object must match", async () => {

      let response = await recordUpdate(record, Helper.VALID_UUID, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

    });

    test("uuid must exist", async () => {

      record.uuid = Helper.VALID_UUID;

      let response = await recordUpdate(record, Helper.VALID_UUID, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(404);

    });

    test("must have edit permissions on the dataset", async () => {
      record.fields[0].value = "sad";
      let response = await recordUpdate(record, record.uuid, Helper.USER_2);
      expect(response.statusCode).toBe(401);
    });

    test("once a record is published, its dataset may never be changed", async () => {
      record = await recordPublishAndTest(record.uuid, record, Helper.DEF_CURR_USER);
      let dataset_alternative = {
        template_uuid: template.uuid,
        related_datasets: [{
            uuid: dataset.related_datasets[0].uuid,
            template_uuid: template.related_templates[0].uuid
          }
        ]
      };
      dataset_alternative = await Helper.datasetCreatePublishTest(dataset_alternative, Helper.DEF_CURR_USER);
      record.dataset_uuid = dataset_alternative.uuid;
      let response = await recordUpdate(record, record.uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);
    });
  });

  describe("update after a publish: is draft different and thus created or not?", () => {

    test("public_date, field", async () => {

      let template = {
        name: "template",
        public_date: (new Date()).toISOString(),
        fields: [{name: "field"}]
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        template_uuid: template.uuid,
        public_date: (new Date()).toISOString()
      };
      dataset = await Helper.datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      let record = {
        dataset_uuid: dataset.uuid,
        fields: [{uuid: template.fields[0].uuid, value: "something"}]
      };
      record = await recordCreatePublishTest(record, Helper.DEF_CURR_USER);

      // Test that draft exists if field changes
      record.fields[0].value = "else";
      await recordUpdateAndTest(record, Helper.DEF_CURR_USER);

      expect(await draftExisting(record.uuid)).toBe(true);

      record.fields[0].value = 'something';

      // Test that draft exists if public_date changes
      record.public_date = (new Date()).toISOString();
      await recordUpdateAndTest(record, Helper.DEF_CURR_USER);
      expect(await draftExisting(record.uuid)).toBe(true);

    });

    test("updating a related_record creates drafts of parents but not children", async () => {
      let field = {"name": "t1.1.1 f1"};
      // Create and publish template
      let template = {
        "name":"t1",
        "related_templates":[{
          "name": "t1.1",
          "related_templates":[{
            "name": "t1.1.1",
            "fields": [field],
            "related_templates":[{
              "name": "t1.1.1.1"
            }]
          }]
        }]
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        template_uuid: template.uuid,
        related_datasets: [{
            template_uuid: template.related_templates[0].uuid,
            related_datasets: [{
                template_uuid: template.related_templates[0].related_templates[0].uuid,
                related_datasets: [{
                    template_uuid: template.related_templates[0].related_templates[0].related_templates[0].uuid
                  }
                ]
              }
            ]
          }
        ]
      };
      dataset = await Helper.datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      field.uuid = template.related_templates[0].related_templates[0].fields[0].uuid;
      field.value = "strawberry";

      let record = {
        dataset_uuid: dataset.uuid,
        related_records: [{
          dataset_uuid: dataset.related_datasets[0].uuid,
          related_records: [{
            dataset_uuid: dataset.related_datasets[0].related_datasets[0].uuid,
            fields: [field],
            related_records: [{
              dataset_uuid: dataset.related_datasets[0].related_datasets[0].related_datasets[0].uuid,
            }]
          }]
        }]
      };

      let record_uuid = await recordCreateAndTest(record, Helper.DEF_CURR_USER);
      let response = await recordDraftGet(record_uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      record = response.body;

      // Publish the first time
      await recordPublishAndTest(record_uuid, record, Helper.DEF_CURR_USER);

      //  Submit an update on the 3rd layer
      response = await recordDraftGet(record_uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      record = response.body;
      record.related_records[0].related_records[0].fields[0].value = "banana";
      await recordUpdateAndTest(record, Helper.DEF_CURR_USER);

      // The first 3 layers, but not the fourth layer, should have drafts
      expect(await draftExisting(record.uuid)).toBeTruthy();
      expect(await draftExisting(record.related_records[0].uuid)).toBeTruthy();
      expect(await draftExisting(record.related_records[0].related_records[0].uuid)).toBeTruthy();
      expect(await draftExisting(record.related_records[0].related_records[0].related_records[0].uuid)).toBeFalsy();

    });

    test("update includes no change since last published: no draft created", async () => {
      await recordPublishAndTest(record.uuid, record, Helper.DEF_CURR_USER);
      await recordUpdateAndTest(record, Helper.DEF_CURR_USER);
      expect(await draftExisting(record.uuid)).toBeFalsy();
      expect(await draftExisting(record.related_records[0].uuid)).toBeFalsy();
    });

    test("update includes no changes since last published but a new dataset has been published: a new draft is created", async () => {
      await recordPublishAndTest(record.uuid, record, Helper.DEF_CURR_USER);
      dataset.public_date = (new Date()).toISOString();
      await Helper.datasetUpdatePublishTest(dataset, Helper.DEF_CURR_USER);
      await recordUpdateAndTest(record, Helper.DEF_CURR_USER);
      expect(await draftExisting(record.uuid)).toBeTruthy();
      expect(await draftExisting(record.related_records[0].uuid)).toBeFalsy();
    });

    test("update includes no changes except that a new version of a related_record has been published: a new draft is created", async () => {

      await recordPublishAndTest(record.uuid, record, Helper.DEF_CURR_USER);

      let related_record = record.related_records[0];
      related_record.fields[0].value = "new value";
      await recordUpdateAndTest(related_record, Helper.DEF_CURR_USER);
      await recordPublishAndTest(related_record.uuid, related_record, Helper.DEF_CURR_USER);

      await recordUpdateAndTest(record, Helper.DEF_CURR_USER);
      expect(await draftExisting(record.uuid)).toBeTruthy();
      expect(await draftExisting(record.related_records[0].uuid)).toBeFalsy();
    });

  });

});

describe("delete", () => {
  let template;
  let dataset;
  let record;
  beforeEach(async() => {
    [template, dataset, record] = await populateWithDummyTemplateAndRecord();
  });

  test("basic delete", async () => {
    // Delete the parent record
    let response = await recordDelete(record.uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);

    // The parent record should no longer exist
    response = await recordDraftGet(record.uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(404);

    // But the child still should
    response = await recordDraftGet(record.related_records[0].uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
  });

  test("uuid must exist", async () => {
    let response = await recordDelete(Helper.VALID_UUID, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(404);
  });

  test("must have edit permissions", async () => {
    let response = await recordDelete(record.uuid, Helper.USER_2);
    expect(response.statusCode).toBe(401);
  });
});

describe("publish (and get published)", () => {

  describe("Success cases", () => {
    test("Simple publish - no fields and no related records", async () => {
      let template = { 
        "name": "t1"
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);
      let dataset = {
        template_uuid: template.uuid
      }
      dataset = await Helper.datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      let record = {
        dataset_uuid: dataset.uuid
      }

      let record_uuid = await recordCreateAndTest(record, Helper.DEF_CURR_USER);

      await recordPublishAndTest(record_uuid, record, Helper.DEF_CURR_USER);
      
    });

    test("Complex publish - with nested fields and related templates to publish", async () => {
      let record;
      [_, _, record] = await populateWithDummyTemplateAndRecord();
      await recordPublishAndTest(record.uuid, record, Helper.DEF_CURR_USER);
    });

    test("Complex publish - changes in a nested property result in publishing for all parent properties", async () => {
      // Create and publish template
      let field = {"name": "f1"};
      let template = {
        "name":"1",
        "related_templates":[{
          "name": "2",
          "related_templates":[{
            "name": "3",
            "fields": [field],
            "related_templates":[{
              "name": "4"
            }]
          }]
        }]
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        template_uuid: template.uuid,
        related_datasets: [{
          template_uuid: template.related_templates[0].uuid,
          related_datasets: [{
            template_uuid: template.related_templates[0].related_templates[0].uuid,
            related_datasets: [{
              template_uuid: template.related_templates[0].related_templates[0].related_templates[0].uuid,
            }]
          }]
        }]
      };
      dataset = await Helper.datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      field.uuid = template.related_templates[0].related_templates[0].fields[0].uuid;
      field.value = "strawberry";

      let record = {
        dataset_uuid: dataset.uuid,
        related_records: [{
          dataset_uuid: dataset.related_datasets[0].uuid,
          related_records: [{
            dataset_uuid: dataset.related_datasets[0].related_datasets[0].uuid,
            fields: [field],
            related_records: [{
              dataset_uuid: dataset.related_datasets[0].related_datasets[0].related_datasets[0].uuid,
            }]
          }]
        }]
      };

      let record_uuid = await recordCreateAndTest(record, Helper.DEF_CURR_USER);
      let response = await recordDraftGet(record_uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      record = response.body;

      // Publish the first time
      await recordPublishAndTest(record_uuid, record, Helper.DEF_CURR_USER);

      // Edit the third record
      response = await recordDraftGet(record_uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      record = response.body;
      record.related_records[0].related_records[0].fields[0].value = "banana";
      await recordUpdateAndTest(record, Helper.DEF_CURR_USER);

      // Record the date before we publish a second time
      let intermediate_publish_date = (new Date()).getTime();

      // Now publish the record again
      let published = await recordPublishAndTest(record_uuid, record, Helper.DEF_CURR_USER);

      // On the third node and above, the publish date should be newer than the intermediate_publish_date. 
      // The fourth should be older
      
      expect(new Date(published.publish_date).getTime()).toBeGreaterThan(intermediate_publish_date);
      expect(new Date(published.related_records[0].publish_date).getTime()).toBeGreaterThan(intermediate_publish_date);
      expect(new Date(published.related_records[0].related_records[0].publish_date).getTime()).toBeGreaterThan(intermediate_publish_date);
      expect(new Date(published.related_records[0].related_records[0].related_records[0].publish_date).getTime()).toBeLessThan(intermediate_publish_date);
    });

    test("can create and publish records for subscribed templates", async () => {

      let subscribed_template = {
        name:"t2",
      };
      subscribed_template = await Helper.templateCreatePublishTest(subscribed_template, Helper.DEF_CURR_USER);

      let template = {
        name:"t1",
        subscribed_templates:[subscribed_template]
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);


      let dataset = {
        template_uuid: template.uuid,
        related_datasets: [{
          template_uuid: template.subscribed_templates[0].uuid
        }]
      };

      dataset = await Helper.datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      let record = {
        dataset_uuid: dataset.uuid,
        related_records: [{
          dataset_uuid: dataset.related_datasets[0].uuid,
        }]
      };
      await recordCreatePublishTest(record, Helper.DEF_CURR_USER);

    });

  });

  describe("Failure cases", () => {

    const publishFailureTest = async (uuid, curr_user, responseCode, last_update) => {
      if(!last_update) {
        last_update = await recordLastUpdateAndTest(uuid, curr_user);
      }
      let response = await recordPublish(uuid, last_update, curr_user);
      expect(response.statusCode).toBe(responseCode);
    };

    let template;
    let dataset;
    let record;
    beforeEach(async() => {
      [template, dataset, record] = await populateWithDummyTemplateAndRecord();
    });

    test("Record with uuid does not exist", async () => {
      await publishFailureTest(Helper.VALID_UUID, Helper.DEF_CURR_USER, 404, new Date());
    });

    test("No changes to publish", async () => {
      await recordPublishAndTest(record.uuid, record, Helper.DEF_CURR_USER);
      await publishFailureTest(record.uuid, Helper.DEF_CURR_USER, 400);
    });

    test("A new dataset has been published since this record was last updated", async () => {
      // publish original data
      await recordPublishAndTest(record.uuid, record, Helper.DEF_CURR_USER);
      // update record
      record.fields[0].value = "waffle";
      await recordUpdateAndTest(record, Helper.DEF_CURR_USER);
      // update dataset and publish
      dataset.public_date = (new Date()).toISOString();
      await Helper.datasetUpdatePublishTest(dataset, Helper.DEF_CURR_USER);
      // fail to publish record because it's dataset was just published
      await publishFailureTest(record.uuid, Helper.DEF_CURR_USER, 400);
      // update record again and this time succeed in publishing 
      await recordUpdateAndTest(record, Helper.DEF_CURR_USER);
      await recordPublishAndTest(record.uuid, record, Helper.DEF_CURR_USER);
    });

    test("Last update provided must match to actual last update in the database", async () => {
      await publishFailureTest(record.uuid, Helper.DEF_CURR_USER, 400, new Date());
    });

    test("Last update provided must match to actual last update in the database, also if sub-property is updated later", async () => {
      let parent_update = await recordLastUpdateAndTest(record.uuid, Helper.DEF_CURR_USER);
      let related_record = record.related_records[0];
      related_record.fields[0].value = "this programmer just ate a pear";
      await recordUpdateAndTest(related_record, Helper.DEF_CURR_USER);

      await publishFailureTest(record.uuid, Helper.DEF_CURR_USER, 400, parent_update);

      await recordPublishAndTest(record.uuid, record, Helper.DEF_CURR_USER);
    });

    test("Must have edit permissions to publish", async () => {
      let template = { 
        "name": "t1"
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);
      let dataset = {
        template_uuid: template.uuid
      }
      dataset = await Helper.datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      let record = {
        dataset_uuid: dataset.uuid
      }

      let record_uuid = await recordCreateAndTest(record, Helper.DEF_CURR_USER);

      let last_update = await recordLastUpdateAndTest(record_uuid, Helper.DEF_CURR_USER);
      let response = await recordPublish(record_uuid, last_update, Helper.USER_2);
      expect(response.statusCode).toBe(401);
      
    });

  });
});

describe("get published", () => {
  test("if user does not have view access to linked properties, an empty object replaces that property", async () => {
    
    let template = { 
      name: "t1",
      related_templates: [{name: "t1.1"}]
    };
    template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);  

    let dataset = { 
      template_uuid: template.uuid,
      related_datasets: [{
        template_uuid: template.related_templates[0].uuid
      }]
    };
    dataset = await Helper.datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);  
    
    let record = { 
      dataset_uuid: dataset.uuid,
      related_records: [{
        dataset_uuid: dataset.related_datasets[0].uuid
      }]
    };
    record = await recordCreatePublishTest(record, Helper.DEF_CURR_USER);  
    
    let view_users = [Helper.USER_2, Helper.DEF_CURR_USER];
    let response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, template.uuid, PERMISSION_VIEW, view_users);
    expect(response.statusCode).toBe(200);
    response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, dataset.uuid, PERMISSION_VIEW, view_users);
    expect(response.statusCode).toBe(200);

    record.related_records[0] = {uuid: record.related_records[0].uuid};
    // Fetch parent dataset, check that the related_dataset is fetched as blank 
    // since the second user
    response = await recordLatestPublishedGet(record.uuid, Helper.USER_2);
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject(record);   
  });

  test("must have view permissions", async () => {
    let template = { 
      name: "t1"
    };
    template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);  

    let dataset = { 
      template_uuid: template.uuid
    };
    dataset = await Helper.datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);  

    let record = { 
      dataset_uuid: dataset.uuid
    };
    record = await recordCreatePublishTest(record, Helper.DEF_CURR_USER);  

    let response = await recordLatestPublishedGet(record.uuid, Helper.USER_2);
    expect(response.statusCode).toBe(401);
  });
});

test("get published for a certain date", async () => {
  let template, dataset, record;
  [template, dataset, record] = await populateWithDummyTemplateAndRecord();

  let publish0 = new Date();

  await recordPublishAndTest(record.uuid, record, Helper.DEF_CURR_USER);

  let publish1 = new Date();

  record.fields[0].value = '2';
  await recordUpdateAndTest(record, Helper.DEF_CURR_USER);
  await recordPublishAndTest(record.uuid, record, Helper.DEF_CURR_USER);

  let publish2 = new Date();

  record.fields[0].value = '3';
  await recordUpdateAndTest(record, Helper.DEF_CURR_USER);
  await recordPublishAndTest(record.uuid, record, Helper.DEF_CURR_USER);

  let publish3 = new Date();

  // Now we have published 3 times. Search for versions based on timestamps.

  let response = await recordGetPublishedBeforeTimestamp(record.uuid, publish0, Helper.DEF_CURR_USER);
  expect(response.statusCode).toEqual(404);

  response = await recordGetPublishedBeforeTimestamp(record.uuid, publish1, Helper.DEF_CURR_USER);
  expect(response.statusCode).toEqual(200);
  expect(response.body.fields[0].value).toEqual(expect.stringMatching("happy"));

  response = await recordGetPublishedBeforeTimestamp(record.uuid, publish2, Helper.DEF_CURR_USER);
  expect(response.statusCode).toEqual(200);
  expect(response.body.fields[0].value).toEqual(expect.stringMatching("2"));

  response = await recordGetPublishedBeforeTimestamp(record.uuid, publish3, Helper.DEF_CURR_USER);
  expect(response.statusCode).toEqual(200);
  expect(response.body.fields[0].value).toEqual(expect.stringMatching("3"));
});

describe("recordLastUpdate", () => {

  describe("success", () => {
    test("basic draft, no fields or related templates", async () => {
      let template = {
        "name":"t1"
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        template_uuid: template.uuid
      };
      dataset = await Helper.datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      let record = {
        dataset_uuid: dataset.uuid
      };

      let before_update = new Date();

      let record_uuid = await recordCreateAndTest(record, Helper.DEF_CURR_USER);

      let last_update = await recordLastUpdateAndTest(record_uuid, Helper.DEF_CURR_USER);
      expect(last_update.getTime()).toBeGreaterThan(before_update.getTime());
    });

    test("sub record updated later than parent record", async () => {
      let template, dataset, record;
      [template, dataset, record] = await populateWithDummyTemplateAndRecord();

      let related_record = record.related_records[0];

      let between_updates = new Date();

      await recordUpdateAndTest(related_record, Helper.DEF_CURR_USER);

      let last_update = await recordLastUpdateAndTest(record.uuid, Helper.DEF_CURR_USER);
      expect(last_update.getTime()).toBeGreaterThan(between_updates.getTime());
    });

    test("sub record updated and published later than parent dataset", async () => {

      let field = {name: "t1.1f1"};
      let template = {
        "name": "t1",
        "related_templates": [{
          "name": "t1.1",
          fields: [{name: "t1.1f1"}]
        }]
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        template_uuid: template.uuid,
        related_datasets: [{
          template_uuid: template.related_templates[0].uuid
        }]
      };
      dataset = await Helper.datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      field.uuid = template.related_templates[0].fields[0].uuid;
      field.value = "naruto";

      let record = {
        dataset_uuid: dataset.uuid,
        related_records: [{
          dataset_uuid: dataset.related_datasets[0].uuid,
          fields: [field]
        }]
      };
      record = await recordCreatePublishTest(record, Helper.DEF_CURR_USER);

      let related_record = record.related_records[0];
      related_record.fields[0].value = "pokemon";

      let response = await recordUpdate(related_record, related_record.uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toEqual(200);

      let time1 = new Date();
      await recordPublishAndTest(related_record.uuid, related_record, Helper.DEF_CURR_USER);
      let time2 = new Date();

      response = await recordLastUpdate(record.uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(time1.getTime());
      expect((new Date(response.body)).getTime()).toBeLessThan(time2.getTime());
    });

    test("grandchild updated, but child deleted. Updated time should still be grandchild updated", async () => {
      let field = {name: "t3f1"};
      let template = {
        "name": "1",
        "related_templates": [{
          "name": "2",
          "related_templates": [{
            "name": "3",
            fields: [field]
          }]
        }]
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        template_uuid: template.uuid,
        related_datasets: [{
          template_uuid: template.related_templates[0].uuid,
          related_datasets: [{
            template_uuid: template.related_templates[0].related_templates[0].uuid
          }]
        }]
      };
      dataset = await Helper.datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      field.uuid = template.related_templates[0].related_templates[0].fields[0].uuid;
      field.value = 'waffle';

      let record = {
        dataset_uuid: dataset.uuid,
        related_records: [{
          dataset_uuid: dataset.related_datasets[0].uuid,
          related_records: [{
            dataset_uuid: dataset.related_datasets[0].related_datasets[0].uuid,
            fields: [field]
          }]
        }]
      };
      let uuid = await recordCreateAndTest(record, Helper.DEF_CURR_USER);

      // create
      let response = await recordDraftGet(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      record = response.body;

      let record2 = record.related_records[0];
      let record3 = record2.related_records[0];

      // publish
      await recordPublishAndTest(uuid, record, Helper.DEF_CURR_USER);

      // Update grandchild
      record3.fields[0].value = "jutsu";

      response = await recordUpdate(record3, record3.uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);

      response = await recordDraftGet(record3.uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let update_3_timestamp = response.body.updated_at;

      // Now get the update timestamp for the grandparent. It should be that of the grandchild.
      response = await recordLastUpdate(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual(update_3_timestamp);
      
    });

  });

  describe("failure", () => {
    test("invalid uuid", async () => {
      let response = await recordLastUpdate("18", Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

      response = await recordLastUpdate(Helper.VALID_UUID, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(404);
    })

    test("must have edit permissions to get last update of draft", async () => {
      let template = {
        "name":"t1"
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        template_uuid: template.uuid
      };
      dataset = await Helper.datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      let record = {
        dataset_uuid: dataset.uuid
      };
      let uuid = await recordCreateAndTest(record, Helper.DEF_CURR_USER);

      let response = await recordLastUpdate(uuid, Helper.USER_2);
      expect(response.statusCode).toBe(401);
    });

    test("must have view permissions to get last update of published", async () => {
      let template = {
        "name":"t1"
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        template_uuid: template.uuid
      };
      dataset = await Helper.datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      let record = {
        dataset_uuid: dataset.uuid
      };
      record = await recordCreatePublishTest(record, Helper.DEF_CURR_USER);

      let response = await recordLastUpdate(record.uuid, Helper.USER_2);
      expect(response.statusCode).toBe(401);
    });
  });
})

test("full range of operations with big data", async () => {

  let t1f1 = {name: "t1f1"};
  let t1f2 = {name: "t1f2"};
  let t1f3 = {name: "t1f3"};
  let t111f1 = {name: "t1.1.1f1"};
  let t111f2 = {name: "t1.1.1f2"};
  let t1111f1 = {name: "t1.1.1.1f1"};
  let t1111f2 = {name: "t1.1.1.1f2"};
  let t112f1 = {name: "t1.1.2f1"};
  let t112f2 = {name: "t1.1.2f2"};
  let t1121f1 = {name: "t1.1.2.1f1"};
  let t1121f2 = {name: "t1.1.2.1f2"};

  let template = {
    name: "1",
    fields: [t1f1, t1f2, t1f3],
    related_templates: [
      {
        name: "1.1",
        related_templates: [
          {
            name: "1.1.1",
            fields: [t111f1, t111f2],
            related_templates: [
              {
                name: "1.1.1.1",
                fields: [t1111f1, t1111f2]
              },
              {
                name: "1.1.1.2"
              }
            ]
          },
          {
            name: "1.1.2",
            fields: [t112f1, t112f2],
            related_templates: [
              {
                name: "1.1.2.1",
                fields: [t1121f1, t1121f2]
              },
              {
                name: "1.1.2.2"
              }
            ]
          }
        ]
      }
    ]
  }
  template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

  let dataset = {
    template_uuid: template.uuid,
    related_datasets: [
      {
        template_uuid: template.related_templates[0].uuid,
        related_datasets: [
          {
            template_uuid: template.related_templates[0].related_templates[0].uuid,
            related_datasets: [
              {
                template_uuid: template.related_templates[0].related_templates[0].related_templates[0].uuid,
              },
              {
                template_uuid: template.related_templates[0].related_templates[0].related_templates[1].uuid
              }
            ]
          },
          {
            template_uuid: template.related_templates[0].related_templates[1].uuid,
            related_datasets: [
              {
                template_uuid: template.related_templates[0].related_templates[1].related_templates[0].uuid,
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
  dataset = await Helper.datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

  t1f1.uuid = template.fields[0].uuid;
  t1f2.uuid = template.fields[1].uuid;
  t1f3.uuid = template.fields[2].uuid;
  t111f1.uuid = template.related_templates[0].related_templates[0].fields[0].uuid;
  t111f2.uuid = template.related_templates[0].related_templates[0].fields[1].uuid;
  t1111f1.uuid = template.related_templates[0].related_templates[0].related_templates[0].fields[0].uuid;
  t1111f2.uuid = template.related_templates[0].related_templates[0].related_templates[0].fields[1].uuid;
  t112f1.uuid = template.related_templates[0].related_templates[1].fields[0].uuid;
  t112f2.uuid = template.related_templates[0].related_templates[1].fields[1].uuid;
  t1121f1.uuid = template.related_templates[0].related_templates[1].related_templates[0].fields[0].uuid;
  t1121f2.uuid = template.related_templates[0].related_templates[1].related_templates[0].fields[1].uuid;

  t1f1.value = "pumpkin";
  t111f2.value = "friend";
  t1121f1.value = "mango";

  let record = {
    dataset_uuid: dataset.uuid,
    fields: [t1f1, t1f2, t1f3],
    related_records: [
      {
        dataset_uuid: dataset.related_datasets[0].uuid,
        related_records: [
          {
            dataset_uuid: dataset.related_datasets[0].related_datasets[0].uuid,
            fields: [t111f1, t111f2],
            related_records: [
              {
                dataset_uuid: dataset.related_datasets[0].related_datasets[0].related_datasets[0].uuid,
                fields: [t1111f1, t1111f2]
              },
              {
                dataset_uuid: dataset.related_datasets[0].related_datasets[0].related_datasets[1].uuid
              }
            ]
          },
          {
            dataset_uuid: dataset.related_datasets[0].related_datasets[1].uuid,
            fields: [t112f1, t112f2],
            related_records: [
              {
                dataset_uuid: dataset.related_datasets[0].related_datasets[1].related_datasets[0].uuid,
                fields: [t1121f1, t1121f2]
              },
              {
                dataset_uuid: dataset.related_datasets[0].related_datasets[1].related_datasets[1].uuid
              }
            ]
          }
        ]
      }
    ]
  };

  let record_uuid = await recordCreateAndTest(record, Helper.DEF_CURR_USER);

  let response = await recordDraftGet(record_uuid, Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(200);
  record = response.body;
  await recordPublishAndTest(record_uuid, record, Helper.DEF_CURR_USER);

});