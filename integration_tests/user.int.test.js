const request = require("supertest");
var { app, init: appInit, close: appClose } = require('../app');
var HelperClass = require('./common_test_operations')
var Helper = new HelperClass(app);

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
    expect(response.statusCode).toBe(200);

    await Helper.testAndExtract(Helper.actAs, Helper.accountSuspend(Helper.DEF_PASSWORD), Helper.EMAIL_2);

    response = await Helper.actAs(Helper.templateCreate({name: "waffle"}), Helper.EMAIL_2);
    expect(response.statusCode).toBe(401);
  });

  test("must be logged in", async () => {
    let agent2 = request.agent(app);
    Helper.setAgent(agent2);
    let response = await Helper.accountSuspend();
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