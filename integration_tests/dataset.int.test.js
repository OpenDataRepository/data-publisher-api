const request = require("supertest");
var { PERMISSION_ADMIN, PERMISSION_EDIT, PERMISSION_VIEW } = require('../models/permission_group');
var { app, init: appInit, close: appClose } = require('../app');
var HelperClass = require('./common_test_operations');
var Helper = new HelperClass(app);

beforeAll(async () => {
  await appInit();
});

beforeEach(async() => {
  await Helper.clearDatabase();
});

afterAll(async () => {
  await Helper.clearDatabase();
  await appClose();
});

describe("create (and get draft)", () => {
  describe("Success cases", () => {

    test("No related datasets", async () => {

      let template = {
        "name":"t1"
      };
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        template_id: template._id
      };

      await Helper.datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

    });

    test("only one related dataset", async () => {

      let template = {
        name:"t1",
        related_templates:[{
          name: "t2"
        }]
      };
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);


      let dataset = {
        template_id: template._id,
        related_datasets: [{
          template_id: template.related_templates[0]._id
        }]
      };

      await Helper.datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

    });

    test("Create dataset with related datasets going 6 nodes deep", async () => {
  
      let template = { 
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

      let template = {
        name:"t1",
        related_templates:[{
          name: "t2"
        }]
      };
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      let related_dataset = {
        template_id: template.related_templates[0]._id
      };

      related_dataset = await Helper.datasetCreateAndTest(related_dataset, Helper.DEF_CURR_USER);

      let dataset = {
        template_id: template._id,
        related_datasets: [related_dataset]
      };

      await Helper.datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

    });

    test("link one related dataset user only has view permissions for, and one the user has no permissions for", async () => {

      let template = {
        name:"t1",
        related_templates:[{
          name: "t1.1"
        },
        {
          name: "t1.2"
        }]
      };
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      let related_dataset_1 = {
        template_id: template.related_templates[0]._id
      };
      let related_dataset_2 = {
        template_id: template.related_templates[1]._id
      };

      let related_dataset_1_persisted = await Helper.datasetCreatePersistTest(related_dataset_1, Helper.DEF_CURR_USER);
      let related_dataset_2_persisted = await Helper.datasetCreatePersistTest(related_dataset_2, Helper.DEF_CURR_USER);

      related_dataset_1.uuid = related_dataset_1_persisted.uuid;
      related_dataset_2.uuid = related_dataset_2_persisted.uuid;

      let view_users = [Helper.DEF_CURR_USER, Helper.USER_2];
      let response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, template.related_templates[0].uuid, PERMISSION_VIEW, view_users);
      expect(response.statusCode).toBe(200);
      response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, related_dataset_1_persisted.uuid, PERMISSION_VIEW, view_users);
      expect(response.statusCode).toBe(200);

      response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, template.uuid, PERMISSION_VIEW, view_users);
      expect(response.statusCode).toBe(200);

      let dataset = {
        template_id: template._id,
        related_datasets: [related_dataset_1, {uuid: related_dataset_2_persisted.uuid}]
      };

      await Helper.datasetCreateAndTest(dataset, Helper.USER_2);

    });

    test("group ids are the same for datasets created together, but different for anything linked that was created elsewhere", async () => {

      let template = {
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
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      let dataset12 = {
        template_id: template.related_templates[1]._id,
        related_datasets: [{
          template_id: template.related_templates[1].related_templates[0]._id
        }]
      }
      dataset12 = await Helper.datasetCreateAndTest(dataset12, Helper.DEF_CURR_USER);

      let dataset1 = {
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
      dataset1 = await Helper.datasetCreateAndTest(dataset1, Helper.DEF_CURR_USER);

      // check that dataset 1, 1.1, and 1.1.1 all have the same group_uuid, and that 1.2 and 1.2.1 have the same group_uuid (but different than 1)
      expect(dataset1.group_uuid).toEqual(dataset1.related_datasets[0].group_uuid);
      expect(dataset1.group_uuid).toEqual(dataset1.related_datasets[0].related_datasets[0].group_uuid);
      expect(dataset1.group_uuid).not.toEqual(dataset1.related_datasets[1].group_uuid);
      expect(dataset1.related_datasets[1].group_uuid).toEqual(dataset1.related_datasets[1].related_datasets[0].group_uuid);

    });

    test("Can match dataset to template even if the order of related_datasets does not match related_templates", async () => {

      let template = {
        name:"t1",
        related_templates: [
          {name: "t1.1"},
          {name: "t1.2"}
        ]
      };

      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      // uuid list using the templates in the wrong order
      dataset = {
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
      response = await Helper.datasetCreate(dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
    });

    test("two related_datasets pointing to the same related_template", async () => {

      let template = {
        name:"t1",
        related_templates:[{
          name: "t2"
        }]
      };
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);


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

      await Helper.datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

    });

  });

  describe("Failure cases", () => {

    test("Input must be an object", async () => {
      let dataset = [];
      let response = await Helper.datasetCreate(dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);
    });

    test("Template _id must exist, be persisted, and the user has view access to it", async () => {

      // template uuid isn't even a uuid
      let dataset = {
        template_id: 6
      };
      let response = await Helper.datasetCreate(dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

      // no template exists with this uuid
      dataset = {
        template_id: Helper.VALID_UUID
      };
      response = await Helper.datasetCreate(dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

      // template exists with this _id but has not been persisted
      let template = {
        name: "t1"
      };
      template = await Helper.templateCreateAndTest(template, Helper.DEF_CURR_USER);
      let template_id = template._id;
      dataset = {
        template_id
      };
      response = await Helper.datasetCreate(dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

      // template exists with this uuid but user does not have view access to it
      template = {
        name: "t1"
      };
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);
      dataset = {
        template_id: template._id
      };
      response = await Helper.datasetCreate(dataset, Helper.USER_2);
      expect(response.statusCode).toBe(401);

    });

    test("All properties must be of the correct type", async () => {

      let template = {
        name:"t1",
        public_date: (new Date()).toISOString(),
      };

      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        public_date: (new Date()).toISOString(),
        template_id: template._id,
        related_datasets: []
      };
      await Helper.datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

      dataset = {
        public_date: "not a date",
        template_id: template._id,
        related_datasets: []
      };
      response = await Helper.datasetCreate(dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

      dataset = {
        public_date: (new Date()).toISOString(),
        template_id: template._id,
        related_datasets: "invalid"
      };
      response = await Helper.datasetCreate(dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

    });

    test("Dataset must match format of template", async () => {

      let template = {
        name:"t1",
        related_templates: [
          {name: "t1.1"},
          {name: "t1.2"}
        ]
      };

      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      // all related templates match validly
      let dataset = {
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
      await Helper.datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

      // arrays must be of same length
      dataset = {
        template_id: template._id
      };
      let response = await Helper.datasetCreate(dataset, Helper.DEF_CURR_USER);
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
      response = await Helper.datasetCreate(dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);
    });

    test("Create dataset with related_datasets going 6 nodes deep, but 2nd-to last dataset is invalid", async () => {
  
      let template = { 
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
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

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
      let response = await Helper.datasetCreate(dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

    });

    test("Public date must be greater than template public date", async () => {

      let template = {
        name:"t1"
      };

      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        public_date: (new Date()).toISOString(),
        template_id: template._id,
        related_datasets: []
      };
      let response = await Helper.datasetCreate(dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

    });

    test("there must be at least one related_dataset pointing to each related_template from the template", async () => {

      let template = {
        name:"t1",
        related_templates:[{
          name: "t2"
        }]
      };
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        template_id: template._id,
        related_datasets: []
      };
      let response = await Helper.datasetCreate(dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

    });

    test("related_dataset can't point to a related_template not supported by the template", async () => {

      let template = {
        name:"t1",
        related_templates:[{
          name: "t2"
        }]
      };
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      let other_template = {
        name: "other"
      }
      other_template = await Helper.templateCreatePersistTest(other_template, Helper.DEF_CURR_USER);


      let dataset = {
        template_id: template._id,
        related_datasets: [{
          template_id: other_template._id
        }]
      };

      let response = await Helper.datasetCreate(dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

    });

    test("A given dataset may only have a maximum of one instance of a related_dataset", async () => {
  
      let template = { 
        name: "kakashi",
        related_templates: [{
          name: "naruto"
        }],
      };
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      let related_dataset = {
        template_id: template.related_templates[0]._id
      };
      related_dataset = await Helper.datasetCreateAndTest(related_dataset, Helper.DEF_CURR_USER);

      let dataset = { 
        template_id: template._id,
        related_datasets: [related_dataset, related_dataset],
      };
      let response = await Helper.datasetCreate(dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);
    });

    test("A related_dataset can't reference a related_template not supported by the dataset's template", async () => {
  
      let template = { 
        name: "kakashi",
        related_templates: [{
          name: "naruto"
        }],
      };
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      let other_template = {
        name: "sasuke"
      };
      other_template = await Helper.templateCreatePersistTest(other_template, Helper.DEF_CURR_USER);

      let dataset = { 
        template_id: template._id,
        related_datasets: [{
          template_id: other_template._id
        }]
      };
      let response = await Helper.datasetCreate(dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);
    });


  });
});

const populateWithDummyTemplateAndDataset = async () => {

  let template = { 
    "name": "t1",
    public_date: (new Date()).toISOString(),
    "related_templates": [
      { 
        "name": "t2",
        public_date: (new Date()).toISOString()
      }
    ]
  };
  template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

  let dataset = {
    template_id: template._id,
    related_datasets: [{
      template_id: template.related_templates[0]._id
    }]
  };

  dataset = await Helper.datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

  return [template, dataset];
};

describe("update (and get draft)", () => {
  let template;
  let dataset;
  describe("Success cases", () => {
    beforeEach(async() => {
      [template, dataset] = await populateWithDummyTemplateAndDataset();
    });

    test("Basic update - change dataset public date", async () => {
      dataset.public_date = (new Date()).toISOString();
      await Helper.datasetUpdateAndTest(dataset, Helper.DEF_CURR_USER);
    });

    test("Change template used by the dataset", async () => {
      let new_template = { name: "t2"};
      new_template = await Helper.templateCreatePersistTest(new_template, Helper.DEF_CURR_USER);

      dataset = {
        uuid: dataset.uuid,
        template_id: new_template._id
      }

      await Helper.datasetUpdateAndTest(dataset, Helper.DEF_CURR_USER);
    });

  });
  describe("Failure cases", () => {
    beforeEach(async() => {
      [template, dataset] = await populateWithDummyTemplateAndDataset();
    });

    test("uuid in request and in object must match", async () => {
      let response = await Helper.datasetUpdate(Helper.VALID_UUID, dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);
    });

    test("uuid must exist", async () => {
      dataset.uuid = Helper.VALID_UUID;
      let response = await Helper.datasetUpdate(Helper.VALID_UUID, dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(404);
    });

    test("User must have edit access", async () => {
      let response = await Helper.datasetUpdate(dataset.uuid, dataset, Helper.USER_2);
      expect(response.statusCode).toBe(401);
    });

  });

  describe("update after a persist: is draft different and thus created or not?", () => {

    test("update includes no change since last persisted", async () => {
      [template, dataset] = await populateWithDummyTemplateAndDataset();

      dataset = await Helper.datasetPersistAndFetch(dataset.uuid, Helper.DEF_CURR_USER);
      let response = await Helper.datasetUpdate(dataset.uuid, dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect(await Helper.datasetDraftExistingAndTest(dataset.uuid)).toBeFalsy();
      expect(await Helper.datasetDraftExistingAndTest(dataset.related_datasets[0].uuid)).toBeFalsy();
    });

    test("template_uuid and public date", async () => {
      let template = {
        name: "naruto",
        public_date: (new Date()).toISOString()
      };
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);
  
      let dataset = {
        template_id: template._id
      };
      dataset = await Helper.datasetCreatePersistTest(dataset, Helper.DEF_CURR_USER);
      expect(await Helper.datasetDraftExistingAndTest(dataset.uuid)).toBe(false);
  
      let template_2 = {
        name: "sasuke",
        public_date: (new Date()).toISOString()
      };
      template_2 = await Helper.templateCreatePersistTest(template_2, Helper.DEF_CURR_USER);
      dataset.template_id = template_2._id;
      await Helper.datasetUpdateAndTest(dataset, Helper.DEF_CURR_USER);
      expect(await Helper.datasetDraftExistingAndTest(dataset.uuid)).toBe(true);
  
      dataset.template_id = template._id;
      dataset.public_date = (new Date()).toISOString();
      await Helper.datasetUpdateAndTest(dataset, Helper.DEF_CURR_USER);
      expect(await Helper.datasetDraftExistingAndTest(dataset.uuid)).toBe(true);
  
    });

    test("new related_dataset", async () => {
      [template, dataset] = await populateWithDummyTemplateAndDataset();

      dataset = await Helper.datasetPersistAndFetch(dataset.uuid, Helper.DEF_CURR_USER);

      let new_related_dataset = dataset.related_datasets[0];
      delete new_related_dataset.uuid;
      delete new_related_dataset.group_uuid;
      new_related_dataset =  await Helper.datasetCreatePersistTest(new_related_dataset, Helper.DEF_CURR_USER);

      dataset.related_datasets = [new_related_dataset];

      await Helper.datasetUpdateAndTest(dataset, Helper.DEF_CURR_USER);
      expect(await Helper.datasetDraftExistingAndTest(dataset.uuid)).toBeTruthy();
    });

    test("a new version of the linked template has been persisted", async () => {
      [template, dataset] = await populateWithDummyTemplateAndDataset();

      // Modify the related template and persist it 
      // Nothing should change, since datasets point to template _ids

      dataset = await Helper.datasetPersistAndFetch(dataset.uuid, Helper.DEF_CURR_USER);
      template.description = "des";
      template = await Helper.templateUpdatePersistTest(template, Helper.DEF_CURR_USER);
      await Helper.datasetUpdateAndTest(dataset, Helper.DEF_CURR_USER);
      expect(await Helper.datasetDraftExistingAndTest(dataset.uuid)).toBeFalsy();
      expect(await Helper.datasetDraftExistingAndTest(dataset.related_datasets[0].uuid)).toBeFalsy();
    });

    test("a new version of a related_dataset has been persisted", async () => {
      [template, dataset] = await populateWithDummyTemplateAndDataset();

      dataset = await Helper.datasetPersistAndFetch(dataset.uuid, Helper.DEF_CURR_USER);

      let related_dataset = dataset.related_datasets[0];
      related_dataset.public_date = (new Date()).toISOString();
      await Helper.datasetUpdateAndTest(related_dataset, Helper.DEF_CURR_USER);
      await Helper.datasetPersistAndFetch(related_dataset.uuid, Helper.DEF_CURR_USER);

      await Helper.datasetUpdateAndTest(dataset, Helper.DEF_CURR_USER);
      expect(await Helper.datasetDraftExistingAndTest(dataset.uuid)).toBeTruthy();
      expect(await Helper.datasetDraftExistingAndTest(related_dataset.uuid)).toBeFalsy();
    });

    test("updating a related_dataset creates drafts of parents but not children", async () => {
      // Create and persist template
      let template = {
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
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      let dataset = {
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
      dataset = await Helper.datasetCreatePersistTest(dataset, Helper.DEF_CURR_USER);

      //  Submit an update on the 3rd layer
      let response = await Helper.datasetDraftGet(dataset.uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      dataset = response.body;
      dataset.related_datasets[0].related_datasets[0].public_date = (new Date()).toISOString();
      await Helper.datasetUpdateAndTest(dataset, Helper.DEF_CURR_USER);

      // The first 3 layers, but not the fourth layer, should have drafts
      expect(await Helper.datasetDraftExistingAndTest(dataset.uuid)).toBeTruthy();
      expect(await Helper.datasetDraftExistingAndTest(dataset.related_datasets[0].uuid)).toBeTruthy();
      expect(await Helper.datasetDraftExistingAndTest(dataset.related_datasets[0].related_datasets[0].uuid)).toBeTruthy();
      expect(await Helper.datasetDraftExistingAndTest(dataset.related_datasets[0].related_datasets[0].related_datasets[0].uuid)).toBeFalsy();

    });

    test("if a subscribed template is updated and persisted but the dataset's subscribed reference doesn't change, dataset doesn't update", async () => {

      let subscribed_template = {name: "sub"};
      subscribed_template = await Helper.templateCreatePersistTest(subscribed_template, Helper.DEF_CURR_USER);

      let template = {
        name: "t", 
        subscribed_templates: [subscribed_template]
      };
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        template_id: template._id,
        related_datasets: [
          {
            template_id: subscribed_template._id
          }
        ]
      };
      dataset = await Helper.datasetCreatePersistTest(dataset, Helper.DEF_CURR_USER);

      // Modify the subscribed template and persist it 
      subscribed_template.description = "changed";
      subscribed_template = await Helper.templateUpdatePersistTest(subscribed_template, Helper.DEF_CURR_USER);

      // Now there shouldn't be any update to the dataset if we try to update
      await Helper.datasetUpdateAndTest(dataset, Helper.DEF_CURR_USER);
      expect(await Helper.datasetDraftExistingAndTest(dataset.uuid)).toBeFalsy();
      expect(await Helper.datasetDraftExistingAndTest(dataset.related_datasets[0].uuid)).toBeFalsy();
    });
  
  });
});

describe("get draft", () => {
  test("must have edit permission", async () => {
    let template = {
      name: "t"
    }
    template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);
    let dataset = {
      template_id: template._id
    };
    dataset = await Helper.datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);
    
    let response = await Helper.datasetDraftGet(dataset.uuid, Helper.USER_2);
    expect(response.statusCode).toBe(401);
  });

  test("if user has view but not edit access to linked dataset, the pubished version replaces that dataset", async () => {

    let template = { 
      name: "t1",
      related_templates: [{name: "t2"}],
      public_date: (new Date()).toISOString()
    };
    template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);  

    let related_dataset = {
      template_id: template.related_templates[0]._id
    };
    related_dataset = await Helper.datasetCreatePersistTest(related_dataset, Helper.DEF_CURR_USER);

    let dataset = {
      template_id: template._id,
      related_datasets: [related_dataset]
    };
    dataset = await Helper.datasetCreatePersistTest(dataset, Helper.DEF_CURR_USER);

    let users = [Helper.DEF_CURR_USER, Helper.USER_2];

    let response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, dataset.uuid, PERMISSION_ADMIN, users);
    expect(response.statusCode).toBe(200);

    response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, template.related_templates[0].uuid, PERMISSION_VIEW, users);
    expect(response.statusCode).toBe(200);
    response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, dataset.related_datasets[0].uuid, PERMISSION_VIEW, users);
    expect(response.statusCode).toBe(200);

    // Fetch parent dataset, check that related_dataset is fetched as the persisted version
    let dataset_draft = await Helper.datasetDraftGetAndTest(dataset.uuid, Helper.USER_2);
    Helper.testDatasetDraftsEqual(dataset, dataset_draft);

  });

  test("if user has neither view nor edit access to linked properties, an empty object replaces that property", async () => {

    let template = { 
      name: "t1",
      related_templates: [{name: "t2"}],
      public_date: (new Date()).toISOString()
    };
    template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);  

    let related_dataset = {
      template_id: template.related_templates[0]._id
    };
    related_dataset = await Helper.datasetCreatePersistTest(related_dataset, Helper.DEF_CURR_USER);

    let dataset = {
      template_id: template._id,
      related_datasets: [related_dataset]
    };
    dataset = await Helper.datasetCreatePersistTest(dataset, Helper.DEF_CURR_USER);

    let users = [Helper.DEF_CURR_USER, Helper.USER_2];

    let response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, dataset.uuid, PERMISSION_ADMIN, users);
    expect(response.statusCode).toBe(200);


    // Fetch parent dataset, check that related_dataset is fetched as the persisted version
    let dataset_draft = await Helper.datasetDraftGetAndTest(dataset.uuid, Helper.USER_2);
    dataset.related_datasets[0] = {uuid: related_dataset.uuid};
    Helper.testDatasetDraftsEqual(dataset, dataset_draft);
  });
});

describe("persist (and get persisted)", () => {
  describe("Success cases", () => {
    test("Simple persist - no related datasets", async () => {
      let template = { 
        "name": "t1"
      };
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);
      let dataset = {
        template_id: template._id
      }
      await Helper.datasetCreatePersistTest(dataset, Helper.DEF_CURR_USER);
      
    });

    test("Complex persist - with a related dataset", async () => {

      let template = {
        name:"t1",
        related_templates:[{
          name: "t2"
        }]
      };

      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      let related_dataset = {
        template_id: template.related_templates[0]._id
      };
      let dataset = {
        template_id: template._id,
        related_datasets:[related_dataset]
      };
      let persisted = await Helper.datasetCreatePersistTest(dataset, Helper.DEF_CURR_USER);

      let related_dataset_uuid = persisted.related_datasets[0].uuid;

      // Check that the related dataset was also persisted
      response = await Helper.datasetLatestPersisted(related_dataset_uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject(related_dataset);
    });

    test("Complex persist - changes in a nested property result in persisting for all parent properties", async () => {

      let template = {
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
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      let dataset = {
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
      dataset = await Helper.datasetCreatePersistTest(dataset, Helper.DEF_CURR_USER);

      // Make a change in the third level of data
      dataset.related_datasets[0].related_datasets[0].public_date = (new Date()).toISOString();

      // Update with change
      let response = await Helper.datasetUpdate(dataset.uuid, dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);

      // Record the date before we persist a second time
      let intermediate_persist_date = (new Date()).getTime();

      dataset = await Helper.datasetPersistAndFetch(dataset.uuid, Helper.DEF_CURR_USER);

      // On the third node and above, the persist date should be newer than the intermediate_persist_date. 
      // The fourth should be older
      
      expect(new Date(dataset.persist_date).getTime()).toBeGreaterThan(intermediate_persist_date);
      expect(new Date(dataset.related_datasets[0].persist_date).getTime()).toBeGreaterThan(intermediate_persist_date);
      expect(new Date(dataset.related_datasets[0].related_datasets[0].persist_date).getTime()).toBeGreaterThan(intermediate_persist_date);
      expect(new Date(dataset.related_datasets[0].related_datasets[0].related_datasets[0].persist_date).getTime()).toBeLessThan(intermediate_persist_date);

    });

    test("Complex persist - persist parent who's child changed previously and no other changes are present", async () => {

      let template = {
        "name":"1",
        "related_templates":[{
          "name": "2",
          public_date: (new Date()).toISOString()
        }]
      };
      // Create initial data
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        template_id: template._id,
        "related_datasets":[{
          template_id: template.related_templates[0]._id,
        }]
      };
      // Create initial data
      dataset = await Helper.datasetCreatePersistTest(dataset, Helper.DEF_CURR_USER);
      let uuid = dataset.uuid;

      // Make a change in the second level of data
      dataset.related_datasets[0].public_date = (new Date()).toISOString();
      let uuid2 = dataset.related_datasets[0].uuid;

      // Update second dataset
      let response = await Helper.datasetUpdate(uuid2, dataset.related_datasets[0], Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);

      // Record the date before we persist the change to the second dataset
      let persist_date_2 = (new Date()).getTime();

      await Helper.datasetPersistAndFetch(uuid2, Helper.DEF_CURR_USER);
      
      // Now we want to get a draft of the parent and persist that draft as it is. It should be successful since the child changed.
      
      response = await Helper.datasetDraftGet(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      dataset = response.body;
      
      // Update with change
      response = await Helper.datasetUpdate(uuid, dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);

      // Record the date before we persist the parent dataset again
      let persist_date_3 = (new Date()).getTime();

      dataset = await Helper.datasetPersistAndFetch(uuid, Helper.DEF_CURR_USER);

      expect(new Date(dataset.persist_date).getTime()).toBeGreaterThan(persist_date_3);
      expect(new Date(dataset.related_datasets[0].persist_date).getTime()).toBeGreaterThan(persist_date_2);
      expect(new Date(dataset.related_datasets[0].persist_date).getTime()).toBeLessThan(persist_date_3);
    });

    test("Still able to persist parent even if don't have permission to persist child", async () => {
      let template = {
        name:"t1",
        public_date: (new Date()).toISOString(),
        related_templates:[{
          name: "t1.1",
          public_date: (new Date()).toISOString()
        }]
      };
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        template_id: template._id,
        related_datasets:[{
          template_id: template.related_templates[0]._id
        }]
      };
      dataset = await Helper.datasetCreatePersistTest(dataset, Helper.DEF_CURR_USER);

      // Update with user 1
      let response = await Helper.datasetDraftGet(dataset.uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let draft = response.body;
      draft.public_date = (new Date()).toISOString();
      draft.related_datasets[0].public_date = (new Date()).toISOString();
      response = await Helper.datasetUpdate(draft.uuid, draft, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);

      // Give user 2 edit permissions to parent dataset
      let admin_users = [Helper.DEF_CURR_USER, Helper.USER_2];
      response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, dataset.uuid, PERMISSION_ADMIN, admin_users);
      expect(response.statusCode).toBe(200);

      // Now let user 2 persist the parent dataset
      await Helper.datasetPersistAndFetch(dataset.uuid, Helper.USER_2);

      // Now verify that user 2 persisted the parent but not the child.

      // Check that the related dataset was not persisted
      response = await Helper.datasetLatestPersisted(dataset.related_datasets[0].uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject(dataset.related_datasets[0]);

      // Check that the parent was persisted
      response = await Helper.datasetLatestPersisted(dataset.uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toMatchObject(dataset);
      // Also check that it is still pointing to the original persisted related_dataset
      expect(response.body.related_datasets[0]._id).toBe(dataset.related_datasets[0]._id);

    });

    test("Simple change - only template was updated", async () => {
      let template = { 
        "name": "t1"
      };
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);
      
      let dataset = {
        template_id: template._id
      }
      let dataset_persisted = await Helper.datasetCreatePersistTest(dataset, Helper.DEF_CURR_USER);

      template.description = "naruto";
      template = await Helper.templateUpdatePersistTest(template, Helper.DEF_CURR_USER);

      dataset.uuid = dataset_persisted.uuid;
      dataset.template_id = template._id;
      await Helper.datasetUpdatePersistTest(dataset, Helper.DEF_CURR_USER);
      
    });

    test("one related dataset, pointing to template with one subscribed template", async () => {

      let subscribed_template = {
        name: "t2"
      };
      subscribed_template = await Helper.templateCreatePersistTest(subscribed_template, Helper.DEF_CURR_USER);

      let template = {
        name:"t1",
        subscribed_templates:[subscribed_template]
      };
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);


      let dataset = {
        template_id: template._id,
        related_datasets: [{
          template_id: template.subscribed_templates[0]._id
        }]
      };

      await Helper.datasetCreatePersistTest(dataset, Helper.DEF_CURR_USER);

    });

  });

  describe("Failure cases", () => {
    test("Dataset with uuid must exist", async () => {

      let template = {
        name:"t1"
      };
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        template_id: template._id
      }
      dataset = await Helper.datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

      let response = await Helper.datasetLastUpdate(dataset.uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let last_update = response.body;

      response = await Helper.datasetPersist(Helper.VALID_UUID, last_update, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(404);

    });

    test("There must be changes to persist", async () => {
      let template = {
        name:"t1"
      };
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        template_id: template._id
      }
      dataset = await Helper.datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

      let response = await Helper.datasetLastUpdate(dataset.uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let last_update = response.body;

      response = await Helper.datasetPersist(dataset.uuid, last_update, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);

      response = await Helper.datasetPersist(dataset.uuid, last_update, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);
    });

    test("Internal refrences must be valid", async () => {
      let template = {
        name:"t1",
        related_templates: [{
          name: "t1.1"
        }]
      };
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        template_id: template._id,
        related_datasets: [{
          template_id: template.related_templates[0]._id
        }]
      }

      dataset = await Helper.datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

      // Delete the internal draft
      let response = await Helper.datasetDelete(dataset.related_datasets[0].uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);

      response = await Helper.datasetLastUpdate(dataset.uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let last_update = response.body;

      // Expect persist of parent draft to fail because of invalid reference 
      response = await Helper.datasetPersist(dataset.uuid, last_update, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

      // Try updating. This should also fail.
      response = await Helper.datasetUpdate(dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

    });

    test("Last update provided must match to actual last update in the database", async () => {
      let template = {
        name: "t1"
      };
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        template_id: template._id
      };
      dataset = await Helper.datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

      let response =  await Helper.datasetPersist(dataset.uuid, (new Date()).toISOString(), Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);
    });

    test("Last update provided must match to actual last update of dataset and all sub-datasets in the database", async () => {
      let template = {
        name: "t1",
        related_templates: [
          {
            name: "t1.1",
            public_date: (new Date()).toISOString()
          }
        ]
      };
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        template_id: template._id,
        related_datasets: [{
          template_id: template.related_templates[0]._id
        }]
      };
      dataset = await Helper.datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);
      let old_update = dataset.updated_at;

      let related_dataset = dataset.related_datasets[0];
      related_dataset.public_date = (new Date()).toISOString();

      let response = await Helper.datasetUpdate(related_dataset.uuid, related_dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);

      // Should fail to update since we don't have the most recent update
      response = await Helper.datasetPersist(dataset.uuid, old_update, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

      // Should succeed in persisting if we do use the most recent update
      response = await Helper.datasetDraftGet(related_dataset.uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let new_update = response.body.updated_at;

      response = await Helper.datasetPersist(dataset.uuid, new_update, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);

    });

    test("User must have admin permission to persist", async () => {

      let template = {
        name:"t1"
      };
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        template_id: template._id
      };
      dataset = await Helper.datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

      // A different user shouldn't be able to persist
      let response = await Helper.datasetLastUpdate(dataset.uuid, Helper.DEF_CURR_USER);
      let last_update = response.body;
      response = await Helper.datasetPersist(dataset.uuid, last_update, Helper.USER_2);
      expect(response.statusCode).toBe(401);

      // Even if that user has view permissions, they still shouldn't be able to persist
      response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, template.uuid, PERMISSION_VIEW, [Helper.DEF_CURR_USER, Helper.USER_2]);
      expect(response.statusCode).toBe(200);
      response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, dataset.uuid, PERMISSION_VIEW, [Helper.DEF_CURR_USER, Helper.USER_2]);
      expect(response.statusCode).toBe(200);

      response = await Helper.datasetPersist(dataset.uuid, last_update, Helper.USER_2);
      expect(response.statusCode).toBe(401);
    });

    test("Dataset must match format of template", async () => {

      let template = {
        name:"t1",
        related_templates: [
          {name: "t1.1"}
        ]
      };
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      // create dataset, matching template format
      let dataset = {
        template_id: template._id,
        related_datasets: [
          { 
            template_id: template.related_templates[0]._id
          }
        ]
      };
      dataset = await Helper.datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

      // in the meantime, the template format changes
      template.related_templates = [];
      template = await Helper.templateUpdatePersistTest(template, Helper.DEF_CURR_USER);

      let response = await Helper.datasetLastUpdate(dataset.uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let last_update = response.body;

      // Now persisting the dataset should fail since it no longer matches the template format
      await Helper.datasetPersist(dataset.uuid, last_update, Helper.DEF_CURR_USER);
    });

    test("If user doesn't have admin access to linked dataset and that dataset doesn't have a persisted version, then we can't persist", async () => {
      let public_date = (new Date()).toISOString();
      let template = {
        name:"t1",
        public_date,
        related_templates:[{
          name: "t2",
          public_date
        }]
      };

      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      let related_dataset = {
        template_id: template.related_templates[0]._id
      };
      related_dataset = await Helper.datasetCreateAndTest(related_dataset, Helper.USER_2);

      let dataset = {
        template_id: template._id,
        related_datasets:[{uuid: related_dataset.uuid}]
      };
      dataset = await Helper.datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

      let last_update = await Helper.datasetLastUpdateAndTest(dataset.uuid, Helper.DEF_CURR_USER);
      let response = await Helper.datasetPersist(dataset.uuid, last_update, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);
    });
  });
});

describe("get persisted", () => {
  test("if user does not have view access to linked properties, an empty object replaces that property", async () => {
    
    let template = { 
      name: "t1",
      related_templates: [{name: "t1.1"}]
    };
    template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);  
    
    let dataset = { 
      template_id: template._id,
      related_datasets: [{
        template_id: template.related_templates[0]._id
      }]
    };
    dataset = await Helper.datasetCreatePersistTest(dataset, Helper.DEF_CURR_USER);  
    
    let view_users = [Helper.USER_2, Helper.DEF_CURR_USER];
    let response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, template.uuid, PERMISSION_VIEW, view_users);
    expect(response.statusCode).toBe(200);
    response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, dataset.uuid, PERMISSION_VIEW, view_users);
    expect(response.statusCode).toBe(200);

    dataset.related_datasets[0] = {uuid: dataset.related_datasets[0].uuid};
    // Fetch parent dataset, check that the related_dataset is fetched as blank 
    // since the second user
    response = await Helper.datasetLatestPersisted(dataset.uuid, Helper.USER_2);
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject(dataset);   
  });

  test("must have view permissions", async () => {
    let template = { 
      name: "t1"
    };
    template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);  

    let dataset = { 
      template_id: template._id
    };
    dataset = await Helper.datasetCreatePersistTest(dataset, Helper.DEF_CURR_USER);  

    let response = await Helper.datasetLatestPersisted(dataset.uuid, Helper.USER_2);
    expect(response.statusCode).toBe(401);
  });
});

