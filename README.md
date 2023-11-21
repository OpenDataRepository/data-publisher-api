# Open Data Repository (ODR) Back-End

## Quick Start

### Before running the server or tests

- download this repository from github
- execute 'npm install' to fetch all 3rd-party dependencies
- set up mongodb:
  - install mongodb on your machine
  - execute 'mongod --replSet odr' to set up the mongodb with a replica set 
  - in a new tab, while the last command is still running, execute 'mongosh; rs.initiate()' to initiate the replica set
- set up .env file: 
  - create a .env file in this repo
  - in that file, add the following:
    - DB="mongodb://localhost:port_number_your_mongo_instance_is_running_on/data_publisher?replicaSet=odr"
    - elasticsearchUri="your_elasticsearch_port" (whichever port you run elastic search on)
    - elasticsearchIndexPrefix="..."
      - In my case one elastic search engine was being used for multiple projects and so this was added to avoid interacting with other data. Leave blank if you have an independent elasticsearch instance (or remove all instances of this variable from the code)
    - ACCESS_TOKEN_SECRET="..."
      - This is the secretOrPublicKey used by the https://www.npmjs.com/package/jsonwebtoken library. Used to login users
    - EMAIL_SECRET="..."
      - This is the secretOrPublicKey used by the https://www.npmjs.com/package/jsonwebtoken library. Used to register users
    - EMAIL_USERNAME=""
      - Can be left blank for now as email confirmation for registration has not been fully implemented
    - EMAIL_PASSWORD=""
      - Can be left blank for now as email confirmation for registration has not been fully implemented
    - uploads_folder=folder_name_of_your_choice_to_store_file_uploads
      - Eventually this folder should be removed and files should upload to some cloud storage service.


### Running the Server
- execute 'npm build' to convert typescript to javascript
- execute 'npm start' to run the server

### Running integration tests
- execute 'npm build' to convert typescript to javascript
- execute 'npm test' to run tests

## Key ODR Concepts / Summary

### Overarching Goal / Summary

ODR is fundamentally a database web application allowing a user with no technical knowledge to design a database and create records from it. It's an attempt to remove the need to hire a data scientist to set up an independent database for every project. A second, yet still primary goal of ODR is allow data formatting standards to emerge by allowing users to set up data formats (called templates in the code), make those formats/templates public, and then allow other users to create their own database of records using that data format.

### Workflow / Key concepts

The development process is as follows:

#### Registration and log-in

To create your own data, you of course must first register and log in. Below I assume you're running the server on port 3000.

##### Register

The http request to register is the following:

```
POST http://localhost:3000/account/register HTTP/1.1
content-type: application/json

{
    "email": "test@opendatarepository.org",
    "password": "12345asdF**"
}
```

##### Log In

Logging in has the following format:

```
POST http://localhost:3000/account/login HTTP/1.1
content-type: application/json

{
    "email": "test@opendatarepository.org",
    "password": "12345asdF**"
}
```

Registering / logging in returns an authorization token, which is needed to manipulate data in the system as a user. The authorization token looks something like this:
Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MmYwZWY3N2M4MTVlMjE2ZTk5ZTMyODMiLCJpYXQiOjE2NjA2NTIwNzExMTIsImV4cCI6MTY2MDY1MjA3NDcxMn0.x5JCAiPA7GSKzDgur7dzkr8eyPNdy3kDUqWa27L63kI

#### Templates and Template Fields
After logging in, to get started with creating your database, you first neeed to create a template. A template is the structure specifying the format for a given type of record. A template includes template fields and nested templates.

The most basic template only has fields:

Product: 
  - Fields:
    - Name
    - Price

This would be represented in data as the following. The uuid is the unique identifier for a template / template field

