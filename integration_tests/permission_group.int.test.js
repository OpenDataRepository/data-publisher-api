const request = require("supertest");
const MongoDB = require('../lib/mongoDB');
var { app, init: appInit } = require('../app');
var HelperClass = require('./common_test_operations')
var Helper = new HelperClass(app);

const ValidUUID = "47356e57-eec2-431b-8059-f61d5f9a6bc6";
const default_current_user = 'caleb';

beforeAll(async () => {
  await appInit();
});

async function clearDatabase() {
  let db = MongoDB.db();
  await db.collection('templates').deleteMany();
  // await db.collection('template_fields').deleteMany();
  // await db.collection('records').deleteMany();
  await db.collection('permission_groups').deleteMany();
}

beforeEach(async() => {
  await clearDatabase();
});

afterAll(async () => {
  await clearDatabase();
  await MongoDB.close();
});

async function permissionGroupTestingInitialize(uuid, current_user) {
  return await request(app)
    .post(`/permission_group/${uuid}/testing_initialize`)
    .send({current_user})
    .set('Accept', 'application/json');
}

async function getPermissionGroup(uuid, category) {
  return await request(app)
    .get(`/permission_group/${uuid}/${category}`)
    .set('Accept', 'application/json');
}

async function updatePermissionGroup(current_user, uuid, category, users) {
  return await request(app)
    .put(`/permission_group/${uuid}/${category}`)
    .send({current_user, users})
    .set('Accept', 'application/json');
}

describe("create (and get)",  () => {
  test("success", async () => {
    let uuid = await Helper.templateCreate({
      name: 'template'
    });
    let response = await permissionGroupTestingInitialize(uuid, default_current_user);
    expect(response.statusCode).toBe(200);

    response = await getPermissionGroup(uuid, 'admin');
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual([default_current_user]);

    response = await getPermissionGroup(uuid, 'edit');
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual([default_current_user]);

    response = await getPermissionGroup(uuid, 'view');
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual([default_current_user]);
  })
  test("invalid uuid", async () => {
    let response = await permissionGroupTestingInitialize("abc", default_current_user);
    expect(response.statusCode).toBe(404);
  });

});

describe("update (and get)",  () => {
  test("success - can update in every category", async () => {
    let uuid = await Helper.templateCreate({
      name: 'template'
    });
    let response = await permissionGroupTestingInitialize(uuid, default_current_user);
    expect(response.statusCode).toBe(200);

    // Test we can change view, edit, and admin if we are in the admin group

    let view_users = ['a', 'b', default_current_user];
    let edit_users = ['c', default_current_user];
    let admin_users = [default_current_user, 'd', 'd'];

    response = await updatePermissionGroup(default_current_user, uuid, "view", view_users);
    expect(response.statusCode).toBe(200);
    response = await getPermissionGroup(uuid, 'view');
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(view_users);

    response = await updatePermissionGroup(default_current_user, uuid, "edit", edit_users);
    expect(response.statusCode).toBe(200);
    response = await getPermissionGroup(uuid, 'edit');
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(edit_users);

    response = await updatePermissionGroup(default_current_user, uuid, "admin", admin_users);
    expect(response.statusCode).toBe(200);
    response = await getPermissionGroup(uuid, 'admin');
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(admin_users);

  });

  test("must be in the admin category to update permissions", async () => {
    let uuid = await Helper.templateCreate({
      name: 'template'
    });
    let response = await permissionGroupTestingInitialize(uuid, default_current_user);
    expect(response.statusCode).toBe(200);

    let view_users = ['a', 'b', default_current_user];
    response = await updatePermissionGroup('a', uuid, "view", view_users);
    expect(response.statusCode).toBe(400);
  });

  test("current user must be in updated permissions list", async () => {
    let uuid = await Helper.templateCreate({
      name: 'template'
    });
    let response = await permissionGroupTestingInitialize(uuid, default_current_user);
    expect(response.statusCode).toBe(200);

    let view_users = ['a', 'b', 'c'];
    response = await updatePermissionGroup(default_current_user, uuid, "view", view_users);
    expect(response.statusCode).toBe(400);

  });

  test("must be a supported category", async () => {
    let uuid = await Helper.templateCreate({
      name: 'template'
    });
    let response = await permissionGroupTestingInitialize(uuid, default_current_user);
    expect(response.statusCode).toBe(200);

    let view_users = ['a', 'b', default_current_user];
    response = await updatePermissionGroup(default_current_user, uuid, "invalid", view_users);
    expect(response.statusCode).toBe(404);

  });

});

describe("get",  () => {
  test("must be a supported category", async () => {
    let uuid = await Helper.templateCreate({
      name: 'template'
    });
    let response = await permissionGroupTestingInitialize(uuid, default_current_user);
    expect(response.statusCode).toBe(200);

    response = await getPermissionGroup(uuid, 'invalid');
    expect(response.statusCode).toBe(404);

  });
});