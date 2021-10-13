const request = require("supertest");
const MongoDB = require('../lib/mongoDB');
var { PERMISSION_ADMIN, PERMISSION_EDIT, PERMISSION_VIEW } = require('../models/permission_group');
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

async function permissionGroupTestingInitialize(uuid, current_user) {
  return await request(app)
    .post(`/permission_group/${uuid}/testing_initialize`)
    .set('Cookie', [`user=${current_user}`])
    //.send({current_user})
    .set('Accept', 'application/json');
}

describe("create (and get)",  () => {
  test("success", async () => {
    let uuid = await Helper.templateCreateAndTest({name: 'template'}, Helper.DEF_CURR_USER);

    response = await Helper.getPermissionGroup(uuid, PERMISSION_ADMIN);
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual([Helper.DEF_CURR_USER]);

    response = await Helper.getPermissionGroup(uuid, PERMISSION_EDIT);
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual([Helper.DEF_CURR_USER]);

    response = await Helper.getPermissionGroup(uuid, PERMISSION_VIEW);
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual([Helper.DEF_CURR_USER]);
  })
  test("invalid uuid", async () => {
    let response = await permissionGroupTestingInitialize("abc", Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(404);
  });
  // TODO: when users are implemented, test that create can only happen with a valid user in the current session

});

describe("update (and get)",  () => {
  test("success - can update in every category", async () => {
    let uuid = await Helper.templateCreateAndTest({
      name: 'template'
    });
    let response = await permissionGroupTestingInitialize(uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);

    // Test we can change view, edit, and admin if we are in the admin group

    let view_users = ['a', 'b', Helper.DEF_CURR_USER];
    let edit_users = ['c', Helper.DEF_CURR_USER];
    let admin_users = [Helper.DEF_CURR_USER, 'd', 'd'];

    response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, uuid, PERMISSION_VIEW, view_users);
    expect(response.statusCode).toBe(200);
    response = await Helper.getPermissionGroup(uuid, PERMISSION_VIEW);
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(view_users);

    response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, uuid, PERMISSION_EDIT, edit_users);
    expect(response.statusCode).toBe(200);
    response = await Helper.getPermissionGroup(uuid, PERMISSION_EDIT);
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(edit_users);

    response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, uuid, PERMISSION_ADMIN, admin_users);
    expect(response.statusCode).toBe(200);
    response = await Helper.getPermissionGroup(uuid, PERMISSION_ADMIN);
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(admin_users);

  });

  test("must be in the admin category to update permissions", async () => {
    let uuid = await Helper.templateCreateAndTest({
      name: 'template'
    });
    let response = await permissionGroupTestingInitialize(uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);

    let view_users = ['a', 'b', Helper.DEF_CURR_USER];
    response = await Helper.updatePermissionGroup('a', uuid, "view", view_users);
    expect(response.statusCode).toBe(401);
  });

  test("current user must be in updated permissions list", async () => {
    let uuid = await Helper.templateCreateAndTest({
      name: 'template'
    });
    let response = await permissionGroupTestingInitialize(uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);

    let view_users = ['a', 'b', 'c'];
    response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, uuid, "view", view_users);
    expect(response.statusCode).toBe(400);

  });

  test("must be a supported category", async () => {
    let uuid = await Helper.templateCreateAndTest({
      name: 'template'
    });
    let response = await permissionGroupTestingInitialize(uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);

    let view_users = ['a', 'b', Helper.DEF_CURR_USER];
    response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, uuid, "invalid", view_users);
    expect(response.statusCode).toBe(404);

  });

});

describe("get",  () => {
  test("must be a supported category", async () => {
    let uuid = await Helper.templateCreateAndTest({
      name: 'template'
    });
    let response = await permissionGroupTestingInitialize(uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);

    response = await Helper.getPermissionGroup(uuid, 'invalid');
    expect(response.statusCode).toBe(404);

  });
});