```
Template:
{
  name: "product",
  uuid: "248d9c94-0f29-463d-9a83-24724c5a7252",
  fields: [
    "75d847ce-7552-40e0-b6b8-4e934374585b",
    "53a128f7-650f-498f-8b7b-a50533e3fad0"
  ]
}
Template fields:
{
  name: "name",
  uuid: "75d847ce-7552-40e0-b6b8-4e934374585b"
}
{
  name: "price",
  uuid: "75d847ce-7552-40e0-b6b8-4e934374585b"
}
```

A more complicated template would link templates as well as template fields:

Example:
- Store 
  - Fields: 
    - Name
    - Address
  - Related Templates:
    - Product:
      - Fields:
        - Name
        - Price

The data representation of this would be the following (combined with the previous data):

```
Additional Templates:
{
  name: "store",
  uuid: "ba612f93-8c23-4d16-9a25-6e15ed516cf5"
  fields: [
    "75d847ce-7552-40e0-b6b8-4e934374585b",
    "2c65abb5-bd26-47b6-b0ba-8135dd8b8a22"
  ]
  related_templates: [
    "248d9c94-0f29-463d-9a83-24724c5a7252"
  ]
}
Additonal Fields:
{
  name: "address",
  uuid: "2c65abb5-bd26-47b6-b0ba-8135dd8b8a22"
}
```

##### Create Template

The command to create the above Store template would be the following: 

```
POST http://localhost:3000/template/ HTTP/1.1
content-type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MmYwZWY3N2M4MTVlMjE2ZTk5ZTMyODMiLCJpYXQiOjE2NjA2NTIwNzExMTIsImV4cCI6MTY2MDY1MjA3NDcxMn0.x5JCAiPA7GSKzDgur7dzkr8eyPNdy3kDUqWa27L63kI

{
  "name": "store",
  "fields": [
    {"name": "name"},
    {"name": "address"}
  ],
  "related_templates": [
    {
      "name": "product",
      "uuid": "",
      "fields": [
        {"name": "price"}
      ]
    }
  ]
}
```
Note I intentially left out the "name" field in the product template. That is because in this example we are assuming that we want to share the same "name" field for both store and customer. If you create a field with the name "name" in two locations, two independent template fields will be created for it. 
The above request will return data like the following, the same data but with some metadata attached:

```
{
  "name": "store",
  "uuid": "ba612f93-8c23-4d16-9a25-6e15ed516cf5",
  "updated_at": "2023-01-12T16:32:42.990Z",
  "fields": [
    {
      "name": "name",
      "uuid": "75d847ce-7552-40e0-b6b8-4e934374585b",
      "updated_at": "2023-01-12T16:32:42.990Z"
    },
    {
      "name": "address",
      "uuid": "2c65abb5-bd26-47b6-b0ba-8135dd8b8a22",
      "updated_at": "2023-01-12T16:32:42.990Z"
    }
  ],
  "related_templates": [
    {
      "name": "product",
      "uuid": "248d9c94-0f29-463d-9a83-24724c5a7252",
      "updated_at": "2023-01-12T16:32:42.990Z",
      "fields": [
        {
          "name": "price",
          "uuid": "75d847ce-7552-40e0-b6b8-4e934374585b",
          "updated_at": "2023-01-12T16:32:42.990Z"
        }
      ]
    }
  ]
}
```

##### Update Template

Then, to add the name field to product, we would submit an update request like this:
```
PUT http://localhost:3000/template/ba612f93-8c23-4d16-9a25-6e15ed516cf5 HTTP/1.1
content-type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MmYwZWY3N2M4MTVlMjE2ZTk5ZTMyODMiLCJpYXQiOjE2NjA2NTIwNzExMTIsImV4cCI6MTY2MDY1MjA3NDcxMn0.x5JCAiPA7GSKzDgur7dzkr8eyPNdy3kDUqWa27L63kI

{
  "name": "store",
  "uuid": "ba612f93-8c23-4d16-9a25-6e15ed516cf5"
  "fields": [
    {
      "name": "name",
      "uuid": "75d847ce-7552-40e0-b6b8-4e934374585b"
    },
    {
      "name": "address",
      "uuid": "2c65abb5-bd26-47b6-b0ba-8135dd8b8a22"
    }
  ],
  "related_templates": [
    {
      "name": "product",
      "uuid": "248d9c94-0f29-463d-9a83-24724c5a7252",
      "fields": [
        {
          "name": "name",
          "uuid": "75d847ce-7552-40e0-b6b8-4e934374585b"
        },
        {
          "name": "price",
          "uuid": "75d847ce-7552-40e0-b6b8-4e934374585b"
        }
      ]
    }
  ]
}
```
This would link in teh same "name" field into the template_fields list of product. Because the field uuid is included, that field is linked in instead of a new field being created. 

