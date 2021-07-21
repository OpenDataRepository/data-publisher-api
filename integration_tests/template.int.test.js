const request = require("supertest");
const MongoDB = require('../lib/mongoDB');
var { app, init: appInit } = require('../app');
const { response } = require("express");
// var { MongoMemoryReplSet } = require('mongodb-memory-server');

// var replset;
// var uri;
 
const ValidUUID = "47356e57-eec2-431b-8059-f61d5f9a6bc6";

beforeAll(async () => {
  // replset = await MongoMemoryReplSet.create({ replSet: {} });
  // console.log(replset.state);
  // uri = replset.getUri();
  //uri += '&retryWrites=false'
  // console.log(`uri: ${uri}`);
  // process.env.DB = uri;
  await appInit();
});

async function clearDatabase() {
  let db = MongoDB.db();
  await db.collection('templates').deleteMany();
  await db.collection('template_fields').deleteMany();
}

afterEach(async() => {
  await clearDatabase();
});

afterAll(async () => {
  await clearDatabase();
  await MongoDB.close();
  // await replset.stop();
});

const createSuccessTest = async (data) => {
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

describe("create / get draft", () => {

  describe("Success cases", () => {


    test("Simple create - no fields and no related templates", async () => {

      let data = {
        "name":"create template",
        "description":"a template to test a create",
        "fields":[],
        "related_templates":[]
      };
      await createSuccessTest(data);
    });
  
    test("Create template with related template and field", async () => {
  
      let data = { 
        "name": "create template",
        "description": "a template to test a create",
        "fields": [
          { 
            "name": "creaate template field",
            "description": "a dummy field to go with a template create"
          }
        ],
        "related_templates": [
          { 
            "name": "create template child",
            "description": "the child of create template",
            "fields": [
              { 
                "name": "create template child field"
              }
            ]
          }
        ]
      };
      await createSuccessTest(data);
    });
  
    test("Create template with related templates going 6 nodes deep", async () => {
  
      let data = { 
        "name": "template 1",
        "description": "ancestor",
        "fields": [
          { 
            "name": "field 1"
          }
        ],
        "related_templates": [
          { 
            "name": "template 2",
            "fields": [
              { 
                "name": "field 2"
              }
            ],
            "related_templates": [
              { 
                "name": "template 3",
                "fields": [
                  { 
                    "name": "field 3"
                  }
                ],
                "related_templates": [
                  { 
                    "name": "template 4",
                    "fields": [
                      { 
                        "name": "field 4"
                      }
                    ],
                    "related_templates": [
                      { 
                        "name": "template 5",
                        "fields": [
                          { 
                            "name": "field 5"
                          }
                        ],
                        "related_templates": [
                          { 
                            "name": "template 6",
                            "fields": [
                              { 
                                "name": "field 6"
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
          }
        ]
      };
      await createSuccessTest(data);
    });
  })

  describe("Failure cases", () => {

    const failureTest = async (data, responseCode) => {
      let response = await request(app)
        .post('/template')
        .send(data)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(responseCode);
    };

    test("Input must be an object", async () => {
      let data = [];
      await failureTest(data, 400);
    })

    test("Name and description must be strings", async () => {
      let invalidName = {
        name: 5
      };
      let invalidDescription = {
        name: 5
      };
      await failureTest(invalidName, 400);
      await failureTest(invalidDescription, 400);
    })

    test("Fields and related_templates must be arrays", async () => {
      let invalidFields = {
        fields: ""
      };
      let invalidRelatedTemplates = {
        related_templates: {}
      };
      await failureTest(invalidFields, 400);
      await failureTest(invalidRelatedTemplates, 400);
    })

    test("Each of fields and related_templates must be valid", async () => {
      let invalidFields = { 
        "fields": [
          { 
            "name": 5
          }
        ]
      };
      let invalidRelatedTemplates = { 
        "related_templates": [
          { 
            "name": 5
          }
        ]
      };
      await failureTest(invalidFields, 400);
      await failureTest(invalidRelatedTemplates, 400);
    })

  })
  
});

describe("update / get draft", () => {

  let uuid;

  beforeEach(async() => {
    let data = { 
      "name": "create template",
      "description": "a template to test a create",
      "fields": [
        { 
          "name": "creaate template field",
          "description": "a dummy field to go with a template create"
        }
      ],
      "related_templates": [
        { 
          "name": "create template child",
          "description": "the child of create template",
          "fields": [
            { 
              "name": "create template child field"
            }
          ]
        }
      ]
    };
    uuid = await createSuccessTest(data);
  });

  describe("Success cases", () => {

    test("Basic update - change name and delete everything else", async () => {

      let data = { 
        "uuid": uuid,
        "name": "create template"
      };

      let response = await request(app)
        .put(`/template/${uuid}`)
        .send(data)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);
    
      response = await request(app)
        .get(`/template/${uuid}/draft`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject(data);

    });

    test("Add a new field and related template", async () => {

      let data = { 
        "uuid": uuid,
        "fields": [{
          "name": 'field name'
        }],
        "related_templates": [{
          "name": "related_template name"
        }]
      };

      let response = await request(app)
        .put(`/template/${uuid}`)
        .send(data)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);
    
      response = await request(app)
        .get(`/template/${uuid}/draft`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject(data);

    });

    test("Add an existing field and related template", async () => {

      let related_template_data = {
        "name": "related_template name"
      };
      let related_template_uuid = await createSuccessTest(related_template_data);
      related_template_data.uuid = related_template_uuid;
      related_template_data.description = "a description";

      // Get the existing field so we can include that in our update
      let response = await request(app)
        .get(`/template/${uuid}/draft`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);
      let field_data = response.body.fields[0];
      delete field_data.updated_at;
      field_data.name = "new name";

      let data = { 
        "uuid": uuid,
        "related_templates": [related_template_data],
        "fields": [field_data]
      };

      response = await request(app)
        .put(`/template/${uuid}`)
        .send(data)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);
    
      response = await request(app)
        .get(`/template/${uuid}/draft`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject(data);

    });
  
  })

  describe("Failure cases", () => {

    test("uuid in request and in object must match", async () => {

      let data = { 
        "name": "create template"
      };

      let response = await request(app)
        .put(`/template/${uuid}`)
        .send(data)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(400);

    })

    test("uuid must exist", async () => {

      let data = { 
        "uuid": ValidUUID,
        "name": "create template"
      };

      let response = await request(app)
        .put(`/template/${ValidUUID}`)
        .send(data)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(404);

    })
  })
  
});
