const request = require("supertest");
const MongoDB = require('../lib/mongoDB');
var { PERMISSION_ADMIN, PERMISSION_EDIT, PERMISSION_VIEW } = require('../models/permission_group');
var { app, init: appInit } = require('../app');
var HelperClass = require('./common_test_operations')
var Helper = new HelperClass(app);

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

const datasetCreate = async (dataset, curr_user) => {
  return await request(app)
    .post(`/dataset`)
    .set('Cookie', [`user=${curr_user}`])
    .send(dataset)
    .set('Accept', 'application/json');
}

const datasetDraftGet = async (uuid, curr_user) => {
  return await request(app)
    .get(`/dataset/${uuid}/draft`)
    .set('Cookie', [`user=${curr_user}`])
    .set('Accept', 'application/json');
};

const datasetCreateAndTest = async (dataset, curr_user) => {
  let response = await datasetCreate(dataset, curr_user);
  expect(response.statusCode).toBe(200);
  expect(response.body.inserted_uuid).toBeTruthy();

  dataset.uuid = response.body.inserted_uuid;
  
  response = await datasetDraftGet(dataset.uuid, curr_user);
  expect(response.statusCode).toBe(200);
  let created_dataset = response.body;
  expect(created_dataset).toMatchObject(dataset);
  return dataset.uuid;
};

const datasetUpdate = async (uuid, dataset, curr_user) => {
  return await request(app)
    .put(`/dataset/${uuid}`)
    .send(dataset)
    .set('Cookie', [`user=${curr_user}`])
};

const datasetCleanseMetadata = async (dataset) => {
  if(!dataset) {
    return;
  }  
  delete dataset.updated_at;
  delete dataset._id;
  delete dataset.publish_date;
  delete dataset.template_id;
  if(dataset.related_datasets) {
    for(dataset of dataset.related_datasets) {
      datasetCleanseMetadata(dataset);
    }
  }
}

const datasetUpdateAndTest = async (dataset, curr_user) => {
  let response = await datasetUpdate(dataset.uuid, dataset, curr_user);
  expect(response.statusCode).toBe(200);
  
  response = await datasetDraftGet(dataset.uuid, curr_user);
  expect(response.statusCode).toBe(200);
  let updated_dataset = response.body;
  datasetCleanseMetadata(dataset);
  expect(updated_dataset).toMatchObject(dataset);
};

const datasetPublish = async (uuid, last_update, curr_user) => {
  return await request(app)
    .post(`/dataset/${uuid}/publish`)
    .set('Cookie', [`user=${curr_user}`])
    .send({last_update})
    .set('Accept', 'application/json');
};

const datasetLatestPublished = async(uuid, curr_user) => {
  return await request(app)
    .get(`/dataset/${uuid}/latest_published`)
    .set('Cookie', [`user=${curr_user}`])
    .set('Accept', 'application/json');
}

const datasetLastUpdate = async(uuid, curr_user) => {
  return await request(app)
    .get(`/dataset/${uuid}/last_update`)
    .set('Cookie', [`user=${curr_user}`]);
}

const datasetPublishAndFetch = async (uuid, curr_user) => {
  let response = await datasetLastUpdate(uuid, curr_user);
  expect(response.statusCode).toBe(200);
  let last_update = response.body;

  response = await datasetPublish(uuid, last_update, curr_user);
  expect(response.statusCode).toBe(200);

  response = await datasetLatestPublished(uuid, curr_user);
  expect(response.statusCode).toBe(200);
  let published_template = response.body;
  expect(published_template).toHaveProperty("publish_date");
  return published_template;
};

const datasetCreatePublishTest = async (dataset, curr_user) => {
  let uuid = await datasetCreateAndTest(dataset, curr_user);
  let dataset_template = await datasetPublishAndFetch(uuid, curr_user)
  expect(dataset_template).toMatchObject(dataset);
  return dataset_template;
};

const draftExisting = async (uuid) => {
  let response = await request(app)
    .get(`/dataset/${uuid}/draft_existing`)
    .set('Accept', 'application/json');
  expect(response.statusCode).toBe(200);
  return response.body;
}

const datasetDelete = async (uuid, curr_user) => {
  return await request(app)
    .delete(`/dataset/${uuid}/draft`)
    .set('Cookie', [`user=${curr_user}`]);
}

const datasetLatestPublishedBeforeDate = async (uuid, timestamp, curr_user) => {
  return await request(app)
    .get(`/dataset/${uuid}/${timestamp}`)
    .set('Cookie', [`user=${curr_user}`]);
}

const datasetUpdatePublishTest = async (dataset, curr_user) => {
  await datasetUpdateAndTest(dataset, curr_user);
  let published_dataset = await datasetPublishAndFetch(dataset.uuid, curr_user)
  expect(published_dataset).toMatchObject(dataset);
  return published_dataset;
};

