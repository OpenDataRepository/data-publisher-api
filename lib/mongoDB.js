const MongoClient = require('mongodb').MongoClient

var MongoConnection;
var DB;

exports.connect = async function(path) {
    MongoConnection = await MongoClient.connect(path, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    });
};

exports.close = async function() {
    await MongoConnection.close();
}

exports.db = function() {
    if (DB === undefined) {
        DB = MongoConnection.db('data_publisher');
    }
    return DB;
}

exports.newSession = function() {
    return MongoConnection.startSession();
}