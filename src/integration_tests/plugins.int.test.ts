var { PermissionTypes } = require('../models/permission');
var { app, init: appInit, close: appClose } = require('../app');
var HelperClass = require('./common_test_operations');
var Helper = new HelperClass(app);

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

describe("template", () => {
  describe("success", () => {
    test("Basic - can create, edit and fetch field and object plugins", async () => {

      let template: any = {
        name: "template with field and object plugins",
        fields: [
          {
            name: "basic field"
          }
        ],
        related_templates: []
      };
      template = await Helper.templateCreateAndTest(template);
  
      template.plugins = {
        field_plugins: {
          [template.fields[0].uuid]: {
              "field_plugin": 0.2
          }
        },
        object_plugins: {
          "object_plugin": 0.1
        }
      }
      await Helper.templateUpdateAndTest(template);
    });
  
    test("Complicated - can create, edit and fetch field and object plugins", async () => {
  
      let template: any = {
        name: "parent",
        fields: [
          {
            name: "basic field"
          }
        ],
        related_templates: [
          {
            name: "child 1",
            fields: [
              {name: "child 1 field 1"},
              {name: "dup field name"}
            ]
          },
          {
            name: "child 2",
            fields: [
              {name: "dup field name"}
            ]
          }
        ]
      };
      template = await Helper.templateCreateAndTest(template);
  
      template.plugins = {
        field_plugins: {
          [template.fields[0].uuid]: {
              "field_plugin": 0.2,
              "second field plugin": 1.4
          }
        },
        object_plugins: {
          "object_plugin": 0.1,
          "second object plugin": 0.46
        }
      }
      template.related_templates[0].plugins = {
        field_plugins: {
          [template.related_templates[0].fields[0].uuid]: {
              "field_plugin": 0.2,
              "second field plugin": 1.4
          },
          [template.related_templates[0].fields[1].uuid]: {
            "field_plugin": 0.2,
            "second field plugin": 1.4
          }
        },
        object_plugins: {
          "object_plugin": 0.1,
          "second object plugin": 0.46
        }
      }
      template.related_templates[1].plugins = {
        field_plugins: {
          [template.related_templates[1].fields[0].uuid]: {
              "field_plugin": 0.2,
              "second field plugin": 1.4
          }
        },
        object_plugins: {
          "object_plugin": 0.1,
          "second object plugin": 0.46
        }
      }
      await Helper.templateUpdateAndTest(template);

      template = await Helper.templatePersistAndFetch(template.uuid);
    });

    test("If no _id provided, update draft or latest_persisted for uuid if uuid provided", async () => {

      let template: any = {
        name: "template with field and object plugins",
        related_templates: []
      };
      template = await Helper.templateCreateAndTest(template);
  
      template.plugins = {
        field_plugins: {},
        object_plugins: {
          "object_plugin": 0.1
        }
      }
      delete template._id;
      await Helper.templateUpdateAndTest(template);

      template = {
        name: "template with field and object plugins",
        related_templates: []
      };
      template = await Helper.templateCreatePersistTest(template);
  
      template.plugins = {
        field_plugins: {},
        object_plugins: {
          "object_plugin": 0.1
        }
      }
      delete template._id;
      await Helper.templateUpdateAndTest(template);
    });

    test("If a draft is automatically created, plugins are automatically created with it", async () => {

      let template: any = {
        name: "template with field and object plugins",
        fields: [
          {
            name: "basic field"
          }
        ],
        related_templates: []
      };
      template = await Helper.templateCreateAndTest(template);
  
      template.plugins = {
        field_plugins: {
          [template.fields[0].uuid]: {
              "field_plugin": 0.2
          }
        },
        object_plugins: {
          "object_plugin": 0.1
        }
      }
      await Helper.templateUpdatePersistTest(template);

      let field = template.fields[0];
      field.name = "still basic";
      await Helper.templateFieldUpdateAndTest(field);

      template = await Helper.templateDraftGet(template.uuid);
      expect(template).toHaveProperty('plugins');

    });

  });
});

