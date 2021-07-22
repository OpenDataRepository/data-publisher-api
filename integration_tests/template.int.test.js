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

beforeEach(async() => {
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

describe("create (and get draft after a create)", () => {

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
  
    // TODO: when field endpoints are added, test they are also created
    test("Create template with related template and field", async () => {
  
      let related_template_data = { 
        "name": "create template child",
        "description": "the child of create template",
        "fields": [
          { 
            "name": "create template child field"
          }
        ]
      };
      let data = { 
        "name": "create template",
        "description": "a template to test a create",
        "fields": [
          { 
            "name": "creaate template field",
            "description": "a dummy field to go with a template create"
          }
        ],
        "related_templates": [related_template_data]
      };
      let uuid = await createSuccessTest(data);

      // Now test that the related template was also created separately
      let response = await request(app)
      .get(`/template/${uuid}/draft`)
      .set('Accept', 'application/json');
      let related_template_uuid = response.body.related_templates[0].uuid;
      response = await request(app)
      .get(`/template/${related_template_uuid}/draft`)
      .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject(related_template_data);
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

describe("update (and get draft after an update)", () => {

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

describe("publish (and get published and draft after a publish)", () => {

  describe("Success cases", () => {

    test("Simple publish - no fields and no related templates", async () => {

      let data = {
        "name":"basic template",
        "description":"a template to test a publish",
        "fields":[],
        "related_templates":[]
      };
      let uuid = await createSuccessTest(data);

      let response = await request(app)
        .post(`/template/${uuid}/publish`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);
    
      // Check that a published version now exists
      response = await request(app)
        .get(`/template/${uuid}/latest_published`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject(data);
      expect(response.body).toHaveProperty("publish_date");


      // Check that we can still get a draft version
      response = await request(app)
        .get(`/template/${uuid}/draft`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject(data);
    });

    // TODO: when field endpoints are added, test they are also published
    test("Complex publish - with nested fields and related templates to publish", async () => {

      let related_template_data = {
        "name": "a child template",
        "fields": [{
          "name": "a child field"
        }]
      };
      let data = {
        "name":"basic template",
        "description":"a template to test a publish",
        "fields":[{
          "name": "a field"
        }],
        "related_templates":[related_template_data]
      };
      let uuid = await createSuccessTest(data);

      let response = await request(app)
        .post(`/template/${uuid}/publish`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);
    
      // Check that a published version now exists
      response = await request(app)
        .get(`/template/${uuid}/latest_published`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject(data);

      // Check that the related template was also published
      let related_template_uuid = response.body.related_templates[0].uuid;
      response = await request(app)
        .get(`/template/${related_template_uuid}/latest_published`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject(related_template_data);

    });

    test("Complex publish - changes in a nested property result in publishing for all parent properties", async () => {

      let data = {
        "name":"1",
        "related_templates":[{
          "name": "2",
          "related_templates":[{
            "name": "3",
            "related_templates":[{
              "name": "4"
            }]
          }]
        }]
      };
      // Create initial data
      let uuid = await createSuccessTest(data);

      // Publish
      let response = await request(app)
        .post(`/template/${uuid}/publish`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);

      response = await request(app)
        .get(`/template/${uuid}/latest_published`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject(data);

      data = response.body;

      // Make a change in the third level of data
      data.related_templates[0].related_templates[0].description = "3 has a new description";

      // Update with change
      response = await request(app)
        .put(`/template/${uuid}`)
        .send(data)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);

      // Record the date before we publish a second time
      let intermediate_publish_date = (new Date()).getTime();

      // Publish again
      response = await request(app)
        .post(`/template/${uuid}/publish`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);
      
      response = await request(app)
        .get(`/template/${uuid}/latest_published`)
        .set('Accept', 'application/json');
      data = response.body;

      // On the third node and above, the publish date should be newer than the intermediate_publish_date. 
      // The fourth should be older
      
      expect(new Date(data.publish_date).getTime()).toBeGreaterThan(intermediate_publish_date);
      expect(new Date(data.related_templates[0].publish_date).getTime()).toBeGreaterThan(intermediate_publish_date);
      expect(new Date(data.related_templates[0].related_templates[0].publish_date).getTime()).toBeGreaterThan(intermediate_publish_date);
      expect(new Date(data.related_templates[0].related_templates[0].related_templates[0].publish_date).getTime()).toBeLessThan(intermediate_publish_date);

    });

  })

  describe("Failure cases", () => {
    
    test("Template with uuid does not exist", async () => {

      let data = {
        "name":"basic template"
      };
      await createSuccessTest(data);

      let response = await request(app)
        .post(`/template/${ValidUUID}/publish`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(404);

    });

    test("No changes to publish", async () => {
      let data = {
        "name":"basic template"
      };
      let uuid = await createSuccessTest(data);

      let response = await request(app)
        .post(`/template/${uuid}/publish`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);

      response = await request(app)
        .post(`/template/${uuid}/publish`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(400);
    });

    test("Internal refrence invalid", async () => {
      let data = {
        "name":"temp1",
        "related_templates": [{
          "name": "temp2"
        }]
      };

      let uuid = await createSuccessTest(data);

      let response = await request(app)
        .get(`/template/${uuid}/draft`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject(data);

      // Delete the internal draft
      response = await request(app)
        .delete(`/template/${response.body.related_templates[0].uuid}/draft`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);

      // Expect publish of parent draft to fail because of invalid reference 
      response = await request(app)
        .post(`/template/${uuid}/publish`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(400);

      // Fetch parent draft again, thus purging reference to internal draft
      response = await request(app)
        .get(`/template/${uuid}/draft`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);

      // Expect publish of parent draft to succeed because invalid reference has been removed
      response = await request(app)
        .post(`/template/${uuid}/publish`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);
    });

  })


});

test("get published for a certain date", async () => {
  let data = {
    "name":"basic template",
    "description": "1"
  };
  let uuid = await createSuccessTest(data);

  let beforeFirstPublish = new Date();

  let response = await request(app)
    .post(`/template/${uuid}/publish`)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);

  let afterFirstPublish = new Date();

  data.uuid = uuid;
  data.description = "2";

  response = await request(app)
    .put(`/template/${uuid}`)
    .send(data)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);

  response = await request(app)
    .post(`/template/${uuid}/publish`)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);

  let afterSecondPublish = new Date();

  data.description = "3";

  response = await request(app)
    .put(`/template/${uuid}`)
    .send(data)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);

  response = await request(app)
    .post(`/template/${uuid}/publish`)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);

  // Now there should be three published versions. Search for each based on the date

  response = await request(app)
    .get(`/template/${uuid}/latest_published`)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);
  expect(response.body.description).toEqual(expect.stringMatching("3"));

  response = await request(app)
    .get(`/template/${uuid}/${(new Date()).toISOString()}`)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);
  expect(response.body.description).toEqual(expect.stringMatching("3"));

  response = await request(app)
    .get(`/template/${uuid}/${afterSecondPublish.toISOString()}`)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);
  expect(response.body.description).toEqual(expect.stringMatching("2"));

  response = await request(app)
    .get(`/template/${uuid}/${afterFirstPublish.toISOString()}`)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);
  expect(response.body.description).toEqual(expect.stringMatching("1"));

  response = await request(app)
    .get(`/template/${uuid}/${beforeFirstPublish.toISOString()}`)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(404);
});

test("delete a draft, not a published version", async () => {
  let data = {
    "name":"basic template",
    "description": "description"
  };
  let uuid = await createSuccessTest(data);

  let response = await request(app)
    .post(`/template/${uuid}/publish`)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);

  data.uuid = uuid;
  data.description = "different";

  // Change the draft, but don't publish the change
  response = await request(app)
    .put(`/template/${uuid}`)
    .send(data)
  console.log(response.body);
  expect(response.statusCode).toBe(200);

  // Verify that the draft is what we changed it to
  response = await request(app)
    .get(`/template/${uuid}/draft`)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);

  // Delete the draft
  response = await request(app)
    .delete(`/template/${uuid}/draft`)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);

  // Get the draft again. Make sure it matches the latest published version
  response = await request(app)
    .get(`/template/${uuid}/latest_published`)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);

  data.description = "description";
  expect(response.body).toMatchObject(data);

});
