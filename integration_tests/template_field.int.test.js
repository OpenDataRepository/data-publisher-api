const request = require("supertest");
const MongoDB = require('../lib/mongoDB');
var { app, init: appInit } = require('../app');

const ValidUUID = "47356e57-eec2-431b-8059-f61d5f9a6bc6";

beforeAll(async () => {
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
});

const createSuccessTest = async (data, templateOrField) => {
  if (!templateOrField) {
    templateOrField = 'template_field';
  }
  let response = await request(app)
    .post(`/${templateOrField}`)
    .send(data)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);
  expect(response.body.inserted_uuid).toBeTruthy();

  response = await request(app)
    .get(`/${templateOrField}/${response.body.inserted_uuid}/draft`)
    .set('Accept', 'application/json');

  expect(response.statusCode).toBe(200);
  expect(response.body).toMatchObject(data);
  return response.body.uuid;
};

describe("create (and get draft after a create)", () => {
  test("Success", async () => {

    let data = {
      "name":"field",
      "description":""
    };
    await createSuccessTest(data);

  });

  describe("failure cases", () => {

    const failureTest = async (data, responseCode) => {
      let response = await request(app)
        .post('/template_field')
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

  });

});

describe("update (and get draft after an update)", () => {

  let uuid;

  beforeEach(async() => {
    let data = { 
      "name": "field",
      "description": "description"
    };
    uuid = await createSuccessTest(data);
  });

  test("Success", async () => {

    let data = { 
      "uuid": uuid,
      "name": "different name"
    };

    let response = await request(app)
      .put(`/template_field/${uuid}`)
      .send(data)
      .set('Accept', 'application/json');
    expect(response.statusCode).toBe(200);
  
    response = await request(app)
      .get(`/template_field/${uuid}/draft`)
      .set('Accept', 'application/json');
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject(data);

  });

  describe("Failure cases", () => {

    test("uuid in request and in object must match", async () => {

      let data = { 
        "name": "name"
      };

      let response = await request(app)
        .put(`/template_field/${uuid}`)
        .send(data)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(400);

    })

    test("uuid must exist", async () => {

      let data = { 
        "uuid": ValidUUID,
        "name": "name"
      };

      let response = await request(app)
        .put(`/template_field/${ValidUUID}`)
        .send(data)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(404);

    })
  })
  
});

describe("publish (and get published and draft after a publish)", () => {

  test("Success", async () => {

    let data = {
      "name":"name",
      "description":""
    };
    let uuid = await createSuccessTest(data);

    let response = await request(app)
      .post(`/template_field/${uuid}/publish`)
      .set('Accept', 'application/json');
    expect(response.statusCode).toBe(200);
  
    // Check that a published version now exists
    response = await request(app)
      .get(`/template_field/${uuid}/latest_published`)
      .set('Accept', 'application/json');
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject(data);
    expect(response.body).toHaveProperty("publish_date");


    // Check that we can still get a draft version
    response = await request(app)
      .get(`/template_field/${uuid}/draft`)
      .set('Accept', 'application/json');
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject(data);

  });

  describe("Failure cases", () => {
    
    test("Field with uuid does not exist", async () => {

      let data = {
        "name":"name"
      };
      await createSuccessTest(data);

      let response = await request(app)
        .post(`/template_field/${ValidUUID}/publish`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(404);

    });

    test("No changes to publish", async () => {
      let data = {
        "name":"name"
      };
      let uuid = await createSuccessTest(data);

      let response = await request(app)
        .post(`/template_field/${uuid}/publish`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(200);

      response = await request(app)
        .post(`/template_field/${uuid}/publish`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(400);
    });

  })

  test("Updating dependent templates", async () => {

    let field_data = {
      "name": "field"
    };
    let data = {
      "name":"basic template",
      "fields":[field_data]
    };
    let uuid = await createSuccessTest(data, 'template');

    let response = await request(app)
      .get(`/template/${uuid}/last_update`);
    expect(response.statusCode).toBe(200);
    let last_update = response.body;

    response = await request(app)
      .post(`/template/${uuid}/publish`)
      .send({last_update})
      .set('Accept', 'application/json');
    expect(response.statusCode).toBe(200);
  
    // Check that a published version now exists
    response = await request(app)
      .get(`/template/${uuid}/latest_published`)
      .set('Accept', 'application/json');
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject(data);

    // Check that the field was also published
    field_data = response.body.fields[0];
    let field_uuid = field_data.uuid;
    response = await request(app)
      .get(`/template_field/${field_uuid}/latest_published`)
      .set('Accept', 'application/json');
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject(field_data);

    // Now update and publish the field
    field_data.description = "new descripiton";

    response = await request(app)
      .put(`/template_field/${field_uuid}`)
      .send(field_data)
      .set('Accept', 'application/json');
    expect(response.statusCode).toBe(200);

    response = await request(app)
      .post(`/template_field/${field_uuid}/publish`)
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
    "name":"name",
    "description": "1"
  };
  let uuid = await createSuccessTest(data);

  let beforeFirstPublish = new Date();

  // Test that if only a draft exists, it is not fetched
  let response = await request(app)
    .get(`/template_field/${uuid}/${beforeFirstPublish.toISOString()}`)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(404);

  // Publish the first time
  response = await request(app)
    .post(`/template_field/${uuid}/publish`)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);

  let afterFirstPublish = new Date();

  data.uuid = uuid;
  data.description = "2";

  response = await request(app)
    .put(`/template_field/${uuid}`)
    .send(data)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);

  response = await request(app)
    .post(`/template_field/${uuid}/publish`)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);

  let afterSecondPublish = new Date();

  data.description = "3";

  response = await request(app)
    .put(`/template_field/${uuid}`)
    .send(data)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);

  response = await request(app)
    .post(`/template_field/${uuid}/publish`)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);

  // Now there should be three published versions. Search for each based on the date

  response = await request(app)
    .get(`/template_field/${uuid}/latest_published`)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);
  expect(response.body.description).toEqual(expect.stringMatching("3"));

  response = await request(app)
    .get(`/template_field/${uuid}/${(new Date()).toISOString()}`)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);
  expect(response.body.description).toEqual(expect.stringMatching("3"));

  response = await request(app)
    .get(`/template_field/${uuid}/${afterSecondPublish.toISOString()}`)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);
  expect(response.body.description).toEqual(expect.stringMatching("2"));

  response = await request(app)
    .get(`/template_field/${uuid}/${afterFirstPublish.toISOString()}`)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);
  expect(response.body.description).toEqual(expect.stringMatching("1"));

  response = await request(app)
    .get(`/template_field/${uuid}/${beforeFirstPublish.toISOString()}`)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(404);
});