##### Persist Template

Now, our eventual goal is to create a dataset in which the records of the dataset will follow the format of the above template. However, a dataset cannot be created using the template as it currently is, because the current template is still a draft. A dataset can only be created using a persisted template - persisted meaning that it has been saved permanently in it's current state.
Let's persist the template:

```
POST http://localhost:3000/template/ba612f93-8c23-4d16-9a25-6e15ed516cf5/persist HTTP/1.1
content-type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MmYwZWY3N2M4MTVlMjE2ZTk5ZTMyODMiLCJpYXQiOjE2NjA2NTIwNzExMTIsImV4cCI6MTY2MDY1MjA3NDcxMn0.x5JCAiPA7GSKzDgur7dzkr8eyPNdy3kDUqWa27L63kI

{
  "last_update": "2023-01-12T16:32:42.990Z"
}
```

The last_update property is required to ensure that the user persisting the template is away of the template's most recent changes. If the template has changed since the user last updated it, they would not want to persist those changes of which they are unaware. Giving the wrong last_update value will result in a rejected request.

##### Fetch Latest Persisted Template

Now let's fetch the persisted version of that template:
```
GET http://localhost:3000/template/ba612f93-8c23-4d16-9a25-6e15ed516cf5/latest_persisted/ HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MmYwZWY3N2M4MTVlMjE2ZTk5ZTMyODMiLCJpYXQiOjE2NjA2NTIwNzExMTIsImV4cCI6MTY2MDY1MjA3NDcxMn0.x5JCAiPA7GSKzDgur7dzkr8eyPNdy3kDUqWa27L63kI
```
Which would return something like this:
```
{
  "name": "store",
  "uuid": "ba612f93-8c23-4d16-9a25-6e15ed516cf5",
  "_id": "63c0362a24679e935311eb5c"
  "updated_at": "2023-01-12T16:32:42.990Z",
  "persist_date": "2023-01-12T16:41:22.510Z",
  "fields": [
    ...
  ],
  "related_templates": [
    {
      "name": "product",
      "uuid": "248d9c94-0f29-463d-9a83-24724c5a7252",
      "updated_at": "2023-01-12T16:32:42.990Z",
      "persist_date": "2023-01-12T16:41:22.510Z",
      "_id": "63b861a069746742897b50a6"
    }
  ]
}
```

The _id property is the unique identifier for this specific version of the template. If you continue to update and persist the template, the uuid will remain the same, but each persisted version will have it's own unique _id. The same applies to template_fields

#### Datasets

##### Create Dataset

After creating and persisting a template, the next step is to create a dataset in which all records will adhere to that template format. 

```
POST http://localhost:3000/dataset/ HTTP/1.1
content-type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MmYwZWY3N2M4MTVlMjE2ZTk5ZTMyODMiLCJpYXQiOjE2NjA2NTIwNzExMTIsImV4cCI6MTY2MDY1MjA3NDcxMn0.x5JCAiPA7GSKzDgur7dzkr8eyPNdy3kDUqWa27L63kI

{
  "template_id": "63c0362a24679e935311eb5c"
}
```

Which will create a blank dataset off of the template with that version. The result will look something like this:

