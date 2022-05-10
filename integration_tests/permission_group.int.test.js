var { PERMISSION_ADMIN, PERMISSION_EDIT, PERMISSION_VIEW } = require('../models/permission_group');
var { app, init: appInit, close: appClose } = require('../app');
var HelperClass = require('./common_test_operations');
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

describe("initialize_permissions (and get)",  () => {
  test("success", async () => {
    let uuid = Helper.VALID_UUID;
    await Helper.testAndExtract(Helper.permissionGroupTestingInitialize, uuid);

    let permission_group = await Helper.testAndExtract(Helper.getPermissionGroup, uuid, PERMISSION_ADMIN);
    expect(permission_group).toEqual([Helper.DEF_EMAIL]);

    permission_group = await Helper.testAndExtract(Helper.getPermissionGroup, uuid, PERMISSION_EDIT);
    expect(permission_group).toEqual([]);

    permission_group = await Helper.testAndExtract(Helper.getPermissionGroup, uuid, PERMISSION_VIEW);
    expect(permission_group).toEqual([]);

    let has_permission = await Helper.testAndExtract(Helper.permissionGroupTestingHasPermission, uuid, PERMISSION_ADMIN);
    expect(has_permission).toBe(true);

    has_permission = await Helper.testAndExtract(Helper.permissionGroupTestingHasPermission, uuid, PERMISSION_ADMIN);
    expect(has_permission).toBe(true);

    has_permission = await Helper.testAndExtract(Helper.permissionGroupTestingHasPermission, uuid, PERMISSION_ADMIN);
    expect(has_permission).toBe(true);
  })
  test("invalid uuid", async () => {
    let response = await Helper.permissionGroupTestingInitialize("abc");
    expect(response.statusCode).toBe(400);

  });
  // TODO: when users are implemented, test that create can only happen with a valid user in the current session

});

describe("has_permission", () => {
  test("admin also has edit and view permissions", async () => {
    await Helper.testAndExtract(Helper.permissionGroupTestingInitialize, Helper.VALID_UUID);

    let has_permission = await Helper.testAndExtract(Helper.permissionGroupTestingHasPermission, Helper.VALID_UUID, PERMISSION_ADMIN);
    expect(has_permission).toBe(true);
  });
});

