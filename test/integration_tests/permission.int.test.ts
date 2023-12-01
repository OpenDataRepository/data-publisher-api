var src_path = '../../src';
var { PermissionTypes } = require(src_path + '/models/permission');
var { app, init: appInit, close: appClose } = require(src_path + '/app');
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
    let template: any = {name: "t"};
    template = await Helper.templateCreateAndTest(template);
    let uuid = template.uuid;

    let permission = await Helper.testAndExtract(Helper.getPermission, uuid, PermissionTypes.admin);
    expect(permission).toEqual([Helper.DEF_EMAIL]);

    permission = await Helper.testAndExtract(Helper.getPermission, uuid, PermissionTypes.edit);
    expect(permission).toEqual([]);

    permission = await Helper.testAndExtract(Helper.getPermission, uuid, PermissionTypes.view);
    expect(permission).toEqual([]);

  })
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

    await Helper.testAndExtract(Helper.updatePermission, uuid, PermissionTypes.view, view_users);
    let result_users = await Helper.testAndExtract(Helper.getPermission, uuid, PermissionTypes.view);
    expect(result_users).toEqual(view_users);

    await Helper.testAndExtract(Helper.updatePermission, uuid, PermissionTypes.edit, edit_users);
    result_users = await Helper.testAndExtract(Helper.getPermission, uuid, PermissionTypes.edit);
    expect(result_users).toEqual(edit_users);

    await Helper.testAndExtract(Helper.updatePermission, uuid, PermissionTypes.admin, admin_users);
    result_users = await Helper.testAndExtract(Helper.getPermission, uuid, PermissionTypes.admin);
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
    let response = await Helper.updatePermission(uuid, "view", view_users);
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
    let response = await Helper.updatePermission(uuid, PermissionTypes.admin, admin_users);
    expect(response.statusCode).toBe(400);

  });

  test("must be a supported category", async () => {
    let template_field = {
      name: "field"
    };
    let uuid = await Helper.templateFieldCreateAndTest(template_field);

    let users = [Helper.DEF_EMAIL];
    let response = await Helper.updatePermission(uuid, "invalid", users);
    expect(response.statusCode).toBe(404);

  });

  test("cannot delete users from template view category", async () => {
    let template: any = {
      name: "t1"
    }
    template = await Helper.templateCreatePersistTest(template);

    await Helper.createAgentRegisterLogin(Helper.EMAIL_2, Helper.DEF_PASSWORD);
    await Helper.setAgent(agent1);

    let view_users = [Helper.EMAIL_2];
    let response = await Helper.updatePermission(template.uuid, PermissionTypes.view, view_users);
    expect(response.statusCode).toBe(200);
    response = await Helper.getPermission(template.uuid, PermissionTypes.view);
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(view_users);

    view_users = [];
    response = await Helper.updatePermission(template.uuid, PermissionTypes.view, view_users);
    expect(response.statusCode).toBe(400);

  });

  test("any user deleted from template admin or edit is added to template view", async () => {
    let template: any = {
      name: "t1"
    }
    template = await Helper.templateCreatePersistTest(template);

    await Helper.createAgentRegisterLogin(Helper.EMAIL_2, Helper.DEF_PASSWORD);
    await Helper.setAgent(agent1);

    let users = [Helper.EMAIL_2];
    let response = await Helper.updatePermission(template.uuid, PermissionTypes.edit, users);
    expect(response.statusCode).toBe(200);
    response = await Helper.getPermission(template.uuid, PermissionTypes.edit);
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(users);

    users = [];
    response = await Helper.updatePermission(template.uuid, PermissionTypes.edit, users);
    expect(response.statusCode).toBe(200);
    response = await Helper.getPermission(template.uuid, PermissionTypes.edit);
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(users);
    response = await Helper.getPermission(template.uuid, PermissionTypes.view);
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual([Helper.EMAIL_2]);
  });

  test("cannot add users to dataset permissions unless they have template view permission", async () => {
    let template: any = {
      name: "t1"
    }
    template = await Helper.templateCreatePersistTest(template);

    let dataset: any = {
      template_id: template._id
    }
    dataset = await Helper.datasetCreatePersistTest(dataset);

    await Helper.createAgentRegisterLogin(Helper.EMAIL_2, Helper.DEF_PASSWORD);
    await Helper.setAgent(agent1);

    let view_users = [Helper.EMAIL_2];
    let response = await Helper.updatePermission(dataset.uuid, PermissionTypes.view, view_users);
    expect(response.statusCode).toBe(400);

    response = await Helper.updatePermission(template.uuid, PermissionTypes.view, view_users);
    expect(response.statusCode).toBe(200);

    response = await Helper.updatePermission(dataset.uuid, PermissionTypes.view, view_users);
    expect(response.statusCode).toBe(200);

    response = await Helper.getPermission(dataset.uuid, PermissionTypes.view);
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(view_users);

  });

  describe("user permissions stays in sync with permission", () => {

    test("Changes to the document permissions reflect changes to the user permissions", async () => {

      let template_field = {
        name: "field"
      };
      let uuid = await Helper.templateFieldCreateAndTest(template_field);

      let user_a_permissions = await Helper.testAndExtract(Helper.accountPermissions);
      expect(user_a_permissions.template_field.admin).toEqual([uuid]);

      let b_email = "b@b.com";
      let agent2 = await Helper.createAgentRegisterLogin(b_email, Helper.DEF_PASSWORD);
      Helper.setAgent(agent1);

      let edit_users = [b_email];

      await Helper.testAndExtract(Helper.updatePermission, uuid, PermissionTypes.edit, edit_users);
      let result_users = await Helper.testAndExtract(Helper.getPermission, uuid, PermissionTypes.edit);
      expect(result_users).toEqual(edit_users);

      Helper.setAgent(agent2);

      let user_b_permissions = await Helper.testAndExtract(Helper.accountPermissions);
      expect(user_b_permissions.template_field.edit).toEqual([uuid]);

      Helper.setAgent(agent1);

      await Helper.testAndExtract(Helper.updatePermission, uuid, PermissionTypes.edit, []);
      result_users = await Helper.testAndExtract(Helper.getPermission, uuid, PermissionTypes.edit);
      expect(result_users).toEqual([]);

      Helper.setAgent(agent2);

      user_b_permissions = await Helper.testAndExtract(Helper.accountPermissions);
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

    let response = await Helper.getPermission(template.uuid, 'invalid');
    expect(response.statusCode).toBe(404);

  });
});

