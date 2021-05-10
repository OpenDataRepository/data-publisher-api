const MongoModel       = require("./mongo_model");
const {Connection}     = require('../lib/mongo_connection.js');

class User extends MongoModel {

  constructor() {
    super();
    this.wordpress = {};
    this.facebook = {};
    this.google = {};
  }

  initialize() {
    return Connection.db.createCollection(this.collection_name, {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["wordpress"],
          properties: {
            last_login: {
              bsonType: "string"
            },
            wordpress: {
              bsonType: "object"
            },
            facebook: {
              bsonType: "object"
            },
            google: {
              bsonType: "object"
            },
          },
        }
      }
    })
  }

  save() {
   Connection.db.collection(User.collection_name).updateOne(
      {
        "wordpress.id": this.wordpress.id
      },
      {
        $set: {
          "last_login": this.last_login,
          "wordpress": this.wordpress,
          "facebook":  this.facebook,
          "google":    this.google,
        }
      },
      {
        "upsert": true
      }
    )
  }

}

User.collection_name = "user";

module.exports = User;