describe("update (and get)",  () => {
  test("success - can update in every category", async () => {
    let uuid = Helper.VALID_UUID;
    await Helper.testAndExtract(Helper.permissionGroupTestingInitialize, uuid);

    // Test we can change view, edit, and admin if we are in the admin group

    // register b, c and d
    let b_email = "b@b.com";
    let c_email = "c@c.com";
    let d_email = "d@d.com";
    await Helper.createAgentRegisterLogin(b_email, Helper.DEF_PASSWORD);
    await Helper.createAgentRegisterLogin(c_email, Helper.DEF_PASSWORD);
    await Helper.createAgentRegisterLogin(d_email, Helper.DEF_PASSWORD);
    Helper.setAgent(agent1);

    let view_users = [d_email];
    let edit_users = [c_email];
    let admin_users = [Helper.DEF_EMAIL, b_email];

    await Helper.testAndExtract(Helper.updatePermissionGroup, uuid, PERMISSION_VIEW, view_users);
    let result_users = await Helper.testAndExtract(Helper.getPermissionGroup, uuid, PERMISSION_VIEW);
    expect(result_users).toEqual(view_users);

    await Helper.testAndExtract(Helper.updatePermissionGroup, uuid, PERMISSION_EDIT, edit_users);
    result_users = await Helper.testAndExtract(Helper.getPermissionGroup, uuid, PERMISSION_EDIT);
    expect(result_users).toEqual(edit_users);

    await Helper.testAndExtract(Helper.updatePermissionGroup, uuid, PERMISSION_ADMIN, admin_users);
    result_users = await Helper.testAndExtract(Helper.getPermissionGroup, uuid, PERMISSION_ADMIN);
    expect(result_users).toEqual(admin_users);
  });

  test("must be in the admin category to update permissions", async () => {
    await Helper.testAndExtract(Helper.permissionGroupTestingInitialize, Helper.VALID_UUID);

    let b_email = "b@b.com";
    await Helper.createAgentRegisterLogin(b_email, Helper.DEF_PASSWORD);

    let view_users = [b_email];
    response = await Helper.updatePermissionGroup(Helper.VALID_UUID, "view", view_users);
    expect(response.statusCode).toBe(401);
  });

  test("if admin, current user must be in updated permissions list", async () => {
    await Helper.testAndExtract(Helper.permissionGroupTestingInitialize, Helper.VALID_UUID);

    let b_email = "b@b.com";
    await Helper.createAgentRegisterLogin(b_email, Helper.DEF_PASSWORD);
    Helper.setAgent(agent1);

    let admin_users = ["b@b.com"];
    response = await Helper.updatePermissionGroup(Helper.VALID_UUID, PERMISSION_ADMIN, admin_users);
    expect(response.statusCode).toBe(400);

  });

  test("must be a supported category", async () => {
    await Helper.testAndExtract(Helper.permissionGroupTestingInitialize, Helper.VALID_UUID);

    let users = [Helper.DEF_EMAIL];
    response = await Helper.updatePermissionGroup(Helper.VALID_UUID, "invalid", users);
    expect(response.statusCode).toBe(404);

  });

  test("cannot delete users from template view category", async () => {
    let template = {
      name: "t1"
    }
    template = await Helper.templateCreatePersistTest(template);

    await Helper.createAgentRegisterLogin(Helper.EMAIL_2, Helper.DEF_PASSWORD);
    await Helper.setAgent(agent1);

    let view_users = [Helper.EMAIL_2, Helper.DEF_EMAIL];
    let response = await Helper.updatePermissionGroup(template.uuid, PERMISSION_VIEW, view_users);
    expect(response.statusCode).toBe(200);
    response = await Helper.getPermissionGroup(template.uuid, PERMISSION_VIEW);
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(view_users);

    view_users = [Helper.DEF_EMAIL];
    response = await Helper.updatePermissionGroup(template.uuid, PERMISSION_VIEW, view_users);
    expect(response.statusCode).toBe(400);

  });

  test("any user deleted from template admin or edit is added to template view", async () => {
    let template = {
      name: "t1"
    }
    template = await Helper.templateCreatePersistTest(template);

    await Helper.createAgentRegisterLogin(Helper.EMAIL_2, Helper.DEF_PASSWORD);
    await Helper.setAgent(agent1);

    let users = [Helper.EMAIL_2, Helper.DEF_EMAIL];
    let response = await Helper.updatePermissionGroup(template.uuid, PERMISSION_EDIT, users);
    expect(response.statusCode).toBe(200);
    response = await Helper.getPermissionGroup(template.uuid, PERMISSION_EDIT);
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(users);

    users = [Helper.DEF_EMAIL];
    response = await Helper.updatePermissionGroup(template.uuid, PERMISSION_EDIT, users);
    expect(response.statusCode).toBe(200);
    response = await Helper.getPermissionGroup(template.uuid, PERMISSION_EDIT);
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(users);
    response = await Helper.getPermissionGroup(template.uuid, PERMISSION_VIEW);
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual([Helper.EMAIL_2]);
  });

  test("cannot add users to dataset permissions unless they have template view permission", async () => {
    let template = {
      name: "t1"
    }
    template = await Helper.templateCreatePersistTest(template);

    let dataset = {
      template_id: template._id
    }
    dataset = await Helper.datasetCreatePersistTest(dataset);

    await Helper.createAgentRegisterLogin(Helper.EMAIL_2, Helper.DEF_PASSWORD);
    await Helper.setAgent(agent1);

    let view_users = [Helper.EMAIL_2, Helper.DEF_EMAIL];
    let response = await Helper.updatePermissionGroup(dataset.uuid, PERMISSION_VIEW, view_users);
    expect(response.statusCode).toBe(400);

    response = await Helper.updatePermissionGroup(template.uuid, PERMISSION_VIEW, view_users);
    expect(response.statusCode).toBe(200);

    response = await Helper.updatePermissionGroup(dataset.uuid, PERMISSION_VIEW, view_users);
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
    let response = await Helper.permissionGroupTestingInitialize(template.uuid);
    expect(response.statusCode).toBe(200);

    response = await Helper.getPermissionGroup(template.uuid, 'invalid');
    expect(response.statusCode).toBe(404);

  });
});