```
{
  "uuid" "392cf783-644a-4ec7-93c4-5a362ef23f56",
  "template_id": "63c0362a24679e935311eb5c",
  "updated_at": "2023-01-12T16:50:42.000Z",
  "related_datasets": [
    {
      "uuid": "3b92f964-0e3c-4a0e-98eb-71853725e994",
      "template_id": "63b861a069746742897b50a6",
      "updated_at": "2023-01-12T16:50:42.000Z"
    }
  ]
}
```

In this case, all of the records in dataset 392cf783-644a-4ec7-93c4-5a362ef23f56 will represent stores. Since store also includes a product however, a dataset for product was also created. The dataset for store therefore links a dataset for product.
Also note, any number of databases could be created using template store. Then all of them would have records matching data format store, but each dataset would be independent.

##### Persisted Dataset

Now, of course we are going to want to store records in dataset 'store'. However, records can't be made of the dataset as it currently stands. Just as dataset requires a persisted template version to be able to use it, a dataset is required to be persisted (aka versioned) before records can be created in it.

```
POST http://localhost:3000/dataset/392cf783-644a-4ec7-93c4-5a362ef23f56/persist HTTP/1.1
content-type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MmYwZWY3N2M4MTVlMjE2ZTk5ZTMyODMiLCJpYXQiOjE2NjA2NTIwNzExMTIsImV4cCI6MTY2MDY1MjA3NDcxMn0.x5JCAiPA7GSKzDgur7dzkr8eyPNdy3kDUqWa27L63kI

{
  "last_update": "2023-01-12T16:50:42.000Z"
}
```

##### Fetch Latest Persisted Template

Now let's fetch the persisted dataset:
```
GET http://localhost:3000/dataset/392cf783-644a-4ec7-93c4-5a362ef23f56/latest_persisted/ HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MmYwZWY3N2M4MTVlMjE2ZTk5ZTMyODMiLCJpYXQiOjE2NjA2NTIwNzExMTIsImV4cCI6MTY2MDY1MjA3NDcxMn0.x5JCAiPA7GSKzDgur7dzkr8eyPNdy3kDUqWa27L63kI
```
Which would return something like this:
```
{
  "uuid" "392cf783-644a-4ec7-93c4-5a362ef23f56",
  "template_id": "63c0362a24679e935311eb5c",
  "updated_at": "2023-01-12T16:50:42.000Z",
  "persist_date": "2023-01-12T16:51:47.000Z"
  "related_datasets": [
    {
      "uuid": "3b92f964-0e3c-4a0e-98eb-71853725e994",
      "template_id": "63b861a069746742897b50a6",
      "updated_at": "2023-01-12T16:51:47.000Z"
    }
  ]
}
```

#### Records

##### Create Record

Finally, we're ready to create records. 

```
POST http://localhost:3000/record/ HTTP/1.1
content-type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MmYwZWY3N2M4MTVlMjE2ZTk5ZTMyODMiLCJpYXQiOjE2NjA2NTIwNzExMTIsImV4cCI6MTY2MDY1MjA3NDcxMn0.x5JCAiPA7GSKzDgur7dzkr8eyPNdy3kDUqWa27L63kI

{
  "dataset_uuid":"392cf783-644a-4ec7-93c4-5a362ef23f56"
  "fields": [
    {
      "name": "name",
      "uuid": "75d847ce-7552-40e0-b6b8-4e934374585b",
      "value": "Stuff Mart"
    },
    {
      "name": "address",
      "uuid": "2c65abb5-bd26-47b6-b0ba-8135dd8b8a22",
      "value": "111 Elm Street."
    }
  ],
  "related_records": [
    {
      "dataset_uuid": "3b92f964-0e3c-4a0e-98eb-71853725e994",
      "fields": [
        {
          "name": "name",
          "uuid": "75d847ce-7552-40e0-b6b8-4e934374585b",
          "value": "Chips"
        },
        {
          "name": "price",
          "uuid": "75d847ce-7552-40e0-b6b8-4e934374585b",
          "value": "3.99"
        }
      ]
    },
    {
      "dataset_uuid": "3b92f964-0e3c-4a0e-98eb-71853725e994",
      "fields": [
        {
          "name": "name",
          "uuid": "75d847ce-7552-40e0-b6b8-4e934374585b",
          "value": "Pizza"
        },
        {
          "name": "price",
          "uuid": "75d847ce-7552-40e0-b6b8-4e934374585b",
          "value": "9.99"
        }
      ]
    }
  ]
}
```

