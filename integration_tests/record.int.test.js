const request = require("supertest");
const MongoDB = require('../lib/mongoDB');
var { app, init: appInit } = require('../app');
const { response } = require("express");

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

const templateCreate = async (data) => {
  let response = await request(app)
    .post('/template')
    .send(data)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);
  expect(response.body.inserted_uuid).toBeTruthy();

  response = await request(app)
    .get(`/template/${response.body.inserted_uuid}/draft`)
    .set('Accept', 'application/json');

  expect(response.statusCode).toBe(200);
  expect(response.body).toMatchObject(data);
  return response.body.uuid;
};

const templatePublish = async (uuid) => {
  let response = await request(app)
    .post(`/template/${uuid}/publish`)
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
  let uuid = await templateCreate(template);
  await templatePublish(uuid);
  let published_template = await templateGet(uuid);
  return published_template;
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

const recordUpdateAndTest = async (data, uuid) => {
  await recordUpdate(data, uuid);
  delete data.updated_at;
  
  let record = await recordDraftGet(uuid);
  expect(record).toMatchObject(data);
};

describe("create (and get draft after a create)", () => {
  describe("Success cases", () => {

    test("No fields or related records", async () => {

      let template = {
        "name":"create template",
        "description":"a template to test a create"
      };
      let template_uuid = await templateCreate(template);
      await templatePublish(template_uuid);

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
      let template_uuid = await templateCreate(template);
      await templatePublish(template_uuid);

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
      let template_uuid = await templateCreate(template);
      await templatePublish(template_uuid);

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
      let template_uuid = await templateCreate(template);
      await templatePublish(template_uuid);

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
      let template_uuid = await templateCreate(template);
      await templatePublish(template_uuid);

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

      let template_uuid = await templateCreate(template);
      await templatePublish(template_uuid);

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

      let other_template_uuid = await templateCreate(other_template);
      await templatePublish(other_template_uuid);

      let template_uuid = await templateCreate(template);
      await templatePublish(template_uuid);

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
      let template_uuid = await templateCreate(template);
      await templatePublish(template_uuid);

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

describe("update (and get draft after a create)", () => {
  let template;
  let record;
  

  beforeEach(async() => {

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
  });

  describe("Success cases", () => {

    test("Basic update - change a field", async () => {
      record.fields[0].value = "sad";
      record.related_records = [];
      await recordUpdateAndTest(record, record.uuid);
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