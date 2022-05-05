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

const get_test_protected_route = async () => {
  return await agent
    .get(`/user/test-protected-route`);
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
    .post(`/user/logout`);;
}

const userDelete = async (password) => {
  return await agent
    .post(`/user/delete`)
    .send({password})
}

describe("normal login process", () => {

  test("Before logging in, can access the test unprotected route, but not the protected one", async () => {
    
    await Helper.testAndExtract(get_test_unprotected_route);

    let response = await get_test_protected_route();
    expect(response.statusCode).toBe(401);
  });

  test("After logging in, can access the protected route", async () => {
    // register
    await Helper.testAndExtract(register, Helper.VALID_EMAIL, "waffle");

    let response = await get_test_protected_route();
    expect(response.statusCode).toBe(401);

    // login and get the cookie back
    await Helper.testAndExtract(login, Helper.VALID_EMAIL, "waffle");

    // get protected route (with session cookie)
    await Helper.testAndExtract(get_test_protected_route);

    // logout (with session cookie)
    await Helper.testAndExtract(logout);

    // get protected route (with session cookie). Expect to fail
    response = await get_test_protected_route();
    expect(response.statusCode).toBe(401);
  });

});

// TODO: confirm the email
// TODO: add function to change password
// TODO: add function to change other properties, like full name
// TODO: add function to change email

// TODO: eventually add constraints on the mongodb itself
describe("register", () => {

  test("email must be in valid email format", async () => {
    await register("caleb", "waffle");

    let response = await register("caleb", "waffle");
    expect(response.statusCode).toBe(400);
  });

  test("email must be unique", async () => {
    await Helper.testAndExtract(register, Helper.VALID_EMAIL, "waffle");

    let response = await register(Helper.VALID_EMAIL, "waffle");
    expect(response.statusCode).toBe(400);
  });

});

describe("delete", () => {

  test("normal", async () => {
    await Helper.testAndExtract(register, Helper.VALID_EMAIL, "waffle");
    await Helper.testAndExtract(login, Helper.VALID_EMAIL, "waffle");
    await Helper.testAndExtract(userDelete, "waffle");
  });

  test("must be logged in", async () => {
    let response = await userDelete();
    expect(response.statusCode).toBe(400);
  });

  test("must provide correct password", async () => {
    await Helper.testAndExtract(register, Helper.VALID_EMAIL, "waffle");
    await Helper.testAndExtract(login, Helper.VALID_EMAIL, "waffle");
    let response = await userDelete("wrong password");
    expect(response.statusCode).toBe(400);
  });

});