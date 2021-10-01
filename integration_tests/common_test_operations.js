const request = require("supertest");
const MongoDB = require('../lib/mongoDB');
var { PERMISSION_ADMIN, PERMISSION_EDIT, PERMISSION_VIEW } = require('../models/permission_group');

module.exports = class Helper {
  constructor(app) {
    this.app = app;
  };

  VALID_UUID = "47356e57-eec2-431b-8059-f61d5f9a6bc6";
  DEF_CURR_USER = 'caleb';

  clearDatabase = async () => {
    let db = MongoDB.db();
    await db.collection('templates').deleteMany();
    await db.collection('template_fields').deleteMany();
    await db.collection('records').deleteMany();
    await db.collection('permission_groups').deleteMany();
  };

  // template field

  templateFieldDraftGet = async (uuid, current_user) => {
    return await request(this.app)
      .get(`/template_field/${uuid}/draft`)
      .set('Cookie', [`user=${current_user}`])
      .set('Accept', 'application/json');
  };

  // template

  templateCreate = async (data) => {
    return await request(this.app)
      .post('/template')
      .set('Cookie', ['user=caleb'])
      .send(data)
      .set('Accept', 'application/json');
  };

  templateCreateAndTest = async (data) => {
    let response = await this.templateCreate(data);
    expect(response.statusCode).toBe(200);
    expect(response.body.inserted_uuid).toBeTruthy();
  
    response = await request(this.app)
      .get(`/template/${response.body.inserted_uuid}/draft`)
      .set('Accept', 'application/json');
  
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject(data);
    return response.body.uuid;
  };

  // record

  // permission group

  getPermissionGroup = async (uuid, category) => {
    return await request(this.app)
      .get(`/permission_group/${uuid}/${category}`)
      .set('Accept', 'application/json');
  };

  testPermissionGroup = async (uuid, category, statusCode, user) => {
    let response = await this.getPermissionGroup(uuid, category);
    if(!statusCode) {
      statusCode = 200;
    }
    expect(response.statusCode).toBe(statusCode);
    if(statusCode == 200) {
      if (!user) {
        user = this.DEF_CURR_USER;
      }
      expect(response.body).toEqual([user]);
    }
  };

  testPermissionGroupsInitializedFor = async (uuid, user) => {
    await this.testPermissionGroup(uuid, PERMISSION_ADMIN, 200, user);
    await this.testPermissionGroup(uuid, PERMISSION_EDIT, 200, user);
    await this.testPermissionGroup(uuid, PERMISSION_VIEW, 200, user);
  }
}

