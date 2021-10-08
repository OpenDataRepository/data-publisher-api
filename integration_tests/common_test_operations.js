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

  templateFieldCreate = async (field, current_user) => {
    return await request(this.app)
      .post(`/template_field`)
      .set('Cookie', [`user=${current_user}`])
      .send(field)
      .set('Accept', 'application/json');
  };

  templateFieldDraftGet = async (uuid, current_user) => {
    return await request(this.app)
      .get(`/template_field/${uuid}/draft`)
      .set('Cookie', [`user=${current_user}`])
      .set('Accept', 'application/json');
  };

  templateFieldCreateAndTest = async (field, current_user) => {
    let response = await this.templateFieldCreate(field, current_user)
    expect(response.statusCode).toBe(200);
    expect(response.body.inserted_uuid).toBeTruthy();
  
    response = await this.templateFieldDraftGet(response.body.inserted_uuid, current_user);
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject(field);
    return response.body.uuid;
  };

  templateFieldLastUpdate = async (uuid, current_user) => {
    return await request(this.app)
      .get(`/template_field/${uuid}/last_update`)
      .set('Cookie', [`user=${current_user}`]);
  };

  templateFieldPublish = async (uuid, last_update, current_user) => {
    return await request(this.app)
    .post(`/template_field/${uuid}/publish`)
    .set('Cookie', [`user=${current_user}`])
    .send({last_update})
    .set('Accept', 'application/json');
  };

  templateFieldLatestPublished = async (uuid, current_user) => {
    return await request(this.app)
    .get(`/template_field/${uuid}/latest_published`)
    .set('Cookie', [`user=${current_user}`]);
  };

  templateFieldCreatePublishTest = async (field, current_user) => {
    let uuid = await this.templateFieldCreateAndTest(field, current_user);

    let response = await this.templateFieldLastUpdate(uuid, current_user);
    expect(response.statusCode).toBe(200);
    let last_update = response.body;

    response = await this.templateFieldPublish(uuid, last_update, current_user);
    expect(response.statusCode).toBe(200);
  
    // Check that a published version now exists
    response = await this.templateFieldLatestPublished(uuid, current_user);
    expect(response.statusCode).toBe(200);
    let published = response.body;
    expect(published).toMatchObject(field);
    expect(published).toHaveProperty("publish_date");

    // Check that we can still get a draft version
    response = await this.templateFieldDraftGet(uuid, current_user);
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject(field);

    return published;
  };

  // template

  templateCreate = async (template, current_user) => {
    return await request(this.app)
      .post('/template')
      .set('Cookie', [`user=${current_user}`])
      .send(template)
      .set('Accept', 'application/json');
  };

  templateDraftGet = async (uuid, current_user) => {
    return await request(this.app)
      .get(`/template/${uuid}/draft`)
      .set('Cookie', [`user=${current_user}`])
      .set('Accept', 'application/json');
  };

  templateCreateAndTest = async (template, current_user) => {
    let response = await this.templateCreate(template, current_user);
    expect(response.statusCode).toBe(200);
    expect(response.body.inserted_uuid).toBeTruthy();
  
    response = await this.templateDraftGet(response.body.inserted_uuid, current_user)
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject(template);
    return response.body.uuid;
  };

  templateLastUpdate = async(uuid, curr_user) => {
    return await request(this.app)
      .get(`/template/${uuid}/last_update`)
      .set('Cookie', [`user=${curr_user}`]);
  }

  templatePublish = async (uuid, last_update, curr_user) => {
    return await request(this.app)
      .post(`/template/${uuid}/publish`)
      .set('Cookie', [`user=${curr_user}`])
      .send({last_update})
      .set('Accept', 'application/json');
  };

  templateLatestPublished = async(uuid, curr_user) => {
    return await request(this.app)
      .get(`/template/${uuid}/latest_published`)
      .set('Cookie', [`user=${curr_user}`])
      .set('Accept', 'application/json');
  }

  templatePublishAndFetch = async (uuid, curr_user) => {
    let response = await this.templateLastUpdate(uuid, curr_user);
    expect(response.statusCode).toBe(200);
    let last_update = response.body;

    response = await this.templatePublish(uuid, last_update, curr_user);
    expect(response.statusCode).toBe(200);

    response = await this.templateLatestPublished(uuid, curr_user);
    expect(response.statusCode).toBe(200);
    let published_template = response.body;
    expect(published_template).toHaveProperty("publish_date");
    return published_template;
  };

  templateCreatePublishTest = async (template, curr_user) => {
    let uuid = await this.templateCreateAndTest(template, curr_user);
    let published_template = await this.templatePublishAndFetch(uuid, curr_user)
    expect(published_template).toMatchObject(template);
    return published_template;
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