As you can see above, the record for store can link as many records as it wants for product, including none. The same does not apply to fields. For each record, exactly one of each field must be populated. If a field is not included in the create/update request, one will be automatically generated for it. If multiple instances of a field are included for a record, one of them will be ignored.

The above will return something like this:
```
{
  "record": {
    "uuid: "cea98e91-9a66-4094-90ce-bd972327c814",
    "dataset_uuid":"392cf783-644a-4ec7-93c4-5a362ef23f56",
    "fields": [
      {
        "name": "name",
        "uuid": "75d847ce-7552-40e0-b6b8-4e934374585b",
        "value": "Stuff Mart"
      },
      {
        "name": "address",
        "uuid": "2c65abb5-bd26-47b6-b0ba-8135dd8b8a22",
        "value": "111 Elm Street."
      }
    ],
    "related_records": [
      {
        "uuid: "8a31acd6-dfa1-4d74-85ad-16979bf21201",
        "dataset_uuid": "3b92f964-0e3c-4a0e-98eb-71853725e994",
        "fields": [
          {
            "name": "name",
            "uuid": "75d847ce-7552-40e0-b6b8-4e934374585b",
            "value": "Chips"
          },
          {
            "name": "price",
            "uuid": "75d847ce-7552-40e0-b6b8-4e934374585b",
            "value": "3.99"
          }
        ]
      },
      {
        "uuid: "1a092e53-06fb-4005-9dbe-df30131d84e2",
        "dataset_uuid": "3b92f964-0e3c-4a0e-98eb-71853725e994",
        "fields": [
          {
            "name": "name",
            "uuid": "75d847ce-7552-40e0-b6b8-4e934374585b",
            "value": "Pizza"
          },
          {
            "name": "price",
            "uuid": "75d847ce-7552-40e0-b6b8-4e934374585b",
            "value": "9.99"
          }
        ]
      }
    ]
  }, 
  "upload_file_uuids": []
}
```

Disregard the upload_file_uuids for now. It's used by the front-end but not relevant for direct users of the api.

It's also an option to create a blank record by only giving the dataset_uuid in the create

#### Dataset Publish

Now, at some point, you may want to create a snapshot of your database in time, which might be useful for linking in a research paper or something like that. We call this publishing a dataset, and it just means that someone can view the dataset and records in the dataset as they were at the moment of publishing. 

Let's attempt this with our example dataset. As of now, publishing the dataset would be pointless, because the records as we have them are still just drafts, and a published dataset only includes persisted records. I'm not going to show persisting a record because I've already shown how to do that for templates and datasets and it's the same process. 
So, let's assume that both of our records have been persisted. Let's look at the command to publish:

```
POST http://localhost:3000/dataset/392cf783-644a-4ec7-93c4-5a362ef23f56/publish/ HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MmYwZWY3N2M4MTVlMjE2ZTk5ZTMyODMiLCJpYXQiOjE2NjA2NTIwNzExMTIsImV4cCI6MTY2MDY1MjA3NDcxMn0.x5JCAiPA7GSKzDgur7dzkr8eyPNdy3kDUqWa27L63kI
content-type: application/json

{
  "name": "published store data name"
}
```

#### Permissions

As of this moment you have a published dataset but only you can see it, which is unlikely to be what you want. Let me explain briefly how permissions work first.

Permissions exist on each resource (marked by a uuid) as three categories:
- Admin: Has complete power over this resource, including changing the permissions on it
- Edit: Can edit and view the resource itself, but not permissions
- View: Can only view persisted versions of this resource. Has no other permissions

