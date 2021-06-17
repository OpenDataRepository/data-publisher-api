const MongoClient = require('mongodb').MongoClient

var MongoConnection;
var DB;

exports.connect = async function(path) {
    try{
        MongoConnection = await MongoClient.connect(path, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
    } catch(err) {
        console.log(err);
    }
};

exports.close = async function() {
    try{
        await MongoConnection.close();
    } catch(err) {
        console.log(err);
    }
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