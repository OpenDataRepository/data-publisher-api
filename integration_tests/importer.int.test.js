const request = require("supertest");
const fs = require('fs');
const MongoDB = require('../lib/mongoDB');
// var { PERMISSION_ADMIN, PERMISSION_EDIT, PERMISSION_VIEW } = require('../models/permission_group');
var { app, init: appInit } = require('../app');
var HelperClass = require('./common_test_operations');
var Helper = new HelperClass(app);
const Util = require('../lib/util');


beforeAll(async () => {
  await appInit();
});

beforeEach(async() => {
  await Helper.clearDatabase();
});

afterAll(async () => {
  await Helper.clearDatabase();
  await MongoDB.close();
});

const importTemplate = async (template, curr_user) => {
  return await request(app)
    .post(`/import/template/`)
    .set('Cookie', [`user=${curr_user}`])
    .send(template)
    .set('Accept', 'application/json');
}

const templateDraftGetAndTest = async (uuid, curr_user) => {
  let response = await Helper.templateDraftGet(uuid, curr_user);
  expect(response.statusCode).toBe(200);
  return response.body;
};

const cleanseInputTemplateField = (field) => {
  delete field.internal_id;
  delete field.fieldtype;
  delete field.template_field_uuid;
  delete field._field_metadata;
  delete field._database_metadata;
  delete field.updated_at;
  delete field.render_plugin;
  delete field.is_unique;
  if(field.radio_options) {
    for(let radio_option of field.radio_options) {
      delete radio_option.template_radio_option_uuid;
      delete radio_option.updated_at;
    }
  }
}

const cleanseInputTemplate = (template) => {
  delete template.internal_id;
  delete template.template_uuid;
  delete template.metadata_for_uuid;
  delete template._database_metadata;
  delete template.updated_at;
  for(let field of template.fields) {
    cleanseInputTemplateField(field);
  }
  template.related_templates = template.related_databases;
  delete template.related_databases;
  for(let related_template of template.related_templates) {
    cleanseInputTemplate(related_template);
  }
}

const fieldsEqual = (f1, f2, uuid_mapper) => {
  if(f1.uuid in uuid_mapper) {
    if(f2.uuid != uuid_mapper[f1.uuid]) {
      return false;
    }
  } else {
    uuid_mapper[f1.uuid] = f2.uuid;
  }
  if(f1.name != f2.name || 
     f1.description != f2.description ||
     !Util.datesEqual(new Date(f1.updated_at), new Date(f2.updated_at))
  ) {
    return false;
  }
  if(f1.radio_options || f2.radio_options) {
    if(!f1.radio_options || 
       !f2.radio_options ||
       f1.radio_options.length != f2.radio_options.length) {
      return false;
    }
    f1.radio_options.sort((r1, r2) => {return r1.name - r2.name});
    f2.radio_options.sort((r1, r2) => {return r1.name - r2.name});
    for(let i = 0; i < f1.radio_options.length; i++) {
      if(f1.radio_options[i].name != f2.radio_options[i].name) {
        return false;
      }
    }
  }
  return true;
}

