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

const get_test_unprotected_route = async () => {
  return await agent
    .get(`/user/test-unprotected-route`);
};

const userDelete = async (password) => {
  return await agent
    .post(`/user/delete`)
    .send({password});
}

const update = async (update_properties, password) => {
  update_properties.verification_password = password;
  return await agent
    .post(`/user/update`)
    .send(update_properties);
}

const get = async () => {
  return await agent
    .get(`/user`);
}

const changeEmail = async (new_email, password) => {
  return await agent
    .post(`/user/change_email`)
    .send({new_email, verification_password: password});
}

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
    let response = await changeEmail(Helper.EMAIL_2, Helper.DEF_PASSWORD);
    expect(response.statusCode).toBe(200);
    let token = response.body.token;

    await Helper.testAndExtract(Helper.logout);

    response = await Helper.login(Helper.EMAIL_2, Helper.DEF_PASSWORD);
    expect(response.statusCode).toBe(400);
    response = await Helper.login(Helper.DEF_EMAIL, Helper.DEF_PASSWORD);
    expect(response.statusCode).toBe(200);

    await Helper.testAndExtract(Helper.logout);

    response = await Helper.confirmEmail(token);
    expect(response.statusCode).toBe(200);

    response = await Helper.login(Helper.DEF_EMAIL, Helper.DEF_PASSWORD);
    expect(response.statusCode).toBe(400);
    response = await Helper.login(Helper.EMAIL_2, Helper.DEF_PASSWORD);
    expect(response.statusCode).toBe(200);

  });

});

describe("normal login process", () => {

  test("Before logging in, can access the test unprotected route, but not the protected one", async () => {

    await Helper.testAndExtract(Helper.logout);
    
    await Helper.testAndExtract(get_test_unprotected_route);

    let response = await get();
    expect(response.statusCode).toBe(401);
  });

  test("After logging in, can access the protected route", async () => {
    // get protected route
    await Helper.testAndExtract(get);

    // logout
    await Helper.testAndExtract(Helper.logout);

    // get protected route. Expect to fail
    response = await get();
    expect(response.statusCode).toBe(401);
  });

});

// TODO: eventually add constraints on the mongodb itself
describe("register", () => {

  describe("failure", () => {

    test("can only register if not already logged in", async () => {
      let response = await Helper.register(Helper.DEF_EMAIL, Helper.DEF_PASSWORD);
      expect(response.statusCode).toBe(401);
    });

    test("email must be in valid email format", async () => {
      await Helper.testAndExtract(Helper.logout);
      let response = await Helper.register("caleb", "waffle");
      expect(response.statusCode).toBe(400);
    });
  
    test("email must be unique", async () => {  
      await Helper.testAndExtract(Helper.logout);
      let response = await Helper.register(Helper.DEF_EMAIL, "waffle");
      expect(response.statusCode).toBe(400);
    });

  });

});

describe("delete", () => {

  test("normal", async () => {
    await Helper.testAndExtract(userDelete, Helper.DEF_PASSWORD);
    let response = await Helper.login(Helper.DEF_EMAIL, Helper.DEF_PASSWORD);
    expect(response.statusCode).toBe(400);
  });

  test("must be logged in", async () => {
    await Helper.testAndExtract(Helper.logout);
    let response = await userDelete();
    expect(response.statusCode).toBe(401);
  });

  test("must provide correct password", async () => {
    let response = await userDelete("wrong password");
    expect(response.statusCode).toBe(400);
  });

});

describe("update (and get)", () => {

  describe("success", () => {

    test("first name and last name", async () => {
      
      let update_properties = {
        first_name: "naruto",
        last_name: "uzumaki"
      };
      await Helper.testAndExtract(update, update_properties, Helper.DEF_PASSWORD);

      let user = await Helper.testAndExtract(get);
      expect(user.email).toEqual(Helper.DEF_EMAIL);
      expect(user.first_name).toEqual("naruto");
      expect(user.last_name).toEqual("uzumaki");

    });

    test("password", async () => {
      let update_properties = {
        new_password: "pie",
        new_password_confirmation: "pie"
      };
      await Helper.testAndExtract(update, update_properties, Helper.DEF_PASSWORD);

      await Helper.testAndExtract(Helper.logout);
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
      let response = await update(update_properties, "wrong password");
      expect(response.statusCode).toBe(400);
    });

    test("new_password_confirmation must match new_password", async () => {
      let update_properties = {
        new_password: "honey-pie",
        new_password_confirmation: "waffle-pie"
      };
      let response = await update(update_properties, Helper.DEF_PASSWORD);
      expect(response.statusCode).toBe(400);
    });

  });

});