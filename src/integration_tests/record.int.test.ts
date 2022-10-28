var { app, init: appInit, close: appClose } = require('../app');
var HelperClass = require('./common_test_operations')
var Helper = new HelperClass(app);
var { PermissionTypes } = require('../models/permission');
import { FieldTypes } from "../models/template_field"; '../models/template_field';

var agent1;
var agent2;

beforeAll(async () => {
  await appInit();
  agent2 = await Helper.createAgentRegisterLogin(Helper.EMAIL_2, Helper.DEF_PASSWORD);
  agent1 = await Helper.createAgentRegisterLogin(Helper.DEF_EMAIL, Helper.DEF_PASSWORD);
});

beforeEach(async() => {
  await Helper.clearDatabaseExceptForUsers();
  Helper.setAgent(agent1);
});

afterAll(async () => {
  await Helper.clearDatabase();
  await appClose();
});

describe("create (and get draft)", () => {
  describe("Success cases", () => {

    test("No fields or related records", async () => {

      let template: any = {
        name:"t1"
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = {
        template_id: template._id
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);

      let record = {
        dataset_uuid: dataset.uuid
      };
      await Helper.recordCreateAndTest(record);

    });
    test("Fields but no related records", async () => {

      let name_field: any = {
        name: "name",
        description: "someone's name"
      };
      let color_field: any = {
        name: "favorite color",
        description: "their favorite color in the whole world"
      }
      let template: any = {
        "name":"t1",
        "fields":[name_field, color_field]
      };
      template = await Helper.templateCreatePersistTest(template);

      if(template.fields[0].name == 'name') {
        name_field.uuid = template.fields[0].uuid;
        color_field.uuid = template.fields[1].uuid;
      } else {
        name_field.uuid = template.fields[1].uuid;
        color_field.uuid = template.fields[0].uuid;
      }
      name_field.value = "Caleb";
      color_field.value = "yellow - like the sun";

      let dataset: any = {
        template_id: template._id
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);

      let record = {
        dataset_uuid: dataset.uuid,
        fields: [name_field, color_field]
      };
      await Helper.recordCreateAndTest(record);

    });

    test("Fields and one related record", async () => {

      let name_field: any = {
        "name": "name",
        "description": "the name of the person"
      };

      let color_field: any = {
        "name": "favorite color",
        "description": "the person's favorite color in the whole world"
      }

      let related_template = {
        "name":"1.1",
        "fields":[color_field]
      };

      let template: any = {
        "name":"1",
        "fields":[name_field],
        "related_templates":[related_template]
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = {
        template_id: template._id,
        related_datasets: [{
          template_id: template.related_templates[0]._id
        }]
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);

      name_field.uuid = template.fields[0].uuid;
      name_field.value = "Caleb";
      color_field.uuid = template.related_templates[0].fields[0].uuid;
      color_field.value = "yellow - like the sun";

      let record = {
        dataset_uuid: dataset.uuid,
        fields: [name_field],
        related_records: [{
          dataset_uuid: dataset.related_datasets[0].uuid,
          fields: [color_field]
        }]
      };

      await Helper.recordCreateAndTest(record);

    });

    test("Create record with related records going 6 nodes deep", async () => {
  
      let template: any = { 
        "name": "t1",
        "related_templates": [
          { 
            "name": "t2",
            "related_templates": [
              { 
                "name": "t3",
                "related_templates": [
                  { 
                    "name": "t4",
                    "related_templates": [
                      { 
                        "name": "t5",
                        "related_templates": [
                          { 
                            "name": "t6",
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = { 
        template_id: template._id,
        related_datasets: [
          { 
            template_id: template.related_templates[0]._id,
            related_datasets: [
              { 
                template_id: template.related_templates[0].related_templates[0]._id,
                related_datasets: [
                  { 
                    template_id: template.related_templates[0].related_templates[0].related_templates[0]._id,
                    related_datasets: [
                      { 
                        template_id: template.related_templates[0].related_templates[0].related_templates[0].related_templates[0]._id,
                        related_datasets: [
                          { 
                            template_id: template.related_templates[0].related_templates[0].related_templates[0].related_templates[0].related_templates[0]._id,
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);

      let record = { 
        "dataset_uuid": dataset.uuid,
        "related_records": [
          { 
            "dataset_uuid": dataset.related_datasets[0].uuid,
            "related_records": [
              { 
                "dataset_uuid": dataset.related_datasets[0].related_datasets[0].uuid,
                "related_records": [
                  { 
                    "dataset_uuid": dataset.related_datasets[0].related_datasets[0].related_datasets[0].uuid,
                    "related_records": [
                      { 
                        "dataset_uuid": dataset.related_datasets[0].related_datasets[0].related_datasets[0].related_datasets[0].uuid,
                        "related_records": [
                          { 
                            "dataset_uuid": dataset.related_datasets[0].related_datasets[0].related_datasets[0].related_datasets[0].related_datasets[0].uuid,
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      };

      await Helper.recordCreateAndTest(record);

    });

    test("one related record, which already exists", async () => {

      let template: any = {
        name:"t1",
        related_templates:[{
          name: "t2"
        }]
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = {
        template_id: template._id,
        related_datasets:[{
          template_id: template.related_templates[0]._id 
        }]
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);

      let related_record = {
        dataset_uuid: dataset.related_datasets[0].uuid
      };

      related_record = await Helper.recordCreateAndTest(related_record);

      let record = {
        dataset_uuid: dataset.uuid,
        related_records: [related_record]
      };

      await Helper.recordCreateAndTest(record);

    });

    test("link one related record user only has view permissions for, and one the user has no permissions for", async () => {

      let template: any = {
        name:"t1",
        related_templates:[
          {
            name: "t1.1"
          },
          {
            name: "t1.2"
          }
        ]
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = {
        template_id: template._id,
        related_datasets:[
          {
            template_id: template.related_templates[0]._id
          },
          {
            template_id: template.related_templates[1]._id
          }
        ]
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);

      let related_record_1: any = {
        dataset_uuid: dataset.related_datasets[0].uuid
      };
      let related_record_2: any = {
        dataset_uuid: dataset.related_datasets[1].uuid
      };

      let related_record_1_persisted = await Helper.recordCreatePersistTest(related_record_1);
      let related_record_2_persisted = await Helper.recordCreatePersistTest(related_record_2);

      related_record_1.uuid = related_record_1_persisted.uuid;
      related_record_2.uuid = related_record_2_persisted.uuid;

      let both_users = [Helper.DEF_EMAIL, Helper.EMAIL_2];
      let response = await Helper.updatePermission(template.uuid, PermissionTypes.edit, both_users);
      expect(response.statusCode).toBe(200);
      response = await Helper.updatePermission(dataset.uuid, PermissionTypes.edit, both_users);
      expect(response.statusCode).toBe(200);
      response = await Helper.updatePermission(template.related_templates[0].uuid, PermissionTypes.view, both_users);
      expect(response.statusCode).toBe(200);
      response = await Helper.updatePermission(related_record_1.dataset_uuid, PermissionTypes.view, both_users);
      expect(response.statusCode).toBe(200);

      // response = await Helper.updatePermission(Helper.DEF_CURR_USER, template.uuid, PermissionTypes.view, view_users);
      // expect(response.statusCode).toBe(200);

      let record = {
        dataset_uuid: dataset.uuid,
        related_records: [related_record_1, {uuid: related_record_2_persisted.uuid, dataset_uuid: related_record_2_persisted.dataset_uuid}]
      };

      await Helper.setAgent(agent2);

      await Helper.recordCreateAndTest(record);

    });

    test("2 related records, but only 1 supplied", async () => {

      let template1: any = {
        "name":"1",
        "fields":[],
        "related_templates":[{"name":"1.1"}, {"name":"1.2"}]
      };
      template1 = await Helper.templateCreatePersistTest(template1);

      let dataset: any = {
        template_id: template1._id,
        related_datasets: [
          {
            template_id: template1.related_templates[0]._id
          },
          {
            template_id: template1.related_templates[1]._id
          }
        ]
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);

      let record = {
        dataset_uuid: dataset.uuid,
        related_records: [{
          dataset_uuid: dataset.related_datasets[1].uuid,
        }]
      };

      await Helper.recordCreateAndTest(record);

    });

    test("With options", async () => {

      let field: any = {
        name: "f1",
        public_date: (new Date()).toISOString(),
        options: [
          {
            name: "naruto"
          },
          {
            name: "sasuke"
          },
          {
            name: "sakura"
          },
          {
            name: "caleb",
            options: [
              {
                name: "super_duper"
              }
            ]
          }
        ]
      };
      let template: any = {
        "name":"t1",
        "fields":[field]
      };
      template = await Helper.templateCreatePersistTest(template);

      field.uuid = template.fields[0].uuid;
      field.options = template.fields[0].options;

      let dataset: any = {
        template_id: template._id
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);

      // The tests automatically sort by name. So options[0] is 'caleb' and options[1] is 'naruto'
      let option_uuid_1 = field.options[1].uuid;
      let option_uuid_2 = field.options[0].options[0].uuid;

      field.values = [{uuid: option_uuid_1}];
      delete field.options;
      delete field.public_date;

      let record = {
        dataset_uuid: dataset.uuid,
        fields: [field]
      };
      record = await Helper.recordCreateAndTest(record);
      expect(record.fields[0].values).toEqual([{uuid: option_uuid_1, name: "naruto"}]);

      record.fields[0].values = [{uuid: option_uuid_1}, {uuid: option_uuid_2}];
      record = await Helper.recordCreateAndTest(record);
      expect(record.fields[0].values).toEqual([
        {uuid: option_uuid_1, name: "naruto"},
        {uuid: option_uuid_2, name: "super_duper"}
      ]);

      delete record.fields[0].values;
      record = await Helper.recordCreateAndTest(record);
      expect(record.fields[0].values).toEqual([]);

    });

    test("record not required to supply related_record for each related_dataset", async () => {

      let name_field: any = {
        "name": "name",
        "description": "the name of the person"
      };

      let color_field = {
        "name": "favorite color",
        "description": "the person's favorite color in the whole world"
      }

      let related_template = {
        "name":"1.1",
        "fields":[color_field]
      };

      let template: any = {
        "name":"1",
        "fields":[name_field],
        "related_templates":[related_template]
      };
      template = await Helper.templateCreatePersistTest(template);

      name_field.uuid = template.fields[0].uuid;

      let dataset: any = {
        template_id: template._id,
        related_datasets: [{
          template_id: template.related_templates[0]._id
        }]
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);

      let record = {
        dataset_uuid: dataset.uuid,
        fields: [name_field],
        related_records: []
      };

      await Helper.recordCreateAndTest(record);

    });

    test("automatically create record and related_records from dataset", async () => {

      let public_date = (new Date()).toISOString();
      let template: Record<string, any> = {
        name:"t1",
        public_date,
        related_templates:[
          {
            name: "t2",
            public_date,
            related_templates:[
              {
                name: "t3",
                public_date
              }
            ]
          }
        ],
        fields: [
          {
            name: "a field"
          }
        ]
      };
      template = await Helper.templateCreatePersistTest(template);


      let dataset: Record<string, any> = {
        template_id: template._id,
        public_date: (new Date()).toISOString()
      };

      dataset = await Helper.datasetCreatePersistTest(dataset);

      let record = await Helper.recordCreateAndTest({dataset_uuid: dataset.uuid});

      expect(record.related_records[0].dataset_uuid).toEqual(dataset.related_datasets[0].uuid);
      expect(record.related_records[0].related_records[0].dataset_uuid).toEqual(dataset.related_datasets[0].related_datasets[0].uuid);

      expect(record.fields[0].uuid).toEqual(template.fields[0].uuid);


    });

  });

  describe("Failure cases", () => {

    test("Input must be an object", async () => {
      let record = [];
      let response = await Helper.recordCreate(record);
      expect(response.statusCode).toBe(400);
    })

    test("Dataset uuid must be a real dataset", async () => {

      let record = {
        dataset_uuid: 6
      };

      let response = await Helper.recordCreate(record);
      expect(response.statusCode).toBe(400);

      record = {
        dataset_uuid: Helper.VALID_UUID
      };

      response = await Helper.recordCreate(record);
      expect(response.statusCode).toBe(400);

    });

    test("Fields and related_records must be arrays", async () => {

      let template: any = {
        "name":"t1"
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = {
        template_id: template._id
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);

      let record: any = {
        dataset_uuid: dataset.uuid,
        fields: 7
      };
      let response = await Helper.recordCreate(record);
      expect(response.statusCode).toBe(400);

      record = {
        dataset_uuid: dataset.uuid,
        related_records: 9
      };
      response = await Helper.recordCreate(record);
      expect(response.statusCode).toBe(400);
    })

    test("related_record can only point to a related_dataset supported by the dataset", async () => {

      let template: any = {
        "name":"t1",
        "related_templates":[{name: "t1.1"}]
      };

      let other_template: any = {
        "name": "incorrect"
      }

      other_template = await Helper.templateCreatePersistTest(other_template);

      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = {
        template_id: template._id,
        related_datasets: [{
          template_id: template.related_templates[0]._id
        }]
      }
      dataset = await Helper.datasetCreatePersistTest(dataset);

      let other_dataset: any = {
        template_id: other_template._id
      }
      other_dataset = await Helper.datasetCreatePersistTest(other_dataset);

      let record = {
        dataset_uuid: dataset.uuid,
        related_records: [{
          dataset_uuid: other_dataset.uuid
        }]
      };
      let response = await Helper.recordCreate(record);
      expect(response.statusCode).toBe(400);

    });

    test("Create record with related_records going 6 nodes deep, but 2nd-to last record is invalid", async () => {
  
      let template: any = { 
        "name": "t1",
        "related_templates": [
          { 
            "name": "t2",
            "related_templates": [
              { 
                "name": "t3",
                "related_templates": [
                  { 
                    "name": "t4",
                    "related_templates": [
                      { 
                        "name": "t5",
                        "related_templates": [
                          { 
                            "name": "t6",
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = { 
        template_id: template._id,
        related_datasets: [
          { 
            template_id: template.related_templates[0]._id,
            related_datasets: [
              { 
                template_id: template.related_templates[0].related_templates[0]._id,
                related_datasets: [
                  { 
                    template_id: template.related_templates[0].related_templates[0].related_templates[0]._id,
                    related_datasets: [
                      { 
                        template_id: template.related_templates[0].related_templates[0].related_templates[0].related_templates[0]._id,
                        related_datasets: [
                          { 
                            template_id: template.related_templates[0].related_templates[0].related_templates[0].related_templates[0].related_templates[0]._id,
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);

      let record = { 
        "dataset_uuid": dataset.uuid,
        "related_records": [
          { 
            "dataset_uuid": dataset.related_datasets[0].uuid,
            "related_records": [
              { 
                "dataset_uuid": dataset.related_datasets[0].related_datasets[0].uuid,
                "related_records": [
                  { 
                    "dataset_uuid": dataset.related_datasets[0].related_datasets[0].related_datasets[0].uuid,
                    "related_records": [
                      { 
                        "dataset_uuid": dataset.related_datasets[0].related_datasets[0].related_datasets[0].uuid,
                        "related_records": [
                          { 
                            "dataset_uuid": dataset.related_datasets[0].related_datasets[0].related_datasets[0].related_datasets[0].related_datasets[0].uuid,
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      };

      let response = await Helper.recordCreate(record);
      expect(response.statusCode).toBe(400);

    });

    test("Must have edit permissions on the dataset", async () => {
      let template: any = {
        name:"t1"
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = {
        template_id: template._id
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);

      let both_users = [Helper.DEF_EMAIL, Helper.EMAIL_2];
      let response = await Helper.updatePermission(template.uuid, PermissionTypes.view, both_users);
      expect(response.statusCode).toBe(200);
      response = await Helper.updatePermission(dataset.uuid, PermissionTypes.view, both_users);
      expect(response.statusCode).toBe(200);

      await Helper.setAgent(agent2);

      let record = {
        dataset_uuid: dataset.uuid
      };
      response = await Helper.recordCreate(record);
      expect(response.statusCode).toBe(401);
    })

    test("Each field in the record must supply a template_field uuid", async () => {

      let name_field: any = {
        name: "name",
        description: "someone's name"
      };
      let template: any = {
        "name":"t1",
        "fields":[name_field]
      };
      template = await Helper.templateCreatePersistTest(template);

      name_field.uuid = template.fields[0].uuid;
      name_field.value = "Caleb";

      let dataset: any = {
        template_id: template._id
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);

      delete name_field.uuid;
      let record = {
        dataset_uuid: dataset.uuid,
        fields: [name_field]
      };
      let response = await Helper.recordCreate(record);
      expect(response.statusCode).toBe(400);

    });

    test("A record can only supply a single value for each field", async () => {

      let name_field: any = {
        name: "name",
        description: "someone's name"
      };
      let template: any = {
        "name":"t1",
        "fields":[name_field]
      };
      template = await Helper.templateCreatePersistTest(template);

      name_field.uuid = template.fields[0].uuid;
      name_field.value = "Caleb";

      let dataset: any = {
        template_id: template._id
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);

      let record = {
        dataset_uuid: dataset.uuid,
        fields: [name_field, name_field]
      };
      let response = await Helper.recordCreate(record);
      expect(response.statusCode).toBe(400);

    });

    test("record cannot take related_record not accepted by template/dataset", async () => {

      let template1: any = {
        "name":"1",
        "fields":[],
        "related_templates":[{"name":"1.1"}, {"name":"1.2"}]
      };
      template1 = await Helper.templateCreatePersistTest(template1);

      let dataset = {
        template_id: template1._id,
        related_datasets: [
          {
            template_id: template1.related_templates[0]._id
          },
          {
            template_id: template1.related_templates[1]._id
          }
        ]
      };
      let dataset1 = await Helper.datasetCreatePersistTest(dataset);
      let dataset2 = await Helper.datasetCreatePersistTest(dataset);

      // Try to create a record with a related_record using an invalid dataset_uuid
      let record = {
        dataset_uuid: dataset1.uuid,
        related_records: [
          {
            dataset_uuid: dataset2.related_datasets[0].uuid
          }
        ]
      };
      let response = await Helper.recordCreate(record);
      expect(response.statusCode).toBe(400);

    });

    test("options invalid", async () => {

      let field: any = {
        name: "f1",
        public_date: (new Date()).toISOString(),
        options: [
          {
            name: "naruto"
          },
          {
            name: "sasuke"
          },
          {
            name: "sakura"
          }
        ]
      };
      let template: any = {
        "name":"t1",
        "fields":[field]
      };
      template = await Helper.templateCreatePersistTest(template);

      field.uuid = template.fields[0].uuid;
      field.options = template.fields[0].options;

      let dataset: any = {
        template_id: template._id
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);

      // option_uuid supplied not supported
      field.values = [{uuid: "invalid"}];
      let record = {
        dataset_uuid: dataset.uuid,
        fields: [field]
      };
      let response = await Helper.recordCreate(record);
      expect(response.statusCode).toBe(400);

    });

    test("related_records is a set and no related_record can be repeated", async () => {

      let template: any = {
        name:"t1",
        related_templates:[{
          name: "t2"
        }]
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = {
        template_id: template._id,
        related_datasets:[{
          template_id: template.related_templates[0]._id 
        }]
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);

      let related_record = {
        dataset_uuid: dataset.related_datasets[0].uuid
      };

      related_record = await Helper.recordCreateAndTest(related_record);

      let record = {
        dataset_uuid: dataset.uuid,
        related_records: [related_record, related_record]
      };

      let response = await Helper.recordCreate(record);
      expect(response.statusCode).toBe(400);

    });

  });
});

const populateWithDummyTemplateAndRecord = async () => {
  let f1: any = {
    "name": "t1f1"
  }

  let f2: any = {
    "name": "t1.1f1"
  }

  let template: any = { 
    "name": "t1",
    public_date: (new Date()).toISOString(),
    "fields": [f1],
    "related_templates": [
      { 
        "name": "t1.1",
        "fields": [f2]
      }
    ]
  };
  template = await Helper.templateCreatePersistTest(template);

  let dataset: any = {
    template_id: template._id,
    related_datasets: [{
        template_id: template.related_templates[0]._id
      }
    ]
  };
  dataset = await Helper.datasetCreatePersistTest(dataset);

  f1.uuid = template.fields[0].uuid;
  f1.value = "happy";
  f2.uuid = template.related_templates[0].fields[0].uuid;
  f2.value = "strawberry";

  let record = {
    dataset_uuid: dataset.uuid,
    fields: [f1],
    related_records: [{
      dataset_uuid: dataset.related_datasets[0].uuid,
      fields: [f2]
    }]
  };

  record = await Helper.recordCreateAndTest(record);
  return [template, dataset, record];
};

describe("update", () => {
  let template;
  let dataset;
  let record;

  describe("Success cases", () => {

    test("Basic update - change a field", async () => {
      [template, dataset, record] = await populateWithDummyTemplateAndRecord();

      record.fields[0].value = "sad";
      await Helper.recordUpdateAndTest(record);
    });

    test("changing options", async () => {

      let field: any = {
        name: "f1",
        options: [
          {
            name: "naruto"
          },
          {
            name: "sakura"
          },
          {
            name: "sasuke"
          }
        ]
      };
      let template: any = {
        "name":"t1",
        "fields":[field]
      };
      template = await Helper.templateCreatePersistTest(template);

      field.uuid = template.fields[0].uuid;
      field.options = template.fields[0].options;

      let dataset: any = {
        template_id: template._id
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);

      let options_uuids = [template.fields[0].options[0].uuid, template.fields[0].options[1].uuid, template.fields[0].options[2].uuid]
      field.values = [{uuid: options_uuids[0]}, {uuid: options_uuids[1]}];
      delete field.options;

      let record: any = {
        dataset_uuid: dataset.uuid,
        fields: [field]
      };
      record = await Helper.recordCreatePersistTest(record);
      expect(record.fields[0].values[0]).toEqual({uuid: options_uuids[0], name: "naruto"});
      expect(record.fields[0].values[1]).toEqual({uuid: options_uuids[1], name: "sakura"});

      record.fields[0].values[1].uuid = options_uuids[2];
      record = await Helper.recordUpdateAndTest(record);
      expect(record.fields[0].values[0]).toEqual({uuid: options_uuids[0], name: "naruto"});
      expect(record.fields[0].values[1]).toEqual({uuid: options_uuids[2], name: "sasuke"});
      expect(await Helper.recordDraftExisting(record.uuid)).toBeTruthy();
    });

  });

  describe("Failure cases", () => {

    beforeEach(async() => {
      [template, dataset, record] = await populateWithDummyTemplateAndRecord();
    });

    test("uuid in request and in object must match", async () => {

      let response = await Helper.recordUpdate(record, Helper.VALID_UUID);
      expect(response.statusCode).toBe(400);

    });

    test("uuid must exist", async () => {

      record.uuid = Helper.VALID_UUID;

      let response = await Helper.recordUpdate(record, Helper.VALID_UUID);
      expect(response.statusCode).toBe(404);

    });

    test("must have edit permissions on the dataset", async () => {
      Helper.setAgent(agent2);

      record.fields[0].value = "sad";
      let response = await Helper.recordUpdate(record, record.uuid);
      expect(response.statusCode).toBe(401);
    });

    test("once a record is persisted, its dataset may never be changed", async () => {
      record = await Helper.recordPersistAndTest(record);
      let dataset_alternative: any = {
        template_id: template._id,
        related_datasets: [{
            uuid: dataset.related_datasets[0].uuid,
            template_id: template.related_templates[0]._id
          }
        ]
      };
      dataset_alternative = await Helper.datasetCreatePersistTest(dataset_alternative);
      record.dataset_uuid = dataset_alternative.uuid;
      let response = await Helper.recordUpdate(record, record.uuid);
      expect(response.statusCode).toBe(400);
    });
  });

  describe("update after a persist: is draft different and thus created or not?", () => {

    test("public_date, field", async () => {

      let template: any = {
        name: "template",
        public_date: (new Date()).toISOString(),
        fields: [{name: "field"}]
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = {
        template_id: template._id,
        public_date: (new Date()).toISOString()
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);

      let record: any = {
        dataset_uuid: dataset.uuid,
        fields: [{uuid: template.fields[0].uuid, value: "something"}]
      };
      record = await Helper.recordCreatePersistTest(record);

      // Test that draft exists if field changes
      record.fields[0].value = "else";
      await Helper.recordUpdateAndTest(record);

      expect(await Helper.recordDraftExisting(record.uuid)).toBe(true);

    });

    test("updating a related_record creates drafts of parents but not children", async () => {
      let field: any = {"name": "t1.1.1 f1"};
      // Create and persist template
      let template: any = {
        "name":"t1",
        "related_templates":[{
          "name": "t1.1",
          "related_templates":[{
            "name": "t1.1.1",
            "fields": [field],
            "related_templates":[{
              "name": "t1.1.1.1"
            }]
          }]
        }]
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = {
        template_id: template._id,
        related_datasets: [
          {
            template_id: template.related_templates[0]._id,
            related_datasets: [
              {
                template_id: template.related_templates[0].related_templates[0]._id,
                related_datasets: [
                  {
                    template_id: template.related_templates[0].related_templates[0].related_templates[0]._id
                  }
                ]
              }
            ]
          }
        ]
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);

      field.uuid = template.related_templates[0].related_templates[0].fields[0].uuid;
      field.value = "strawberry";

      let record: any = {
        dataset_uuid: dataset.uuid,
        related_records: [{
          dataset_uuid: dataset.related_datasets[0].uuid,
          related_records: [{
            dataset_uuid: dataset.related_datasets[0].related_datasets[0].uuid,
            fields: [field],
            related_records: [{
              dataset_uuid: dataset.related_datasets[0].related_datasets[0].related_datasets[0].uuid,
            }]
          }]
        }]
      };

      record = await Helper.recordCreateAndTest(record);

      // Persist the first time
      await Helper.recordPersistAndTest(record);

      //  Submit an update on the 3rd layer
      let response = await Helper.recordDraftGet(record.uuid);
      expect(response.statusCode).toBe(200);
      record = response.body;
      record.related_records[0].related_records[0].fields[0].value = "banana";
      await Helper.recordUpdateAndTest(record);

      // The first 3 layers, but not the fourth layer, should have drafts
      expect(await Helper.recordDraftExisting(record.uuid)).toBeTruthy();
      expect(await Helper.recordDraftExisting(record.related_records[0].uuid)).toBeTruthy();
      expect(await Helper.recordDraftExisting(record.related_records[0].related_records[0].uuid)).toBeTruthy();
      expect(await Helper.recordDraftExisting(record.related_records[0].related_records[0].related_records[0].uuid)).toBeFalsy();

    });

    test("update includes no change since last persisted: no draft created", async () => {
      [template, dataset, record] = await populateWithDummyTemplateAndRecord();

      await Helper.recordPersistAndTest(record);
      await Helper.recordUpdateAndTest(record);
      expect(await Helper.recordDraftExisting(record.uuid)).toBeFalsy();
      expect(await Helper.recordDraftExisting(record.related_records[0].uuid)).toBeFalsy();
    });

    test("update includes no changes since last persisted but a new dataset has been persisted: a new draft is created", async () => {
      [template, dataset, record] = await populateWithDummyTemplateAndRecord();

      await Helper.recordPersistAndTest(record);
      dataset.public_date = (new Date()).toISOString();
      await Helper.datasetUpdatePersistTest(dataset);
      await Helper.recordUpdateAndTest(record);
      expect(await Helper.recordDraftExisting(record.uuid)).toBeTruthy();
      expect(await Helper.recordDraftExisting(record.related_records[0].uuid)).toBeFalsy();
    });

    test("update includes no changes except that a new version of a related_record has been persisted: a new draft is created", async () => {
      [template, dataset, record] = await populateWithDummyTemplateAndRecord();

      await Helper.recordPersistAndTest(record);

      let related_record = record.related_records[0];
      related_record.fields[0].value = "new value";
      await Helper.recordUpdateAndTest(related_record);
      await Helper.recordPersistAndTest(related_record);

      await Helper.recordUpdateAndTest(record);
      expect(await Helper.recordDraftExisting(record.uuid)).toBeTruthy();
      expect(await Helper.recordDraftExisting(record.related_records[0].uuid)).toBeFalsy();
    });

    // Don't need to test fields changing order because the record always preserves the field order of the templates

  });

});

describe("delete", () => {
  let template;
  let dataset;
  let record;

  test("basic delete", async () => {
    [template, dataset, record] = await populateWithDummyTemplateAndRecord();

    // Delete the parent record
    let response = await Helper.recordDelete(record.uuid);
    expect(response.statusCode).toBe(200);

    // The parent record should no longer exist
    response = await Helper.recordDraftGet(record.uuid);
    expect(response.statusCode).toBe(404);

    // But the child still should
    response = await Helper.recordDraftGet(record.related_records[0].uuid);
    expect(response.statusCode).toBe(200);
  });

  test("uuid must exist", async () => {
    let response = await Helper.recordDelete(Helper.VALID_UUID);
    expect(response.statusCode).toBe(404);
  });

  test("must have edit permissions", async () => {
    [template, dataset, record] = await populateWithDummyTemplateAndRecord();

    Helper.setAgent(agent2);
    
    let response = await Helper.recordDelete(record.uuid);
    expect(response.statusCode).toBe(401);
  });

});

describe("persist (and get persisted)", () => {

  describe("Success cases", () => {
    test("Simple persist - no fields and no related records", async () => {
      let template: any = { 
        "name": "t1"
      };
      template = await Helper.templateCreatePersistTest(template);
      let dataset: any = {
        template_id: template._id
      }
      dataset = await Helper.datasetCreatePersistTest(dataset);

      let record = {
        dataset_uuid: dataset.uuid
      }

      record = await Helper.recordCreateAndTest(record);

      await Helper.recordPersistAndTest(record);
      
    });

    test("Complex persist - with nested fields and related templates to persist", async () => {
      let record;
      [, , record] = await populateWithDummyTemplateAndRecord();
      await Helper.recordPersistAndTest(record);
    });

    test("Complex persist - changes in a nested property result in persisting for all parent properties", async () => {
      // Create and persist template
      let field: any = {"name": "f1"};
      let template: any = {
        "name":"1",
        "related_templates":[{
          "name": "2",
          "related_templates":[{
            "name": "3",
            "fields": [field],
            "related_templates":[{
              "name": "4"
            }]
          }]
        }]
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = {
        template_id: template._id,
        related_datasets: [{
          template_id: template.related_templates[0]._id,
          related_datasets: [{
            template_id: template.related_templates[0].related_templates[0]._id,
            related_datasets: [{
              template_id: template.related_templates[0].related_templates[0].related_templates[0]._id,
            }]
          }]
        }]
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);

      field.uuid = template.related_templates[0].related_templates[0].fields[0].uuid;
      field.value = "strawberry";

      let record: any = {
        dataset_uuid: dataset.uuid,
        related_records: [{
          dataset_uuid: dataset.related_datasets[0].uuid,
          related_records: [{
            dataset_uuid: dataset.related_datasets[0].related_datasets[0].uuid,
            fields: [field],
            related_records: [{
              dataset_uuid: dataset.related_datasets[0].related_datasets[0].related_datasets[0].uuid,
            }]
          }]
        }]
      };

      record = await Helper.recordCreateAndTest(record);

      // Persist the first time
      await Helper.recordPersistAndTest(record);

      // Edit the third record
      let response = await Helper.recordDraftGet(record.uuid);
      expect(response.statusCode).toBe(200);
      record = response.body;
      record.related_records[0].related_records[0].fields[0].value = "banana";
      await Helper.recordUpdateAndTest(record);

      // Record the date before we persist a second time
      let intermediate_persist_date = (new Date()).getTime();

      // Now persist the record again
      let persisted = await Helper.recordPersistAndTest(record);

      // On the third node and above, the persist date should be newer than the intermediate_persist_date. 
      // The fourth should be older
      
      expect(new Date(persisted.persist_date).getTime()).toBeGreaterThan(intermediate_persist_date);
      expect(new Date(persisted.related_records[0].persist_date).getTime()).toBeGreaterThan(intermediate_persist_date);
      expect(new Date(persisted.related_records[0].related_records[0].persist_date).getTime()).toBeGreaterThan(intermediate_persist_date);
      expect(new Date(persisted.related_records[0].related_records[0].related_records[0].persist_date).getTime()).toBeLessThan(intermediate_persist_date);
    });

    test("can create and persist records for subscribed templates", async () => {

      let subscribed_template = {
        name:"t2",
      };
      subscribed_template = await Helper.templateCreatePersistTest(subscribed_template);

      let template: any = {
        name:"t1",
        subscribed_templates:[subscribed_template]
      };
      template = await Helper.templateCreatePersistTest(template);


      let dataset: any = {
        template_id: template._id,
        related_datasets: [{
          template_id: template.subscribed_templates[0]._id
        }]
      };

      dataset = await Helper.datasetCreatePersistTest(dataset);

      let record = {
        dataset_uuid: dataset.uuid,
        related_records: [{
          dataset_uuid: dataset.related_datasets[0].uuid,
        }]
      };
      await Helper.recordCreatePersistTest(record);

    });

  });

  describe("Failure cases", () => {

    const persistFailureTest = async (uuid, responseCode, last_update?) => {
      if(!last_update) {
        last_update = await Helper.recordLastUpdateAndTest(uuid);
      }
      let response = await Helper.recordPersist(uuid, last_update);
      expect(response.statusCode).toBe(responseCode);
    };

    let template;
    let dataset;
    let record;
    beforeEach(async() => {
      [template, dataset, record] = await populateWithDummyTemplateAndRecord();
    });

    test("Record with uuid does not exist", async () => {
      await persistFailureTest(Helper.VALID_UUID, 404, new Date());
    });

    test("No changes to persist", async () => {
      await Helper.recordPersistAndTest(record);
      await persistFailureTest(record.uuid, 400);
    });

    test("A new dataset has been persisted since this record was last updated", async () => {
      // persist original data
      await Helper.recordPersistAndTest(record);
      // update record
      record.fields[0].value = "waffle";
      await Helper.recordUpdateAndTest(record);
      // update dataset and persist
      dataset.public_date = (new Date()).toISOString();
      await Helper.datasetUpdatePersistTest(dataset);
      // fail to persist record because it's dataset was just persisted
      await persistFailureTest(record.uuid, 400);
      // update record again and this time succeed in persisting 
      await Helper.recordUpdateAndTest(record);
      await Helper.recordPersistAndTest(record);
    });

    test("Last update provided must match to actual last update in the database", async () => {
      await persistFailureTest(record.uuid, 400, new Date());
    });

    test("Last update provided must match to actual last update in the database, also if sub-property is updated later", async () => {
      let parent_update = await Helper.recordLastUpdateAndTest(record.uuid);
      let related_record = record.related_records[0];
      related_record.fields[0].value = "this programmer just ate a pear";
      await Helper.recordUpdateAndTest(related_record);

      await persistFailureTest(record.uuid, 400, parent_update);

      await Helper.recordPersistAndTest(record);
    });

    test("Must have edit permissions to persist", async () => {
      let template: any = { 
        "name": "t1"
      };
      template = await Helper.templateCreatePersistTest(template);
      let dataset: any = {
        template_id: template._id
      }
      dataset = await Helper.datasetCreatePersistTest(dataset);

      let record: any = {
        dataset_uuid: dataset.uuid
      }

      record = await Helper.recordCreateAndTest(record);

      let last_update = await Helper.recordLastUpdateAndTest(record.uuid);

      Helper.setAgent(agent2);

      let response = await Helper.recordPersist(record.uuid, last_update);
      expect(response.statusCode).toBe(401);
      
    });

  });
});

describe("get persisted", () => {
  test("if user does not have view access to linked records, everything for that record except the uuid is hidden", async () => {
    
    let public_date = (new Date()).toISOString();
    let template: any = { 
      name: "t1",
      public_date,
      related_templates: [{name: "t1.1", public_date}]
    };
    template = await Helper.templateCreatePersistTest(template);  

    let dataset: any = { 
      template_id: template._id,
      public_date,
      related_datasets: [{ template_id: template.related_templates[0]._id}]
    };
    dataset = await Helper.datasetCreatePersistTest(dataset);  
    
    let record: any = { 
      dataset_uuid: dataset.uuid,
      related_records: [{dataset_uuid: dataset.related_datasets[0].uuid}]
    };
    record = await Helper.recordCreatePersistTest(record);  
    
    let view_users = [Helper.EMAIL_2, Helper.DEF_EMAIL];
    let response = await Helper.updatePermission(dataset.uuid, PermissionTypes.view, view_users);
    expect(response.statusCode).toBe(200);

    record.related_records[0] = {uuid: record.related_records[0].uuid};

    await Helper.setAgent(agent2);

    response = await Helper.recordLatestPersistedGet(record.uuid);
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject(record);   
  });

  describe("fetch permissions", () => { 

    const public_date = (new Date()).toISOString();

    test("dataset is private: cannot view", async () => {
      let template: Record<string, any> = {name: "t1", public_date};
      template = await Helper.templateCreatePersistTest(template);  

      let dataset: Record<string, any> = {template_id: template._id};
      dataset = await Helper.datasetCreatePersistTest(dataset);  
  
      let record: Record<string, any> = {dataset_uuid: dataset.uuid};
      record = await Helper.recordCreatePersistTest(record); 
      
      Helper.setAgent(agent2);
  
      let response = await Helper.recordLatestPersistedGet(record.uuid);
      expect(response.statusCode).toBe(401);
    });

    test("dataset will be public but is still private: cannot view", async () => {
      let template: Record<string, any> = {name: "t1", public_date};
      template = await Helper.templateCreatePersistTest(template);  

      let dataset: Record<string, any> = {template_id: template._id, public_date: "3000-01-01T09:17:42.718Z"};
      dataset = await Helper.datasetCreatePersistTest(dataset);  
  
      let record: Record<string, any> = {dataset_uuid: dataset.uuid};
      record = await Helper.recordCreatePersistTest(record); 
      
      Helper.setAgent(agent2);
  
      let response = await Helper.recordLatestPersistedGet(record.uuid);
      expect(response.statusCode).toBe(401);
    });

    test("dataset is public, but record is private: cannot view", async () => {
      let template: Record<string, any> = {name: "t1", public_date};
      template = await Helper.templateCreatePersistTest(template);  

      let dataset: Record<string, any> = {template_id: template._id, public_date};
      dataset = await Helper.datasetCreatePersistTest(dataset);  
  
      let record: Record<string, any> = {dataset_uuid: dataset.uuid, public_date: "3000-01-01T09:17:42.718Z"};
      record = await Helper.recordCreatePersistTest(record); 
      
      Helper.setAgent(agent2);
  
      let response = await Helper.recordLatestPersistedGet(record.uuid);
      expect(response.statusCode).toBe(401);
    });

    test("dataset and record are both public: viewable", async () => {
      let template: Record<string, any> = {name: "t1", public_date};
      template = await Helper.templateCreatePersistTest(template);  

      let dataset: Record<string, any> = {template_id: template._id, public_date};
      dataset = await Helper.datasetCreatePersistTest(dataset);  
  
      let record: Record<string, any> = {dataset_uuid: dataset.uuid, public_date};
      record = await Helper.recordCreatePersistTest(record); 
      
      Helper.setAgent(agent2);
  
      let response = await Helper.recordLatestPersistedGet(record.uuid);
      expect(response.statusCode).toBe(200);
    });

    test("field is private", async () => {
      let template: Record<string, any> = {
        name: "t1", 
        public_date,
        fields: [
          {
            name: "public",
            public_date
          },
          {
            name: "private"
          }
        ]
      };
      template = await Helper.templateCreatePersistTest(template);  

      let dataset: Record<string, any> = {template_id: template._id, public_date};
      dataset = await Helper.datasetCreatePersistTest(dataset);  
  
      let record: Record<string, any> = {dataset_uuid: dataset.uuid};
      record = await Helper.recordCreatePersistTest(record); 
      
      Helper.setAgent(agent2);
  
      let persisted_record = await Helper.testAndExtract(Helper.recordLatestPersistedGet, record.uuid);
      expect(persisted_record.fields.length).toBe(1);
      expect(persisted_record.fields[0].name).toEqual("public");

    });

  });
});

test("get persisted for a certain date", async () => {
  let template, dataset, record;
  [template, dataset, record] = await populateWithDummyTemplateAndRecord();

  let persist0 = new Date();

  await Helper.recordPersistAndTest(record);

  let persist1 = new Date();

  record.fields[0].value = '2';
  await Helper.recordUpdateAndTest(record);
  await Helper.recordPersistAndTest(record);

  let persist2 = new Date();

  record.fields[0].value = '3';
  await Helper.recordUpdateAndTest(record);
  await Helper.recordPersistAndTest(record);

  let persist3 = new Date();

  // Now we have persisted 3 times. Search for versions based on timestamps.

  let response = await Helper.recordGetPersistedBeforeTimestamp(record.uuid, persist0);
  expect(response.statusCode).toEqual(404);

  response = await Helper.recordGetPersistedBeforeTimestamp(record.uuid, persist1);
  expect(response.statusCode).toEqual(200);
  expect(response.body.fields[0].value).toEqual(expect.stringMatching("happy"));

  response = await Helper.recordGetPersistedBeforeTimestamp(record.uuid, persist2);
  expect(response.statusCode).toEqual(200);
  expect(response.body.fields[0].value).toEqual(expect.stringMatching("2"));

  response = await Helper.recordGetPersistedBeforeTimestamp(record.uuid, persist3);
  expect(response.statusCode).toEqual(200);
  expect(response.body.fields[0].value).toEqual(expect.stringMatching("3"));
});

describe("Helper.recordLastUpdate", () => {

  describe("success", () => {
    test("basic draft, no fields or related templates", async () => {
      let template: any = {
        "name":"t1"
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = {
        template_id: template._id
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);

      let record: any = {
        dataset_uuid: dataset.uuid
      };

      let before_update = new Date();

      record = await Helper.recordCreateAndTest(record);

      let last_update = await Helper.recordLastUpdateAndTest(record.uuid);
      expect(last_update.getTime()).toBeGreaterThan(before_update.getTime());
    });

    test("sub record updated later than parent record", async () => {
      let template, dataset, record;
      [template, dataset, record] = await populateWithDummyTemplateAndRecord();

      let related_record = record.related_records[0];

      let between_updates = new Date();

      await Helper.recordUpdateAndTest(related_record);

      let last_update = await Helper.recordLastUpdateAndTest(record.uuid);
      expect(last_update.getTime()).toBeGreaterThan(between_updates.getTime());
    });

    test("sub record updated and persisted later than parent dataset", async () => {

      let field: any = {name: "t1.1f1"};
      let template: any = {
        "name": "t1",
        "related_templates": [{
          "name": "t1.1",
          fields: [{name: "t1.1f1"}]
        }]
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = {
        template_id: template._id,
        related_datasets: [{
          template_id: template.related_templates[0]._id
        }]
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);

      field.uuid = template.related_templates[0].fields[0].uuid;
      field.value = "naruto";

      let record: any = {
        dataset_uuid: dataset.uuid,
        related_records: [{
          dataset_uuid: dataset.related_datasets[0].uuid,
          fields: [field]
        }]
      };
      record = await Helper.recordCreatePersistTest(record);

      let related_record: any = record.related_records[0];
      related_record.fields[0].value = "pokemon";

      let response = await Helper.recordUpdate(related_record, related_record.uuid);
      expect(response.statusCode).toEqual(200);

      let time1 = new Date();
      await Helper.recordPersistAndTest(related_record);
      let time2 = new Date();

      response = await Helper.recordLastUpdate(record.uuid);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(time1.getTime());
      expect((new Date(response.body)).getTime()).toBeLessThan(time2.getTime());
    });

    test("grandchild updated, but child deleted. Updated time should still be grandchild updated", async () => {
      let field: any = {name: "t3f1"};
      let template: any = {
        "name": "1",
        "related_templates": [{
          "name": "2",
          "related_templates": [{
            "name": "3",
            fields: [field]
          }]
        }]
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = {
        template_id: template._id,
        related_datasets: [{
          template_id: template.related_templates[0]._id,
          related_datasets: [{
            template_id: template.related_templates[0].related_templates[0]._id
          }]
        }]
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);

      field.uuid = template.related_templates[0].related_templates[0].fields[0].uuid;
      field.value = 'waffle';

      let record: any = {
        dataset_uuid: dataset.uuid,
        related_records: [{
          dataset_uuid: dataset.related_datasets[0].uuid,
          related_records: [{
            dataset_uuid: dataset.related_datasets[0].related_datasets[0].uuid,
            fields: [field]
          }]
        }]
      };
      record = await Helper.recordCreateAndTest(record);

      let record2 = record.related_records[0];
      let record3: any = record2.related_records[0];

      // persist
      await Helper.recordPersistAndTest(record);

      // Update grandchild
      record3.fields[0].value = "jutsu";

      let response = await Helper.recordUpdate(record3, record3.uuid);
      expect(response.statusCode).toBe(200);
      let update_3_timestamp = response.body.record.updated_at;

      // Now get the update timestamp for the grandparent. It should be that of the grandchild.
      response = await Helper.recordLastUpdate(record.uuid);
      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual(update_3_timestamp);
      
    });

  });

  describe("failure", () => {
    test("invalid uuid", async () => {
      let response = await Helper.recordLastUpdate("18");
      expect(response.statusCode).toBe(400);

      response = await Helper.recordLastUpdate(Helper.VALID_UUID);
      expect(response.statusCode).toBe(404);
    })

    test("must have edit permissions to get last update of draft", async () => {
      let template: any = {
        "name":"t1"
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = {
        template_id: template._id
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);

      let record: any = {
        dataset_uuid: dataset.uuid
      };
      record = await Helper.recordCreateAndTest(record);

      Helper.setAgent(agent2);

      let response = await Helper.recordLastUpdate(record.uuid);
      expect(response.statusCode).toBe(401);
    });

    test("must have view permissions to get last update of persisted", async () => {
      let template: any = {
        "name":"t1"
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = {
        template_id: template._id
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);

      let record: any = {
        dataset_uuid: dataset.uuid
      };
      record = await Helper.recordCreatePersistTest(record);

      Helper.setAgent(agent2);

      let response = await Helper.recordLastUpdate(record.uuid);
      expect(response.statusCode).toBe(401);
    });
  });
})

test("full range of operations with big data", async () => {

  let t1f1: any = {name: "t1f1"};
  let t1f2: any = {name: "t1f2"};
  let t1f3: any = {name: "t1f3"};
  let t111f1: any = {name: "t1.1.1f1"};
  let t111f2: any = {name: "t1.1.1f2"};
  let t1111f1: any = {name: "t1.1.1.1f1"};
  let t1111f2: any = {name: "t1.1.1.1f2"};
  let t112f1: any = {name: "t1.1.2f1"};
  let t112f2: any = {name: "t1.1.2f2"};
  let t1121f1: any = {name: "t1.1.2.1f1"};
  let t1121f2: any = {name: "t1.1.2.1f2"};

  let template: any = {
    name: "1",
    fields: [t1f1, t1f2, t1f3],
    related_templates: [
      {
        name: "1.1",
        related_templates: [
          {
            name: "1.1.1",
            fields: [t111f1, t111f2],
            related_templates: [
              {
                name: "1.1.1.1",
                fields: [t1111f1, t1111f2]
              },
              {
                name: "1.1.1.2"
              }
            ]
          },
          {
            name: "1.1.2",
            fields: [t112f1, t112f2],
            related_templates: [
              {
                name: "1.1.2.1",
                fields: [t1121f1, t1121f2]
              },
              {
                name: "1.1.2.2"
              }
            ]
          }
        ]
      }
    ]
  }
  template = await Helper.templateCreatePersistTest(template);

  let dataset: any = {
    template_id: template._id,
    related_datasets: [
      {
        template_id: template.related_templates[0]._id,
        related_datasets: [
          {
            template_id: template.related_templates[0].related_templates[0]._id,
            related_datasets: [
              {
                template_id: template.related_templates[0].related_templates[0].related_templates[0]._id,
              },
              {
                template_id: template.related_templates[0].related_templates[0].related_templates[1]._id
              }
            ]
          },
          {
            template_id: template.related_templates[0].related_templates[1]._id,
            related_datasets: [
              {
                template_id: template.related_templates[0].related_templates[1].related_templates[0]._id,
              },
              {
                template_id: template.related_templates[0].related_templates[1].related_templates[1]._id
              }
            ]
          }
        ]
      }
    ]
  };
  dataset = await Helper.datasetCreatePersistTest(dataset);

  t1f1.uuid = template.fields[0].uuid;
  t1f2.uuid = template.fields[1].uuid;
  t1f3.uuid = template.fields[2].uuid;
  t111f1.uuid = template.related_templates[0].related_templates[0].fields[0].uuid;
  t111f2.uuid = template.related_templates[0].related_templates[0].fields[1].uuid;
  t1111f1.uuid = template.related_templates[0].related_templates[0].related_templates[0].fields[0].uuid;
  t1111f2.uuid = template.related_templates[0].related_templates[0].related_templates[0].fields[1].uuid;
  t112f1.uuid = template.related_templates[0].related_templates[1].fields[0].uuid;
  t112f2.uuid = template.related_templates[0].related_templates[1].fields[1].uuid;
  t1121f1.uuid = template.related_templates[0].related_templates[1].related_templates[0].fields[0].uuid;
  t1121f2.uuid = template.related_templates[0].related_templates[1].related_templates[0].fields[1].uuid;

  t1f1.value = "pumpkin";
  t111f2.value = "friend";
  t1121f1.value = "mango";

  let record = {
    dataset_uuid: dataset.uuid,
    fields: [t1f1, t1f2, t1f3],
    related_records: [
      {
        dataset_uuid: dataset.related_datasets[0].uuid,
        related_records: [
          {
            dataset_uuid: dataset.related_datasets[0].related_datasets[0].uuid,
            fields: [t111f1, t111f2],
            related_records: [
              {
                dataset_uuid: dataset.related_datasets[0].related_datasets[0].related_datasets[0].uuid,
                fields: [t1111f1, t1111f2]
              },
              {
                dataset_uuid: dataset.related_datasets[0].related_datasets[0].related_datasets[1].uuid
              }
            ]
          },
          {
            dataset_uuid: dataset.related_datasets[0].related_datasets[1].uuid,
            fields: [t112f1, t112f2],
            related_records: [
              {
                dataset_uuid: dataset.related_datasets[0].related_datasets[1].related_datasets[0].uuid,
                fields: [t1121f1, t1121f2]
              },
              {
                dataset_uuid: dataset.related_datasets[0].related_datasets[1].related_datasets[1].uuid
              }
            ]
          }
        ]
      }
    ]
  };

  record = await Helper.recordCreateAndTest(record);

  await Helper.recordPersistAndTest(record);

});

describe("with files", () => {

  beforeEach(async() => {
    Helper.clearFilesAtPath(Helper.dynamicTestFilesPath);
    Helper.clearFilesAtPath(Helper.uploadsDirectoryPath);
  });
  
  afterAll(async () => {
    Helper.clearFilesAtPath(Helper.dynamicTestFilesPath);
    Helper.clearFilesAtPath(Helper.uploadsDirectoryPath);
  });

  const basicRecordSetup = async () => {
    let template: any = {
      name: "t",
      fields: [
        {
          name: "filefield",
          type: FieldTypes.File
        },
        {
          name: "otherfield"
        }
      ]
    };
    template = await Helper.templateCreatePersistTest(template);

    let dataset: any = {
      template_id: template._id
    };
    dataset = await Helper.datasetCreatePersistTest(dataset);

    let record: any = {
      dataset_uuid: dataset.uuid,
      fields: [
        {
          uuid: template.fields[0].uuid,
          file: {
            uuid: "new",
            name: "banana"
          }
        },
        {
          uuid: template.fields[1].uuid,
          value: "something"
        }
      ]
    }
    record = await Helper.recordCreateAndTest(record);
    let file_uuid = record.fields[0].file.uuid;

    return [template, dataset, record, file_uuid];
  };

  const basicSetupAndTest = async () => {
    let template, dataset, record, file_uuid;
    [template, dataset, record, file_uuid] = await basicRecordSetup();

    let file_name = "toUpload.txt";
    let file_contents = "Hello World!";

    Helper.createFile(file_name, file_contents);
    
    await Helper.testAndExtract(Helper.uploadFileDirect, file_uuid, file_name);

    let newFileBuffer = await Helper.testAndExtract(Helper.getFile, file_uuid);
    let newFileContents = newFileBuffer.toString();
    expect(newFileContents).toEqual(file_contents);

    return [template, dataset, record, file_uuid];
  };

  describe("success", () => {
    test("basic create with a file and then fetch that file", async () => {
      await basicSetupAndTest();
    });

    test("same file for multiple versions of the record", async () => {
      let template, dataset, record, file_uuid;
      [template, dataset, record, file_uuid] = await basicSetupAndTest();

      record = await Helper.recordPersistAndTest(record);
      
      record = await Helper.recordDraftGetAndTest(record.uuid);

      record.fields[1].value = "other value";

      record = await Helper.recordUpdatePersistTest(record);
      expect(record.fields[0].file.uuid).toEqual(file_uuid);

    });

    test("different versions of the record have different files", async () => {
      let template, dataset, record, file_uuid;
      [template, dataset, record, file_uuid] = await basicSetupAndTest();

      record = await Helper.recordPersistAndTest(record);

      // Create a second record version with a new file
      record = await Helper.recordDraftGetAndTest(record.uuid);
      record.fields[0].file.uuid = "new";
      record = await Helper.recordUpdateAndTest(record);
      let file_uuid_2 = record.fields[0].file.uuid;

      // Expect to get a new file_uuid for the new version
      expect(file_uuid_2).not.toEqual(file_uuid);

      // Create new file to upload to new uuid
      let file_name_2 = "different.txt";
      let file_contents = "One punch!";
      Helper.createFile(file_name_2, file_contents);
      await Helper.testAndExtract(Helper.uploadFileDirect, file_uuid_2, file_name_2);

      // test that we can get the second file
      let newFileBuffer = await Helper.testAndExtract(Helper.getFile, file_uuid_2);
      let newFileContents = newFileBuffer.toString();
      expect(newFileContents).toEqual(file_contents);

      // Publish second record with second file
      record = await Helper.recordPersistAndTest(record);

      // Can still get the old file with the old uuid
      newFileBuffer = await Helper.testAndExtract(Helper.getFile, file_uuid);
      newFileContents = newFileBuffer.toString();
      expect(newFileContents).toEqual("Hello World!");

    });

    test("removing the reference to a file. the file should get deleted", async () => {
      let template, dataset, record: any, file_uuid;
      [template, dataset, record, file_uuid] = await basicSetupAndTest();
      
      record = await Helper.recordDraftGetAndTest(record.uuid);
      delete record.fields[0].file;

      record = await Helper.recordUpdateAndTest(record);

      let response = await Helper.getFile(file_uuid);
      expect(response.statusCode).toBe(404);
    });

    test("change file name", async () => {
      let template, dataset, record, file_uuid;
      [template, dataset, record, file_uuid] = await basicSetupAndTest();

      record = await Helper.recordPersistAndTest(record);
      
      record = await Helper.recordDraftGetAndTest(record.uuid);
      record.fields[0].file.name = "waffle";

      record = await Helper.recordUpdatePersistTest(record);
    });

    test("images", async () => {
      let template: any = {
        name: "t",
        fields: [{
          name: "tf",
          type: FieldTypes.Image
        }]
      };
      template = await Helper.templateCreatePersistTest(template);
  
      let dataset: any = {
        template_id: template._id
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);
  
      let record = {
        dataset_uuid: dataset.uuid,
        fields: [{
          uuid: template.fields[0].uuid,
          images: [
            {
              uuid: "new",
              name: "banana"
            },
            {
              uuid: "new",
              name: "apple"
            }
          ]
        }]
      }
      record = await Helper.recordCreateAndTest(record);
      let image_1_uuid = record.fields[0].images[0].uuid;
      let image_2_uuid = record.fields[0].images[1].uuid;
      
      let image_1_name = "image1.txt";
      let image_1_contents = "Hello World!";
      let image_2_name = "image2.txt";
      let image_2_contents = "Waffle!";
  
      Helper.createFile(image_1_name, image_1_contents);
      Helper.createFile(image_2_name, image_2_contents);
      
      await Helper.testAndExtract(Helper.uploadFileDirect, image_1_uuid, image_1_name);
      await Helper.testAndExtract(Helper.uploadFileDirect, image_2_uuid, image_2_name);
  
      let newFileBuffer = await Helper.testAndExtract(Helper.getFile, image_1_uuid);
      let newFileContents = newFileBuffer.toString();
      expect(newFileContents).toEqual(image_1_contents);
      newFileBuffer = await Helper.testAndExtract(Helper.getFile, image_2_uuid);
      newFileContents = newFileBuffer.toString();
      expect(newFileContents).toEqual(image_2_contents);

      await Helper.recordPersistAndTest(record);
    });

    test("create returns an upload_file_map with valid uuids to upload the desired files", async () => {

      let file_field: any = {
        name: "this field holds a file",
        type: FieldTypes.File
      };
      let template: any = {
        "name":"t1",
        "fields":[file_field]
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = {
        template_id: template._id
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);

      let record = {
        dataset_uuid: dataset.uuid,
        fields: [
          {
            uuid: template.fields[0].uuid,
            file: {
              uuid: "new",
              front_end_uuid: "waffle"
            }
          }
        ]
      };
      let body = await Helper.testAndExtract(Helper.recordCreate, record);
      record = body.record;
      let upload_file_uuids = body.upload_file_uuids;

      expect(upload_file_uuids['waffle']).toEqual(record.fields[0].file.uuid)

  
      let file_name = "toUpload.txt";
      let file_contents = "Hello World!";
  
      Helper.createFile(file_name, file_contents);

      await Helper.testAndExtract(Helper.uploadFileDirect, record.fields[0].file.uuid, file_name);

    });

    test("update returns an upload_file_map with valid uuids to upload the desired files", async () => {

      let file_field: any = {
        name: "this field holds a file",
        type: FieldTypes.File
      };
      let template: any = {
        "name":"t1",
        "fields":[file_field]
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = {
        template_id: template._id
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);

      let record: Record<string, any> = {
        dataset_uuid: dataset.uuid
      };
      record = await Helper.recordCreateAndTest(record);

      record.fields = [
        {
          uuid: template.fields[0].uuid,
          file: {
            uuid: "new",
            front_end_uuid: "waffle"
          }
        }
      ];
   
      let body = await Helper.testAndExtract(Helper.recordUpdate, record, record.uuid);
      record = body.record;
      let upload_file_uuids = body.upload_file_uuids;

      expect(upload_file_uuids['waffle']).toEqual(record.fields[0].file.uuid)

  
      let file_name = "toUpload.txt";
      let file_contents = "Hello World!";
  
      Helper.createFile(file_name, file_contents);

      await Helper.testAndExtract(Helper.uploadFileDirect, record.fields[0].file.uuid, file_name);

    });

    test("also works with images", async () => {

      let file_field: any = {
        name: "this field holds images",
        type: FieldTypes.Image
      };
      let template: any = {
        "name":"t1",
        "fields":[file_field]
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = {
        template_id: template._id
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);

      let record = {
        dataset_uuid: dataset.uuid,
        fields: [
          {
            uuid: template.fields[0].uuid,
            images: [
              {
                uuid: "new",
                front_end_uuid: "waffle"
              }
            ]
          }
        ]
      };
      let body = await Helper.testAndExtract(Helper.recordCreate, record);
      record = body.record;
      let upload_file_uuids = body.upload_file_uuids;

      expect(upload_file_uuids['waffle']).toEqual(record.fields[0].images[0].uuid)

  
      let file_name = "toUpload.txt";
      let file_contents = "Hello World!";
  
      Helper.createFile(file_name, file_contents);

      await Helper.testAndExtract(Helper.uploadFileDirect, record.fields[0].images[0].uuid, file_name);

    });

  });

  describe("failure", () => {

    test("try to publish without file upload ", async () => {
      let template, dataset, record, file_uuid;
      [template, dataset, record, file_uuid] = await basicRecordSetup();

      let response = await Helper.recordPersist(record);
      expect(response.statusCode).toBe(400);
    });

    test("try to publish during file upload ", async () => {
      let template, dataset, record, file_uuid;
      [template, dataset, record, file_uuid] = await basicRecordSetup();

      let file_name = "toUpload.txt";
      let file_contents = "Hello World!";
  
      Helper.createFile(file_name, file_contents);
      
      Helper.uploadFileDirect(file_uuid, file_name);

      let response = await Helper.recordPersist(record);
      expect(response.statusCode).toBe(400);
    });

    test("try to attach a uuid that belongs to a different record + field", async () => {
      let template, dataset, record, file_uuid;
      [template, dataset, record, file_uuid] = await basicSetupAndTest();

      let record_2 = Object.assign({}, record);
      delete record_2._id;
      delete record_2.uuid;

      let response = await Helper.recordCreate(record_2);
      expect(response.statusCode).toBe(400);
    });

    test("try to upload a different file to the same uuid", async () => {
      let template, dataset, record, file_uuid;
      [template, dataset, record, file_uuid] = await basicSetupAndTest();
      
      let file_name = "different.txt";
      let file_contents = "Hello Mellon!";
  
      Helper.createFile(file_name, file_contents);

      let response = await Helper.uploadFileDirect(file_uuid, file_name);
      expect(response.statusCode).toBe(400);
    });

  });

  test("delete a record with files linked", async () => {
    let template: any = {
      name: "t",
      fields: [
        {
          name: "file",
          type: FieldTypes.File
        },
        {
          name: "images",
          type: FieldTypes.Image
        }

      ]
    };
    template = await Helper.templateCreatePersistTest(template);

    let dataset: any = {
      template_id: template._id
    };
    dataset = await Helper.datasetCreatePersistTest(dataset);

    let record: any = {
      dataset_uuid: dataset.uuid,
      fields: [
        {
          uuid: template.fields[0].uuid,
          file: {uuid: "new", name: "afile"}
        },
        {
          uuid: template.fields[1].uuid,
          images: [
            {uuid: "new", name: "image1"},
            {uuid: "new", name: "image2"}
          ]
        }
      ]
    };

    // Delete the record before uploading an actual file. All files should also be deleted.
    let created_record = await Helper.recordCreateAndTest(record);
    await Helper.testAndExtract(Helper.recordDelete, created_record.uuid);
    let response = await Helper.getFile(created_record.fields[0].file.uuid);
    expect(response.statusCode).toBe(404);
    response = await Helper.getFile(created_record.fields[1].images[0].uuid);
    expect(response.statusCode).toBe(404);
    response = await Helper.getFile(created_record.fields[1].images[1].uuid);
    expect(response.statusCode).toBe(404);

    // Delete the record after uploading an actual file. All files should also be deleted.
    created_record = await Helper.recordCreateAndTest(record);
    let file_uuid = created_record.fields[0].file.uuid;
    let image_uuid_1 = created_record.fields[1].images[0].uuid;
    let image_uuid_2 = created_record.fields[1].images[1].uuid;

    let file_name = "toUpload.txt";
    let file_contents = "Hello World!";
    Helper.createFile(file_name, file_contents);
    await Helper.testAndExtract(Helper.uploadFileDirect, file_uuid, file_name);
    await Helper.testAndExtract(Helper.uploadFileDirect, image_uuid_1, file_name);
    await Helper.testAndExtract(Helper.uploadFileDirect, image_uuid_2, file_name);

    await Helper.testAndExtract(Helper.recordDelete, created_record.uuid);
    response = await Helper.getFile(file_uuid);
    expect(response.statusCode).toBe(404);
    response = await Helper.getFile(image_uuid_1);
    expect(response.statusCode).toBe(404);
    response = await Helper.getFile(image_uuid_2);
    expect(response.statusCode).toBe(404);

  });

});