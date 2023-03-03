const request = require("supertest");
var { app, init: appInit, close: appClose } = require('../app');
var HelperClass = require('./common_test_operations')
var Helper = new HelperClass(app);
const jwt = require('jsonwebtoken');

var agent;

beforeAll(async () => {
  await appInit();
});

beforeEach(async() => {
  await Helper.clearDatabase();
  agent = await Helper.createAgentRegisterLogin(Helper.DEF_EMAIL, Helper.DEF_PASSWORD);
});

afterAll(async () => {
  await Helper.clearDatabase();
  await appClose();
});

describe("email manipulation", () => {

  test("login only succeeds once email has been confirmed", async () => {
    await Helper.clearDatabase();
    let agent = request.agent(app);
    Helper.setAgent(agent);
    let email = Helper.DEF_EMAIL;
    let body = await Helper.testAndExtract(Helper.register, email, Helper.DEF_PASSWORD);
    let token = body.token;

    let response = await Helper.login(email, Helper.DEF_PASSWORD);
    expect(response.statusCode).toBe(401);

    response = await Helper.confirmEmail(token);
    expect(response.statusCode).toBe(200);

    response = await Helper.login(email, Helper.DEF_PASSWORD);
    expect(response.statusCode).toBe(200);

    response = await Helper.confirmEmail(token);
    expect(response.statusCode).toBe(400);
  });

  test("able to change email and confirm it", async () => {
    let response = await Helper.changeEmail(Helper.EMAIL_2, Helper.DEF_PASSWORD);
    expect(response.statusCode).toBe(200);
    let token = response.body.token;

    response = await Helper.login(Helper.EMAIL_2, Helper.DEF_PASSWORD);
    expect(response.statusCode).toBe(400);
    response = await Helper.login(Helper.DEF_EMAIL, Helper.DEF_PASSWORD);
    expect(response.statusCode).toBe(200);

    response = await Helper.confirmEmail(token);
    expect(response.statusCode).toBe(200);

    response = await Helper.login(Helper.DEF_EMAIL, Helper.DEF_PASSWORD);
    expect(response.statusCode).toBe(400);
    response = await Helper.login(Helper.EMAIL_2, Helper.DEF_PASSWORD);
    expect(response.statusCode).toBe(200);

  });

  test("admin is able to change email for another user and confirm it", async () => {

    await Helper.createAgentRegisterLogin("adminemail@gmail.com", Helper.DEF_PASSWORD);
    await Helper.userTestingSetAdmin();

    let response = await Helper.otherUserChangeEmail(Helper.EMAIL_2, Helper.DEF_EMAIL);
    expect(response.statusCode).toBe(200);
    let token = response.body.token;

    response = await Helper.confirmEmail(token);
    expect(response.statusCode).toBe(200);

    Helper.setAgent(agent);

    response = await Helper.login(Helper.DEF_EMAIL, Helper.DEF_PASSWORD);
    expect(response.statusCode).toBe(400);
    response = await Helper.login(Helper.EMAIL_2, Helper.DEF_PASSWORD);
    expect(response.statusCode).toBe(200);

  });

});

describe("normal login process", () => {

  test("Anyone can access unprotected routes, but only logged-in users can access the protected one", async () => {

    await Helper.testAndExtract(Helper.get_test_unprotected_route);
    await Helper.testAndExtract(Helper.accountGet);

    let agent2 = request.agent(app);
    Helper.setAgent(agent2);
    
    await Helper.testAndExtract(Helper.get_test_unprotected_route);
    let response = await Helper.accountGet();
    expect(response.statusCode).toBe(401);
  });

  test("JWT tokens should expire after the specified time", async () => {
    let valid_callback = () => {
      jwt.verify(agent.latest_login_token, process.env.ACCESS_TOKEN_SECRET, {clockTimestamp: Date.now() / 1000 + 60*60 - 1});
    };
    let invalid_callback = () => {
      jwt.verify(agent.latest_login_token, process.env.ACCESS_TOKEN_SECRET, {clockTimestamp: Date.now() / 1000 + 60 * 60 + 1});
    };
    expect(valid_callback).not.toThrow();
    expect(invalid_callback).toThrow('jwt expired');

  });

});

