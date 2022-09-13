var { PermissionTypes } = require('../models/permission');
var { app, init: appInit, close: appClose } = require('../app');
var HelperClass = require('./common_test_operations');
var Helper = new HelperClass(app);

var agent1;
var agent2;

beforeAll(async () => {
  await appInit();
  agent2 = await Helper.createAgentRegisterLogin(Helper.EMAIL_2, Helper.DEF_PASSWORD);
  agent1 = await Helper.createAgentRegisterLogin(Helper.DEF_EMAIL, Helper.DEF_PASSWORD);
});

beforeEach(async() => {
  await Helper.clearDatabaseExceptForUsers();
  Helper.setAgent(agent1);
});

afterAll(async () => {
  await Helper.clearDatabase();
  await appClose();
});

describe("create (and get draft after a create)", () => {

  describe("subscribed templates", () => {

    describe("success", () => {

      test("One subscribed template of depth one", async () => {
  
        let subscribed_template = { 
          name: "t1.1"
        };
        subscribed_template = await Helper.templateCreatePersistTest(subscribed_template);
  
  
        let template = { 
          name: "t1",
          subscribed_templates: [subscribed_template]
        };
        await Helper.templateCreateAndTest(template);
  
      });
  
      test("Two subscribed templates, of depth two", async () => {
    
        let t_1_1 = { 
          name: "t1.1",
          related_templates: [{name: "t1.1.1"}]
        };
        t_1_1 = await Helper.templateCreatePersistTest(t_1_1);
  
        let t_1_2 = { 
          name: "t1.2",
          related_templates: [{name: "t1.2.1"}]
        };
        t_1_2 = await Helper.templateCreatePersistTest(t_1_2);
  
  
        let template = { 
          name: "t1",
          subscribed_templates: [t_1_1, t_1_2]
        };
        await Helper.templateCreateAndTest(template);
  
      });

      test("Subscribe to latest version, then keep that version after a update, then subscribe to latest again", async () => {
  
        let subscribed_template: any = { 
          name: "t1.1"
        };
        subscribed_template = await Helper.templateCreatePersistTest(subscribed_template);
        let first_version_id = subscribed_template._id;
  
        // Subscribe to only version existing
        let template: any = { 
          name: "t1",
          subscribed_templates: [subscribed_template]
        };
        template = await Helper.templateCreateAndTest(template);

        subscribed_template.description = "naruto";
        let new_subscribed_template = await Helper.templateUpdatePersistTest(subscribed_template);
        // Replace the _id that gets deleted during update
        subscribed_template._id = first_version_id

        // Subscribe to same template version as current draft, not forced to update
        template.description = "hokage";
        await Helper.templateUpdateAndTest(template);

        template = await Helper.templatePersistAndFetch(template.uuid);

        // Subscribe to same template version as last persisted, not forced to update        
        template.description = "sanin";
        await Helper.templateUpdateAndTest(template);

        // Subscribe to new version. Should also work
        template.subscribed_templates = [new_subscribed_template];
        await Helper.templateUpdateAndTest(template);

      });
  
    });

    describe("failure", () => {

      test("Input format must be valid", async () => {

        let template: any = { 
          name: "t1",
          subscribed_templates: ""
        };
        let response = await Helper.templateCreate(template);
        expect(response.statusCode).toBe(400);

        template.subscribed_templates = [6];
        response = await Helper.templateCreate(template);
        expect(response.statusCode).toBe(400);

      })

      test("Input format provide a valid _id for each subscribed template", async () => {

        let template: any = { 
          name: "t1",
          subscribed_templates: [{_id: 5}]
        };
        let response = await Helper.templateCreate(template);
        expect(response.statusCode).toBe(400);

        template.subscribed_templates = [{_id: "5"}];
        response = await Helper.templateCreate(template);
        expect(response.statusCode).toBe(400);

      })

      test("Can only subscribe to any give uuid once per template", async () => {
  
        let subscribed_template: any = { 
          name: "t1.1"
        };
        subscribed_template = await Helper.templateCreatePersistTest(subscribed_template);
        let first_version_id = subscribed_template._id;

        // Subscribe to the same version twice
        let template = { 
          name: "t1",
          subscribed_templates: [subscribed_template, subscribed_template]
        };
        let response = await Helper.templateCreate(template);
        expect(response.statusCode).toBe(400);

        template = { 
          name: "t1",
          subscribed_templates: [subscribed_template]
        };
        template = await Helper.templateCreateAndTest(template);        

        subscribed_template.description = "naruto";
        let new_subscribed_template = await Helper.templateUpdatePersistTest(subscribed_template);
        // Replace the _id that gets deleted during update
        subscribed_template._id = first_version_id
  
        // Subscribe to the same version twice
        template.subscribed_templates = [subscribed_template, new_subscribed_template];
        response = await Helper.templateCreate(template);
        expect(response.statusCode).toBe(400);

      });

    });

  });

  describe("Success cases", () => {
    test("Simple create - no fields and no related templates", async () => {

      let template: any = {
        "name":"create template",
        "description":"a template to test a create",
        "fields":[],
        "related_templates":[]
      };
      template = await Helper.templateCreateAndTest(template);

      await Helper.testPermissionsInitializedFor(template.uuid);

    });
  
    test("Create template with related template and field", async () => {
  
      let related_template: any = { 
        name: "create template child",
        description: "the child of create template"
      };
      let field = {
        name: "create template field"
      }
      let template: any = { 
        name: "create template",
        description: "a template to test a create",
        fields: [field],
        related_templates: [related_template]
      };
      template = await Helper.templateCreateAndTest(template);
         
      let related_template_uuid = template.related_templates[0].uuid;
      let field_uuid = template.fields[0].uuid;

      // Now test that the related template was also created separately 
      let template_draft = await Helper.templateDraftGetAndTest(related_template_uuid);
      Helper.testTemplateDraftsEqual(template.related_templates[0], template_draft);

      // Now test that the field was also created separately  
      let field_draft = await Helper.templateFieldDraftGetAndTest(field_uuid);
      Helper.testTemplateFieldsEqual(field, field_draft);

      // Now test that all permission groups were created successfully
      await Helper.testPermissionsInitializedFor(template.uuid);
      await Helper.testPermissionsInitializedFor(related_template_uuid);
      await Helper.testPermissionsInitializedFor(field_uuid);
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
      await Helper.templateCreateAndTest(template);
    });

    test("Include a field and related_template user doesn't have edit permissions to", async () => {
      let field = {
        "name": "t1f1",
        public_date: (new Date()).toISOString()
      }
      let related_template = { 
        name: "t2",
        public_date: (new Date()).toISOString()
      };

      await Helper.setAgent(agent2);
      
      let field_persisted = await Helper.templateFieldCreatePersistTest(field);
      let related_template_persisted = await Helper.templateCreatePersistTest(related_template);

      await Helper.setAgent(agent1);

      let template = { 
        "name": "t1",
        "fields": [field_persisted],
        "related_templates": [related_template_persisted]
      };
      await Helper.templateCreateAndTest(template);         

    });

    test("If user doesn't have view edit or view permissions to linked fields and related_templates, can still link them but won't see them", async () => {
      let field = {
        "name": "t1f1"
      }
      let related_template = { 
        name: "t2.1"
      };

      await Helper.setAgent(agent2);
      
      let field_persisted = await Helper.templateFieldCreatePersistTest(field);
      let related_template_persisted = await Helper.templateCreatePersistTest(related_template);

      await Helper.setAgent(agent1);

      let template1 = { 
        "name": "t1",
        "fields": [field_persisted]
      };

      let response = await Helper.templateCreate(template1);
      expect(response.statusCode).toBe(307);
      let template_draft = await Helper.testAndExtract(Helper.redirect, response.header.location);
      let uuid = template_draft.uuid;
      expect(template_draft).toMatchObject({uuid});

      let template2 = { 
        "name": "t2",
        "related_templates": [related_template_persisted]
      };

      response = await Helper.templateCreate(template2);
      expect(response.statusCode).toBe(307);
      template_draft = await Helper.testAndExtract(Helper.redirect, response.header.location);
      uuid = template_draft.uuid;
      expect(template_draft).toMatchObject({uuid});

    });

    test("User can link a template they don't have any permissions to as long as it exists", async () => {
      let field = {
        "name": "t1f1",
        public_date: (new Date()).toISOString()
      }
      let related_template: any = { 
        name: "t2.1",
        public_date: (new Date()).toISOString()
      };

      await Helper.setAgent(agent2);
      
      let field_uuid = await Helper.templateFieldCreateAndTest(field);
      related_template = await Helper.templateCreateAndTest(related_template);

      await Helper.setAgent(agent1);

      let template1 = { 
        "name": "t1",
        "fields": [{uuid: field_uuid}]
      };
      await Helper.templateCreateAndTest(template1);    

      let template2 = { 
        "name": "t2",
        "related_templates": [{uuid: related_template.uuid}]
      };
      await Helper.templateCreateAndTest(template2);     
    
    });

  })

  describe("Failure cases", () => {

    const failureTest = async (data, responseCode) => {
      let response = await Helper.templateCreate(data);
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

    test("A given template may only have a maximum of one instance of a field", async () => {
  
      let field = {
        "name": "naruto"
      };
      field = await Helper.templateFieldCreatePersistTest(field);

      let template = { 
        "name": "create template",
        "description": "a template to test a create",
        "fields": [field, field],
      };
      let response = await Helper.templateCreate(template);
      expect(response.statusCode).toBe(400);
    });

    test("A given template may only have a maximum of one instance of a related_template", async () => {
  
      let related_template = {
        name: "naruto"
      };
      related_template = await Helper.templateCreateAndTest(related_template);

      let template = { 
        name: "kakashi",
        related_templates: [related_template, related_template],
      };
      let response = await Helper.templateCreate(template);
      expect(response.statusCode).toBe(400);
    });
    
  });
  
});

describe("update (and get draft after an update)", () => {

  let og_template;
  let uuid;

  const populateWithDummyTemplate = async() => {
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
    og_template = await Helper.templateCreateAndTest(template);
    uuid = og_template.uuid;
  }

  describe("Success cases", () => {

    beforeEach(async() => {
      await populateWithDummyTemplate();
    });

    test("Basic update - change name and delete everything else", async () => {

      let template = { 
        "uuid": uuid,
        "name": "create template"
      };

      await Helper.templateUpdateAndTest(template);

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

      await Helper.templateUpdateAndTest(template);

    });

    test("Add an existing field and related template", async () => {

      let related_template: any = {
        "name": "related_template name"
      };
      related_template = await Helper.templateCreateAndTest(related_template);
      related_template.description = "a description";

      // Get the existing field so we can include that in our update
      let response = await Helper.templateDraftGet(uuid);
      expect(response.statusCode).toBe(200);
      let field = response.body.fields[0];
      delete field.updated_at;
      field.name = "new name";

      let template = { 
        "uuid": uuid,
        "related_templates": [related_template],
        "fields": [field]
      };

      await Helper.templateUpdateAndTest(template);

    });

    test("No changes since last persisted - pass quietly", async () => {

      await Helper.templatePersistAndFetch(uuid);

      await Helper.templateUpdateAndTest(og_template);
    });

  })

  describe("Failure cases", () => {

    beforeEach(async() => {
      await populateWithDummyTemplate();
    });

    test("uuid in request and in object must match", async () => {

      let template = { 
        "name": "create template"
      };

      let response = await Helper.templateUpdate(uuid, template);
      expect(response.statusCode).toBe(400);

    })

    test("uuid must exist", async () => {

      let template = { 
        "uuid": Helper.VALID_UUID,
        "name": "create template"
      };

      let response = await Helper.templateUpdate(Helper.VALID_UUID, template);
      expect(response.statusCode).toBe(404);

    })

    test("Must have edit permissions to update", async () => {

      let template = { 
        "uuid": uuid,
        "name": "create template"
      };
      
      await Helper.setAgent(agent2);

      let response = await Helper.templateUpdate(uuid, template);
      expect(response.statusCode).toBe(401);

    });

    test("Parent template can only point to any given related template once", async () => {
      let template = await Helper.templateDraftGetAndTest(uuid);

      template.related_templates.push(template.related_templates[0]);
      let response = await Helper.templateUpdate(uuid, template);
      expect(response.statusCode).toBe(400);

    });

    test("Circular dependencies not allowed", async () => {

      // Create template with parent a and child b. Then edit b to point to a

      let b: any = {
        name: "b"
      };

      let a: any = { 
        name: "a",
        related_templates: [b]
      };
      a = await Helper.templateCreateAndTest(a);
      b = a.related_templates[0];

      b.related_templates.push(a);
      let response = await Helper.templateUpdate(a.uuid, a);
      expect(response.statusCode).toBe(400);

      // Now do the same test but with subscribed templates
      b = {
        name: "b"
      };
      b = await Helper.templateCreatePersistTest(b);

      a = {
        name: "a",
        subscribed_templates: [b]
      }
      a = await Helper.templateCreatePersistTest(a);

      b.subscribed_templates = [a];
      response = await Helper.templateUpdate(b.uuid, b);
      expect(response.statusCode).toBe(400);

    });

  })

  describe("update after a persist: is draft different and thus created or not?", () => {
    test("name, description, dates", async () => {
      let template: any = {
        name: "naruto",
        description: "ninja",
        public_date: (new Date()).toISOString()
      };
      template = await Helper.templateCreatePersistTest(template);
  
      expect(await Helper.templateDraftExistingAndTest(template.uuid)).toBe(false);
  
      // Test name
      template.name = "caleb";
      await Helper.templateUpdateAndTest(template);
      expect(await Helper.templateDraftExistingAndTest(template.uuid)).toBe(true);
  
      template.name = "naruto";
      await Helper.templateDeleteAndTest(template.uuid);
      expect(await Helper.templateDraftExistingAndTest(template.uuid)).toBe(false);
  
      // Test description
      template.description = "toad";
      await Helper.templateUpdateAndTest(template);
      expect(await Helper.templateDraftExistingAndTest(template.uuid)).toBe(true);
  
      template.description = "ninja";
      await Helper.templateDeleteAndTest(template.uuid);
      expect(await Helper.templateDraftExistingAndTest(template.uuid)).toBe(false);
  
      // Test public_date
      template.public_date = (new Date()).toISOString();
      await Helper.templateUpdateAndTest(template);
      expect(await Helper.templateDraftExistingAndTest(template.uuid)).toBe(true);
  
      await Helper.templateDeleteAndTest(template.uuid);
      expect(await Helper.templateDraftExistingAndTest(template.uuid)).toBe(false);
    });
  
    test("fields", async () => {
      let template: any = {
        fields: [{name: "f"}]
      };
      template = await Helper.templateCreatePersistTest(template);
  
      await Helper.templateUpdateAndTest(template);
      expect(await Helper.templateDraftExistingAndTest(template.uuid)).toBe(false);
  
      template.fields[0].description = "caleb";
      await Helper.templateUpdateAndTest(template);
      expect(await Helper.templateDraftExistingAndTest(template.uuid)).toBe(true);
  
      template.fields = [];
      await Helper.templateUpdateAndTest(template);
      expect(await Helper.templateDraftExistingAndTest(template.uuid)).toBe(true);
  
      template.fields = [{name: "one"}, {name: "two"}];
      template = await Helper.templateUpdatePersistTest(template);
  
      let temp = template.fields[0];
      template.fields[0] = template.fields[1];
      template.fields[1] = temp;
      await Helper.templateUpdateAndTest(template);
      expect(await Helper.templateDraftExistingAndTest(template.uuid)).toBe(false);
  
    });
  
    test("related_templates", async () => {
      let template: any = {
        related_templates: [{name: "related"}]
      };
      template = await Helper.templateCreatePersistTest(template);
      let related_template: any = template.related_templates[0];
  
      //  Case 1, a related template has changed
      template.related_templates[0].description = "caleb";
      await Helper.templateUpdateAndTest(template);
      expect(await Helper.templateDraftExistingAndTest(template.uuid)).toBe(true);
  
      //  Case 2, the list of related templates has changed
      template.related_templates = [];
      await Helper.templateUpdateAndTest(template);
      expect(await Helper.templateDraftExistingAndTest(template.uuid)).toBe(true);
  
      //  Case 3, a related template has been persisted
  
      await Helper.templateDeleteAndTest(template.uuid);
      expect(await Helper.templateDraftExistingAndTest(template.uuid)).toBe(false);
  
      related_template.description = "description";
      await Helper.templateUpdatePersistTest(related_template);
      delete related_template.description;
      template.related_templates[0] = await Helper.templateUpdatePersistTest(related_template);
  
      await Helper.templateUpdateAndTest(template);
      expect(await Helper.templateDraftExistingAndTest(template.uuid)).toBe(true);
  
    });
  
    test("subscribed_templaes", async () => {
      // If any of the _ids in the array have changed
  
      let subscribed_template: any = {
        name: "subscribee"
      };
      subscribed_template = await Helper.templateCreatePersistTest(subscribed_template);
  
      let template: any = {
        subscribed_templates: [subscribed_template]
      };
      template = await Helper.templateCreatePersistTest(template);
  
      //  Delete subscribed template
      template.subscribed_templates = [];
      await Helper.templateUpdateAndTest(template);
      expect(await Helper.templateDraftExistingAndTest(template.uuid)).toBe(true);
  
      //  Subscribed template updates
      subscribed_template.description = "changed";
      subscribed_template = await Helper.templateUpdatePersistTest(subscribed_template);
  
      template.subscribed_templates = [subscribed_template];
      await Helper.templateUpdateAndTest(template);
      expect(await Helper.templateDraftExistingAndTest(template.uuid)).toBe(true);
  
    });
  
  });
  
});

describe("get/fetch draft", () => {
  test("must have edit permission", async () => {
    let template: any = {
      name: "t"
    }
    template = await Helper.templateCreateAndTest(template);

    await Helper.setAgent(agent2);
    
    let response = await Helper.templateDraftGet(template.uuid);
    expect(response.statusCode).toBe(401);
  });

  test("if user has view but not edit access to linked properties, the pubished version replaces that property", async () => {
    let field = {
      "name": "t1f1"
    }
    let related_template = { 
      name: "t2"
    };

    await Helper.setAgent(agent2);
    
    let field_persisted = await Helper.templateFieldCreatePersistTest(field);
    let related_template_persisted = await Helper.templateCreatePersistTest(related_template);

    let view_users = [Helper.EMAIL_2, Helper.DEF_EMAIL];

    let response = await Helper.updatePermission(field_persisted.uuid, PermissionTypes.view, view_users);
    expect(response.statusCode).toBe(200);

    response = await Helper.updatePermission(related_template_persisted.uuid, PermissionTypes.view, view_users);
    expect(response.statusCode).toBe(200);

    await Helper.setAgent(agent1);

    let template = { 
      "name": "t1",
      "fields": [field_persisted],
      "related_templates": [related_template_persisted]
    };
    let template_persisted = await Helper.templateCreatePersistTest(template);  

    // Fetch parent template, check that the two linked properties are fetched as the persisted versions
    let template_draft = await Helper.templateDraftGetAndTest(template_persisted.uuid);
    Helper.testTemplateDraftsEqual(template, template_draft);

  });

  test("if user has neither view nor edit access to linked properties, an empty object replaces that property", async () => {
    let field = {
      "name": "t1f1"
    }
    let related_template = { 
      name: "t2"
    };
    
    let template = { 
      "name": "t1",
      "fields": [field],
      "related_templates": [related_template]
    };

    await Helper.setAgent(agent2);

    let template_persisted = await Helper.templateCreatePersistTest(template);  
    
    let edit_users = [Helper.EMAIL_2, Helper.DEF_EMAIL];
    let response = await Helper.updatePermission(template_persisted.uuid, PermissionTypes.edit, edit_users);
    expect(response.statusCode).toBe(200);

    await Helper.setAgent(agent1);

    let expected_template_draft = await Helper.testAndExtract(Helper.templateDraftGet, template_persisted.uuid);
    expected_template_draft.fields[0] = {uuid: template_persisted.fields[0].uuid};
    expected_template_draft.related_templates[0] = {uuid: template_persisted.related_templates[0].uuid};
    
    // Fetch parent template, check that the two linked properties are fetched as blank 
    // since the default user doesn't have view permissions
    let template_draft = await Helper.testAndExtract(Helper.templateDraftGet, template_persisted.uuid);
    expect(template_draft).toMatchObject(expected_template_draft);    
  });
});

describe("persist (and get persisted and draft after a persist)", () => {

  describe("With subscribed templates", () => {

    test("One subscribed template of depth one", async () => {
  
      let subscribed_template = { 
        name: "t1.1"
      };
      subscribed_template = await Helper.templateCreatePersistTest(subscribed_template);


      let template = { 
        name: "t1",
        subscribed_templates: [subscribed_template]
      };
      await Helper.templateCreatePersistTest(template);

    });

    test("Mixed related and subscribed templates, of depth three", async () => {

      // Top template subscribes to one and relates to one.
      // Each of the child templates also subscribe to one and relate to one

      // 4 grandchildren
      // 2 children
      // 1 parent

    
      let t_1_1_1 = { 
        name: "t1.1.1",
      };
      t_1_1_1 = await Helper.templateCreatePersistTest(t_1_1_1);
      let t_1_1_2 = { 
        name: "t1.1.2",
      };
      t_1_1_2 = await Helper.templateCreatePersistTest(t_1_1_2);
      let t_1_2_1 = { 
        name: "t1.2.1",
      };
      t_1_2_1 = await Helper.templateCreatePersistTest(t_1_2_1);
      let t_1_2_2 = { 
        name: "t1.2.2",
      };
      t_1_2_2 = await Helper.templateCreatePersistTest(t_1_2_2);

      let t_1_1 = { 
        name: "t1.1",
        related_templates: [t_1_1_1],
        subscribed_templates: [t_1_1_2]
      };
      t_1_1 = await Helper.templateCreatePersistTest(t_1_1);
      let t_1_2 = { 
        name: "t1.2",
        related_templates: [t_1_2_1],
        subscribed_templates: [t_1_2_2]
      };
      t_1_2 = await Helper.templateCreatePersistTest(t_1_2);


      let template = { 
        name: "t1",
        related_templates: [t_1_1],
        subscribed_templates: [t_1_2]
      };
      await Helper.templateCreatePersistTest(template);

    });

  })

  describe("Success cases", () => {

    test("Simple persist - no fields and no related templates", async () => {

      let template = {
        "name":"basic template",
        "description":"a template to test a persist",
        "fields":[],
        "related_templates":[]
      };
      let persisted = await Helper.templateCreatePersistTest(template);

      // Check that we can still get a draft version
      let template_draft = await Helper.testAndExtract(Helper.templateDraftGet, persisted.uuid);
      expect(template_draft).toMatchObject(template);
    });

    test("Complex persist - with nested fields and related templates to persist", async () => {

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
        "description":"a template to test a persist",
        "fields":[field],
        "related_templates":[related_template]
      };

      let persisted = await Helper.templateCreatePersistTest(template);

      let related_template_uuid = persisted.related_templates[0].uuid;
      let field_uuid = persisted.fields[0].uuid;

      // Check that the related template was also persisted
      let latest_persisted = await Helper.testAndExtract(Helper.templateLatestPersisted, related_template_uuid);
      Helper.testTemplateDraftsEqual(related_template, latest_persisted);

      // Check that the field was also persisted
      let latest_persisted_field = await Helper.testAndExtract(Helper.templateFieldLatestPersisted, field_uuid);
      Helper.testTemplateFieldsEqual(field, latest_persisted_field);
    });

    test("Complex persist - changes in related_template result in persisting for all parent properties", async () => {

      let template: any = {
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
      template = await Helper.templateCreatePersistTest(template);

      // Make a change in the third level of data
      template.related_templates[0].related_templates[0].description = "3 has a new description";

      // Update with change
      let response = await Helper.templateUpdate(template.uuid, template);
      expect(response.statusCode).toBe(200);

      // Record the date before we persist a second time
      let intermediate_persist_date = (new Date()).getTime();

      template = await Helper.templatePersistAndFetch(template.uuid);

      // On the third node and above, the persist date should be newer than the intermediate_persist_date. 
      // The fourth should be older
      
      expect(new Date(template.persist_date).getTime()).toBeGreaterThan(intermediate_persist_date);
      expect(new Date(template.related_templates[0].persist_date).getTime()).toBeGreaterThan(intermediate_persist_date);
      expect(new Date(template.related_templates[0].related_templates[0].persist_date).getTime()).toBeGreaterThan(intermediate_persist_date);
      expect(new Date(template.related_templates[0].related_templates[0].related_templates[0].persist_date).getTime()).toBeLessThan(intermediate_persist_date);

    });

    test("Complex persist - persist parent who's child changed previously and no other changes are present", async () => {

      let template: any = {
        "name":"1",
        "related_templates":[{
          "name": "2"
        }]
      };
      // Create initial data
      template = await Helper.templateCreatePersistTest(template);
      let uuid = template.uuid;

      // Make a change in the third level of data
      template.related_templates[0].description = "2 has a new description";
      let uuid2 = template.related_templates[0].uuid;

      // Update second template
      let response = await Helper.templateUpdate(uuid2, template.related_templates[0]);
      expect(response.statusCode).toBe(200);

      // Record the date before we persist the change to the second template
      let persist_date_2 = (new Date()).getTime();

      await Helper.templatePersistAndFetch(uuid2);
      
      // Now we want to get a draft of the parent and persist that draft as it is. It should be successful since the child changed.
      
      template = await Helper.testAndExtract(Helper.templateDraftGet, uuid);
      
      // Update with change
      response = await Helper.templateUpdate(uuid, template);
      expect(response.statusCode).toBe(200);

      // Record the date before we persist the parent template again
      let persist_date_3 = (new Date()).getTime();

      template = await Helper.templatePersistAndFetch(uuid);

      expect(new Date(template.persist_date).getTime()).toBeGreaterThan(persist_date_3);
      expect(new Date(template.related_templates[0].persist_date).getTime()).toBeGreaterThan(persist_date_2);
      expect(new Date(template.related_templates[0].persist_date).getTime()).toBeLessThan(persist_date_3);
    });

    test("Include a field and related_template user doesn't have edit permissions to, but are public", async () => {
      let field = {
        "name": "t1f1",
        public_date: (new Date()).toISOString()
      }
      let related_template = { 
        name: "t2",
        public_date: (new Date()).toISOString()
      };

      await Helper.setAgent(agent2);
      
      let field_persisted = await Helper.templateFieldCreatePersistTest(field);
      let related_template_persisted = await Helper.templateCreatePersistTest(related_template);

      await Helper.setAgent(agent1);

      let template = { 
        "name": "t1",
        "fields": [field_persisted],
        "related_templates": [related_template_persisted]
      };
      await Helper.templateCreatePersistTest(template);         

    });

    test("Include a field and related_template user doesn't have edit permissions to, but does have view permissions to", async () => {
      let field = {
        "name": "t1f1"
      }
      let related_template = { 
        name: "t2"
      };

      await Helper.setAgent(agent2);
      
      let field_persisted = await Helper.templateFieldCreatePersistTest(field);
      let related_template_persisted = await Helper.templateCreatePersistTest(related_template);

      let view_users = [Helper.EMAIL_2, Helper.DEF_EMAIL];

      let response = await Helper.updatePermission(field_persisted.uuid, PermissionTypes.view, view_users);
      expect(response.statusCode).toBe(200);

      response = await Helper.updatePermission(related_template_persisted.uuid, PermissionTypes.view, view_users);
      expect(response.statusCode).toBe(200);

      await Helper.setAgent(agent1);

      let template = { 
        "name": "t1",
        "fields": [field_persisted],
        "related_templates": [related_template_persisted]
      };
      await Helper.templateCreatePersistTest(template);         

    });

    test("Include a field and related_template user doesn't have any permissions to, user can still create and persist link to it", async () => {
      let other_user = 'other';

      let field = {
        name: "t1f1"
      }
      let related_template = { 
        name: "t2"
      };

      await Helper.setAgent(agent2);
      
      let field_persisted = await Helper.templateFieldCreatePersistTest(field);
      let related_template_persisted = await Helper.templateCreatePersistTest(related_template);

      await Helper.setAgent(agent1);


      let template = { 
        "name": "t1",
        "fields": [{uuid: field_persisted.uuid}],
        "related_templates": [{uuid: related_template_persisted.uuid}]
      };
      
      // Now pubish and test this persisted template manually
      await Helper.templateCreatePersistTest(template); 

    });

    test("User can persist parent template if they have edit access, even if they don't have any access to sub-properties", async () => {

      let related_template = {
        "name": "t2"
      };
      let field = {
        "name": "t1f1"
      };
      let template = {
        "name":"basic template",
        "description":"a template to test a persist",
        "fields":[field],
        "related_templates":[related_template]
      };
      // Persist first time with user 1
      let first_persisted = await Helper.templateCreatePersistTest(template);
      let parent_uuid = first_persisted.uuid;

      // Update with user 1
      let draft = await Helper.testAndExtract(Helper.templateDraftGet, parent_uuid);
      draft.description = "d";
      draft.related_templates[0].description = "d";
      draft.fields[0].description = "d";
      let response = await Helper.templateUpdate(draft.uuid, draft);
      expect(response.statusCode).toBe(200);

      await Helper.setAgent(agent1);

      // Give user 2 edit and view permissions to parent template
      let view_users = [Helper.DEF_EMAIL, Helper.EMAIL_2];
      response = await Helper.updatePermission(parent_uuid, PermissionTypes.view, view_users);
      expect(response.statusCode).toBe(200);
      response = await Helper.updatePermission(parent_uuid, PermissionTypes.edit, view_users);
      expect(response.statusCode).toBe(200);

      await Helper.setAgent(agent2);

      // Now let user 2 persist the parent template
      await Helper.templatePersistAndFetch(parent_uuid);

      // Now verify that user 2 persisted the parent but not the children.

      let related_template_persisted = first_persisted.related_templates[0];
      let field_persisted = first_persisted.fields[0];

      await Helper.setAgent(agent1);

      // Check that the related template was not persisted
      response = await Helper.templateLatestPersisted(related_template_persisted.uuid);
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject(related_template_persisted);

      // Check that the field was not persisted
      response = await Helper.templateFieldLatestPersisted(field_persisted.uuid);
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject(field_persisted);

      // Check that the parent was persisted
      response = await Helper.templateLatestPersisted(parent_uuid);
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toMatchObject(first_persisted);
      // Also check that it is still pointing to the original persisted field and related_template
      expect(response.body.fields[0]._id).toBe(field_persisted._id);
      expect(response.body.related_templates[0]._id).toBe(related_template_persisted._id);

    });

  })

  describe("Failure cases", () => {
    
    test("Template with uuid must exist", async () => {

      let template: any = {
        "name":"basic template"
      };
      template = await Helper.templateCreateAndTest(template);

      let last_update = await Helper.testAndExtract(Helper.templateLastUpdate, template.uuid);

      let response = await Helper.templatePersist(Helper.VALID_UUID, last_update);
      expect(response.statusCode).toBe(404);

    });

    test("There must be changes to persist", async () => {
      let template: any = {
        "name":"basic template"
      };
      template = await Helper.templateCreatePersistTest(template);

      let last_update = await Helper.templateLastUpdateAndTest(template.uuid);

      let response = await Helper.templatePersist(template.uuid, last_update);
      expect(response.statusCode).toBe(400);
  
    });

    test("Internal refrences must be valid", async () => {
      let template: any = {
        "name":"temp1",
        "related_templates": [{
          "name": "temp2"
        }]
      };

      template = await Helper.templateCreateAndTest(template);
      let uuid = template.uuid;

      let response = await Helper.templateDraftGet(uuid)
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject(template);

      // Delete the internal draft
      response = await Helper.templateDelete(response.body.related_templates[0].uuid);
      expect(response.statusCode).toBe(200);

      let last_update = await Helper.testAndExtract(Helper.templateLastUpdate, uuid);

      // Expect persist of parent draft to fail because of invalid reference 
      response = await Helper.templatePersist(uuid, last_update);
      expect(response.statusCode).toBe(400);

      // Fetch parent draft again, thus purging reference to internal draft
      response = await Helper.templateDraftGet(uuid);
      expect(response.statusCode).toBe(200);

      last_update = await Helper.testAndExtract(Helper.templateLastUpdate, uuid);

      // Expect persist of parent draft to succeed because invalid reference has been removed
      response = await Helper.templatePersist(uuid, last_update);
      expect(response.statusCode).toBe(200);
    });

    test("Last update provided must match to actual last update in the database", async () => {
      let template: any = {
        "name":"basic template",
        "description":"a template to test a persist"
      };
      template = await Helper.templateCreateAndTest(template);

      let response =  await Helper.templatePersist(template.uuid, (new Date()).toISOString());
      expect(response.statusCode).toBe(400);
    });

    test("Last update provided must match to actual last update in the database, also if sub-property is updated later", async () => {
     
      let related_template: any = {"name": "2"};
     
      let template: any = {
        "name":"1",
        "related_templates": [related_template]
      };
      template = await Helper.templateCreateAndTest(template);
      let uuid = template.uuid

      let response = await Helper.templateDraftGet(uuid);
      expect(response.statusCode).toBe(200);
      let old_update = response.body.updated_at;

      related_template = response.body.related_templates[0];
      related_template.description = "new description";

      response = await Helper.templateUpdate(related_template.uuid, related_template);
      expect(response.statusCode).toBe(200);

      response = await Helper.templatePersist(uuid, old_update);
      expect(response.statusCode).toBe(400);
    });

    test("User must have edit permission to persist", async () => {

      let template: any = {
        "name":"basic template"
      };
      template = await Helper.templateCreateAndTest(template);
      let uuid = template.uuid;

      // A different user shouldn't be able to persist
      let last_update = await Helper.testAndExtract(Helper.templateLastUpdate, uuid);

      await Helper.setAgent(agent2);

      let response = await Helper.templatePersist(uuid, last_update);
      expect(response.statusCode).toBe(401);

      await Helper.setAgent(agent1);

      // Even if that user has view permissions, they still shouldn't be able to persist
      response = await Helper.updatePermission(uuid, PermissionTypes.view, [Helper.DEF_EMAIL, Helper.EMAIL_2]);
      expect(response.statusCode).toBe(200);

      await Helper.setAgent(agent2);

      response = await Helper.templatePersist(uuid, last_update, Helper.USER_2);
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
  //     .post(`/template/${uuid}/persist`)
  //     .send({last_update})
  //     .set('Accept', 'application/json');
  //   expect(response.statusCode).toBe(200);
  
  //   // Check that a persisted version now exists
  //   response = await request(app)
  //     .get(`/template/${uuid}/latest_persisted`)
  //     .set('Accept', 'application/json');
  //   expect(response.statusCode).toBe(200);
  //   expect(response.body).toMatchObject(data);

  //   // Check that the related template was also persisted
  //   related_template_data = response.body.related_templates[0];
  //   let related_template_uuid = related_template_data.uuid;
  //   response = await request(app)
  //     .get(`/template/${related_template_uuid}/latest_persisted`)
  //     .set('Accept', 'application/json');
  //   expect(response.statusCode).toBe(200);
  //   expect(response.body).toMatchObject(related_template_data);

  //   // Now update and persist the sub-template
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
  //     .post(`/template/${related_template_uuid}/persist`)
  //     .send({last_update})
  //     .set('Accept', 'application/json');
  //   expect(response.statusCode).toBe(200);

  //   // Now the important part. Test that persist also created a draft of the parent template
  //   response = await request(app)
  //     .get(`/template/${uuid}/draft_existing`)
  //     .set('Accept', 'application/json');
  //   expect(response.statusCode).toBe(200);
  //   expect(response.body).toBe(true);

  // });


});

describe("get/fetch persisted", () => {
  test("if user does not have view access to linked properties, an empty object replaces that property", async () => {
    let field = {
      "name": "t1f1"
    }
    let related_template = { 
      name: "t2"
    };
    
    let template = { 
      "name": "t1",
      "fields": [field],
      "related_templates": [related_template]
    };

    await Helper.setAgent(agent2);

    let template_persisted = await Helper.templateCreatePersistTest(template);  
    
    let view_users = [Helper.EMAIL_2, Helper.DEF_EMAIL];
    let response = await Helper.updatePermission(template_persisted.uuid, PermissionTypes.view, view_users);
    expect(response.statusCode).toBe(200);

    template_persisted.fields[0] = {uuid: template_persisted.fields[0].uuid};
    template_persisted.related_templates[0] = {uuid: template_persisted.related_templates[0].uuid};

    await Helper.setAgent(agent1);

    // Fetch parent template, check that the two linked properties are fetched as blank 
    // since the default user doesn't have view permissions
    response = await Helper.templateLatestPersisted(template_persisted.uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject(template_persisted);   
  });

  test("must have view permissions", async () => {
    let template = { 
      "name": "t1"
    };

    await Helper.setAgent(agent2);

    let template_persisted = await Helper.templateCreatePersistTest(template);  

    await Helper.setAgent(agent1);

    let response = await Helper.templateLatestPersisted(template_persisted.uuid);
    expect(response.statusCode).toBe(401);
  });
});

test("get persisted for a certain date", async () => {
  let template: any = {
    "name":"basic template",
    "description": "1"
  };
  template = await Helper.templateCreateAndTest(template);
  let uuid = template.uuid

  let beforeFirstPersist = new Date();

  // Test that if only a draft exists, it is not fetched
  let response = await Helper.templateLatestPersistedBeforeDate(uuid, beforeFirstPersist.toISOString());
  expect(response.statusCode).toBe(404);

  await Helper.templatePersistAndFetch(uuid);

  let afterFirstPersist = new Date();

  template.uuid = uuid;
  template.description = "2";

  response = await Helper.templateUpdate(uuid, template);
  expect(response.statusCode).toBe(200);
  await Helper.templatePersistAndFetch(uuid);

  let afterSecondPersist = new Date();

  template.description = "3";

  response = await Helper.templateUpdate(uuid, template);
  expect(response.statusCode).toBe(200);
  await Helper.templatePersistAndFetch(uuid);

  // Now there should be three persisted versions. Search for each based on the date

  response = await Helper.templateLatestPersisted(uuid);
  expect(response.statusCode).toBe(200);
  expect(response.body.description).toEqual(expect.stringMatching("3"));

  response = await Helper.templateLatestPersistedBeforeDate(uuid, (new Date()).toISOString());
  expect(response.statusCode).toBe(200);
  expect(response.body.description).toEqual(expect.stringMatching("3"));

  response = await Helper.templateLatestPersistedBeforeDate(uuid, afterSecondPersist.toISOString());
  expect(response.statusCode).toBe(200);
  expect(response.body.description).toEqual(expect.stringMatching("2"));

  response = await Helper.templateLatestPersistedBeforeDate(uuid, afterFirstPersist.toISOString());
  expect(response.statusCode).toBe(200);
  expect(response.body.description).toEqual(expect.stringMatching("1"));

  response = await Helper.templateLatestPersistedBeforeDate(uuid, beforeFirstPersist.toISOString());
  expect(response.statusCode).toBe(404);
});

describe("delete", () => {
  test("delete a draft, not a persisted version", async () => {
    let template: any = {
      "name":"basic template",
      "description": "description"
    };
    template = await Helper.templateCreatePersistTest(template);
  
    template.description = "different";
  
    // Change the draft, but don't persist the change
    let response = await Helper.templateUpdate(template.uuid, template);
    expect(response.statusCode).toBe(200);
  
    // Verify that the draft is what we changed it to
    response = await Helper.templateDraftGet(template.uuid);
    expect(response.statusCode).toBe(200);
  
    // Delete the draft
    response = await Helper.templateDelete(template.uuid);
    expect(response.statusCode).toBe(200);
  
    // Get the draft again. Make sure it matches the latest persisted version
    response = await Helper.templateDraftGet(template.uuid);
    expect(response.statusCode).toBe(200);
  
    template.description = "description";
    delete template._id;
    delete template.persist_date;
    expect(response.body).toMatchObject(template);
  
  });

  test("if there are no persisted versions, permissions get deleted as well", async () => {
    let template: any = {
      name: "t"
    };
    template = await Helper.templateCreateAndTest(template);
    let uuid = template.uuid;

    let permission = await Helper.testAndExtract(Helper.getPermission, uuid, PermissionTypes.admin);
    expect(permission).toEqual([Helper.DEF_EMAIL]);

    let user_permissions = await Helper.testAndExtract(Helper.accountPermissions);
    expect(user_permissions.template.admin).toEqual(expect.arrayContaining([uuid]));
  
    
    await Helper.testAndExtract(Helper.templateDelete, uuid);
    
    let response = await Helper.getPermission(uuid, PermissionTypes.admin);
    expect(response.statusCode).toBe(404);

    user_permissions = await Helper.testAndExtract(Helper.accountPermissions);
    expect(user_permissions.template.admin).not.toEqual(expect.arrayContaining([uuid]));
  });

  test("need edit permissions", async () => {
    let template: any = {
      "name":"basic template"
    };
    template = await Helper.templateCreateAndTest(template);

    await Helper.setAgent(agent2);

    let response = await Helper.templateDelete(template.uuid);
    expect(response.statusCode).toBe(401);
  })
});

describe("templateLastUpdate", () => {

  describe("success", () => {
    test("basic draft, no fields or related templates", async () => {
      let timestamp = new Date();
      let template: any = {
        "name":"1"
      };
      template = await Helper.templateCreateAndTest(template);

      let response = await Helper.templateLastUpdate(template.uuid);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(timestamp.getTime());
    });

    test("basic persisted, no fields or related templates. available to anyone with view or edit permissions", async () => {
      let timestamp = new Date();
      let template = {
        "name":"1"
      };
      let persisted = await Helper.templateCreatePersistTest(template);

      let response = await Helper.templateLastUpdate(persisted.uuid);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(timestamp.getTime());

      let view_users = [Helper.EMAIL_2, Helper.DEF_EMAIL];
      response = await Helper.updatePermission(persisted.uuid, PermissionTypes.view, view_users);
      expect(response.statusCode).toBe(200);

      await Helper.setAgent(agent2);

      response = await Helper.templateLastUpdate(persisted.uuid);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(timestamp.getTime());
    });

    test("sub template updated later than parent template", async () => {
      // let timestamp_before_create = new Date();
      let template: any = {
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
      template = await Helper.templateCreateAndTest(template);
      let uuid = template.uuid;

      template = await Helper.testAndExtract(Helper.templateDraftGet, uuid);

      let timestamp_between_create_and_update = new Date();

      // Update 3. 1 and 2 dates should be 3, but 4s should be older
      let template3: any = template.related_templates[0].related_templates[0];
      template3.description = "added a description";

      // maybe another time: test that updating a parent doesn't update a child
      //let data4_updated_at = data3.related_templates[0].updated_at;

      let response = await Helper.templateUpdate(template3.uuid, template3);
      expect(response.statusCode).toBe(200);

      let timestamp_after_update = new Date();

      response = await Helper.templateLastUpdate(uuid);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(timestamp_between_create_and_update.getTime());
      expect((new Date(response.body)).getTime()).toBeLessThan(timestamp_after_update.getTime());

      response = await Helper.templateLastUpdate(template3.uuid);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(timestamp_between_create_and_update.getTime());
      expect((new Date(response.body)).getTime()).toBeLessThan(timestamp_after_update.getTime());
      
      // response = await request(app)
      //   .get(`/template/${data3.related_templates[0].uuid}/last_update`);
      // expect(response.statusCode).toBe(200);
      // expect((new Date(response.body)).getTime()).toBeGreaterThan(timestamp_before_create.getTime());
      // expect((new Date(response.body)).getTime()).toBeLessThan(timestamp_between_create_and_update.getTime());

    });

    test("sub template updated and persisted later than parent template", async () => {

      let template: any = {
        "name": "1",
        "related_templates": [{
          "name": "2"
        }]
      };
      template = await Helper.templateCreatePersistTest(template);

      let related_template = template.related_templates[0];
      related_template.description = "des";

      let response = await Helper.templateUpdate(related_template.uuid, related_template);
      expect(response.statusCode).toEqual(200);

      let time1 = new Date();
      await Helper.templatePersistAndFetch(related_template.uuid);
      let time2 = new Date();

      response = await Helper.templateLastUpdate(template.uuid);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(time1.getTime());
      expect((new Date(response.body)).getTime()).toBeLessThan(time2.getTime());
    });

    test("grandchild updated, but child deleted. Updated time should still be grandchild updated", async () => {
      let template: any = {
        "name": "1",
        "related_templates": [{
          "name": "2",
          "related_templates": [{
            "name": "3"
          }]
        }]
      };
      template = await Helper.templateCreateAndTest(template);
      let uuid = template.uuid;

      // create
      let response = await Helper.templateDraftGet(uuid);
      expect(response.statusCode).toBe(200);
      template = response.body;

      let template2 = template.related_templates[0];
      let template3 = template2.related_templates[0];

      // persist
      await Helper.templatePersistAndFetch(uuid);

      // Update grandchild
      template3.description = "added a description";

      response = await Helper.templateUpdate(template3.uuid, template3);
      expect(response.statusCode).toBe(200);

      response = await Helper.templateDraftGet(template3.uuid);
      expect(response.statusCode).toBe(200);
      let update_3_timestamp = response.body.updated_at;

      // Now get the update timestamp for the grandparent. It should be that of the grandchild.
      response = await Helper.templateLastUpdate(uuid);
      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual(update_3_timestamp);
      
    });

    test("first template_field updated, but not second", async () => {
      let template: any = {
        name:"t",
        fields: [
          {
            name: "f1"
          },
          {
            name: "f2"
          }
        ]
      };
      template = await Helper.templateCreatePersistTest(template);

      template.fields[0].name = "different name";

      let timestamp = new Date();

      template = await Helper.templateUpdateAndTest(template);

      let response = await Helper.templateLastUpdate(template.uuid);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(timestamp.getTime());
    });
  });

  describe("failure", () => {
    test("invalid uuid", async () => {
      let response = await agent1
        .get(`/template/18/last_update`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(400);

      response = await agent1
        .get(`/template/${Helper.VALID_UUID}/last_update`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(404);
    });

    test("must have edit permissions to get last update of draft", async () => {
      let template: any = {
        "name":"1"
      };
      template = await Helper.templateCreateAndTest(template);

      Helper.setAgent(agent2);
      
      let response = await Helper.templateLastUpdate(template.uuid);
      expect(response.statusCode).toBe(401);
    });

    test("must have edit or view permissions to get last update of persisted", async () => {
      let template: any = {
        "name":"1"
      };
      template = await Helper.templateCreatePersistTest(template);

      Helper.setAgent(agent2);

      let response = await Helper.templateLastUpdate(template.uuid);
      expect(response.statusCode).toBe(401);
    });
  });
})

describe("duplicate", () => {
  describe("success", () => {
    test("basic template, nothing else", async () => {
      let template = {
        name: "t1"
      };
      let template_persisted = await Helper.templateCreatePersistTest(template);
      let response = await Helper.templateDuplicate(template_persisted.uuid);
      expect(response.statusCode).toEqual(200);
      let new_uuid = response.body.new_uuid;
      let draft = await Helper.testAndExtract(Helper.templateDraftGet, new_uuid);
      expect(draft).toMatchObject(template);
      expect(draft.duplicated_from).toEqual(template_persisted.uuid);
    });
    test("basic template duplicated by a user with view permissions to the original", async () => {
      let template: any = {
        name: "t1",
        public_date: (new Date()).toISOString()
      };
      let template_persisted = await Helper.templateCreatePersistTest(template);

      Helper.setAgent(agent2);

      let response = await Helper.templateDuplicate(template_persisted.uuid);
      expect(response.statusCode).toEqual(200);
      let new_uuid = response.body.new_uuid;
      let draft = await Helper.testAndExtract(Helper.templateDraftGet, new_uuid);
      delete template.public_date;
      expect(draft).toMatchObject(template);
      expect(draft.duplicated_from).toEqual(template_persisted.uuid);
    });
    test("template with field and related_template", async () => {
      let template = {
        name: "t1",
        fields: [{name: "t1f1"}],
        related_templates: [{name: "t1.1"}]
      };
      let template_persisted = await Helper.templateCreatePersistTest(template);
      let response = await Helper.templateDuplicate(template_persisted.uuid);
      expect(response.statusCode).toEqual(200);
      let new_uuid = response.body.new_uuid;
      let draft = await Helper.templateDraftGetAndTest(new_uuid);
      Helper.testTemplateDraftsEqual(template, draft);
      expect(draft.duplicated_from).toEqual(template_persisted.uuid);
      expect(draft.fields[0].duplicated_from).toEqual(template_persisted.fields[0].uuid);
      expect(draft.related_templates[0].duplicated_from).toEqual(template_persisted.related_templates[0].uuid);
    });
    test("template with subscribed_template", async () => {
      let subscribed_template = {
        name: "subscribed"
      };
      subscribed_template = await Helper.templateCreatePersistTest(subscribed_template);
      let template = {
        name: "t1",
        subscribed_templates: [subscribed_template]
      };
      let template_persisted = await Helper.templateCreatePersistTest(template);
      let response = await Helper.templateDuplicate(template_persisted.uuid);
      expect(response.statusCode).toEqual(200);
      let new_uuid = response.body.new_uuid;
      let draft = await Helper.templateDraftGetAndTest(new_uuid);
      Helper.testTemplateDraftsEqual(template, draft);
      expect(draft.duplicated_from).toEqual(template_persisted.uuid);
    });
    test("only have permisssion to duplicate the top template", async () => {
      let template: any = {
        name: "t1",
        public_date: (new Date()).toISOString(),
        fields: [{name: "t1f1"}],
        related_templates: [{name: "t1.1"}]
      };
      let template_persisted = await Helper.templateCreatePersistTest(template);
      
      Helper.setAgent(agent2);

      let response = await Helper.templateDuplicate(template_persisted.uuid);
      expect(response.statusCode).toEqual(200);
      let new_uuid = response.body.new_uuid;
      let draft = await Helper.testAndExtract(Helper.templateDraftGet, new_uuid);
      template = {name: "t1"};
      expect(draft).toMatchObject(template);
      expect(draft.duplicated_from).toEqual(template_persisted.uuid);
    });
  });
  describe("failure", () => {
    test("uuid must be of valid format", async () => {
      let invalid_uuid = "5;"
      let response = await Helper.templateDuplicate(invalid_uuid);
      expect(response.statusCode).toEqual(400);
    });
    test("persisted template must exist", async () => {
      let response = await Helper.templateDuplicate(Helper.VALID_UUID);
      expect(response.statusCode).toEqual(404);
    });
    test("user must have view access to template", async () => {
      let template: any = {
        name: "t1"
      };
      template = await Helper.templateCreatePersistTest(template);
      
      Helper.setAgent(agent2);

      let response = await Helper.templateDuplicate(template.uuid);
      expect(response.statusCode).toEqual(401);
    });
  });
});

test("full range of operations with big data", async () => {
  let template: any = {
    name: "1",
    fields: [
      {name: "t1f1"},
      {name: "t1f2"},
      {name: "t1f3"}
    ],
    related_templates: [
      {
        name: "1.1",
        related_templates: [
          {
            name: "1.1.1",
            fields: [
              {name: "t1.1.1f1"},
              {name: "t1.1.1f2"}
            ],
            related_templates: [
              {
                name: "1.1.1.1",
                fields: [
                  {name: "t1.1.1.1f1"},
                  {name: "t1.1.1.1f2"}
                ]
              },
              {
                name: "1.1.1.2"
              }
            ]
          },
          {
            name: "1.1.2",
            fields: [
              {name: "t1.1.2f1"},
              {name: "t1.1.2f2"}
            ],
            related_templates: [
              {
                name: "1.1.2.1",
                fields: [
                  {name: "t1.1.2.1f1"},
                  {name: "t1.1.2.1f2"}
                ]
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

  template = await Helper.templateCreatePersistTest(template);

  let institution_template = {
    name: "institution",
    fields: [
      {name: "name"},
      {name: "location"}
    ]
  };
  institution_template = await Helper.templateCreatePersistTest(institution_template);

  template.related_templates.push(institution_template);
  template.related_templates[0].related_templates.push(institution_template);
  template.related_templates[0].related_templates[0].related_templates.push(institution_template);

  template = await Helper.templateUpdatePersistTest(template);

  institution_template.fields.push({name: "ninja"});
  institution_template = await Helper.templateUpdatePersistTest(institution_template);

  template = await Helper.templateDraftGetAndTest(template.uuid);
  template = await Helper.templateUpdatePersistTest(template);

});
