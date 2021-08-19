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

const recordCreateAndTest = async (data) => {
  let response = await request(app)
    .post('/record')
    .send(data)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);
  expect(response.body.inserted_uuid).toBeTruthy();

  data.uuid = response.body.inserted_uuid;
  
  response = await request(app)
    .get(`/record/${response.body.inserted_uuid}/draft`)
    .set('Accept', 'application/json');

  expect(response.statusCode).toBe(200);
  expect(response.body).toMatchObject(data);
  return response.body.uuid;
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

// TODO: When I test update, test that we do not allow the template uuid to change.