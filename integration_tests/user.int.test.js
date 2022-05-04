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

const register = async (username, password) => {
  return await agent
    .post(`/user/register`)
    .send({username, password});
}

const login = async (username, password) => {
  return await agent
    .post(`/user/login`)
    .send({username, password});
}

const logout = async () => {
  return await agent
    .post(`/user/logout`);;
}

describe("normal login process", () => {

  test("Before logging in, can access the test unprotected route, but not the protected one", async () => {
    
    await Helper.testAndExtract(get_test_unprotected_route);

    let response = await get_test_protected_route();
    expect(response.statusCode).toBe(401);
  });

  test("After logging in, can access the protected route", async () => {
    // register
    await Helper.testAndExtract(register, "caleb", "waffle");

    let response = await get_test_protected_route();
    expect(response.statusCode).toBe(401);

    // login and get the cookie back
    await Helper.testAndExtract(login, "caleb", "waffle");

    // get protected route (with session cookie)
    await Helper.testAndExtract(get_test_protected_route);

    // logout (with session cookie)
    await Helper.testAndExtract(logout);

    // get protected route (with session cookie). Expect to fail
    response = await get_test_protected_route();
    expect(response.statusCode).toBe(401);
  });

});

describe("modifying users", () => {

  test("username must be unique", async () => {
    await Helper.testAndExtract(register, "naruto", "waffle");

    let response = await register("naruto", "waffle");
    expect(response.statusCode).toBe(400);
  });

});