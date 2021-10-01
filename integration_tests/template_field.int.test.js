const request = require("supertest");
const MongoDB = require('../lib/mongoDB');
var { app, init: appInit } = require('../app');
var HelperClass = require('./common_test_operations')
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

const templateFieldCreate = async (data, current_user) => {
  return await request(app)
    .post(`/template_field`)
    .set('Cookie', [`user=${current_user}`])
    .send(data)
    .set('Accept', 'application/json');
};

const templateFieldUpdate = async (uuid, data, current_user) => {
  return await request(app)
    .put(`/template_field/${uuid}`)
    .set('Cookie', [`user=${current_user}`])
    .send(data)
    .set('Accept', 'application/json');
};

const templateFieldPublish = async (uuid, last_update, current_user) => {
  return await request(app)
  .post(`/template_field/${uuid}/publish`)
  .set('Cookie', [`user=${current_user}`])
  .send({last_update})
  .set('Accept', 'application/json');
};

const templateFieldLastUpdate = async (uuid, current_user) => {
  return await request(app)
  .get(`/template_field/${uuid}/last_update`)
  .set('Cookie', [`user=${current_user}`]);
};

const templateFieldLatestPublished = async (uuid, current_user) => {
  return await request(app)
  .get(`/template_field/${uuid}/latest_published`)
  .set('Cookie', [`user=${current_user}`]);
};

const templateFieldLatestPublishedBeforeDate = async (uuid, timestamp, current_user) => {
  return await request(app)
    .get(`/template_field/${uuid}/${timestamp}`)
    .set('Cookie', [`user=${current_user}`]);
};

const templateFieldDraftDelete = async (uuid, current_user) => {
  return await request(app)
    .delete(`/template_field/${uuid}/draft`)
    .set('Cookie', [`user=${current_user}`]);
};

const createSuccessTest = async (data, current_user) => {
  let response = await templateFieldCreate(data, current_user)
  expect(response.statusCode).toBe(200);
  expect(response.body.inserted_uuid).toBeTruthy();

  response = await Helper.templateFieldDraftGet(response.body.inserted_uuid, current_user);
  expect(response.statusCode).toBe(200);
  expect(response.body).toMatchObject(data);
  return response.body.uuid;
};