So, each unique resource has an admin, edit and view list. Each list contains a list of emails specifying users.
It should be noted that records do not have their own permissions. Rather, records share the permissions of the dataset in which they are created. Due to this, dataset permission function slightly different from what I wrote above. A user needs admin permissions to edit a dataset. Edit permissions to a dataset only allow the user to edit the dataset's records.

An example of editting permissions on the template is here:

```
POST http://localhost:3000/permission/ba612f93-8c23-4d16-9a25-6e15ed516cf5/view/ HTTP/1.1
content-type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MmYwZWY3N2M4MTVlMjE2ZTk5ZTMyODMiLCJpYXQiOjE2NjA2NTIwNzExMTIsImV4cCI6MTY2MDY1MjA3NDcxMn0.x5JCAiPA7GSKzDgur7dzkr8eyPNdy3kDUqWa27L63kI

{
  users: [
    a@a.com
  ]
}
```

Which would give a@a.com permission to view all persisted versions of template 'store'. 
A significant failure of the repo as it currently is is that a user would need to be ranted view permission on all of the individual resources that have been created in this example to be able to view the published dataset in it's full form. Probably one of the most pressing features to implement next would be implementing permission groups, which would include permission specificationss to various resources for a list of users. 

The above would only be useful to users who wanted to collaborate on private data. If you want your data to be generally available, you can instead edit the resource to include a public date. 

For example, to make the 'name' field a public field: 
```
PUT http://localhost:3000/template_field/75d847ce-7552-40e0-b6b8-4e934374585b HTTP/1.1
content-type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MmYwZWY3N2M4MTVlMjE2ZTk5ZTMyODMiLCJpYXQiOjE2NjA2NTIwNzExMTIsImV4cCI6MTY2MDY1MjA3NDcxMn0.x5JCAiPA7GSKzDgur7dzkr8eyPNdy3kDUqWa27L63kI

{
  "name": "name",
  "uuid": "75d847ce-7552-40e0-b6b8-4e934374585b",
  "public_date": "2045-01-12T16:32:42.990Z"
}
```

