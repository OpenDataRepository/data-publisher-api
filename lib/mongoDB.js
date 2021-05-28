const MongoClient = require('mongodb').MongoClient

var MongoConnection;

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
    return MongoConnection.db('data_publisher');
}