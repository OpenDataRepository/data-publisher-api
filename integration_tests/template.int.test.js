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
  
    test("Create template with related template and field", async () => {
  
      let related_template_data = { 
        "name": "create template child",
        "description": "the child of create template"
      };
      let field_data = {
        "name": "create template field"
      }
      let data = { 
        "name": "create template",
        "description": "a template to test a create",
        "fields": [field_data],
        "related_templates": [related_template_data]
      };
      let uuid = await createSuccessTest(data);

      let response = await request(app)
        .get(`/template/${uuid}/draft`)
        .set('Accept', 'application/json');
         
      let related_template_uuid = response.body.related_templates[0].uuid;
      let field_uuid = response.body.fields[0].uuid;

      // Now test that the related template was also created separately 
      response = await request(app)
        .get(`/template/${related_template_uuid}/draft`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject(related_template_data);

      // Now test that the field was also created separately  
      response = await request(app)
        .get(`/template_field/${field_uuid}/draft`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject(field_data);
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
        description: 5
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

    // test("Updating a parent does not update a child if the child has no changes", async () => {
    //   let data = {
    //     "name": "parent",
    //     "related_templates": [{
    //       "name": "child"
    //     }]
    //   }
    //   let parent_uuid = await createSuccessTest(data);

    //   let response = await request(app)
    //     .get(`/template/${parent_uuid}/draft`)
    //     .set('Accept', 'application/json');
    //   expect(response.statusCode).toBe(200);

    //   data = response.body;
    //   let child_uuid = data.related_templates[0].uuid;
    //   let update_time = data.related_templates[0].updated_at;

    //   data.description = "added a description";

    //   response = await request(app)
    //     .put(`/template/${parent_uuid}`)
    //     .send(data)
    //     .set('Accept', 'application/json');
    //   expect(response.statusCode).toBe(200);

    //   response = await request(app)
    //     .get(`/template/${child_uuid}/draft`)
    //     .set('Accept', 'application/json');
    //   expect(response.statusCode).toBe(200);

    //   expect(response.body.updated_at).toEqual(update_time)
    // })
  
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
      let field_data = {
        "name": "a field"
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

      let related_template_uuid = response.body.related_templates[0].uuid;
      let field_uuid = response.body.fields[0].uuid;

      // Check that the related template was also published
      response = await request(app)
        .get(`/template/${related_template_uuid}/latest_published`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject(related_template_data);

      // Check that the field was also published
      response = await request(app)
        .get(`/template_field/${field_uuid}/latest_published`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject(field_data);
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

    test("Complex publish - publish parent who's child changed previously and no other changes are present", async () => {

      let data = {
        "name":"1",
        "related_templates":[{
          "name": "2"
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
      data.related_templates[0].description = "2 has a new description";
      let uuid2 = data.related_templates[0].uuid;

      // Update second template
      response = await request(app)
        .put(`/template/${uuid2}`)
        .send(data.related_templates[0])
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);

      // Record the date before we publish the change to the second template
      let publish_date_2 = (new Date()).getTime();

      // Publish again
      response = await request(app)
        .post(`/template/${uuid2}/publish`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);
      
      // Now we want to get a draft of the parent and publish that draft as it is. It should be successful since the child changed.
      
      response = await request(app)
        .get(`/template/${uuid}/draft`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);
      data = response.body;
      
      // Update with change
      response = await request(app)
        .put(`/template/${uuid}`)
        .send(data)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);

      // Record the date before we publish the parent template again
      let publish_date_3 = (new Date()).getTime();

      // Publish again
      response = await request(app)
        .post(`/template/${uuid}/publish`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);
      
      response = await request(app)
        .get(`/template/${uuid}/latest_published`)
        .set('Accept', 'application/json');
      data = response.body;

      expect(new Date(data.publish_date).getTime()).toBeGreaterThan(publish_date_3);
      expect(new Date(data.related_templates[0].publish_date).getTime()).toBeGreaterThan(publish_date_2);
      expect(new Date(data.related_templates[0].publish_date).getTime()).toBeLessThan(publish_date_3);
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

  test("Updating dependent templates", async () => {

    let related_template_data = {
      "name": "a child template",
      "fields": [{
        "name": "a child field"
      }]
    };
    let data = {
      "name":"basic template",
      "description":"",
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
    related_template_data = response.body.related_templates[0];
    let related_template_uuid = related_template_data.uuid;
    response = await request(app)
      .get(`/template/${related_template_uuid}/latest_published`)
      .set('Accept', 'application/json');
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject(related_template_data);

    // Now update and publish the sub-template
    related_template_data.description = "new descripiton";

    response = await request(app)
      .put(`/template/${related_template_uuid}`)
      .send(related_template_data)
      .set('Accept', 'application/json');
    expect(response.statusCode).toBe(200);

    response = await request(app)
      .post(`/template/${related_template_uuid}/publish`)
      .set('Accept', 'application/json');
    expect(response.statusCode).toBe(200);

    // Now the important part. Test that publish also created a draft of the parent template
    response = await request(app)
      .get(`/template/${uuid}/draft_existing`)
      .set('Accept', 'application/json');
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(true);

  });


});

test("get published for a certain date", async () => {
  let data = {
    "name":"basic template",
    "description": "1"
  };
  let uuid = await createSuccessTest(data);

  let beforeFirstPublish = new Date();

  // Test that if only a draft exists, it is not fetched
  let response = await request(app)
    .get(`/template/${uuid}/${beforeFirstPublish.toISOString()}`)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(404);

  response = await request(app)
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

describe("templateLastUpdate", () => {

  describe("success", () => {
    test("basic draft, no fields or related templates", async () => {
      let timestamp = new Date();
      let data = {
        "name":"1"
      };
      let uuid = await createSuccessTest(data);

      let response = await request(app)
        .get(`/template/${uuid}/last_update`);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(timestamp.getTime());
    });

    test("sub template updated later than parent template", async () => {
      // let timestamp_before_create = new Date();
      let data = {
        "name": "1",
        "related_templates": [{
          "name": "2",
          "related_templates": [{
            "name": "3"
            // "related_templates": [{
            //   "name": "4"
            // }]
          }]
        }]
      };
      let uuid = await createSuccessTest(data);

      let response = await request(app)
        .get(`/template/${uuid}/draft`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);
      data = response.body;

      let timestamp_between_create_and_update = new Date();

      // Update 3. 1 and 2 dates should be 3, but 4s should be older
      let data3 = data.related_templates[0].related_templates[0];
      data3.description = "added a description";

      // maybe another time: test that updating a parent doesn't update a child
      //let data4_updated_at = data3.related_templates[0].updated_at;

      response = await request(app)
        .put(`/template/${data3.uuid}`)
        .send(data3)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);

      let timestamp_after_update = new Date();

      response = await request(app)
        .get(`/template/${uuid}/last_update`);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(timestamp_between_create_and_update.getTime());
      expect((new Date(response.body)).getTime()).toBeLessThan(timestamp_after_update.getTime());

      response = await request(app)
        .get(`/template/${data3.uuid}/last_update`);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(timestamp_between_create_and_update.getTime());
      expect((new Date(response.body)).getTime()).toBeLessThan(timestamp_after_update.getTime());
      
      // response = await request(app)
      //   .get(`/template/${data3.related_templates[0].uuid}/last_update`);
      // expect(response.statusCode).toBe(200);
      // expect((new Date(response.body)).getTime()).toBeGreaterThan(timestamp_before_create.getTime());
      // expect((new Date(response.body)).getTime()).toBeLessThan(timestamp_between_create_and_update.getTime());

    });

    test("grandchild updated, but child deleted. Updated time should still be grandchild updated", async () => {
      let data = {
        "name": "1",
        "related_templates": [{
          "name": "2",
          "related_templates": [{
            "name": "3"
          }]
        }]
      };
      let uuid = await createSuccessTest(data);

      // create
      let response = await request(app)
        .get(`/template/${uuid}/draft`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);
      data = response.body;

      let data2 = data.related_templates[0];
      let data3 = data2.related_templates[0];

      // publish
      response = await request(app)
        .post(`/template/${uuid}/publish`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);

      // Update grandchild
      data3.description = "added a description";

      response = await request(app)
        .put(`/template/${data3.uuid}`)
        .send(data3)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);

      response = await request(app)
        .get(`/template/${data3.uuid}/draft`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);
      let update_3_timestamp = response.body.updated_at;

      // Now get the update timestamp for the grandparent. It should be that of the grandchild.
      response = await request(app)
        .get(`/template/${uuid}/last_update`);
      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual(update_3_timestamp);
      
    });
  });

  describe("failure", () => {
    test("invalid uuid", async () => {
      let response = await request(app)
        .get(`/template/18/last_update`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(400);

      response = await request(app)
        .get(`/template/${ValidUUID}/last_update`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(404);
    })
  });
})
