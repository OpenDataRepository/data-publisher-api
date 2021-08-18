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
  response = await request(app)
    .get(`/template/${uuid}/latest_published`)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);
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
      // TODO: debug what is going wrong here. 
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

    // TODO: add a test where the linked record is pointing to an invalid template

  });
});

// TODO: When I test update, test that we do not allow the template uuid to change.