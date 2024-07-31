var fs = require('fs');

var src_path = '../../src';
var { app, init: appInit, close: appClose } = require(src_path + '/app');
var { PermissionTypes } = require( src_path + '/models/permission');
var HelperClass = require('../common_test_operations');
var Helper = new HelperClass(app);

var agent1;
var agent2;

var replset;

beforeAll(async () => {
  let db_uri;
  [db_uri, replset] = await Helper.setupDB();
  await appInit(db_uri);
  agent2 = await Helper.createAgentRegisterLogin(Helper.EMAIL_2, Helper.DEF_PASSWORD);
  agent1 = await Helper.createAgentRegisterLogin(Helper.DEF_EMAIL, Helper.DEF_PASSWORD);
  Helper.clearFilesAtPath(Helper.dynamicTestFilesPath);
  Helper.clearFilesAtPath(Helper.uploadsDirectoryPath);
});

beforeEach(async() => {
  await Helper.clearDatabaseExceptForUsers();
  Helper.setAgent(agent1);
});

afterAll(async () => {
  Helper.clearFilesAtPath(Helper.dynamicTestFilesPath);
  Helper.clearFilesAtPath(Helper.uploadsDirectoryPath);
  await appClose();
  await replset.stop();
});

const importTemplateTest = async (template) => {
  let response = await Helper.importTemplate(template);
  expect(response.statusCode).toBe(303);
  let new_template = await Helper.testAndExtract(Helper.redirect, response.header.location);
  Helper.importTestTemplatesEqual(template, new_template, {});
}