const templatesEqual = (t1, t2, uuid_mapper) => {
  if(t1.uuid in uuid_mapper) {
    if(t2.uuid != uuid_mapper[t1.uuid]) {
      return false;
    }
  } else {
    uuid_mapper[t1.uuid] = t2.uuid;
  }
  if(t1.related_databases) {
    t1.related_templates = t1.related_databases
  }
  if(t2.related_databases) {
    t2.related_templates = t2.related_databases
  }
  if(!t1.fields) {
    t1.fields = [];
  }
  if(!t2.fields) {
    t2.fields = [];
  }
  if(!t1.related_templates) {
    t1.related_templates = [];
  }
  if(!t2.related_templates) {
    t2.related_templates = [];
  }
  if(t1.name != t2.name || 
    t1.description != t2.description || 
    !Util.datesEqual(new Date(t1.updated_at), new Date(t2.updated_at)) ||
    typeof(t1.fields) != typeof(t2.fields) ||
    t1.fields.length != t2.fields.length ||
    typeof(t1.related_templates) != typeof(t2.related_templates) ||
    t1.related_templates.length != t2.related_templates.length) {
    return false;
  }
  t1.fields.sort((f1, f2) => {return f1.name - f2.name});
  t2.fields.sort((f1, f2) => {return f1.name - f2.name});
  for(let i = 0; i < t1.fields.length; i++) {
    if(!fieldsEqual(t1.fields[i], t2.fields[i], uuid_mapper)) {
      return false;
    }
  }
  t1.related_templates.sort((t1, t2) => {return t1.name - t2.name});
  t2.related_templates.sort((t1, t2) => {return t1.name - t2.name});
  for(let i = 0; i < t1.related_templates.length; i++) {
    if(!templatesEqual(t1.related_templates[i], t2.related_templates[i], uuid_mapper)) {
      return false;
    }
  }
  return true;
}