describe("create (and get draft after a create)", () => {
  test("Success", async () => {
    let data = {
      name: "field",
      description: "",
      public_date: (new Date()).toISOString(),
    };
    let uuid = await createSuccessTest(data, Helper.DEF_CURR_USER);

    // Now test that all permission groups were created successfully
    await Helper.testPermissionGroupsInitializedFor(uuid, Helper.DEF_CURR_USER);

  });

  describe("failure cases", () => {

    const failureTest = async (data, responseCode) => {
      let response = await templateFieldCreate(data, Helper.DEF_CURR_USER);
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

  });

});

describe("update (and get draft after an update)", () => {

  let uuid;

  beforeEach(async() => {
    let data = { 
      "name": "field",
      "description": "description"
    };
    uuid = await createSuccessTest(data, Helper.DEF_CURR_USER);
  });

  test("Success", async () => {

    let data = { 
      "uuid": uuid,
      "name": "different name",
      public_date: (new Date()).toISOString()
    };

    let response = await templateFieldUpdate(uuid, data, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
  
    response = await Helper.templateFieldDraftGet(uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject(data);

  });

  describe("Failure cases", () => {

    test("uuid in request and in object must match", async () => {

      let data = { 
        "name": "name"
      };

      let response = await templateFieldUpdate(uuid, data, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

    })

    test("uuid must exist", async () => {

      let data = { 
        "uuid": Helper.VALID_UUID,
        "name": "name"
      };

      let response = await templateFieldUpdate(Helper.VALID_UUID, data, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(404);

    })

    test("user must have edit permissions", async () => {

      let data = { 
        "uuid": uuid,
        "name": "different name"
      };
  
      let response = await templateFieldUpdate(uuid, data);
      expect(response.statusCode).toBe(401);
    })
  })
  
});

describe("get draft", () => {
  test("Must have edit permission to fetch draft", async () => {
    let data = {
      name: "field",
      description: "",
      public_date: (new Date()).toISOString(),
    };
    let uuid = await createSuccessTest(data, Helper.DEF_CURR_USER);

    let response = await Helper.templateFieldDraftGet(uuid);
    expect(response.statusCode).toBe(401);    
  });
});

describe("publish (and get published and draft after a publish)", () => {

  test("Success", async () => {

    let data = {
      "name":"name"
    };
    let uuid = await createSuccessTest(data, Helper.DEF_CURR_USER);

    let response = await templateFieldLastUpdate(uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
    let last_update = response.body;

    response = await templateFieldPublish(uuid, last_update, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
  
    // Check that a published version now exists
    response = await templateFieldLatestPublished(uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject(data);
    expect(response.body).toHaveProperty("publish_date");

    // Check that we can still get a draft version
    response = await Helper.templateFieldDraftGet(uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject(data);

  });

  describe("Failure cases", () => {
    
    test("Field with uuid does not exist", async () => {

      let data = {
        "name":"name"
      };
      let uuid = await createSuccessTest(data, Helper.DEF_CURR_USER);

      let response = await templateFieldLastUpdate(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let last_update = response.body;

      response = await templateFieldPublish(Helper.VALID_UUID, last_update, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(404);

    });

    test("No changes to publish", async () => {
      let data = {
        "name":"name"
      };
      let uuid = await createSuccessTest(data, Helper.DEF_CURR_USER);

      let response = await templateFieldLastUpdate(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let last_update = response.body;

      response = await templateFieldPublish(uuid, last_update, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);

      response = await templateFieldPublish(uuid, last_update, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);
    });

    test("Last update provided must match to actual last update in the database", async () => {
      let data = {
        "name":"basic template field"
      };
      let uuid = await createSuccessTest(data, Helper.DEF_CURR_USER);

      let response = await templateFieldPublish(uuid, (new Date()).toISOString(), Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);
    });

    test("Must have write permissions", async () => {
      let data = {
        "name":"name"
      };
      let uuid = await createSuccessTest(data, Helper.DEF_CURR_USER);

      let response = await templateFieldLastUpdate(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let last_update = response.body;

      response = await templateFieldPublish(uuid, last_update, 'other');
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
  //   let uuid = await createSuccessTest(data, 'template');

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

  //   // Check that the field was also published
  //   field_data = response.body.fields[0];
  //   let field_uuid = field_data.uuid;
  //   response = await request(app)
  //     .get(`/template_field/${field_uuid}/latest_published`)
  //     .set('Accept', 'application/json');
  //   expect(response.statusCode).toBe(200);
  //   expect(response.body).toMatchObject(field_data);

  //   // Now update and publish the field
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
  //     .post(`/template_field/${field_uuid}/publish`)
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

describe("get latest published", () => {
  test("must exist", async () => {
    let response = await templateFieldLatestPublished(Helper.VALID_UUID, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(404);
  });

  test("if public, anyone can get it", async () => {
    let data = {
      "name":"name",
      public_date: (new Date()).toISOString()
    };
    let uuid = await createSuccessTest(data, Helper.DEF_CURR_USER);

    let response = await templateFieldLastUpdate(uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
    let last_update = response.body;

    response = await templateFieldPublish(uuid, last_update, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
  
    // Check that a published version now exists
    response = await templateFieldLatestPublished(uuid);
    expect(response.statusCode).toBe(200);
  });

  test("if not public, only those with viewer access can get it", async () => {
    let data = {
      "name":"name"
    };
    let uuid = await createSuccessTest(data, Helper.DEF_CURR_USER);

    let response = await templateFieldLastUpdate(uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
    let last_update = response.body;

    response = await templateFieldPublish(uuid, last_update, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
  
    // Check that a published version now exists
    response = await templateFieldLatestPublished(uuid);
    expect(response.statusCode).toBe(401);
  });
});

test("get published for a certain date", async () => {
  let data = {
    "name":"name",
    "description": "1"
  };
  let uuid = await createSuccessTest(data, Helper.DEF_CURR_USER);

  let beforeFirstPublish = new Date();

  // Test that if only a draft exists, it is not fetched
  
  let response = await templateFieldLatestPublishedBeforeDate(uuid, beforeFirstPublish.toISOString(), Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(404);

  response = await templateFieldLastUpdate(uuid, Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(200);
  let last_update = response.body;

  // Publish the first time
  response = await templateFieldPublish(uuid, last_update, Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(200);

  let afterFirstPublish = new Date();

  data.uuid = uuid;
  data.description = "2";

  response = await templateFieldUpdate(uuid, data, Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(200);

  response = await templateFieldLastUpdate(uuid, Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(200);
  last_update = response.body;

  response = await templateFieldPublish(uuid, last_update, Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(200);

  let afterSecondPublish = new Date();

  data.description = "3";

  response = await templateFieldUpdate(uuid, data, Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(200);

  response = await templateFieldLastUpdate(uuid, Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(200);
  last_update = response.body;

  response = await templateFieldPublish(uuid, last_update, Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(200);

  // Now there should be three published versions. Search for each based on the date

  response = await templateFieldLatestPublished(uuid, Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(200);
  expect(response.body.description).toEqual(expect.stringMatching("3"));

  response = await templateFieldLatestPublishedBeforeDate(uuid, (new Date()).toISOString(), Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(200);
  expect(response.body.description).toEqual(expect.stringMatching("3"));

  response = await templateFieldLatestPublishedBeforeDate(uuid, afterSecondPublish.toISOString(), Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(200);
  expect(response.body.description).toEqual(expect.stringMatching("2"));

  response = await templateFieldLatestPublishedBeforeDate(uuid, afterFirstPublish.toISOString(), Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(200);
  expect(response.body.description).toEqual(expect.stringMatching("1"));

  response = await templateFieldLatestPublishedBeforeDate(uuid, beforeFirstPublish.toISOString(), Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(404);
});

describe("delete", () => {
  test("success", async () => {
    let data = {
      "name":"name",
      "description": "description"
    };
    let uuid = await createSuccessTest(data, Helper.DEF_CURR_USER);
  
    let response = await templateFieldLastUpdate(uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
    let last_update = response.body;
  
    response = await templateFieldPublish(uuid, last_update, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
  
    data.uuid = uuid;
    data.description = "different";
  
    // Change the draft, but don't publish the change
    response = await templateFieldUpdate(uuid, data, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
  
    // Verify that the draft is what we changed it to
    response = await Helper.templateFieldDraftGet(uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
  
    // Delete the draft
    response = await templateFieldDraftDelete(uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
  
    // Get the draft again. Make sure it matches the latest published version
    response = await Helper.templateFieldDraftGet(uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
  
    data.description = "description";
    expect(response.body).toMatchObject(data);
  
  });

  test("draft must exist", async () => {
    let data = {
      "name":"name",
      "description": "description"
    };
    let uuid = await createSuccessTest(data, Helper.DEF_CURR_USER);
  
    let response = await templateFieldLastUpdate(uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
    let last_update = response.body;
  
    response = await templateFieldPublish(uuid, last_update, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
   
    // Delete the draft
    response = await templateFieldDraftDelete(uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(404);
  });

  test("must have edit permissions", async () => {
    let data = {
      "name":"name",
      "description": "description"
    };
    let uuid = await createSuccessTest(data, Helper.DEF_CURR_USER);
  
    let response = await templateFieldLastUpdate(uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
    let last_update = response.body;
  
    response = await templateFieldPublish(uuid, last_update, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
  
    data.uuid = uuid;
    data.description = "different";
  
    // Change the draft, but don't publish the change
    response = await templateFieldUpdate(uuid, data, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
  
    // Verify that the draft is what we changed it to
    response = await Helper.templateFieldDraftGet(uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
  
    // Delete the draft
    response = await templateFieldDraftDelete(uuid);
    expect(response.statusCode).toBe(401);
  });
});

describe("lastUpdate", () => {

  test("success", async () => {
    let timestamp = new Date();
    let data = {
      "name":"1"
    };
    let uuid = await createSuccessTest(data, Helper.DEF_CURR_USER);

    let response = await templateFieldLastUpdate(uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
    expect((new Date(response.body)).getTime()).toBeGreaterThan(timestamp.getTime());
  });


  describe("failure", () => {
    test("uuid must be valid", async () => {
      let response = await templateFieldLastUpdate("18", Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

      response = await templateFieldLastUpdate(Helper.VALID_UUID, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(404);
    })

    test("user must have permission", async () => {
      let timestamp = new Date();
      let data = {
        "name":"1"
      };
      let uuid = await createSuccessTest(data, Helper.DEF_CURR_USER);
  
      let response = await templateFieldLastUpdate(uuid, "other");
      expect(response.statusCode).toBe(401);
    })
  });
})