describe("register", () => {

  describe("failure", () => {

    test("email must be in valid email format", async () => {
      let agent2 = request.agent(app);
      Helper.setAgent(agent2);
      let response = await Helper.register("caleb", "waffle");
      expect(response.statusCode).toBe(400);
    });
  
    test("email must be unique", async () => {  
      let agent2 = request.agent(app);
      Helper.setAgent(agent2);
      let response = await Helper.register(Helper.DEF_EMAIL, "waffle");
      expect(response.statusCode).toBe(400);
    });

  });

});

describe("suspend", () => {

  test("normal", async () => {
    await Helper.testAndExtract(Helper.accountSuspend, Helper.DEF_PASSWORD);
    let response = await Helper.login(Helper.DEF_EMAIL, Helper.DEF_PASSWORD);
    expect(response.statusCode).toBe(401);
  });

  test("with super user act-as", async () => {
    await Helper.userTestingSetSuper();

    await Helper.createAgentRegisterLogin(Helper.EMAIL_2, Helper.DEF_PASSWORD);
    Helper.setAgent(agent);
    
    let response = await Helper.actAs(Helper.templateCreate({name: "waffle"}), Helper.EMAIL_2);
    expect(response.statusCode).toBe(303);

    response = await Helper.actAs(Helper.redirect(response.header.location), Helper.EMAIL_2);
    expect(response.statusCode).toBe(200);

    await Helper.testPermission(response.body.uuid, 'admin', 200, [Helper.EMAIL_2]);

    await Helper.testAndExtract(Helper.actAs, Helper.accountSuspend(Helper.DEF_PASSWORD), Helper.EMAIL_2);

    response = await Helper.actAs(Helper.templateCreate({name: "waffle"}), Helper.EMAIL_2);
    expect(response.statusCode).toBe(401);
  });

  test("must be logged in", async () => {
    let agent2 = request.agent(app);
    Helper.setAgent(agent2);
    let response = await Helper.accountSuspend("nothing");
    expect(response.statusCode).toBe(401);
  });

  test("must provide correct password", async () => {
    let response = await Helper.accountSuspend("wrong password");
    expect(response.statusCode).toBe(400);
  });

  describe("suspend user other than self", () => {
    test("normal", async () => {
      await Helper.createAgentRegisterLogin(Helper.EMAIL_2, Helper.DEF_PASSWORD);
      await Helper.userTestingSetAdmin();

      await Helper.testAndExtract(Helper.otherUserSuspend, Helper.DEF_EMAIL);
      let response = await Helper.login(Helper.DEF_EMAIL, Helper.DEF_PASSWORD);
      expect(response.statusCode).toBe(401);
    });

    test("must be admin or super", async () => {
      await Helper.createAgentRegisterLogin(Helper.EMAIL_2, Helper.DEF_PASSWORD);

      let response = await Helper.otherUserSuspend(Helper.DEF_EMAIL);
      expect(response.statusCode).toBe(401);
    });

    test("user must exist", async () => {
      await Helper.userTestingSetAdmin();

      let response = await Helper.otherUserSuspend(Helper.EMAIL_2);
      expect(response.statusCode).toBe(400);
    });
  });

});

describe("update (and get)", () => {

  describe("success", () => {

    test("first name and last name", async () => {
      
      let update_properties = {
        first_name: "naruto",
        last_name: "uzumaki"
      };
      await Helper.testAndExtract(Helper.accountUpdate, update_properties, Helper.DEF_PASSWORD);

      let user = await Helper.testAndExtract(Helper.accountGet);
      expect(user.email).toEqual(Helper.DEF_EMAIL);
      expect(user.first_name).toEqual("naruto");
      expect(user.last_name).toEqual("uzumaki");

    });

    test("password", async () => {
      let update_properties = {
        new_password: "pie",
        new_password_confirmation: "pie"
      };
      await Helper.testAndExtract(Helper.accountUpdate, update_properties, Helper.DEF_PASSWORD);

      let agent2 = request.agent(app);
      Helper.setAgent(agent2);
      let response = await Helper.login(Helper.DEF_EMAIL, Helper.DEF_PASSWORD);
      expect(response.statusCode).toBe(400);
      await Helper.testAndExtract(Helper.login, Helper.DEF_EMAIL, "pie");
    });

  });

  describe("failure", () => {

    test("must provide correct password to authorize account changes", async () => {
      let update_properties = {
        first_name: "naruto",
        last_name: "uzumaki"
      };
      let response = await Helper.accountUpdate(update_properties, "wrong password");
      expect(response.statusCode).toBe(400);
    });

    test("new_password_confirmation must match new_password", async () => {
      let update_properties = {
        new_password: "honey-pie",
        new_password_confirmation: "waffle-pie"
      };
      let response = await Helper.accountUpdate(update_properties, Helper.DEF_PASSWORD);
      expect(response.statusCode).toBe(400);
    });

  });

  test("update user other than self", async () => {
    await Helper.createAgentRegisterLogin(Helper.EMAIL_2, Helper.DEF_PASSWORD);
    await Helper.userTestingSetAdmin();

    let update_properties = {
      first_name: "naruto",
      last_name: "uzumaki"
    };
    await Helper.testAndExtract(Helper.otherUserUpdate, update_properties, Helper.DEF_EMAIL);

    let user = await Helper.testAndExtract(Helper.userGetByEmail, Helper.DEF_EMAIL);
    expect(user.email).toEqual(Helper.DEF_EMAIL);
    expect(user.first_name).toEqual("naruto");
    expect(user.last_name).toEqual("uzumaki");

  });

});