test("get persisted for a certain date", async () => {
  let template = {
    name:"t1",
    public_date: (new Date()).toISOString()
  };
  template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

  let dataset = {
    template_id: template._id
  };
  dataset = await Helper.datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);
  let uuid = dataset.uuid;

  let beforeFirstPersist = new Date();

  // Test that if only a draft exists, it is not fetched
  let response = await Helper.datasetLatestPersistedBeforeDate(uuid, beforeFirstPersist.toISOString(), Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(404);

  await Helper.datasetPersistAndFetch(uuid, Helper.DEF_CURR_USER);

  let afterFirstPersist = new Date();

  // dataset.uuid = uuid;
  let public_date_1 = (new Date()).toISOString();
  dataset.public_date = public_date_1;
  dataset.uuid = uuid;

  response = await Helper.datasetUpdate(uuid, dataset, Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(200);
  await Helper.datasetPersistAndFetch(uuid, Helper.DEF_CURR_USER);

  let afterSecondPersist = new Date();

  let public_date_2 = (new Date()).toISOString();
  dataset.public_date = public_date_2;

  response = await Helper.datasetUpdate(uuid, dataset, Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(200);
  await Helper.datasetPersistAndFetch(uuid, Helper.DEF_CURR_USER);

  // Now there should be three persisted versions. Search for each based on the date

  response = await Helper.datasetLatestPersisted(uuid, Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(200);
  expect(response.body.public_date).toEqual(public_date_2);

  response = await Helper.datasetLatestPersistedBeforeDate(uuid, (new Date()).toISOString(), Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(200);
  expect(response.body.public_date).toEqual(public_date_2);

  response = await Helper.datasetLatestPersistedBeforeDate(uuid, afterSecondPersist.toISOString(), Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(200);
  expect(response.body.public_date).toEqual(public_date_1);

  response = await Helper.datasetLatestPersistedBeforeDate(uuid, afterFirstPersist.toISOString(), Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(200);
  expect(response.body.public_date).toBe(undefined);

  response = await Helper.datasetLatestPersistedBeforeDate(uuid, beforeFirstPersist.toISOString(), Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(404);
});

describe("lastUpdate", () => {

  describe("success", () => {
    test("basic draft, no related datasets", async () => {
      let template = {
        "name":"t1"
      };
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      let timestamp = new Date();
      let dataset = {
        template_id: template._id
      };
      dataset = await Helper.datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

      let response = await Helper.datasetLastUpdate(dataset.uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(timestamp.getTime());
    });

    test("basic persisted, with related_datasets. available to anyone with view permissions", async () => {
      let template = {
        name:"t1"
      };
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);
      let timestamp = new Date();
      let dataset = {
        template_id: template._id
      };
      dataset = await Helper.datasetCreatePersistTest(dataset, Helper.DEF_CURR_USER);

      let response = await Helper.datasetLastUpdate(dataset.uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(timestamp.getTime());

      let view_users = [Helper.USER_2, Helper.DEF_CURR_USER];
      response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, template.uuid, PERMISSION_VIEW, view_users);
      expect(response.statusCode).toBe(200);
      response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, dataset.uuid, PERMISSION_VIEW, view_users);
      expect(response.statusCode).toBe(200);

      response = await Helper.datasetLastUpdate(dataset.uuid, Helper.USER_2);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(timestamp.getTime());
    });

    test("sub dataset updated later than parent dataset", async () => {
      let template = {
        "name": "t1",
        "related_templates": [{
          "name": "t2",
          "related_templates": [{
            "name": "t3",
            public_date: (new Date()).toISOString()
          }]
        }]
      };
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        template_id: template._id,
        related_datasets: [{
          template_id: template.related_templates[0]._id,
          related_datasets: [{
            template_id: template.related_templates[0].related_templates[0]._id
          }]
        }]
      };
      dataset = await Helper.datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);
      let uuid = dataset.uuid;

      let timestamp_between_create_and_update = new Date();

      // Update 3. 1 and 2 dates should be 3
      let dataset3 = dataset.related_datasets[0].related_datasets[0];
      dataset3.public_date = (new Date()).toISOString()


      response = await Helper.datasetUpdate(dataset3.uuid, dataset3, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);

      let timestamp_after_update = new Date();

      response = await Helper.datasetLastUpdate(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(timestamp_between_create_and_update.getTime());
      expect((new Date(response.body)).getTime()).toBeLessThan(timestamp_after_update.getTime());

      response = await Helper.datasetLastUpdate(dataset3.uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(timestamp_between_create_and_update.getTime());
      expect((new Date(response.body)).getTime()).toBeLessThan(timestamp_after_update.getTime());
      
    });

    test("sub dataset updated and persisted later than parent dataset", async () => {

      let template = {
        "name": "1",
        "related_templates": [{
          "name": "2",
          public_date: (new Date()).toISOString()
        }]
      };
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        template_id: template._id,
        related_datasets: [{
          template_id: template.related_templates[0]._id
        }]
      };
      dataset = await Helper.datasetCreatePersistTest(dataset, Helper.DEF_CURR_USER);

      let related_dataset = dataset.related_datasets[0];
      related_dataset.public_date = (new Date()).toISOString();

      let response = await Helper.datasetUpdate(related_dataset.uuid, related_dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toEqual(200);

      let time1 = new Date();
      await Helper.datasetPersistAndFetch(related_dataset.uuid, Helper.DEF_CURR_USER);
      let time2 = new Date();

      response = await Helper.datasetLastUpdate(dataset.uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(time1.getTime());
      expect((new Date(response.body)).getTime()).toBeLessThan(time2.getTime());
    });

    test("grandchild updated, but child deleted. Updated time should still be grandchild updated", async () => {
      let template = {
        "name": "1",
        "related_templates": [{
          "name": "2",
          "related_templates": [{
            "name": "3",
            public_date: (new Date()).toISOString()
          }]
        }]
      };
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        template_id: template._id,
        related_datasets: [{
          template_id: template.related_templates[0]._id,
          related_datasets: [{
            template_id: template.related_templates[0].related_templates[0]._id
          }]
        }]
      };
      dataset = await Helper.datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

      let dataset2 = dataset.related_datasets[0];
      let dataset3 = dataset2.related_datasets[0];

      // persist
      await Helper.datasetPersistAndFetch(dataset.uuid, Helper.DEF_CURR_USER);

      // Update grandchild
      dataset3.public_date = (new Date()).toISOString();

      response = await Helper.datasetUpdate(dataset3.uuid, dataset3, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);

      response = await Helper.datasetDraftGet(dataset3.uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let update_3_timestamp = response.body.updated_at;

      // Now get the update timestamp for the grandparent. It should be that of the grandchild.
      response = await Helper.datasetLastUpdate(dataset.uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual(update_3_timestamp);
      
    });

  });

  describe("failure", () => {
    test("invalid uuid", async () => {
      let response = await Helper.datasetLastUpdate(15, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

      response = await Helper.datasetLastUpdate(Helper.VALID_UUID, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(404);
    });

    test("must have edit permissions to get last update of draft", async () => {
      let template = {
        "name":"t1"
      };
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        template_id: template._id
      };
      dataset = await Helper.datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

      let response = await Helper.datasetLastUpdate(dataset.uuid, Helper.USER_2);
      expect(response.statusCode).toBe(401);
    });

    test("must have view permissions to get last update of persisted", async () => {
      let template = {
        "name":"t1"
      };
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        template_id: template._id
      };
      dataset = await Helper.datasetCreatePersistTest(dataset, Helper.DEF_CURR_USER);

      let response = await Helper.datasetLastUpdate(dataset.uuid, Helper.USER_2);
      expect(response.statusCode).toBe(401);
    });
  });
});

describe("delete", () => {
  test("delete a draft, not a persisted version", async () => {
    let template = {
      name: "t1",
      public_date: (new Date()).toISOString()
    };
    template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

    let dataset = {
      template_id: template._id
    }
    dataset = await Helper.datasetCreatePersistTest(dataset, Helper.DEF_CURR_USER);
  
    dataset.public_date = (new Date()).toISOString();
  
    // Change the draft, but don't persist the change
    response = await Helper.datasetUpdate(dataset.uuid, dataset, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
  
    // Verify that the draft is what we changed it to
    response = await Helper.datasetDraftGet(dataset.uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
  
    // Delete the draft
    response = await Helper.datasetDelete(dataset.uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
  
    // Get the draft again. Make sure it matches the latest persisted version
    response = await Helper.datasetDraftGet(dataset.uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
  
    delete dataset._id;
    delete dataset.template_id;
    delete dataset.persist_date;
    delete dataset.public_date;
    expect(response.body).toMatchObject(dataset);
  
  });

  test("dataset doesn't exist", async () => {
    let response = await Helper.datasetDelete(Helper.VALID_UUID, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(404);
  });

  test("need admin permissions", async () => {
    let template = {
      name: "t1"
    };
    template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

    let dataset = {
      template_id: template._id
    };
    dataset = await Helper.datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

    let response = await Helper.datasetDelete(dataset.uuid, Helper.USER_2);
    expect(response.statusCode).toBe(401);
  });
});

describe("duplicate", () => {
  describe("success", () => {
    test("normal test, some things in the same group_uuid and some not", async () => {
      let template = {
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
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      let dataset12 = {
        template_id: template.related_templates[1]._id,
        related_datasets: [{
          template_id: template.related_templates[1].related_templates[0]._id
        }]
      };
      dataset12 = await Helper.datasetCreateAndTest(dataset12, Helper.DEF_CURR_USER);

      let dataset1 = {
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
      dataset1 = await Helper.datasetCreatePersistTest(dataset1, Helper.DEF_CURR_USER);

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

      let response = await Helper.datasetDuplicate(dataset1.uuid, Helper.DEF_CURR_USER);
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
      let template = {
        name:"t1",
        public_date: (new Date()).toISOString(),
        related_templates:[
          {
            name: "t1.1"
          }
        ]
      };
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      let related_dataset = {
        template_id: template.related_templates[0]._id
      };
      related_dataset = await Helper.datasetCreatePersistTest(related_dataset, Helper.DEF_CURR_USER);

      let dataset = {
        template_id: template._id,
        public_date: (new Date()).toISOString(),
        related_datasets: [related_dataset]
      };
      dataset = await Helper.datasetCreatePersistTest(dataset, Helper.DEF_CURR_USER);

      response = await Helper.datasetDuplicate(dataset.uuid, Helper.USER_2);
      expect(response.statusCode).toBe(200);
      let new_dataset = response.body;

      expect(new_dataset.template_id).toEqual(dataset.template_id);
      expect(new_dataset.related_datasets).toEqual([]);
    });

    test("Duplicate a dataset with a couple references to the same dataset uuid", async () => {
      let template = {
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
      template = await Helper.templateCreateAndTest(template, Helper.DEF_CURR_USER);
      template.related_templates[1].related_templates.push(template.related_templates[0]);
      template = await Helper.templateUpdatePersistTest(template, Helper.DEF_CURR_USER)

      let dataset = {
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
      dataset = await Helper.datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);
      dataset.related_datasets[1].related_datasets[0].uuid = dataset.related_datasets[0].uuid;
      dataset = await Helper.datasetUpdatePersistTest(dataset, Helper.DEF_CURR_USER);

      let new_dataset = await Helper.testAndExtract(Helper.datasetDuplicate, dataset.uuid, Helper.DEF_CURR_USER);

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
      let template = {
        name:"t1"
      };
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        template_id: template._id
      };
      dataset = await Helper.datasetCreatePersistTest(dataset, Helper.DEF_CURR_USER);

      response = await Helper.datasetDuplicate(dataset.uuid, Helper.USER_2);
      expect(response.statusCode).toBe(401);
    });
  });
});

describe("publish (and get published", () => {

  test("basic test that it works", async () => {

    let template = {
      name:"t1",
      public_date: (new Date()).toISOString()
    };
    template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);
  
    let public_date_1 = (new Date()).toISOString();
    let dataset = {
      template_id: template._id,
      public_date: public_date_1
    };
    dataset = await Helper.datasetCreatePersistTest(dataset, Helper.DEF_CURR_USER);

    let public_date_2 = (new Date()).toISOString();
    dataset.public_date = public_date_2;
    let dataset_1 = await Helper.datasetUpdatePersistTest(dataset, Helper.DEF_CURR_USER);

    let published_name_1 = "first";
    let published_name_2 = "second";
  
    await Helper.testAndExtract(Helper.datasetPublish, dataset.uuid, published_name_1, Helper.DEF_CURR_USER);

    let public_date_3 = (new Date()).toISOString();
    dataset.public_date = public_date_3;
    dataset = await Helper.datasetUpdatePersistTest(dataset, Helper.DEF_CURR_USER);

    let public_date_4 = (new Date()).toISOString();
    dataset.public_date = public_date_4;
    let dataset_2 = await Helper.datasetUpdatePersistTest(dataset, Helper.DEF_CURR_USER);

    await Helper.testAndExtract(Helper.datasetPublish, dataset.uuid, published_name_2, Helper.DEF_CURR_USER);

    let dataset_uuid = dataset.uuid;
    dataset = await Helper.testAndExtract(Helper.datasetPublished, dataset_uuid, published_name_1, Helper.DEF_CURR_USER);
    Helper.testDatasetDraftsEqual(dataset_1, dataset);

    dataset = await Helper.testAndExtract(Helper.datasetPublished, dataset_uuid, published_name_2, Helper.DEF_CURR_USER);
    Helper.testDatasetDraftsEqual(dataset_2, dataset);

  });

  describe("Failure cases", () => {

    const createDummyTemplateAndDataset = async () => {
      let template = {
        name: "t"
      };
      template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        template_id: template._id
      }
      dataset = await Helper.datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);
      return dataset;
    }

    const createDummyTemplateAndPersistedDataset = async () => {
      dataset = await createDummyTemplateAndDataset();
      return await Helper.datasetPersistAndFetch(dataset.uuid, Helper.DEF_CURR_USER);
    }

    test("uuid and name must be valid format", async () => {
      let response = await Helper.datasetPublish("6", "name", Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

      response = await Helper.datasetPublish(Helper.VALID_UUID, 6, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);
    });

    test("published dataset must exist", async () => {
      let response = await Helper.datasetPublish(Helper.VALID_UUID, "name", Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(404);

      let dataset = await createDummyTemplateAndDataset();
      response = await Helper.datasetPublish(dataset.uuid, "name", Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(404);
    });

    test("user must have admin permissions", async () => {
      let dataset = await createDummyTemplateAndPersistedDataset();
      response = await Helper.datasetPublish(dataset.uuid, "name", Helper.USER_2);
      expect(response.statusCode).toBe(401);
    });

    test("Cannot publish with the same name twice", async () => {
      let dataset = await createDummyTemplateAndPersistedDataset();
      response = await Helper.datasetPublish(dataset.uuid, "name", Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      response = await Helper.datasetPublish(dataset.uuid, "name", Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);
    });

  });

});

test("full range of operations with big data", async () => {
  let template = {
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
  template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

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
  dataset = await Helper.datasetCreatePersistTest(dataset, Helper.DEF_CURR_USER);
});