describe("template and dataset", () => {

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
      await Helper.importTemplateDatasetTest(template);
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
      await Helper.importTemplateDatasetTest(template);
    });

    test("multiple fields and related databases", async () => {
      let template_uuid = "t1";
      let related_template_uuid_1 = "t1.1";
      let related_template_uuid_2 = "t1.2";
      let field_uuid_1 = "t1f1";
      let field_uuid_2 = "t1f2";

      let template = {
        template_uuid, 
        fields: [
          {template_field_uuid: field_uuid_1, name: field_uuid_1},
          {template_field_uuid: field_uuid_2, name: field_uuid_2}
        ],
        related_databases: [
          {template_uuid: related_template_uuid_1, name: related_template_uuid_1},
          {template_uuid: related_template_uuid_2, name: related_template_uuid_2}
        ]
      };
      await Helper.importTemplateDatasetTest(template);
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
      await Helper.importTemplateDatasetTest(template);
    });
  
    test("can import same template/dataset and field a second time as long as you have edit permissions", async () => {
      let template = {
        template_uuid: "t1", 
        name: "naruto", 
        description: "awesome", 
        updated_at: (new Date()).toISOString(),
        fields: [{
          template_field_uuid: "t1f1",
          name: "hi",
          description: "hello"
        }],
        related_databases: []
      };
  
      // Import first time

      let template_1, dataset_1;
      [template_1, dataset_1] = await Helper.importTemplateDatasetTest(template);
  
      // Import second time

      template.description = "new description";
    
      let template_2, dataset_2;
      [template_2, dataset_2] = await Helper.importTemplateDatasetTest(template);

      expect(template_2.uuid).toEqual(template_1.uuid);
      expect(dataset_2.uuid).toEqual(dataset_1.uuid);
    })

    test("field has options to pick from", async () => {
      let template_uuid = "t1";
      let field_uuid = "t1f1"

      let template: any = {
        template_uuid, 
        name: "naruto", 
        description: "awesome", 
        updated_at: (new Date()).toISOString(),
        fields: [
          {
            template_field_uuid: field_uuid,
            radio_options: [
              {template_radio_option_uuid: "toad", name: "toad"}
            ]
          }
        ]
      };
      await Helper.importTemplateDatasetTest(template);

      template = {
        template_uuid, 
        name: "naruto", 
        description: "awesome", 
        updated_at: (new Date()).toISOString(),
        fields: [
          {
            template_field_uuid: field_uuid,
            radio_options: [
              {template_radio_option_uuid: "toad", name: "toad"},
              {name: "ninjuitsu", radio_options: [
                {
                  name: 'sexy jiutsu', template_radio_option_uuid: "sexy jiutsu"
                }
              ]}
            ]
          }
        ]
      };
      await Helper.importTemplateDatasetTest(template);
    });

    test("includes subscribed template", async () => {
      let name = "";
      let description = "";
      let updated_at = (new Date()).toISOString();
      let template = {
        template_uuid: "t1", 
        name, description, updated_at,
        related_databases: [{
          template_uuid: "t1.1",
          subscribed: true,
          name, description, updated_at
        }]
      };
      await Helper.importTemplateDatasetTest(template);

      template.name = "name";
      await Helper.importTemplateDatasetTest(template);
    });

    test("import template with link to an isLink template, aka we don't have edit permissions to it", async () => {
      let name = "";
      let description = "";
      let updated_at = (new Date()).toISOString();

      let related_template_uuid = "t1.1";
      let related_template = {
        template_uuid: related_template_uuid, 
        name, description, updated_at
      };

      Helper.setAgent(agent2);

      let new_related_template, new_related_dataset;
      [new_related_template, new_related_dataset] = await Helper.importTemplateDatasetPersistTest(related_template);
      await Helper.testAndExtract(Helper.updatePermission, new_related_template.uuid, PermissionTypes.view, [Helper.DEF_EMAIL]);
      await Helper.testAndExtract(Helper.updatePermission, new_related_dataset.uuid, PermissionTypes.view, [Helper.DEF_EMAIL]);

      let template = {
        template_uuid: "t1", 
        name, description, updated_at,
        related_databases: [{
          template_uuid: related_template_uuid,
          name, description, updated_at
        }]
      };

      await Helper.setAgent(agent1);

      await Helper.importTemplateDatasetTest(template);

      template.name = "name";
      await Helper.importTemplateDatasetTest(template);
    });

  });

  test("import chemin template", async () => {
    let rawdata = fs.readFileSync(Helper.testDataPath + '/chemin_template.json');
    let old_template = JSON.parse(rawdata);
  
    await Helper.importTemplateDatasetTest(old_template);
  });

  test("import rruff template", async () => {
    let rruff_imalist_template_raw_data = fs.readFileSync(Helper.testDataPath + '/rruff_imalist_template.json');
    let imalist_template = JSON.parse(rruff_imalist_template_raw_data);
    let ima_list_template, ima_list_dataset;

    Helper.setAgent(agent2);

    [ima_list_template, ima_list_dataset] = await Helper.importTemplateDatasetPersistTest(imalist_template);

    await Helper.testAndExtract(Helper.updatePermission, ima_list_template.uuid, PermissionTypes.view, [Helper.DEF_EMAIL]);
    await Helper.testAndExtract(Helper.updatePermission, ima_list_dataset.uuid, PermissionTypes.view, [Helper.DEF_EMAIL]);

    await Helper.setAgent(agent1);

    let rawdata = fs.readFileSync(Helper.testDataPath + '/rruff_sample_template.json');
    let old_template = JSON.parse(rawdata);
    await Helper.importTemplateDatasetTest(old_template);
  });

});

describe("just template", () => {
  test("field has options - tags", async () => {
    let template_uuid = "t1";
    let field_uuid = "t1f1"

    let template: any = {
      template_uuid, 
      name: "naruto", 
      description: "awesome", 
      updated_at: (new Date()).toISOString(),
      fields: [
        {
          template_field_uuid: field_uuid,
          fieldtype: "Tags",
          value: [
            {
              template_tag_uuid: "toad", 
              name: "toad",
              children: [
                {
                  template_tag_uuid: "frog",
                  name: "frog"
                }
              ]
            }
          ]
        }
      ]
    };
    await importTemplateTest(template);

  });


  test("ahed metadata", async () => {
    let rawdata = fs.readFileSync(Helper.testDataPath + '/ahed_metadata_template.json');
    let template = JSON.parse(rawdata);

    await importTemplateTest(template);

  });

});

