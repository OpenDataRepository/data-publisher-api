const request = require("supertest");
var { app, init: appInit, close: appClose } = require('../app');
var { PermissionTypes } = require('../models/permission_group');
const FieldTypes = require('../models/template_field').FieldTypes;
var HelperClass = require('./common_test_operations')
var Helper = new HelperClass(app);

var agent1;

beforeAll(async () => {
  await appInit();
});

beforeEach(async() => {
  await Helper.clearDatabase();
  agent1 = await Helper.createAgentRegisterLogin(Helper.DEF_EMAIL, Helper.DEF_PASSWORD);
});

afterAll(async () => {
  await Helper.clearDatabase();
  await appClose();
});

describe("create (and get draft after a create)", () => {
  describe("success cases", () => {
    test("Basic, no radio options", async () => {
      let data = {
        name: "field",
        description: "",
        type: FieldTypes.File,
        public_date: (new Date()).toISOString(),
      };
      let uuid = await Helper.templateFieldCreateAndTest(data);
  
      // Now test that all permission groups were created successfully
      await Helper.testPermissionGroupsInitializedFor(uuid);
  
    });

    test("with radio options 1-dimensional", async () => {
      let data = {
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
      await Helper.templateFieldCreateAndTest(data);
    });

    test("with radio options multi-dimensional", async () => {
      let data = {
        name: "f1",
        public_date: (new Date()).toISOString(),
        options: [
          {
            name: "Sarutobi",
            options: [
              {
                name: "Jiraiya",
                options: [
                  {
                    name: "Naruto",
                    options: [
                      {
                        name: "Konohamaru",
                      },
                    ]
                  },
                ]
              },
              {
                name: "Orochimaru",
                options: [
                  {
                    name: "Kabuto"
                  },
                  {
                    name: "Sasuke"
                  }
                ]
              },
              {
                name: "Tsunade",
                options: [
                  {
                    name: "Sakura"
                  }
                ]
              }
            ]
          }
        ]
      };
      await Helper.templateFieldCreateAndTest(data);
    });
  });

  describe("failure cases", () => {

    const failureTest = async (data, responseCode) => {
      let response = await Helper.templateFieldCreate(data);
      expect(response.statusCode).toBe(responseCode);
    };
  
    test("Input must be an object", async () => {
      let data = [];
      await failureTest(data, 400);
    })
  
    test("name and description must be strings", async () => {
      let invalidName = {
        name: 5
      };
      let invalidDescription = {
        description: 5
      };
      await failureTest(invalidName, 400);
      await failureTest(invalidDescription, 400);
    })

    test("public_date must be a valid date", async () => {
      let data = {
        name: "field",
        description: "",
        public_date: "invalid date",
      };
      await failureTest(data, 400);
    })

    test("type must be supported", async () => {
      let data = {
        name: "field",
        description: "",
        type: "other",
      };
      await failureTest(data, 400);
    })

    test("radio options", async () => {
      let data = {
        name: "f1",
        public_date: (new Date()).toISOString(),
        options: "must be array"
      };
      // radio options must be an array
      let response = await Helper.templateFieldCreate(data);
      expect(response.statusCode).toBe(400);

      // radio options must contain objects
      data.options = ["elements must be objects"];
      response = await Helper.templateFieldCreate(data);
      expect(response.statusCode).toBe(400);

      // each radio option must have a name
      data.options = [{}];
      response = await Helper.templateFieldCreate(data);
      expect(response.statusCode).toBe(400);

      // each radio option name must be a string
      data.options = [{name: 6}];
      response = await Helper.templateFieldCreate(data);
      expect(response.statusCode).toBe(400);

    });

    test("there must be a user in the session", async () => {
      let agent2 = request.agent(app);
      Helper.setAgent(agent2);

      let data = {
        name: "field",
      };
      await failureTest(data, 401);
    });

  });

});

describe("update (and get draft after an update)", () => {

  let template_field;

  beforeEach(async() => {
    template_field = { 
      "name": "field",
      "description": "description"
    };
    template_field.uuid = await Helper.templateFieldCreateAndTest(template_field);
  });

  describe("success cases", () => {
    test("Basic", async () => {

      let data = { 
        "uuid": template_field.uuid,
        "name": "different name",
        public_date: (new Date()).toISOString()
      };

      await Helper.testAndExtract(Helper.templateFieldUpdate, template_field.uuid, data);
    
      let new_draft = await Helper.testAndExtract(Helper.templateFieldDraftGet, template_field.uuid);
      expect(new_draft).toMatchObject(data);

    });

    test("with radio options 1-dimensional", async () => {
      template_field.options = [
        {
          name: "naruto"
        },
        {
          name: "sasuke"
        },
        {
          name: "sakura"
        }
      ];
      await Helper.templateFieldUpdateAndTest(template_field);

      template_field = await Helper.testAndExtract(Helper.templateFieldDraftGet, template_field.uuid);

      template_field.options.push({
        name: "caleb"
      });
      await Helper.templateFieldUpdateAndTest(template_field);

    });

    test("with radio options multi-dimensional", async () => {
      let template_field = {
        name: "f1",
        public_date: (new Date()).toISOString(),
        options: [
          {
            name: "Sarutobi",
            options: [
              {
                name: "Jiraiya",
                options: [
                  {
                    name: "Naruto",
                    options: [
                      {
                        name: "Konohamaru",
                      },
                    ]
                  },
                ]
              },
              {
                name: "Orochimaru",
                options: [
                  {
                    name: "Kabuto"
                  },
                  {
                    name: "Sasuke"
                  }
                ]
              },
              {
                name: "Tsunade",
                options: [
                  {
                    name: "Sakura"
                  }
                ]
              }
            ]
          }
        ]
      };
      let uuid = await Helper.templateFieldCreateAndTest(template_field);

      template_field = await Helper.testAndExtract(Helper.templateFieldDraftGet, uuid);

      template_field.options.push({
        name: "caleb"
      });
      await Helper.templateFieldUpdateAndTest(template_field);

    });
  });

  describe("Failure cases", () => {

    test("uuid in request and in object must match", async () => {

      let data = { 
        "name": "name"
      };

      let response = await Helper.templateFieldUpdate(template_field.uuid, data);
      expect(response.statusCode).toBe(400);

    })

    test("uuid must exist", async () => {

      let data = { 
        "uuid": Helper.VALID_UUID,
        "name": "name"
      };

      let response = await Helper.templateFieldUpdate(Helper.VALID_UUID, data);
      expect(response.statusCode).toBe(404);

    })

    test("user must have edit permissions", async () => {

      let data = { 
        "uuid": template_field.uuid,
        "name": "different name"
      };

      await Helper.createAgentRegisterLogin(Helper.EMAIL_2, Helper.DEF_PASSWORD);
  
      let response = await Helper.templateFieldUpdate(template_field.uuid, data);
      expect(response.statusCode).toBe(401);
    })

    test("radio options", async () => {
      template_field.options = [
        {name: "caleb"},
        {name: "naruto"}
      ];
      await Helper.templateFieldUpdateAndTest(template_field);
      template_field = await Helper.testAndExtract(Helper.templateFieldDraftGet, template_field.uuid);

      // radio options uuids supplied must exist
      template_field.options[0].uuid = Helper.VALID_UUID;
      response = await Helper.templateFieldUpdate(template_field.uuid, template_field);
      expect(response.statusCode).toBe(400);

      // radio options uuids supplied must exist
      template_field.options[0].uuid = template_field.options[1].uuid;
      response = await Helper.templateFieldUpdate(template_field.uuid, template_field);
      expect(response.statusCode).toBe(400);

    });
  })

  describe("update after a persist: is draft different and thus created or not?", () => {
    test("name, description, dates, type", async () => {
      let field = {
        name: "naruto",
        description: "ninja",
        public_date: (new Date()).toISOString()
      };
      field = await Helper.templateFieldCreatePersistTest(field);
  
      // Check that a draft no longer exists after the persist
      expect(await Helper.templateFieldDraftExistingAndTest(field.uuid)).toBe(false);
  
      // Test name
      field.name = "caleb";
      await Helper.templateFieldUpdateAndTest(field);
      expect(await Helper.templateFieldDraftExistingAndTest(field.uuid)).toBe(true);
  
      field.name = "naruto";
      await Helper.templateFieldDraftDeleteAndTest(field.uuid);
      expect(await Helper.templateFieldDraftExistingAndTest(field.uuid)).toBe(false);
  
      // Test description
      field.description = "toad";
      await Helper.templateFieldUpdateAndTest(field);
      expect(await Helper.templateFieldDraftExistingAndTest(field.uuid)).toBe(true);
  
      field.description = "ninja";
      await Helper.templateFieldDraftDeleteAndTest(field.uuid);
      expect(await Helper.templateFieldDraftExistingAndTest(field.uuid)).toBe(false);
  
      // Test public_date
      field.public_date = (new Date()).toISOString();
      await Helper.templateFieldUpdateAndTest(field);
      expect(await Helper.templateFieldDraftExistingAndTest(field.uuid)).toBe(true);
  
      await Helper.templateFieldDraftDeleteAndTest(field.uuid);
      expect(await Helper.templateFieldDraftExistingAndTest(field.uuid)).toBe(false);

      // Test type
      field.type = FieldTypes.File;
      await Helper.templateFieldUpdateAndTest(field);
      expect(await Helper.templateFieldDraftExistingAndTest(field.uuid)).toBe(true);
  
      await Helper.templateFieldDraftDeleteAndTest(field.uuid);
      expect(await Helper.templateFieldDraftExistingAndTest(field.uuid)).toBe(false);
    });
  
    test("radio options", async () => {
      let field = {
        name: "naruto",
        options: [{name: "genin"}]
      };
      field = await Helper.templateFieldCreatePersistTest(field);
  
      field.options = [];
      await Helper.templateFieldUpdateAndTest(field);
      expect(await Helper.templateFieldDraftExistingAndTest(field.uuid)).toBe(true);
  
      field.options = [{name: "shonin"}];
      await Helper.templateFieldUpdateAndTest(field);
      expect(await Helper.templateFieldDraftExistingAndTest(field.uuid)).toBe(true);
  
      field.options = [
        {
          name: "genin",
          options: [
            {
              name: "etwas"
            },
            {
              name: "anders"
            }
          ]
        }
      ];
      field = await Helper.templateFieldUpdatePersistTest(field);
  
      // No changes from last one, a draft shouldn't be created
      await Helper.templateFieldUpdateAndTest(field);
      expect(await Helper.templateFieldDraftExistingAndTest(field.uuid)).toBe(false);
  
    });
  });
  
});

describe("get draft", () => {
  test("Must have edit permission to fetch draft", async () => {
    let data = {
      name: "field",
      description: "",
      public_date: (new Date()).toISOString(),
    };
    let uuid = await Helper.templateFieldCreateAndTest(data);

    await Helper.createAgentRegisterLogin(Helper.EMAIL_2, Helper.DEF_PASSWORD);

    let response = await Helper.templateFieldDraftGet(uuid);
    expect(response.statusCode).toBe(401);    
  });
});

describe("persist (and get persisted and draft after a persist)", () => {

  test("Success", async () => {

    let field = {
      "name":"name"
    };
    await Helper.templateFieldCreatePersistTest(field);

  });

  describe("Failure cases", () => {
    
    test("Field with uuid does not exist", async () => {

      let data = {
        "name":"name"
      };
      let uuid = await Helper.templateFieldCreateAndTest(data);

      let last_update = await Helper.testAndExtract(Helper.templateFieldLastUpdate, uuid);

      response = await Helper.templateFieldPersist(Helper.VALID_UUID, last_update);
      expect(response.statusCode).toBe(404);

    });

    test("No changes to persist", async () => {
      let data = {
        "name":"name"
      };
      let uuid = await Helper.templateFieldCreateAndTest(data);

      let response = await Helper.templateFieldLastUpdate(uuid);
      expect(response.statusCode).toBe(200);
      let last_update = response.body;

      response = await Helper.templateFieldPersist(uuid, last_update);
      expect(response.statusCode).toBe(200);

      response = await Helper.templateFieldPersist(uuid, last_update);
      expect(response.statusCode).toBe(400);
    });

    test("Last update provided must match to actual last update in the database", async () => {
      let data = {
        "name":"basic template field"
      };
      let uuid = await Helper.templateFieldCreateAndTest(data);

      let response = await Helper.templateFieldPersist(uuid, (new Date()).toISOString());
      expect(response.statusCode).toBe(400);
    });

    test("Must have write permissions", async () => {
      let data = {
        "name":"name"
      };
      let uuid = await Helper.templateFieldCreateAndTest(data);

      let last_update = await Helper.testAndExtract(Helper.templateFieldLastUpdate, uuid);

      await Helper.createAgentRegisterLogin(Helper.EMAIL_2, Helper.DEF_PASSWORD);

      response = await Helper.templateFieldPersist(uuid, last_update);
      expect(response.statusCode).toBe(401);
    });

  })

  // test("Updating dependent templates", async () => {

  //   let field_data = {
  //     "name": "field"
  //   };
  //   let data = {
  //     "name":"basic template",
  //     "fields":[field_data]
  //   };
  //   let uuid = await Helper.templateFieldCreateAndTest(data, 'template');

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

  //   // Check that the field was also persisted
  //   field_data = response.body.fields[0];
  //   let field_uuid = field_data.uuid;
  //   response = await request(app)
  //     .get(`/template_field/${field_uuid}/latest_persisted`)
  //     .set('Accept', 'application/json');
  //   expect(response.statusCode).toBe(200);
  //   expect(response.body).toMatchObject(field_data);

  //   // Now update and persist the field
  //   field_data.description = "new descripiton";

  //   response = await request(app)
  //     .put(`/template_field/${field_uuid}`)
  //     .send(field_data)
  //     .set('Accept', 'application/json');
  //   expect(response.statusCode).toBe(200);

  //   response = await request(app)
  //     .get(`/template_field/${field_uuid}/last_update`);
  //   expect(response.statusCode).toBe(200);
  //   last_update = response.body;

  //   response = await request(app)
  //     .post(`/template_field/${field_uuid}/persist`)
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

describe("get latest persisted", () => {
  test("must exist", async () => {
    let response = await Helper.templateFieldLatestPersisted(Helper.VALID_UUID);
    expect(response.statusCode).toBe(404);
  });

  test("if public, anyone can get it", async () => {
    let data = {
      "name":"name",
      public_date: (new Date()).toISOString()
    };
    let uuid = await Helper.templateFieldCreateAndTest(data);

    let last_update = await Helper.testAndExtract(Helper.templateFieldLastUpdate, uuid);

    await Helper.testAndExtract(Helper.templateFieldPersist, uuid, last_update);

    await Helper.createAgentRegisterLogin(Helper.EMAIL_2, Helper.DEF_PASSWORD);
  
    // Second user without permissions should be able to view it because it's public
    response = await Helper.testAndExtract(Helper.templateFieldLatestPersisted, uuid);

    let agent2 = request.agent(app);
    Helper.setAgent(agent2);

    // non-users should also be able to view it if it's public
    response = await Helper.testAndExtract(Helper.templateFieldLatestPersisted, uuid);
  });

  test("if not public, only those with viewer access can get it", async () => {
    let data = {
      "name":"name"
    };
    let uuid = await Helper.templateFieldCreateAndTest(data);

    let last_update = await Helper.testAndExtract(Helper.templateFieldLastUpdate, uuid);

    await Helper.testAndExtract(Helper.templateFieldPersist, uuid, last_update);
  
    await Helper.createAgentRegisterLogin(Helper.EMAIL_2, Helper.DEF_PASSWORD);
  
    // Second user without permissions shouldn't be able to view it because it's private
    response = await Helper.templateFieldLatestPersisted(uuid);
    expect(response.statusCode).toBe(401);
  });
});

describe("get persisted for a certain date", () => {

  test("primary functionality", async () => {
    let data = {
      "name":"name",
      "description": "1"
    };
    let uuid = await Helper.templateFieldCreateAndTest(data);
  
    let beforeFirstPersist = new Date();
  
    // Test that if only a draft exists, it is not fetched
    
    let response = await Helper.templateFieldLatestPersistedBeforeDate(uuid, beforeFirstPersist.toISOString());
    expect(response.statusCode).toBe(404);
  
    let last_update = await Helper.testAndExtract(Helper.templateFieldLastUpdate, uuid);
  
    // Persist the first time
    response = await Helper.testAndExtract(Helper.templateFieldPersist, uuid, last_update);
  
    let afterFirstPersist = new Date();
  
    data.uuid = uuid;
    data.description = "2";
  
    await Helper.testAndExtract(Helper.templateFieldUpdate, uuid, data);
  
    last_update = await Helper.testAndExtract(Helper.templateFieldLastUpdate, uuid);
  
    await Helper.testAndExtract(Helper.templateFieldPersist, uuid, last_update);
  
    let afterSecondPersist = new Date();
  
    data.description = "3";
  
    await Helper.testAndExtract(Helper.templateFieldUpdate, uuid, data);
  
    last_update = await Helper.testAndExtract(Helper.templateFieldLastUpdate, uuid);
  
    await Helper.testAndExtract(Helper.templateFieldPersist, uuid, last_update);
  
    // Now there should be three persisted versions. Search for each based on the date
  
    let persisted_template = await Helper.testAndExtract(Helper.templateFieldLatestPersisted, uuid);
    expect(persisted_template.description).toEqual(expect.stringMatching("3"));
  
    persisted_template = await Helper.testAndExtract(Helper.templateFieldLatestPersistedBeforeDate, uuid, (new Date()).toISOString());
    expect(persisted_template.description).toEqual(expect.stringMatching("3"));
  
    persisted_template = await Helper.testAndExtract(Helper.templateFieldLatestPersistedBeforeDate, uuid, afterSecondPersist.toISOString());
    expect(persisted_template.description).toEqual(expect.stringMatching("2"));
  
    persisted_template = await Helper.testAndExtract(Helper.templateFieldLatestPersistedBeforeDate, uuid, afterFirstPersist.toISOString());
    expect(persisted_template.description).toEqual(expect.stringMatching("1"));
  
    response = await Helper.templateFieldLatestPersistedBeforeDate(uuid, beforeFirstPersist.toISOString());
    expect(response.statusCode).toBe(404);
  });

  test("timestamp must be in valid timestamp format", async () => {
    let field = {name: "hi"};
    field = await Helper.templateFieldCreatePersistTest(field);

    await Helper.testAndExtract(Helper.templateFieldLatestPersistedBeforeDate, field.uuid, (new Date()).toISOString());

    response = await Helper.templateFieldLatestPersistedBeforeDate(field.uuid, "invalid timestamp");
    expect(response.statusCode).toBe(400);
  });

});

describe("delete", () => {
  test("success", async () => {
    let data = {
      "name":"name",
      "description": "description"
    };
    let uuid = await Helper.templateFieldCreateAndTest(data);
  
    let last_update = await Helper.testAndExtract(Helper.templateFieldLastUpdate, uuid);

    await Helper.testAndExtract(Helper.templateFieldPersist, uuid, last_update);
  
    data.uuid = uuid;
    data.description = "different";
  
    // Change the draft, but don't persist the change
    response = await Helper.templateFieldUpdate(uuid, data);
    expect(response.statusCode).toBe(200);
  
    // Verify that the draft is what we changed it to
    response = await Helper.templateFieldDraftGet(uuid);
    expect(response.statusCode).toBe(200);
  
    // Delete the draft
    response = await Helper.templateFieldDraftDelete(uuid);
    expect(response.statusCode).toBe(200);
  
    // Get the draft again. Make sure it matches the latest persisted version
    response = await Helper.templateFieldDraftGet(uuid);
    expect(response.statusCode).toBe(200);
  
    data.description = "description";
    expect(response.body).toMatchObject(data);
  
  });

  test("if there are no persisted versions, permissions get deleted as well", async () => {
    let template_field = {
      name: "tf"
    };
    let uuid = await Helper.templateFieldCreateAndTest(template_field);

    let permission_group = await Helper.testAndExtract(Helper.getPermissionGroup, uuid, PermissionTypes.admin);
    expect(permission_group).toEqual([Helper.DEF_EMAIL]);

    let user_permissions = await Helper.testAndExtract(Helper.accountPermissions);
    expect(user_permissions.template_field.admin).toEqual([uuid]);
  
    
    await Helper.testAndExtract(Helper.templateFieldDraftDelete, uuid);
    
    response = await Helper.getPermissionGroup(uuid, PermissionTypes.admin);
    expect(response.statusCode).toBe(404);

    user_permissions = await Helper.testAndExtract(Helper.accountPermissions);
    expect(user_permissions.template_field.admin).toEqual([]);
  });

  test("draft must exist", async () => {
    let data = {
      "name":"name",
      "description": "description"
    };
    let uuid = await Helper.templateFieldCreateAndTest(data);
  
    let last_update = await Helper.testAndExtract(Helper.templateFieldLastUpdate, uuid);
  
    response = await Helper.templateFieldPersist(uuid, last_update);
    expect(response.statusCode).toBe(200);
   
    // Delete the draft
    response = await Helper.templateFieldDraftDelete(uuid);
    expect(response.statusCode).toBe(404);
  });

  test("must have edit permissions", async () => {
    let data = {
      "name":"name",
      "description": "description"
    };
    let uuid = await Helper.templateFieldCreateAndTest(data);
  
    let last_update = await Helper.testAndExtract(Helper.templateFieldLastUpdate, uuid);
  
    response = await Helper.templateFieldPersist(uuid, last_update);
    expect(response.statusCode).toBe(200);
  
    data.uuid = uuid;
    data.description = "different";
  
    // Change the draft, but don't persist the change
    response = await Helper.templateFieldUpdate(uuid, data);
    expect(response.statusCode).toBe(200);
  
    // Verify that the draft is what we changed it to
    response = await Helper.templateFieldDraftGet(uuid);
    expect(response.statusCode).toBe(200);

    await Helper.createAgentRegisterLogin(Helper.EMAIL_2, Helper.DEF_PASSWORD);
  
    // Delete the draft. Should fail since we dont' have permissions
    response = await Helper.templateFieldDraftDelete(uuid);
    expect(response.statusCode).toBe(401);
  });
});

describe("lastUpdate", () => {
  describe("success", () => {
    test("basic field draft", async () => {
      let timestamp = new Date();
      let data = {
        "name":"1"
      };
      let uuid = await Helper.templateFieldCreateAndTest(data);
  
      let response = await Helper.templateFieldLastUpdate(uuid);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(timestamp.getTime());
    });

    test("basic field persisted", async () => {
      let timestamp = new Date();
      let data = {
        "name":"1"
      };
      let template = await Helper.templateFieldCreatePersistTest(data);
  
      let last_update = await Helper.testAndExtract(Helper.templateFieldLastUpdate, template.uuid);
      expect((new Date(last_update)).getTime()).toBeGreaterThan(timestamp.getTime());
    });

    test("get latest update for that which the user has permission to", async () => {
      let time1 = new Date();
      let template = {
        "name":"1"
      };
      template = await Helper.templateFieldCreatePersistTest(template);
      template.description = "des";

      let time2 = new Date();

      let response = await Helper.templateFieldUpdate(template.uuid, template);
      expect(response.statusCode).toBe(200);

      let time3 = new Date();

      let agent2 = await Helper.createAgentRegisterLogin(Helper.EMAIL_2, Helper.DEF_PASSWORD);
      Helper.setAgent(agent1);

      let view_users = [Helper.EMAIL_2, Helper.DEF_EMAIL];
      response = await Helper.updatePermissionGroup(template.uuid, PermissionTypes.view, view_users);
      expect(response.statusCode).toBe(200);

      Helper.setAgent(agent2);
  
      let last_update = await Helper.testAndExtract(Helper.templateFieldLastUpdate, template.uuid);
      expect((new Date(last_update)).getTime()).toBeGreaterThan(time1.getTime());
      expect((new Date(last_update)).getTime()).toBeLessThan(time2.getTime());

      Helper.setAgent(agent1);

      last_update = await Helper.testAndExtract(Helper.templateFieldLastUpdate, template.uuid);
      expect((new Date(last_update)).getTime()).toBeGreaterThan(time2.getTime());
      expect((new Date(last_update)).getTime()).toBeLessThan(time3.getTime());
    });
  
  });

  describe("failure", () => {
    test("uuid must be valid", async () => {
      let response = await Helper.templateFieldLastUpdate("18");
      expect(response.statusCode).toBe(400);

      response = await Helper.templateFieldLastUpdate(Helper.VALID_UUID);
      expect(response.statusCode).toBe(404);
    });

    test("user must have edit or view permission", async () => {
      let data = {
        "name":"1"
      };
      let uuid = await Helper.templateFieldCreateAndTest(data);

      await Helper.createAgentRegisterLogin(Helper.EMAIL_2, Helper.DEF_PASSWORD);
  
      let response = await Helper.templateFieldLastUpdate(uuid);
      expect(response.statusCode).toBe(401);
    });
  });
})