describe("dataset", () => {
  describe("success", () => {
    test("Basic - can create, edit and fetch field and object plugins", async () => {

      let template: any = {
        name: "template with field and object plugins",
        fields: [
          {
            name: "basic field"
          }
        ]
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = {
        name: "dataset with field and object plugins",
        template_id: template._id
      };
      dataset = await Helper.datasetCreateAndTest(dataset);
  
      dataset.plugins = {
        field_plugins: {
          [template.fields[0].uuid]: {
              "field_plugin": 0.2
          }
        },
        object_plugins: {
          "object_plugin": 0.1
        }
      }
      await Helper.datasetUpdateAndTest(dataset);
    });
  
    test("Complicated - can create, edit and fetch field and object plugins", async () => {
  
      let template: any = {
        name: "parent",
        fields: [
          {
            name: "basic field"
          }
        ],
        related_templates: [
          {
            name: "child 1",
            fields: [
              {name: "child 1 field 1"},
              {name: "dup field name"}
            ]
          },
          {
            name: "child 2",
            fields: [
              {name: "dup field name"}
            ]
          }
        ]
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = {
        name: "parent",
        template_id: template._id,
        related_datasets: [
          {
            name: "child 1",
            template_id: template.related_templates[0]._id
          },
          {
            name: "child 2",
            template_id: template.related_templates[1]._id
          }
        ]
      };
      dataset = await Helper.datasetCreateAndTest(dataset);
  
      dataset.plugins = {
        field_plugins: {
          [template.fields[0].uuid]: {
              "field_plugin": 0.2,
              "second field plugin": 1.4
          }
        },
        object_plugins: {
          "object_plugin": 0.1,
          "second object plugin": 0.46
        }
      }
      dataset.related_datasets[0].plugins = {
        field_plugins: {
          [template.related_templates[0].fields[0].uuid]: {
              "field_plugin": 0.2,
              "second field plugin": 1.4
          },
          [template.related_templates[0].fields[1].uuid]: {
            "field_plugin": 0.2,
            "second field plugin": 1.4
          }
        },
        object_plugins: {
          "object_plugin": 0.1,
          "second object plugin": 0.46
        }
      }
      dataset.related_datasets[1].plugins = {
        field_plugins: {
          [template.related_templates[1].fields[0].uuid]: {
              "field_plugin": 0.2,
              "second field plugin": 1.4
          }
        },
        object_plugins: {
          "object_plugin": 0.1,
          "second object plugin": 0.46
        }
      }
      await Helper.datasetUpdateAndTest(dataset);
    });


    test("If no _id provided, update draft or latest_persisted for uuid if uuid provided", async () => {

      let template: any = {
        name: "dataset with field and object plugins",
        related_templates: []
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = {
        name: "template with field and object plugins",
        template_id: template._id
      };
      dataset = await Helper.datasetCreateAndTest(dataset);
  
      dataset.plugins = {
        field_plugins: {},
        object_plugins: {
          "object_plugin": 0.1
        }
      }
      delete dataset._id;
      await Helper.datasetUpdateAndTest(dataset);

      dataset = {
        name: "template with field and object plugins",
        template_id: template._id
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);
  
      dataset.plugins = {
        field_plugins: {},
        object_plugins: {
          "object_plugin": 0.1
        }
      }
      delete dataset._id;
      await Helper.datasetUpdateAndTest(dataset);
    });
  });
});

describe("record", () => {
  describe("success", () => {
    test("get plugins for template", async () => {
      let template: any = {
        name: "template with field and object plugins",
        fields: [
          {
            name: "basic field"
          }
        ],
        related_templates: []
      };
      template = await Helper.templateCreateAndTest(template);
  
      template.plugins = {
        field_plugins: {
          [template.fields[0].uuid]: {
              "field_plugin": 0.2
          }
        },
        object_plugins: {
          "object_plugin": 0.1
        }
      }
      template = await Helper.templateUpdatePersistTest(template);

      let dataset: any = {
        name: "dataset with field and object plugins",
        template_id: template._id
      }
      dataset = await Helper.datasetCreatePersistTest(dataset);

      let record: any = {
        dataset_uuid: dataset.uuid,
        fields: [
          {uuid: template.fields[0].uuid, value: "value"}
        ]
      };
      record = await Helper.recordCreateAndTest(record);
      expect(Object.keys(record.plugins).length).toBe(1);
      expect(record.plugins["object_plugin"]).toEqual(0.1);
      expect(Object.keys(record.fields[0].plugins).length).toBe(1);
      expect(record.fields[0].plugins["field_plugin"]).toEqual(0.2);

    });

    test("get plugins for dataset", async () => {
      let template: any = {
        name: "template with field and object plugins",
        fields: [
          {
            name: "basic field"
          }
        ],
        related_templates: []
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = {
        name: "dataset with field and object plugins",
        template_id: template._id
      }
      dataset = await Helper.datasetCreateAndTest(dataset);

      dataset.plugins = {
        field_plugins: {
          [template.fields[0].uuid]: {
              "field_plugin": 0.2
          }
        },
        object_plugins: {
          "object_plugin": 0.1
        }
      }
      dataset = await Helper.datasetUpdatePersistTest(dataset);

      let record: any = {
        dataset_uuid: dataset.uuid,
        fields: [
          {uuid: template.fields[0].uuid, value: "value"}
        ]
      };
      record = await Helper.recordCreateAndTest(record);
      expect(Object.keys(record.plugins).length).toBe(1);
      expect(record.plugins["object_plugin"]).toEqual(0.1);
      expect(Object.keys(record.fields[0].plugins).length).toBe(1);
      expect(record.fields[0].plugins["field_plugin"]).toEqual(0.2);

    });

    test("get plugins for both, and at multiple levels", async () => {
      let template: any = {
        name: "parent template",
        fields: [
          {name: "field 1"},
          {name: "field 2"}
        ],
        related_templates: [
          {
            name: "child template",
            fields: [
              {name: "field 3"}
            ]
          }
        ]
      };
      template = await Helper.templateCreatePersistTest(template);

      template.plugins = {
        field_plugins: {
          [template.fields[0].uuid]: {
            "field 1 plugin 1": 0.1,
            "field 1 plugin 2": 0.1
          },
          [template.fields[1].uuid]: {
            "field 2 plugin 1": 0.1
          }
        },
        object_plugins: {
          "parent plugin 1": 0.1,
          "parent plugin 2": 0.1
        }
      }
      template.related_templates[0].plugins = {
        field_plugins: {
          [template.related_templates[0].fields[0].uuid]: {
            "field 3 plugin 1": 0.1,
            "field 3 plugin 2": 0.1
          }
        },
        object_plugins: {
          "child plugin 1": 0.1,
          "child plugin 2": 0.1
        }
      }

      template = await Helper.templateUpdateAndTest(template);

      let dataset: any = {
        name: "parent dataset",
        template_id: template._id,
        related_datasets: [
          {
            name: "child dataset",
            template_id: template.related_templates[0]._id
          }
        ]
      }
      dataset = await Helper.datasetCreateAndTest(dataset);

      dataset.plugins = {
        field_plugins: {
          [template.fields[0].uuid]: {
            "field 1 plugin 1": 'deleted'
          },
          [template.fields[1].uuid]: {
            "field 2 plugin 1": 0.2
          }
        },
        object_plugins: {
          "parent plugin 2": 0.2
        }
      }

      dataset.related_datasets[0].plugins = {
        field_plugins: {
          [template.related_templates[0].fields[0].uuid]: {
            "field 3 plugin 2": 0.2
          }
        },
        object_plugins: {
          "child plugin 2": 0.2
        }
      }
      dataset = await Helper.datasetUpdatePersistTest(dataset);

      let record: any = {
        dataset_uuid: dataset.uuid,
        fields: [
          {uuid: template.fields[0].uuid, value: "value"}
        ],
        related_records: [
          {
            dataset_uuid: dataset.related_datasets[0].uuid
          }
        ]
      };
      record = await Helper.recordCreateAndTest(record);
      expect(Object.keys(record.plugins).length).toBe(2);
      expect(record.plugins["parent plugin 1"]).toEqual(0.1);
      expect(record.plugins["parent plugin 2"]).toEqual(0.2);
      expect(Object.keys(record.fields[0].plugins).length).toBe(1);
      expect(record.fields[0].plugins["field 1 plugin 2"]).toEqual(0.1);
      expect(Object.keys(record.fields[1].plugins).length).toBe(1);
      expect(record.fields[1].plugins["field 2 plugin 1"]).toEqual(0.2);

      let related_record = record.related_records[0];
      expect(Object.keys(related_record.plugins).length).toBe(2);
      expect(related_record.plugins["child plugin 1"]).toEqual(0.1);
      expect(related_record.plugins["child plugin 2"]).toEqual(0.2);
      expect(Object.keys(related_record.fields[0].plugins).length).toBe(2);
      expect(related_record.fields[0].plugins["field 3 plugin 1"]).toEqual(0.1);
      expect(related_record.fields[0].plugins["field 3 plugin 2"]).toEqual(0.2);

    });

  });
});