describe("user permissions: admin and super", () => {
  test("if admin or super, can access anything, including other user's permissions", async() => {
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

    response = await Helper.otherUserPermissions(Helper.DEF_EMAIL);
    expect(response.statusCode).toBe(200);
    expect(response.body.template.admin).toEqual([template.uuid]);
  });

  test("super user can act as anyone - simple test", async () => {
    await Helper.userTestingSetSuper();

    await Helper.createAgentRegisterLogin(Helper.EMAIL_2, Helper.DEF_PASSWORD);
    Helper.setAgent(agent1);
    
    let response = await Helper.actAs(Helper.templateCreate({name: "waffle"}), Helper.EMAIL_2);
    expect(response.statusCode).toBe(303);

    response = await Helper.actAs(Helper.redirect(response.header.location), Helper.EMAIL_2);
    expect(response.statusCode).toBe(200);

    // Permissions should be user 2 since it was performed as an act-as
    await Helper.testPermission(response.body.uuid, 'admin', 200, [Helper.EMAIL_2]);
  });

  test("super user can act as anyone - complicated test", async() => {
    // user 1 is super user
    await Helper.userTestingSetSuper();
    // user 1 creates child template as self
    let child = await Helper.templateCreateAndTest({
      name: 'child'
    });
    // user 2 creates parent template
    let agent2 = await Helper.createAgentRegisterLogin(Helper.EMAIL_2, Helper.DEF_PASSWORD);
    let parent = await Helper.templateCreateAndTest({
      name: 'parent'
    });

    // user 2 doesn't have permissions to child template, so user 1 will use admin permissions to link child to parent
    Helper.setAgent(agent1);
    parent.related_templates = [child];
    await Helper.templateUpdateAndTest(parent);

    // Fetch parent using admin permissions. Should be able to see everything
    let temp_parent = await Helper.templateDraftGetAndTest(parent.uuid);
    expect(temp_parent.related_templates[0].name).toEqual("child");

    // Fetch parent using acting as user 2. Shouldn't be able to see child template
    temp_parent = await Helper.testAndExtract(Helper.actAs, Helper.templateDraftGet(parent.uuid), Helper.EMAIL_2);
    expect(temp_parent.related_templates[0].name).toBeFalsy();

    Helper.setAgent(agent2);

    // Fetch parent with user 2. Shouldn't be able to see child template
    temp_parent = await Helper.templateDraftGetAndTest(parent.uuid);
    expect(temp_parent.related_templates[0].name).toBeFalsy();

    // Try to update child template through updating the parent template with user 2. Should fail.
    child.description = "i now have a description";
    let response = await Helper.templateUpdate(parent.uuid, parent);
    expect(response.statusCode).toBe(200)

    Helper.setAgent(agent1);

    temp_parent = await Helper.templateDraftGetAndTest(parent.uuid);
    expect(temp_parent.related_templates[0].description).toEqual("");

    // Try to update child template through updating the parent template with super user acting as user 2. Should fail.

    await Helper.testAndExtract(Helper.actAs, Helper.templateUpdate(parent.uuid, parent), Helper.EMAIL_2);

    temp_parent = await Helper.templateDraftGetAndTest(parent.uuid);
    expect(temp_parent.related_templates[0].description).toBeFalsy();

    // Update child template through the admin user. Should succeed
    response = await Helper.templateUpdate(parent.uuid, parent);
    expect(response.statusCode).toBe(200)
    temp_parent = await Helper.templateDraftGetAndTest(parent.uuid);
    expect(temp_parent.related_templates[0].description).toEqual(child.description);

  });

  test("super user act-as generates new users dynamically", async() => {
    await Helper.userTestingSetSuper();
    let template = {name: "waffle"};
    let response = await Helper.actAs(Helper.templateCreate(template), Helper.EMAIL_2);
    expect(response.statusCode).toBe(303);

    let new_user = await Helper.testAndExtract(Helper.userGetByEmail, Helper.EMAIL_2);
    expect(new_user).toEqual({email: Helper.EMAIL_2});

  });

  describe("super user act as: user_email in body", () => {
    test("basic template create", async () => {
      await Helper.userTestingSetSuper();
  
      await Helper.createAgentRegisterLogin(Helper.EMAIL_2, Helper.DEF_PASSWORD);
      Helper.setAgent(agent1);
      
      let template = {name: "waffle"};
      let wrapper = {user_email: Helper.EMAIL_2, template};
      let response = await Helper.templateCreate(wrapper);
      expect(response.statusCode).toBe(303);

      response = await Helper.actAs(Helper.redirect(response.header.location), Helper.EMAIL_2);
      expect(response.statusCode).toBe(200);
  
      // Permissions should be user 2 since it was performed as an act-as
      await Helper.testPermission(response.body.uuid, 'admin', 200, [Helper.EMAIL_2]);
    });
    test("body can only contain user_email and one other object", async () => {
      await Helper.userTestingSetSuper();
  
      await Helper.createAgentRegisterLogin(Helper.EMAIL_2, Helper.DEF_PASSWORD);
      Helper.setAgent(agent1);
      
      let template = {name: "waffle"};
      let wrapper = {user_email: Helper.EMAIL_2, template, something_else: "Not allowed"};
      let response = await Helper.templateCreate(wrapper);
      expect(response.statusCode).toBe(400);
    });
  });
});

test("current user has permission", async () => {
  let template = await Helper.templateCreateAndTest({
    name: 'template'
  });

  let result = await Helper.testAndExtract(Helper.currentUserHasPermission, template.uuid, 'admin');
  expect(result).toBe(true);
  result = await Helper.testAndExtract(Helper.currentUserHasPermission, template.uuid, 'edit');
  expect(result).toBe(true);
  result = await Helper.testAndExtract(Helper.currentUserHasPermission, template.uuid, 'view');
  expect(result).toBe(true);

  let agent2 = await Helper.createAgentRegisterLogin(Helper.EMAIL_2, Helper.DEF_PASSWORD);
  result = await Helper.testAndExtract(Helper.currentUserHasPermission, template.uuid, 'admin');
  expect(result).toBe(false);
  result = await Helper.testAndExtract(Helper.currentUserHasPermission, template.uuid, 'edit');
  expect(result).toBe(false);
  result = await Helper.testAndExtract(Helper.currentUserHasPermission, template.uuid, 'view');
  expect(result).toBe(false);

});