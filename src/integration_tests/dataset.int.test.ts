var { PermissionTypes } = require('../models/permission');
var { app, init: appInit, close: appClose } = require('../app');
var HelperClass = require('./common_test_operations');
var Helper = new HelperClass(app);
const Util = require('../lib/util');

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

test("new dataset for template", async () => {

  let template: any = {
    "name":"t1",
    related_templates: [
      {
        name: "t1.1",
        related_templates: [
          {
            name: "t1.1.1"
          },
          {
            name: "t1.1.2"
          }
        ]
      },
      {
        name: "t1.2",
        related_templates: [
          {
            name: "t1.2.1"
          },
          {
            name: "t1.2.2"
          }
        ]
      }
    ]
  };
  template = await Helper.templateCreatePersistTest(template);

  let dataset = await Helper.testAndExtract(Helper.newDatasetForTemplate, template.uuid);
  await Helper.datasetCreateAndTest(dataset);

});

describe("create (and get draft)", () => {
  describe("Success cases", () => {

    test("No related datasets", async () => {

      let template: any = {
        "name":"t1"
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset = {
        name: "waffle",
        template_id: template._id
      };

      await Helper.datasetCreateAndTest(dataset);

    });

    test("Template isn't persisted, but have edit permissions", async () => {

      let template: any = {
        "name":"t1"
      };
      template = await Helper.templateCreateAndTest(template);

      let dataset = {
        template_id: template._id
      };

      await Helper.datasetCreateAndTest(dataset);

    });

    test("only one related dataset", async () => {

      let template: any = {
        name:"t1",
        related_templates:[{
          name: "t2"
        }]
      };
      template = await Helper.templateCreatePersistTest(template);


      let dataset = {
        template_id: template._id,
        related_datasets: [{
          template_id: template.related_templates[0]._id
        }]
      };

      await Helper.datasetCreateAndTest(dataset);

    });

    test("Create dataset with related datasets going 6 nodes deep", async () => {
  
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

      let dataset = { 
        template_id: template._id,
        "related_datasets": [
          { 
            template_id: template.related_templates[0]._id,
            "related_datasets": [
              { 
                template_id: template.related_templates[0].related_templates[0]._id,
                "related_datasets": [
                  { 
                    template_id: template.related_templates[0].related_templates[0].related_templates[0]._id,
                    "related_datasets": [
                      { 
                        template_id: template.related_templates[0].related_templates[0].related_templates[0].related_templates[0]._id,
                        "related_datasets": [
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

      await Helper.datasetCreateAndTest(dataset);

    });

    test("one related dataset, which already exists", async () => {

      let template: any = {
        name:"t1",
        related_templates:[{
          name: "t2"
        }]
      };
      template = await Helper.templateCreatePersistTest(template);

      let related_dataset = {
        template_id: template.related_templates[0]._id
      };

      related_dataset = await Helper.datasetCreateAndTest(related_dataset);

      let dataset = {
        template_id: template._id,
        related_datasets: [related_dataset]
      };

      await Helper.datasetCreateAndTest(dataset);

    });

    test("link one related dataset user only has view permissions for, and one the user has no permissions for", async () => {

      let template: any = {
        name:"t1",
        related_templates:[{
          name: "t1.1"
        },
        {
          name: "t1.2"
        }]
      };
      template = await Helper.templateCreatePersistTest(template);

      let related_dataset_1: any = {
        template_id: template.related_templates[0]._id
      };
      let related_dataset_2: any = {
        template_id: template.related_templates[1]._id
      };

      let related_dataset_1_persisted = await Helper.datasetCreatePersistTest(related_dataset_1);
      let related_dataset_2_persisted = await Helper.datasetCreatePersistTest(related_dataset_2);

      related_dataset_1.uuid = related_dataset_1_persisted.uuid;
      related_dataset_2.uuid = related_dataset_2_persisted.uuid;

      let view_users = [Helper.DEF_EMAIL, Helper.EMAIL_2];
      let response = await Helper.updatePermission(template.related_templates[0].uuid, PermissionTypes.view, view_users);
      expect(response.statusCode).toBe(200);
      response = await Helper.updatePermission(related_dataset_1_persisted.uuid, PermissionTypes.view, view_users);
      expect(response.statusCode).toBe(200);

      response = await Helper.updatePermission(template.uuid, PermissionTypes.view, view_users);
      expect(response.statusCode).toBe(200);

      let dataset = {
        template_id: template._id,
        related_datasets: [related_dataset_1, {uuid: related_dataset_2_persisted.uuid}]
      };

      await Helper.setAgent(agent2);

      await Helper.datasetCreateAndTest(dataset);

    });

    test("group ids are the same for datasets created together, but different for anything linked that was created elsewhere", async () => {

      let template: any = {
        name:"t1",
        related_templates:[
          {
            name: "t1.1",
            related_templates:[{
              name: "t1.1.1"
            }]
          },
          {
            name: "t1.2",
            related_templates:[{
              name: "t1.2.1"
            }]
          }
        ]
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset12 = {
        template_id: template.related_templates[1]._id,
        related_datasets: [{
          template_id: template.related_templates[1].related_templates[0]._id
        }]
      }
      dataset12 = await Helper.datasetCreateAndTest(dataset12);

      let dataset1: any = {
        template_id: template._id,
        related_datasets: [
          {
            template_id: template.related_templates[0]._id,
            related_datasets: [{
              template_id: template.related_templates[0].related_templates[0]._id
            }]
          },
          dataset12
        ]
      };
      dataset1 = await Helper.datasetCreateAndTest(dataset1);

      // check that dataset 1, 1.1, and 1.1.1 all have the same group_uuid, and that 1.2 and 1.2.1 have the same group_uuid (but different than 1)
      expect(dataset1.group_uuid).toEqual(dataset1.related_datasets[0].group_uuid);
      expect(dataset1.group_uuid).toEqual(dataset1.related_datasets[0].related_datasets[0].group_uuid);
      expect(dataset1.group_uuid).not.toEqual(dataset1.related_datasets[1].group_uuid);
      expect(dataset1.related_datasets[1].group_uuid).toEqual(dataset1.related_datasets[1].related_datasets[0].group_uuid);

    });

    test("Can match dataset to template even if the order of related_datasets does not match related_templates", async () => {

      let template: any = {
        name:"t1",
        related_templates: [
          {name: "t1.1"},
          {name: "t1.2"}
        ]
      };

      template = await Helper.templateCreatePersistTest(template);

      // uuid list using the templates in the wrong order
      let dataset = {
        template_id: template._id,
        related_datasets: [
          { 
            template_id: template.related_templates[1]._id
          },
          { 
            template_id: template.related_templates[0]._id
          }
        ]
      };
      await Helper.datasetCreateAndTest(dataset);
    });

    test("two related_datasets pointing to the same related_template", async () => {

      let template: any = {
        name:"t1",
        related_templates:[{
          name: "t2"
        }]
      };
      template = await Helper.templateCreatePersistTest(template);


      let dataset = {
        template_id: template._id,
        related_datasets: [
          {
            template_id: template.related_templates[0]._id
          },
          {
            template_id: template.related_templates[0]._id
          }
        ]
      };

      await Helper.datasetCreateAndTest(dataset);

    });

    test("automatically create dataset and related_datasets from template", async () => {

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
        ]
      };
      template = await Helper.templateCreatePersistTest(template);


      let dataset: Record<string, any> = {
        template_id: template._id,
        public_date: (new Date()).toISOString()
      };

      dataset = await Helper.datasetCreateAndTest(dataset);

      expect(dataset.related_datasets[0].template_id).toEqual(template.related_templates[0]._id);
      expect(dataset.related_datasets[0].related_datasets[0].template_id).toEqual(template.related_templates[0].related_templates[0]._id);

    });

  });

  describe("Failure cases", () => {

    test("Input must be an object", async () => {
      let dataset = [];
      let response = await Helper.datasetCreate(dataset);
      expect(response.statusCode).toBe(400);
    });

    test("Template _id must exist and the user must have access to it", async () => {

      // no template exists with this _id
      let dataset = {
        template_id: 6
      };
      let response = await Helper.datasetCreate(dataset);
      expect(response.statusCode).toBe(400);

      // persisted template exists with this uuid but user does not have view access to it
      let template: any = {
        name: "t1"
      };
      template = await Helper.templateCreatePersistTest(template);
      dataset = {
        template_id: template._id
      };

      Helper.setAgent(agent2);

      response = await Helper.datasetCreate(dataset);
      expect(response.statusCode).toBe(401);

      // persisted template exists with this uuid but user does not have view access to it
      Helper.setAgent(agent1);
      template = {
        name: "t2"
      };
      template = await Helper.templateCreateAndTest(template);
      dataset = {
        template_id: template._id
      };

      Helper.setAgent(agent2);

      response = await Helper.datasetCreate(dataset);
      expect(response.statusCode).toBe(401);      

    });

    test("All properties must be of the correct type", async () => {

      let template: any = {
        name:"t1",
        public_date: (new Date()).toISOString(),
      };

      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = {
        public_date: (new Date()).toISOString(),
        template_id: template._id,
        related_datasets: []
      };
      await Helper.datasetCreateAndTest(dataset);

      dataset = {
        public_date: "not a date",
        template_id: template._id,
        related_datasets: []
      };
      let response = await Helper.datasetCreate(dataset);
      expect(response.statusCode).toBe(400);

      dataset = {
        public_date: (new Date()).toISOString(),
        template_id: template._id,
        related_datasets: "invalid"
      };
      response = await Helper.datasetCreate(dataset);
      expect(response.statusCode).toBe(400);

    });

    test("Dataset must match format of template", async () => {

      let template: any = {
        name:"t1",
        related_templates: [
          {name: "t1.1"},
          {name: "t1.2"}
        ]
      };

      template = await Helper.templateCreatePersistTest(template);

      // all related templates match validly
      let dataset: any = {
        template_id: template._id,
        related_datasets: [
          { 
            template_id: template.related_templates[0]._id
          },
          { 
            template_id: template.related_templates[1]._id
          }
        ]
      };
      await Helper.datasetCreateAndTest(dataset);

      // arrays must be of same length
      dataset = {
        template_id: template._id,
        related_datasets: []
      };
      let response = await Helper.datasetCreate(dataset);
      expect(response.statusCode).toBe(400);

      // related_datasets don't match up to related_templates
      dataset = {
        template_id: template._id,
        related_datasets: [
          { 
            template_id: template.related_templates[0]._id
          },
          { 
            template_id: template.related_templates[0]._id
          }
        ]
      };
      response = await Helper.datasetCreate(dataset);
      expect(response.statusCode).toBe(400);
    });

    test("Create dataset with related_datasets going 6 nodes deep, but 2nd-to last dataset is invalid", async () => {
  
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

      let dataset = { 
        template_id: template._id,
        "related_datasets": [
          { 
            template_id: template.related_templates[0]._id,
            "related_datasets": [
              { 
                template_id: template.related_templates[0].related_templates[0]._id,
                "related_datasets": [
                  { 
                    template_id: template.related_templates[0].related_templates[0].related_templates[0]._id,
                    "related_datasets": [
                      { 
                        template_id: template.related_templates[0].related_templates[0].related_templates[0]._id,
                        "related_datasets": [
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
      let response = await Helper.datasetCreate(dataset);
      expect(response.statusCode).toBe(400);

    });

    test("Public date must be greater than template public date", async () => {

      let template: any = {
        name:"t1"
      };

      template = await Helper.templateCreatePersistTest(template);

      let dataset = {
        public_date: (new Date()).toISOString(),
        template_id: template._id,
        related_datasets: []
      };
      let response = await Helper.datasetCreate(dataset);
      expect(response.statusCode).toBe(400);

    });

    test("there must be at least one related_dataset pointing to each related_template from the template", async () => {

      let template: any = {
        name:"t1",
        related_templates:[{
          name: "t2"
        }]
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset = {
        template_id: template._id,
        related_datasets: []
      };
      let response = await Helper.datasetCreate(dataset);
      expect(response.statusCode).toBe(400);

    });

    test("related_dataset can't point to a related_template not supported by the template", async () => {

      let template: any = {
        name:"t1",
        related_templates:[{
          name: "t2"
        }]
      };
      template = await Helper.templateCreatePersistTest(template);

      let other_template: any = {
        name: "other"
      }
      other_template = await Helper.templateCreatePersistTest(other_template);


      let dataset = {
        template_id: template._id,
        related_datasets: [{
          template_id: other_template._id
        }]
      };

      let response = await Helper.datasetCreate(dataset);
      expect(response.statusCode).toBe(400);

    });

    test("A given dataset may only have a maximum of one instance of a related_dataset", async () => {
  
      let template: any = { 
        name: "kakashi",
        related_templates: [{
          name: "naruto"
        }],
      };
      template = await Helper.templateCreatePersistTest(template);

      let related_dataset = {
        template_id: template.related_templates[0]._id
      };
      related_dataset = await Helper.datasetCreateAndTest(related_dataset);

      let dataset = { 
        template_id: template._id,
        related_datasets: [related_dataset, related_dataset],
      };
      let response = await Helper.datasetCreate(dataset);
      expect(response.statusCode).toBe(400);
    });

    test("A related_dataset can't reference a related_template not supported by the dataset's template", async () => {
  
      let template: any = { 
        name: "kakashi",
        related_templates: [{
          name: "naruto"
        }],
      };
      template = await Helper.templateCreatePersistTest(template);

      let other_template: any = {
        name: "sasuke"
      };
      other_template = await Helper.templateCreatePersistTest(other_template);

      let dataset = { 
        template_id: template._id,
        related_datasets: [{
          template_id: other_template._id
        }]
      };
      let response = await Helper.datasetCreate(dataset);
      expect(response.statusCode).toBe(400);
    });


  });
});

const populateWithDummyTemplateAndDataset = async () => {

  let template: any = { 
    "name": "t1",
    public_date: (new Date()).toISOString(),
    "related_templates": [
      { 
        "name": "t2",
        public_date: (new Date()).toISOString()
      }
    ]
  };
  template = await Helper.templateCreatePersistTest(template);

  let dataset = {
    template_id: template._id,
    related_datasets: [{
      template_id: template.related_templates[0]._id
    }]
  };

  dataset = await Helper.datasetCreateAndTest(dataset);

  return [template, dataset];
};

describe("update (and get draft)", () => {
  let template;
  let dataset;
  describe("Success cases", () => {
    beforeEach(async() => {
      [template, dataset] = await populateWithDummyTemplateAndDataset();
    });

    test("Basic update - change dataset public date and name", async () => {
      dataset.public_date = (new Date()).toISOString();
      await Helper.datasetUpdateAndTest(dataset);

      dataset.name = "waffle";
      await Helper.datasetUpdateAndTest(dataset);
    });

    test("Change template used by the dataset", async () => {
      let new_template: any = { name: "t2"};
      new_template = await Helper.templateCreatePersistTest(new_template);

      dataset = {
        uuid: dataset.uuid,
        template_id: new_template._id
      }

      await Helper.datasetUpdateAndTest(dataset);
    });

  });
  describe("Failure cases", () => {
    beforeEach(async() => {
      [template, dataset] = await populateWithDummyTemplateAndDataset();
    });

    test("uuid in request and in object must match", async () => {
      let response = await Helper.datasetUpdate(Helper.VALID_UUID, dataset);
      expect(response.statusCode).toBe(400);
    });

    test("uuid must exist", async () => {
      dataset.uuid = Helper.VALID_UUID;
      let response = await Helper.datasetUpdate(Helper.VALID_UUID, dataset);
      expect(response.statusCode).toBe(404);
    });

    test("User must have edit access", async () => {
      Helper.setAgent(agent2);
      let response = await Helper.datasetUpdate(dataset.uuid, dataset);
      expect(response.statusCode).toBe(401);
    });

  });

  describe("update after a persist: is draft different and thus created or not?", () => {

    test("update includes no change since last persisted", async () => {
      [template, dataset] = await populateWithDummyTemplateAndDataset();

      dataset = await Helper.datasetPersistAndFetch(dataset.uuid);
      dataset = await Helper.datasetUpdateAndTest(dataset);
      expect(dataset).toHaveProperty("persist_date");
      expect(await Helper.datasetDraftExistingAndTest(dataset.uuid)).toBeFalsy();
      expect(await Helper.datasetDraftExistingAndTest(dataset.related_datasets[0].uuid)).toBeFalsy();
    });

    test("template_uuid, public date and name", async () => {
      let template: any = {
        name: "naruto",
        public_date: (new Date()).toISOString()
      };
      template = await Helper.templateCreatePersistTest(template);
  
      let dataset: any = {
        template_id: template._id
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);
      expect(await Helper.datasetDraftExistingAndTest(dataset.uuid)).toBe(false);

      dataset.name = "different";
      await Helper.datasetUpdateAndTest(dataset);
      expect(await Helper.datasetDraftExistingAndTest(dataset.uuid)).toBe(true);
  
      let template_2: any = {
        name: "sasuke",
        public_date: (new Date()).toISOString()
      };
      template_2 = await Helper.templateCreatePersistTest(template_2);
      dataset.template_id = template_2._id;
      dataset.name = "";
      await Helper.datasetUpdateAndTest(dataset);
      expect(await Helper.datasetDraftExistingAndTest(dataset.uuid)).toBe(true);
  
      dataset.template_id = template._id;
      dataset.public_date = (new Date()).toISOString();
      await Helper.datasetUpdateAndTest(dataset);
      expect(await Helper.datasetDraftExistingAndTest(dataset.uuid)).toBe(true);
  
    });

    test("new related_dataset", async () => {
      [template, dataset] = await populateWithDummyTemplateAndDataset();

      dataset = await Helper.datasetPersistAndFetch(dataset.uuid);

      let new_related_dataset = dataset.related_datasets[0];
      delete new_related_dataset.uuid;
      delete new_related_dataset.group_uuid;
      new_related_dataset =  await Helper.datasetCreatePersistTest(new_related_dataset);

      dataset.related_datasets = [new_related_dataset];

      await Helper.datasetUpdateAndTest(dataset);
      expect(await Helper.datasetDraftExistingAndTest(dataset.uuid)).toBeTruthy();
    });

    test("a new version of the linked template has been persisted", async () => {
      [template, dataset] = await populateWithDummyTemplateAndDataset();

      // Modify the related template and persist it 
      // Nothing should change, since datasets point to template _ids

      dataset = await Helper.datasetPersistAndFetch(dataset.uuid);
      template.description = "des";
      template = await Helper.templateUpdatePersistTest(template);
      await Helper.testAndExtract(Helper.datasetUpdate, dataset.uuid, dataset);
      expect(await Helper.datasetDraftExistingAndTest(dataset.uuid)).toBeFalsy();
      expect(await Helper.datasetDraftExistingAndTest(dataset.related_datasets[0].uuid)).toBeFalsy();
    });

    test("a new version of a related_dataset has been persisted", async () => {
      [template, dataset] = await populateWithDummyTemplateAndDataset();

      dataset = await Helper.datasetPersistAndFetch(dataset.uuid);

      let related_dataset = dataset.related_datasets[0];
      related_dataset.public_date = (new Date()).toISOString();
      await Helper.datasetUpdateAndTest(related_dataset);
      await Helper.datasetPersistAndFetch(related_dataset.uuid);

      await Helper.datasetUpdateAndTest(dataset);
      expect(await Helper.datasetDraftExistingAndTest(dataset.uuid)).toBeTruthy();
      expect(await Helper.datasetDraftExistingAndTest(related_dataset.uuid)).toBeFalsy();
    });

    test("updating a related_dataset creates drafts of parents but not children", async () => {
      // Create and persist template
      let template: any = {
        "name":"t1",
        "related_templates":[{
          "name": "t2",
          "related_templates":[{
            "name": "t3",
            public_date: (new Date()).toISOString(),
            "related_templates":[{
              "name": "t4"
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

      // Persist the first time
      dataset = await Helper.datasetCreatePersistTest(dataset);

      //  Submit an update on the 3rd layer
      let response = await Helper.datasetLatestPersisted(dataset.uuid);
      expect(response.statusCode).toBe(200);
      dataset = response.body;
      dataset.related_datasets[0].related_datasets[0].public_date = (new Date()).toISOString();
      await Helper.datasetUpdateAndTest(dataset);

      // The first 3 layers, but not the fourth layer, should have drafts
      expect(await Helper.datasetDraftExistingAndTest(dataset.uuid)).toBeTruthy();
      expect(await Helper.datasetDraftExistingAndTest(dataset.related_datasets[0].uuid)).toBeTruthy();
      expect(await Helper.datasetDraftExistingAndTest(dataset.related_datasets[0].related_datasets[0].uuid)).toBeTruthy();
      expect(await Helper.datasetDraftExistingAndTest(dataset.related_datasets[0].related_datasets[0].related_datasets[0].uuid)).toBeFalsy();

    });

    test("if a subscribed template is updated and persisted but the dataset's subscribed reference doesn't change, dataset doesn't update", async () => {

      let subscribed_template: any = {name: "sub"};
      subscribed_template = await Helper.templateCreatePersistTest(subscribed_template);

      let template: any = {
        name: "t", 
        subscribed_templates: [subscribed_template]
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = {
        template_id: template._id,
        related_datasets: [
          {
            template_id: subscribed_template._id
          }
        ]
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);

      // Modify the subscribed template and persist it 
      subscribed_template.description = "changed";
      subscribed_template = await Helper.templateUpdatePersistTest(subscribed_template);

      // Now there shouldn't be any update to the dataset if we try to update
      await Helper.testAndExtract(Helper.datasetUpdate, dataset.uuid, dataset);
      expect(await Helper.datasetDraftExistingAndTest(dataset.uuid)).toBeFalsy();
      expect(await Helper.datasetDraftExistingAndTest(dataset.related_datasets[0].uuid)).toBeFalsy();
    });
  
  });
});

describe("get draft", () => {
  test("must have edit permission", async () => {
    let template: any = {
      name: "t"
    }
    template = await Helper.templateCreatePersistTest(template);
    let dataset: any = {
      template_id: template._id
    };
    dataset = await Helper.datasetCreateAndTest(dataset);

    Helper.setAgent(agent2);
    
    let response = await Helper.datasetDraftGet(dataset.uuid);
    expect(response.statusCode).toBe(401);
  });

  test("if user has view but not edit access to linked dataset draft, an empty object replaces that property", async () => {

    let template: any = { 
      name: "t1",
      related_templates: [{name: "t2"}],
      public_date: (new Date()).toISOString()
    };
    template = await Helper.templateCreatePersistTest(template);  

    let related_dataset: any = {
      template_id: template.related_templates[0]._id
    };
    related_dataset = await Helper.datasetCreateAndTest(related_dataset);

    let dataset: any = {
      template_id: template._id,
      related_datasets: [related_dataset]
    };
    dataset = await Helper.datasetCreateAndTest(dataset);

    let users = [Helper.DEF_EMAIL, Helper.EMAIL_2];

    let response = await Helper.updatePermission(dataset.uuid, PermissionTypes.admin, users);
    expect(response.statusCode).toBe(200);

    response = await Helper.updatePermission(template.related_templates[0].uuid, PermissionTypes.view, users);
    expect(response.statusCode).toBe(200);
    response = await Helper.updatePermission(dataset.related_datasets[0].uuid, PermissionTypes.view, users);
    expect(response.statusCode).toBe(200);

    await Helper.setAgent(agent2);

    // Fetch parent dataset, check that related_dataset is fetched as an empty object
    let dataset_draft = await Helper.datasetDraftGetAndTest(dataset.uuid);
    dataset.related_datasets[0] = {uuid: related_dataset.uuid};
    Helper.testDatasetDraftsEqual(dataset, dataset_draft);
  });

  test("if user has neither view nor edit access to linked properties, an empty object replaces that property", async () => {

    let template: any = { 
      name: "t1",
      related_templates: [{name: "t2"}],
      public_date: (new Date()).toISOString()
    };
    template = await Helper.templateCreatePersistTest(template);  

    let related_dataset: any = {
      template_id: template.related_templates[0]._id
    };
    related_dataset = await Helper.datasetCreateAndTest(related_dataset);

    let dataset: any = {
      template_id: template._id,
      related_datasets: [related_dataset]
    };
    dataset = await Helper.datasetCreateAndTest(dataset);

    let users = [Helper.DEF_EMAIL, Helper.EMAIL_2];

    let response = await Helper.updatePermission(dataset.uuid, PermissionTypes.admin, users);
    expect(response.statusCode).toBe(200);

    await Helper.setAgent(agent2);

    // Fetch parent dataset, check that related_dataset is fetched as the persisted version
    let dataset_draft = await Helper.datasetDraftGetAndTest(dataset.uuid);
    dataset.related_datasets[0] = {uuid: related_dataset.uuid};
    Helper.testDatasetDraftsEqual(dataset, dataset_draft);
  });

  test("if a draft has a related_dataset which is persisted but doesn't have a draft, the persisted version is connected", async () => {
    let template: any = {
      name: "t",
      related_templates: [{
        name: "t2"
      }]
    }
    template = await Helper.templateCreatePersistTest(template);
    let dataset: any = {
      template_id: template._id,
      related_datasets: [{
        template_id: template.related_templates[0]._id
      }]
    };
    dataset = await Helper.datasetCreateAndTest(dataset);
    await Helper.datasetPersistAndTest(dataset.related_datasets[0].uuid);

    
    dataset = await Helper.testAndExtract(Helper.datasetDraftGet, dataset.uuid);
    expect(dataset).not.toHaveProperty('persist_date');
    expect(dataset.related_datasets.length).toBe(1);
    expect(dataset.related_datasets[0]).toHaveProperty('persist_date');
  });
});

describe("persist (and get persisted)", () => {
  describe("Success cases", () => {
    test("Simple persist - no related datasets", async () => {
      let template: any = { 
        "name": "t1"
      };
      template = await Helper.templateCreatePersistTest(template);
      let dataset = {
        template_id: template._id
      }
      await Helper.datasetCreatePersistTest(dataset);
      
    });

    test("Complex persist - with a related dataset", async () => {

      let template: any = {
        name:"t1",
        related_templates:[{
          name: "t2"
        }]
      };

      template = await Helper.templateCreatePersistTest(template);

      let related_dataset = {
        template_id: template.related_templates[0]._id
      };
      let dataset = {
        template_id: template._id,
        related_datasets:[related_dataset]
      };
      let persisted = await Helper.datasetCreatePersistTest(dataset);

      let related_dataset_uuid = persisted.related_datasets[0].uuid;

      // Check that the related dataset was also persisted
      let response = await Helper.datasetLatestPersisted(related_dataset_uuid);
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject(related_dataset);
    });

    test("Complex persist - changes in a nested property result in persisting for all parent properties", async () => {

      let template: any = {
        "name":"t1",
        "related_templates":[{
          "name": "t2",
          "related_templates":[{
            "name": "t3",
            public_date: (new Date()).toISOString(),
            "related_templates":[{
              "name": "t4"
            }]
          }]
        }]
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = {
        template_id: template._id,
        "related_datasets":[{
          template_id: template.related_templates[0]._id,
          "related_datasets":[{
            template_id: template.related_templates[0].related_templates[0]._id,
            "related_datasets":[{
              template_id: template.related_templates[0].related_templates[0].related_templates[0]._id,
            }]
          }]
        }]
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);

      // Make a change in the third level of data
      dataset.related_datasets[0].related_datasets[0].public_date = (new Date()).toISOString();

      // Update with change
      let response = await Helper.datasetUpdate(dataset.uuid, dataset);
      expect(response.statusCode).toBe(303);

      // Record the date before we persist a second time
      let intermediate_persist_date = (new Date()).getTime();

      dataset = await Helper.datasetPersistAndFetch(dataset.uuid);

      // On the third node and above, the persist date should be newer than the intermediate_persist_date. 
      // The fourth should be older
      
      expect(new Date(dataset.persist_date).getTime()).toBeGreaterThan(intermediate_persist_date);
      expect(new Date(dataset.related_datasets[0].persist_date).getTime()).toBeGreaterThan(intermediate_persist_date);
      expect(new Date(dataset.related_datasets[0].related_datasets[0].persist_date).getTime()).toBeGreaterThan(intermediate_persist_date);
      expect(new Date(dataset.related_datasets[0].related_datasets[0].related_datasets[0].persist_date).getTime()).toBeLessThan(intermediate_persist_date);

    });

    test("Complex persist - persist parent who's child changed previously and no other changes are present", async () => {

      let template: any = {
        "name":"1",
        "related_templates":[{
          "name": "2",
          public_date: (new Date()).toISOString()
        }]
      };
      // Create initial data
      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = {
        template_id: template._id,
        "related_datasets":[{
          template_id: template.related_templates[0]._id,
        }]
      };
      // Create initial data
      dataset = await Helper.datasetCreatePersistTest(dataset);
      let uuid = dataset.uuid;

      // Make a change in the second level of data
      dataset.related_datasets[0].public_date = (new Date()).toISOString();
      let uuid2 = dataset.related_datasets[0].uuid;

      // Update second dataset
      let response = await Helper.datasetUpdate(uuid2, dataset.related_datasets[0]);
      expect(response.statusCode).toBe(303);

      // Record the date before we persist the change to the second dataset
      let persist_date_2 = (new Date()).getTime();

      await Helper.datasetPersistAndFetch(uuid2);
      
      // Now we want to get a draft of the parent and persist that draft as it is. It should be successful since the child changed.
      
      response = await Helper.datasetDraftGet(uuid);
      expect(response.statusCode).toBe(200);
      dataset = response.body;
      
      // Update with change
      response = await Helper.datasetUpdate(uuid, dataset);
      expect(response.statusCode).toBe(303);

      // Record the date before we persist the parent dataset again
      let persist_date_3 = (new Date()).getTime();

      dataset = await Helper.datasetPersistAndFetch(uuid);

      expect(new Date(dataset.persist_date).getTime()).toBeGreaterThan(persist_date_3);
      expect(new Date(dataset.related_datasets[0].persist_date).getTime()).toBeGreaterThan(persist_date_2);
      expect(new Date(dataset.related_datasets[0].persist_date).getTime()).toBeLessThan(persist_date_3);
    });

    test("Still able to persist parent even if don't have permission to persist child", async () => {
      let template: any = {
        name:"t1",
        public_date: (new Date()).toISOString(),
        related_templates:[{
          name: "t1.1",
          public_date: (new Date()).toISOString()
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

      // Update with user 1
      let response = await Helper.datasetLatestPersisted(dataset.uuid);
      expect(response.statusCode).toBe(200);
      let draft = response.body;
      draft.public_date = (new Date()).toISOString();
      draft.related_datasets[0].public_date = (new Date()).toISOString();
      response = await Helper.datasetUpdate(draft.uuid, draft);
      expect(response.statusCode).toBe(303);

      // Give user 2 edit permissions to parent dataset
      let admin_users = [Helper.DEF_EMAIL, Helper.EMAIL_2];
      response = await Helper.updatePermission(dataset.uuid, PermissionTypes.admin, admin_users);
      expect(response.statusCode).toBe(200);

      await Helper.setAgent(agent2);

      // Now let user 2 persist the parent dataset
      await Helper.datasetPersistAndFetch(dataset.uuid);

      // Now verify that user 2 persisted the parent but not the child.
      await Helper.setAgent(agent1);

      // Check that the related dataset was not persisted
      response = await Helper.datasetLatestPersisted(dataset.related_datasets[0].uuid);
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject(dataset.related_datasets[0]);

      // Check that the parent was persisted
      response = await Helper.datasetLatestPersisted(dataset.uuid);
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toMatchObject(dataset);
      // Also check that it is still pointing to the original persisted related_dataset
      expect(response.body.related_datasets[0]._id).toBe(dataset.related_datasets[0]._id);

    });

    test("Simple change - only template was updated", async () => {
      let template: any = { 
        "name": "t1"
      };
      template = await Helper.templateCreatePersistTest(template);
      
      let dataset: any = {
        template_id: template._id
      }
      let dataset_persisted = await Helper.datasetCreatePersistTest(dataset);

      template.description = "naruto";
      template = await Helper.templateUpdatePersistTest(template);

      dataset.uuid = dataset_persisted.uuid;
      dataset.template_id = template._id;
      await Helper.datasetUpdatePersistTest(dataset);
      
    });

    test("one related dataset, pointing to template with one subscribed template", async () => {

      let subscribed_template = {
        name: "t2"
      };
      subscribed_template = await Helper.templateCreatePersistTest(subscribed_template);

      let template: any = {
        name:"t1",
        subscribed_templates:[subscribed_template]
      };
      template = await Helper.templateCreatePersistTest(template);


      let dataset = {
        template_id: template._id,
        related_datasets: [{
          template_id: template.subscribed_templates[0]._id
        }]
      };

      await Helper.datasetCreatePersistTest(dataset);

    });

  });

  describe("Failure cases", () => {
    test("Dataset with uuid must exist", async () => {

      let template: any = {
        name:"t1"
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = {
        template_id: template._id
      }
      dataset = await Helper.datasetCreateAndTest(dataset);

      let response = await Helper.datasetLastUpdate(dataset.uuid);
      expect(response.statusCode).toBe(200);
      let last_update = response.body;

      response = await Helper.datasetPersist(Helper.VALID_UUID, last_update);
      expect(response.statusCode).toBe(404);

    });

    test("There must be changes to persist", async () => {
      let template: any = {
        name:"t1"
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = {
        template_id: template._id
      }
      dataset = await Helper.datasetCreateAndTest(dataset);

      let last_update = await Helper.testAndExtract(Helper.datasetLastUpdate, dataset.uuid);

      let response = await Helper.datasetPersist(dataset.uuid, last_update);
      expect(response.statusCode).toBe(200);

      response = await Helper.datasetPersist(dataset.uuid, last_update);
      expect(response.statusCode).toBe(400);
    });

    test("Dataset must match the template to persist", async () => {
      let template: any = {
        name:"t1",
        related_templates: [{
          name: "t2"
        }]
      };
      template = await Helper.templateCreateAndTest(template);

      let dataset: any = {
        template_id: template._id,
        related_datasets: [{
          template_id: template.related_templates[0]._id
        }]
      }
      dataset = await Helper.datasetCreateAndTest(dataset);

      template.related_templates = [];
      await Helper.templateUpdateAndTest(template);

      let last_update = await Helper.testAndExtract(Helper.datasetLastUpdate, dataset.uuid);

      let response = await Helper.datasetPersist(dataset.uuid, last_update);
      expect(response.statusCode).toBe(400);
    });

    test("Internal refrences must be valid", async () => {
      let template: any = {
        name:"t1",
        related_templates: [{
          name: "t1.1"
        }]
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = {
        template_id: template._id,
        related_datasets: [{
          template_id: template.related_templates[0]._id
        }]
      }

      dataset = await Helper.datasetCreateAndTest(dataset);

      // Delete the internal draft
      let response = await Helper.datasetDelete(dataset.related_datasets[0].uuid);
      expect(response.statusCode).toBe(200);

      response = await Helper.datasetLastUpdate(dataset.uuid);
      expect(response.statusCode).toBe(200);
      let last_update = response.body;

      // Expect persist of parent draft to fail because of invalid reference 
      response = await Helper.datasetPersist(dataset.uuid, last_update);
      expect(response.statusCode).toBe(400);

      // Try updating. This should also fail.
      response = await Helper.datasetUpdate(dataset);
      expect(response.statusCode).toBe(400);

    });

    test("Last update provided must match to actual last update in the database", async () => {
      let template: any = {
        name: "t1"
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = {
        template_id: template._id
      };
      dataset = await Helper.datasetCreateAndTest(dataset);

      let response =  await Helper.datasetPersist(dataset.uuid, (new Date()).toISOString());
      expect(response.statusCode).toBe(400);
    });

    test("Last update provided must match to actual last update of dataset and all sub-datasets in the database", async () => {
      let template: any = {
        name: "t1",
        related_templates: [
          {
            name: "t1.1",
            public_date: (new Date()).toISOString()
          }
        ]
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = {
        template_id: template._id,
        related_datasets: [{
          template_id: template.related_templates[0]._id
        }]
      };
      dataset = await Helper.datasetCreateAndTest(dataset);
      let old_update = dataset.updated_at;

      let related_dataset: any = dataset.related_datasets[0];
      related_dataset.public_date = (new Date()).toISOString();

      let response = await Helper.datasetUpdate(related_dataset.uuid, related_dataset);
      expect(response.statusCode).toBe(303);

      // Should fail to update since we don't have the most recent update
      response = await Helper.datasetPersist(dataset.uuid, old_update);
      expect(response.statusCode).toBe(400);

      // Should succeed in persisting if we do use the most recent update
      response = await Helper.datasetDraftGet(related_dataset.uuid);
      expect(response.statusCode).toBe(200);
      let new_update = response.body.updated_at;

      response = await Helper.datasetPersist(dataset.uuid, new_update);
      expect(response.statusCode).toBe(200);

    });

    test("User must have admin permission to persist", async () => {

      let template: any = {
        name:"t1"
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = {
        template_id: template._id
      };
      dataset = await Helper.datasetCreateAndTest(dataset);

      // A different user shouldn't be able to persist
      let last_update = await Helper.testAndExtract(Helper.datasetLastUpdate, dataset.uuid);

      Helper.setAgent(agent2);

      let response = await Helper.datasetPersist(dataset.uuid, last_update);
      expect(response.statusCode).toBe(401);

      await Helper.setAgent(agent1);

      let view_permissions = [Helper.DEF_EMAIL, Helper.EMAIL_2];

      // Even if that user has view permissions, they still shouldn't be able to persist
      response = await Helper.updatePermission(template.uuid, PermissionTypes.view, view_permissions);
      expect(response.statusCode).toBe(200);
      response = await Helper.updatePermission(dataset.uuid, PermissionTypes.view, view_permissions);
      expect(response.statusCode).toBe(200);

      await Helper.setAgent(agent2);

      response = await Helper.datasetPersist(dataset.uuid, last_update);
      expect(response.statusCode).toBe(401);
    });

    test("Dataset must match format of template", async () => {

      let template: any = {
        name:"t1",
        related_templates: [
          {name: "t1.1"}
        ]
      };
      template = await Helper.templateCreatePersistTest(template);

      // create dataset, matching template format
      let dataset: any = {
        template_id: template._id,
        related_datasets: [
          { 
            template_id: template.related_templates[0]._id
          }
        ]
      };
      dataset = await Helper.datasetCreateAndTest(dataset);

      // in the meantime, the template format changes
      template.related_templates = [];
      template = await Helper.templateUpdatePersistTest(template);

      let last_update = await Helper.testAndExtract(Helper.datasetLastUpdate, dataset.uuid);

      // Now persisting the dataset should fail since it no longer matches the template format
      await Helper.datasetPersist(dataset.uuid, last_update);
    });

    test("If user doesn't have admin access to linked dataset and that dataset doesn't have a persisted version, then we can't persist", async () => {
      let public_date = (new Date()).toISOString();
      let template: any = {
        name:"t1",
        public_date,
        related_templates:[{
          name: "t2",
          public_date
        }]
      };

      template = await Helper.templateCreatePersistTest(template);

      Helper.setAgent(agent2);

      let related_dataset: any = {
        template_id: template.related_templates[0]._id
      };
      related_dataset = await Helper.datasetCreateAndTest(related_dataset);

      await Helper.setAgent(agent1);

      let dataset: any = {
        template_id: template._id,
        related_datasets:[{uuid: related_dataset.uuid}]
      };
      dataset = await Helper.datasetCreateAndTest(dataset);

      let last_update = await Helper.datasetLastUpdateAndTest(dataset.uuid);
      let response = await Helper.datasetPersist(dataset.uuid, last_update);
      expect(response.statusCode).toBe(400);
    });
  });
});

describe("get persisted", () => {
  test("if user does not have view access to linked properties, an empty object replaces that property", async () => {
    
    let template: any = { 
      name: "t1",
      related_templates: [{name: "t1.1"}]
    };
    template = await Helper.templateCreatePersistTest(template);  
    
    let dataset: any = { 
      template_id: template._id,
      related_datasets: [{
        template_id: template.related_templates[0]._id
      }]
    };
    dataset = await Helper.datasetCreatePersistTest(dataset);  
    
    let view_users = [Helper.EMAIL_2, Helper.DEF_EMAIL];
    let response = await Helper.updatePermission(template.uuid, PermissionTypes.view, view_users);
    expect(response.statusCode).toBe(200);
    response = await Helper.updatePermission(dataset.uuid, PermissionTypes.view, view_users);
    expect(response.statusCode).toBe(200);

    dataset.related_datasets[0] = {uuid: dataset.related_datasets[0].uuid};

    await Helper.setAgent(agent2);

    // Fetch parent dataset, check that the related_dataset is fetched as blank 
    // since the second user
    response = await Helper.datasetLatestPersisted(dataset.uuid);
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject(dataset);   
  });

  test("must have view permissions", async () => {
    let template: any = { 
      name: "t1"
    };
    template = await Helper.templateCreatePersistTest(template);  

    let dataset: any = { 
      template_id: template._id
    };
    dataset = await Helper.datasetCreatePersistTest(dataset);  

    Helper.setAgent(agent2);

    let response = await Helper.datasetLatestPersisted(dataset.uuid);
    expect(response.statusCode).toBe(401);
  });
});

test("get persisted for a certain date", async () => {
  let template: any = {
    name:"t1",
    public_date: (new Date()).toISOString()
  };
  template = await Helper.templateCreatePersistTest(template);

  let dataset: any = {
    template_id: template._id
  };
  dataset = await Helper.datasetCreateAndTest(dataset);
  let uuid = dataset.uuid;

  let beforeFirstPersist = new Date();

  // Test that if only a draft exists, it is not fetched
  let response = await Helper.datasetLatestPersistedBeforeDate(uuid, beforeFirstPersist.toISOString());
  expect(response.statusCode).toBe(404);

  await Helper.datasetPersistAndFetch(uuid);

  let afterFirstPersist = new Date();

  // dataset.uuid = uuid;
  let public_date_1 = (new Date()).toISOString();
  dataset.public_date = public_date_1;
  dataset.uuid = uuid;

  response = await Helper.datasetUpdate(uuid, dataset);
  expect(response.statusCode).toBe(303);
  await Helper.datasetPersistAndFetch(uuid);

  let afterSecondPersist = new Date();

  let public_date_2 = (new Date()).toISOString();
  dataset.public_date = public_date_2;

  response = await Helper.datasetUpdate(uuid, dataset);
  expect(response.statusCode).toBe(303);
  await Helper.datasetPersistAndFetch(uuid);

  // Now there should be three persisted versions. Search for each based on the date

  response = await Helper.datasetLatestPersisted(uuid);
  expect(response.statusCode).toBe(200);
  expect(response.body.public_date).toEqual(public_date_2);

  response = await Helper.datasetLatestPersistedBeforeDate(uuid, (new Date()).toISOString());
  expect(response.statusCode).toBe(200);
  expect(response.body.public_date).toEqual(public_date_2);

  response = await Helper.datasetLatestPersistedBeforeDate(uuid, afterSecondPersist.toISOString());
  expect(response.statusCode).toBe(200);
  expect(response.body.public_date).toEqual(public_date_1);

  response = await Helper.datasetLatestPersistedBeforeDate(uuid, afterFirstPersist.toISOString());
  expect(response.statusCode).toBe(200);
  expect(response.body.public_date).toBe(undefined);

  response = await Helper.datasetLatestPersistedBeforeDate(uuid, beforeFirstPersist.toISOString());
  expect(response.statusCode).toBe(404);
});

describe("lastUpdate", () => {

  describe("success", () => {
    test("basic draft, no related datasets", async () => {
      let template: any = {
        "name":"t1"
      };
      template = await Helper.templateCreatePersistTest(template);

      let timestamp = new Date();
      let dataset: any = {
        template_id: template._id
      };
      dataset = await Helper.datasetCreateAndTest(dataset);

      let response = await Helper.datasetLastUpdate(dataset.uuid);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(timestamp.getTime());
    });

    test("basic persisted, with related_datasets. available to anyone with view permissions", async () => {
      let template: any = {
        name:"t1"
      };
      template = await Helper.templateCreatePersistTest(template);
      let timestamp = new Date();
      let dataset: any = {
        template_id: template._id
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);

      let response = await Helper.datasetLastUpdate(dataset.uuid);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(timestamp.getTime());

      let view_users = [Helper.EMAIL_2, Helper.DEF_EMAIL];
      response = await Helper.updatePermission(template.uuid, PermissionTypes.view, view_users);
      expect(response.statusCode).toBe(200);
      response = await Helper.updatePermission(dataset.uuid, PermissionTypes.view, view_users);
      expect(response.statusCode).toBe(200);

      await Helper.setAgent(agent2);

      response = await Helper.datasetLastUpdate(dataset.uuid);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(timestamp.getTime());
    });

    test("sub dataset updated later than parent dataset", async () => {
      let template: any = {
        "name": "t1",
        "related_templates": [{
          "name": "t2",
          "related_templates": [{
            "name": "t3",
            public_date: (new Date()).toISOString()
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
      dataset = await Helper.datasetCreateAndTest(dataset);
      let uuid = dataset.uuid;

      let timestamp_between_create_and_update = new Date();

      // Update 3. 1 and 2 dates should be 3
      let dataset3 = dataset.related_datasets[0].related_datasets[0];
      dataset3.public_date = (new Date()).toISOString()


      let response = await Helper.datasetUpdate(dataset3.uuid, dataset3);
      expect(response.statusCode).toBe(303);

      let timestamp_after_update = new Date();

      response = await Helper.datasetLastUpdate(uuid);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(timestamp_between_create_and_update.getTime());
      expect((new Date(response.body)).getTime()).toBeLessThan(timestamp_after_update.getTime());

      response = await Helper.datasetLastUpdate(dataset3.uuid);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(timestamp_between_create_and_update.getTime());
      expect((new Date(response.body)).getTime()).toBeLessThan(timestamp_after_update.getTime());
      
    });

    test("sub dataset updated and persisted later than parent dataset", async () => {

      let template: any = {
        "name": "1",
        "related_templates": [{
          "name": "2",
          public_date: (new Date()).toISOString()
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

      let related_dataset = dataset.related_datasets[0];
      related_dataset.public_date = (new Date()).toISOString();

      let response = await Helper.datasetUpdate(related_dataset.uuid, related_dataset);
      expect(response.statusCode).toEqual(303);

      let time1 = new Date();
      await Helper.datasetPersistAndFetch(related_dataset.uuid);
      let time2 = new Date();

      response = await Helper.datasetLastUpdate(dataset.uuid);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(time1.getTime());
      expect((new Date(response.body)).getTime()).toBeLessThan(time2.getTime());
    });

    test("grandchild updated, but child deleted. Updated time should still be grandchild updated", async () => {
      let template: any = {
        "name": "1",
        "related_templates": [{
          "name": "2",
          "related_templates": [{
            "name": "3",
            public_date: (new Date()).toISOString()
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
      dataset = await Helper.datasetCreateAndTest(dataset);

      let dataset2 = dataset.related_datasets[0];
      let dataset3: any = dataset2.related_datasets[0];

      // persist
      await Helper.datasetPersistAndFetch(dataset.uuid, Helper);

      // Update grandchild
      dataset3.public_date = (new Date()).toISOString();

      let response = await Helper.datasetUpdate(dataset3.uuid, dataset3);
      expect(response.statusCode).toBe(303);

      response = await Helper.datasetDraftGet(dataset3.uuid, Helper);
      expect(response.statusCode).toBe(200);
      let update_3_timestamp = response.body.updated_at;

      // Now get the update timestamp for the grandparent. It should be that of the grandchild.
      response = await Helper.datasetLastUpdate(dataset.uuid);
      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual(update_3_timestamp);
      
    });

  });

  describe("failure", () => {
    test("invalid uuid", async () => {
      let response = await Helper.datasetLastUpdate(15);
      expect(response.statusCode).toBe(400);

      response = await Helper.datasetLastUpdate(Helper.VALID_UUID);
      expect(response.statusCode).toBe(404);
    });

    test("must have edit permissions to get last update of draft", async () => {
      let template: any = {
        "name":"t1"
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = {
        template_id: template._id
      };
      dataset = await Helper.datasetCreateAndTest(dataset);

      Helper.setAgent(agent2);

      let response = await Helper.datasetLastUpdate(dataset.uuid);
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

      Helper.setAgent(agent2);

      let response = await Helper.datasetLastUpdate(dataset.uuid, Helper.USER_2);
      expect(response.statusCode).toBe(401);
    });
  });
});

describe("delete", () => {
  test("delete a draft, not a persisted version", async () => {
    let template: any = {
      name: "t1",
      public_date: (new Date()).toISOString()
    };
    template = await Helper.templateCreatePersistTest(template);

    let dataset: any = {
      template_id: template._id
    }
    dataset = await Helper.datasetCreatePersistTest(dataset);
  
    dataset.public_date = (new Date()).toISOString();
  
    // Change the draft, but don't persist the change
    let response = await Helper.datasetUpdate(dataset.uuid, dataset);
    expect(response.statusCode).toBe(303);
  
    // Verify that the draft is what we changed it to
    response = await Helper.datasetDraftGet(dataset.uuid);
    expect(response.statusCode).toBe(200);
  
    // Delete the draft
    response = await Helper.datasetDelete(dataset.uuid);
    expect(response.statusCode).toBe(200);
  
    // Make sure the latest persisted version still exists and hasn't changed
    response = await Helper.datasetLatestPersisted(dataset.uuid);
    expect(response.statusCode).toBe(200);
  
    delete dataset._id;
    delete dataset.template_id;
    delete dataset.persist_date;
    delete dataset.public_date;
    expect(response.body).toMatchObject(dataset);
  
  });

  test("if there are no persisted versions, permissions get deleted as well", async () => {
    let template: any = {
      name: "t"
    };
    template = await Helper.templateCreatePersistTest(template);
    let dataset: any = {
      template_id: template._id
    };
    dataset = await Helper.datasetCreateAndTest(dataset);
    let uuid = dataset.uuid;


    let permission = await Helper.testAndExtract(Helper.getPermission, uuid, PermissionTypes.admin);
    expect(permission).toEqual([Helper.DEF_EMAIL]);

    let user_permissions = await Helper.testAndExtract(Helper.accountPermissions);
    expect(user_permissions.dataset.admin).toEqual(expect.arrayContaining([uuid]));
  
    
    await Helper.testAndExtract(Helper.datasetDelete, uuid);
    
    let response = await Helper.getPermission(uuid, PermissionTypes.admin);
    expect(response.statusCode).toBe(404);

    user_permissions = await Helper.testAndExtract(Helper.accountPermissions);
    expect(user_permissions.dataset.admin).not.toEqual(expect.arrayContaining([uuid]));
  });

  test("dataset doesn't exist", async () => {
    let response = await Helper.datasetDelete(Helper.VALID_UUID);
    expect(response.statusCode).toBe(404);
  });

  test("need admin permissions", async () => {
    let template: any = {
      name: "t1"
    };
    template = await Helper.templateCreatePersistTest(template);

    let dataset: any = {
      template_id: template._id
    };
    dataset = await Helper.datasetCreateAndTest(dataset);

    Helper.setAgent(agent2);

    let response = await Helper.datasetDelete(dataset.uuid);
    expect(response.statusCode).toBe(401);
  });
});

describe("records", () => {

  test("basic - newest record should be included for each uuid", async () => {

    let template1: any = { 
      name: "t1",
      fields: [
        {
          name: "name"
        }
      ]
    };
    template1 = await Helper.templateCreatePersistTest(template1);
    let dataset1: any = {
      template_id: template1._id,
      name: "basic"
    };
    dataset1 = await Helper.datasetCreatePersistTest(dataset1);

    let record1 = {
      dataset_uuid: dataset1.uuid,
      fields: [
        {
          uuid: template1.fields[0].uuid,
          value: "simple created - should appear"
        }
      ]
    };
    record1 = await Helper.recordCreatePersistTest(record1);

    record1 = {
      dataset_uuid: dataset1.uuid,
      fields: [
        {
          uuid: template1.fields[0].uuid,
          value: "simple created and persisted - should appear"
        }
      ]
    };
    record1 = await Helper.recordCreatePersistTest(record1);

    record1 = {
      dataset_uuid: dataset1.uuid,
      fields: [
        {
          uuid: template1.fields[0].uuid,
          value: "simple created, persisted, and another draft created - first persisted - should not appear"
        }
      ]
    };
    let record1_with_uuid = await Helper.recordCreatePersistTest(record1);
    record1_with_uuid.fields[0].value = "simple created, persisted, and another draft created - updated - should appear"
    await Helper.recordUpdateAndTest(record1_with_uuid);
  
    record1 = {
      dataset_uuid: dataset1.uuid,
      fields: [
        {
          uuid: template1.fields[0].uuid,
          value: "simple created, persisted, and persisted again - first persisted - should not appear"
        }
      ]
    };
    record1_with_uuid = await Helper.recordCreatePersistTest(record1);
    record1_with_uuid.fields[0].value = "simple created, persisted, and persisted again - second persisted - should appear"
    await Helper.recordUpdatePersistTest(record1_with_uuid);

    let records = await Helper.testAndExtract(Helper.datasetRecords, dataset1.uuid);
    expect(records.length).toBe(4);

    expect(records[0].fields[0].value).toEqual("simple created, persisted, and persisted again - second persisted - should appear");
    expect(records[1].fields[0].value).toEqual("simple created, persisted, and another draft created - updated - should appear");
    expect(records[2].fields[0].value).toEqual("simple created and persisted - should appear");
    expect(records[3].fields[0].value).toEqual("simple created - should appear");
    
  });

  test("only most recent record included for each uuid, no matter how scrambled update times are", async () => {

    let template: any = { 
      name: "t1",
      fields: [
        {
          name: "name"
        }
      ]
    };
    template = await Helper.templateCreatePersistTest(template);

    let dataset: any = {
      template_id: template._id
    };
    dataset = await Helper.datasetCreatePersistTest(dataset);
  
    let record1 = {
      dataset_uuid: dataset.uuid,
      fields: [
        {
          uuid: template.fields[0].uuid,
          value: "record 1 version 1"
        }
      ]
    };
    record1 = await Helper.recordCreatePersistTest(record1);

    let record2 = {
      dataset_uuid: dataset.uuid,
      fields: [
        {
          uuid: template.fields[0].uuid,
          value: "record 2"
        }
      ]
    };
    record2 = await Helper.recordCreateAndTest(record2);

    record1.fields[0].value = "record 1 version 2";
    record1 = await Helper.recordUpdatePersistTest(record1);
  
    let records = await Helper.testAndExtract(Helper.datasetRecords, dataset.uuid);
    expect(records.length).toBe(2);
  
    expect(records[0].fields[0].value).toEqual("record 1 version 2");
    expect(records[1].fields[0].value).toEqual("record 2");
  
  });

  test("can access if dataset is public", async () => {

    const public_date = (new Date()).toISOString();
    let template: any = { 
      name: "t1",
      public_date
    };
    template = await Helper.templateCreatePersistTest(template);
    let dataset: any = {
      template_id: template._id,
      name: "basic",
      public_date
    };
    dataset = await Helper.datasetCreatePersistTest(dataset);

    let record = {
      dataset_uuid: dataset.uuid
    };
    record = await Helper.recordCreatePersistTest(record);

    await Helper.setAgent(agent2);

    let records = await Helper.testAndExtract(Helper.datasetRecords, dataset.uuid);
    expect(records.length).toBe(1);

    await Helper.logout();

    records = await Helper.testAndExtract(Helper.datasetRecords, dataset.uuid);
    expect(records.length).toBe(1);

  });


});

describe("duplicate", () => {
  describe("success", () => {
    test("normal test, some things in the same group_uuid and some not", async () => {
      let template: any = {
        name:"t1",
        related_templates:[
          {
            name: "t1.1",
            related_templates:[{
              name: "t1.1.1"
            }]
          },
          {
            name: "t1.2",
            related_templates:[{
              name: "t1.2.1"
            }]
          }
        ]
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset12: any = {
        template_id: template.related_templates[1]._id,
        related_datasets: [{
          template_id: template.related_templates[1].related_templates[0]._id
        }]
      };
      dataset12 = await Helper.datasetCreateAndTest(dataset12);

      let dataset1: any = {
        template_id: template._id,
        related_datasets: [
          {
            template_id: template.related_templates[0]._id,
            related_datasets: [{
              template_id: template.related_templates[0].related_templates[0]._id
            }]
          },
          dataset12
        ]
      };
      dataset1 = await Helper.datasetCreatePersistTest(dataset1);

      // Necessary because fetching the persisted doesn't guarentee the order of the related_datasets
      let dataset11;
      if(dataset1.related_datasets[0].uuid == dataset12.uuid) {
        dataset12 = dataset1.related_datasets[0];
        dataset11 = dataset1.related_datasets[1];
      } else {
        dataset12 = dataset1.related_datasets[1];
        dataset11 = dataset1.related_datasets[0];
      }

      expect(dataset1.group_uuid).toEqual(dataset11.group_uuid);
      expect(dataset1.group_uuid).toEqual(dataset11.related_datasets[0].group_uuid);
      expect(dataset1.group_uuid).not.toEqual(dataset12.group_uuid);
      expect(dataset12.group_uuid).toEqual(dataset12.related_datasets[0].group_uuid);

      let response = await Helper.datasetDuplicate(dataset1.uuid);
      expect(response.statusCode).toBe(200);
      let new_dataset = response.body;

      let new_dataset_11;
      let new_dataset_12;
      if(new_dataset.related_datasets[0].template_uuid == dataset11.template_uuid) {
        new_dataset_11 = new_dataset.related_datasets[0];
        new_dataset_12 = new_dataset.related_datasets[1];
      } else {
        new_dataset_11 = new_dataset.related_datasets[1];
        new_dataset_12 = new_dataset.related_datasets[0];
      }

      // Expect duplicate to keep all of the templates of the original
      expect(new_dataset.template_id).toEqual(dataset1.template_id);
      expect(new_dataset_11.template_id).toEqual(dataset11.template_id);
      expect(new_dataset_11.related_datasets[0].template_id).toEqual(dataset11.related_datasets[0].template_id);
      expect(new_dataset_12.template_id).toEqual(dataset12.template_id);
      expect(new_dataset_12.related_datasets[0].template_id).toEqual(dataset12.related_datasets[0].template_id);

      // Expect duplicate to keep the group categories as found in the original dataset
      expect(new_dataset.group_uuid).toEqual(new_dataset_11.group_uuid);
      expect(new_dataset.group_uuid).toEqual(new_dataset_11.related_datasets[0].group_uuid);
      expect(new_dataset_12.group_uuid).toEqual(dataset12.group_uuid)
      expect(new_dataset.group_uuid).not.toEqual(new_dataset_12.group_uuid);
      expect(new_dataset_12.group_uuid).toEqual(new_dataset_12.related_datasets[0].group_uuid);

    });
    
    test("if don't have a permission to a related_template, it is dropped and parent is still duplicated", async () => {
      let template: any = {
        name:"t1",
        public_date: (new Date()).toISOString(),
        related_templates:[
          {
            name: "t1.1"
          }
        ]
      };
      template = await Helper.templateCreatePersistTest(template);

      let related_dataset = {
        template_id: template.related_templates[0]._id
      };
      related_dataset = await Helper.datasetCreatePersistTest(related_dataset);

      let dataset: any = {
        template_id: template._id,
        public_date: (new Date()).toISOString(),
        related_datasets: [related_dataset]
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);

      Helper.setAgent(agent2);

      let response = await Helper.datasetDuplicate(dataset.uuid);
      expect(response.statusCode).toBe(200);
      let new_dataset = response.body;

      expect(new_dataset.template_id).toEqual(dataset.template_id);
      expect(new_dataset.related_datasets).toEqual([]);
    });

    test("Duplicate a dataset with a couple references to the same dataset uuid", async () => {
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
      template = await Helper.templateCreateAndTest(template);
      template.related_templates[1].related_templates.push(template.related_templates[0]);
      template = await Helper.templateUpdatePersistTest(template);

      let dataset: any = {
        template_id: template._id,
        related_datasets: [
          {
            template_id: template.related_templates[0]._id
          },
          {
            template_id: template.related_templates[1]._id,
            related_datasets: []
          }
        ]
      };
      dataset.related_datasets[1].related_datasets.push(dataset.related_datasets[0]);
      dataset = await Helper.datasetCreateAndTest(dataset);
      dataset.related_datasets[1].related_datasets[0].uuid = dataset.related_datasets[0].uuid;
      dataset = await Helper.datasetUpdatePersistTest(dataset);

      let new_dataset = await Helper.testAndExtract(Helper.datasetDuplicate, dataset.uuid);

      // Expect duplicate to keep all of the templates of the original
      expect(new_dataset.template_id).toEqual(dataset.template_id);
      expect(new_dataset.related_datasets[0].template_id).toEqual(dataset.related_datasets[0].template_id);
      expect(new_dataset.related_datasets[1].template_id).toEqual(dataset.related_datasets[1].template_id);
      expect(new_dataset.related_datasets[1].related_datasets[0].template_id).toEqual(dataset.related_datasets[1].related_datasets[0].template_id);

      expect(new_dataset.related_datasets[0].uuid).toEqual(new_dataset.related_datasets[1].related_datasets[0].uuid);
    });
  });

  describe("failure", () => {
    test("need read permissions to duplicate", async () => {
      let template: any = {
        name:"t1"
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset: any = {
        template_id: template._id
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);

      Helper.setAgent(agent2);

      let response = await Helper.datasetDuplicate(dataset.uuid);
      expect(response.statusCode).toBe(401);
    });
  });
});

describe("publish", () => {

  test("basic test that it works", async () => {

    let template: any = {
      name:"t1",
      public_date: (new Date()).toISOString()
    };
    template = await Helper.templateCreatePersistTest(template);
  
    let public_date_1 = (new Date()).toISOString();
    let dataset: any = {
      template_id: template._id,
      public_date: public_date_1
    };
    dataset = await Helper.datasetCreatePersistTest(dataset);

    let public_date_2 = (new Date()).toISOString();
    dataset.public_date = public_date_2;
    let dataset_1 = await Helper.datasetUpdatePersistTest(dataset);

    let published_name_1 = "first";
    let published_name_2 = "second";
  
    await Helper.testAndExtract(Helper.datasetPublish, dataset.uuid, published_name_1);

    let public_date_3 = (new Date()).toISOString();
    dataset.public_date = public_date_3;
    dataset = await Helper.datasetUpdatePersistTest(dataset);

    let public_date_4 = (new Date()).toISOString();
    dataset.public_date = public_date_4;
    let dataset_2 = await Helper.datasetUpdatePersistTest(dataset);

    await Helper.testAndExtract(Helper.datasetPublish, dataset.uuid, published_name_2);

    let dataset_uuid = dataset.uuid;
    dataset = await Helper.testAndExtract(Helper.datasetPublished, dataset_uuid, published_name_1);
    Helper.testDatasetDraftsEqual(dataset_1, dataset);

    dataset = await Helper.testAndExtract(Helper.datasetPublished, dataset_uuid, published_name_2);
    Helper.testDatasetDraftsEqual(dataset_2, dataset);

  });

  describe("Failure cases", () => {

    const createDummyTemplateAndDataset = async () => {
      let template: any = {
        name: "t"
      };
      template = await Helper.templateCreatePersistTest(template);

      let dataset = {
        template_id: template._id
      }
      dataset = await Helper.datasetCreateAndTest(dataset);
      return dataset;
    }

    const createDummyTemplateAndPersistedDataset = async () => {
      let dataset: any = await createDummyTemplateAndDataset();
      return await Helper.datasetPersistAndFetch(dataset.uuid);
    }

    test("uuid and name must be valid format", async () => {
      let response = await Helper.datasetPublish("6", "name");
      expect(response.statusCode).toBe(400);

      response = await Helper.datasetPublish(Helper.VALID_UUID, 6);
      expect(response.statusCode).toBe(400);
    });

    test("published dataset must exist", async () => {
      let response = await Helper.datasetPublish(Helper.VALID_UUID, "name");
      expect(response.statusCode).toBe(404);

      let dataset: any = await createDummyTemplateAndDataset();
      response = await Helper.datasetPublish(dataset.uuid, "name");
      expect(response.statusCode).toBe(404);
    });

    test("user must have admin permissions", async () => {
      let dataset = await createDummyTemplateAndPersistedDataset();

      Helper.setAgent(agent2);

      let response = await Helper.datasetPublish(dataset.uuid, "name");
      expect(response.statusCode).toBe(401);
    });

    test("Cannot publish with the same name twice", async () => {
      let dataset = await createDummyTemplateAndPersistedDataset();
      let response = await Helper.datasetPublish(dataset.uuid, "name");
      expect(response.statusCode).toBe(200);
      response = await Helper.datasetPublish(dataset.uuid, "name");
      expect(response.statusCode).toBe(400);
    });

  });

  test("can get all records in published dataset", async () => {
    // 1 dataset, 4 records, 2 published versions

    // Question: if a record in the dataset was persisted before the dataset was persisted, is it included in the published version?
    // For: You want the user to be able to get all of the records, even if they update the dataset, they shouldn't have to update every single record for it to appear in that dataset
    // Against: The data in the records might not match the new dataset

    // Create and persist the dataset, and create four records. 
    // persist the first record
    // update the dataset, update the first record, and persist the first two records
    // publish 1
    // persist the dataset, update the first 2 records and persist the first 3
    // update the first 3 records and persist all 4
    // publish 2
    // Get all records in the first publish. It should be the 1st version of the dataset, 2nd version of the 1st record and 1st version of the 2nd record
    // Get all records in the second publish. It should be the 2nd version of the dataset, 1st record 4th version ... 4th record 1st version

    // Create and persist the dataset, and create four records. 
    let template: any = {
      name:"t1",
      fields: [
        {
          name: "name"
        }
      ],
      public_date: (new Date()).toISOString()
    };
    template = await Helper.templateCreatePersistTest(template);
  
    let public_date_1 = (new Date()).toISOString();
    let dataset: any = {
      template_id: template._id,
      public_date: public_date_1
    };
    dataset = await Helper.datasetCreatePersistTest(dataset);

    let record_1 = {
      dataset_uuid: dataset.uuid,
      fields: [
        {
          uuid: template.fields[0].uuid,
          name: "name", 
          value: "record1_version1"
        }
      ]
    };
    let record_2 = {
      dataset_uuid: dataset.uuid,
      fields: [
        {
          uuid: template.fields[0].uuid,
          name: "name", 
          value: "record2_version1"
        }
      ]
    };
    let record_3 = {
      dataset_uuid: dataset.uuid,
      fields: [
        {
          uuid: template.fields[0].uuid,
          name: "name", 
          value: "record3_version1"
        }
      ]
    };
    let record_4 = {
      dataset_uuid: dataset.uuid,
      fields: [
        {
          uuid: template.fields[0].uuid,
          name: "name", 
          value: "record4_version1"
        }
      ]
    };
    record_1 = await Helper.recordCreateAndTest(record_1);
    record_2 = await Helper.recordCreateAndTest(record_2);
    record_3 = await Helper.recordCreateAndTest(record_3);
    record_4 = await Helper.recordCreateAndTest(record_4);

    // persist the first record
    await Helper.recordPersistAndTest(record_1);

    // update the dataset, update the first record, and persist the first two records
    let public_date_2 = (new Date()).toISOString();
    dataset.public_date = public_date_2;
    await Helper.datasetUpdateAndTest(dataset);
    record_1.fields[0].value = "record1_version2";
    await Helper.recordUpdateAndTest(record_1);
    await Helper.recordPersistAndTest(record_1);
    await Helper.recordPersistAndTest(record_2);

    // publish 1
    let published_name_1 = "publish_1";
    await Helper.testAndExtract(Helper.datasetPublish, dataset.uuid, published_name_1);

    // persist the dataset, update the first 2 records and persist the first 3
    await Helper.datasetPersistAndFetch(dataset.uuid);
    record_1.fields[0].value = "record1_version3";
    record_2.fields[0].value = "record2_version2";
    await Helper.recordUpdatePersistTest(record_1);
    await Helper.recordUpdatePersistTest(record_2);
    await Helper.recordUpdatePersistTest(record_3);

    // update the first 3 records and persist all 4
    record_1.fields[0].value = "record1_version4";
    record_2.fields[0].value = "record2_version3";
    record_3.fields[0].value = "record3_version2";
    await Helper.recordUpdatePersistTest(record_1);
    await Helper.recordUpdatePersistTest(record_2);
    await Helper.recordUpdatePersistTest(record_3);
    await Helper.recordUpdatePersistTest(record_4);

    // publish 2
    let published_name_2 = "publish_2";
    await Helper.testAndExtract(Helper.datasetPublish, dataset.uuid, published_name_2);

    // Get all records in the first publish. It should be the 1st version of the dataset, 2nd version of the 1st record and 1st version of the 2nd record 
    let publish_1_records = await Helper.testAndExtract(Helper.datasetPublishedRecords, dataset.uuid, published_name_1);
    let publish_1_record_values = publish_1_records.map(record => record.fields[0].value);
    let expected_values = ["record1_version2", "record2_version1"];
    expect(Util.arrayEqual(publish_1_record_values, expected_values)).toBeTruthy();

    // Get all records in the second publish. It should be the 2nd version of the dataset, 1st record 4th version ... 4th record 1st version
    let publish_2_records = await Helper.testAndExtract(Helper.datasetPublishedRecords, dataset.uuid, published_name_2);
    let publish_2_record_values = publish_2_records.map(record => record.fields[0].value);
    expected_values = ["record1_version4", "record2_version3", "record3_version2", "record4_version1"];
    expect(Util.arrayEqual(publish_2_record_values, expected_values)).toBeTruthy();
  });
  
  describe("Search in published", () => {
    test("Search Success", async () => {
      let template: any = {
        name:"t1",
        fields: [
          {
            name: "name"
          }
        ],
        public_date: (new Date()).toISOString()
      };
      template = await Helper.templateCreatePersistTest(template);
    
      let public_date_1 = (new Date()).toISOString();
      let dataset: any = {
        template_id: template._id,
        public_date: public_date_1
      };
      dataset = await Helper.datasetCreatePersistTest(dataset);
  
      let record_1 = {
        dataset_uuid: dataset.uuid,
        fields: [
          {
            uuid: template.fields[0].uuid,
            name: "name", 
            value: "record1"
          }
        ]
      };
      let record_2 = {
        dataset_uuid: dataset.uuid,
        fields: [
          {
            uuid: template.fields[0].uuid,
            name: "name", 
            value: "record2"
          }
        ]
      };
      record_1 = await Helper.recordCreateAndTest(record_1);
      record_2 = await Helper.recordCreateAndTest(record_2);
  
      // persist the first record
      await Helper.recordPersistAndTest(record_1);
      await Helper.recordPersistAndTest(record_2);

      let published_name = "publish";
      await Helper.testAndExtract(Helper.datasetPublish, dataset.uuid, published_name);

      let search_results = await Helper.testAndExtract(Helper.datasetPublishedSearchRecords, dataset.uuid, published_name, {});
      try {
        Helper.testRecordsEqual(record_1, search_results[0]);
        Helper.testRecordsEqual(record_2, search_results[1]);
      } catch(e) {
        Helper.testRecordsEqual(record_1, search_results[1]);
        Helper.testRecordsEqual(record_2, search_results[0]);
      }

      search_results = await Helper.testAndExtract(Helper.datasetPublishedSearchRecords, dataset.uuid, published_name, {"fields.value":"record1"});
      Helper.testRecordsEqual(record_1, search_results[0]);

    });

  });

});

test("full range of operations with big data", async () => {
  let template: any = {
    name: "1",
    related_templates: [
      {
        name: "2.1",
        related_templates: [
          {
            name: "3.1",
            related_templates: [
              {
                name: "4.1"
              },
              {
                name: "4.2"
              }
            ]
          },
          {
            name: "3.2",
            related_templates: [
              {
                name: "4.3"
              },
              {
                name: "4.4"
              }
            ]
          }
        ]
      }
    ]
  }
  template = await Helper.templateCreatePersistTest(template);

  let dataset = {
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
                template_id: template.related_templates[0].related_templates[1].related_templates[0]._id
              },
              {
                template_id: template.related_templates[0].related_templates[1].related_templates[1]._id
              }
            ]
          }
        ]
      }
    ]
  }
  dataset = await Helper.datasetCreatePersistTest(dataset);
});

test("all public dataset uuids", async () => {

  let public_date = (new Date()).toISOString();
  let one_hour_late = (new Date((new Date(public_date)).getTime() + 1*60*60*1000)).toISOString();
  let template: any = { 
    name: "t1",
    public_date,
    related_templates: [
      { 
        name: "t2",
        public_date,
        related_templates: [
          { 
            name: "t3",
            public_date,
            related_templates: [
              { 
                name: "t4",
                public_date,
                related_templates: [
                  { 
                    "name": "t5",
                    public_date
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
    public_date,
    related_datasets: [
      { 
        template_id: template.related_templates[0]._id,
        public_date,
        related_datasets: [
          { 
            template_id: template.related_templates[0].related_templates[0]._id,
            public_date: one_hour_late,
            related_datasets: [
              { 
                template_id: template.related_templates[0].related_templates[0].related_templates[0]._id,
                related_datasets: [
                  { 
                    template_id: template.related_templates[0].related_templates[0].related_templates[0].related_templates[0]._id,
                    public_date
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

  let public_dataset_uuids = await Helper.testAndExtract(Helper.datasetAllPublicUuids);
  expect(public_dataset_uuids.length).toBe(3);
  expect(public_dataset_uuids).toEqual(expect.arrayContaining([dataset.uuid, dataset.related_datasets[0].uuid, 
    dataset.related_datasets[0].related_datasets[0].related_datasets[0].related_datasets[0].uuid]));

});

test("all viewable dataset uuids", async () => {

  let public_date = (new Date()).toISOString();
  let template: any = { 
    name: "t",
    public_date
  };
  template = await Helper.templateCreatePersistTest(template);

  Helper.setAgent(agent2);

  let basic_dataset: Record<string, any> = { 
    template_id: template._id
  };
  let admin_dataset = await Helper.datasetCreatePersistTest(basic_dataset);
  let edit_dataset = await Helper.datasetCreatePersistTest(basic_dataset);
  let view_dataset = await Helper.datasetCreatePersistTest(basic_dataset);
  let no_permission_dataset = await Helper.datasetCreatePersistTest(basic_dataset);

  basic_dataset.public_date = public_date;
  let public_dataset = await Helper.datasetCreatePersistTest(basic_dataset);

  await Helper.testAndExtract(Helper.updatePermission, admin_dataset.uuid, PermissionTypes.admin, [Helper.DEF_EMAIL, Helper.EMAIL_2]);
  await Helper.testAndExtract(Helper.updatePermission, edit_dataset.uuid, PermissionTypes.edit, [Helper.DEF_EMAIL]);
  await Helper.testAndExtract(Helper.updatePermission, view_dataset.uuid, PermissionTypes.view, [Helper.DEF_EMAIL]);

  Helper.setAgent(agent1);

  let viewable_dataset_uuids = await Helper.testAndExtract(Helper.datasetAllViewableUuids);
  expect(viewable_dataset_uuids.length).toBe(4);
  expect(viewable_dataset_uuids).toEqual(expect.arrayContaining([admin_dataset.uuid, edit_dataset.uuid, 
    view_dataset.uuid, public_dataset.uuid]));
  
});

describe("latest public datasets", () => {

  test("basic - newest dataset should be included for each uuid", async () => {

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    const public_date = (new Date()).toISOString();

    let template1: any = { 
      name: "t1",
      public_date
    };
    template1 = await Helper.templateCreatePersistTest(template1);
  
    let dataset1: any = {
      template_id: template1._id,
      public_date,
      name: "simple just created - should not appear"
    };
    await Helper.datasetCreateAndTest(dataset1);
    await sleep(1);
    dataset1 = {
      template_id: template1._id,
      name: "simple created and persisted but not public - should not appear"
    };
    await Helper.datasetCreatePersistTest(dataset1);
    await sleep(1);
    dataset1 = {
      template_id: template1._id,
      public_date,
      name: "simple created and persisted - should appear"
    };
    await Helper.datasetCreatePersistTest(dataset1);
    await sleep(1);
    dataset1 = {
      template_id: template1._id,
      public_date,
      name: "simple created, persisted, and another draft created - first persisted - should appear"
    };
    let dataset1_with_uuid = await Helper.datasetCreatePersistTest(dataset1);
    dataset1_with_uuid.name = "simple created, persisted, and another draft created - updated - should not appear"
    await Helper.datasetUpdateAndTest(dataset1_with_uuid);
    await sleep(1);
    dataset1 = {
      template_id: template1._id,
      public_date,
      name: "simple created, persisted, and persisted again - first persisted - should not appear"
    };
    dataset1_with_uuid = await Helper.datasetCreatePersistTest(dataset1);
    dataset1_with_uuid.name = "simple created, persisted, and persisted again - second persisted - should appear"
    await Helper.datasetUpdatePersistTest(dataset1_with_uuid);
    await sleep(1);
    let template2: any = { 
      name: "t1",
      public_date,
      related_templates: [
        { 
          name: "t2",
          public_date
        }
      ]
    };
    template2 = await Helper.templateCreatePersistTest(template2);
  
    let dataset = {
      template_id: template2._id,
      name: "parent - should appear",
      public_date,
      related_datasets: [
        { 
          template_id: template2.related_templates[0]._id,
          name: "child - should appear",
          public_date
        }
      ]
    };
  
    dataset = await Helper.datasetCreatePersistTest(dataset);
  
    let datasets = await Helper.testAndExtract(Helper.allPublicDatasets);
    expect(datasets.length).toBe(5);
  
    expect(["parent - should appear", "child - should appear"]).toContainEqual(datasets[0].name);
    expect(["parent - should appear", "child - should appear"]).toContainEqual(datasets[1].name);
    expect(datasets[2].name).toEqual("simple created, persisted, and persisted again - second persisted - should appear");
    expect(datasets[3].name).toEqual("simple created, persisted, and another draft created - first persisted - should appear");
    expect(datasets[4].name).toEqual("simple created and persisted - should appear");
  
  });

});