describe("create (and get draft)", () => {
  describe("Success cases", () => {

    test("No related datasets", async () => {

      let template = {
        "name":"t1"
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        name: "d1",
        description: "d1 des",
        template_uuid: template.uuid
      };

      await datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

    });

    test("one related dataset", async () => {

      let template = {
        name:"t1",
        related_templates:[{
          name: "t2"
        }]
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);


      let dataset = {
        name: "d1",
        template_uuid: template.uuid,
        related_datasets: [{
          name: "d2",
          template_uuid: template.related_templates[0].uuid
        }]
      };

      await datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

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
      template = await Helper.templateCreatePublishTest(template);

      let dataset = { 
        name: "d1",
        "template_uuid": template.uuid,
        "related_datasets": [
          { 
            name: "d2",
            "template_uuid": template.related_templates[0].uuid,
            "related_datasets": [
              { 
                name: "d3",
                "template_uuid": template.related_templates[0].related_templates[0].uuid,
                "related_datasets": [
                  { 
                    name: "d4",
                    "template_uuid": template.related_templates[0].related_templates[0].related_templates[0].uuid,
                    "related_datasets": [
                      { 
                        name: "d5",
                        "template_uuid": template.related_templates[0].related_templates[0].related_templates[0].related_templates[0].uuid,
                        "related_datasets": [
                          { 
                            name: "d6",
                            "template_uuid": template.related_templates[0].related_templates[0].related_templates[0].related_templates[0].related_templates[0].uuid,
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

      await datasetCreateAndTest(dataset);

    });

    test("one related dataset, which already exists", async () => {

      let template = {
        name:"t1",
        related_templates:[{
          name: "t2"
        }]
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let related_dataset = {
        name: "d2",
        template_uuid: template.related_templates[0].uuid
      };

      let related_dataset_uuid = await datasetCreateAndTest(related_dataset, Helper.DEF_CURR_USER);

      related_dataset.uuid = related_dataset_uuid;

      let dataset = {
        name: "d1",
        template_uuid: template.uuid,
        related_datasets: [related_dataset]
      };

      await datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

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
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let related_dataset_1 = {
        name: "d1.1",
        template_uuid: template.related_templates[0].uuid
      };
      let related_dataset_2 = {
        name: "d1.2",
        template_uuid: template.related_templates[1].uuid
      };

      let related_dataset_1_published = await datasetCreatePublishTest(related_dataset_1, Helper.DEF_CURR_USER);
      let related_dataset_2_published = await datasetCreatePublishTest(related_dataset_2, Helper.DEF_CURR_USER);

      related_dataset_1.uuid = related_dataset_1_published.uuid;
      related_dataset_2.uuid = related_dataset_2_published.uuid;

      let view_users = [Helper.DEF_CURR_USER, Helper.USER_2];
      let response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, related_dataset_1_published.uuid, PERMISSION_VIEW, view_users);
      expect(response.statusCode).toBe(200);

      response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, template.uuid, PERMISSION_VIEW, view_users);
      expect(response.statusCode).toBe(200);

      let dataset = {
        name: "d1",
        template_uuid: template.uuid,
        related_datasets: [related_dataset_1, {uuid: related_dataset_2_published.uuid}]
      };

      await datasetCreateAndTest(dataset, Helper.USER_2);

    });
  });

  describe("Failure cases", () => {

    test("Input must be an object", async () => {
      let dataset = [];
      let response = await datasetCreate(dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);
    });

    test("Template uuid must exist, be published, and the user has view access to it", async () => {

      // template uuid isn't even a uuid
      let dataset = {
        template_uuid: 6
      };
      let response = await datasetCreate(dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

      // no template exists with this uuid
      dataset = {
        template_uuid: Helper.VALID_UUID
      };
      response = await datasetCreate(dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

      // template exists with this uuid but has not been published
      let template = {
        name: "t1"
      };
      let template_uuid = await Helper.templateCreateAndTest(template, Helper.DEF_CURR_USER);
      dataset = {
        template_uuid
      };
      response = await datasetCreate(dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

      // template exists with this uuid but user does not have view access to it
      template = {
        name: "t1"
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);
      dataset = {
        template_uuid: template.uuid
      };
      response = await datasetCreate(dataset, Helper.USER_2);
      expect(response.statusCode).toBe(401);

    });

    test("All properties must be of the correct type", async () => {

      let template = {
        name:"t1"
      };

      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        name: "t1",
        description: "des1",
        public_date: (new Date()).toISOString(),
        template_uuid: template.uuid,
        related_datasets: []
      };
      await datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

      dataset = {
        name: 5,
        description: "des1",
        public_date: (new Date()).toISOString(),
        template_uuid: template.uuid,
        related_datasets: []
      };
      let response = await datasetCreate(dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

      dataset = {
        name: "t1",
        description: ["des1"],
        public_date: "(new Date()).toISOString()",
        template_uuid: template.uuid,
        related_datasets: []
      };
      response = await datasetCreate(dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

      dataset = {
        name: "t1",
        description: "des1",
        public_date: "not a date",
        template_uuid: template.uuid,
        related_datasets: []
      };
      response = await datasetCreate(dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

      dataset = {
        name: "t1",
        description: "des1",
        public_date: (new Date()).toISOString(),
        template_uuid: template.uuid,
        related_datasets: "invalid"
      };
      response = await datasetCreate(dataset, Helper.DEF_CURR_USER);
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

      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      // all related templates match validly
      let dataset = {
        name: "d1",
        template_uuid: template.uuid,
        related_datasets: [
          { 
            name: "d1.1", 
            template_uuid: template.related_templates[0].uuid
          },
          { 
            name: "d1.2", 
            template_uuid: template.related_templates[1].uuid
          }
        ]
      };
      await datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

      // arrays must be of same length
      dataset = {
        name: "d1",
        template_uuid: template.uuid
      };
      let response = await datasetCreate(dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

      // uuid list using the templates in the wrong order
      dataset = {
        name: "d1",
        template_uuid: template.uuid,
        related_datasets: [
          { 
            name: "d1.1", 
            template_uuid: template.related_templates[1].uuid
          },
          { 
            name: "d1.2", 
            template_uuid: template.related_templates[0].uuid
          }
        ]
      };
      response = await datasetCreate(dataset, Helper.DEF_CURR_USER);
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
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = { 
        "template_uuid": template.uuid,
        "related_datasets": [
          { 
            "template_uuid": template.related_templates[0].uuid,
            "related_datasets": [
              { 
                "template_uuid": template.related_templates[0].related_templates[0].uuid,
                "related_datasets": [
                  { 
                    "template_uuid": template.related_templates[0].related_templates[0].related_templates[0].uuid,
                    "related_datasets": [
                      { 
                        "template_uuid": template.related_templates[0].related_templates[0].related_templates[0].uuid,
                        "related_datasets": [
                          { 
                            "template_uuid": template.related_templates[0].related_templates[0].related_templates[0].related_templates[0].related_templates[0].uuid,
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
      let response = await datasetCreate(dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

    });

  });
});

const populateWithDummyTemplateAndDataset = async () => {

  let template = { 
    "name": "t1",
    "related_templates": [
      { 
        "name": "t2"
      }
    ]
  };
  template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

  let dataset = {
    name: "d1",
    template_uuid: template.uuid,
    related_datasets: [{
      name: "d1.1",
      template_uuid: template.related_templates[0].uuid
    }]
  };

  let dataset_uuid = await datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);
  let response = await datasetDraftGet(dataset_uuid, Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(200);
  dataset = response.body;

  return [template, dataset];
};

describe("update (and get draft)", () => {
  let template;
  let dataset;
  beforeEach(async() => {
    [template, dataset] = await populateWithDummyTemplateAndDataset();
  });
  describe("Success cases", () => {
    test("Basic update - change dataset description", async () => {
      dataset.description = "bananas";
      await datasetUpdateAndTest(dataset, Helper.DEF_CURR_USER);
    });

    test("Change template used by the dataset", async () => {
      let new_template = { name: "t2"};
      new_template = await Helper.templateCreatePublishTest(new_template, Helper.DEF_CURR_USER);

      dataset = {
        name: "d2",
        uuid: dataset.uuid,
        template_uuid: new_template.uuid
      }

      await datasetUpdateAndTest(dataset, Helper.DEF_CURR_USER);
    });

    test("updating a related_dataset creates drafts of parents but not children", async () => {
      // Create and publish template
      let template = {
        "name":"t1",
        "related_templates":[{
          "name": "t2",
          "related_templates":[{
            "name": "t3",
            "related_templates":[{
              "name": "t4"
            }]
          }]
        }]
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        name: "d1",
        template_uuid: template.uuid,
        related_datasets: [{
          name: "d2",
          template_uuid: template.related_templates[0].uuid,
          related_datasets: [{
            name: "d3",
            template_uuid: template.related_templates[0].related_templates[0].uuid,
            related_datasets: [{
              name: "d4",
              template_uuid: template.related_templates[0].related_templates[0].related_templates[0].uuid,
            }]
          }]
        }]
      };

      // Publish the first time
      dataset = await datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      //  Submit an update on the 3rd layer
      let response = await datasetDraftGet(dataset.uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      dataset = response.body;
      dataset.related_datasets[0].related_datasets[0].description = "banana";
      await datasetUpdateAndTest(dataset, Helper.DEF_CURR_USER);

      // The first 3 layers, but not the fourth layer, should have drafts
      expect(await draftExisting(dataset.uuid)).toBeTruthy();
      expect(await draftExisting(dataset.related_datasets[0].uuid)).toBeTruthy();
      expect(await draftExisting(dataset.related_datasets[0].related_datasets[0].uuid)).toBeTruthy();
      expect(await draftExisting(dataset.related_datasets[0].related_datasets[0].related_datasets[0].uuid)).toBeFalsy();

    });

    test("if update includes no change since last published, no draft is created", async () => {
      dataset = await datasetPublishAndFetch(dataset.uuid, Helper.DEF_CURR_USER);
      let response = await datasetUpdate(dataset.uuid, dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect(await draftExisting(dataset.uuid)).toBeFalsy();
      expect(await draftExisting(dataset.related_datasets[0].uuid)).toBeFalsy();
    });

    test("if update includes no changes since last published but a new template has been published, a new draft is created", async () => {

      // Modify the related template and publish it 
      // Then updating the dataset should create a draft just by the fact that there is a new template.

      dataset = await datasetPublishAndFetch(dataset.uuid, Helper.DEF_CURR_USER);
      template.description = "des";
      template = await Helper.templateUpdatePublishTest(template, Helper.DEF_CURR_USER);
      await datasetUpdateAndTest(dataset, Helper.DEF_CURR_USER);
      expect(await draftExisting(dataset.uuid)).toBeTruthy();
      expect(await draftExisting(dataset.related_datasets[0].uuid)).toBeFalsy();
    });

    test("if update includes no changes except that a new version of a related_dataset has been published, a new draft is created", async () => {

      dataset = await datasetPublishAndFetch(dataset.uuid, Helper.DEF_CURR_USER);

      let related_dataset = dataset.related_datasets[0];
      related_dataset.description = "banana";
      await datasetUpdateAndTest(related_dataset, Helper.DEF_CURR_USER);
      await datasetPublishAndFetch(related_dataset.uuid, Helper.DEF_CURR_USER);

      await datasetUpdateAndTest(dataset, Helper.DEF_CURR_USER);
      expect(await draftExisting(dataset.uuid)).toBeTruthy();
      expect(await draftExisting(related_dataset.uuid)).toBeFalsy();
    });
  });
  describe("Failure cases", () => {

    test("uuid in request and in object must match", async () => {
      let response = await datasetUpdate(Helper.VALID_UUID, dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);
    });

    test("uuid must exist", async () => {
      dataset.uuid = Helper.VALID_UUID;
      let response = await datasetUpdate(Helper.VALID_UUID, dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(404);
    });

    test("User must have edit access", async () => {
      let response = await datasetUpdate(dataset.uuid, dataset, Helper.USER_2);
      expect(response.statusCode).toBe(401);
    });

  });
});

describe("get draft", () => {
  test("must have edit permission", async () => {
    let template = {
      name: "t"
    }
    template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);
    let dataset = {
      name: "d",
      template_uuid: template.uuid
    };
    let uuid = await await datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);
    
    let response = await datasetDraftGet(uuid, Helper.USER_2);
    expect(response.statusCode).toBe(401);
  });

  test("if user has view but not edit access to linked dataset, the pubished version replaces that dataset", async () => {

    let template = { 
      name: "t1",
      related_templates: [{name: "t2"}],
      public_date: (new Date()).toISOString()
    };
    template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);  

    let related_dataset = {
      name: "d1.1",
      template_uuid: template.related_templates[0].uuid
    };
    related_dataset = await datasetCreatePublishTest(related_dataset, Helper.DEF_CURR_USER);
    datasetCleanseMetadata(related_dataset);

    let dataset = {
      name: "d1",
      template_uuid: template.uuid,
      related_datasets: [related_dataset]
    };
    dataset = await datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);
    datasetCleanseMetadata(dataset);

    let users = [Helper.DEF_CURR_USER, Helper.USER_2];

    let response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, dataset.uuid, PERMISSION_ADMIN, users);
    expect(response.statusCode).toBe(200);

    response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, dataset.related_datasets[0].uuid, PERMISSION_VIEW, users);
    expect(response.statusCode).toBe(200);

    // Fetch parent dataset, check that related_dataset is fetched as the published version
    response = await datasetDraftGet(dataset.uuid, Helper.USER_2);
    expect(response.statusCode).toBe(200);
    let dataset_draft = response.body;
    expect(dataset_draft).toMatchObject(dataset);    

  });

  test("if user has neither view nor edit access to linked properties, an empty object replaces that property", async () => {

    let template = { 
      name: "t1",
      related_templates: [{name: "t2"}],
      public_date: (new Date()).toISOString()
    };
    template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);  

    let related_dataset = {
      name: "d1.1",
      template_uuid: template.related_templates[0].uuid
    };
    related_dataset = await datasetCreatePublishTest(related_dataset, Helper.DEF_CURR_USER);
    datasetCleanseMetadata(related_dataset);

    let dataset = {
      name: "d1",
      template_uuid: template.uuid,
      related_datasets: [related_dataset]
    };
    dataset = await datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);
    datasetCleanseMetadata(dataset);

    let users = [Helper.DEF_CURR_USER, Helper.USER_2];

    let response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, dataset.uuid, PERMISSION_ADMIN, users);
    expect(response.statusCode).toBe(200);


    // Fetch parent dataset, check that related_dataset is fetched as the published version
    response = await datasetDraftGet(dataset.uuid, Helper.USER_2);
    expect(response.statusCode).toBe(200);
    let dataset_draft = response.body;
    dataset.related_datasets[0] = {uuid: related_dataset.uuid};
    expect(dataset_draft).toMatchObject(dataset);    

  });
});

describe("publish (and get published)", () => {
  describe("Success cases", () => {
    test("Simple publish - no related datasets", async () => {
      let template = { 
        "name": "t1"
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);
      let dataset = {
        template_uuid: template.uuid
      }
      await datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);
      
    });

    test("Complex publish - with a related dataset", async () => {

      let template = {
        name:"t1",
        related_templates:[{
          name: "t2"
        }]
      };

      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let related_dataset = {
        name: "d2",
        template_uuid: template.related_templates[0].uuid
      };
      let dataset = {
        name:"d1",
        template_uuid: template.uuid,
        related_datasets:[related_dataset]
      };
      let published = await datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      let related_dataset_uuid = published.related_datasets[0].uuid;

      // Check that the related dataset was also published
      response = await datasetLatestPublished(related_dataset_uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject(related_dataset);
    });

    test("Complex publish - changes in a nested property result in publishing for all parent properties", async () => {

      let template = {
        "name":"t1",
        "related_templates":[{
          "name": "t2",
          "related_templates":[{
            "name": "t3",
            "related_templates":[{
              "name": "t4"
            }]
          }]
        }]
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        "name":"d1",
        template_uuid: template.uuid,
        "related_datasets":[{
          "name": "d2",
          template_uuid: template.related_templates[0].uuid,
          "related_datasets":[{
            template_uuid: template.related_templates[0].related_templates[0].uuid,
            "name": "d3",
            "related_datasets":[{
              template_uuid: template.related_templates[0].related_templates[0].related_templates[0].uuid,
              "name": "d4"
            }]
          }]
        }]
      };
      dataset = await datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      // Make a change in the third level of data
      dataset.related_datasets[0].related_datasets[0].description = "3 has a new description";

      // Update with change
      let response = await datasetUpdate(dataset.uuid, dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);

      // Record the date before we publish a second time
      let intermediate_publish_date = (new Date()).getTime();

      dataset = await datasetPublishAndFetch(dataset.uuid, Helper.DEF_CURR_USER);

      // On the third node and above, the publish date should be newer than the intermediate_publish_date. 
      // The fourth should be older
      
      expect(new Date(dataset.publish_date).getTime()).toBeGreaterThan(intermediate_publish_date);
      expect(new Date(dataset.related_datasets[0].publish_date).getTime()).toBeGreaterThan(intermediate_publish_date);
      expect(new Date(dataset.related_datasets[0].related_datasets[0].publish_date).getTime()).toBeGreaterThan(intermediate_publish_date);
      expect(new Date(dataset.related_datasets[0].related_datasets[0].related_datasets[0].publish_date).getTime()).toBeLessThan(intermediate_publish_date);

    });

    test("Complex publish - publish parent who's child changed previously and no other changes are present", async () => {

      let template = {
        "name":"1",
        "related_templates":[{
          "name": "2"
        }]
      };
      // Create initial data
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        "name":"1",
        template_uuid: template.uuid,
        "related_datasets":[{
          template_uuid: template.related_templates[0].uuid,
          "name": "2"
        }]
      };
      // Create initial data
      dataset = await datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);
      let uuid = dataset.uuid;

      // Make a change in the second level of data
      dataset.related_datasets[0].description = "2 has a new description";
      let uuid2 = dataset.related_datasets[0].uuid;

      // Update second dataset
      let response = await datasetUpdate(uuid2, dataset.related_datasets[0], Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);

      // Record the date before we publish the change to the second dataset
      let publish_date_2 = (new Date()).getTime();

      await datasetPublishAndFetch(uuid2, Helper.DEF_CURR_USER);
      
      // Now we want to get a draft of the parent and publish that draft as it is. It should be successful since the child changed.
      
      response = await datasetDraftGet(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      dataset = response.body;
      
      // Update with change
      response = await datasetUpdate(uuid, dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);

      // Record the date before we publish the parent dataset again
      let publish_date_3 = (new Date()).getTime();

      dataset = await datasetPublishAndFetch(uuid, Helper.DEF_CURR_USER);

      expect(new Date(dataset.publish_date).getTime()).toBeGreaterThan(publish_date_3);
      expect(new Date(dataset.related_datasets[0].publish_date).getTime()).toBeGreaterThan(publish_date_2);
      expect(new Date(dataset.related_datasets[0].publish_date).getTime()).toBeLessThan(publish_date_3);
    });

    test("Still able to publish parent even if don't have permission to publish child", async () => {
      let template = {
        name:"t1",
        related_templates:[{
          name: "t1.1"
        }]
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        name:"d1",
        template_uuid: template.uuid,
        related_datasets:[{
          name: "d1.1",
          template_uuid: template.related_templates[0].uuid
        }]
      };
      dataset = await datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      // Update with user 1
      let response = await datasetDraftGet(dataset.uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let draft = response.body;
      draft.description = "d";
      draft.related_datasets[0].description = "d";
      response = await datasetUpdate(draft.uuid, draft, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);

      // Give user 2 edit and view permissions to parent template
      let view_users = [Helper.DEF_CURR_USER, Helper.USER_2];
      response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, dataset.uuid, PERMISSION_VIEW, view_users);
      expect(response.statusCode).toBe(200);
      response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, dataset.uuid, PERMISSION_ADMIN, view_users);
      expect(response.statusCode).toBe(200);

      // Now let user 2 publish the parent dataset
      await datasetPublishAndFetch(dataset.uuid, Helper.USER_2);

      // Now verify that user 2 published the parent but not the child.

      // Check that the related dataset was not published
      response = await datasetLatestPublished(dataset.related_datasets[0].uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject(dataset.related_datasets[0]);

      // Check that the parent was published
      response = await datasetLatestPublished(dataset.uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toMatchObject(dataset);
      // Also check that it is still pointing to the original published related_dataset
      expect(response.body.related_datasets[0]._id).toBe(dataset.related_datasets[0]._id);

    });

    test("Simple change - only template was updated", async () => {
      let template = { 
        "name": "t1"
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);
      
      let dataset = {
        name: "d1",
        template_uuid: template.uuid
      }
      await datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      template.description = "naruto";
      await Helper.templateUpdatePublishTest(template, Helper.DEF_CURR_USER);

      await datasetUpdatePublishTest(dataset, Helper.DEF_CURR_USER);
      
    });

  });

  describe("Failure cases", () => {
    test("Dataset with uuid must exist", async () => {

      let template = {
        name:"t1"
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        name: "d1",
        template_uuid: template.uuid
      }
      let uuid = await datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

      let response = await datasetLastUpdate(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let last_update = response.body;

      response = await datasetPublish(Helper.VALID_UUID, last_update, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(404);

    });

    test("There must be changes to publish", async () => {
      let template = {
        name:"t1"
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        name: "d1",
        template_uuid: template.uuid
      }
      let uuid = await datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

      let response = await datasetLastUpdate(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let last_update = response.body;

      response = await datasetPublish(uuid, last_update, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);

      response = await datasetPublish(uuid, last_update, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);
    });

    test("Internal refrences must be valid", async () => {
      let template = {
        name:"t1",
        related_templates: [{
          name: "t1.1"
        }]
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        name:"d1",
        template_uuid: template.uuid,
        related_datasets: [{
          name: "d1.1",
          template_uuid: template.related_templates[0].uuid
        }]
      }

      let uuid = await datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

      let response = await datasetDraftGet(uuid, Helper.DEF_CURR_USER)
      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject(dataset);

      // Delete the internal draft
      response = await datasetDelete(response.body.related_datasets[0].uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);

      response = await datasetLastUpdate(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let last_update = response.body;

      // Expect publish of parent draft to fail because of invalid reference 
      response = await datasetPublish(uuid, last_update, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

      // Try updating. This should also fail.
      response = await datasetUpdate(dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

    });

    test("Last update provided must match to actual last update in the database", async () => {
      let template = {
        name: "t1"
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        name: "d1",
        template_uuid: template.uuid
      };
      let uuid = await datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

      let response =  await datasetPublish(uuid, (new Date()).toISOString(), Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);
    });

    test("Last update provided must match to actual last update in the database, also if sub-property is updated later", async () => {
      let template = {
        name: "t1",
        related_templates: [{name: "t1.1"}]
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        name:"d1",
        template_uuid: template.uuid,
        related_datasets: [{
          name: "d1.1",
          template_uuid: template.related_templates[0].uuid
        }]
      };
      let uuid = await datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

      let response = await datasetDraftGet(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let old_update = response.body.updated_at;

      let related_dataset = response.body.related_datasets[0];
      related_dataset.description = "naruto";

      response = await datasetUpdate(related_dataset.uuid, related_dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);

      // Should fail to update since we don't have the most recent update
      response = await datasetPublish(uuid, old_update, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

      // Should succeed in publishing if we do use the most recent update
      response = await datasetDraftGet(related_dataset.uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let new_update = response.body.updated_at;

      response = await datasetPublish(uuid, new_update, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);

    });

    test("User must have admin permission to publish", async () => {

      let template = {
        name:"t1"
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        name:"d1",
        template_uuid: template.uuid
      };
      let uuid = await datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

      // A different user shouldn't be able to publish
      let response = await datasetLastUpdate(uuid, Helper.DEF_CURR_USER);
      let last_update = response.body;
      response = await datasetPublish(uuid, last_update, Helper.USER_2);
      expect(response.statusCode).toBe(401);

      // Even if that user has view permissions, they still shouldn't be able to publish
      response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, uuid, PERMISSION_VIEW, [Helper.DEF_CURR_USER, Helper.USER_2]);
      expect(response.statusCode).toBe(200);

      response = await datasetPublish(uuid, last_update, Helper.USER_2);
      expect(response.statusCode).toBe(401);
    });

    test("Dataset must match format of template", async () => {

      let template = {
        name:"t1",
        related_templates: [
          {name: "t1.1"}
        ]
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      // create dataset, matching template format
      let dataset = {
        name: "d1",
        template_uuid: template.uuid,
        related_datasets: [
          { 
            name: "d1.1", 
            template_uuid: template.related_templates[0].uuid
          }
        ]
      };
      let uuid = await datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

      // in the meantime, the template format changes
      template.related_templates = [];
      template = await Helper.templateUpdatePublishTest(template, Helper.DEF_CURR_USER);

      let response = await datasetLastUpdate(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let last_update = response.body;

      // Now publishing the dataset should fail since it no longer matches the template format
      await datasetPublish(uuid, last_update, Helper.DEF_CURR_USER);
    });
  });
});

describe("get published", () => {
  test("if user does not have view access to linked properties, an empty object replaces that property", async () => {
    
    let template = { 
      name: "t1",
      related_templates: [{name: "t1.1"}]
    };
    template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);  
    
    let dataset = { 
      name: "d1",
      template_uuid: template.uuid,
      related_datasets: [{
        name: "d1.1",
        template_uuid: template.related_templates[0].uuid
      }]
    };
    dataset = await datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);  
    
    let view_users = [Helper.USER_2, Helper.DEF_CURR_USER];
    let response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, dataset.uuid, PERMISSION_VIEW, view_users);
    expect(response.statusCode).toBe(200);

    dataset.related_datasets[0] = {uuid: dataset.related_datasets[0].uuid};
    // Fetch parent dataset, check that the related_dataset is fetched as blank 
    // since the second user
    response = await datasetLatestPublished(dataset.uuid, Helper.USER_2);
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject(dataset);   
  });

  test("must have view permissions", async () => {
    let template = { 
      name: "t1"
    };
    template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);  

    let dataset = { 
      name: "d1",
      template_uuid: template.uuid
    };
    dataset = await datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);  

    let response = await datasetLatestPublished(dataset.uuid, Helper.USER_2);
    expect(response.statusCode).toBe(401);
  });
});

test("get published for a certain date", async () => {
  let template = {
    name:"t1"
  };
  template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

  let dataset = {
    name:"d1",
    template_uuid: template.uuid,
    description: "1"
  };
  let uuid = await datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

  let beforeFirstPublish = new Date();

  // Test that if only a draft exists, it is not fetched
  let response = await datasetLatestPublishedBeforeDate(uuid, beforeFirstPublish.toISOString(), Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(404);

  await datasetPublishAndFetch(uuid, Helper.DEF_CURR_USER);

  let afterFirstPublish = new Date();

  // dataset.uuid = uuid;
  dataset.description = "2";

  response = await datasetUpdate(uuid, dataset, Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(200);
  await datasetPublishAndFetch(uuid, Helper.DEF_CURR_USER);

  let afterSecondPublish = new Date();

  dataset.description = "3";

  response = await datasetUpdate(uuid, dataset, Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(200);
  await datasetPublishAndFetch(uuid, Helper.DEF_CURR_USER);

  // Now there should be three published versions. Search for each based on the date

  response = await datasetLatestPublished(uuid, Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(200);
  expect(response.body.description).toEqual(expect.stringMatching("3"));

  response = await datasetLatestPublishedBeforeDate(uuid, (new Date()).toISOString(), Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(200);
  expect(response.body.description).toEqual(expect.stringMatching("3"));

  response = await datasetLatestPublishedBeforeDate(uuid, afterSecondPublish.toISOString(), Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(200);
  expect(response.body.description).toEqual(expect.stringMatching("2"));

  response = await datasetLatestPublishedBeforeDate(uuid, afterFirstPublish.toISOString(), Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(200);
  expect(response.body.description).toEqual(expect.stringMatching("1"));

  response = await datasetLatestPublishedBeforeDate(uuid, beforeFirstPublish.toISOString(), Helper.DEF_CURR_USER);
  expect(response.statusCode).toBe(404);
});

describe("lastUpdate", () => {

  describe("success", () => {
    test("basic draft, no related datasets", async () => {
      let template = {
        "name":"t1"
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let timestamp = new Date();
      let dataset = {
        "name":"d1",
        template_uuid: template.uuid
      };
      let uuid = await datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

      let response = await datasetLastUpdate(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(timestamp.getTime());
    });

    test("basic published, related_datasets. available to anyone with view permissions", async () => {
      let template = {
        name:"t1"
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);
      let timestamp = new Date();
      let dataset = {
        name:"d1",
        template_uuid: template.uuid
      };
      dataset = await datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      let response = await datasetLastUpdate(dataset.uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(timestamp.getTime());

      let view_users = [Helper.USER_2, Helper.DEF_CURR_USER];
      response = await Helper.updatePermissionGroup(Helper.DEF_CURR_USER, dataset.uuid, PERMISSION_VIEW, view_users);
      expect(response.statusCode).toBe(200);

      response = await datasetLastUpdate(dataset.uuid, Helper.USER_2);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(timestamp.getTime());
    });

    test("sub dataset updated later than parent dataset", async () => {
      let template = {
        "name": "t1",
        "related_templates": [{
          "name": "t2",
          "related_templates": [{
            "name": "t3"
          }]
        }]
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        name: "d1",
        template_uuid: template.uuid,
        related_datasets: [{
          name: "d2",
          template_uuid: template.related_templates[0].uuid,
          related_datasets: [{
            name: "d3",
            template_uuid: template.related_templates[0].related_templates[0].uuid
          }]
        }]
      };
      let uuid = await datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

      let response = await datasetDraftGet(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      dataset = response.body;

      let timestamp_between_create_and_update = new Date();

      // Update 3. 1 and 2 dates should be 3
      let dataset3 = dataset.related_datasets[0].related_datasets[0];
      dataset3.description = "jutsu";


      response = await datasetUpdate(dataset3.uuid, dataset3, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);

      let timestamp_after_update = new Date();

      response = await datasetLastUpdate(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(timestamp_between_create_and_update.getTime());
      expect((new Date(response.body)).getTime()).toBeLessThan(timestamp_after_update.getTime());

      response = await datasetLastUpdate(dataset3.uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect((new Date(response.body)).getTime()).toBeGreaterThan(timestamp_between_create_and_update.getTime());
      expect((new Date(response.body)).getTime()).toBeLessThan(timestamp_after_update.getTime());
      
    });

    test("sub dataset updated and published later than parent dataset", async () => {

      let template = {
        "name": "1",
        "related_templates": [{
          "name": "2"
        }]
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        name: "1",
        template_uuid: template.uuid,
        related_datasets: [{
          name: "2",
          template_uuid: template.related_templates[0].uuid
        }]
      };
      dataset = await datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      let related_dataset = dataset.related_datasets[0];
      related_dataset.description = "jutsu";

      let response = await datasetUpdate(related_dataset.uuid, related_dataset, Helper.DEF_CURR_USER);
      expect(response.statusCode).toEqual(200);

      let time1 = new Date();
      await datasetPublishAndFetch(related_dataset.uuid, Helper.DEF_CURR_USER);
      let time2 = new Date();

      response = await datasetLastUpdate(dataset.uuid, Helper.DEF_CURR_USER);
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
            "name": "3"
          }]
        }]
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        name: "1",
        template_uuid: template.uuid,
        related_datasets: [{
          name: "2",
          template_uuid: template.related_templates[0].uuid,
          related_datasets: [{
            name: "3",
            template_uuid: template.related_templates[0].related_templates[0].uuid
          }]
        }]
      };
      let uuid = await datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

      // create
      let response = await datasetDraftGet(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      dataset = response.body;

      let dataset2 = dataset.related_datasets[0];
      let dataset3 = dataset2.related_datasets[0];

      // publish
      await datasetPublishAndFetch(uuid, Helper.DEF_CURR_USER);

      // Update grandchild
      dataset3.description = "jutsu";

      response = await datasetUpdate(dataset3.uuid, dataset3, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);

      response = await datasetDraftGet(dataset3.uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      let update_3_timestamp = response.body.updated_at;

      // Now get the update timestamp for the grandparent. It should be that of the grandchild.
      response = await datasetLastUpdate(uuid, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual(update_3_timestamp);
      
    });

  });

  describe("failure", () => {
    test("invalid uuid", async () => {
      let response = await datasetLastUpdate(15, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(400);

      response = await datasetLastUpdate(Helper.VALID_UUID, Helper.DEF_CURR_USER);
      expect(response.statusCode).toBe(404);
    });

    test("must have edit permissions to get last update of draft", async () => {
      let template = {
        "name":"t1"
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        name: "d1",
        template_uuid: template.uuid
      };
      let uuid = await datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

      let response = await datasetLastUpdate(uuid, Helper.USER_2);
      expect(response.statusCode).toBe(401);
    });

    test("must have edit or view permissions to get last update of published", async () => {
      let template = {
        "name":"t1"
      };
      template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

      let dataset = {
        name: "d1",
        template_uuid: template.uuid
      };
      dataset = await datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);

      let response = await datasetLastUpdate(dataset.uuid, Helper.USER_2);
      expect(response.statusCode).toBe(401);
    });
  });
});

describe("delete", () => {
  test("delete a draft, not a published version", async () => {
    let template = {
      name: "t1"
    };
    template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

    let dataset = {
      name: "d1",
      template_uuid: template.uuid
    }
    dataset = await datasetCreatePublishTest(dataset, Helper.DEF_CURR_USER);
  
    dataset.description = "Sasuke";
  
    // Change the draft, but don't publish the change
    response = await datasetUpdate(dataset.uuid, dataset, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
  
    // Verify that the draft is what we changed it to
    response = await datasetDraftGet(dataset.uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
  
    // Delete the draft
    response = await datasetDelete(dataset.uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
  
    // Get the draft again. Make sure it matches the latest published version
    response = await datasetDraftGet(dataset.uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
  
    delete dataset._id;
    delete dataset.template_id;
    delete dataset.publish_date;
    delete dataset.description;
    expect(response.body).toMatchObject(dataset);
  
  });

  test("need admin permissions", async () => {
    let template = {
      name: "t1"
    };
    template = await Helper.templateCreatePublishTest(template, Helper.DEF_CURR_USER);

    let dataset = {
      name: "d1",
      template_uuid: template.uuid
    };
    uuid = await datasetCreateAndTest(dataset, Helper.DEF_CURR_USER);

    let response = await datasetDelete(uuid, Helper.USER_2);
    expect(response.statusCode).toBe(401);
  });
});