describe("records", () => {

  describe("success", () => {

    test("basic - no fields or related records", async () => {
      let template_uuid = "t1";
      let template = {
        template_uuid, 
        name: "naruto", 
        description: "awesome", 
        updated_at: (new Date()).toISOString(),
        fields: [],
        related_databases: []
      };

      await Helper.importTemplateDatasetPersistTest(template);

      let record = {
        record_uuid: "r1",
        database_uuid: template_uuid,
        fields: [],
        records: []
      };
      await Helper.importRecordsTest([record]);
    });

    test("one field and one related record", async () => {
      let template_uuid = "t1";
      let related_template_uuid = "t1.1";
      let field_uuid = "t1f1";

      let template = {
        template_uuid, 
        name: "naruto", 
        description: "awesome", 
        updated_at: (new Date()).toISOString(),
        fields: [{
          template_field_uuid: field_uuid
        }],
        related_databases: [{
          template_uuid: related_template_uuid,
          name: "sasuke"
        }]
      };
      await Helper.importTemplateDatasetPersistTest(template);

      let record = {
        record_uuid: "r1",
        database_uuid: template_uuid,
        fields: [{
          template_field_uuid: field_uuid,
          value: "peach"
        }],
        records: [{
          record_uuid: "r1.1",
          database_uuid: related_template_uuid
        }]
      };
      await Helper.importRecordsTest([record]);
    });

    test("multiple fields and multiple related records", async () => {
      let template_uuid = "t1";
      let related_template_uuid_1 = "t1.1";
      let related_template_uuid_2 = "t1.2";
      let field_uuid_1 = "t1f1";
      let field_uuid_2 = "t1f2";

      let template = {
        template_uuid, 
        fields: [
          {template_field_uuid: field_uuid_1, name: field_uuid_1},
          {template_field_uuid: field_uuid_2, name: field_uuid_2}
        ],
        related_databases: [
          {template_uuid: related_template_uuid_1, name: related_template_uuid_1},
          {template_uuid: related_template_uuid_2, name: related_template_uuid_2}
        ]
      };
      await Helper.importTemplateDatasetPersistTest(template);

      let record = {
        record_uuid: "r1",
        database_uuid: template_uuid,
        fields: [
          {field_name: field_uuid_1, field_uuid: field_uuid_1, value: "peach"},
          {field_name: field_uuid_2, field_uuid: field_uuid_2, value: "daisy"}
        ],
        records: [
          {record_uuid: "r1.1", database_uuid: related_template_uuid_1},
          {record_uuid: "r1.2", database_uuid: related_template_uuid_2}
        ]
      };
      await Helper.importRecordsTest([record]);
    });

    test("shared related_records", async () => {
      let template_uuid = "t1";
      let shared_related_template_uuid = "organization";

      let template = {
        template_uuid, 
        related_databases: [{
          template_uuid: shared_related_template_uuid, 
          name: shared_related_template_uuid
        }]
      };
      await Helper.importTemplateDatasetPersistTest(template);

      let record = {
        record_uuid: "r1",
        database_uuid: template_uuid,
        records: [
          {record_uuid: "r1.1", database_uuid: shared_related_template_uuid},
          {record_uuid: "r1.2", database_uuid: shared_related_template_uuid}
        ]
      };
      await Helper.importRecordsTest([record]);
    });

    test("related records going 2 levels deep", async () => {
      let template_1_uuid = "t1";
      let template_11_uuid = "t1.1";
      let template_111_uuid = "t1.1.1";

      let template = {
        template_uuid: template_1_uuid, 
        related_databases: [{
          template_uuid: template_11_uuid,
          related_databases: [{
            template_uuid: template_111_uuid
          }]
        }]
      };
      await Helper.importTemplateDatasetPersistTest(template);

      let record = {
        record_uuid: "r1",
        database_uuid: template_1_uuid,
        records: [{
          record_uuid: "r1.1",
          database_uuid: template_11_uuid,
          records: [{
            record_uuid: "r1.1.1",
            database_uuid: template_111_uuid,
          }]
        }]
      };
      await Helper.importRecordsTest([record]);
    });

    test("field has options to pick from. Can pick nested or non-nested option, or both, or none", async () => {
      let template_uuid = "t1";
      let field_uuid = "t1f1";

      let option_uuid_1 = "toad";
      let option_uuid_2 = "sexy jiutsu";

      let template = {
        template_uuid, 
        name: "naruto", 
        description: "awesome", 
        updated_at: (new Date()).toISOString(),
        fields: [
          {
            template_field_uuid: field_uuid,
            radio_options: [
              {template_radio_option_uuid: option_uuid_1, name: option_uuid_1},
              {name: "ninjuitsu", radio_options: [
                {
                  name: option_uuid_2, template_radio_option_uuid: option_uuid_2
                }
              ]}
            ]
          }
        ]
      };
      await Helper.importTemplateDatasetPersistTest(template);

      let record: any = {
        record_uuid: "r1",
        database_uuid: template_uuid,
        fields: [{
          field_uuid: field_uuid,
          value: [{name: option_uuid_1, template_radio_option_uuid: option_uuid_1}]
        }]
      };
      await Helper.importRecordsTest([record]);

      record = {
        record_uuid: "r1",
        database_uuid: template_uuid,
        fields: [{
          field_uuid: field_uuid,
          value: [{name: option_uuid_2, template_radio_option_uuid: option_uuid_2}]
        }]
      };
      await Helper.importRecordsTest([record]);

      record = {
        record_uuid: "r1",
        database_uuid: template_uuid,
        fields: [{
          field_uuid: field_uuid,
          value: [
            {name: option_uuid_1, template_radio_option_uuid: option_uuid_1},
            {name: option_uuid_2, template_radio_option_uuid: option_uuid_2}
          ]
        }]
      };
      await Helper.importRecordsTest([record]);

      record = {
        record_uuid: "r1",
        database_uuid: template_uuid,
        fields: [{
          field_uuid: field_uuid
        }]
      };
      await Helper.importRecordsTest([record]);
    });

    test("import multiple records at once", async () => {
      let template_uuid = "t1";
      let template = {
        template_uuid, 
        name: "naruto", 
        description: "awesome", 
        updated_at: (new Date()).toISOString(),
        fields: [],
        related_databases: []
      };
      await Helper.importTemplateDatasetPersistTest(template);

      let records = [
        {
          record_uuid: "r1",
          database_uuid: template_uuid,
          fields: [],
          records: []
        },
        {
          record_uuid: "r2",
          database_uuid: template_uuid,
          fields: [],
          records: []
        } 
      ];
      await Helper.importRecordsTest(records);
    });

    test("If dataset/record doesn't supply a related_dataset for a related_template, we provide one", async () => {
      let template_uuid = "t1";
      let related_template_uuid = "t1.1";
      let field_uuid = "t1f1";

      let template = {
        template_uuid, 
        name: "naruto", 
        description: "awesome", 
        updated_at: (new Date()).toISOString(),
        fields: [{
          template_field_uuid: field_uuid
        }],
        related_databases: [{
          template_uuid: related_template_uuid,
          name: "sasuke"
        }]
      };
      await Helper.importTemplateDatasetPersistTest(template);

      let record = {
        record_uuid: "r1",
        database_uuid: template_uuid,
        fields: [
          {
            field_uuid: field_uuid,
            value: "peach"
          }
        ],
        records: []
      };
      await Helper.importRecordsTest([record]);
    });

    test("includes subscribed template", async () => {
      let name = "";
      let description = "";
      let updated_at = (new Date()).toISOString();

      let parent_template_uuid = "t1";
      let child_template_uuid = "t1.1";

      let template = {
        template_uuid: parent_template_uuid, 
        name, description, updated_at,
        related_databases: [{
          template_uuid: child_template_uuid,
          subscribed: true,
          name, description, updated_at
        }]
      };
      await Helper.importTemplateDatasetPersistTest(template);

      let record = {
        record_uuid: "r1",
        database_uuid: parent_template_uuid,
        records: [{
          record_uuid: "r1.1",
          database_uuid: child_template_uuid,
          records: []
        }]
      };
      await Helper.importRecordsTest([record]);
    });

    test("import records with links to records we only have view permissions to", async () => {
      let name = "";
      let description = "";
      let updated_at = (new Date()).toISOString();

      let related_template_uuid = "t1.1";
      let related_template = {
        template_uuid: related_template_uuid, 
        name, description, updated_at
      };

      Helper.setAgent(agent2);

      let new_related_template, new_related_dataset;
      [new_related_template, new_related_dataset] = await Helper.importTemplateDatasetPersistTest(related_template);
      await Helper.testAndExtract(Helper.updatePermission, new_related_template.uuid, PermissionTypes.view, [Helper.DEF_EMAIL]);
      await Helper.testAndExtract(Helper.updatePermission, new_related_dataset.uuid, PermissionTypes.view, [Helper.DEF_EMAIL]);

      let related_record = {
        record_uuid: "r1.1", 
        database_uuid: related_template_uuid
      };
      await Helper.importRecordsPersistTest([related_record]);

      await Helper.setAgent(agent1);

      let template_uuid = "t1";
      let template = {
        template_uuid: template_uuid, 
        name, description, updated_at,
        related_databases: [{
          template_uuid: related_template_uuid,
          name, description, updated_at
        }]
      };
      await Helper.importTemplateDatasetPersistTest(template);

      let record = {
        record_uuid: "r1",
        database_uuid: template_uuid,
        records: [related_record]
      };

      await Helper.importRecordsPersistTest([record]);

    });

    describe("with files", () => {

      let server, serverUrl;

      beforeAll(async () => {
        [server, serverUrl] = Helper.basicServerSetup();
      });

      afterAll(async () => {
        server.close();
      });

      test("record includes a file url", async () => {

        let file_name = "toUpload.txt";
        let file_contents = "some interesting contents";
        Helper.createFile(file_name, file_contents);
  
        let template_uuid = "t1";
        let field_uuid = "t1f1";
  
        let template = {
          template_uuid, 
          name: "naruto", 
          description: "awesome", 
          updated_at: (new Date()).toISOString(),
          fields: [{
            template_field_uuid: field_uuid,
            fieldtype: "File"
          }]
        };
        await Helper.importTemplateDatasetPersistTest(template);
  
        let record = {
          record_uuid: "r1",
          database_uuid: template_uuid,
          fields: [{
            field_uuid: field_uuid,
            files: [{
              file_uuid: "somerandomuuid",
              original_name: "waffle",
              href: serverUrl + file_name
            }]
          }]
        };
        await Helper.importRecordsPersistTest([record]);
  
      });
  
      test("record with file url shows up twice", async () => {
  
        let file_name = "toUpload.txt";
        let file_contents = "some interesting contents";
        Helper.createFile(file_name, file_contents);
  
        let templateA = {
          template_uuid: "ta", 
          name: "a", 
          fields: [{
            template_field_uuid: "taf1",
            fieldtype: "File"
          }]
        };
        let template = {
          template_uuid: "td",
          name: "d",
          related_databases: [
            {
              template_uuid: "tb",
              name: "b",
              related_databases: [templateA]
            },
            {
              template_uuid: "tc",
              name: "c",
              related_databases: [templateA]
            }
          ]
        }
        await Helper.importTemplateDatasetPersistTest(template);
  
        let recordA = {
          record_uuid: "ra",
          database_uuid: templateA.template_uuid,
          fields: [{
            field_uuid: templateA.fields[0].template_field_uuid,
            files: [{
              file_uuid: "somerandomuuid",
              original_name: "waffle",
              href: serverUrl + file_name
            }]
          }]
        };
        let record = {
          record_uuid: "rd",
          database_uuid: template.template_uuid,
          records: [
            {
              record_uuid: "rb",
              database_uuid: template.related_databases[0].template_uuid,
              records: [recordA]
            },
            {
              record_uuid: "rc",
              database_uuid: template.related_databases[1].template_uuid,
              records: [recordA]
            }
          ]
        };
        await Helper.importRecordsPersistTest([record]);
      });

      test("record includes a couple image urls", async () => {

        let image_1_name = "image1.txt";
        let image_1_contents = "some interesting contents";
        Helper.createFile(image_1_name, image_1_contents);
        let image_2_name = "image2.txt";
        let image_2_contents = "shadow clone jiutsu!";
        Helper.createFile(image_2_name, image_2_contents);
  
        let template_uuid = "t1";
        let field_uuid = "t1f1";
  
        let template = {
          template_uuid, 
          name: "naruto", 
          description: "awesome", 
          updated_at: (new Date()).toISOString(),
          fields: [{
            template_field_uuid: field_uuid,
            fieldtype: "File"
          }]
        };
        await Helper.importTemplateDatasetPersistTest(template);
  
        let record = {
          record_uuid: "r1",
          database_uuid: template_uuid,
          fields: [{
            field_uuid: field_uuid,
            files: [
              {
                file_uuid: "somerandomuuid",
                original_name: "waffle",
                href: serverUrl + image_1_name
              },
              {
                file_uuid: "narutouuid",
                original_name: "supersecretjiutsu",
                href: serverUrl + image_2_name
              }
            ]
          }]
        };
        await Helper.importRecordsPersistTest([record]);
  
      });

    });

  });

  test("with Chemin data", async () => {

    let raw_template = fs.readFileSync(Helper.testDataPath + '/chemin_template.json');
    let old_template = JSON.parse(raw_template);
  
    await Helper.importTemplateDatasetPersistTest(old_template);

    let raw_records = fs.readFileSync(Helper.testDataPath + '/chemin_data.json');
    let old_records = JSON.parse(raw_records).records;

    // We can't test persisting this also because the download links in the chemin data don't work
    await Helper.importRecordsTest(old_records, false);
  }, 20 * 1000);

  describe("failure", () => {

    const failureTest = async (records, responseCode) => {
      let response = await Helper.importRecords(records);
      expect(response.statusCode).toBe(responseCode);
    };

    test("Input must be a list", async () => {
      let records = {};
      await failureTest(records, 400);
    });

    test("Record must include a database_uuid and a record_uuid, which are strings", async () => {
      let template_uuid = "t1";
      let template = {
        template_uuid, 
        name: "naruto", 
        description: "awesome", 
        updated_at: (new Date()).toISOString(),
        fields: [],
        related_databases: []
      };
      await Helper.importTemplateDatasetPersistTest(template);

      let record: any = {
        database_uuid: template_uuid,
        fields: [],
        records: []
      };
      await failureTest([record], 400);

      record = {
        record_uuid: "r1",
        fields: [],
        records: []
      };
      await failureTest([record], 400);

    });

    test("Record must reference a valid database_uuid, which has already been imported", async () => {
      let template_uuid = "t1";

      let record = {
        record_uuid: "r1",
        database_uuid: template_uuid,
        fields: [],
        records: []
      };
      await failureTest([record], 400);
    });

    test("Database/record format must match the format of the template", async () => {
      let template_uuid = "t1";
      let related_template_uuid = "t1.1";
      let field_uuid = "t1f1";

      let template = {
        template_uuid, 
        name: "naruto", 
        description: "awesome", 
        updated_at: (new Date()).toISOString(),
        fields: [{
          template_field_uuid: field_uuid
        }],
        related_databases: [{
          template_uuid: related_template_uuid,
          name: "sasuke"
        }]
      };
      await Helper.importTemplateDatasetPersistTest(template);

      let record = {
        record_uuid: "r1",
        database_uuid: template_uuid,
        fields: [
          {
            template_field_uuid: field_uuid,
            value: "peach"
          },
          {
            template_field_uuid: field_uuid,
            value: "peach"
          }
        ],
        records: [{
          record_uuid: "r1.1",
          database_uuid: related_template_uuid
        }]
      };
      await failureTest([record], 400);

      record = {
        record_uuid: "r1",
        database_uuid: template_uuid,
        fields: [
          {
            template_field_uuid: field_uuid,
            value: "peach"
          }
        ],
        records: [
          {
            record_uuid: "r1.1",
            database_uuid: related_template_uuid
          },
          {
            record_uuid: "r1.1",
            database_uuid: related_template_uuid
          }
        ]
      };
      await failureTest([record], 400);
    });

    test("field has options to pick from. Option picked must be valid", async () => {
      let template_uuid = "t1";
      let field_uuid = "t1f1";

      let option_uuid_1 = "toad";
      let option_uuid_2 = "sexy jiutsu";

      let template = {
        template_uuid, 
        name: "naruto", 
        description: "awesome", 
        updated_at: (new Date()).toISOString(),
        fields: [
          {
            template_field_uuid: field_uuid,
            radio_options: [
              {template_radio_option_uuid: option_uuid_1, name: option_uuid_1},
              {name: "ninjuitsu", radio_options: [
                {
                  name: option_uuid_2, template_radio_option_uuid: option_uuid_2
                }
              ]}
            ]
          }
        ]
      };
      await Helper.importTemplateDatasetPersistTest(template);

      let record = {
        record_uuid: "r1",
        database_uuid: template_uuid,
        fields: [{
          template_field_uuid: field_uuid,
          value: [{template_radio_option_uuid: "invalid"}]
        }]
      };
      await failureTest([record], 400);

      record = {
        record_uuid: "r1",
        database_uuid: template_uuid,
        fields: [{
          template_field_uuid: field_uuid,
          value: [{template_radio_option_uuid: option_uuid_2}, {template_radio_option_uuid: "invalid"}]
        }]
      };
      await failureTest([record], 400);
    });

  });
});