test("delete a draft, not a published version", async () => {
  let data = {
    "name":"name",
    "description": "description"
  };
  let uuid = await createSuccessTest(data);

  let response = await request(app)
    .post(`/template_field/${uuid}/publish`)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);

  data.uuid = uuid;
  data.description = "different";

  // Change the draft, but don't publish the change
  response = await request(app)
    .put(`/template_field/${uuid}`)
    .send(data)
  expect(response.statusCode).toBe(200);

  // Verify that the draft is what we changed it to
  response = await request(app)
    .get(`/template_field/${uuid}/draft`)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);

  // Delete the draft
  response = await request(app)
    .delete(`/template_field/${uuid}/draft`)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);

  // Get the draft again. Make sure it matches the latest published version
  response = await request(app)
    .get(`/template_field/${uuid}/latest_published`)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);

  data.description = "description";
  expect(response.body).toMatchObject(data);

});

describe("lastUpdate", () => {

  test("success", async () => {
    let timestamp = new Date();
    let data = {
      "name":"1"
    };
    let uuid = await createSuccessTest(data);

    let response = await request(app)
      .get(`/template_field/${uuid}/last_update`);
    expect(response.statusCode).toBe(200);
    expect((new Date(response.body)).getTime()).toBeGreaterThan(timestamp.getTime());
  });


  describe("failure", () => {
    test("invalid uuid", async () => {
      let response = await request(app)
        .get(`/template_field/18/last_update`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(400);

      response = await request(app)
        .get(`/template_field/${ValidUUID}/last_update`)
        .set('Accept', 'application/json');
      expect(response.statusCode).toBe(404);
    })
  });
})