const request = require("supertest");
var { PERMISSION_ADMIN, PERMISSION_EDIT, PERMISSION_VIEW } = require('../models/permission_group');
var { app, init: appInit, close: appClose } = require('../app');
var HelperClass = require('./common_test_operations');
var Helper = new HelperClass(app);

beforeAll(async () => {
  await appInit();
});

beforeEach(async() => {
  await Helper.clearDatabase();
});

afterAll(async () => {
  await Helper.clearDatabase();
  await appClose();
});

describe("initialize_permissions (and get)",  () => {
  test("success", async () => {
    let uuid = Helper.VALID_UUID;
    let response = await Helper.permissionGroupTestingInitialize(uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);

    response = await Helper.getPermissionGroup(uuid, PERMISSION_ADMIN);
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual([Helper.DEF_CURR_USER]);

    response = await Helper.getPermissionGroup(uuid, PERMISSION_EDIT);
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual([]);

    response = await Helper.getPermissionGroup(uuid, PERMISSION_VIEW);
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual([]);

    response = await Helper.permissionGroupTestingHasPermission(uuid, PERMISSION_ADMIN, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(true);

    response = await Helper.permissionGroupTestingHasPermission(uuid, PERMISSION_ADMIN, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(true);

    response = await Helper.permissionGroupTestingHasPermission(uuid, PERMISSION_ADMIN, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(true);
  })
  test("invalid uuid", async () => {
    let response = await Helper.permissionGroupTestingInitialize("abc", Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(400);

  });
  // TODO: when users are implemented, test that create can only happen with a valid user in the current session

});

describe("has_permission", () => {
  test("admin also has edit and view permissions", async () => {
    let response = await Helper.permissionGroupTestingInitialize(Helper.VALID_UUID, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);

    response = await Helper.permissionGroupTestingHasPermission(Helper.VALID_UUID, PERMISSION_ADMIN, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(true);
  });
});

describe("update (and get)",  () => {
  test("success - can update in every category", async () => {
    let uuid = Helper.VALID_UUID;
    let response = await Helper.permissionGroupTestingInitialize(uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);

    // Test we can change view, edit, and admin if we are in the admin group

    let view_users = ['d'];
    let edit_users = ['c'];
    let admin_users = [Helper.DEF_CURR_USER, 'b'];

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
    let response = await Helper.permissionGroupTestingInitialize(Helper.VALID_UUID, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);

    let view_users = ['a', 'b', Helper.DEF_CURR_USER];
    response = await Helper.updatePermissionGroup('a', Helper.VALID_UUID, "view", view_users);
    expect(response.statusCode).toBe(401);
  });

  test("if admin, current user must be in updated permissions list", async () => {
    let response = await Helper.permissionGroupTestingInitialize(Helper.VALID_UUID, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);

    let view_users = ['a', 'b', 'c'];
    response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, Helper.VALID_UUID, PERMISSION_ADMIN, view_users);
    expect(response.statusCode).toBe(400);

  });

  test("must be a supported category", async () => {
    let response = await Helper.permissionGroupTestingInitialize(Helper.VALID_UUID, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);

    let view_users = ['a', 'b', Helper.DEF_CURR_USER];
    response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, Helper.VALID_UUID, "invalid", view_users);
    expect(response.statusCode).toBe(404);

  });

  test("cannot delete users from template view category", async () => {
    let template = {
      name: "t1"
    }
    template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

    let view_users = ['a', 'b', Helper.DEF_CURR_USER];
    let response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, template.uuid, PERMISSION_VIEW, view_users);
    expect(response.statusCode).toBe(200);
    response = await Helper.getPermissionGroup(template.uuid, PERMISSION_VIEW);
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(view_users);

    view_users = ['b', Helper.DEF_CURR_USER];
    response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, template.uuid, PERMISSION_VIEW, view_users);
    expect(response.statusCode).toBe(400);

  });

  test("any user deleted from template admin or edit is added to template view", async () => {
    let template = {
      name: "t1"
    }
    template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

    let users = ['a', 'b', Helper.DEF_CURR_USER];
    let response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, template.uuid, PERMISSION_EDIT, users);
    expect(response.statusCode).toBe(200);
    response = await Helper.getPermissionGroup(template.uuid, PERMISSION_EDIT);
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(users);

    users = ['b', Helper.DEF_CURR_USER];
    response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, template.uuid, PERMISSION_EDIT, users);
    expect(response.statusCode).toBe(200);
    response = await Helper.getPermissionGroup(template.uuid, PERMISSION_EDIT);
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(users);
    response = await Helper.getPermissionGroup(template.uuid, PERMISSION_VIEW);
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(['a']);
  });

  test("cannot add users to dataset permissions unless they have template view permission", async () => {
    let template = {
      name: "t1"
    }
    template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

    let dataset = {
      template_id: template._id
    }
    dataset = await Helper.datasetCreatePersistTest(dataset, Helper.DEF_CURR_USER);

    let view_users = ['a', Helper.DEF_CURR_USER];
    let response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, dataset.uuid, PERMISSION_VIEW, view_users);
    expect(response.statusCode).toBe(400);

    response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, template.uuid, PERMISSION_VIEW, view_users);
    expect(response.statusCode).toBe(200);

    response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, dataset.uuid, PERMISSION_VIEW, view_users);
    expect(response.statusCode).toBe(200);

    response = await Helper.getPermissionGroup(dataset.uuid, PERMISSION_VIEW);
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(view_users);

  });

});

describe("get",  () => {
  test("must be a supported category", async () => {
    let template = await Helper.templateCreateAndTest({
      name: 'template'
    });
    let response = await Helper.permissionGroupTestingInitialize(template.uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);

    response = await Helper.getPermissionGroup(template.uuid, 'invalid');
    expect(response.statusCode).toBe(404);

  });
});