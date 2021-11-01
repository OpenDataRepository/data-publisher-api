const request = require("supertest");
const MongoDB = require('../lib/mongoDB');
var { PERMISSION_ADMIN, PERMISSION_EDIT, PERMISSION_VIEW } = require('../models/permission_group');
var { app, init: appInit } = require('../app');
var HelperClass = require('./common_test_operations');
const { draftDelete } = require("../models/template_field");
var Helper = new HelperClass(app);

beforeAll(async () => {
  await appInit();
});

beforeEach(async() => {
  await Helper.clearDatabase();
});

afterAll(async () => {
  await Helper.clearDatabase();
  await MongoDB.close();
});

const templateDelete = async (uuid, curr_user) => {
  return await request(app)
    .delete(`/template/${uuid}/draft`)
    .set('Cookie', [`user=${curr_user}`]);
}

const templateLatestPublishedBeforeDate = async (uuid, timestamp, curr_user) => {
  return await request(app)
    .get(`/template/${uuid}/${timestamp}`)
    .set('Cookie', [`user=${curr_user}`]);
}

const templateDuplicate = async (uuid, curr_user) => {
  return await request(app)
    .post(`/template/${uuid}/duplicate`)
    .set('Cookie', [`user=${curr_user}`]);
}

describe("create (and get draft after a create)", () => {

  describe("Success cases", () => {
    test("Simple create - no fields and no related templates", async () => {

      let template = {
        "name":"create template",
        "description":"a template to test a create",
        "fields":[],
        "related_templates":[]
      };
      let uuid = await Helper.templateCreateAndTest(template, Helper.DEF_CURR_USER);

      await Helper.testPermissionGroupsInitializedFor(uuid, Helper.DEF_CURR_USER);

    });
  
    test("Create template with related template and field", async () => {
  
      let related_template_data = { 
        "name": "create template child",
        "description": "the child of create template"
      };
      let field_data = {
        "name": "create template field"
      }
      let template = { 
        "name": "create template",
        "description": "a template to test a create",
        "fields": [field_data],
        "related_templates": [related_template_data]
      };
      let uuid = await Helper.templateCreateAndTest(template, Helper.DEF_CURR_USER);

      let response = await Helper.templateDraftGet(uuid, Helper.DEF_CURR_USER);
         
      let related_template_uuid = response.body.related_templates[0].uuid;
      let field_uuid = response.body.fields[0].uuid;

      // Now test that the related template was also created separately 
      response = await Helper.templateDraftGet(related_template_uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject(related_template_data);

      // Now test that the field was also created separately  
      response = await Helper.templateFieldDraftGet(field_uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject(field_data);

      // Now test that all permission groups were created successfully
      await Helper.testPermissionGroupsInitializedFor(uuid, Helper.DEF_CURR_USER);
      await Helper.testPermissionGroupsInitializedFor(related_template_uuid, Helper.DEF_CURR_USER);
      await Helper.testPermissionGroupsInitializedFor(field_uuid, Helper.DEF_CURR_USER);
    });
  
    test("Create template with related templates going 6 nodes deep", async () => {
  
      let template = { 
        "name": "t1",
        "fields": [
          { 
            "name": "f1"
          }
        ],
        "related_templates": [
          { 
            "name": "t2",
            "fields": [
              { 
                "name": "f2"
              }
            ],
            "related_templates": [
              { 
                "name": "t3",
                "fields": [
                  { 
                    "name": "f3"
                  }
                ],
                "related_templates": [
                  { 
                    "name": "t4",
                    "fields": [
                      { 
                        "name": "f4"
                      }
                    ],
                    "related_templates": [
                      { 
                        "name": "t5",
                        "fields": [
                          { 
                            "name": "f5"
                          }
                        ],
                        "related_templates": [
                          { 
                            "name": "t6",
                            "fields": [
                              { 
                                "name": "f6"
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
      await Helper.templateCreateAndTest(template, Helper.DEF_CURR_USER);
    });

    test("Include a field and related_template user doesn't have edit permissions to", async () => {
      let other_user = 'other';

      let field = {
        "name": "t1f1",
        public_date: (new Date()).toISOString()
      }
      let related_template = { 
        name: "t2",
        public_date: (new Date()).toISOString()
      };
      
      let field_published = await Helper.templateFieldCreatePublishTest(field, other_user);
      let related_template_published = await Helper.templateCreatePublishTest(related_template, other_user);

      let template = { 
        "name": "t1",
        "fields": [field_published],
        "related_templates": [related_template_published]
      };
      await Helper.templateCreateAndTest(template, Helper.DEF_CURR_USER);         

    });

    test("If user doesn't have view edit or view permissions to linked fields and related_templates, can still link them but won't see them", async () => {
      let other_user = 'other';

      let field = {
        "name": "t1f1"
      }
      let related_template = { 
        name: "t2.1"
      };
      
      let field_published = await Helper.templateFieldCreatePublishTest(field, other_user);
      let related_template_published = await Helper.templateCreatePublishTest(related_template, other_user);

      let template1 = { 
        "name": "t1",
        "fields": [field_published]
      };
      let response = await Helper.templateCreate(template1, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let uuid = response.body.inserted_uuid;
      expect(uuid).toBeTruthy();
      response = await Helper.templateDraftGet(uuid, Helper.DEF_CURR_USER)
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject({uuid});

      let template2 = { 
        "name": "t2",
        "related_templates": [related_template_published]
      };
      response = await Helper.templateCreate(template2, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      uuid = response.body.inserted_uuid;
      expect(uuid).toBeTruthy();
      response = await Helper.templateDraftGet(uuid, Helper.DEF_CURR_USER)
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject({uuid});

    });

    test("User can link link a template they don't have any permissions to as long as it exists", async () => {
      let field = {
        "name": "t1f1",
        public_date: (new Date()).toISOString()
      }
      let related_template = { 
        name: "t2.1",
        public_date: (new Date()).toISOString()
      };
      
      let field_uuid = await Helper.templateFieldCreateAndTest(field, Helper.USER_2);
      let related_template_uuid = await Helper.templateCreateAndTest(related_template, Helper.USER_2);

      let template1 = { 
        "name": "t1",
        "fields": [{uuid: field_uuid}]
      };
      await Helper.templateCreateAndTest(template1, Helper.DEF_CURR_USER);    

      let template2 = { 
        "name": "t2",
        "related_templates": [{uuid: related_template_uuid}]
      };
      await Helper.templateCreateAndTest(template2, Helper.DEF_CURR_USER);     
    
    });

  })

  describe("Failure cases", () => {

    const failureTest = async (data, curr_user, responseCode) => {
      let response = await Helper.templateCreate(data, curr_user);
      expect(response.statusCode).toBe(responseCode);
    };

    test("Input must be an object", async () => {
      let data = [];
      await failureTest(data, Helper.DEF_CURR_USER, 400);
    })

    test("Name and description must be strings", async () => {
      let invalidName = {
        name: 5
      };
      let invalidDescription = {
        description: 5
      };
      await failureTest(invalidName, Helper.DEF_CURR_USER, 400);
      await failureTest(invalidDescription, Helper.DEF_CURR_USER, 400);
    })

    test("Fields and related_templates must be arrays", async () => {
      let invalidFields = {
        fields: ""
      };
      let invalidRelatedTemplates = {
        related_templates: {}
      };
      await failureTest(invalidFields, Helper.DEF_CURR_USER, 400);
      await failureTest(invalidRelatedTemplates, Helper.DEF_CURR_USER, 400);
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
      await failureTest(invalidFields, Helper.DEF_CURR_USER, 400);
      await failureTest(invalidRelatedTemplates, Helper.DEF_CURR_USER, 400);
    })

  })
  
});

describe("update (and get draft after an update)", () => {

  let uuid;

  beforeEach(async() => {
    let template = { 
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
    uuid = await Helper.templateCreateAndTest(template, Helper.DEF_CURR_USER);
  });

  describe("Success cases", () => {

    test("Basic update - change name and delete everything else", async () => {

      let template = { 
        "uuid": uuid,
        "name": "create template"
      };

      let response = await Helper.templateUpdate(uuid, template, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
    
      response = await Helper.templateDraftGet(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject(template);

    });

    test("Add a new field and related template", async () => {

      let template = { 
        "uuid": uuid,
        "fields": [{
          "name": 'field name'
        }],
        "related_templates": [{
          "name": "related_template name"
        }]
      };

      let response = await Helper.templateUpdate(uuid, template, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
    
      response = await Helper.templateDraftGet(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject(template);

    });

    test("Add an existing field and related template", async () => {

      let related_template = {
        "name": "related_template name"
      };
      let related_template_uuid = await Helper.templateCreateAndTest(related_template, Helper.DEF_CURR_USER);
      related_template.uuid = related_template_uuid;
      related_template.description = "a description";

      // Get the existing field so we can include that in our update
      let response = await Helper.templateDraftGet(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let field = response.body.fields[0];
      delete field.updated_at;
      field.name = "new name";

      let template = { 
        "uuid": uuid,
        "related_templates": [related_template],
        "fields": [field]
      };

      response = await Helper.templateUpdate(uuid, template, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
    
      response = await Helper.templateDraftGet(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject(template);

    });
  
  })

  describe("Failure cases", () => {

    test("uuid in request and in object must match", async () => {

      let template = { 
        "name": "create template"
      };

      let response = await Helper.templateUpdate(uuid, template, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

    })

    test("uuid must exist", async () => {

      let template = { 
        "uuid": Helper.VALID_UUID,
        "name": "create template"
      };

      let response = await Helper.templateUpdate(Helper.VALID_UUID, template, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(404);

    })

    test("Must have edit permissions to update", async () => {

      let template = { 
        "uuid": uuid,
        "name": "create template"
      };
      
      let other_user = 'other';

      let response = await Helper.templateUpdate(uuid, template, other_user);
      expect(response.statusCode).toBe(401);

    });

  })
  
});

describe("get draft", () => {
  test("must have edit permission", async () => {
    let template = {
      name: "t"
    }
    let uuid = await Helper.templateCreateAndTest(template, Helper.DEF_CURR_USER);
    let response = await Helper.templateDraftGet(uuid, Helper.USER_2);
    expect(response.statusCode).toBe(401);
  });

  test("if user has view but not edit access to linked properties, the pubished version replaces that property", async () => {
    let other_user = 'other';

    let field = {
      "name": "t1f1"
    }
    let related_template = { 
      name: "t2"
    };
    
    let field_published = await Helper.templateFieldCreatePublishTest(field, other_user);
    let related_template_published = await Helper.templateCreatePublishTest(related_template, other_user);

    let view_users = [other_user, Helper.DEF_CURR_USER];

    let response = await Helper.updatePermissionGroup(other_user, field_published.uuid, PERMISSION_VIEW, view_users);
    expect(response.statusCode).toBe(200);

    response = await Helper.updatePermissionGroup(other_user, related_template_published.uuid, PERMISSION_VIEW, view_users);
    expect(response.statusCode).toBe(200);

    let template = { 
      "name": "t1",
      "fields": [field_published],
      "related_templates": [related_template_published]
    };
    let template_published = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);  

    // Fetch parent template, check that the two linked properties are fetched as the published versions
    response = await Helper.templateDraftGet(template_published.uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
    let template_draft = response.body;
    expect(template_draft).toMatchObject(template);    

  });

  test("if user has neither view nor edit access to linked properties, an empty object replaces that property", async () => {
    let field = {
      "name": "t1f1"
    }
    let related_template = { 
      name: "t2"
    };
    
    let other_user = 'other';
    let template = { 
      "name": "t1",
      "fields": [field],
      "related_templates": [related_template]
    };
    let template_published = await Helper.templateCreatePublishTest(template, other_user);  
    
    let edit_users = [other_user, Helper.DEF_CURR_USER];
    let response = await Helper.updatePermissionGroup(other_user, template_published.uuid, PERMISSION_EDIT, edit_users);
    expect(response.statusCode).toBe(200);

    response = await Helper.templateDraftGet(template_published.uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
    let expected_template_draft = response.body;
    expected_template_draft.fields[0] = {uuid: template_published.fields[0].uuid};
    expected_template_draft.related_templates[0] = {uuid: template_published.related_templates[0].uuid};
    
    // Fetch parent template, check that the two linked properties are fetched as blank 
    // since the default user doesn't have view permissions
    response = await Helper.templateDraftGet(template_published.uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject(expected_template_draft);    
  });
});

describe("publish (and get published and draft after a publish)", () => {

  describe("Success cases", () => {

    test("Simple publish - no fields and no related templates", async () => {

      let template = {
        "name":"basic template",
        "description":"a template to test a publish",
        "fields":[],
        "related_templates":[]
      };
      let published = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      // Check that we can still get a draft version
      let response = await Helper.templateDraftGet(published.uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject(template);
    });

    test("Complex publish - with nested fields and related templates to publish", async () => {

      let related_template = {
        "name": "t2",
        "fields": [{
          "name": "t2f1"
        }]
      };
      let field = {
        "name": "t1f1"
      };
      let template = {
        "name":"basic template",
        "description":"a template to test a publish",
        "fields":[field],
        "related_templates":[related_template]
      };

      let published = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let related_template_uuid = published.related_templates[0].uuid;
      let field_uuid = published.fields[0].uuid;

      // Check that the related template was also published
      response = await Helper.templateLatestPublished(related_template_uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject(related_template);

      // Check that the field was also published
      response = await Helper.templateFieldLatestPublished(field_uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject(field);
    });

    test("Complex publish - changes in a nested property result in publishing for all parent properties", async () => {

      let template = {
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
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      // Make a change in the third level of data
      template.related_templates[0].related_templates[0].description = "3 has a new description";

      // Update with change
      let response = await Helper.templateUpdate(template.uuid, template, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);

      // Record the date before we publish a second time
      let intermediate_publish_date = (new Date()).getTime();

      template = await Helper.templatePublishAndFetch(template.uuid, Helper.DEF_CURR_USER);

      // On the third node and above, the publish date should be newer than the intermediate_publish_date. 
      // The fourth should be older
      
      expect(new Date(template.publish_date).getTime()).toBeGreaterThan(intermediate_publish_date);
      expect(new Date(template.related_templates[0].publish_date).getTime()).toBeGreaterThan(intermediate_publish_date);
      expect(new Date(template.related_templates[0].related_templates[0].publish_date).getTime()).toBeGreaterThan(intermediate_publish_date);
      expect(new Date(template.related_templates[0].related_templates[0].related_templates[0].publish_date).getTime()).toBeLessThan(intermediate_publish_date);

    });

    test("Complex publish - publish parent who's child changed previously and no other changes are present", async () => {

      let template = {
        "name":"1",
        "related_templates":[{
          "name": "2"
        }]
      };
      // Create initial data
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);
      let uuid = template.uuid;

      // Make a change in the third level of data
      template.related_templates[0].description = "2 has a new description";
      let uuid2 = template.related_templates[0].uuid;

      // Update second template
      let response = await Helper.templateUpdate(uuid2, template.related_templates[0], Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);

      // Record the date before we publish the change to the second template
      let publish_date_2 = (new Date()).getTime();

      await Helper.templatePublishAndFetch(uuid2, Helper.DEF_CURR_USER);
      
      // Now we want to get a draft of the parent and publish that draft as it is. It should be successful since the child changed.
      
      response = await Helper.templateDraftGet(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      template = response.body;
      
      // Update with change
      response = await Helper.templateUpdate(uuid, template, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);

      // Record the date before we publish the parent template again
      let publish_date_3 = (new Date()).getTime();

      template = await Helper.templatePublishAndFetch(uuid, Helper.DEF_CURR_USER);

      expect(new Date(template.publish_date).getTime()).toBeGreaterThan(publish_date_3);
      expect(new Date(template.related_templates[0].publish_date).getTime()).toBeGreaterThan(publish_date_2);
      expect(new Date(template.related_templates[0].publish_date).getTime()).toBeLessThan(publish_date_3);
    });

    test("Include a field and related_template user doesn't have edit permissions to, but are public", async () => {
      let other_user = 'other';

      let field = {
        "name": "t1f1",
        public_date: (new Date()).toISOString()
      }
      let related_template = { 
        name: "t2",
        public_date: (new Date()).toISOString()
      };
      
      let field_published = await Helper.templateFieldCreatePublishTest(field, other_user);
      let related_template_published = await Helper.templateCreatePublishTest(related_template, other_user);

      let template = { 
        "name": "t1",
        "fields": [field_published],
        "related_templates": [related_template_published]
      };
      await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);         

    });

    test("Include a field and related_template user doesn't have edit permissions to, but does have view permissions to", async () => {
      let other_user = 'other';

      let field = {
        "name": "t1f1"
      }
      let related_template = { 
        name: "t2"
      };
      
      let field_published = await Helper.templateFieldCreatePublishTest(field, other_user);
      let related_template_published = await Helper.templateCreatePublishTest(related_template, other_user);

      let view_users = [other_user, Helper.DEF_CURR_USER];

      let response = await Helper.updatePermissionGroup(other_user, field_published.uuid, PERMISSION_VIEW, view_users);
      expect(response.statusCode).toBe(200);

      response = await Helper.updatePermissionGroup(other_user, related_template_published.uuid, PERMISSION_VIEW, view_users);
      expect(response.statusCode).toBe(200);

      let template = { 
        "name": "t1",
        "fields": [field_published],
        "related_templates": [related_template_published]
      };
      await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);         

    });

    test("Include a field and related_template user doesn't have any permissions to, user can still create and publish link to it", async () => {
      let other_user = 'other';

      let field = {
        name: "t1f1"
      }
      let related_template = { 
        name: "t2"
      };
      
      let field_published = await Helper.templateFieldCreatePublishTest(field, other_user);
      let related_template_published = await Helper.templateCreatePublishTest(related_template, other_user);

      let template = { 
        "name": "t1",
        "fields": [{uuid: field_published.uuid}],
        "related_templates": [{uuid: related_template_published.uuid}]
      };
      
      // Now pubish and test this published template manually
      await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER); 

    });

    test("User can publish parent template if they have edit access, even if they don't have any access to sub-properties", async () => {

      let related_template = {
        "name": "t2"
      };
      let field = {
        "name": "t1f1"
      };
      let template = {
        "name":"basic template",
        "description":"a template to test a publish",
        "fields":[field],
        "related_templates":[related_template]
      };
      // Publish first time with user 1
      let first_published = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);
      let parent_uuid = first_published.uuid;

      // Update with user 1
      let response = await Helper.templateDraftGet(parent_uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let draft = response.body;
      draft.description = "d";
      draft.related_templates[0].description = "d";
      draft.fields[0].description = "d";
      response = await Helper.templateUpdate(draft.uuid, draft, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);

      // Give user 2 edit and view permissions to parent template
      let other_user = 'other';
      let view_users = [Helper.DEF_CURR_USER, other_user];
      response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, parent_uuid, PERMISSION_VIEW, view_users);
      expect(response.statusCode).toBe(200);
      response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, parent_uuid, PERMISSION_EDIT, view_users);
      expect(response.statusCode).toBe(200);

      // Now let user 2 publish the parent template
      await Helper.templatePublishAndFetch(parent_uuid, other_user);

      // Now verify that user 2 published the parent but not the children.

      let related_template_published = first_published.related_templates[0];
      let field_published = first_published.fields[0];

      // Check that the related template was not published
      response = await Helper.templateLatestPublished(related_template_published.uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject(related_template_published);

      // Check that the field was not published
      response = await Helper.templateFieldLatestPublished(field_published.uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject(field_published);

      // Check that the parent was published
      response = await Helper.templateLatestPublished(parent_uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toMatchObject(first_published);
      // Also check that it is still pointing to the original published field and related_template
      expect(response.body.fields[0]._id).toBe(field_published._id);
      expect(response.body.related_templates[0]._id).toBe(related_template_published._id);

    });

  })

  describe("Failure cases", () => {
    
    test("Template with uuid must exist", async () => {

      let template = {
        "name":"basic template"
      };
      let uuid = await Helper.templateCreateAndTest(template, Helper.DEF_CURR_USER);

      let response = await Helper.templateLastUpdate(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let last_update = response.body;

      response = await Helper.templatePublish(Helper.VALID_UUID, last_update, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(404);

    });

    test("There must be changes to publish", async () => {
      let template = {
        "name":"basic template"
      };
      let uuid = await Helper.templateCreateAndTest(template, Helper.DEF_CURR_USER);

      let response = await Helper.templateLastUpdate(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let last_update = response.body;

      response = await Helper.templatePublish(uuid, last_update, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);

      response = await Helper.templatePublish(uuid, last_update, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);
    });

    test("Internal refrences must be valid", async () => {
      let template = {
        "name":"temp1",
        "related_templates": [{
          "name": "temp2"
        }]
      };

      let uuid = await Helper.templateCreateAndTest(template, Helper.DEF_CURR_USER);

      let response = await Helper.templateDraftGet(uuid, Helper.DEF_CURR_USER)
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject(template);

      // Delete the internal draft
      response = await templateDelete(response.body.related_templates[0].uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);

      response = await Helper.templateLastUpdate(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let last_update = response.body;

      // Expect publish of parent draft to fail because of invalid reference 
      response = await Helper.templatePublish(uuid, last_update, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

      // Fetch parent draft again, thus purging reference to internal draft
      response = await Helper.templateDraftGet(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);

      response = await Helper.templateLastUpdate(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      last_update = response.body;

      // Expect publish of parent draft to succeed because invalid reference has been removed
      response = await Helper.templatePublish(uuid, last_update, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
    });

    test("Last update provided must match to actual last update in the database", async () => {
      let template = {
        "name":"basic template",
        "description":"a template to test a publish"
      };
      let uuid = await Helper.templateCreateAndTest(template, Helper.DEF_CURR_USER);

      let response =  await Helper.templatePublish(uuid, (new Date()).toISOString(), Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);
    });

    test("Last update provided must match to actual last update in the database, also if sub-property is updated later", async () => {
     
      let related_template = {"name": "2"};
     
      let template = {
        "name":"1",
        "related_templates": [related_template]
      };
      let uuid = await Helper.templateCreateAndTest(template, Helper.DEF_CURR_USER);

      let response = await Helper.templateDraftGet(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let old_update = response.body.updated_at;

      related_template = response.body.related_templates[0];
      related_template.description = "new description";

      response = await Helper.templateUpdate(related_template.uuid, related_template, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);

      response = await Helper.templatePublish(uuid, old_update, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);
    });

    test("User must have edit permission to publish", async () => {

      let template = {
        "name":"basic template"
      };
      let uuid = await Helper.templateCreateAndTest(template, Helper.DEF_CURR_USER);

      // A different user shouldn't be able to publish
      let response = await Helper.templateLastUpdate(uuid, Helper.DEF_CURR_USER);
      let last_update = response.body;
      response = await Helper.templatePublish(uuid, last_update, Helper.USER_2);
      expect(response.statusCode).toBe(401);

      // Even if that user has view permissions, they still shouldn't be able to publish
      response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, uuid, PERMISSION_VIEW, [Helper.DEF_CURR_USER, Helper.USER_2]);
      expect(response.statusCode).toBe(200);

      response = await Helper.templatePublish(uuid, last_update, Helper.USER_2);
      expect(response.statusCode).toBe(401);
    });

  })


  // test("Updating dependent templates", async () => {

  //   let related_template_data = {
  //     "name": "a child template",
  //     "fields": [{
  //       "name": "a child field"
  //     }]
  //   };
  //   let data = {
  //     "name":"basic template",
  //     "description":"",
  //     "related_templates":[related_template_data]
  //   };
  //   let uuid = await createSuccessTest(data);

  //   let response = await request(app)
  //     .get(`/template/${uuid}/last_update`);
  //   expect(response.statusCode).toBe(200);
  //   let last_update = response.body;

  //   response = await request(app)
  //     .post(`/template/${uuid}/publish`)
  //     .send({last_update})
  //     .set('Accept', 'application/json');
  //   expect(response.statusCode).toBe(200);
  
  //   // Check that a published version now exists
  //   response = await request(app)
  //     .get(`/template/${uuid}/latest_published`)
  //     .set('Accept', 'application/json');
  //   expect(response.statusCode).toBe(200);
  //   expect(response.body).toMatchObject(data);

  //   // Check that the related template was also published
  //   related_template_data = response.body.related_templates[0];
  //   let related_template_uuid = related_template_data.uuid;
  //   response = await request(app)
  //     .get(`/template/${related_template_uuid}/latest_published`)
  //     .set('Accept', 'application/json');
  //   expect(response.statusCode).toBe(200);
  //   expect(response.body).toMatchObject(related_template_data);

  //   // Now update and publish the sub-template
  //   related_template_data.description = "new descripiton";

  //   response = await request(app)
  //     .put(`/template/${related_template_uuid}`)
  //     .send(related_template_data)
  //     .set('Accept', 'application/json');
  //   expect(response.statusCode).toBe(200);

  //   response = await request(app)
  //     .get(`/template/${uuid}/last_update`);
  //   expect(response.statusCode).toBe(200);
  //   last_update = response.body;

  //   response = await request(app)
  //     .post(`/template/${related_template_uuid}/publish`)
  //     .send({last_update})
  //     .set('Accept', 'application/json');
  //   expect(response.statusCode).toBe(200);

  //   // Now the important part. Test that publish also created a draft of the parent template
  //   response = await request(app)
  //     .get(`/template/${uuid}/draft_existing`)
  //     .set('Accept', 'application/json');
  //   expect(response.statusCode).toBe(200);
  //   expect(response.body).toBe(true);

  // });


});

describe("get published", () => {
  test("if user does not have view access to linked properties, an empty object replaces that property", async () => {
    let field = {
      "name": "t1f1"
    }
    let related_template = { 
      name: "t2"
    };
    
    let other_user = 'other';
    let template = { 
      "name": "t1",
      "fields": [field],
      "related_templates": [related_template]
    };
    let template_published = await Helper.templateCreatePublishTest(template, other_user);  
    
    let view_users = [other_user, Helper.DEF_CURR_USER];
    let response = await Helper.updatePermissionGroup(other_user, template_published.uuid, PERMISSION_VIEW, view_users);
    expect(response.statusCode).toBe(200);

    template_published.fields[0] = {uuid: template_published.fields[0].uuid};
    template_published.related_templates[0] = {uuid: template_published.related_templates[0].uuid};
    // Fetch parent template, check that the two linked properties are fetched as blank 
    // since the default user doesn't have view permissions
    response = await Helper.templateLatestPublished(template_published.uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject(template_published);   
  });

  test("must have view permissions", async () => {
    let other_user = 'other';
    let template = { 
      "name": "t1"
    };
    let template_published = await Helper.templateCreatePublishTest(template, other_user);  

    let response = await Helper.templateLatestPublished(template_published.uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(401);
  });
});

test("get published for a certain date", async () => {
  let template = {
    "name":"basic template",
    "description": "1"
  };
  let uuid = await Helper.templateCreateAndTest(template, Helper.DEF_CURR_USER);

  let beforeFirstPublish = new Date();

  // Test that if only a draft exists, it is not fetched
  let response = await templateLatestPublishedBeforeDate(uuid, beforeFirstPublish.toISOString(), Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(404);

  await Helper.templatePublishAndFetch(uuid, Helper.DEF_CURR_USER);

  let afterFirstPublish = new Date();

  template.uuid = uuid;
  template.description = "2";

  response = await Helper.templateUpdate(uuid, template, Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(200);
  await Helper.templatePublishAndFetch(uuid, Helper.DEF_CURR_USER);

  let afterSecondPublish = new Date();

  template.description = "3";

  response = await Helper.templateUpdate(uuid, template, Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(200);
  await Helper.templatePublishAndFetch(uuid, Helper.DEF_CURR_USER);

  // Now there should be three published versions. Search for each based on the date

  response = await Helper.templateLatestPublished(uuid, Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(200);
  expect(response.body.description).toEqual(expect.stringMatching("3"));

  response = await templateLatestPublishedBeforeDate(uuid, (new Date()).toISOString(), Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(200);
  expect(response.body.description).toEqual(expect.stringMatching("3"));

  response = await templateLatestPublishedBeforeDate(uuid, afterSecondPublish.toISOString(), Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(200);
  expect(response.body.description).toEqual(expect.stringMatching("2"));

  response = await templateLatestPublishedBeforeDate(uuid, afterFirstPublish.toISOString(), Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(200);
  expect(response.body.description).toEqual(expect.stringMatching("1"));

  response = await templateLatestPublishedBeforeDate(uuid, beforeFirstPublish.toISOString(), Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(404);
});

describe("delete", () => {
  test("delete a draft, not a published version", async () => {
    let template = {
      "name":"basic template",
      "description": "description"
    };
    template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);
  
    template.description = "different";
  
    // Change the draft, but don't publish the change
    response = await Helper.templateUpdate(template.uuid, template, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
  
    // Verify that the draft is what we changed it to
    response = await Helper.templateDraftGet(template.uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
  
    // Delete the draft
    response = await templateDelete(template.uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
  
    // Get the draft again. Make sure it matches the latest published version
    response = await Helper.templateDraftGet(template.uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
  
    template.description = "description";
    delete template._id;
    delete template.publish_date;
    expect(response.body).toMatchObject(template);
  
  });

  test("need edit permissions", async () => {
    let template = {
      "name":"basic template"
    };
    let uuid = await Helper.templateCreateAndTest(template, Helper.DEF_CURR_USER);

    let other_user = 'other';
    let response = await templateDelete(uuid, other_user);
    expect(response.statusCode).toBe(401);
  })
});

describe("templateLastUpdate", () => {

  describe("success", () => {
    test("basic draft, no fields or related templates", async () => {
      let timestamp = new Date();
      let template = {
        "name":"1"
      };
      let uuid = await Helper.templateCreateAndTest(template, Helper.DEF_CURR_USER);

      let response = await Helper.templateLastUpdate(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(timestamp.getTime());
    });

    test("basic published, no fields or related templates. available to anyone with view or edit permissions", async () => {
      let timestamp = new Date();
      let template = {
        "name":"1"
      };
      let published = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let response = await Helper.templateLastUpdate(published.uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(timestamp.getTime());

      let other_user = 'other';
      let view_users = [other_user, Helper.DEF_CURR_USER];
      response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, published.uuid, PERMISSION_VIEW, view_users);
      expect(response.statusCode).toBe(200);

      response = await Helper.templateLastUpdate(published.uuid, other_user);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(timestamp.getTime());
    });

    test("sub template updated later than parent template", async () => {
      // let timestamp_before_create = new Date();
      let template = {
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
      let uuid = await Helper.templateCreateAndTest(template, Helper.DEF_CURR_USER);

      let response = await Helper.templateDraftGet(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      template = response.body;

      let timestamp_between_create_and_update = new Date();

      // Update 3. 1 and 2 dates should be 3, but 4s should be older
      let template3 = template.related_templates[0].related_templates[0];
      template3.description = "added a description";

      // maybe another time: test that updating a parent doesn't update a child
      //let data4_updated_at = data3.related_templates[0].updated_at;

      response = await Helper.templateUpdate(template3.uuid, template3, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);

      let timestamp_after_update = new Date();

      response = await Helper.templateLastUpdate(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(timestamp_between_create_and_update.getTime());
      expect((new Date(response.body)).getTime()).toBeLessThan(timestamp_after_update.getTime());

      response = await Helper.templateLastUpdate(template3.uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(timestamp_between_create_and_update.getTime());
      expect((new Date(response.body)).getTime()).toBeLessThan(timestamp_after_update.getTime());
      
      // response = await request(app)
      //   .get(`/template/${data3.related_templates[0].uuid}/last_update`);
      // expect(response.statusCode).toBe(200);
      // expect((new Date(response.body)).getTime()).toBeGreaterThan(timestamp_before_create.getTime());
      // expect((new Date(response.body)).getTime()).toBeLessThan(timestamp_between_create_and_update.getTime());

    });

    test("sub template updated and published later than parent template", async () => {

      let template = {
        "name": "1",
        "related_templates": [{
          "name": "2"
        }]
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let related_template = template.related_templates[0];
      related_template.description = "des";

      let response = await Helper.templateUpdate(related_template.uuid, related_template, Helper.DEF_CURR_USER);
      expect(response.statusCode).toEqual(200);

      let time1 = new Date();
      await Helper.templatePublishAndFetch(related_template.uuid, Helper.DEF_CURR_USER);
      let time2 = new Date();

      response = await Helper.templateLastUpdate(template.uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(time1.getTime());
      expect((new Date(response.body)).getTime()).toBeLessThan(time2.getTime());
    });

    test("grandchild updated, but child deleted. Updated time should still be grandchild updated", async () => {
      let template = {
        "name": "1",
        "related_templates": [{
          "name": "2",
          "related_templates": [{
            "name": "3"
          }]
        }]
      };
      let uuid = await Helper.templateCreateAndTest(template, Helper.DEF_CURR_USER);

      // create
      let response = await Helper.templateDraftGet(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      template = response.body;

      let template2 = template.related_templates[0];
      let template3 = template2.related_templates[0];

      // publish
      await Helper.templatePublishAndFetch(uuid, Helper.DEF_CURR_USER);

      // Update grandchild
      template3.description = "added a description";

      response = await Helper.templateUpdate(template3.uuid, template3, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);

      response = await Helper.templateDraftGet(template3.uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let update_3_timestamp = response.body.updated_at;

      // Now get the update timestamp for the grandparent. It should be that of the grandchild.
      response = await Helper.templateLastUpdate(uuid, Helper.DEF_CURR_USER);
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
        .get(`/template/${Helper.VALID_UUID}/last_update`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(404);
    });

    test("must have edit permissions to get last update of draft", async () => {
      let template = {
        "name":"1"
      };
      let uuid = await Helper.templateCreateAndTest(template, Helper.DEF_CURR_USER);

      let other_user = 'other';
      let response = await Helper.templateLastUpdate(uuid, other_user);
      expect(response.statusCode).toBe(401);
    });

    test("must have edit or view permissions to get last update of published", async () => {
      let template = {
        "name":"1"
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let other_user = 'other';
      let response = await Helper.templateLastUpdate(template.uuid, other_user);
      expect(response.statusCode).toBe(401);
    });
  });
})

describe("duplicate", () => {
  describe("success", () => {
    test("basic template", async () => {
      let template = {
        name: "t1"
      };
      let template_published = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);
      let response = await templateDuplicate(template_published.uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toEqual(200);
      let new_uuid = response.body.new_uuid;
      response = await Helper.templateDraftGet(new_uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toEqual(200);
      let draft = response.body;
      expect(draft).toMatchObject(template);
      expect(draft.duplicated_from).toEqual(template_published.uuid);
    });
    test("basic template duplicated by a user with view permissions to the original", async () => {
      let template = {
        name: "t1",
        public_date: (new Date()).toISOString()
      };
      let template_published = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);
      let other_user = 'other';
      let response = await templateDuplicate(template_published.uuid, other_user);
      expect(response.statusCode).toEqual(200);
      let new_uuid = response.body.new_uuid;
      response = await Helper.templateDraftGet(new_uuid, other_user);
      expect(response.statusCode).toEqual(200);
      let draft = response.body;
      delete template.public_date;
      expect(draft).toMatchObject(template);
      expect(draft.duplicated_from).toEqual(template_published.uuid);
    });
    test("template with field and related_template", async () => {
      let template = {
        name: "t1",
        fields: [{name: "t1f1"}],
        related_templates: [{name: "t1.1"}]
      };
      let template_published = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);
      let response = await templateDuplicate(template_published.uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toEqual(200);
      let new_uuid = response.body.new_uuid;
      response = await Helper.templateDraftGet(new_uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toEqual(200);
      let draft = response.body;
      expect(draft).toMatchObject(template);
      expect(draft.duplicated_from).toEqual(template_published.uuid);
      expect(draft.fields[0].duplicated_from).toEqual(template_published.fields[0].uuid);
      expect(draft.related_templates[0].duplicated_from).toEqual(template_published.related_templates[0].uuid);
    });
    test("only have permisssion to duplicate the top template", async () => {
      let template = {
        name: "t1",
        public_date: (new Date()).toISOString(),
        fields: [{name: "t1f1"}],
        related_templates: [{name: "t1.1"}]
      };
      let template_published = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);
      let other_user = 'other';
      let response = await templateDuplicate(template_published.uuid, other_user);
      expect(response.statusCode).toEqual(200);
      let new_uuid = response.body.new_uuid;
      response = await Helper.templateDraftGet(new_uuid, other_user);
      expect(response.statusCode).toEqual(200);
      let draft = response.body;
      template = {name: "t1"};
      expect(draft).toMatchObject(template);
      expect(draft.duplicated_from).toEqual(template_published.uuid);
    });
  });
  describe("failure", () => {
    test("uuid must be of valid format", async () => {
      let invalid_uuid = "5;"
      let response = await templateDuplicate(invalid_uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toEqual(400);
    });
    test("published template must exist", async () => {
      let response = await templateDuplicate(Helper.VALID_UUID, Helper.DEF_CURR_USER);
      expect(response.statusCode).toEqual(404);
    });
    test("user must have view access to template", async () => {
      let template = {
        name: "t1"
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);
      let other_user = 'other';
      let response = await templateDuplicate(template.uuid, other_user);
      expect(response.statusCode).toEqual(401);
    });
  });
});

test("full range of operations with big data", async () => {
  let template = {
    name: "1",
    fields: [
      {name: "t1f1"},
      {name: "t1f2"},
      {name: "t1f3"}
    ],
    related_templates: [
      {
        name: "2.1",
        related_templates: [
          {
            name: "3.1",
            fields: [
              {name: "t3.1f1"},
              {name: "t3.1f2"}
            ],
            related_templates: [
              {
                name: "4.1",
                fields: [
                  {name: "t4.1f1"},
                  {name: "t4.1f2"}
                ]
              },
              {
                name: "4.2"
              }
            ]
          },
          {
            name: "3.2",
            fields: [
              {name: "t3.2f1"},
              {name: "t3.2f2"}
            ],
            related_templates: [
              {
                name: "4.3",
                fields: [
                  {name: "t4.3f1"},
                  {name: "t4.3f2"}
                ]
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

  template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

  // TODO: add more complexity here, like another template which interacts with this one, and both getting updated

});


