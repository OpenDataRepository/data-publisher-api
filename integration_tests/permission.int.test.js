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
    let template = {name: "t"};
    template = await Helper.templateCreateAndTest(template);
    let uuid = template.uuid;

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
});

describe("has_permission", () => {
  test("admin also has edit and view permissions", async () => {
    let template = {name: "t"};
    template = await Helper.templateCreateAndTest(template);
    let uuid = template.uuid;

    let has_permission = await Helper.testAndExtract(Helper.permissionGroupTestingHasPermission,uuid, PERMISSION_ADMIN);
    expect(has_permission).toBe(true);
  });
});

describe("update (and get)",  () => {
  test("success - can update in every category", async () => {

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

    let template_field = {
      name: "field"
    };
    let uuid = await Helper.templateFieldCreateAndTest(template_field);

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
    let template_field = {
      name: "field"
    };
    let uuid = await Helper.templateFieldCreateAndTest(template_field);

    let b_email = "b@b.com";
    await Helper.createAgentRegisterLogin(b_email, Helper.DEF_PASSWORD);

    let view_users = [b_email];
    response = await Helper.updatePermissionGroup(uuid, "view", view_users);
    expect(response.statusCode).toBe(401);
  });

  test("if admin, current user must be in updated permissions list", async () => {
    let template_field = {
      name: "field"
    };
    let uuid = await Helper.templateFieldCreateAndTest(template_field);

    let b_email = "b@b.com";
    await Helper.createAgentRegisterLogin(b_email, Helper.DEF_PASSWORD);
    Helper.setAgent(agent1);

    let admin_users = ["b@b.com"];
    response = await Helper.updatePermissionGroup(uuid, PERMISSION_ADMIN, admin_users);
    expect(response.statusCode).toBe(400);

  });

  test("must be a supported category", async () => {
    let template_field = {
      name: "field"
    };
    let uuid = await Helper.templateFieldCreateAndTest(template_field);

    let users = [Helper.DEF_EMAIL];
    response = await Helper.updatePermissionGroup(uuid, "invalid", users);
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

  describe("user permissions stays in sync with permission_group", () => {

    test("Changes to the document permissions reflect changes to the user permissions", async () => {

      let template_field = {
        name: "field"
      };
      let uuid = await Helper.templateFieldCreateAndTest(template_field);

      let user_a_permissions = await Helper.testAndExtract(Helper.userDocuments);
      expect(user_a_permissions.template_field.admin).toEqual([uuid]);

      let b_email = "b@b.com";
      let agent2 = await Helper.createAgentRegisterLogin(b_email, Helper.DEF_PASSWORD);
      Helper.setAgent(agent1);

      let edit_users = [b_email];

      await Helper.testAndExtract(Helper.updatePermissionGroup, uuid, PERMISSION_EDIT, edit_users);
      let result_users = await Helper.testAndExtract(Helper.getPermissionGroup, uuid, PERMISSION_EDIT);
      expect(result_users).toEqual(edit_users);

      Helper.setAgent(agent2);

      let user_b_permissions = await Helper.testAndExtract(Helper.userDocuments);
      expect(user_b_permissions.template_field.edit).toEqual([uuid]);

      Helper.setAgent(agent1);

      await Helper.testAndExtract(Helper.updatePermissionGroup, uuid, PERMISSION_EDIT, []);
      result_users = await Helper.testAndExtract(Helper.getPermissionGroup, uuid, PERMISSION_EDIT);
      expect(result_users).toEqual([]);

      Helper.setAgent(agent2);

      user_b_permissions = await Helper.testAndExtract(Helper.userDocuments);
      expect(user_b_permissions.template_field.edit).toEqual([]);
      expect(user_b_permissions.template_field.view).toEqual([uuid]);

    })

  });

});

describe("get",  () => {
  test("must be a supported category", async () => {
    let template = await Helper.templateCreateAndTest({
      name: 'template'
    });

    response = await Helper.getPermissionGroup(template.uuid, 'invalid');
    expect(response.statusCode).toBe(404);

  });
});

describe("user permissions: admin and super", () => {
  test("if admin or super, can access anything", async() => {
    let template = await Helper.templateCreateAndTest({
      name: 'template'
    });
    await Helper.createAgentRegisterLogin(Helper.EMAIL_2, Helper.DEF_PASSWORD);
    await Helper.userTestingSetAdmin();
    let response = await Helper.templateDraftGet(template.uuid);
    expect(response.statusCode).toBe(200);

    await Helper.createAgentRegisterLogin("c@c.com", Helper.DEF_PASSWORD);
    await Helper.userTestingSetSuper();
    response = await Helper.templateDraftGet(template.uuid);
    expect(response.statusCode).toBe(200);
  });
});