Which would mean that anyone querying the api would be able to view ALL versions of template field "75d847ce-7552-40e0-b6b8-4e934374585b" aka "nam" as of January 1st, 2045. If you set the public date to a date in the past, all versions of the template field would become public instantly. Note that all versions of a resource use the public_date set by the LATEST persisted version of that resource. So a resource could be public, and then updated and persisted to be private again, and it (including ALL of it's versions) would no longer be viewable to the public.

In the case of this example, we would still need to go through and add a public_date to every resource used by our dataset to make the published dataset fully viewable. Adding a way to make the whole thing public with one command would probably be a useful feature.

As of this point, main creation process for database 'store' is completed. The following are additional features.

#### Files

It is supported to attach files to a record using the following steps:

1. Create the template field with field_type 'file'. 

A template field can be created as part of a template or independently. Here I will do it as part of a template.

```
POST http://localhost:3000/template/ HTTP/1.1
content-type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MmYwZWY3N2M4MTVlMjE2ZTk5ZTMyODMiLCJpYXQiOjE2NjA2NTIwNzExMTIsImV4cCI6MTY2MDY1MjA3NDcxMn0.x5JCAiPA7GSKzDgur7dzkr8eyPNdy3kDUqWa27L63kI

{
  "name": "a template with a file field",
  "fields": [
    {
      "name": "field with file",
      "type": "File"
    }
  ]
}
```

Subsequently, the template must be persisted and a database created and persisted following the process I described above. 
Let's assume the persisted template and dataset are such: 
```
Template:
{
  "name": "a template with a file field",
  "uuid": "4dc4a86e-be4b-4bbc-8b16-d7fbc5539046",
  "fields": [
    {
      "name": "field with file",
      "type": "File",
      "uuid": "15214f95-b487-4f6f-9883-360ef56b27a6"
    }
  ]
}
Dataset:
{
  "template_uuid": "4dc4a86e-be4b-4bbc-8b16-d7fbc5539046",
  "uuid": "4ee881b5-b043-4b7a-95ce-ebdd3e87fdd3"
}
```
Some metadata has been left out for brevity.

2. Create a record with a file

```
POST http://localhost:3000/record/ HTTP/1.1
content-type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MmYwZWY3N2M4MTVlMjE2ZTk5ZTMyODMiLCJpYXQiOjE2NjA2NTIwNzExMTIsImV4cCI6MTY2MDY1MjA3NDcxMn0.x5JCAiPA7GSKzDgur7dzkr8eyPNdy3kDUqWa27L63kI

{
  "dataset_uuid":"4ee881b5-b043-4b7a-95ce-ebdd3e87fdd3"
  "fields": [
    {
      "uuid": "15214f95-b487-4f6f-9883-360ef56b27a6",
      "file": {
        "uuid": "new"
      }
    },
  ]
}
```

The returned record will include a generated uuid for the file. 

```
POST http://localhost:3000/record/ HTTP/1.1
content-type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MmYwZWY3N2M4MTVlMjE2ZTk5ZTMyODMiLCJpYXQiOjE2NjA2NTIwNzExMTIsImV4cCI6MTY2MDY1MjA3NDcxMn0.x5JCAiPA7GSKzDgur7dzkr8eyPNdy3kDUqWa27L63kI

{
  "dataset_uuid":"4ee881b5-b043-4b7a-95ce-ebdd3e87fdd3"
  "fields": [
    {
      "uuid": "15214f95-b487-4f6f-9883-360ef56b27a6",
      "file": {
        "uuid": "f2268bea-5dc6-472c-b6bc-00a62eca7422"
      }
    },
  ]
}
```

3. Upload the desired file to the generated file uuid.

```
POST http://localhost:3000/file/f2268bea-5dc6-472c-b6bc-00a62eca7422/direct HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MmYwZWY3N2M4MTVlMjE2ZTk5ZTMyODMiLCJpYXQiOjE2NjA2NTIwNzExMTIsImV4cCI6MTY2MDY1MjA3NDcxMn0.x5JCAiPA7GSKzDgur7dzkr8eyPNdy3kDUqWa27L63kI
Content-Type: text/plain

(file content goes here)
```

## More

### plugins and view_settings

Plugins and view_settings were added to the api to accomodate the need of the front-end to store information about how to present the data. It would be a good but complicated improvement to merge plugins into view_settings.

### Importing

Extensive importation code has been written to import some of the legacy data from ODR 1.0. You will notice it layered throughout the code.

### Terminology / Quirks

#### uuid vs _id

The uuid is the unique identifier for a resource, and the id is the unique identifier for a specific version of that resource. For instance, there is only one template 'store' in the readme's main example, but the user might continue to edit 'store' and save different versions of it. So every version of store would have the same uuid but a different _id.

#### Shallow vs recursive
A lot of functions will be prefixed with shallow or recursive. Shallow means the document is handled without recursing into it's linked documents. Recursive means document and all of it's linked documents are handled, recursing down until there are no links left.

#### Parent and godfather

The child of a document is it's related_document. Aka the child of a template is it's related_template. Thus the parent of a template is the template which links it as a related_template.
Godfather refers to a dataset's template or a record's dataset.

#### camelCase vs under_score

I mostly try to use camelCase for functions and under_scores for variables, but I don't always remember.

### Documentation

Sections of the code have few comments. Some helpful resources to understand the code are:
- The integration tests are fairly expansive and can often be used to understand the gist of which behavior is being supported.
- The schema in each of the files in the models folder can be used to see the format of the data in mongodb.

### Testing
Resources to test are:
- The integration tests in the integration_tests folder. This is what is executed with npm test.
- the util unit tests (must be run separately)
- requests.rest can be referenced to test the api directly.

### Contact Information

You can contact me on github or directly at calebshort4697@gmail.com if you have questions.