describe("template", () => {

  describe("success", () => {

    test("basic", async () => {
      let template = {
        template_uuid: "1", 
        name: "naruto", 
        description: "awesome", 
        updated_at: (new Date()).toISOString(),
        fields: [],
        related_databases: []
      };
      let response = await importTemplate(template, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let uuid = response.body.new_uuid;
  
      let new_template = await templateDraftGetAndTest(uuid, Helper.DEF_CURR_USER);
      expect(templatesEqual(new_template, template, {})).toBeTruthy();
    });
  
    test("includes fields and related databases 1 level deep", async () => {
      let name = "";
      let description = "";
      let updated_at = (new Date()).toISOString();
      let template = {
        template_uuid: "t1", 
        name, description, updated_at,
        fields: [{
          template_field_uuid: "t1f1",
          name, description, updated_at
        }],
        related_databases: [{
          template_uuid: "t1.1",
          name, description, updated_at
        }]
      };
      let response = await importTemplate(template, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let uuid = response.body.new_uuid;
  
      let new_template = await templateDraftGetAndTest(uuid, Helper.DEF_CURR_USER);
      expect(templatesEqual(new_template, template, {})).toBeTruthy();
    });
  
    test("includes fields and related databases 2 levels deed", async () => {
      let name = "";
      let description = "";
      let updated_at = (new Date()).toISOString();
      let template = {
        template_uuid: "t1", 
        name, description, updated_at,
        fields: [{
          template_field_uuid: "t1f1",
          name, description, updated_at
        }],
        related_databases: [{
          template_uuid: "t1.1",
          name, description, updated_at,
          fields: [{
            template_field_uuid: "t1.1f1",
            name, description, updated_at
          }],
          related_databases: [{
            template_uuid: "t1.1.1", 
            name, description, updated_at
          }]
        }]
      };
      let response = await importTemplate(template, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let uuid = response.body.new_uuid;
  
      let new_template = await templateDraftGetAndTest(uuid, Helper.DEF_CURR_USER);
      expect(templatesEqual(new_template, template, {})).toBeTruthy();
    });
  
    test("import the same template twice", async () => {
      let template = {
        template_uuid: "1", 
        name: "naruto", 
        description: "awesome", 
        updated_at: (new Date()).toISOString(),
        fields: [],
        related_databases: []
      };
  
      // Import first time
  
      let response = await importTemplate(template, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let uuid = response.body.new_uuid;
  
      let new_template = await templateDraftGetAndTest(uuid, Helper.DEF_CURR_USER);
      expect(templatesEqual(new_template, template, {})).toBeTruthy();
  
      // Import second time
  
      response = await importTemplate(template, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      uuid = response.body.new_uuid;
      new_template = await templateDraftGetAndTest(uuid, Helper.DEF_CURR_USER);
      expect(templatesEqual(new_template, template, {})).toBeTruthy();  
    })
  
    test("can import same template a second time as long as you have edit permissions", async () => {
      let template = {
        template_uuid: "1", 
        name: "naruto", 
        description: "awesome", 
        updated_at: (new Date()).toISOString(),
        fields: [],
        related_databases: []
      };
  
      // Import first time
  
      let response = await importTemplate(template, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let uuid = response.body.new_uuid;
  
      let new_template = await templateDraftGetAndTest(uuid, Helper.DEF_CURR_USER);
      expect(templatesEqual(new_template, template, {})).toBeTruthy();
  
      // Import second time
    
      response = await importTemplate(template, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let uuid2 = response.body.new_uuid;

      expect(uuid).toEqual(uuid2);

      let new_template_2 = await templateDraftGetAndTest(uuid, Helper.DEF_CURR_USER);
      expect(templatesEqual(new_template_2, new_template, {})).toBeTruthy();
    })
  
    test("import template with real data", async () => {
      let rawdata = fs.readFileSync(__dirname + '/test_data/template.txt');
      let old_template = JSON.parse(rawdata);
    
      let response = await importTemplate(old_template, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let uuid = response.body.new_uuid;
    
      let new_template = await templateDraftGetAndTest(uuid, Helper.DEF_CURR_USER);
    
      expect(templatesEqual(new_template, old_template, {})).toBeTruthy();
    
      cleanseInputTemplate(old_template);
      expect(new_template).toMatchObject(old_template);
    
      Helper.templateCleanseMetadata(new_template);
      let published_template = await Helper.templatePublishAndFetch(new_template.uuid, Helper.DEF_CURR_USER);
      expect(published_template).toMatchObject(new_template);
    });

  });

  describe("failure", () => {

    const failureTest = async (template, curr_user, responseCode) => {
      let response = await importTemplate(template, curr_user);
      expect(response.statusCode).toBe(responseCode);
    };

    test("Input must be an object", async () => {
      let template = [];
      await failureTest(template, Helper.DEF_CURR_USER, 400);
    });

    test("Template must include a template_uuid, which is a string", async () => {
      let template = {};
      await failureTest(template, Helper.DEF_CURR_USER, 400);

      template = {template_uuid: 5};
      await failureTest(template, Helper.DEF_CURR_USER, 400);
    });

    test("Must have edit permissions to import a second time", async () => {
      let template = {
        template_uuid: "1", 
        name: "naruto", 
        description: "awesome", 
        updated_at: (new Date()).toISOString(),
        fields: [],
        related_databases: []
      };
  
      // Import first time
  
      let response = await importTemplate(template, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let uuid = response.body.new_uuid;
  
      let new_template = await templateDraftGetAndTest(uuid, Helper.DEF_CURR_USER);
      expect(templatesEqual(new_template, template, {})).toBeTruthy();
  
      // Import second time
  
      await failureTest(template, Helper.USER_2, 401);
    });

    test("Fields and related_templates must be arrays", async () => {
      let invalidFields = {
        template_uuid: "1",
        fields: ""
      };
      let invalidRelatedTemplates = {
        template_uuid: "2",
        related_databases: {}
      };
      await failureTest(invalidFields, Helper.DEF_CURR_USER, 400);
      await failureTest(invalidRelatedTemplates, Helper.DEF_CURR_USER, 400);
    });

    test("Each of fields and related_templates must be valid", async () => {
      let invalidFields = { 
        template_uuid: "1",
        "fields": [
          { 
            "name": 5
          }
        ]
      };
      let invalidRelatedTemplates = { 
        template_uuid: "1",
        "related_databases": [
          { 
            "name": 5
          }
        ]
      };
      await failureTest(invalidFields, Helper.DEF_CURR_USER, 400);
      await failureTest(invalidRelatedTemplates, Helper.DEF_CURR_USER, 400);
    });

  });

});