describe("datasets", () => {

  test("basic - newest dataset should be included for each uuid", async () => {

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    let template1 = { 
      name: "t1"
    };
    template1 = await Helper.templateCreatePersistTest(template1);
  
    let dataset1 = {
      template_id: template1._id,
      name: "simple just created - should appear"
    };
    await Helper.datasetCreateAndTest(dataset1);
    await sleep(1);
    dataset1 = {
      template_id: template1._id,
      name: "simple created and persisted - should appear"
    };
    await Helper.datasetCreatePersistTest(dataset1);
    await sleep(1);
    dataset1 = {
      template_id: template1._id,
      name: "simple created, persisted, and another draft created - first persisted - should not appear"
    };
    let dataset1_with_uuid = await Helper.datasetCreatePersistTest(dataset1);
    dataset1_with_uuid.name = "simple created, persisted, and another draft created - updated - should appear"
    await Helper.datasetUpdateAndTest(dataset1_with_uuid);
    await sleep(1);
    dataset1 = {
      template_id: template1._id,
      name: "simple created, persisted, and persisted again - first persisted - should not appear"
    };
    dataset1_with_uuid = await Helper.datasetCreatePersistTest(dataset1);
    dataset1_with_uuid.name = "simple created, persisted, and persisted again - second persisted - should appear"
    await Helper.datasetUpdatePersistTest(dataset1_with_uuid);
    await sleep(1);
    let template2 = { 
      name: "t1",
      related_templates: [
        { 
          name: "t2"
        }
      ]
    };
    template2 = await Helper.templateCreatePersistTest(template2);
  
    let dataset = {
      template_id: template2._id,
      name: "typo - needs to be updated",
      related_datasets: [
        { 
          template_id: template2.related_templates[0]._id,
          name: "child - should appear"
        }
      ]
    };
  
    dataset = await Helper.datasetCreateAndTest(dataset);
    dataset.name = "parent - should appear";
    dataset = await Helper.datasetUpdateAndTest(dataset);
  
    let datasets = await Helper.testAndExtract(Helper.accountGetDatasets);
    expect(datasets.length).toBe(6);
  
    expect(datasets[0].name).toEqual("child - should appear");
    expect(datasets[1].name).toEqual("parent - should appear");
    expect(datasets[2].name).toEqual("simple created, persisted, and persisted again - second persisted - should appear");
    expect(datasets[3].name).toEqual("simple created, persisted, and another draft created - updated - should appear");
    expect(datasets[4].name).toEqual("simple created and persisted - should appear");
    expect(datasets[5].name).toEqual("simple just created - should appear");
  
  });

  test("only most recent dataset included for each uuid, no matter how scrambled update times are", async () => {

    let template = { 
      name: "t1"
    };
    template = await Helper.templateCreatePersistTest(template);
  
    let dataset1 = {
      template_id: template._id,
      name: "template 1 version 1"
    };
    dataset1 = await Helper.datasetCreatePersistTest(dataset1);

    let dataset2 = {
      template_id: template._id,
      name: "template 2"
    };
    dataset2 = await Helper.datasetCreateAndTest(dataset2);

    dataset1.name = "template 1 version 2";
    dataset1 = await Helper.datasetUpdatePersistTest(dataset1);
  
    let datasets = await Helper.testAndExtract(Helper.accountGetDatasets);
    expect(datasets.length).toBe(2);
  
    expect(datasets[0].name).toEqual("template 1 version 2");
    expect(datasets[1].name).toEqual("template 2");
  
  });


});