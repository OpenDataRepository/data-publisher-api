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
  agent = request.agent(app);
});

afterAll(async () => {
  await Helper.clearDatabase();
  await appClose();
});

const get_test_unprotected_route = async () => {
  return await agent
    .get(`/user/test-unprotected-route`);
};

const register = async (email, password) => {
  return await agent
    .post(`/user/register`)
    .send({email, password});
}

const login = async (email, password) => {
  return await agent
    .post(`/user/login`)
    .send({email, password});
}

const logout = async () => {
  return await agent
    .post(`/user/logout`);
}

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

describe("normal login process", () => {

  test("Before logging in, can access the test unprotected route, but not the protected one", async () => {
    
    await Helper.testAndExtract(get_test_unprotected_route);

    let response = await get();
    expect(response.statusCode).toBe(401);
  });

  test("After logging in, can access the protected route", async () => {
    // register
    await Helper.testAndExtract(register, Helper.DEF_EMAIL, "waffle");

    let response = await get();
    expect(response.statusCode).toBe(401);

    // login and get the cookie back
    await Helper.testAndExtract(login, Helper.DEF_EMAIL, "waffle");

    // get protected route (with session cookie)
    await Helper.testAndExtract(get);

    // logout (with session cookie)
    await Helper.testAndExtract(logout);

    // get protected route (with session cookie). Expect to fail
    response = await get();
    expect(response.statusCode).toBe(401);
  });

});

// TODO: confirm the email
// TODO: add function to change email
// TODO: eventually add constraints on the mongodb itself
describe("register", () => {

  describe("failure", () => {

    test("email must be in valid email format", async () => {
      await register("caleb", "waffle");
  
      let response = await register("caleb", "waffle");
      expect(response.statusCode).toBe(400);
    });
  
    test("email must be unique", async () => {
      await Helper.testAndExtract(register, Helper.DEF_EMAIL, "waffle");
  
      let response = await register(Helper.DEF_EMAIL, "waffle");
      expect(response.statusCode).toBe(400);
    });

  });

});

describe("delete", () => {

  test("normal", async () => {
    await Helper.testAndExtract(register, Helper.DEF_EMAIL, "waffle");
    await Helper.testAndExtract(login, Helper.DEF_EMAIL, "waffle");
    await Helper.testAndExtract(userDelete, "waffle");
    let response = await login(Helper.DEF_EMAIL, "waffle");
    expect(response.statusCode).toBe(400);
  });

  test("must be logged in", async () => {
    let response = await userDelete();
    expect(response.statusCode).toBe(401);
  });

  test("must provide correct password", async () => {
    await Helper.testAndExtract(register, Helper.DEF_EMAIL, "waffle");
    await Helper.testAndExtract(login, Helper.DEF_EMAIL, "waffle");
    let response = await userDelete("wrong password");
    expect(response.statusCode).toBe(400);
  });

});

describe("update (and get)", () => {

  describe("success", () => {

    test("first name and last name", async () => {
      await Helper.testAndExtract(register, Helper.DEF_EMAIL, "waffle");
      await Helper.testAndExtract(login, Helper.DEF_EMAIL, "waffle");
      
      let update_properties = {
        first_name: "naruto",
        last_name: "uzumaki"
      };
      await Helper.testAndExtract(update, update_properties, "waffle");

      let user = await Helper.testAndExtract(get);
      expect(user.email).toEqual(Helper.DEF_EMAIL);
      expect(user.first_name).toEqual("naruto");
      expect(user.last_name).toEqual("uzumaki");

    });

    test("password", async () => {
      await Helper.testAndExtract(register, Helper.DEF_EMAIL, "waffle");
      await Helper.testAndExtract(login, Helper.DEF_EMAIL, "waffle");
      
      let update_properties = {
        new_password: "pie",
        new_password_confirmation: "pie"
      };
      await Helper.testAndExtract(update, update_properties, "waffle");

      await Helper.testAndExtract(logout);
      let response = await login(Helper.DEF_EMAIL, "waffle");
      expect(response.statusCode).toBe(400);
      await Helper.testAndExtract(login, Helper.DEF_EMAIL, "pie");
    });

  });

  describe("failure", () => {

    test("must provide correct password to authorize account changes", async () => {
      await Helper.testAndExtract(register, Helper.DEF_EMAIL, "waffle");
      await Helper.testAndExtract(login, Helper.DEF_EMAIL, "waffle");
      
      let update_properties = {
        first_name: "naruto",
        last_name: "uzumaki"
      };
      let response = await update(update_properties, "wrong password");
      expect(response.statusCode).toBe(400);
    });

    test("new_password_confirmation must match new_password", async () => {
      await Helper.testAndExtract(register, Helper.DEF_EMAIL, "waffle");
      await Helper.testAndExtract(login, Helper.DEF_EMAIL, "waffle");
      
      let update_properties = {
        new_password: "honey-pie",
        new_password_confirmation: "waffle-pie"
      };
      let response = await update(update_properties, "waffle");
      expect(response.statusCode).toBe(400);
    });

  });

});